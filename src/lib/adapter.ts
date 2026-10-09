/**
 * OpenClaw Adapter Service
 *
 * Manages persistent WebSocket connections to the OpenClaw gateway per agent.
 * Uses the real OpenClaw gateway protocol (req/res/event framing).
 *
 * Auth flow mirrors @paperclipai/adapter-openclaw-gateway:
 * - Ed25519 device keypair; deviceId = sha256(rawPublicKey).hex
 * - v3 pipe-delimited signing payload
 * - connect params include role + scopes at top level
 * - auto-pairing: on PAIRING_REQUIRED, connects with token only to approve, then retries
 * - agent.wait receives { runId, timeoutMs }
 * - task comments are written through the authenticated API only
 */

import WebSocket from 'ws';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getDb } from '@/db/db';
import { v4 as uuidv4 } from 'uuid';
import { RunControl } from './run-control';
import { admitFollowup } from './run-store';
import { logActivity } from './activity';
import { broadcastSse } from './sse';
import { enrichTask } from './tasks';

// ─── Device identity ──────────────────────────────────────────────────────────

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const DEVICE_KEY_PATH = path.join(process.env.HOME || '~', '.clawtask', 'gateway-device-key.pem');

// Self-URL used in agent wake prompts. Set CLAWTASK_PUBLIC_URL in production.
// Defaults to localhost:3333 for local dev.
const CLAWTASK_SELF_URL = (process.env.CLAWTASK_PUBLIC_URL || '${CLAWTASK_SELF_URL}').replace(/\/$/, '');

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function derivePublicKeyRaw(publicKey: crypto.KeyObject): Buffer {
  const spki = publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
  if (
    spki.length === ED25519_SPKI_PREFIX.length + 32 &&
    spki.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)
  ) {
    return spki.subarray(ED25519_SPKI_PREFIX.length);
  }
  return spki;
}

interface DeviceIdentity {
  deviceId: string;
  publicKeyRawBase64Url: string;
  privateKeyPem: string;
}

function loadOrCreateDeviceIdentity(): DeviceIdentity {
  try {
    if (fs.existsSync(DEVICE_KEY_PATH)) {
      const privateKeyPem = fs.readFileSync(DEVICE_KEY_PATH, 'utf8');
      const privateKey = crypto.createPrivateKey(privateKeyPem);
      const publicKey = crypto.createPublicKey(privateKey);
      const raw = derivePublicKeyRaw(publicKey);
      return {
        deviceId: crypto.createHash('sha256').update(raw).digest('hex'),
        publicKeyRawBase64Url: base64UrlEncode(raw),
        privateKeyPem,
      };
    }
  } catch {}

  // Generate new keypair
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const raw = derivePublicKeyRaw(publicKey);
  const identity: DeviceIdentity = {
    deviceId: crypto.createHash('sha256').update(raw).digest('hex'),
    publicKeyRawBase64Url: base64UrlEncode(raw),
    privateKeyPem,
  };

  try {
    fs.mkdirSync(path.dirname(DEVICE_KEY_PATH), { recursive: true });
    fs.writeFileSync(DEVICE_KEY_PATH, privateKeyPem, { mode: 0o600 });
  } catch {}

  return identity;
}

function buildDeviceAuthPayloadV3(params: {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token: string;
  nonce: string;
}): string {
  return [
    'v3',
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    params.scopes.join(','),
    String(params.signedAtMs),
    params.token,
    params.nonce,
    process.platform,
    '', // deviceFamily
  ].join('|');
}

function signDevicePayload(privateKeyPem: string, payload: string): string {
  const key = crypto.createPrivateKey(privateKeyPem);
  return base64UrlEncode(crypto.sign(null, Buffer.from(payload, 'utf8'), key));
}

// ─── Gateway protocol types ───────────────────────────────────────────────────

interface GatewayReqFrame {
  type: 'req';
  id: string;
  method: string;
  params?: unknown;
}

