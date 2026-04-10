import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { execFile as execFileCb } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";

import {
  blockTicket,
  claimTicket,
  createEpic,
  createTicket,
  finishTicket,
  indexProject,
  initProject,
  releaseTicket,
  setEntityStatus,
  startTicket,
  updateEntity
} from "../dist/index.js";

const customFieldProjectConfig = `version: 1
name: Custom Fields Test
workflow:
  name: default
  statuses:
    - backlog
    - ready
    - in_progress
    - blocked
    - in_review
    - done
  transitions:
    backlog:
      - ready
      - blocked
    ready:
      - in_progress
      - blocked
    in_progress:
      - in_review
      - blocked
      - ready
    blocked:
      - ready
      - in_progress
    in_review:
      - done
      - in_progress
    done: []
id_prefixes:
  ticket: T
  epic: E
fields:
  ticket:
    - key: area
      label: Area
      type: enum
      required: true
      options:
        - frontend
        - backend
    - key: qa_required
      type: boolean
      default: false
    - key: estimate
      type: number
`;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const execFile = promisify(execFileCb);

async function run(command, args, cwd) {
  const result = await execFile(command, args, { cwd });
  return result.stdout.trim();
}

async function initGitRepo(root) {
  await run("git", ["init", "-b", "main"], root);
  await run("git", ["config", "user.name", "Agent Tasks Test"], root);
  await run("git", ["config", "user.email", "agenttasks@example.com"], root);
  await writeFile(path.join(root, "README.test.md"), "seed\n", "utf8");
  await run("git", ["add", "."], root);
  await run("git", ["commit", "-m", "init"], root);
}

