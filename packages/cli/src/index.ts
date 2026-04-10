#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import {
  createEpic,
  createTicket,
  indexProject,
  initProject,
  readBodyFile,
  setEntityStatus,
  updateEntity
} from "@agenttasks/core";
import type { EntityPatch, ProjectIndex } from "@agenttasks/core";
import { Coordinator } from "./coordinator.js";
import { startMcpServer } from "./mcp.js";
import { startCoordinatorServer } from "./server.js";

type ParsedOptions = Record<string, string | boolean | string[]>;

function printHelp(): void {
  const lines = [
    "agenttasks",
    "",
    "Usage:",
    "  agenttasks init [--name <name>] [--starter default] [--with-skills|--without-skills] [--with-agent-guidance|--without-agent-guidance] [--bare]",
    "  agenttasks validate",
    "  agenttasks list [--status <status>] [--epic <epic>] [--label <label>]",
    "  agenttasks show <id>",
    "  agenttasks ready",
    "  agenttasks plan",
    "  agenttasks deps <ticket-id>",
    "  agenttasks critical-path",
    "  agenttasks extensions",
    "  agenttasks hook-runs",
    "  agenttasks claim <ticket-id> --as <identity>",
    "  agenttasks start <ticket-id> --as <identity> [--same-tree|--worktree]",
    "  agenttasks block <ticket-id> --reason <text> [--depends-on <ticket-id>]...",
    "  agenttasks finish <ticket-id>",
    "  agenttasks release <ticket-id> [--force]",
    "  agenttasks validate-execution",
    "  agenttasks create ticket --title <title> [options]",
    "  agenttasks create epic --title <title> [options]",
    "  agenttasks edit <id> [options]",
    "  agenttasks set-status <id> <status>",
    "  agenttasks serve [--root <path>] [--port <port>]",
    "  agenttasks mcp [--root <path>]",
    "  agenttasks tui",
    "",
    "Common options:",
    "  --root <path>",
    "  --status <status>",
    "  --as <identity>",
    "  --epic <epic-id>",
    "  --kind <kind>",
    "  --priority <priority>",
    "  --assigned-to <identity>",
    "  --points <points>",
    "  --label <label>            Repeatable",
    "  --depends-on <ticket-id>   Repeatable",
    "  --reference <path>         Repeatable supporting doc reference",
    "  --field <key=value>        Repeatable custom field assignment",
    "  --clear-field <key>        Repeatable custom field clear",
    "  --clear-assigned-to",
    "  --clear-references",
    "  --body <markdown>",
    "  --body-file <path>",
    "  --reason <text>",
    "  --same-tree",
    "  --worktree",
    "  --force",
    "  --port <port>",
    "",
    "Notes:",
    "  `agenttasks tui` requires Bun in the current beta release."
  ];
  console.log(lines.join("\n"));
}

function parseArgs(args: string[]): { positionals: string[]; options: ParsedOptions } {
  const positionals: string[] = [];
  const options: ParsedOptions = {};

  for (let i = 0; i < args.length; i += 1) {
    const current = args[i];
    if (!current.startsWith("--")) {
      positionals.push(current);
      continue;
    }

    const key = current.slice(2);
    const next = args[i + 1];
    if (!next || next.startsWith("--")) {
      options[key] = true;
      continue;
    }

    if (key === "label" || key === "depends-on" || key === "reference" || key === "field" || key === "clear-field") {
      const existing = options[key];
      if (Array.isArray(existing)) {
        existing.push(next);
      } else if (typeof existing === "string") {
        options[key] = [existing, next];
      } else {
        options[key] = [next];
      }
    } else {
      options[key] = next;
    }
    i += 1;
  }

  return { positionals, options };
}

function optionString(options: ParsedOptions, key: string): string | undefined {
  const value = options[key];
  return typeof value === "string" ? value : undefined;
}

function optionList(options: ParsedOptions, key: string): string[] | undefined {
  const value = options[key];
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string") {
    return [value];
  }
  return undefined;
}

