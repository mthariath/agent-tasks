import { promises as fs } from "node:fs";
import path from "node:path";
import {
  AGENTS_FILE,
  AGENTS_MANAGED_END,
  AGENTS_MANAGED_START,
  AGENT_SKILLS_DIR,
  AGENT_SKILLS_SUBDIR,
  DEFAULT_EXTENSION_AUTO_TEST_ON_FINISH,
  DEFAULT_EXTENSION_MERGE_HANDOFF,
  DEFAULT_EXTENSION_REVIEW_QUEUE,
  DEFAULT_EXTENSION_STALE_WORKER,
  DEFAULT_EXTENSIONS_API,
  DEFAULT_EXTENSIONS_README,
  DEFAULT_GITIGNORE_BLOCK,
  DEFAULT_EPIC_BODY,
  DEFAULT_EPIC_TEMPLATE,
  DEFAULT_AGENT_GUIDANCE_BLOCK,
  DEFAULT_PROJECT_CONFIG,
  DEFAULT_SKILL_CREATING_TICKETS,
  DEFAULT_SKILL_MANAGING_STATUS,
  DEFAULT_SKILL_REFINING_TICKETS,
  DEFAULT_SKILL_WORKING_TICKETS,
  DEFAULT_TASKS_README,
  DEFAULT_TICKET_TEMPLATE,
  DEFAULT_TICKET_BODY,
  DEFAULT_WORKFLOW_GUIDE,
  DEFAULT_WORKFLOW_PACK,
  EPICS_DIR,
  EXTENSIONS_DIR,
  GITIGNORE_FILE,
  GITIGNORE_MANAGED_END,
  GITIGNORE_MANAGED_START,
  PROJECT_CONFIG,
  TASKS_DIR,
  TEMPLATES_DIR,
  TICKETS_DIR,
  WORKFLOW_FILE
} from "./constants.js";
import { parseFrontmatter, stringifyFrontmatter } from "./frontmatter.js";
import {
  normalizeTicketCustomFields,
  serializeTicketAttributes,
  splitTicketAttributes,
  validateTicketCustomFields,
  validateTicketFieldDefinitions
} from "./fields.js";
import {
  buildDefaultWorktreeRecord,
  clearExecutionRuntime,
  ensureWorkspace,
  indexExecutionRuntime,
  readClaimRecord,
  readWorkspaceRecord,
  resolveReviewStatus,
  withTicketExecutionLock,
  writeClaimRecord,
  writeWorkspaceRecord
} from "./execution.js";
import {
  buildProjectPlanning,
  getEndStatuses
} from "./planning.js";
import type {
  BlockTicketOptions,
  ClaimTicketOptions,
  EntityPatch,
  ExecutionClaimRecord,
  ExecutionTicketResult,
  ExecutionWorkspaceMode,
  Epic,
  EpicCreateInput,
  EpicFrontmatter,
  InitProjectOptions,
  ProjectConfig,
  ProjectIndex,
  ReleaseTicketOptions,
  StartTicketOptions,
  Ticket,
  TicketCreateInput,
  TicketFrontmatter,
  ValidationIssue
} from "./types.js";
import { nowDate, nowTimestamp, padId, unique } from "./utils.js";
import { parseYAML, stringifyYAML } from "./yaml.js";

function projectDir(rootDir: string): string {
  return path.join(rootDir, TASKS_DIR);
}

function configPath(rootDir: string): string {
  return path.join(projectDir(rootDir), PROJECT_CONFIG);
}

function ticketsDir(rootDir: string): string {
  return path.join(projectDir(rootDir), TICKETS_DIR);
}

function epicsDir(rootDir: string): string {
  return path.join(projectDir(rootDir), EPICS_DIR);
}

function templatesDir(rootDir: string): string {
  return path.join(projectDir(rootDir), TEMPLATES_DIR);
}

function extensionsDir(rootDir: string): string {
  return path.join(projectDir(rootDir), EXTENSIONS_DIR);
}

function workflowPath(rootDir: string): string {
  return path.join(projectDir(rootDir), WORKFLOW_FILE);
}

function agentsPath(rootDir: string): string {
  return path.join(rootDir, AGENTS_FILE);
}

function gitignorePath(rootDir: string): string {
  return path.join(rootDir, GITIGNORE_FILE);
}

