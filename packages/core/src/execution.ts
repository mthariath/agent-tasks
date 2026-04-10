import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import path from "node:path";
import {
  RUNTIME_CLAIMS_DIR,
  RUNTIME_DIR,
  RUNTIME_LOCKS_DIR,
  RUNTIME_SERVER_FILE,
  RUNTIME_WORKSPACES_DIR,
  TASKS_DIR
} from "./constants.js";
import type {
  ExecutionClaimRecord,
  ExecutionServerRecord,
  ExecutionWorkspaceMode,
  ExecutionWorkspaceRecord,
  ProjectConfig,
  ProjectExecution,
  Ticket,
  TicketExecutionState,
  ValidationIssue
} from "./types.js";
import { slugify } from "./utils.js";

function runtimeDir(rootDir: string): string {
  return path.join(rootDir, TASKS_DIR, RUNTIME_DIR);
}

function claimsDir(rootDir: string): string {
  return path.join(runtimeDir(rootDir), RUNTIME_CLAIMS_DIR);
}

function workspacesDir(rootDir: string): string {
  return path.join(runtimeDir(rootDir), RUNTIME_WORKSPACES_DIR);
}

function locksDir(rootDir: string): string {
  return path.join(runtimeDir(rootDir), RUNTIME_LOCKS_DIR);
}

function serverFilePath(rootDir: string): string {
  return path.join(runtimeDir(rootDir), RUNTIME_SERVER_FILE);
}

function claimFilePath(rootDir: string, ticketId: string): string {
  return path.join(claimsDir(rootDir), `${ticketId}.json`);
}

function workspaceFilePath(rootDir: string, ticketId: string): string {
  return path.join(workspacesDir(rootDir), `${ticketId}.json`);
}