function parseFieldAssignments(values: string[] | undefined): Record<string, string> | undefined {
  if (!values || values.length === 0) {
    return undefined;
  }

  const result: Record<string, string> = {};
  for (const value of values) {
    const separator = value.indexOf("=");
    if (separator <= 0) {
      throw new Error(`invalid --field value "${value}"; expected key=value`);
    }
    const key = value.slice(0, separator).trim();
    if (!key) {
      throw new Error(`invalid --field value "${value}"; expected key=value`);
    }
    result[key] = value.slice(separator + 1);
  }

  return result;
}

async function resolveBody(options: ParsedOptions): Promise<string | undefined> {
  const inline = optionString(options, "body");
  if (inline) {
    return inline;
  }
  const filePath = optionString(options, "body-file");
  if (filePath) {
    return readBodyFile(path.resolve(process.cwd(), filePath));
  }
  return undefined;
}

function resolveRootDir(options: ParsedOptions): string {
  const root = optionString(options, "root");
  return path.resolve(process.cwd(), root ?? ".");
}

function renderIssues(index: ProjectIndex): string {
  if (index.issues.length === 0) {
    return "Validation OK";
  }
  return index.issues
    .map((issue) => `${issue.level.toUpperCase()} ${issue.code}: ${issue.message}${issue.path ? ` (${issue.path})` : ""}`)
    .join("\n");
}

function renderList(index: ProjectIndex, options: ParsedOptions): string {
  const status = optionString(options, "status");
  const epic = optionString(options, "epic");
  const label = optionString(options, "label");
  const assignedTo = optionString(options, "assigned-to");
  const tickets = index.tickets.filter((ticket) => {
    if (status && ticket.frontmatter.status !== status) {
      return false;
    }
    if (epic && ticket.frontmatter.epic !== epic) {
      return false;
    }
    if (label && !(ticket.frontmatter.labels ?? []).includes(label)) {
      return false;
    }
    if (assignedTo && ticket.frontmatter.assigned_to !== assignedTo) {
      return false;
    }
    return true;
  });

  const lines = tickets.map((ticket) => {
    const pieces = [
      ticket.frontmatter.id,
      `[${ticket.frontmatter.status}]`,
      ticket.frontmatter.title
    ];
    if (ticket.frontmatter.epic) {
      pieces.push(`epic=${ticket.frontmatter.epic}`);
    }
    if (ticket.frontmatter.assigned_to) {
      pieces.push(`assigned=${ticket.frontmatter.assigned_to}`);
    }
    return pieces.join(" ");
  });

  return lines.length > 0 ? lines.join("\n") : "No tickets found";
}

function renderShow(index: ProjectIndex, id: string): string {
  const entity = index.byId.get(id);
  if (!entity) {
    throw new Error(`entity "${id}" not found`);
  }

  const reverse = index.reverseDependencies.get(id) ?? [];
  const lines = [
    `${entity.frontmatter.id} (${entity.kind})`,
    `title: ${entity.frontmatter.title}`,
    `status: ${entity.frontmatter.status}`,
    `labels: ${(entity.frontmatter.labels ?? []).join(", ") || "-"}`,
    `references: ${(entity.frontmatter.references ?? []).join(", ") || "-"}`,
    `assigned_to: ${entity.kind === "ticket" ? entity.frontmatter.assigned_to ?? "-" : "-"}`,
    `depends_on: ${entity.kind === "ticket" ? (entity.frontmatter.depends_on ?? []).join(", ") || "-" : "-"}`,
    `reverse_dependencies: ${reverse.join(", ") || "-"}`,
    ...(entity.kind === "ticket"
      ? (index.config.fields?.ticket ?? []).map((field) => `${field.key}: ${entity.customFields[field.key] ?? "-"}`)
      : []),
    "",
    entity.body.trim()
  ];

  return lines.join("\n");
}

