export type Priority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done';
export type AssigneeType = 'agent' | 'human';
export type CommentType = 'message' | 'thinking' | 'tool';
export type ProbeStatus = 'pending' | 'ok' | 'error';
export type ActivityVerb =
  | 'created'
  | 'assigned'
  | 'unassigned'
  | 'status_changed'
  | 'priority_changed'
  | 'commented'
  | 'closed'
  | 'reopened'
  | 'tagged'
  | 'untagged'
  | 'updated';

export interface Project {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

export interface Human {
  id: string;
  name: string;
  displayName: string;
  createdAt: string;
}

export interface Agent {
  id: string;
  openclawAgentId: string;
  displayName: string;
  apiKeyHash: string;
  probeStatus: ProbeStatus;
  probeLastAt: string | null;
  createdAt: string;
}

export interface Task {
  id: string;
  issueId: string;
  title: string;
  description: string;
  priority: Priority;
  status: TaskStatus;
  projectId: string | null;
  parentTaskId: string | null;
  assigneeId: string | null;
  assigneeType: AssigneeType | null;
  tags: Tag[];
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
  // Joined
  project?: Project | null;
  assignee?: Agent | Human | null;
  subtasks?: Task[];
}

export interface Comment {
  id: string;
  taskId: string;
  authorId: string;
  authorType: 'agent' | 'human' | 'external';
  type: CommentType;
  content: string;
  humanRequested: boolean;
  createdAt: string;
  updatedAt: string;
  // Joined
  author?: Agent | Human | null;
}

export interface Activity {
  id: string;
  taskId: string | null;
  actorId: string;
  actorType: 'agent' | 'human' | 'external';
  verb: string;
  humanRequested: boolean;
  meta: Record<string, unknown>;
  createdAt: string;
  // Joined
  actor?: Agent | Human | null;
  task?: Pick<Task, 'id' | 'issueId' | 'title'> | null;
}

export interface Config {
  issuePrefix: string;
  issueCounter: string;
  appName: string;
  humanName: string;
  humanDisplayName: string;
  gatewayUrl: string;
  workspaceLogo?: string;
}

// API response envelopes
export interface ApiOk<T> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

export type ApiResponse<T> = ApiOk<T> | ApiError;

// SSE Event types
export type SseEventType =
  | 'task.created'
  | 'task.updated'
  | 'comment.added'
  | 'comment.updated'
  | 'activity.added'
  | 'agent.probe';

export interface SseEvent {
  type: SseEventType;
  data: unknown;
}