test("initProject creates a usable .agent-tasks directory", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agenttasks-core-"));
  await initProject(root, "Spec Test");

  const projectFile = await readFile(path.join(root, ".agent-tasks", "project.yaml"), "utf8");
  assert.match(projectFile, /name: Spec Test/);
  const workflowFile = await readFile(path.join(root, ".agent-tasks", "WORKFLOW.md"), "utf8");
  assert.match(workflowFile, /# Agent Workflow/);
  assert.match(workflowFile, /confirm whether it is actually ready/);
  assert.match(workflowFile, /agenttasks mcp/);
  assert.match(workflowFile, /Coordinator and Extensions/);
  assert.match(workflowFile, /agenttasks serve/);
  const sourceWorkflow = await readFile(path.join(repoRoot, "templates", "default", ".agent-tasks", "WORKFLOW.md"), "utf8");
  assert.equal(workflowFile.trim(), sourceWorkflow.trim());
  const agentsFile = await readFile(path.join(root, "AGENTS.md"), "utf8");
  assert.match(agentsFile, /agenttasks:managed:start/);
  assert.match(agentsFile, /Prefer tickets that are actually ready/);
  assert.match(agentsFile, /extensions\/README\.md/);
  assert.match(agentsFile, /coordinator-backed execution/);
  const sourceAgentsBlock = await readFile(path.join(repoRoot, "templates", "default", "AGENTS.block.md"), "utf8");
  assert.equal(agentsFile.trim(), sourceAgentsBlock.trim());
  const gitignoreFile = await readFile(path.join(root, ".gitignore"), "utf8");
  assert.match(gitignoreFile, /agenttasks:managed:start/);
  assert.match(gitignoreFile, /\.agent-tasks\/\.runtime\//);
  const workingSkill = await readFile(
    path.join(root, ".agents", "skills", "agent-tasks-default-workflow", "working-tickets", "SKILL.md"),
    "utf8"
  );
  assert.match(workingSkill, /name: working-tickets/);
  assert.match(workingSkill, /Check whether the ticket is actually ready/);
  assert.match(workingSkill, /extensions\/README\.md/);
  assert.match(workingSkill, /coordinator-backed execution/);
  const sourceWorkingSkill = await readFile(path.join(repoRoot, "skills", "default-workflow", "working-tickets", "SKILL.md"), "utf8");
  assert.equal(workingSkill.trim(), sourceWorkingSkill.trim());
  const extensionsReadme = await readFile(path.join(root, ".agent-tasks", "extensions", "README.md"), "utf8");
  assert.match(extensionsReadme, /Project-local coordinator extensions/);
  const extensionApi = await readFile(path.join(root, ".agent-tasks", "extensions", "api.ts"), "utf8");
  assert.match(extensionApi, /defineExtension/);
  const reviewQueueExample = await readFile(path.join(root, ".agent-tasks", "extensions", "examples", "review-queue.ts.example"), "utf8");
  assert.match(reviewQueueExample, /review_requested/);

  const index = await indexProject(root);
  assert.equal(index.config.name, "Spec Test");
  await rm(root, { recursive: true, force: true });
});

test("initProject supports bare setup without skills or agent guidance", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agenttasks-core-"));
  await initProject(root, "Bare Test", {
    withSkills: false,
    withAgentGuidance: false
  });

  const workflowFile = await readFile(path.join(root, ".agent-tasks", "WORKFLOW.md"), "utf8");
  assert.match(workflowFile, /# Agent Workflow/);
  const extensionsReadme = await readFile(path.join(root, ".agent-tasks", "extensions", "README.md"), "utf8");
  assert.match(extensionsReadme, /Project-local coordinator extensions/);
  await assert.rejects(() => readFile(path.join(root, "AGENTS.md"), "utf8"));
  await assert.rejects(() => readFile(path.join(root, ".agents", "skills", "agent-tasks-default-workflow", "working-tickets", "SKILL.md"), "utf8"));

  await rm(root, { recursive: true, force: true });
});

test("initProject appends and updates only the managed AGENTS.md block", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agenttasks-core-"));
  const agentsPath = path.join(root, "AGENTS.md");
  await writeFile(agentsPath, "# Existing Rules\n\nDo not touch this.\n", "utf8");

  await initProject(root, "Merge Test");
  let agentsFile = await readFile(agentsPath, "utf8");
  assert.match(agentsFile, /# Existing Rules/);
  assert.match(agentsFile, /agenttasks:managed:start/);

  const updatedFile = agentsFile.replace(
    /<!-- agenttasks:managed:start -->[\s\S]*?<!-- agenttasks:managed:end -->/,
    "<!-- agenttasks:managed:start -->\nOLD BLOCK\n<!-- agenttasks:managed:end -->"
  );
  await writeFile(agentsPath, updatedFile, "utf8");

  await initProject(root, "Merge Test");
  agentsFile = await readFile(agentsPath, "utf8");
  assert.match(agentsFile, /# Existing Rules/);
  assert.doesNotMatch(agentsFile, /OLD BLOCK/);
  assert.match(agentsFile, /Use the installed `agent-tasks` workflow skills/);
  assert.match(agentsFile, /extensions\/README\.md/);

  await rm(root, { recursive: true, force: true });
});

test("initProject appends and updates only the managed .gitignore block", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agenttasks-core-"));
  const gitignoreFile = path.join(root, ".gitignore");
  await writeFile(gitignoreFile, "node_modules\ncoverage\n", "utf8");

  await initProject(root, "Ignore Test");
  let contents = await readFile(gitignoreFile, "utf8");
  assert.match(contents, /^node_modules/m);
  assert.match(contents, /# agenttasks:managed:start/);
  assert.match(contents, /\.agent-tasks\/\.runtime\//);

  await writeFile(
    gitignoreFile,
    contents.replace(
      /# agenttasks:managed:start[\s\S]*?# agenttasks:managed:end/,
      "# agenttasks:managed:start\nOLD BLOCK\n# agenttasks:managed:end"
    ),
    "utf8"
  );

  await initProject(root, "Ignore Test");
  contents = await readFile(gitignoreFile, "utf8");
  assert.match(contents, /^node_modules/m);
  assert.doesNotMatch(contents, /OLD BLOCK/);
  assert.match(contents, /\.agent-tasks\/\.runtime\//);

  await rm(root, { recursive: true, force: true });
});

test("createTicket and createEpic create indexed entities", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agenttasks-core-"));
  await initProject(root, "Spec Test");
  await writeFile(path.join(root, "DESIGN.md"), "# Design\n", "utf8");
  await writeFile(path.join(root, "PLANS.md"), "# Plan\n", "utf8");

  const epic = await createEpic(root, { title: "Foundations", status: "backlog", references: ["PLANS.md"] });
  const ticket = await createTicket(root, {
    title: "Write parser",
    status: "ready",
    epic: epic.frontmatter.id,
    assigned_to: "codex/main",
    depends_on: [],
    references: ["DESIGN.md", "PLANS.md"]
  });

  const index = await indexProject(root);
  assert.equal(index.epics.length, 1);
  assert.equal(index.tickets.length, 1);
  assert.equal(index.tickets[0].frontmatter.epic, epic.frontmatter.id);
  assert.equal(index.tickets[0].frontmatter.assigned_to, "codex/main");
  assert.deepEqual(index.tickets[0].frontmatter.references, ["DESIGN.md", "PLANS.md"]);
  assert.deepEqual(index.epics[0].frontmatter.references, ["PLANS.md"]);
  assert.equal(ticket.frontmatter.id, "T-0001");
  assert.deepEqual(index.planning.endStatuses, ["done"]);
  await rm(root, { recursive: true, force: true });
});

test("references must stay repo-relative and point at existing files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agenttasks-core-"));
  await initProject(root, "References Test");
  await writeFile(path.join(root, "DESIGN.md"), "# Design\n", "utf8");

  const ticket = await createTicket(root, {
    title: "Use design context",
    status: "ready",
    references: ["DESIGN.md"]
  });
  assert.deepEqual(ticket.frontmatter.references, ["DESIGN.md"]);

  await assert.rejects(
    () => createTicket(root, { title: "Bad reference", references: ["/tmp/nope.md"] }),
    /absolute reference/
  );
  await assert.rejects(
    () => updateEntity(root, ticket.frontmatter.id, { references: ["../outside.md"] }),
    /outside the repo/
  );
  await assert.rejects(
    () => updateEntity(root, ticket.frontmatter.id, { references: ["docs/missing-plan.md"] }),
    /missing file/
  );

  await rm(root, { recursive: true, force: true });
});