function renderReady(index: ProjectIndex): string {
  const tickets = index.planning.readyIds
    .map((ticketId) => index.byId.get(ticketId))
    .filter((entity): entity is NonNullable<typeof entity> => Boolean(entity))
    .filter((entity) => entity.kind === "ticket");

  if (tickets.length === 0) {
    return "No tickets are ready";
  }

  return tickets.map((ticket) => {
    const planning = index.planning.byTicket.get(ticket.frontmatter.id);
    const parts = [
      ticket.frontmatter.id,
      `[${ticket.frontmatter.status}]`,
      ticket.frontmatter.title
    ];
    if (ticket.frontmatter.epic) {
      parts.push(`epic=${ticket.frontmatter.epic}`);
    }
    if (ticket.frontmatter.assigned_to) {
      parts.push(`assigned=${ticket.frontmatter.assigned_to}`);
    }
    if (planning?.wave !== null && planning?.wave !== undefined) {
      parts.push(`wave=${planning.wave + 1}`);
    }
    return parts.join(" ");
  }).join("\n");
}

function renderPlan(index: ProjectIndex): string {
  const lines: string[] = [];

  lines.push("Ready Now");
  if (index.planning.readyIds.length === 0) {
    lines.push("  - none");
  } else {
    for (const ticketId of index.planning.readyIds) {
      const entity = index.byId.get(ticketId);
      if (entity?.kind === "ticket") {
        lines.push(`  - ${entity.frontmatter.id} ${entity.frontmatter.title}`);
      }
    }
  }

  lines.push("");
  lines.push("Waves");
  if (index.planning.waves.length === 0) {
    lines.push("  - none");
  } else {
    for (const wave of index.planning.waves) {
      const tickets = wave.ticketIds
        .map((ticketId) => {
          const entity = index.byId.get(ticketId);
          return entity?.kind === "ticket" ? `${entity.frontmatter.id} ${entity.frontmatter.title}` : ticketId;
        })
        .join(" | ");
      const ready = wave.readyIds.length > 0 ? `  ready=${wave.readyIds.join(", ")}` : "";
      lines.push(`  ${wave.index + 1}. ${tickets}${ready}`);
    }
  }

  lines.push("");
  lines.push("Biggest Blockers");
  if (index.planning.blockingTickets.length === 0) {
    lines.push("  - none");
  } else {
    for (const item of index.planning.blockingTickets.slice(0, 5)) {
      const entity = index.byId.get(item.ticketId);
      const title = entity?.kind === "ticket" ? entity.frontmatter.title : item.ticketId;
      lines.push(`  - ${item.ticketId} ${title}  blocks=${item.count}  unblocks=${item.blocks.join(", ")}`);
    }
  }

  lines.push("");
  lines.push("Critical Path");
  if (index.planning.criticalPathIds.length === 0) {
    lines.push("  - none");
  } else {
    const critical = index.planning.criticalPathIds
      .map((ticketId) => {
        const entity = index.byId.get(ticketId);
        return entity?.kind === "ticket" ? `${entity.frontmatter.id} ${entity.frontmatter.title}` : ticketId;
      })
      .join(" -> ");
    lines.push(`  ${critical}`);
  }

  return lines.join("\n");
}

function renderDependencies(index: ProjectIndex, id: string): string {
  const entity = index.byId.get(id);
  if (!entity) {
    throw new Error(`entity "${id}" not found`);
  }
  if (entity.kind !== "ticket") {
    throw new Error(`entity "${id}" is not a ticket`);
  }

  const planning = index.planning.byTicket.get(id);
  const lines = [
    `${entity.frontmatter.id} ${entity.frontmatter.title}`,
    `ready: ${planning?.ready ? "yes" : "no"}`,
    `wave: ${planning?.wave !== null && planning?.wave !== undefined ? planning.wave + 1 : "-"}`,
    `depends_on: ${(entity.frontmatter.depends_on ?? []).join(", ") || "-"}`,
    `satisfied: ${planning?.satisfiedDependencies.join(", ") || "-"}`,
    `unsatisfied: ${planning?.unsatisfiedDependencies.join(", ") || "-"}`,
    `reverse_dependencies: ${(index.reverseDependencies.get(id) ?? []).join(", ") || "-"}`,
    `unblocks_on_completion: ${planning?.unblocks.join(", ") || "-"}`
  ];
  return lines.join("\n");
}

