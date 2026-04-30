/**
 * OpenClaw Adapter Service
 * 
 * Manages persistent WebSocket connections to the OpenClaw gateway per agent.
 * Runs in-process as a singleton.
 */

import WebSocket from 'ws';
import { getDb } from '@/db/db';
import { broadcastSse } from './sse';
import { v4 as uuidv4 } from 'uuid';

interface AgentConnection {
  agentId: string;
  openclawAgentId: string;
  displayName: string;
  ws: WebSocket | null;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  currentTaskId: string | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  currentCommentId: string | null;
}

class AdapterService {
  private connections = new Map<string, AgentConnection>();
  private gatewayUrl: string = 'ws://localhost:2222';
  private initialized = false;

  init() {
    if (this.initialized) return;
    this.initialized = true;

    try {
      const db = getDb();
      const cfg = db.prepare("SELECT value FROM config WHERE key = 'gatewayUrl'").get() as { value: string } | undefined;
      if (cfg?.value) this.gatewayUrl = cfg.value;

      // Connect all existing agents
      const agents = db.prepare("SELECT * FROM agents WHERE probeStatus = 'ok'").all() as any[];
      for (const agent of agents) {
        this.connectAgent(agent);
      }
    } catch {
      // DB may not be ready yet
    }
  }

  updateGatewayUrl(url: string) {
    this.gatewayUrl = url;
    // Reconnect all
    for (const [agentId, conn] of this.connections) {
      this.disconnectAgent(agentId);
      this.connectAgentById(agentId);
    }
  }