interface GatewayResFrame {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { code?: unknown; message?: unknown; details?: unknown };
}

interface GatewayEventFrame {
  type: 'event';
  event: string;
  payload?: unknown;
  seq?: number;
}

type GatewayFrame = GatewayReqFrame | GatewayResFrame | GatewayEventFrame;

interface PendingRequest {
  resolve: (payload: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

// ─── Agent connection state ───────────────────────────────────────────────────

interface AgentConnection {
  agentId: string;
  openclawAgentId: string;
  displayName: string;
  ws: WebSocket | null;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  currentTaskId: string | null;
  currentRunId: string | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  pending: Map<string, PendingRequest>;
  handshakeDone: boolean;
  challengeNonce: string | null;
  challengeTs: number | null;
  autoPairAttempted: boolean;
  generation: number;
}

const CLIENT_ID = 'gateway-client';
const CLIENT_MODE = 'backend';
const CLIENT_VERSION = 'clawtask';
const ROLE = 'operator';
const SCOPES = ['operator.admin'];
const GATEWAY_PROTOCOL_VERSION = 4;

function parseGatewayChallenge(payload: unknown): { nonce: string; ts: number } | null {
  if (!payload || typeof payload !== 'object') return null;
  const { nonce, ts } = payload as { nonce?: unknown; ts?: unknown };
  if (typeof nonce !== 'string' || !nonce.trim()) return null;
  if (typeof ts !== 'number' || !Number.isSafeInteger(ts) || ts < 0) return null;
  return { nonce, ts };
}

// ─── Adapter service ──────────────────────────────────────────────────────────

export class AdapterService {
  private connections = new Map<string, AgentConnection>();
  private gatewayUrl: string = 'ws://localhost:2222';
  private gatewayAuthToken: string = '';
  private deviceIdentity: DeviceIdentity | null = null;
  private initialized = false;
  private runControl?: RunControl;

  constructor() {
    // Load config eagerly so probeAgent works before init() fires
    try {
      const db = getDb();
      const cfg = db.prepare("SELECT value FROM config WHERE key = 'gatewayUrl'").get() as { value: string } | undefined;
      if (cfg?.value) this.gatewayUrl = cfg.value;
      const authCfg = db.prepare("SELECT value FROM config WHERE key = 'gatewayAuthToken'").get() as { value: string } | undefined;
      if (authCfg?.value) this.gatewayAuthToken = authCfg.value;
      this.deviceIdentity = loadOrCreateDeviceIdentity();
    } catch {}
  }

  init() {
    if (this.initialized) return;
    this.initialized = true;

    try {
      const db = getDb();
      const cfg = db.prepare("SELECT value FROM config WHERE key = 'gatewayUrl'").get() as { value: string } | undefined;
      if (cfg?.value) this.gatewayUrl = cfg.value;

      const authCfg = db.prepare("SELECT value FROM config WHERE key = 'gatewayAuthToken'").get() as { value: string } | undefined;
      if (authCfg?.value) this.gatewayAuthToken = authCfg.value;

      this.deviceIdentity = loadOrCreateDeviceIdentity();

      // Connect all existing agents with probeStatus ok
      const agents = db.prepare("SELECT * FROM agents WHERE probeStatus = 'ok'").all() as any[];
      for (const agent of agents) {
        this.connectAgent(agent);
      }
    } catch {}
  }

  updateGatewayUrl(url: string) {
    this.gatewayUrl = url;
    try {
      const db = getDb();
      const authCfg = db.prepare("SELECT value FROM config WHERE key = 'gatewayAuthToken'").get() as { value: string } | undefined;
      if (authCfg?.value) this.gatewayAuthToken = authCfg.value;
    } catch {}
    // Snapshot: deleting and reinserting during Map iteration otherwise never ends.
    for (const agentId of Array.from(this.connections.keys())) {
      this.disconnectAgent(agentId);
      this.connectAgentById(agentId);
    }
  }

  // ─── Probe ────────────────────────────────────────────────────────────────

  async probeAgent(agent: { id: string; openclawAgentId: string; displayName: string }): Promise<{ ok: boolean; error?: string }> {
    // First probe on a cold Next.js route can miss the connect.challenge event
    // (gateway sends it before the compiled handler attaches the WS listener).
    // Retry once with a short delay if the connection closed before handshake.
    const result = await this._probeAgentOnce(agent);
    if (!result.ok && result.error?.includes('before handshake')) {
      await new Promise(r => setTimeout(r, 300));
      return this._probeAgentOnce(agent);
    }
    return result;
  }

  private async _probeAgentOnce(agent: { id: string; openclawAgentId: string; displayName: string }): Promise<{ ok: boolean; error?: string }> {
    const identity = this.deviceIdentity ?? loadOrCreateDeviceIdentity();

    return new Promise((resolve) => {
      const overallTimeout = setTimeout(() => resolve({ ok: false, error: 'Connection timeout' }), 10000);
      let done = false;
      const pending = new Map<string, PendingRequest>();

      const finish = (ok: boolean, error?: string) => {
        if (done) return;
        done = true;
        clearTimeout(overallTimeout);
        for (const pr of pending.values()) { clearTimeout(pr.timer); pr.reject(new Error('probe aborted')); }
        try { ws.close(); } catch {}
        resolve({ ok, error });
      };

      const sendReq = (method: string, params?: unknown): Promise<unknown> => {
        return new Promise((res, rej) => {
          const id = uuidv4();
          const timer = setTimeout(() => { pending.delete(id); rej(new Error(`req ${method} timed out`)); }, 15000);
          pending.set(id, { resolve: res, reject: rej, timer });
          ws.send(JSON.stringify({ type: 'req', id, method, params }));
        });
      };

      const ws = new WebSocket(this.gatewayUrl);

      ws.on('message', (data) => {
        try {
          const frame = JSON.parse(data.toString()) as GatewayFrame;

          if (frame.type === 'res') {
            const pr = pending.get((frame as GatewayResFrame).id);
            if (pr) {
              clearTimeout(pr.timer);
              pending.delete((frame as GatewayResFrame).id);
              (frame as GatewayResFrame).ok
                ? pr.resolve((frame as GatewayResFrame).payload)
                : pr.reject(new Error(String((frame as GatewayResFrame).error?.message ?? 'req failed')));
            }
          }

          if (frame.type === 'event' && (frame as GatewayEventFrame).event === 'connect.challenge') {
            const challenge = parseGatewayChallenge((frame as GatewayEventFrame).payload);
            if (!challenge) { finish(false, 'Invalid gateway challenge'); return; }
            const { nonce, ts: signedAtMs } = challenge;
            const v3Payload = buildDeviceAuthPayloadV3({
              deviceId: identity.deviceId,
              clientId: CLIENT_ID,
              clientMode: CLIENT_MODE,
              role: ROLE,
              scopes: SCOPES,
              signedAtMs,
              token: this.gatewayAuthToken,
              nonce,
            });

            sendReq('connect', {
              minProtocol: GATEWAY_PROTOCOL_VERSION,
              maxProtocol: GATEWAY_PROTOCOL_VERSION,
              client: { id: CLIENT_ID, version: CLIENT_VERSION, platform: process.platform, mode: CLIENT_MODE },
              role: ROLE,
              scopes: SCOPES,
              auth: this.gatewayAuthToken ? { token: this.gatewayAuthToken } : undefined,
              device: {
                id: identity.deviceId,
                publicKey: identity.publicKeyRawBase64Url,
                signature: signDevicePayload(identity.privateKeyPem, v3Payload),
                signedAt: signedAtMs,
                nonce,
              },
            }).then(() => finish(true))
              .catch((e: Error) => {
                // On pairing required, still call it success — we'll pair on first use
                if (e.message.toLowerCase().includes('pairing')) {
                  finish(true);
                } else {
                  finish(false, e.message);
                }
              });
          }
        } catch {}
      });

      ws.on('error', (e: any) => finish(false, e.message || e.code || 'WebSocket error'));
      ws.on('close', (code) => { if (!done) finish(false, `Connection closed before handshake (code ${code})`); });
    });
  }

  // ─── Connect / disconnect ─────────────────────────────────────────────────

  connectAgent(agent: { id: string; openclawAgentId: string; displayName: string }) {
    if (this.connections.has(agent.id)) return;

    const conn: AgentConnection = {
      agentId: agent.id,
      openclawAgentId: agent.openclawAgentId,
      displayName: agent.displayName,
      ws: null,
      status: 'disconnected',
      currentTaskId: null,
      currentRunId: null,
      reconnectTimer: null,
      pending: new Map(),
      handshakeDone: false,
      challengeNonce: null,
      challengeTs: null,
      autoPairAttempted: false,
      generation: 0,
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

  private createSocket() { return new WebSocket(this.gatewayUrl); }

  private scheduleReconnect(conn: AgentConnection, delay: number) {
    if (this.connections.get(conn.agentId)!==conn || conn.reconnectTimer) return;
    conn.reconnectTimer=setTimeout(()=>{
      conn.reconnectTimer=null;
      if (this.connections.get(conn.agentId)===conn) this.doConnect(conn);
    },delay);
  }

  private doConnect(conn: AgentConnection) {
    if (this.connections.get(conn.agentId)!==conn) return;
    if (conn.reconnectTimer) { clearTimeout(conn.reconnectTimer);conn.reconnectTimer=null; }
    const generation=++conn.generation;
    conn.status='connecting';conn.handshakeDone=false;conn.challengeNonce=null;conn.challengeTs=null;
    this.rejectAllPending(conn,'Connection replaced');
    try {
      const ws=this.createSocket();conn.ws=ws;
      const current=()=>this.connections.get(conn.agentId)===conn && conn.ws===ws && conn.generation===generation;
      ws.on('message',data=>{if(current()) this.handleFrame(conn,data.toString());});
      const failed=(status: 'error' | 'disconnected')=>{
        if (!current()) return;
        conn.status=status;conn.ws=null;conn.handshakeDone=false;
        this.rejectAllPending(conn,'Transport lost');
        this.scheduleReconnect(conn,status==='error'?10000:5000);
      };
      ws.on('close',()=>failed('disconnected'));
      ws.on('error',()=>{failed('error');try {ws.close();} catch {}});
    } catch {
      conn.status='error';this.scheduleReconnect(conn,10000);
    }
  }

  // ─── Frame handling ───────────────────────────────────────────────────────

  private handleFrame(conn: AgentConnection, raw: string) {
    try {
      const frame = JSON.parse(raw) as GatewayFrame;

      if (frame.type === 'event') {
        this.handleEventFrame(conn, frame as GatewayEventFrame);
        return;
      }

      if (frame.type === 'res') {
        const resFrame = frame as GatewayResFrame;
        const pr = conn.pending.get(resFrame.id);
        if (pr) {
          clearTimeout(pr.timer);
          conn.pending.delete(resFrame.id);
          resFrame.ok
            ? pr.resolve(resFrame.payload)
            : pr.reject(Object.assign(new Error(String(resFrame.error?.message ?? 'req failed')), {
                gatewayCode: resFrame.error?.code,
                gatewayDetails: resFrame.error?.details,
              }));
        }
      }
    } catch {}
  }

  private handleEventFrame(conn: AgentConnection, frame: GatewayEventFrame) {
    if (frame.event === 'connect.challenge') {
      const challenge = parseGatewayChallenge(frame.payload);
      conn.challengeNonce = challenge?.nonce ?? null;
      conn.challengeTs = challenge?.ts ?? null;
      this.doHandshake(conn);
      return;
    }

    // Agent output is not persisted here. Agents post comments through the API.
  }

  // ─── Handshake ────────────────────────────────────────────────────────────

  private async doHandshake(conn: AgentConnection) {
    const generation=conn.generation;
    const current=()=>this.connections.get(conn.agentId)===conn && conn.generation===generation && conn.ws!==null;
    const nonce = conn.challengeNonce;
    if (!nonce) { conn.ws?.close(); return; }

    const identity = this.deviceIdentity;
    if (!identity) { conn.ws?.close(); return; }

    const signedAtMs = conn.challengeTs;
    if (typeof signedAtMs !== 'number' || !Number.isSafeInteger(signedAtMs) || signedAtMs < 0) {
      conn.ws?.close(); return;
    }
    const v3Payload = buildDeviceAuthPayloadV3({
      deviceId: identity.deviceId,
      clientId: CLIENT_ID,
      clientMode: CLIENT_MODE,
      role: ROLE,
      scopes: SCOPES,
      signedAtMs,
      token: this.gatewayAuthToken,
      nonce,
    });

    const connectParams = {
      minProtocol: GATEWAY_PROTOCOL_VERSION,
      maxProtocol: GATEWAY_PROTOCOL_VERSION,
      client: { id: CLIENT_ID, version: CLIENT_VERSION, platform: process.platform, mode: CLIENT_MODE },
      role: ROLE,
      scopes: SCOPES,
      auth: this.gatewayAuthToken ? { token: this.gatewayAuthToken } : undefined,
      device: {
        id: identity.deviceId,
        publicKey: identity.publicKeyRawBase64Url,
        signature: signDevicePayload(identity.privateKeyPem, v3Payload),
        signedAt: signedAtMs,
        nonce,
      },
    };

    try {
      await this.sendReq(conn, 'connect', connectParams, 15000);
      if (!current()) return;
      conn.status = 'connected';
      conn.handshakeDone = true;
      conn.autoPairAttempted = false;
      this.processNextTask(conn);
    } catch (err: any) {
      if (!current()) return;
      const msg: string = err?.message ?? '';
      const isPairingRequired = msg.toLowerCase().includes('pairing');

      if (isPairingRequired && !conn.autoPairAttempted && this.gatewayAuthToken) {
        conn.autoPairAttempted = true;
        const pairOk = await this.autoPairDevice(identity, err?.gatewayDetails?.requestId as string | undefined);
        if (!current()) return;
        if (pairOk) {
          // Reconnect — will get a new challenge and retry handshake
          conn.ws?.close();
          return;
        }
      }

      conn.status = 'error';
      conn.ws?.close();
    }
  }

  // ─── Auto-pairing ─────────────────────────────────────────────────────────

  private async autoPairDevice(identity: DeviceIdentity, requestId?: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      try {
        const ws = new WebSocket(this.gatewayUrl);
        const pending = new Map<string, PendingRequest>();
        let done = false;

        const finish = (ok: boolean) => {
          if (done) return;
          done = true;
          for (const pr of pending.values()) { clearTimeout(pr.timer); pr.reject(new Error('aborted')); }
          try { ws.close(); } catch {}
          resolve(ok);
        };

        const sendReq = (method: string, params?: unknown): Promise<unknown> => {
          return new Promise((res, rej) => {
            const id = uuidv4();
            const timer = setTimeout(() => { pending.delete(id); rej(new Error(`${method} timed out`)); }, 15000);
            pending.set(id, { resolve: res, reject: rej, timer });
            ws.send(JSON.stringify({ type: 'req', id, method, params }));
          });
        };

        ws.on('message', async (data) => {
          try {
            const frame = JSON.parse(data.toString()) as GatewayFrame;

            if (frame.type === 'res') {
              const r = frame as GatewayResFrame;
              const pr = pending.get(r.id);
              if (pr) {
                clearTimeout(pr.timer);
                pending.delete(r.id);
                r.ok ? pr.resolve(r.payload) : pr.reject(new Error(String(r.error?.message ?? 'failed')));
              }
            }

            if (frame.type === 'event' && (frame as GatewayEventFrame).event === 'connect.challenge') {
              try {
                // Connect with token only (no device) + pairing scope
                await sendReq('connect', {
                  minProtocol: GATEWAY_PROTOCOL_VERSION,
                  maxProtocol: GATEWAY_PROTOCOL_VERSION,
                  client: { id: CLIENT_ID, version: CLIENT_VERSION, platform: process.platform, mode: CLIENT_MODE },
                  role: ROLE,
                  scopes: [...SCOPES, 'operator.pairing'],
                  auth: { token: this.gatewayAuthToken },
                });

                // Find the pending pairing request
                let reqId = requestId;
                if (!reqId) {
                  const listPayload = await sendReq('device.pair.list', {}) as any;
                  const pendingRequests = Array.isArray(listPayload?.pending) ? listPayload.pending : [];
                  const match = pendingRequests.find((r: any) => r.deviceId === identity.deviceId)
                    ?? pendingRequests[pendingRequests.length - 1];
                  reqId = match?.requestId;
                }

                if (!reqId) { finish(false); return; }

                await sendReq('device.pair.approve', { requestId: reqId });
                finish(true);
              } catch {
                finish(false);
              }
            }
          } catch {}
        });

        ws.on('error', () => finish(false));
        ws.on('close', () => { if (!done) finish(false); });
        setTimeout(() => finish(false), 20000);
      } catch {
        resolve(false);
      }
    });
  }

  // ─── Task dispatch ────────────────────────────────────────────────────────

  private control() {
    if (!this.runControl) this.runControl = new RunControl(getDb(),
      (conn,method,params,timeout) => this.sendReq(conn,method,params,timeout),
      conn => this.connections.get(conn.agentId) === conn && conn.handshakeDone && conn.ws?.readyState === WebSocket.OPEN,
      (task,comment,conn) => this.buildMessage(conn,task,comment),
      taskId => {
        const db=getDb();
        const human=db.prepare('SELECT id FROM humans LIMIT 1').get() as any;
        if (human) logActivity(db,{taskId,actorId:human.id,actorType:'human',verb:'status_changed',meta:{from:'done',to:'in_progress'}});
        broadcastSse({type:'task.updated',data:enrichTask(db,db.prepare('SELECT * FROM tasks WHERE id=?').get(taskId) as any)});
      });
    return this.runControl;
  }

  private async processNextTask(conn: AgentConnection) {
    try { await this.control().pump(conn); }
    catch { console.error('[adapter] queue recovery required', {agentId:conn.agentId}); }
  }

  private buildMessage(conn: AgentConnection, task: any, comment: any) {
    const db = getDb();
    const agentRow = db.prepare('SELECT apiKey FROM agents WHERE id = ?').get(conn.agentId) as any;
    const apiKey = agentRow?.apiKey ?? '';

    const slug = (task.issueId as string).toLowerCase();
    if (comment) return `A human left a follow-up on task ${task.issueId}.
Human comment: ${comment.content}
Do not restart or repeat the original task. Fetch current task details from ${CLAWTASK_SELF_URL}/api/v1/tasks/${slug}, reply through POST /api/v1/tasks/${slug}/comments, then mark done through POST /api/v1/tasks/${slug}/status.
Your Clawtask API key: ${apiKey}
Use this Bearer token on all requests to ${CLAWTASK_SELF_URL}/api/v1/. Use exec with curl or Python, never web_fetch.`;

    return `You have been assigned task ${task.issueId} in Clawtask.

Your Clawtask API key: ${apiKey}
Use it as Bearer token on ALL requests to ${CLAWTASK_SELF_URL}/api/v1/

IMPORTANT: ALL Clawtask API calls MUST use exec/bash with curl or Python — never web_fetch. web_fetch cannot send Authorization headers and will post comments as the wrong user.

Example comment post:
  curl -s -X POST ${CLAWTASK_SELF_URL}/api/v1/tasks/${slug}/comments \
    -H "Authorization: Bearer ${apiKey}" \
    -H "Content-Type: application/json" \
    -d '{"content": "your comment here"}'

Instructions:
1. Set status to in_progress: POST ${CLAWTASK_SELF_URL}/api/v1/tasks/${slug}/status with body { "status": "in_progress" }
2. Fetch full task details: GET ${CLAWTASK_SELF_URL}/api/v1/tasks/${slug}
3. Do the work.
4. Post SHORT comments as you go — one comment per action or finding, not one big block. Each comment should be 1-3 sentences max.
5. When done, mark it: POST ${CLAWTASK_SELF_URL}/api/v1/tasks/${slug}/status with body { "status": "done" }`;
  }

  // ─── Request primitive ────────────────────────────────────────────────────

  private sendReq(conn: AgentConnection, method: string, params?: unknown, timeoutMs = 30000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!conn.ws || conn.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not open'));
        return;
      }

      const id = uuidv4();
      const timer = setTimeout(() => {
        conn.pending.delete(id);
        reject(new Error(`req ${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      conn.pending.set(id, { resolve, reject, timer });
      conn.ws.send(JSON.stringify({ type: 'req', id, method, params } as GatewayReqFrame));
    });
  }

  private rejectAllPending(conn: AgentConnection, reason: string) {
    for (const [, pr] of conn.pending) {
      clearTimeout(pr.timer);
      pr.reject(new Error(reason));
    }
    conn.pending.clear();
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  async assignTaskToAgent(task: any, agentId: string) {
    let conn = this.connections.get(agentId);
    if (!conn) {
      this.connectAgentById(agentId);
      // Connection is async; task will be picked up once handshake completes via processNextTask
      return;
    }

    if (conn.handshakeDone) {
      this.processNextTask(conn);
    }
    // If connecting or busy, task will be picked up when ready
  }

  async notifyHumanComment(task: any, comment: any) {
    admitFollowup(getDb(),task,comment);
    if (!task.assigneeId || task.assigneeType !== 'agent') return;
    if (!this.connections.has(task.assigneeId)) this.connectAgentById(task.assigneeId);
    const conn=this.connections.get(task.assigneeId);
    if (conn) await this.processNextTask(conn);
  }

  async notifyTaskState(task: any) {
    this.control().statusChanged(task);
    const stored=getDb().prepare('SELECT agentId FROM task_sessions WHERE taskId=?').get(task.id) as any;
    const agentId=stored?.agentId ?? (task.assigneeType==='agent' ? task.assigneeId : null);
    if (!agentId) return;
    if (!this.connections.has(agentId)) this.connectAgentById(agentId);
    const conn=this.connections.get(agentId);
    if (conn && task.status==='done') await this.control().cleanup(conn,task.id);
    if (conn && ['todo','in_progress'].includes(task.status)) await this.processNextTask(conn);
  }

  disconnectAgent(agentId: string) {
    const conn = this.connections.get(agentId);
    if (!conn) return;
    this.connections.delete(agentId);
    conn.generation++;
    if (conn.reconnectTimer) clearTimeout(conn.reconnectTimer);
    conn.reconnectTimer=null;
    conn.handshakeDone=false;
    this.rejectAllPending(conn, 'Agent disconnected');
    conn.ws?.close();
    this.connections.delete(agentId);
  }

  getConnectionStatus(agentId: string) {
    return this.connections.get(agentId)?.status || 'disconnected';
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line no-var
  var __clawtask_adapter: AdapterService | undefined;
}

export function getAdapterService(): AdapterService {
  if (!globalThis.__clawtask_adapter) {
    globalThis.__clawtask_adapter = new AdapterService();
    setTimeout(() => globalThis.__clawtask_adapter!.init(), 100);
  }
  return globalThis.__clawtask_adapter;
}
