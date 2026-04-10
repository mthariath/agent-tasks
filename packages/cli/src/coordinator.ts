import { promises as fs } from "node:fs";
import path from "node:path";
import jiti from "jiti";
import {
  AGENT_SKILLS_DIR,
  TASKS_DIR,
  RUNTIME_DIR,
  blockTicket,
  claimTicket,
  finishTicket,
  indexProject,
  releaseTicket,
  startTicket,
  validateExecution
} from "@agenttasks/core";
import type {
  BlockTicketOptions,
  ExecutionTicketResult,
  ProjectIndex,
  ReleaseTicketOptions,
  StartTicketOptions,
  ValidationIssue
} from "@agenttasks/core";

const EXTENSIONS_DIR = "extensions";
const HOOKS_RUNTIME_DIR = "hooks";

export type ExtensionEventName =
  | "after_claim"
  | "before_start"
  | "after_start"
  | "before_finish"
  | "after_finish"
  | "after_block"
  | "after_release"
  | "review_requested";

export type HookRunStatus = "running" | "ok" | "blocked" | "failed" | "abandoned";

interface CoordinatorLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

interface HookBlockResult {
  block: {
    detail: string;
    code?: string;
  };
}

interface ExtensionHookContext<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  rootDir: string;
  event: ExtensionEventName;
  payload: TPayload;
  log: CoordinatorLogger;
  getIndex(): Promise<ProjectIndex>;
  block(detail: string, code?: string): HookBlockResult;
}

interface ExtensionCommandContext {
  rootDir: string;
  input: Record<string, unknown>;
  log: CoordinatorLogger;
  getIndex(): Promise<ProjectIndex>;
}

type ExtensionHookHandler = (context: ExtensionHookContext) => void | HookBlockResult | Promise<void | HookBlockResult>;
type ExtensionCommandHandler = (context: ExtensionCommandContext) => unknown | Promise<unknown>;

interface ExtensionDefinition {
  id: string;
  setup(api: ExtensionSetupApi): void | Promise<void>;
}

interface ExtensionSetupApi {
  on(event: ExtensionEventName, handler: ExtensionHookHandler): void;
  registerCommand(name: string, handler: ExtensionCommandHandler, description?: string): void;
}

interface LoadedHook {
  id: string;
  extensionId: string;
  event: ExtensionEventName;
  handler: ExtensionHookHandler;
}

interface LoadedCommand {
  name: string;
  extensionId: string;
  handler: ExtensionCommandHandler;
  description?: string;
}

interface ExtensionLoadFailure {
  sourcePath: string;
  detail: string;
}

export interface HookRunRecord {
  id: string;
  extensionId: string;
  hookId: string;
  event: ExtensionEventName;
  status: HookRunStatus;
  startedAt: string;
  finishedAt?: string;
  ticketId?: string;
  payload: Record<string, unknown>;
  error?: {
    code?: string;
    detail: string;
  };
}

interface HookDispatchError extends Error {
  hookCode?: string;
}

function hooksRuntimeDir(rootDir: string): string {
  return path.join(rootDir, TASKS_DIR, RUNTIME_DIR, HOOKS_RUNTIME_DIR);
}