  async probeAgent(agent: { id: string; openclawAgentId: string; displayName: string }): Promise<{ ok: boolean; error?: string }> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ ok: false, error: 'Connection timeout' });
      }, 10000);

      try {
        const ws = new WebSocket(this.gatewayUrl);

        ws.on('open', () => {
          // Send a probe ping
          ws.send(JSON.stringify({
            type: 'probe',
            agentId: agent.openclawAgentId,
            sessionKey: `agent:${agent.openclawAgentId}:clawtask`,
          }));
          
          clearTimeout(timeout);
          ws.close();
          resolve({ ok: true });
        });

        ws.on('error', (e) => {
          clearTimeout(timeout);
          ws.close();
          resolve({ ok: false, error: e.message });
        });
      } catch (e: any) {
        clearTimeout(timeout);
        resolve({ ok: false, error: e.message });
      }
    });
  }

  connectAgent(agent: { id: string; openclawAgentId: string; displayName: string }) {
    if (this.connections.has(agent.id)) return;

    const conn: AgentConnection = {
      agentId: agent.id,
      openclawAgentId: agent.openclawAgentId,
      displayName: agent.displayName,
      ws: null,
      status: 'disconnected',
      currentTaskId: null,
      reconnectTimer: null,
      currentCommentId: null,
    };
    this.connections.set(agent.id, conn);
    this.doConnect(conn);
  }

  private connectAgentById(agentId: string) {
    try {
      const db = getDb();
      const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as any;
      if (agent) this.connectAgent(agent);
    } catch {}
  }

  private doConnect(conn: AgentConnection) {
    conn.status = 'connecting';

    try {
      const ws = new WebSocket(this.gatewayUrl);
      conn.ws = ws;

      ws.on('open', () => {
        conn.status = 'connected';
        this.processNextTask(conn);
      });

      ws.on('message', (data) => {
        this.handleMessage(conn, data.toString());
      });

      ws.on('close', () => {
        conn.status = 'disconnected';
        conn.ws = null;
        // Reconnect after 5s
        conn.reconnectTimer = setTimeout(() => this.doConnect(conn), 5000);
      });

      ws.on('error', () => {
        conn.status = 'error';
        conn.ws = null;
        conn.reconnectTimer = setTimeout(() => this.doConnect(conn), 10000);
      });
    } catch {
      conn.status = 'error';
      conn.reconnectTimer = setTimeout(() => this.doConnect(conn), 10000);
    }
  }

  private handleMessage(conn: AgentConnection, raw: string) {
    try {
      const msg = JSON.parse(raw);
      const db = getDb();

      // Handle streamed output from agent
      if (msg.type === 'output' && conn.currentTaskId) {
        this.handleAgentOutput(conn, db, msg);
      }

      // Handle turn complete
      if (msg.type === 'turn_complete' && conn.currentTaskId) {
        conn.currentTaskId = null;
        conn.currentCommentId = null;
        this.processNextTask(conn);
      }
    } catch {}
  }

  private handleAgentOutput(conn: AgentConnection, db: any, msg: any) {
    if (!conn.currentTaskId) return;

    const content = msg.content || '';
    const type: 'message' | 'thinking' | 'tool' = 
      msg.block_type === 'thinking' ? 'thinking' :
      msg.block_type === 'tool' ? 'tool' : 'message';

    // Stream: if same comment, update. Otherwise create new.
    if (msg.chunk && conn.currentCommentId) {
      // Append to existing comment
      const existing = db.prepare('SELECT * FROM comments WHERE id = ?').get(conn.currentCommentId) as any;
      if (existing) {
        const newContent = existing.content + content;
        db.prepare("UPDATE comments SET content = ?, updatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?")
          .run(newContent, conn.currentCommentId);
        
        const updated = db.prepare('SELECT * FROM comments WHERE id = ?').get(conn.currentCommentId);
        broadcastSse({ type: 'comment.updated', data: { ...updated, humanRequested: false } });
        return;
      }
    }

    // New comment
    const commentId = uuidv4();
    db.prepare(`
      INSERT INTO comments (id, taskId, authorId, authorType, type, content, humanRequested, createdAt, updatedAt)
      VALUES (?, ?, ?, 'agent', ?, ?, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    `).run(commentId, conn.currentTaskId, conn.agentId, type, content);

    conn.currentCommentId = commentId;

    const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(commentId);
    broadcastSse({ type: 'comment.added', data: { ...comment, humanRequested: false } });
  }

  private processNextTask(conn: AgentConnection) {
    if (!conn.ws || conn.ws.readyState !== WebSocket.OPEN) return;

    try {
      const db = getDb();
      const nextTask = db.prepare(`
        SELECT * FROM tasks 
        WHERE assigneeId = ? AND assigneeType = 'agent' AND status != 'done'
        ORDER BY 
          CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
          createdAt ASC
        LIMIT 1
      `).get(conn.agentId) as any;

      if (!nextTask) return;

      conn.currentTaskId = nextTask.id;

      const message = `You have been assigned task ${nextTask.issueId} (${nextTask.id}) in Clawtask. Fetch full details from http://localhost:3333/api/v1/tasks/${nextTask.id} and complete the work. Post status updates via the API using your agent key.`;

      conn.ws.send(JSON.stringify({
        type: 'message',
        sessionKey: `agent:${conn.openclawAgentId}:clawtask`,
        agentId: conn.openclawAgentId,
        message,
      }));
    } catch {}
  }

  async assignTaskToAgent(task: any, agentId: string) {
    const conn = this.connections.get(agentId);
    if (!conn) {
      // Try to connect first
      this.connectAgentById(agentId);
      return;
    }

    if (!conn.currentTaskId) {
      this.processNextTask(conn);
    }
    // If busy, task will be picked up when current completes
  }

  async notifyHumanComment(task: any, comment: any) {
    if (!task.assigneeId || task.assigneeType !== 'agent') return;
    const conn = this.connections.get(task.assigneeId);
    if (!conn?.ws || conn.ws.readyState !== WebSocket.OPEN) return;

    conn.ws.send(JSON.stringify({
      type: 'message',
      sessionKey: `agent:${conn.openclawAgentId}:clawtask`,
      agentId: conn.openclawAgentId,
      message: `User commented on task ${task.issueId}: "${comment.content}". Fetch full task context from http://localhost:3333/api/v1/tasks/${task.id} and respond.`,
    }));
  }

  disconnectAgent(agentId: string) {
    const conn = this.connections.get(agentId);
    if (!conn) return;
    if (conn.reconnectTimer) clearTimeout(conn.reconnectTimer);
    conn.ws?.close();
    this.connections.delete(agentId);
  }

  getConnectionStatus(agentId: string) {
    return this.connections.get(agentId)?.status || 'disconnected';
  }
}

// Singleton
let _adapter: AdapterService | null = null;

export function getAdapterService(): AdapterService {
  if (!_adapter) {
    _adapter = new AdapterService();
    // Defer init to avoid circular deps during module load
    setTimeout(() => _adapter!.init(), 100);
  }
  return _adapter;
}