function renderCriticalPath(index: ProjectIndex): string {
  if (index.planning.criticalPathIds.length === 0) {
    return "No critical path";
  }

  return index.planning.criticalPathIds
    .map((ticketId) => {
      const entity = index.byId.get(ticketId);
      return entity?.kind === "ticket" ? `${entity.frontmatter.id} ${entity.frontmatter.title}` : ticketId;
    })
    .join("\n");
}

function renderExecutionStatus(index: ProjectIndex): string {
  const lines = [...index.execution.byTicket.values()]
    .sort((left, right) => left.ticketId.localeCompare(right.ticketId))
    .map((execution) => {
      const parts = [
        execution.ticketId,
        execution.phase ?? "unclaimed"
      ];
      if (execution.owner) {
        parts.push(`owner=${execution.owner}`);
      }
      if (execution.mode) {
        parts.push(`mode=${execution.mode}`);
      }
      if (execution.workspaceBranch) {
        parts.push(`branch=${execution.workspaceBranch}`);
      }
      if (execution.workspacePath) {
        parts.push(`path=${execution.workspacePath}`);
      }
      return parts.join(" ");
    });

  return lines.length > 0 ? lines.join("\n") : "No execution state";
}

async function handleCreate(rootDir: string, positionals: string[], options: ParsedOptions): Promise<void> {
  const kind = positionals[1];
  const title = optionString(options, "title");
  if (!title) {
    throw new Error("create requires --title");
  }
  const body = await resolveBody(options);

  if (kind === "ticket") {
    const ticket = await createTicket(rootDir, {
      title,
      status: optionString(options, "status"),
      epic: optionString(options, "epic"),
      kind: optionString(options, "kind"),
      priority: optionString(options, "priority"),
      assigned_to: optionString(options, "assigned-to"),
      depends_on: optionList(options, "depends-on"),
      references: optionList(options, "reference"),
      labels: optionList(options, "label"),
      points: optionString(options, "points") ? Number(optionString(options, "points")) : undefined,
      body,
      customFields: parseFieldAssignments(optionList(options, "field"))
    });
    console.log(`Created ticket ${ticket.frontmatter.id}`);
    return;
  }

  if (kind === "epic") {
    const epic = await createEpic(rootDir, {
      title,
      status: optionString(options, "status"),
      priority: optionString(options, "priority"),
      references: optionList(options, "reference"),
      labels: optionList(options, "label"),
      body
    });
    console.log(`Created epic ${epic.frontmatter.id}`);
    return;
  }

  throw new Error(`unknown entity type "${kind}"`);
}

async function handleEdit(rootDir: string, positionals: string[], options: ParsedOptions): Promise<void> {
  const id = positionals[1];
  if (!id) {
    throw new Error("edit requires an entity id");
  }

  const patch: EntityPatch = {};
  const maybeBody = await resolveBody(options);
  if (optionString(options, "title")) {
    patch.title = optionString(options, "title");
  }
  if (optionString(options, "status")) {
    patch.status = optionString(options, "status");
  }
  if ("epic" in options) {
    patch.epic = optionString(options, "epic") ?? null;
  }
  if ("kind" in options) {
    patch.kind = optionString(options, "kind") ?? null;
  }
  if ("priority" in options) {
    patch.priority = optionString(options, "priority") ?? null;
  }
  if ("assigned-to" in options) {
    patch.assigned_to = optionString(options, "assigned-to") ?? null;
  }
  if ("clear-assigned-to" in options) {
    patch.assigned_to = null;
  }
  if ("points" in options) {
    const points = optionString(options, "points");
    patch.points = points ? Number(points) : null;
  }
  if ("label" in options) {
    patch.labels = optionList(options, "label") ?? [];
  }
  if ("reference" in options) {
    patch.references = optionList(options, "reference") ?? [];
  }
  if ("clear-references" in options) {
    patch.references = [];
  }
  if ("depends-on" in options) {
    patch.depends_on = optionList(options, "depends-on") ?? [];
  }
  if ("field" in options || "clear-field" in options) {
    patch.customFields = {
      ...(parseFieldAssignments(optionList(options, "field")) ?? {})
    };
    for (const key of optionList(options, "clear-field") ?? []) {
      patch.customFields[key] = null;
    }
  }
  if (maybeBody !== undefined) {
    patch.body = maybeBody;
  }

  const updated = await updateEntity(rootDir, id, patch);
  console.log(`Updated ${updated.kind} ${updated.frontmatter.id}`);
}