function lockPath(rootDir: string, ticketId: string): string {
  return path.join(locksDir(rootDir), `${ticketId}.lock`);
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

async function ensureRuntimeDirs(rootDir: string): Promise<void> {
  await Promise.all([
    ensureDir(claimsDir(rootDir)),
    ensureDir(workspacesDir(rootDir)),
    ensureDir(locksDir(rootDir))
  ]);
}

async function readJsonFile<T>(filePath: string): Promise<T | undefined> {
  try {
    const input = await fs.readFile(filePath, "utf8");
    return JSON.parse(input) as T;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.tmp-${process.pid}`;
  await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, filePath);
}

async function removeFileIfExists(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw error;
    }
  }
}

async function readJsonDirectory<T>(dirPath: string, issues: ValidationIssue[], code: string): Promise<T[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const values: T[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        continue;
      }
      const filePath = path.join(dirPath, entry.name);
      try {
        const value = await readJsonFile<T>(filePath);
        if (value) {
          values.push(value);
        }
      } catch (error) {
        issues.push({
          level: "error",
          code,
          message: `failed to parse runtime file "${filePath}": ${(error as Error).message}`,
          path: filePath
        });
      }
    }
    return values;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function getReviewStatuses(config: ProjectConfig): string[] {
  const configured = config.workflow.special?.review ?? [];
  if (configured.length > 0) {
    return configured;
  }
  if (config.workflow.statuses.includes("in_review")) {
    return ["in_review"];
  }
  return [];
}

export function resolveReviewStatus(config: ProjectConfig, currentStatus: string): string | undefined {
  const reviewStatuses = getReviewStatuses(config);
  for (const status of reviewStatuses) {
    if (status === currentStatus) {
      return status;
    }
  }

  const allowed = config.workflow.transitions[currentStatus] ?? [];
  for (const status of reviewStatuses) {
    if (allowed.includes(status)) {
      return status;
    }
  }

  const endStatuses = config.workflow.end ?? [];
  for (const status of allowed) {
    if (!endStatuses.includes(status)) {
      return status;
    }
  }

  return allowed[0] ?? endStatuses[0];
}

export async function readClaimRecord(rootDir: string, ticketId: string): Promise<ExecutionClaimRecord | undefined> {
  return readJsonFile<ExecutionClaimRecord>(claimFilePath(rootDir, ticketId));
}

export async function readWorkspaceRecord(rootDir: string, ticketId: string): Promise<ExecutionWorkspaceRecord | undefined> {
  return readJsonFile<ExecutionWorkspaceRecord>(workspaceFilePath(rootDir, ticketId));
}

export async function writeClaimRecord(rootDir: string, claim: ExecutionClaimRecord): Promise<void> {
  await ensureRuntimeDirs(rootDir);
  await writeJsonFile(claimFilePath(rootDir, claim.ticketId), claim);
}

export async function writeWorkspaceRecord(rootDir: string, workspace: ExecutionWorkspaceRecord): Promise<void> {
  await ensureRuntimeDirs(rootDir);
  await writeJsonFile(workspaceFilePath(rootDir, workspace.ticketId), workspace);
}

export async function clearExecutionRuntime(rootDir: string, ticketId: string): Promise<void> {
  await Promise.all([
    removeFileIfExists(claimFilePath(rootDir, ticketId)),
    removeFileIfExists(workspaceFilePath(rootDir, ticketId))
  ]);
}

export async function writeServerRecord(rootDir: string, server: ExecutionServerRecord): Promise<void> {
  await ensureRuntimeDirs(rootDir);
  await writeJsonFile(serverFilePath(rootDir), server);
}

export async function clearServerRecord(rootDir: string): Promise<void> {
  await removeFileIfExists(serverFilePath(rootDir));
}

export async function withTicketExecutionLock<T>(rootDir: string, ticketId: string, task: () => Promise<T>): Promise<T> {
  await ensureRuntimeDirs(rootDir);
  const filePath = lockPath(rootDir, ticketId);
  try {
    await fs.mkdir(filePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST") {
      throw new Error(`execution for ticket "${ticketId}" is busy`);
    }
    throw error;
  }

  try {
    return await task();
  } finally {
    await fs.rm(filePath, { recursive: true, force: true });
  }
}

function execFileAsync(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || error.message));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

export async function getGitRoot(rootDir: string): Promise<string> {
  try {
    return await execFileAsync("git", ["-C", rootDir, "rev-parse", "--show-toplevel"]);
  } catch (error) {
    throw new Error(`git worktree mode requires a git repository: ${(error as Error).message}`);
  }
}

export async function buildDefaultWorktreeRecord(rootDir: string, ticket: Ticket, mode: ExecutionWorkspaceMode): Promise<ExecutionWorkspaceRecord> {
  if (mode === "same_tree") {
    return {
      ticketId: ticket.frontmatter.id,
      mode,
      createdAt: new Date().toISOString(),
      path: rootDir
    };
  }

  const gitRoot = await getGitRoot(rootDir);
  const repoName = path.basename(gitRoot);
  const branch = `ticket/${ticket.frontmatter.id}-${slugify(ticket.frontmatter.title)}`;
  const worktreePath = path.resolve(gitRoot, "..", ".worktrees", repoName, ticket.frontmatter.id);
  return {
    ticketId: ticket.frontmatter.id,
    mode,
    createdAt: new Date().toISOString(),
    path: worktreePath,
    branch
  };
}

export async function ensureWorkspace(rootDir: string, workspace: ExecutionWorkspaceRecord): Promise<ExecutionWorkspaceRecord> {
  if (workspace.mode === "same_tree") {
    return workspace;
  }

  const gitRoot = await getGitRoot(rootDir);
  await ensureDir(path.dirname(workspace.path));
  const existing = await readJsonFile<ExecutionWorkspaceRecord>(workspaceFilePath(rootDir, workspace.ticketId));
  if (existing?.mode === "worktree" && existing.path === workspace.path) {
    return existing;
  }

  try {
    await fs.access(workspace.path);
    return workspace;
  } catch {
    // continue
  }

  if (!workspace.branch) {
    throw new Error(`workspace for "${workspace.ticketId}" is missing a branch name`);
  }

  await execFileAsync("git", ["-C", gitRoot, "worktree", "add", "-b", workspace.branch, workspace.path]);
  return workspace;
}

export async function indexExecutionRuntime(params: {
  rootDir: string;
  config: ProjectConfig;
  tickets: Ticket[];
}): Promise<ProjectExecution> {
  const { rootDir, config, tickets } = params;
  const issues: ValidationIssue[] = [];
  const claims = await readJsonDirectory<ExecutionClaimRecord>(claimsDir(rootDir), issues, "execution.claim.parse_failed");
  const workspaces = await readJsonDirectory<ExecutionWorkspaceRecord>(workspacesDir(rootDir), issues, "execution.workspace.parse_failed");
  const server = await readJsonFile<ExecutionServerRecord>(serverFilePath(rootDir));
  const byTicket = new Map<string, TicketExecutionState>();
  const ticketIds = new Set(tickets.map((ticket) => ticket.frontmatter.id));
  const claimIds = new Set<string>();

  for (const claim of claims) {
    if (claimIds.has(claim.ticketId)) {
      issues.push({
        level: "error",
        code: "execution.claim.duplicate",
        message: `multiple execution claim records exist for ticket "${claim.ticketId}"`,
        entityId: claim.ticketId,
        path: claimFilePath(rootDir, claim.ticketId)
      });
      continue;
    }
    claimIds.add(claim.ticketId);

    if (!ticketIds.has(claim.ticketId)) {
      issues.push({
        level: "error",
        code: "execution.claim.ticket_missing",
        message: `execution claim references missing ticket "${claim.ticketId}"`,
        entityId: claim.ticketId,
        path: claimFilePath(rootDir, claim.ticketId)
      });
    }

    const ticket = tickets.find((candidate) => candidate.frontmatter.id === claim.ticketId);
    if (ticket && ticket.frontmatter.assigned_to !== claim.owner) {
      issues.push({
        level: "error",
        code: "execution.claim.assignment_mismatch",
        message: `execution claim owner "${claim.owner}" does not match assigned_to for ticket "${claim.ticketId}"`,
        entityId: claim.ticketId,
        path: ticket.path
      });
    }

    byTicket.set(claim.ticketId, {
      ticketId: claim.ticketId,
      owner: claim.owner,
      phase: claim.phase,
      mode: claim.mode,
      claimedAt: claim.claimedAt,
      startedAt: claim.startedAt,
      blockedAt: claim.blockedAt,
      finishedAt: claim.finishedAt,
      updatedAt: claim.updatedAt,
      reason: claim.reason,
      reviewStatus: claim.reviewStatus
    });
  }

  for (const workspace of workspaces) {
    if (!ticketIds.has(workspace.ticketId)) {
      issues.push({
        level: "error",
        code: "execution.workspace.ticket_missing",
        message: `workspace record references missing ticket "${workspace.ticketId}"`,
        entityId: workspace.ticketId,
        path: workspaceFilePath(rootDir, workspace.ticketId)
      });
    }

    const existing = byTicket.get(workspace.ticketId) ?? { ticketId: workspace.ticketId };
    existing.mode = workspace.mode;
    existing.workspacePath = workspace.path;
    existing.workspaceBranch = workspace.branch;
    byTicket.set(workspace.ticketId, existing);

    if (!claimIds.has(workspace.ticketId)) {
      issues.push({
        level: "error",
        code: "execution.workspace.claim_missing",
        message: `workspace exists for ticket "${workspace.ticketId}" without an execution claim`,
        entityId: workspace.ticketId,
        path: workspaceFilePath(rootDir, workspace.ticketId)
      });
    }
  }

  for (const ticket of tickets) {
    const execution = byTicket.get(ticket.frontmatter.id);
    if (!execution) {
      continue;
    }
    if (["claimed", "started", "blocked", "finished"].includes(execution.phase ?? "") && !ticket.frontmatter.assigned_to) {
      issues.push({
        level: "error",
        code: "execution.ticket.assignee_missing",
        message: `ticket "${ticket.frontmatter.id}" has execution state but no assigned_to`,
        entityId: ticket.frontmatter.id,
        path: ticket.path
      });
    }
    if ((execution.phase === "started" || execution.phase === "blocked" || execution.phase === "finished") && execution.mode === "worktree" && !execution.workspacePath) {
      issues.push({
        level: "error",
        code: "execution.workspace.missing",
        message: `ticket "${ticket.frontmatter.id}" is ${execution.phase} in worktree mode but has no workspace record`,
        entityId: ticket.frontmatter.id,
        path: ticket.path
      });
    }
    if (execution.phase === "finished") {
      const reviewStatus = resolveReviewStatus(config, ticket.frontmatter.status);
      if (!reviewStatus) {
        issues.push({
          level: "warning",
          code: "execution.finish.review_missing",
          message: `ticket "${ticket.frontmatter.id}" finished without a configured review or handoff status`,
          entityId: ticket.frontmatter.id,
          path: ticket.path
        });
      }
    }
  }

  return {
    runtimeDir: runtimeDir(rootDir),
    claims,
    workspaces,
    server,
    activeTicketIds: claims.map((claim) => claim.ticketId),
    byTicket,
    issues
  };
}
