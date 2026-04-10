export type EntityKind = "ticket" | "epic";
export type TicketFieldType = "string" | "number" | "boolean" | "enum";
export type TicketFieldValue = string | number | boolean;

export interface TicketFieldDefinition {
  key: string;
  label?: string;
  type: TicketFieldType;
  required?: boolean;
  default?: TicketFieldValue;
  options?: string[];
  help?: string;
}

export interface WorkflowConfig {
  name: string;
  statuses: string[];
  transitions: Record<string, string[]>;
  start?: string;
  end?: string[];
  special?: {
    blocked?: string[];
    active?: string[];
    review?: string[];
  };
}

export interface ProjectConfig {
  version: number;
  name: string;
  workflow: WorkflowConfig;
  id_prefixes?: {
    ticket?: string;
    epic?: string;
  };
  fields?: {
    ticket?: TicketFieldDefinition[];
  };
}

export interface SharedFrontmatter {
  id: string;
  title: string;
  status: string;
  labels?: string[];
  references?: string[];
  created_at?: string;
  updated_at?: string;
}

export interface TicketFrontmatter extends SharedFrontmatter {
  epic?: string;
  kind?: string;
  priority?: string;
  assigned_to?: string;
  depends_on?: string[];
  points?: number;
}

export interface EpicFrontmatter extends SharedFrontmatter {
  priority?: string;
}

export interface Entity<TFrontmatter extends SharedFrontmatter> {
  kind: EntityKind;
  path: string;
  frontmatter: TFrontmatter;
  body: string;
}

export interface Ticket extends Entity<TicketFrontmatter> {
  kind: "ticket";
  customFields: Record<string, TicketFieldValue>;
  invalidFields: Record<string, unknown>;
  extraFields: Record<string, unknown>;
}

export interface Epic extends Entity<EpicFrontmatter> {
  kind: "epic";
}

export interface ValidationIssue {
  level: "error" | "warning";
  code: string;
  message: string;
  path?: string;
  entityId?: string;
}

export interface ProjectIndex {
  rootDir: string;
  tasksDir: string;
  configPath: string;
  config: ProjectConfig;
  tickets: Ticket[];
  epics: Epic[];
  byId: Map<string, Ticket | Epic>;
  reverseDependencies: Map<string, string[]>;
  dependencyGraph: Map<string, string[]>;
  planning: ProjectPlanning;
  execution: ProjectExecution;
  issues: ValidationIssue[];
}

export type ExecutionPhase = "claimed" | "started" | "blocked" | "finished";
export type ExecutionWorkspaceMode = "same_tree" | "worktree";

export interface ExecutionClaimRecord {
  ticketId: string;
  owner: string;
  phase: ExecutionPhase;
  mode?: ExecutionWorkspaceMode;
  claimedAt: string;
  startedAt?: string;
  blockedAt?: string;
  finishedAt?: string;
  updatedAt: string;
  reason?: string;
  reviewStatus?: string;
}

export interface ExecutionWorkspaceRecord {
  ticketId: string;
  mode: ExecutionWorkspaceMode;
  createdAt: string;
  path: string;
  branch?: string;
}

export interface ExecutionServerRecord {
  pid: number;
  port: number;
  host: string;
  startedAt: string;
}

export interface TicketExecutionState {
  ticketId: string;
  owner?: string;
  phase?: ExecutionPhase;
  mode?: ExecutionWorkspaceMode;
  claimedAt?: string;
  startedAt?: string;
  blockedAt?: string;
  finishedAt?: string;
  updatedAt?: string;
  reason?: string;
  reviewStatus?: string;
  workspacePath?: string;
  workspaceBranch?: string;
}

export interface ProjectExecution {
  runtimeDir: string;
  claims: ExecutionClaimRecord[];
  workspaces: ExecutionWorkspaceRecord[];
  server?: ExecutionServerRecord;
  activeTicketIds: string[];
  byTicket: Map<string, TicketExecutionState>;
  issues: ValidationIssue[];
}

export interface TicketPlanningState {
  ticketId: string;
  ended: boolean;
  active: boolean;
  blocked: boolean;
  ready: boolean;
  wave: number | null;
  satisfiedDependencies: string[];
  unsatisfiedDependencies: string[];
  unblocks: string[];
}

export interface PlanningWave {
  index: number;
  ticketIds: string[];
  readyIds: string[];
}

export interface BlockingSummary {
  ticketId: string;
  blocks: string[];
  count: number;
}

export interface ProjectPlanning {
  startStatus?: string;
  endStatuses: string[];
  blockedStatuses: string[];
  activeStatuses: string[];
  readyIds: string[];
  endedIds: string[];
  blockedIds: string[];
  activeIds: string[];
  waves: PlanningWave[];
  criticalPathIds: string[];
  blockingTickets: BlockingSummary[];
  byTicket: Map<string, TicketPlanningState>;
}

export interface TicketCreateInput {
  title: string;
  status?: string;
  epic?: string;
  kind?: string;
  priority?: string;
  assigned_to?: string;
  depends_on?: string[];
  references?: string[];
  labels?: string[];
  points?: number;
  body?: string;
  customFields?: Record<string, unknown>;
}

export interface EpicCreateInput {
  title: string;
  status?: string;
  priority?: string;
  references?: string[];
  labels?: string[];
  body?: string;
}

export interface EntityPatch {
  title?: string;
  status?: string;
  epic?: string | null;
  kind?: string | null;
  priority?: string | null;
  assigned_to?: string | null;
  depends_on?: string[];
  references?: string[] | null;
  labels?: string[];
  points?: number | null;
  body?: string;
  customFields?: Record<string, unknown | null>;
}

export interface InitProjectOptions {
  withSkills?: boolean;
  withAgentGuidance?: boolean;
}

export interface ClaimTicketOptions {
  owner: string;
}

export interface StartTicketOptions {
  owner: string;
  mode?: ExecutionWorkspaceMode;
}

export interface BlockTicketOptions {
  reason: string;
  dependsOn?: string[];
}

export interface ReleaseTicketOptions {
  force?: boolean;
}

export interface ExecutionTicketResult {
  ticket: Ticket;
  execution: TicketExecutionState;
}