function extensionsRootDir(rootDir: string): string {
  return path.join(rootDir, TASKS_DIR, EXTENSIONS_DIR);
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.tmp-${process.pid}`;
  await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, filePath);
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

async function listHookRunFiles(rootDir: string): Promise<string[]> {
  const dirPath = hooksRuntimeDir(rootDir);
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => path.join(dirPath, entry.name))
      .sort();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function isExtensionSource(filePath: string): boolean {
  const relative = filePath.replace(/\\/g, "/");
  if (!relative.endsWith(".ts")) {
    return false;
  }
  if (relative.endsWith(".example.ts") || relative.endsWith("api.ts")) {
    return false;
  }
  return true;
}

async function discoverExtensionSources(rootDir: string): Promise<string[]> {
  const root = extensionsRootDir(rootDir);
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const discovered: string[] = [];
    for (const entry of entries) {
      if (entry.isFile()) {
        const filePath = path.join(root, entry.name);
        if (isExtensionSource(filePath)) {
          discovered.push(filePath);
        }
        continue;
      }
      if (!entry.isDirectory()) {
        continue;
      }
      const indexPath = path.join(root, entry.name, "index.ts");
      if (await fileExists(indexPath)) {
        discovered.push(indexPath);
      }
    }
    return discovered.sort((left, right) => left.localeCompare(right));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function now(): string {
  return new Date().toISOString();
}

function createLogger(extensionId: string): CoordinatorLogger {
  const prefix = `[agenttasks:${extensionId}]`;
  return {
    info(message: string) {
      console.log(`${prefix} ${message}`);
    },
    warn(message: string) {
      console.warn(`${prefix} ${message}`);
    },
    error(message: string) {
      console.error(`${prefix} ${message}`);
    }
  };
}

function createHookContext(rootDir: string, extensionId: string, event: ExtensionEventName, payload: Record<string, unknown>): ExtensionHookContext {
  return {
    rootDir,
    event,
    payload,
    log: createLogger(extensionId),
    getIndex: async () => indexProject(rootDir),
    block(detail: string, code?: string) {
      return { block: { detail, code } };
    }
  };
}

function createCommandContext(rootDir: string, extensionId: string, input: Record<string, unknown>): ExtensionCommandContext {
  return {
    rootDir,
    input,
    log: createLogger(extensionId),
    getIndex: async () => indexProject(rootDir)
  };
}

function normalizeExtensionDefinition(moduleValue: unknown, sourcePath: string): ExtensionDefinition {
  const candidate = (moduleValue as { default?: unknown })?.default ?? moduleValue;
  if (!candidate || typeof candidate !== "object") {
    throw new Error(`extension at ${sourcePath} must export an object`);
  }
  const definition = candidate as Partial<ExtensionDefinition>;
  if (typeof definition.id !== "string" || definition.id.trim().length === 0) {
    throw new Error(`extension at ${sourcePath} must export a non-empty string id`);
  }
  if (typeof definition.setup !== "function") {
    throw new Error(`extension "${definition.id}" must export a setup(api) function`);
  }
  return {
    id: definition.id.trim(),
    setup: definition.setup
  };
}

export class Coordinator {
  readonly rootDir: string;

  private readonly hooksByEvent = new Map<ExtensionEventName, LoadedHook[]>();
  private readonly commands = new Map<string, LoadedCommand>();
  private readonly failedExtensions: ExtensionLoadFailure[] = [];
  private readonly loadedExtensions: Array<{ id: string; sourcePath: string }> = [];
  private runCounter = 0;

  private constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  static async create(rootDir: string): Promise<Coordinator> {
    const coordinator = new Coordinator(rootDir);
    await coordinator.recoverHookRuns();
    await coordinator.loadExtensions();
    return coordinator;
  }

  async status(): Promise<{
    loadedExtensions: Array<{ id: string; sourcePath: string }>;
    failedExtensions: ExtensionLoadFailure[];
    commands: Array<{ name: string; extensionId: string; description?: string }>;
  }> {
    return {
      loadedExtensions: [...this.loadedExtensions],
      failedExtensions: [...this.failedExtensions],
      commands: [...this.commands.values()].map((command) => ({
        name: command.name,
        extensionId: command.extensionId,
        description: command.description
      }))
    };
  }

  async listHookRuns(): Promise<HookRunRecord[]> {
    const files = await listHookRunFiles(this.rootDir);
    const runs = await Promise.all(files.map(async (filePath) => readJsonFile<HookRunRecord>(filePath)));
    return runs.filter((run): run is HookRunRecord => Boolean(run)).sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  }

  async runCommand(name: string, input: Record<string, unknown> = {}): Promise<unknown> {
    const command = this.commands.get(name);
    if (!command) {
      throw new Error(`extension command "${name}" is not registered`);
    }
    return command.handler(createCommandContext(this.rootDir, command.extensionId, input));
  }

  async claimTicket(id: string, owner: string): Promise<ExecutionTicketResult> {
    const result = await claimTicket(this.rootDir, id, { owner });
    await this.runAfterHooks("after_claim", {
      ticketId: id,
      owner,
      execution: result.execution
    });
    return result;
  }

  async startTicket(id: string, options: StartTicketOptions): Promise<ExecutionTicketResult> {
    await this.runBeforeHooks("before_start", {
      ticketId: id,
      owner: options.owner,
      mode: options.mode ?? "worktree"
    });
    const result = await startTicket(this.rootDir, id, options);
    await this.runAfterHooks("after_start", {
      ticketId: id,
      owner: options.owner,
      mode: options.mode ?? "worktree",
      execution: result.execution
    });
    return result;
  }

  async blockTicket(id: string, options: BlockTicketOptions): Promise<ExecutionTicketResult> {
    const result = await blockTicket(this.rootDir, id, options);
    await this.runAfterHooks("after_block", {
      ticketId: id,
      reason: options.reason,
      dependsOn: options.dependsOn ?? [],
      execution: result.execution
    });
    return result;
  }

  async finishTicket(id: string): Promise<ExecutionTicketResult> {
    await this.runBeforeHooks("before_finish", {
      ticketId: id
    });
    const result = await finishTicket(this.rootDir, id);
    await this.runAfterHooks("after_finish", {
      ticketId: id,
      execution: result.execution
    });
    if (result.execution.reviewStatus) {
      await this.runAfterHooks("review_requested", {
        ticketId: id,
        reviewStatus: result.execution.reviewStatus,
        execution: result.execution
      });
    }
    return result;
  }

  async releaseTicket(id: string, options: ReleaseTicketOptions = {}): Promise<ExecutionTicketResult> {
    const result = await releaseTicket(this.rootDir, id, options);
    await this.runAfterHooks("after_release", {
      ticketId: id,
      force: options.force === true,
      execution: result.execution
    });
    return result;
  }

  async validateExecution(): Promise<ValidationIssue[]> {
    return validateExecution(this.rootDir);
  }

  private async recoverHookRuns(): Promise<void> {
    const files = await listHookRunFiles(this.rootDir);
    await Promise.all(files.map(async (filePath) => {
      const record = await readJsonFile<HookRunRecord>(filePath);
      if (!record || record.status !== "running") {
        return;
      }
      record.status = "abandoned";
      record.finishedAt = now();
      record.error = {
        detail: "hook run was interrupted before completion"
      };
      await writeJsonFile(filePath, record);
    }));
  }

  private async loadExtensions(): Promise<void> {
    const sources = await discoverExtensionSources(this.rootDir);
    if (sources.length === 0) {
      return;
    }

    const runtimeImport = jiti(import.meta.url, {
      fsCache: false,
      moduleCache: false,
      interopDefault: true
    });

    for (const sourcePath of sources) {
      try {
        const moduleValue = await runtimeImport.import(sourcePath);
        const definition = normalizeExtensionDefinition(moduleValue, sourcePath);
        if (this.loadedExtensions.some((extension) => extension.id === definition.id)) {
          throw new Error(`duplicate extension id "${definition.id}"`);
        }

        const extensionId = definition.id;
        const localHooks: LoadedHook[] = [];
        const localCommands: LoadedCommand[] = [];
        const api: ExtensionSetupApi = {
          on: (event, handler) => {
            localHooks.push({
              id: `${extensionId}:${event}:${localHooks.length}`,
              extensionId,
              event,
              handler
            });
          },
          registerCommand: (name, handler, description) => {
            if (!name.trim()) {
              throw new Error(`extension command in "${extensionId}" must have a non-empty name`);
            }
            localCommands.push({
              name: name.trim(),
              extensionId,
              handler,
              description
            });
          }
        };

        await definition.setup(api);

        for (const hook of localHooks) {
          const existing = this.hooksByEvent.get(hook.event) ?? [];
          existing.push(hook);
          this.hooksByEvent.set(hook.event, existing);
        }
        for (const command of localCommands) {
          if (this.commands.has(command.name)) {
            throw new Error(`duplicate extension command "${command.name}"`);
          }
          this.commands.set(command.name, command);
        }

        this.loadedExtensions.push({ id: extensionId, sourcePath });
      } catch (error) {
        this.failedExtensions.push({
          sourcePath,
          detail: (error as Error).message
        });
      }
    }
  }

  private async runBeforeHooks(event: Extract<ExtensionEventName, "before_start" | "before_finish">, payload: Record<string, unknown>): Promise<void> {
    const hooks = this.hooksByEvent.get(event) ?? [];
    for (const hook of hooks) {
      await this.executeHook(hook, payload, true);
    }
  }

  private async runAfterHooks(event: Exclude<ExtensionEventName, "before_start" | "before_finish">, payload: Record<string, unknown>): Promise<void> {
    const hooks = this.hooksByEvent.get(event) ?? [];
    for (const hook of hooks) {
      try {
        await this.executeHook(hook, payload, false);
      } catch (error) {
        console.error(`[agenttasks:${hook.extensionId}] hook ${hook.id} failed: ${(error as Error).message}`);
      }
    }
  }

  private async executeHook(hook: LoadedHook, payload: Record<string, unknown>, blocking: boolean): Promise<void> {
    const record = await this.createHookRunRecord(hook, payload);
    try {
      const result = await hook.handler(createHookContext(this.rootDir, hook.extensionId, hook.event, payload));
      if (result && typeof result === "object" && "block" in result && result.block) {
        const block = result.block as { detail?: string; code?: string };
        const detail = typeof block.detail === "string" && block.detail.trim().length > 0
          ? block.detail.trim()
          : `hook ${hook.id} blocked ${hook.event}`;
        record.status = "blocked";
        record.finishedAt = now();
        record.error = { detail, code: block.code };
        await this.writeHookRunRecord(record);
        const error = new Error(detail) as HookDispatchError;
        error.hookCode = block.code;
        throw error;
      }

      record.status = "ok";
      record.finishedAt = now();
      await this.writeHookRunRecord(record);
    } catch (error) {
      if (record.status === "running") {
        record.status = "failed";
        record.finishedAt = now();
        record.error = {
          code: (error as HookDispatchError).hookCode,
          detail: (error as Error).message
        };
        await this.writeHookRunRecord(record);
      }
      if (blocking) {
        throw error;
      }
      throw error;
    }
  }

  private async createHookRunRecord(hook: LoadedHook, payload: Record<string, unknown>): Promise<HookRunRecord> {
    this.runCounter += 1;
    const timestamp = now();
    const runId = `${timestamp.replace(/[:.]/g, "-")}-${process.pid}-${this.runCounter}`;
    const record: HookRunRecord = {
      id: runId,
      extensionId: hook.extensionId,
      hookId: hook.id,
      event: hook.event,
      status: "running",
      startedAt: timestamp,
      ticketId: typeof payload.ticketId === "string" ? payload.ticketId : undefined,
      payload
    };
    await this.writeHookRunRecord(record);
    return record;
  }

  private async writeHookRunRecord(record: HookRunRecord): Promise<void> {
    await writeJsonFile(path.join(hooksRuntimeDir(this.rootDir), `${record.id}.json`), record);
  }
}
