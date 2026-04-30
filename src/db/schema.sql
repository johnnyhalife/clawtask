-- Clawtask SQLite Schema

PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- Config key-value store
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Projects
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3B82F6',
  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Tags
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#3B82F6',
  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Humans
CREATE TABLE IF NOT EXISTS humans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  displayName TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Agents
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  openclawAgentId TEXT NOT NULL UNIQUE,
  displayName TEXT NOT NULL,
  apiKeyHash TEXT NOT NULL,
  probeStatus TEXT NOT NULL DEFAULT 'pending' CHECK (probeStatus IN ('pending', 'ok', 'error')),
  probeLastAt TEXT,
  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Tasks
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  issueId TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'blocked', 'done')),
  projectId TEXT REFERENCES projects(id) ON DELETE SET NULL,
  parentTaskId TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  assigneeId TEXT,
  assigneeType TEXT CHECK (assigneeType IN ('agent', 'human', NULL)),
  startDate TEXT,
  endDate TEXT,
  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Task tags (many-to-many)
CREATE TABLE IF NOT EXISTS task_tags (
  taskId TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tagId TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (taskId, tagId)
);

-- Comments
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  taskId TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  authorId TEXT NOT NULL,
  authorType TEXT NOT NULL CHECK (authorType IN ('agent', 'human')),
  type TEXT NOT NULL DEFAULT 'message' CHECK (type IN ('message', 'thinking', 'tool')),
  content TEXT NOT NULL DEFAULT '',
  humanRequested INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Activity
CREATE TABLE IF NOT EXISTS activity (
  id TEXT PRIMARY KEY,
  taskId TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  actorId TEXT NOT NULL,
  actorType TEXT NOT NULL CHECK (actorType IN ('agent', 'human')),
  verb TEXT NOT NULL,
  humanRequested INTEGER NOT NULL DEFAULT 0,
  meta TEXT NOT NULL DEFAULT '{}',
  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_projectId ON tasks(projectId);
CREATE INDEX IF NOT EXISTS idx_tasks_assigneeId ON tasks(assigneeId);
CREATE INDEX IF NOT EXISTS idx_tasks_parentTaskId ON tasks(parentTaskId);
CREATE INDEX IF NOT EXISTS idx_tasks_updatedAt ON tasks(updatedAt);
CREATE INDEX IF NOT EXISTS idx_comments_taskId ON comments(taskId);
CREATE INDEX IF NOT EXISTS idx_activity_taskId ON activity(taskId);
CREATE INDEX IF NOT EXISTS idx_activity_createdAt ON activity(createdAt);
