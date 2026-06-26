// src/types.ts

export type TaskType = "email" | "calendar" | "payment" | "reminder" | "message";
export type ExecutionMode = "immediate" | "deferred";

export interface Task {
  id: string;
  title: string;
  type: TaskType;
  urgency: number; // 1-10
  execution_mode: ExecutionMode;
  scheduled_time?: string; // ISO string if deferred
  people?: string[];
  context?: string;
  completed?: boolean;
  completedAt?: number;
}

export interface EmailArtifact {
  type: "email";
  task_id: string;
  to: string;
  subject: string;
  body: string;
}

export interface CalendarArtifact {
  type: "calendar";
  task_id: string;
  title: string;
  start_time: string;
  duration_minutes: number;
  details: string;
}

export interface ActionArtifact {
  type: "action";
  task_id: string;
  action_label: string;
  action_type: "payment" | "reminder" | "message" | "search";
  content: string;
  action_url?: string;
}

export type Artifact = EmailArtifact | CalendarArtifact | ActionArtifact;

export interface Blocker {
  task_id: string;
  missing_info_prompt: string;
  answer?: string;
}

export interface ProcessResult {
  tasks: Task[];
  artifacts: Artifact[];
  blockers: Blocker[];
  rawText?: string;
}