async function handleExecutionCommand(rootDir: string, positionals: string[], options: ParsedOptions): Promise<void> {
  const command = positionals[0];
  const id = positionals[1];
  if (!id) {
    throw new Error(`${command} requires a ticket id`);
  }
  const coordinator = await Coordinator.create(rootDir);

  switch (command) {
    case "claim": {
      const owner = optionString(options, "as");
      if (!owner) {
        throw new Error("claim requires --as <identity>");
      }
      const result = await coordinator.claimTicket(id, owner);
      console.log(`Claimed ${result.ticket.frontmatter.id} as ${result.execution.owner}`);
      return;
    }
    case "start": {
      const owner = optionString(options, "as");
      if (!owner) {
        throw new Error("start requires --as <identity>");
      }
      const mode = options["same-tree"] === true ? "same_tree" : "worktree";
      const result = await coordinator.startTicket(id, { owner, mode });
      const workspace = result.execution.workspacePath ? ` ${result.execution.workspacePath}` : "";
      console.log(`Started ${result.ticket.frontmatter.id} in ${result.execution.mode ?? mode}${workspace}`);
      return;
    }
    case "block": {
      const reason = optionString(options, "reason");
      if (!reason) {
        throw new Error("block requires --reason <text>");
      }
      const result = await coordinator.blockTicket(id, {
        reason,
        dependsOn: optionList(options, "depends-on")
      });
      console.log(`Blocked ${result.ticket.frontmatter.id}`);
      return;
    }
    case "finish": {
      const result = await coordinator.finishTicket(id);
      console.log(`Finished ${result.ticket.frontmatter.id} -> ${result.ticket.frontmatter.status}`);
      return;
    }
    case "release": {
      const result = await coordinator.releaseTicket(id, { force: options.force === true });
      console.log(`Released ${result.ticket.frontmatter.id}`);
      return;
    }
    default:
      throw new Error(`unknown execution command "${command}"`);
  }
}