test("planning marks ready tickets, waves, blockers, and critical path", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agenttasks-core-"));
  await initProject(root, "Planning Test");

  const a = await createTicket(root, { title: "A", status: "ready" });
  const b = await createTicket(root, { title: "B", status: "ready", depends_on: [a.frontmatter.id] });
  const c = await createTicket(root, { title: "C", status: "ready", depends_on: [a.frontmatter.id] });
  const d = await createTicket(root, { title: "D", status: "ready", depends_on: [b.frontmatter.id] });

  const index = await indexProject(root);
  assert.deepEqual(index.planning.readyIds, [a.frontmatter.id]);
  assert.deepEqual(index.planning.waves.map((wave) => wave.ticketIds), [
    [a.frontmatter.id],
    [b.frontmatter.id, c.frontmatter.id],
    [d.frontmatter.id]
  ]);
  assert.deepEqual(index.planning.byTicket.get(a.frontmatter.id)?.unblocks, [b.frontmatter.id, c.frontmatter.id]);
  assert.deepEqual(index.planning.criticalPathIds, [a.frontmatter.id, b.frontmatter.id, d.frontmatter.id]);

  await rm(root, { recursive: true, force: true });
});

test("execution lifecycle claims, starts in a worktree, blocks, finishes, and releases", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agenttasks-core-"));
  await initProject(root, "Execution Test");
  await initGitRepo(root);

  const ticket = await createTicket(root, { title: "Implement execution", status: "ready" });

  let result = await claimTicket(root, ticket.frontmatter.id, { owner: "codex/main" });
  assert.equal(result.execution.owner, "codex/main");
  assert.equal(result.execution.phase, "claimed");

  result = await startTicket(root, ticket.frontmatter.id, { owner: "codex/main", mode: "worktree" });
  assert.equal(result.execution.phase, "started");
  assert.equal(result.execution.mode, "worktree");
  assert.ok(result.execution.workspaceBranch?.startsWith(`ticket/${ticket.frontmatter.id}-`));
  assert.match(result.execution.workspacePath ?? "", new RegExp(`\\.worktrees/.+/${ticket.frontmatter.id}$`));

  let index = await indexProject(root);
  let current = index.byId.get(ticket.frontmatter.id);
  assert.equal(current?.kind, "ticket");
  assert.equal(current?.frontmatter.status, "in_progress");
  assert.equal(index.execution.byTicket.get(ticket.frontmatter.id)?.phase, "started");

  result = await blockTicket(root, ticket.frontmatter.id, { reason: "waiting on API contract" });
  assert.equal(result.execution.phase, "blocked");

  index = await indexProject(root);
  current = index.byId.get(ticket.frontmatter.id);
  assert.equal(current?.kind, "ticket");
  assert.equal(current?.frontmatter.status, "blocked");
  assert.match(current?.body ?? "", /Execution Blocker/);

  await setEntityStatus(root, ticket.frontmatter.id, "ready");
  await setEntityStatus(root, ticket.frontmatter.id, "in_progress");
  result = await finishTicket(root, ticket.frontmatter.id);
  assert.equal(result.execution.phase, "finished");
  assert.equal(result.execution.reviewStatus, "in_review");

  index = await indexProject(root);
  current = index.byId.get(ticket.frontmatter.id);
  assert.equal(current?.kind, "ticket");
  assert.equal(current?.frontmatter.status, "in_review");
  assert.match(current?.body ?? "", /Execution Handoff/);

  result = await releaseTicket(root, ticket.frontmatter.id);
  assert.equal(result.execution.phase, undefined);

  index = await indexProject(root);
  assert.equal(index.execution.byTicket.get(ticket.frontmatter.id)?.phase, undefined);

  await rm(root, { recursive: true, force: true });
});

