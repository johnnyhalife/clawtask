#!/usr/bin/env node
// Demo seed script — generates realistic-looking tasks, comments, and activity
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

const DB_DIR = path.join(os.homedir(), '.clawtask');
const DB_PATH = path.join(DB_DIR, 'clawtask.db');

fs.mkdirSync(DB_DIR, { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Load schema
const schemaPath = path.join(process.cwd(), 'src', 'db', 'schema.sql');
db.exec(fs.readFileSync(schemaPath, 'utf-8'));

const id = () => crypto.randomUUID();
const ago = (days, hours = 0, mins = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(d.getHours() - hours);
  d.setMinutes(d.getMinutes() - mins);
  return d.toISOString().replace('T', 'T').replace(/\.\d+Z/, '.000Z');
};

// ── Wipe existing demo data ──────────────────────────────────────────────────
db.exec(`
  DELETE FROM activity;
  DELETE FROM comments;
  DELETE FROM task_tags;
  DELETE FROM tasks;
  DELETE FROM tags;
  DELETE FROM projects;
  DELETE FROM agents;
  DELETE FROM humans;
  DELETE FROM config;
`);

// ── Config ───────────────────────────────────────────────────────────────────
const configRows = [
  ['appName', 'Acme AI Platform'],
  ['humanName', 'alex'],
  ['humanDisplayName', 'Alex'],
  ['issuePrefix', 'ACM'],
  ['gatewayUrl', 'ws://localhost:2222'],
];
const upsertConfig = db.prepare(`INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)`);
for (const [k, v] of configRows) upsertConfig.run(k, v);

// ── Human ────────────────────────────────────────────────────────────────────
const humanId = id();
db.prepare(`INSERT INTO humans (id, name, displayName, createdAt) VALUES (?, ?, ?, ?)`).run(
  humanId, 'alex', 'Alex', ago(30)
);

// ── Agents ───────────────────────────────────────────────────────────────────
const agentIds = {
  coder: id(),
  reviewer: id(),
  devops: id(),
};
const fakeHash = '$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012345';
db.prepare(`INSERT INTO agents (id, openclawAgentId, displayName, apiKeyHash, apiKey, probeStatus, probeLastAt) VALUES (?, ?, ?, ?, ?, ?, ?)`)
  .run(agentIds.coder,    'coder',    'Coder',    fakeHash, '', 'ok', ago(0, 1));
db.prepare(`INSERT INTO agents (id, openclawAgentId, displayName, apiKeyHash, apiKey, probeStatus, probeLastAt) VALUES (?, ?, ?, ?, ?, ?, ?)`)
  .run(agentIds.reviewer, 'reviewer', 'Reviewer', fakeHash, '', 'ok', ago(0, 2));
db.prepare(`INSERT INTO agents (id, openclawAgentId, displayName, apiKeyHash, apiKey, probeStatus, probeLastAt) VALUES (?, ?, ?, ?, ?, ?, ?)`)
  .run(agentIds.devops,   'devops',   'DevOps',   fakeHash, '', 'ok', ago(0, 3));

// ── Projects ─────────────────────────────────────────────────────────────────
const projects = {
  backend:  { id: id(), name: 'Backend API',       color: '#6366F1' },
  frontend: { id: id(), name: 'Frontend',           color: '#F59E0B' },
  infra:    { id: id(), name: 'Infrastructure',     color: '#10B981' },
  ai:       { id: id(), name: 'AI Features',        color: '#EC4899' },
};
for (const p of Object.values(projects)) {
  db.prepare(`INSERT INTO projects (id, name, color, createdAt) VALUES (?, ?, ?, ?)`).run(p.id, p.name, p.color, ago(30));
}

// ── Tags ─────────────────────────────────────────────────────────────────────
const tags = {
  bug:      { id: id(), name: 'bug',      color: '#EF4444' },
  feat:     { id: id(), name: 'feature',  color: '#6366F1' },
  perf:     { id: id(), name: 'perf',     color: '#F59E0B' },
  security: { id: id(), name: 'security', color: '#EC4899' },
  docs:     { id: id(), name: 'docs',     color: '#10B981' },
  agent:    { id: id(), name: 'agent',    color: '#8B5CF6' },
};
for (const t of Object.values(tags)) {
  db.prepare(`INSERT INTO tags (id, name, color, createdAt) VALUES (?, ?, ?, ?)`).run(t.id, t.name, t.color, ago(20));
}

// ── Tasks ────────────────────────────────────────────────────────────────────
let issueCounter = 1;
const mkId = () => `ACM-${String(issueCounter++).padStart(3, '0')}`;

const insertTask = db.prepare(`
  INSERT INTO tasks (id, issueId, title, description, priority, status, projectId, assigneeId, assigneeType, startDate, endDate, createdAt, updatedAt)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertTag = db.prepare(`INSERT OR IGNORE INTO task_tags (taskId, tagId) VALUES (?, ?)`);
const insertComment = db.prepare(`
  INSERT INTO comments (id, taskId, authorId, authorType, type, content, createdAt, updatedAt)
  VALUES (?, ?, ?, ?, 'message', ?, ?, ?)
`);
const insertActivity = db.prepare(`
  INSERT INTO activity (id, taskId, actorId, actorType, verb, meta, createdAt)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

function task({ title, desc, priority, status, project, assigneeId, assigneeType, tagList, createdDaysAgo, updatedDaysAgo, startDate, endDate }) {
  const tid = id();
  const issueId = mkId();
  insertTask.run(
    tid, issueId, title, desc ?? '', priority, status,
    project?.id ?? null,
    assigneeId ?? null, assigneeType ?? null,
    startDate ?? null, endDate ?? null,
    ago(createdDaysAgo ?? 7), ago(updatedDaysAgo ?? 0)
  );
  for (const tag of (tagList ?? [])) insertTag.run(tid, tags[tag].id);
  return { id: tid, issueId };
}

// ── Done tasks (show history) ─────────────────────────────────────────────────
const t1 = task({ title: 'Migrate auth service to JWT RS256', desc: 'Replace HS256 HMAC tokens with RS256 asymmetric keys. Update all consumers. Rotate dev secrets.', priority: 'urgent', status: 'done', project: projects.backend, assigneeId: agentIds.coder, assigneeType: 'agent', tagList: ['feat', 'security'], createdDaysAgo: 14, updatedDaysAgo: 5 });
insertActivity.run(id(), t1.id, humanId, 'human', 'created', '{}', ago(14));
insertActivity.run(id(), t1.id, humanId, 'human', 'assigned', JSON.stringify({ assigneeId: agentIds.coder, assigneeType: 'agent' }), ago(14));
insertComment.run(id(), t1.id, agentIds.coder, 'agent', "I'll start by auditing all current HS256 usages across the codebase. Give me a moment.", ago(14, 0, 5), ago(14, 0, 5));
insertComment.run(id(), t1.id, agentIds.coder, 'agent', "Found 7 signing sites and 3 verification middlewares. Generated RS256 keypair, updated `auth-service`, and patched the API gateway middleware. All unit tests pass.\n\n```\nPASS src/auth/jwt.test.ts (12 tests)\nPASS src/middleware/verify.test.ts (8 tests)\n```\n\nPR is ready for review.", ago(13, 2), ago(13, 2));
insertActivity.run(id(), t1.id, agentIds.reviewer, 'agent', 'commented', '{}', ago(13, 1));
insertComment.run(id(), t1.id, agentIds.reviewer, 'agent', "Reviewed. LGTM — one nit: add `kid` header to tokens for future key rotation. Otherwise ship it.", ago(13, 1), ago(13, 1));
insertComment.run(id(), t1.id, agentIds.coder, 'agent', "Added `kid` header. Merged.", ago(13), ago(13));
insertActivity.run(id(), t1.id, agentIds.coder, 'agent', 'status_changed', JSON.stringify({ from: 'in_progress', to: 'done' }), ago(13));

const t2 = task({ title: 'Add p95 latency dashboard to Grafana', desc: 'Surface p50/p95/p99 latency per endpoint in the existing Grafana instance. Alert at p95 > 500ms.', priority: 'medium', status: 'done', project: projects.infra, assigneeId: agentIds.devops, assigneeType: 'agent', tagList: ['feat', 'perf'], createdDaysAgo: 10, updatedDaysAgo: 3 });
insertActivity.run(id(), t2.id, humanId, 'human', 'created', '{}', ago(10));
insertComment.run(id(), t2.id, agentIds.devops, 'agent', "Provisioned the dashboard JSON. Added 3 panels: p50/p95/p99 latency heatmaps per route. Alert threshold set at 500ms for p95. Dashboard ID: `latency-overview-v2`.", ago(9, 3), ago(9, 3));
insertActivity.run(id(), t2.id, agentIds.devops, 'agent', 'status_changed', JSON.stringify({ from: 'in_progress', to: 'done' }), ago(9, 2));

const t3 = task({ title: 'Implement streaming completions endpoint', desc: 'Add `POST /v1/completions/stream` that SSE-streams tokens as they arrive from the model. Support cancellation via AbortSignal.', priority: 'high', status: 'done', project: projects.ai, assigneeId: agentIds.coder, assigneeType: 'agent', tagList: ['feat', 'agent'], createdDaysAgo: 8, updatedDaysAgo: 2 });
insertActivity.run(id(), t3.id, humanId, 'human', 'created', '{}', ago(8));
insertComment.run(id(), t3.id, agentIds.coder, 'agent', "Implemented SSE streaming with `TransformStream`. Token deltas arrive sub-100ms. AbortSignal cancels the upstream model request cleanly. Added integration tests for partial response and cancellation paths.", ago(7, 4), ago(7, 4));
insertActivity.run(id(), t3.id, agentIds.coder, 'agent', 'status_changed', JSON.stringify({ from: 'in_progress', to: 'done' }), ago(7, 3));

// ── In-progress tasks ─────────────────────────────────────────────────────────
const t4 = task({ title: 'Build agent memory summarization pipeline', desc: 'Compress long agent conversation histories using a sliding-window summarizer. Target: keep context under 32k tokens without losing key facts.', priority: 'high', status: 'in_progress', project: projects.ai, assigneeId: agentIds.coder, assigneeType: 'agent', tagList: ['feat', 'agent'], createdDaysAgo: 3, updatedDaysAgo: 0 });
insertActivity.run(id(), t4.id, humanId, 'human', 'created', '{}', ago(3));
insertActivity.run(id(), t4.id, humanId, 'human', 'assigned', JSON.stringify({ assigneeId: agentIds.coder, assigneeType: 'agent' }), ago(3));
insertComment.run(id(), t4.id, agentIds.coder, 'agent', "Started prototyping the sliding-window approach. The key challenge is deciding what to keep vs. summarize — I'm evaluating a small embedding-based importance scorer to prioritize facts before compressing.", ago(2, 3), ago(2, 3));
insertComment.run(id(), t4.id, humanId, 'human', "Looks promising. Make sure tool call results are never summarized away — they're load-bearing.", ago(1, 2), ago(1, 2));
insertComment.run(id(), t4.id, agentIds.coder, 'agent', "Agreed. Tool results and their immediate responses are now pinned — they skip the summarizer entirely. Currently running evals on 200 synthetic histories. Early results look good.", ago(0, 4), ago(0, 4));

const t5 = task({ title: 'Fix token refresh race condition in frontend', desc: 'Under high concurrency, multiple requests can trigger simultaneous token refresh, causing 401 storms. Implement a singleton refresh queue.', priority: 'urgent', status: 'in_progress', project: projects.frontend, assigneeId: agentIds.coder, assigneeType: 'agent', tagList: ['bug', 'security'], createdDaysAgo: 1, updatedDaysAgo: 0 });
insertActivity.run(id(), t5.id, humanId, 'human', 'created', '{}', ago(1));
insertComment.run(id(), t5.id, agentIds.coder, 'agent', "Reproduced the race. Root cause: `refreshToken()` isn't guarded against concurrent calls. Implementing a promise-singleton: first caller kicks off the refresh, all subsequent callers await the same promise. Fix is ready, writing tests.", ago(0, 2), ago(0, 2));

const t6 = task({ title: 'Set up nightly model eval pipeline', desc: 'Run benchmark suite against latest model checkpoint every night at 02:00 UTC. Store results in S3, alert on >2% regression.', priority: 'medium', status: 'in_progress', project: projects.infra, assigneeId: agentIds.devops, assigneeType: 'agent', tagList: ['feat', 'agent'], createdDaysAgo: 2, updatedDaysAgo: 0 });
insertActivity.run(id(), t6.id, humanId, 'human', 'created', '{}', ago(2));
insertComment.run(id(), t6.id, agentIds.devops, 'agent', "GitHub Actions workflow drafted. Eval harness runs in a dedicated runner with GPU access. Results are serialized to S3 under `evals/{date}/{model}.json`. Working on the regression-detection step now.", ago(1, 1), ago(1, 1));

// ── Todo tasks ────────────────────────────────────────────────────────────────
task({ title: 'Add rate limiting to completions API', desc: 'Implement per-user token-bucket rate limiting. Limits: 60 RPM free tier, 600 RPM pro tier. Return 429 with Retry-After header.', priority: 'high', project: projects.backend, assigneeId: agentIds.coder, assigneeType: 'agent', tagList: ['feat', 'security'], status: 'todo', createdDaysAgo: 4, updatedDaysAgo: 4 });
task({ title: 'Refactor model router for multi-provider support', desc: 'Abstract the model router so it can fan out to OpenAI, Anthropic, and local models behind a unified interface. Priority: zero-downtime provider failover.', priority: 'high', project: projects.ai, assigneeId: agentIds.coder, assigneeType: 'agent', tagList: ['feat'], status: 'todo', createdDaysAgo: 5, updatedDaysAgo: 5 });
task({ title: 'Write OpenAPI spec for v1 endpoints', desc: 'Generate and validate OpenAPI 3.1 spec for all /v1/* endpoints. Publish to docs site.', priority: 'medium', project: projects.backend, assigneeId: null, assigneeType: null, tagList: ['docs'], status: 'todo', createdDaysAgo: 6, updatedDaysAgo: 6 });
task({ title: 'Dark mode polish pass on dashboard', desc: 'Several charts and modals have hardcoded light-mode colors. Audit and fix all non-semantic color usages.', priority: 'low', project: projects.frontend, tagList: ['bug'], status: 'todo', createdDaysAgo: 7, updatedDaysAgo: 7 });
task({ title: 'Upgrade to Node.js 22 LTS', desc: 'Bump base Docker image and CI matrix to Node 22. Run full test suite, fix any deprecations.', priority: 'medium', project: projects.infra, assigneeId: agentIds.devops, assigneeType: 'agent', tagList: ['feat'], status: 'todo', createdDaysAgo: 3, updatedDaysAgo: 3 });

// ── Blocked task ──────────────────────────────────────────────────────────────
const tb = task({ title: 'Integrate Stripe billing for pro tier', desc: 'Wire up Stripe Checkout + webhooks for subscription management. Blocked on legal review of ToS.', priority: 'high', project: projects.backend, assigneeId: humanId, assigneeType: 'human', tagList: ['feat'], status: 'blocked', createdDaysAgo: 5, updatedDaysAgo: 2 });
insertComment.run(id(), tb.id, humanId, 'human', "Waiting on legal to sign off on ToS language before we can go live. ETA next week.", ago(2), ago(2));

console.log(`✅ Seeded demo data into ${DB_PATH}`);
console.log(`   Projects: ${Object.keys(projects).length}`);
console.log(`   Agents: ${Object.keys(agentIds).length}`);
console.log(`   Tasks: ${issueCounter - 1}`);