async function runTUICommand(rootDir: string): Promise<void> {
  const runtime = globalThis as { Bun?: unknown };
  if (runtime.Bun) {
    const { runTUI } = await import("./tui/index.js");
    await runTUI(rootDir);
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn("bun", [process.argv[1], ...process.argv.slice(2)], {
      cwd: rootDir,
      stdio: "inherit"
    });

    child.on("error", (error) => {
      const spawnError = error as NodeJS.ErrnoException;
      if (spawnError.code === "ENOENT") {
        reject(new Error("`agenttasks tui` requires Bun. Install Bun from https://bun.sh or use the non-TUI CLI commands from Node."));
        return;
      }
      reject(new Error(`failed to launch Bun for the TUI: ${spawnError.message}`));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`TUI exited with status ${code ?? 1}`));
    });
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === "--help" || args[0] === "help") {
    printHelp();
    return;
  }

  const { positionals, options } = parseArgs(args);
  const command = positionals[0];
  const rootDir = resolveRootDir(options);

  switch (command) {
    case "init": {
      const starter = optionString(options, "starter");
      if (starter && starter !== "default") {
        throw new Error(`unknown starter "${starter}"`);
      }
      const bare = options["bare"] === true;
      await initProject(rootDir, optionString(options, "name"), {
        withSkills: bare ? false : options["without-skills"] === true ? false : true,
        withAgentGuidance: bare ? false : options["without-agent-guidance"] === true ? false : true
      });
      console.log("Initialized .agent-tasks/");
      return;
    }
    case "validate": {
      const index = await indexProject(rootDir);
      console.log(renderIssues(index));
      if (index.issues.some((issue) => issue.level === "error")) {
        process.exitCode = 1;
      }
      return;
    }
    case "list": {
      const index = await indexProject(rootDir);
      console.log(renderList(index, options));
      return;
    }
    case "show": {
      const id = positionals[1];
      if (!id) {
        throw new Error("show requires an entity id");
      }
      const index = await indexProject(rootDir);
      console.log(renderShow(index, id));
      return;
    }
    case "ready": {
      const index = await indexProject(rootDir);
      console.log(renderReady(index));
      return;
    }
    case "plan": {
      const index = await indexProject(rootDir);
      console.log(renderPlan(index));
      return;
    }
    case "deps": {
      const id = positionals[1];
      if (!id) {
        throw new Error("deps requires a ticket id");
      }
      const index = await indexProject(rootDir);
      console.log(renderDependencies(index, id));
      return;
    }
    case "critical-path": {
      const index = await indexProject(rootDir);
      console.log(renderCriticalPath(index));
      return;
    }
    case "extensions": {
      const coordinator = await Coordinator.create(rootDir);
      const status = await coordinator.status();
      const lines = [
        ...(status.loadedExtensions.length > 0
          ? status.loadedExtensions.map((extension) => `loaded ${extension.id} ${extension.sourcePath}`)
          : ["No extensions loaded"]),
        ...(status.failedExtensions.map((failure) => `failed ${failure.sourcePath}: ${failure.detail}`)),
        ...(status.commands.map((commandInfo) => `command ${commandInfo.name} (${commandInfo.extensionId})${commandInfo.description ? ` - ${commandInfo.description}` : ""}`))
      ];
      console.log(lines.join("\n"));
      return;
    }
    case "hook-runs": {
      const coordinator = await Coordinator.create(rootDir);
      const runs = await coordinator.listHookRuns();
      if (runs.length === 0) {
        console.log("No hook runs recorded");
        return;
      }
      console.log(runs.map((run) => {
        const suffix = run.error?.detail ? ` - ${run.error.detail}` : "";
        return `${run.startedAt} ${run.status} ${run.event} ${run.extensionId}${run.ticketId ? ` ${run.ticketId}` : ""}${suffix}`;
      }).join("\n"));
      return;
    }
    case "claim":
    case "start":
    case "block":
    case "finish":
    case "release": {
      await handleExecutionCommand(rootDir, positionals, options);
      return;
    }
    case "validate-execution": {
      const coordinator = await Coordinator.create(rootDir);
      const issues = await coordinator.validateExecution();
      console.log(issues.length > 0 ? issues.map((issue) => `${issue.level.toUpperCase()} ${issue.code}: ${issue.message}`).join("\n") : "Execution validation OK");
      if (issues.some((issue) => issue.level === "error")) {
        process.exitCode = 1;
      }
      return;
    }
    case "create": {
      await handleCreate(rootDir, positionals, options);
      return;
    }
    case "edit": {
      await handleEdit(rootDir, positionals, options);
      return;
    }
    case "set-status": {
      const id = positionals[1];
      const status = positionals[2];
      if (!id || !status) {
        throw new Error("set-status requires <id> <status>");
      }
      const entity = await setEntityStatus(rootDir, id, status);
      console.log(`Updated ${entity.frontmatter.id} -> ${entity.frontmatter.status}`);
      return;
    }
    case "serve": {
      const port = optionString(options, "port");
      await startCoordinatorServer(rootDir, {
        port: port ? Number(port) : undefined
      });
      return;
    }
    case "mcp": {
      await startMcpServer(rootDir);
      return;
    }
    case "tui": {
      await runTUICommand(rootDir);
      return;
    }
    default:
      throw new Error(`unknown command "${command}"`);
  }
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