test("setEntityStatus enforces workflow transitions", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agenttasks-core-"));
  await initProject(root, "Spec Test");
  const ticket = await createTicket(root, { title: "Write parser", status: "ready" });

  await setEntityStatus(root, ticket.frontmatter.id, "in_progress");
  await assert.rejects(
    () => setEntityStatus(root, ticket.frontmatter.id, "done"),
    /not allowed/
  );

  await rm(root, { recursive: true, force: true });
});

test("updateEntity preserves body while changing fields", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agenttasks-core-"));
  await initProject(root, "Spec Test");
  const ticket = await createTicket(root, {
    title: "Write parser",
    status: "ready",
    body: "## Notes\n\nCustom body"
  });

  await updateEntity(root, ticket.frontmatter.id, { priority: "high" });
  const index = await indexProject(root);
  assert.equal(index.tickets[0].frontmatter.priority, "high");
  assert.equal(index.tickets[0].body.trim(), "## Notes\n\nCustom body");
  await rm(root, { recursive: true, force: true });
});

test("updateEntity can set and clear assigned_to on tickets only", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agenttasks-core-"));
  await initProject(root, "Spec Test");
  const ticket = await createTicket(root, {
    title: "Write parser",
    status: "ready"
  });
  const epic = await createEpic(root, { title: "Foundations", status: "backlog" });

  await updateEntity(root, ticket.frontmatter.id, { assigned_to: "pi/refiner" });
  let index = await indexProject(root);
  assert.equal(index.tickets[0].frontmatter.assigned_to, "pi/refiner");

  await updateEntity(root, ticket.frontmatter.id, { assigned_to: null });
  index = await indexProject(root);
  assert.equal(index.tickets[0].frontmatter.assigned_to, undefined);

  await assert.rejects(
    () => updateEntity(root, epic.frontmatter.id, { assigned_to: "codex/main" }),
    /ticket-only fields/
  );

  await rm(root, { recursive: true, force: true });
});

test("createTicket and updateEntity reject invalid dependencies before writing", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agenttasks-core-"));
  await initProject(root, "Dependency Validation Test");
  const epic = await createEpic(root, { title: "Foundations", status: "backlog" });
  const a = await createTicket(root, { title: "A", status: "ready" });
  const b = await createTicket(root, { title: "B", status: "ready", depends_on: [a.frontmatter.id] });

  await assert.rejects(
    () => createTicket(root, { title: "Broken", status: "ready", depends_on: ["T-9999"] }),
    /depends on missing id/
  );
  await assert.rejects(
    () => createTicket(root, { title: "Broken", status: "ready", depends_on: [epic.frontmatter.id] }),
    /depends on non-ticket id/
  );
  await assert.rejects(
    () => updateEntity(root, a.frontmatter.id, { depends_on: [b.frontmatter.id] }),
    /dependency cycle detected/
  );

  const index = await indexProject(root);
  assert.equal(index.issues.length, 0);

  await rm(root, { recursive: true, force: true });
});

test("custom ticket fields are created, validated, and updated", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agenttasks-core-"));
  await initProject(root, "Custom Fields Test");
  await writeFile(path.join(root, ".agent-tasks", "project.yaml"), customFieldProjectConfig, "utf8");

  const ticket = await createTicket(root, {
    title: "Wire custom fields",
    status: "ready",
    customFields: {
      area: "frontend",
      estimate: "3"
    }
  });

  assert.equal(ticket.customFields.area, "frontend");
  assert.equal(ticket.customFields.estimate, 3);
  assert.equal(ticket.customFields.qa_required, false);

  await updateEntity(root, ticket.frontmatter.id, {
    customFields: {
      qa_required: "true",
      estimate: null
    }
  });

  const index = await indexProject(root);
  assert.equal(index.issues.length, 0);
  assert.equal(index.tickets[0].customFields.area, "frontend");
  assert.equal(index.tickets[0].customFields.qa_required, true);
  assert.equal(index.tickets[0].customFields.estimate, undefined);

  const ticketFile = await readFile(path.join(root, ".agent-tasks", "tickets", "T-0001.md"), "utf8");
  assert.match(ticketFile, /area: frontend/);
  assert.match(ticketFile, /qa_required: true/);
  assert.doesNotMatch(ticketFile, /estimate:/);

  await rm(root, { recursive: true, force: true });
});