function skillsPackDir(rootDir: string): string {
  return path.join(rootDir, AGENT_SKILLS_DIR, AGENT_SKILLS_SUBDIR, DEFAULT_WORKFLOW_PACK);
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

async function writeManagedFile(filePath: string, contents: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${contents}\n`, "utf8");
}

function mergeManagedBlock(existing: string, managedBlock: string): string {
  const escapedStart = AGENTS_MANAGED_START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedEnd = AGENTS_MANAGED_END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const blockPattern = new RegExp(`${escapedStart}[\\s\\S]*?${escapedEnd}`, "m");

  if (blockPattern.test(existing)) {
    return existing.replace(blockPattern, managedBlock).replace(/\s*$/, "\n");
  }

  const trimmed = existing.replace(/\s*$/, "");
  return trimmed.length === 0 ? `${managedBlock}\n` : `${trimmed}\n\n${managedBlock}\n`;
}

function mergeManagedTextBlock(existing: string, managedBlock: string, startMarker: string, endMarker: string): string {
  const escapedStart = startMarker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedEnd = endMarker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const blockPattern = new RegExp(`${escapedStart}[\\s\\S]*?${escapedEnd}`, "m");

  if (blockPattern.test(existing)) {
    return existing.replace(blockPattern, managedBlock).replace(/\s*$/, "\n");
  }

  const trimmed = existing.replace(/\s*$/, "");
  return trimmed.length === 0 ? `${managedBlock}\n` : `${trimmed}\n\n${managedBlock}\n`;
}

async function syncAgentsGuidance(rootDir: string): Promise<void> {
  const targetPath = agentsPath(rootDir);
  const exists = await fileExists(targetPath);
  if (!exists) {
    await fs.writeFile(targetPath, `${DEFAULT_AGENT_GUIDANCE_BLOCK}\n`, "utf8");
    return;
  }

  const existing = await fs.readFile(targetPath, "utf8");
  const merged = mergeManagedTextBlock(existing, DEFAULT_AGENT_GUIDANCE_BLOCK, AGENTS_MANAGED_START, AGENTS_MANAGED_END);
  await fs.writeFile(targetPath, merged, "utf8");
}

async function syncGitignore(rootDir: string): Promise<void> {
  const managedBlock = `${GITIGNORE_MANAGED_START}\n${DEFAULT_GITIGNORE_BLOCK}\n${GITIGNORE_MANAGED_END}`;
  const targetPath = gitignorePath(rootDir);
  const exists = await fileExists(targetPath);
  if (!exists) {
    await fs.writeFile(targetPath, `${managedBlock}\n`, "utf8");
    return;
  }

  const existing = await fs.readFile(targetPath, "utf8");
  const merged = mergeManagedTextBlock(existing, managedBlock, GITIGNORE_MANAGED_START, GITIGNORE_MANAGED_END);
  await fs.writeFile(targetPath, merged, "utf8");
}

async function installDefaultWorkflowPack(rootDir: string): Promise<void> {
  const packRoot = skillsPackDir(rootDir);
  const files: Array<[string, string]> = [
    [path.join(packRoot, "working-tickets", "SKILL.md"), DEFAULT_SKILL_WORKING_TICKETS],
    [path.join(packRoot, "creating-tickets", "SKILL.md"), DEFAULT_SKILL_CREATING_TICKETS],
    [path.join(packRoot, "refining-tickets", "SKILL.md"), DEFAULT_SKILL_REFINING_TICKETS],
    [path.join(packRoot, "managing-status", "SKILL.md"), DEFAULT_SKILL_MANAGING_STATUS]
  ];

  await Promise.all(files.map(([filePath, contents]) => writeManagedFile(filePath, contents)));
}

async function readDirectoryMarkdown(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
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

async function readTemplate(rootDir: string, kind: "ticket" | "epic"): Promise<string> {
  const templatePath = path.join(templatesDir(rootDir), `${kind}.md`);
  try {
    return await fs.readFile(templatePath, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return kind === "ticket" ? DEFAULT_TICKET_BODY : DEFAULT_EPIC_BODY;
    }
    throw error;
  }
}

async function parseTicket(filePath: string, config: ProjectConfig): Promise<Ticket> {
  const input = await fs.readFile(filePath, "utf8");
  const parsed = parseFrontmatter<Record<string, unknown>>(input);
  const { frontmatter, customFields, invalidFields, extraFields } = splitTicketAttributes(config, parsed.attributes);
  return {
    kind: "ticket",
    path: filePath,
    frontmatter,
    customFields,
    invalidFields,
    extraFields,
    body: parsed.body
  };
}

async function parseEpic(filePath: string): Promise<Epic> {
  const input = await fs.readFile(filePath, "utf8");
  const parsed = parseFrontmatter<EpicFrontmatter>(input);
  return {
    kind: "epic",
    path: filePath,
    frontmatter: parsed.attributes,
    body: parsed.body
  };
}

function validateConfig(config: ProjectConfig, issues: ValidationIssue[], configFilePath: string): void {
  if (!Array.isArray(config.workflow?.statuses) || config.workflow.statuses.length === 0) {
    issues.push({
      level: "error",
      code: "config.workflow.statuses",
      message: "project.yaml must define at least one workflow status",
      path: configFilePath
    });
  }

  const statuses = unique(config.workflow?.statuses ?? []);
  if (statuses.length !== (config.workflow?.statuses ?? []).length) {
    issues.push({
      level: "error",
      code: "config.workflow.statuses.duplicate",
      message: "workflow statuses must be unique",
      path: configFilePath
    });
  }

  for (const status of config.workflow?.statuses ?? []) {
    const transitions = config.workflow.transitions?.[status];
    if (!Array.isArray(transitions)) {
      issues.push({
        level: "warning",
        code: "config.workflow.transitions.missing",
        message: `status "${status}" has no transition list; treating it as terminal`,
        path: configFilePath
      });
      continue;
    }
    for (const target of transitions) {
      if (!config.workflow.statuses.includes(target)) {
        issues.push({
          level: "error",
          code: "config.workflow.transitions.unknown",
          message: `status "${status}" transitions to unknown status "${target}"`,
          path: configFilePath
        });
      }
    }
  }

  if (config.workflow.start && !config.workflow.statuses.includes(config.workflow.start)) {
    issues.push({
      level: "error",
      code: "config.workflow.start.invalid",
      message: `workflow start status "${config.workflow.start}" is not defined in workflow.statuses`,
      path: configFilePath
    });
  }

  for (const status of config.workflow.end ?? []) {
    if (!config.workflow.statuses.includes(status)) {
      issues.push({
        level: "error",
        code: "config.workflow.end.invalid",
        message: `workflow end status "${status}" is not defined in workflow.statuses`,
        path: configFilePath
      });
    }
  }

  for (const status of config.workflow.special?.blocked ?? []) {
    if (!config.workflow.statuses.includes(status)) {
      issues.push({
        level: "error",
        code: "config.workflow.special.blocked.invalid",
        message: `workflow blocked status "${status}" is not defined in workflow.statuses`,
        path: configFilePath
      });
    }
  }

  for (const status of config.workflow.special?.active ?? []) {
    if (!config.workflow.statuses.includes(status)) {
      issues.push({
        level: "error",
        code: "config.workflow.special.active.invalid",
        message: `workflow active status "${status}" is not defined in workflow.statuses`,
        path: configFilePath
      });
    }
  }

  for (const status of config.workflow.special?.review ?? []) {
    if (!config.workflow.statuses.includes(status)) {
      issues.push({
        level: "error",
        code: "config.workflow.special.review.invalid",
        message: `workflow review status "${status}" is not defined in workflow.statuses`,
        path: configFilePath
      });
    }
  }

  validateTicketFieldDefinitions(config, issues, configFilePath);
}

function detectDependencyCycles(tickets: Ticket[], issues: ValidationIssue[]): void {
  const graph = new Map<string, string[]>();
  for (const ticket of tickets) {
    graph.set(ticket.frontmatter.id, ticket.frontmatter.depends_on ?? []);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (node: string, trail: string[]): void => {
    if (visiting.has(node)) {
      issues.push({
        level: "error",
        code: "ticket.depends_on.cycle",
        entityId: node,
        message: `dependency cycle detected: ${[...trail, node].join(" -> ")}`
      });
      return;
    }
    if (visited.has(node)) {
      return;
    }
    visiting.add(node);
    for (const dependency of graph.get(node) ?? []) {
      if (graph.has(dependency)) {
        visit(dependency, [...trail, node]);
      }
    }
    visiting.delete(node);
    visited.add(node);
  };

  for (const node of graph.keys()) {
    visit(node, []);
  }
}

function validateEntityStatuses(
  config: ProjectConfig,
  issues: ValidationIssue[],
  entities: Array<Ticket | Epic>
): void {
  for (const entity of entities) {
    if (!entity.frontmatter.id || !entity.frontmatter.title || !entity.frontmatter.status) {
      issues.push({
        level: "error",
        code: `${entity.kind}.required`,
        message: `${entity.kind} requires id, title, and status`,
        entityId: entity.frontmatter.id || "(missing id)",
        path: entity.path
      });
    }
    if (!config.workflow.statuses.includes(entity.frontmatter.status)) {
      issues.push({
        level: "error",
        code: `${entity.kind}.status.invalid`,
        message: `${entity.kind} "${entity.frontmatter.id}" uses unknown status "${entity.frontmatter.status}"`,
        entityId: entity.frontmatter.id,
        path: entity.path
      });
    }
  }
}

function validateRelationships(
  config: ProjectConfig,
  tickets: Ticket[],
  epics: Epic[],
  issues: ValidationIssue[]
): Map<string, string[]> {
  const byId = new Map<string, Ticket | Epic>();
  const reverseDependencies = new Map<string, string[]>();

  for (const entity of [...epics, ...tickets]) {
    if (byId.has(entity.frontmatter.id)) {
      issues.push({
        level: "error",
        code: "entity.id.duplicate",
        message: `duplicate entity id "${entity.frontmatter.id}"`,
        entityId: entity.frontmatter.id,
        path: entity.path
      });
      continue;
    }
    byId.set(entity.frontmatter.id, entity);
  }

  validateEntityStatuses(config, issues, [...epics, ...tickets]);
  for (const ticket of tickets) {
    validateTicketCustomFields(config, ticket, issues);
  }

  for (const ticket of tickets) {
    if (ticket.frontmatter.epic && !byId.has(ticket.frontmatter.epic)) {
      issues.push({
        level: "error",
        code: "ticket.epic.missing",
        message: `ticket "${ticket.frontmatter.id}" references missing epic "${ticket.frontmatter.epic}"`,
        entityId: ticket.frontmatter.id,
        path: ticket.path
      });
    }

    for (const dependency of ticket.frontmatter.depends_on ?? []) {
      if (!byId.has(dependency)) {
        issues.push({
          level: "error",
          code: "ticket.depends_on.missing",
          message: `ticket "${ticket.frontmatter.id}" depends on missing id "${dependency}"`,
          entityId: ticket.frontmatter.id,
          path: ticket.path
        });
        continue;
      }
      const dependencyEntity = byId.get(dependency);
      if (dependencyEntity?.kind !== "ticket") {
        issues.push({
          level: "error",
          code: "ticket.depends_on.invalid_kind",
          message: `ticket "${ticket.frontmatter.id}" depends on non-ticket id "${dependency}"`,
          entityId: ticket.frontmatter.id,
          path: ticket.path
        });
        continue;
      }
      if (dependency === ticket.frontmatter.id) {
        issues.push({
          level: "error",
          code: "ticket.depends_on.self",
          message: `ticket "${ticket.frontmatter.id}" cannot depend on itself`,
          entityId: ticket.frontmatter.id,
          path: ticket.path
        });
        continue;
      }
      const existing = reverseDependencies.get(dependency) ?? [];
      existing.push(ticket.frontmatter.id);
      reverseDependencies.set(dependency, existing);
    }
  }

  detectDependencyCycles(tickets, issues);
  return reverseDependencies;
}

export async function readProjectConfig(rootDir: string): Promise<ProjectConfig> {
  const input = await fs.readFile(configPath(rootDir), "utf8");
  return parseYAML<ProjectConfig>(input);
}

export async function indexProject(rootDir: string): Promise<ProjectIndex> {
  const issues: ValidationIssue[] = [];
  const configFilePath = configPath(rootDir);
  let config: ProjectConfig;

  try {
    config = await readProjectConfig(rootDir);
  } catch (error) {
    issues.push({
      level: "error",
      code: "config.read_failed",
      message: `failed to read project config: ${(error as Error).message}`,
      path: configFilePath
    });
    config = DEFAULT_PROJECT_CONFIG;
  }

  validateConfig(config, issues, configFilePath);

  const [ticketPaths, epicPaths] = await Promise.all([
    readDirectoryMarkdown(ticketsDir(rootDir)),
    readDirectoryMarkdown(epicsDir(rootDir))
  ]);

  const tickets: Ticket[] = [];
  const epics: Epic[] = [];

  for (const ticketPath of ticketPaths) {
    try {
        tickets.push(await parseTicket(ticketPath, config));
    } catch (error) {
      issues.push({
        level: "error",
        code: "ticket.parse_failed",
        message: `failed to parse ticket "${ticketPath}": ${(error as Error).message}`,
        path: ticketPath
      });
    }
  }

  for (const epicPath of epicPaths) {
    try {
      epics.push(await parseEpic(epicPath));
    } catch (error) {
      issues.push({
        level: "error",
        code: "epic.parse_failed",
        message: `failed to parse epic "${epicPath}": ${(error as Error).message}`,
        path: epicPath
      });
    }
  }

  const reverseDependencies = validateRelationships(config, tickets, epics, issues);
  await Promise.all([...epics, ...tickets].map(async (entity) => {
    await validateEntityReferences(rootDir, entity, issues);
  }));
  const { dependencyGraph, planning } = buildProjectPlanning(config, tickets, reverseDependencies);
  const execution = await indexExecutionRuntime({
    rootDir,
    config,
    tickets
  });
  issues.push(...execution.issues);
  const byId = new Map<string, Ticket | Epic>();
  for (const entity of [...epics, ...tickets]) {
    if (!byId.has(entity.frontmatter.id)) {
      byId.set(entity.frontmatter.id, entity);
    }
  }

  return {
    rootDir,
    tasksDir: projectDir(rootDir),
    configPath: configFilePath,
    config,
    tickets,
    epics,
    byId,
    reverseDependencies,
    dependencyGraph,
    planning,
    execution,
    issues
  };
}

function buildEntityPath(rootDir: string, kind: "ticket" | "epic", id: string): string {
  const base = kind === "ticket" ? ticketsDir(rootDir) : epicsDir(rootDir);
  return path.join(base, `${id}.md`);
}

function nextEntityId(index: ProjectIndex, kind: "ticket" | "epic"): string {
  const prefix = kind === "ticket"
    ? index.config.id_prefixes?.ticket ?? DEFAULT_PROJECT_CONFIG.id_prefixes?.ticket ?? "T"
    : index.config.id_prefixes?.epic ?? DEFAULT_PROJECT_CONFIG.id_prefixes?.epic ?? "E";
  const entities = kind === "ticket" ? index.tickets : index.epics;
  const highest = entities.reduce((max, entity) => {
    const match = entity.frontmatter.id.match(/-(\d+)$/);
    if (!match) {
      return max;
    }
    return Math.max(max, Number.parseInt(match[1], 10));
  }, 0);
  return padId(prefix, highest + 1);
}

function ensureKnownEpic(index: ProjectIndex, epicId: string | undefined): void {
  if (!epicId) {
    return;
  }

  const epic = index.byId.get(epicId);
  if (!epic || epic.kind !== "epic") {
    throw new Error(`unknown epic "${epicId}"`);
  }
}

function normalizeReferences(references: string[] | undefined): string[] | undefined {
  const normalized = unique((references ?? []).map((reference) => reference.trim()).filter(Boolean));
  return normalized.length > 0 ? normalized : undefined;
}

async function assertReferencesAreValid(rootDir: string, kind: "ticket" | "epic", id: string, references: string[] | undefined): Promise<void> {
  for (const reference of references ?? []) {
    if (path.isAbsolute(reference)) {
      throw new Error(`${kind} "${id}" uses absolute reference "${reference}"`);
    }

    const resolved = path.resolve(rootDir, reference);
    const relative = path.relative(rootDir, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`${kind} "${id}" references path outside the repo: "${reference}"`);
    }
    if (!await fileExists(resolved)) {
      throw new Error(`${kind} "${id}" references missing file "${reference}"`);
    }
  }
}

async function validateEntityReferences(rootDir: string, entity: Ticket | Epic, issues: ValidationIssue[]): Promise<void> {
  const references = (entity.frontmatter as { references?: unknown }).references;
  if (references === undefined) {
    return;
  }

  if (!Array.isArray(references) || references.some((reference) => typeof reference !== "string" || reference.trim().length === 0)) {
    issues.push({
      level: "error",
      code: `${entity.kind}.references.invalid`,
      message: `${entity.kind} "${entity.frontmatter.id}" must use a non-empty string list for references`,
      entityId: entity.frontmatter.id,
      path: entity.path
    });
    return;
  }

  for (const reference of references) {
    if (path.isAbsolute(reference)) {
      issues.push({
        level: "error",
        code: `${entity.kind}.references.absolute`,
        message: `${entity.kind} "${entity.frontmatter.id}" uses absolute reference "${reference}"`,
        entityId: entity.frontmatter.id,
        path: entity.path
      });
      continue;
    }

    const resolved = path.resolve(rootDir, reference);
    const relative = path.relative(rootDir, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      issues.push({
        level: "error",
        code: `${entity.kind}.references.out_of_repo`,
        message: `${entity.kind} "${entity.frontmatter.id}" references path outside the repo: "${reference}"`,
        entityId: entity.frontmatter.id,
        path: entity.path
      });
      continue;
    }

    if (!await fileExists(resolved)) {
      issues.push({
        level: "error",
        code: `${entity.kind}.references.missing`,
        message: `${entity.kind} "${entity.frontmatter.id}" references missing file "${reference}"`,
        entityId: entity.frontmatter.id,
        path: entity.path
      });
    }
  }
}

function assertDependencyGraphIsValid(
  dependencyGraph: Map<string, string[]>,
  ticketId: string,
  candidateDependencies: string[]
): void {
  const nextGraph = new Map<string, string[]>();
  for (const [key, value] of dependencyGraph.entries()) {
    nextGraph.set(key, [...value]);
  }
  nextGraph.set(ticketId, [...candidateDependencies]);

  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (node: string, trail: string[]): void => {
    if (visiting.has(node)) {
      throw new Error(`dependency cycle detected: ${[...trail, node].join(" -> ")}`);
    }
    if (visited.has(node)) {
      return;
    }

    visiting.add(node);
    for (const dependency of nextGraph.get(node) ?? []) {
      if (nextGraph.has(dependency)) {
        visit(dependency, [...trail, node]);
      }
    }
    visiting.delete(node);
    visited.add(node);
  };

  visit(ticketId, []);
}

function validateTicketDependencies(index: ProjectIndex, ticketId: string, dependsOn: string[] | undefined): void {
  const candidateDependencies = unique((dependsOn ?? []).filter(Boolean));
  for (const dependency of candidateDependencies) {
    if (dependency === ticketId) {
      throw new Error(`ticket "${ticketId}" cannot depend on itself`);
    }

    const entity = index.byId.get(dependency);
    if (!entity) {
      throw new Error(`ticket "${ticketId}" depends on missing id "${dependency}"`);
    }
    if (entity.kind !== "ticket") {
      throw new Error(`ticket "${ticketId}" depends on non-ticket id "${dependency}"`);
    }
  }

  assertDependencyGraphIsValid(index.dependencyGraph, ticketId, candidateDependencies);
}

function requireTicket(index: ProjectIndex, id: string): Ticket {
  const entity = index.byId.get(id);
  if (!entity) {
    throw new Error(`entity "${id}" not found`);
  }
  if (entity.kind !== "ticket") {
    throw new Error(`entity "${id}" is not a ticket`);
  }
  return entity;
}

function appendExecutionNote(body: string, heading: string, message: string): string {
  const trimmed = body.trimEnd();
  const prefix = trimmed.length > 0 ? `${trimmed}\n\n` : "";
  return `${prefix}## ${heading}\n\n- ${message}\n`;
}

function buildExecutionResult(ticket: Ticket, index: ProjectIndex): ExecutionTicketResult {
  const execution = index.execution.byTicket.get(ticket.frontmatter.id) ?? { ticketId: ticket.frontmatter.id };
  return { ticket, execution };
}

async function loadExecutionResult(rootDir: string, ticketId: string): Promise<ExecutionTicketResult> {
  const index = await indexProject(rootDir);
  return buildExecutionResult(requireTicket(index, ticketId), index);
}

function chooseBlockedStatus(index: ProjectIndex, currentStatus: string): string | undefined {
  const configured = index.config.workflow.special?.blocked ?? [];
  const allowed = index.config.workflow.transitions[currentStatus] ?? [];
  for (const status of configured) {
    if (allowed.includes(status)) {
      return status;
    }
  }
  return undefined;
}

function ensureTicketReady(index: ProjectIndex, ticketId: string): void {
  const planning = index.planning.byTicket.get(ticketId);
  if (!planning?.ready) {
    const unsatisfied = planning?.unsatisfiedDependencies.join(", ") || "unresolved dependencies";
    throw new Error(`ticket "${ticketId}" is not ready: ${unsatisfied}`);
  }
}

export async function initProject(rootDir: string, name?: string, options: InitProjectOptions = {}): Promise<void> {
  const withSkills = options.withSkills ?? true;
  const withAgentGuidance = options.withAgentGuidance ?? true;
  const tasksRoot = projectDir(rootDir);
  await ensureDir(tasksRoot);
  await Promise.all([
    ensureDir(ticketsDir(rootDir)),
    ensureDir(epicsDir(rootDir)),
    ensureDir(templatesDir(rootDir)),
    ensureDir(path.join(extensionsDir(rootDir), "examples"))
  ]);

  const config: ProjectConfig = {
    ...DEFAULT_PROJECT_CONFIG,
    name: name?.trim() || DEFAULT_PROJECT_CONFIG.name
  };

  if (!await fileExists(configPath(rootDir))) {
    await fs.writeFile(configPath(rootDir), stringifyYAML(config), "utf8");
  }

  await Promise.all([
    writeManagedFile(path.join(tasksRoot, "README.md"), DEFAULT_TASKS_README),
    writeManagedFile(workflowPath(rootDir), DEFAULT_WORKFLOW_GUIDE),
    writeManagedFile(path.join(templatesDir(rootDir), "ticket.md"), DEFAULT_TICKET_TEMPLATE),
    writeManagedFile(path.join(templatesDir(rootDir), "epic.md"), DEFAULT_EPIC_TEMPLATE),
    writeManagedFile(path.join(extensionsDir(rootDir), "README.md"), DEFAULT_EXTENSIONS_README),
    writeManagedFile(path.join(extensionsDir(rootDir), "api.ts"), DEFAULT_EXTENSIONS_API),
    writeManagedFile(path.join(extensionsDir(rootDir), "examples", "review-queue.ts.example"), DEFAULT_EXTENSION_REVIEW_QUEUE),
    writeManagedFile(path.join(extensionsDir(rootDir), "examples", "auto-test-on-finish.ts.example"), DEFAULT_EXTENSION_AUTO_TEST_ON_FINISH),
    writeManagedFile(path.join(extensionsDir(rootDir), "examples", "merge-handoff.ts.example"), DEFAULT_EXTENSION_MERGE_HANDOFF),
    writeManagedFile(path.join(extensionsDir(rootDir), "examples", "stale-worker.ts.example"), DEFAULT_EXTENSION_STALE_WORKER)
  ]);

  if (withSkills) {
    await installDefaultWorkflowPack(rootDir);
  }

  if (withAgentGuidance) {
    await syncAgentsGuidance(rootDir);
  }

  await syncGitignore(rootDir);
}

export async function createTicket(rootDir: string, input: TicketCreateInput): Promise<Ticket> {
  const index = await indexProject(rootDir);
  const status = input.status ?? index.config.workflow.statuses[0];
  if (!index.config.workflow.statuses.includes(status)) {
    throw new Error(`unknown status "${status}"`);
  }
  const customFields = normalizeTicketCustomFields(index.config, input.customFields, "create");
  const id = nextEntityId(index, "ticket");
  ensureKnownEpic(index, input.epic);
  validateTicketDependencies(index, id, input.depends_on);
  const references = normalizeReferences(input.references);
  await assertReferencesAreValid(rootDir, "ticket", id, references);
  const frontmatter: TicketFrontmatter = {
    id,
    title: input.title,
    status,
    epic: input.epic,
    kind: input.kind,
    priority: input.priority,
    assigned_to: input.assigned_to,
    depends_on: input.depends_on?.length ? input.depends_on : undefined,
    references,
    labels: input.labels?.length ? input.labels : undefined,
    points: input.points,
    created_at: nowDate(),
    updated_at: nowDate()
  };
  const body = input.body ?? await readTemplate(rootDir, "ticket");

  const targetPath = buildEntityPath(rootDir, "ticket", id);
  await ensureDir(path.dirname(targetPath));
  await fs.writeFile(targetPath, stringifyFrontmatter({
    ...frontmatter,
    ...customFields
  }, body), "utf8");
  return parseTicket(targetPath, index.config);
}

export async function createEpic(rootDir: string, input: EpicCreateInput): Promise<Epic> {
  const index = await indexProject(rootDir);
  const status = input.status ?? index.config.workflow.statuses[0];
  if (!index.config.workflow.statuses.includes(status)) {
    throw new Error(`unknown status "${status}"`);
  }
  const id = nextEntityId(index, "epic");
  const references = normalizeReferences(input.references);
  await assertReferencesAreValid(rootDir, "epic", id, references);
  const frontmatter: EpicFrontmatter = {
    id,
    title: input.title,
    status,
    priority: input.priority,
    references,
    labels: input.labels?.length ? input.labels : undefined,
    created_at: nowDate(),
    updated_at: nowDate()
  };
  const targetPath = buildEntityPath(rootDir, "epic", id);
  await ensureDir(path.dirname(targetPath));
  await fs.writeFile(targetPath, stringifyFrontmatter(frontmatter, input.body ?? await readTemplate(rootDir, "epic")), "utf8");
  return parseEpic(targetPath);
}

async function writeEntity(rootDir: string, entity: Ticket | Epic): Promise<void> {
  const config = await readProjectConfig(rootDir);
  const contents = entity.kind === "ticket"
    ? stringifyFrontmatter(serializeTicketAttributes(config, entity), entity.body)
    : stringifyFrontmatter(entity.frontmatter, entity.body);
  await fs.writeFile(entity.path || buildEntityPath(rootDir, entity.kind, entity.frontmatter.id), contents, "utf8");
}

export async function updateEntity(rootDir: string, id: string, patch: EntityPatch): Promise<Ticket | Epic> {
  const index = await indexProject(rootDir);
  const entity = index.byId.get(id);
  if (!entity) {
    throw new Error(`entity "${id}" not found`);
  }

  const nextStatus = patch.status ?? entity.frontmatter.status;
  if (!index.config.workflow.statuses.includes(nextStatus)) {
    throw new Error(`unknown status "${nextStatus}"`);
  }

  const { body: _body, customFields: _customFields, ...frontmatterPatch } = patch;
  const nextFrontmatter = {
    ...entity.frontmatter,
    ...frontmatterPatch,
    updated_at: nowDate()
  };

  if (entity.kind === "ticket") {
    const ticketFrontmatter = nextFrontmatter as TicketFrontmatter;
    const customFields = {
      ...entity.customFields,
      ...normalizeTicketCustomFields(index.config, patch.customFields, "update")
    };
    if (patch.epic === null) {
      delete ticketFrontmatter.epic;
    }
    if (patch.kind === null) {
      delete ticketFrontmatter.kind;
    }
    if (patch.priority === null) {
      delete ticketFrontmatter.priority;
    }
    if (patch.assigned_to === null) {
      delete ticketFrontmatter.assigned_to;
    }
    if (patch.points === null) {
      delete ticketFrontmatter.points;
    }
    if (patch.depends_on && patch.depends_on.length === 0) {
      delete ticketFrontmatter.depends_on;
    }
    if (patch.references !== undefined) {
      ticketFrontmatter.references = normalizeReferences(patch.references ?? undefined);
      if (!ticketFrontmatter.references) {
        delete ticketFrontmatter.references;
      }
    }
    if (patch.labels && patch.labels.length === 0) {
      delete ticketFrontmatter.labels;
    }
    for (const [key, value] of Object.entries(patch.customFields ?? {})) {
      if (value === null) {
        delete customFields[key];
      }
    }
    ensureKnownEpic(index, ticketFrontmatter.epic);
    validateTicketDependencies(index, entity.frontmatter.id, ticketFrontmatter.depends_on);
    await assertReferencesAreValid(rootDir, "ticket", entity.frontmatter.id, ticketFrontmatter.references);

    const updated: Ticket = {
      ...entity,
      frontmatter: ticketFrontmatter,
      customFields,
      invalidFields: entity.invalidFields,
      body: patch.body ?? entity.body
    };
    await writeEntity(rootDir, updated);
    return updated;
  }

  if (patch.epic !== undefined || patch.kind !== undefined || patch.depends_on !== undefined || patch.points !== undefined || patch.assigned_to !== undefined || patch.customFields !== undefined) {
    throw new Error("epics do not support ticket-only fields");
  }

  const epicFrontmatter = nextFrontmatter as EpicFrontmatter;
  if (patch.priority === null) {
    delete epicFrontmatter.priority;
  }
  if (patch.references !== undefined) {
    epicFrontmatter.references = normalizeReferences(patch.references ?? undefined);
    if (!epicFrontmatter.references) {
      delete epicFrontmatter.references;
    }
  }
  if (patch.labels && patch.labels.length === 0) {
    delete epicFrontmatter.labels;
  }
  await assertReferencesAreValid(rootDir, "epic", entity.frontmatter.id, epicFrontmatter.references);

  const updated: Epic = {
    ...entity,
    frontmatter: epicFrontmatter,
    body: patch.body ?? entity.body
  };
  await writeEntity(rootDir, updated);
  return updated;
}

export async function setEntityStatus(rootDir: string, id: string, status: string): Promise<Ticket | Epic> {
  const index = await indexProject(rootDir);
  const entity = index.byId.get(id);
  if (!entity) {
    throw new Error(`entity "${id}" not found`);
  }
  if (!index.config.workflow.statuses.includes(status)) {
    throw new Error(`unknown status "${status}"`);
  }

  const currentStatus = entity.frontmatter.status;
  if (currentStatus !== status) {
    const allowed = index.config.workflow.transitions[currentStatus] ?? [];
    if (!allowed.includes(status)) {
      throw new Error(`transition "${currentStatus}" -> "${status}" is not allowed`);
    }
  }

  return updateEntity(rootDir, id, { status });
}

export async function claimTicket(rootDir: string, id: string, options: ClaimTicketOptions): Promise<ExecutionTicketResult> {
  const owner = options.owner.trim();
  if (!owner) {
    throw new Error("claim requires a non-empty owner");
  }

  await withTicketExecutionLock(rootDir, id, async () => {
    const index = await indexProject(rootDir);
    const ticket = requireTicket(index, id);
    const existing = await readClaimRecord(rootDir, id);
    if (existing && existing.owner !== owner) {
      throw new Error(`ticket "${id}" is already claimed by "${existing.owner}"`);
    }

    if (ticket.frontmatter.assigned_to !== owner) {
      await updateEntity(rootDir, id, { assigned_to: owner });
    }

    const timestamp = nowTimestamp();
    const claim: ExecutionClaimRecord = existing ?? {
      ticketId: id,
      owner,
      phase: "claimed",
      claimedAt: timestamp,
      updatedAt: timestamp
    };
    claim.owner = owner;
    claim.phase = claim.phase === "finished" ? "claimed" : claim.phase ?? "claimed";
    claim.updatedAt = timestamp;
    if (!claim.claimedAt) {
      claim.claimedAt = timestamp;
    }
    await writeClaimRecord(rootDir, claim);
  });

  return loadExecutionResult(rootDir, id);
}

export async function startTicket(rootDir: string, id: string, options: StartTicketOptions): Promise<ExecutionTicketResult> {
  const owner = options.owner.trim();
  if (!owner) {
    throw new Error("start requires a non-empty owner");
  }
  const mode: ExecutionWorkspaceMode = options.mode ?? "worktree";

  await withTicketExecutionLock(rootDir, id, async () => {
    let index = await indexProject(rootDir);
    const ticket = requireTicket(index, id);
    const claim = await readClaimRecord(rootDir, id);
    if (!claim) {
      throw new Error(`ticket "${id}" must be claimed before it can start`);
    }
    if (claim.owner !== owner) {
      throw new Error(`ticket "${id}" is claimed by "${claim.owner}", not "${owner}"`);
    }

    ensureTicketReady(index, id);

    if (ticket.frontmatter.assigned_to !== owner) {
      await updateEntity(rootDir, id, { assigned_to: owner });
      index = await indexProject(rootDir);
    }

    const startStatus = index.config.workflow.start;
    if (!startStatus) {
      throw new Error("workflow.start must be configured to start execution");
    }

    let startedTicket = requireTicket(index, id);
    if (startedTicket.frontmatter.status !== startStatus) {
      startedTicket = requireTicket(index, (await setEntityStatus(rootDir, id, startStatus)).frontmatter.id);
    }

    const workspace = await ensureWorkspace(rootDir, await buildDefaultWorktreeRecord(rootDir, startedTicket, mode));
    const timestamp = nowTimestamp();
    claim.phase = "started";
    claim.mode = mode;
    claim.startedAt = claim.startedAt ?? timestamp;
    claim.updatedAt = timestamp;
    delete claim.reason;
    delete claim.reviewStatus;
    await writeClaimRecord(rootDir, claim);
    await writeWorkspaceRecord(rootDir, workspace);
  });

  return loadExecutionResult(rootDir, id);
}

export async function blockTicket(rootDir: string, id: string, options: BlockTicketOptions): Promise<ExecutionTicketResult> {
  const reason = options.reason.trim();
  if (!reason) {
    throw new Error("block requires a non-empty reason");
  }

  await withTicketExecutionLock(rootDir, id, async () => {
    const index = await indexProject(rootDir);
    const ticket = requireTicket(index, id);
    const claim = await readClaimRecord(rootDir, id);
    if (!claim) {
      throw new Error(`ticket "${id}" must be claimed before it can be blocked`);
    }

    const nextDependencies = unique([
      ...(ticket.frontmatter.depends_on ?? []),
      ...(options.dependsOn ?? [])
    ]);

    const blockedStatus = chooseBlockedStatus(index, ticket.frontmatter.status);
    const updated = await updateEntity(rootDir, id, {
      depends_on: nextDependencies,
      body: appendExecutionNote(
        ticket.body,
        "Execution Blocker",
        `${claim.owner} ${nowDate()}: ${reason}`
      )
    });

    if (blockedStatus && updated.frontmatter.status !== blockedStatus) {
      await setEntityStatus(rootDir, id, blockedStatus);
    }

    claim.phase = "blocked";
    claim.blockedAt = nowTimestamp();
    claim.updatedAt = claim.blockedAt;
    claim.reason = reason;
    await writeClaimRecord(rootDir, claim);
  });

  return loadExecutionResult(rootDir, id);
}

export async function finishTicket(rootDir: string, id: string): Promise<ExecutionTicketResult> {
  await withTicketExecutionLock(rootDir, id, async () => {
    const index = await indexProject(rootDir);
    const ticket = requireTicket(index, id);
    const claim = await readClaimRecord(rootDir, id);
    if (!claim) {
      throw new Error(`ticket "${id}" must be claimed before it can be finished`);
    }

    const reviewStatus = resolveReviewStatus(index.config, ticket.frontmatter.status);
    if (!reviewStatus) {
      throw new Error(`ticket "${id}" has no valid review or handoff status from "${ticket.frontmatter.status}"`);
    }

    const updatedTicket = reviewStatus === ticket.frontmatter.status
      ? await updateEntity(rootDir, id, {
        body: appendExecutionNote(
          ticket.body,
          "Execution Handoff",
          `${claim.owner} ${nowDate()}: implementation complete, ready for integration`
        )
      })
      : await setEntityStatus(rootDir, id, reviewStatus);

    if (updatedTicket.kind !== "ticket") {
      throw new Error(`entity "${id}" is not a ticket`);
    }

    if (reviewStatus !== ticket.frontmatter.status) {
      const latest = await indexProject(rootDir);
      const currentTicket = requireTicket(latest, id);
      await updateEntity(rootDir, id, {
        body: appendExecutionNote(
          currentTicket.body,
          "Execution Handoff",
          `${claim.owner} ${nowDate()}: implementation complete, ready for integration`
        )
      });
    }

    const timestamp = nowTimestamp();
    claim.phase = "finished";
    claim.finishedAt = timestamp;
    claim.updatedAt = timestamp;
    claim.reviewStatus = reviewStatus;
    delete claim.reason;
    await writeClaimRecord(rootDir, claim);
  });

  return loadExecutionResult(rootDir, id);
}

export async function releaseTicket(rootDir: string, id: string, options: ReleaseTicketOptions = {}): Promise<ExecutionTicketResult> {
  await withTicketExecutionLock(rootDir, id, async () => {
    const claim = await readClaimRecord(rootDir, id);
    const workspace = await readWorkspaceRecord(rootDir, id);
    if (!claim && !workspace && !options.force) {
      throw new Error(`ticket "${id}" has no active execution state`);
    }
    await clearExecutionRuntime(rootDir, id);
  });

  return loadExecutionResult(rootDir, id);
}

export async function validateExecution(rootDir: string): Promise<ValidationIssue[]> {
  const index = await indexProject(rootDir);
  return index.issues.filter((issue) => issue.code.startsWith("execution."));
}

export async function readBodyFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf8");
}
