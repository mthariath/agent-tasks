import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { execFile as execFileCb } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { promisify } from "node:util";
import { indexProject } from "@agenttasks/core";

const cliEntry = new URL("../dist/index.js", import.meta.url);
const execFile = promisify(execFileCb);

function runCli(cwd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliEntry.pathname, ...args], { cwd });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

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

function startMcp(cwd) {
  const child = spawn(process.execPath, [cliEntry.pathname, "mcp"], { cwd, stdio: ["pipe", "pipe", "pipe"] });
  child.stdin.setDefaultEncoding("utf8");
  let buffer = "";
  const pending = [];

  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString();

    while (true) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) {
        break;
      }
      const header = buffer.slice(0, headerEnd);
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        buffer = "";
        break;
      }
      const length = Number.parseInt(match[1], 10);
      const start = headerEnd + 4;
      const end = start + length;
      if (buffer.length < end) {
        break;
      }
      const payload = buffer.slice(start, end);
      buffer = buffer.slice(end);
      const message = JSON.parse(payload);
      const resolver = pending.shift();
      if (resolver) {
        resolver(message);
      }
    }
  });

  return {
    child,
    async request(id, method, params) {
      const payload = JSON.stringify({
        jsonrpc: "2.0",
        id,
        method,
        params
      });
      child.stdin.write(`Content-Length: ${Buffer.byteLength(payload, "utf8")}\r\n\r\n${payload}`);
      return new Promise((resolve) => {
        pending.push(resolve);
      });
    },
    async close() {
      child.stdin.end();
      await new Promise((resolve) => {
        const timer = setTimeout(() => {
          child.kill("SIGTERM");
        }, 500);
        child.once("close", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  };
}

const customFieldProjectConfig = `version: 1
name: CLI Test
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

test("init + create + validate work through the CLI", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agenttasks-cli-"));

  let result = await runCli(root, ["init", "--name", "CLI Test"]);
  assert.equal(result.code, 0);

  result = await runCli(root, ["create", "epic", "--title", "Foundations"]);
  assert.equal(result.code, 0);

  result = await runCli(root, ["create", "ticket", "--title", "Build parser", "--status", "ready", "--assigned-to", "codex/main"]);
  assert.equal(result.code, 0);

  let index = await indexProject(root);
  const createdTicket = index.byId.get("T-0001");
  assert.equal(createdTicket?.kind, "ticket");
  assert.equal(createdTicket?.frontmatter.assigned_to, "codex/main");
  assert.equal(createdTicket?.frontmatter.status, "ready");

  result = await runCli(root, ["edit", "T-0001", "--clear-assigned-to"]);
  assert.equal(result.code, 0);

  index = await indexProject(root);
  const updatedTicket = index.byId.get("T-0001");
  assert.equal(updatedTicket?.kind, "ticket");
  assert.equal(updatedTicket?.frontmatter.assigned_to, undefined);

  result = await runCli(root, ["validate"]);
  assert.equal(result.code, 0);

  index = await indexProject(root);
  assert.equal(index.issues.length, 0);

  await rm(root, { recursive: true, force: true });
});

test("init --bare skips repo-local agent guidance and workflow skills", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agenttasks-cli-"));

  const result = await runCli(root, ["init", "--name", "Bare CLI Test", "--bare"]);
  assert.equal(result.code, 0);

  const workflowFile = await readFile(path.join(root, ".agent-tasks", "WORKFLOW.md"), "utf8");
  assert.match(workflowFile, /# Agent Workflow/);
  assert.match(workflowFile, /workflow `end` semantics/);
  await assert.rejects(() => readFile(path.join(root, "AGENTS.md"), "utf8"));
  await assert.rejects(() => readFile(path.join(root, ".agents", "skills", "agent-tasks-default-workflow", "working-tickets", "SKILL.md"), "utf8"));

  await rm(root, { recursive: true, force: true });
});

test("create and edit support configured custom fields through the CLI", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agenttasks-cli-"));

  let result = await runCli(root, ["init", "--name", "CLI Custom Field Test"]);
  assert.equal(result.code, 0);

  await writeFile(path.join(root, ".agent-tasks", "project.yaml"), customFieldProjectConfig, "utf8");

  result = await runCli(root, ["create", "ticket", "--title", "Build parser", "--status", "ready", "--field", "area=frontend", "--field", "estimate=5"]);
  assert.equal(result.code, 0);

  let index = await indexProject(root);
  let ticket = index.byId.get("T-0001");
  assert.equal(ticket?.kind, "ticket");
  assert.equal(ticket?.customFields.area, "frontend");
  assert.equal(ticket?.customFields.estimate, 5);
  assert.equal(ticket?.customFields.qa_required, false);

  result = await runCli(root, ["edit", "T-0001", "--field", "qa_required=true", "--clear-field", "estimate"]);
  assert.equal(result.code, 0);

  index = await indexProject(root);
  ticket = index.byId.get("T-0001");
  assert.equal(ticket?.kind, "ticket");
  assert.equal(ticket?.customFields.qa_required, true);
  assert.equal(ticket?.customFields.estimate, undefined);

  await rm(root, { recursive: true, force: true });
});

test("create, edit, and show support entity references through the CLI", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agenttasks-cli-"));

  let result = await runCli(root, ["init", "--name", "CLI References Test"]);
  assert.equal(result.code, 0);

  await writeFile(path.join(root, "DESIGN.md"), "# Design\n", "utf8");
  await writeFile(path.join(root, "PLANS.md"), "# Plan\n", "utf8");

  result = await runCli(root, ["create", "epic", "--title", "Interop", "--reference", "PLANS.md"]);
  assert.equal(result.code, 0);

  result = await runCli(root, ["create", "ticket", "--title", "Wire references", "--reference", "DESIGN.md", "--reference", "PLANS.md"]);
  assert.equal(result.code, 0);

  let index = await indexProject(root);
  let ticket = index.byId.get("T-0001");
  assert.equal(ticket?.kind, "ticket");
  assert.deepEqual(ticket?.frontmatter.references, ["DESIGN.md", "PLANS.md"]);

  result = await runCli(root, ["edit", "T-0001", "--reference", "PLANS.md"]);
  assert.equal(result.code, 0);

  index = await indexProject(root);
  ticket = index.byId.get("T-0001");
  assert.equal(ticket?.kind, "ticket");
  assert.deepEqual(ticket?.frontmatter.references, ["PLANS.md"]);

  result = await runCli(root, ["show", "T-0001"]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /references: PLANS\.md/);

  result = await runCli(root, ["edit", "T-0001", "--clear-references"]);
  assert.equal(result.code, 0);

  index = await indexProject(root);
  ticket = index.byId.get("T-0001");
  assert.equal(ticket?.kind, "ticket");
  assert.equal(ticket?.frontmatter.references, undefined);

  await rm(root, { recursive: true, force: true });
});

test("planning commands expose ready work and dependency analysis", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agenttasks-cli-"));

  let result = await runCli(root, ["init", "--name", "CLI Planning Test"]);
  assert.equal(result.code, 0);

  result = await runCli(root, ["create", "ticket", "--title", "A", "--status", "ready"]);
  assert.equal(result.code, 0);
  result = await runCli(root, ["create", "ticket", "--title", "B", "--status", "ready", "--depends-on", "T-0001"]);
  assert.equal(result.code, 0);
  result = await runCli(root, ["create", "ticket", "--title", "C", "--status", "ready", "--depends-on", "T-0002"]);
  assert.equal(result.code, 0);

  result = await runCli(root, ["ready"]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /T-0001/);
  assert.doesNotMatch(result.stdout, /T-0002/);

  result = await runCli(root, ["deps", "T-0002"]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /unsatisfied: T-0001/);

  result = await runCli(root, ["plan"]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /Ready Now/);
  assert.match(result.stdout, /Waves/);
  assert.match(result.stdout, /Critical Path/);

  result = await runCli(root, ["critical-path"]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /T-0001 A/);
  assert.match(result.stdout, /T-0002 B/);
  assert.match(result.stdout, /T-0003 C/);

  await rm(root, { recursive: true, force: true });
});

test("execution commands claim, start, finish, release, and validate runtime state", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agenttasks-cli-"));

  let result = await runCli(root, ["init", "--name", "CLI Execution Test"]);
  assert.equal(result.code, 0);
  await initGitRepo(root);

  result = await runCli(root, ["create", "ticket", "--title", "Parallel implementation", "--status", "ready"]);
  assert.equal(result.code, 0);

  result = await runCli(root, ["claim", "T-0001", "--as", "codex/main"]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /Claimed T-0001 as codex\/main/);

  result = await runCli(root, ["start", "T-0001", "--as", "codex/main"]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /Started T-0001 in worktree/);

  let index = await indexProject(root);
  assert.equal(index.execution.byTicket.get("T-0001")?.phase, "started");
  assert.equal(index.execution.byTicket.get("T-0001")?.mode, "worktree");
  assert.ok(index.execution.byTicket.get("T-0001")?.workspacePath);

  result = await runCli(root, ["finish", "T-0001"]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /Finished T-0001 -> in_review/);

  index = await indexProject(root);
  assert.equal(index.byId.get("T-0001")?.frontmatter.status, "in_review");

  result = await runCli(root, ["validate-execution"]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /Execution validation OK/);

  result = await runCli(root, ["release", "T-0001"]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /Released T-0001/);

  index = await indexProject(root);
  assert.equal(index.execution.byTicket.get("T-0001")?.phase, undefined);

  await rm(root, { recursive: true, force: true });
});

test("extensions can block start and persist hook runs", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agenttasks-cli-"));

  let result = await runCli(root, ["init", "--name", "CLI Extensions Test"]);
  assert.equal(result.code, 0);
  await initGitRepo(root);

  await writeFile(
    path.join(root, ".agent-tasks", "extensions", "guard-start.ts"),
    `import { defineExtension } from "./api";

export default defineExtension({
  id: "guard-start",
  setup(api) {
    api.on("before_start", async ({ payload, block }) => {
      return block(\`blocked \${String(payload.ticketId)}\`, "start_blocked_by_extension");
    });
  }
});
`,
    "utf8"
  );

  result = await runCli(root, ["create", "ticket", "--title", "Guarded ticket", "--status", "ready"]);
  assert.equal(result.code, 0);

  result = await runCli(root, ["claim", "T-0001", "--as", "codex/main"]);
  assert.equal(result.code, 0);

  result = await runCli(root, ["start", "T-0001", "--as", "codex/main"]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /blocked T-0001/);

  result = await runCli(root, ["extensions"]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /loaded guard-start/);

  result = await runCli(root, ["hook-runs"]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /blocked before_start guard-start T-0001/);

  await rm(root, { recursive: true, force: true });
});

test("after hooks share the same coordinator path for mcp execution writes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agenttasks-cli-"));
  let result = await runCli(root, ["init", "--name", "CLI MCP Hook Test"]);
  assert.equal(result.code, 0);

  await writeFile(
    path.join(root, ".agent-tasks", "extensions", "fail-finish.ts"),
    `import { defineExtension } from "./api";

export default defineExtension({
  id: "fail-finish",
  setup(api) {
    api.on("after_finish", async () => {
      throw new Error("finish follow-up failed");
    });
  }
});
`,
    "utf8"
  );

  const mcp = startMcp(root);
  await mcp.request(1, "initialize", {});

  let created = await mcp.request(2, "tools/call", {
    name: "create_ticket",
    arguments: {
      title: "MCP finish ticket",
      status: "ready"
    }
  });
  assert.equal(created.result.structuredContent.id, "T-0001");

  await initGitRepo(root);

  await mcp.request(3, "tools/call", {
    name: "claim_ticket",
    arguments: { id: "T-0001", owner: "codex/main" }
  });
  await mcp.request(4, "tools/call", {
    name: "start_ticket",
    arguments: { id: "T-0001", owner: "codex/main" }
  });
  const finished = await mcp.request(5, "tools/call", {
    name: "finish_ticket",
    arguments: { id: "T-0001" }
  });
  assert.equal(finished.result.structuredContent.ticket.frontmatter.status, "in_review");

  result = await runCli(root, ["hook-runs"]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /failed after_finish fail-finish T-0001 - finish follow-up failed/);

  await mcp.close();
  await rm(root, { recursive: true, force: true });
});

test("mcp exposes planning reads and safe write tools", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agenttasks-cli-"));
  let result = await runCli(root, ["init", "--name", "CLI MCP Test"]);
  assert.equal(result.code, 0);

  const mcp = startMcp(root);

  const init = await mcp.request(1, "initialize", {});
  assert.equal(init.result.serverInfo.name, "agenttasks");

  const tools = await mcp.request(2, "tools/list", {});
  assert.ok(tools.result.tools.some((tool) => tool.name === "parallel_plan"));

  const created = await mcp.request(3, "tools/call", {
    name: "create_ticket",
    arguments: {
      title: "MCP ticket",
      status: "ready"
    }
  });
  assert.equal(created.result.structuredContent.id, "T-0001");

  const ready = await mcp.request(4, "tools/call", {
    name: "ready_tickets",
    arguments: {}
  });
  assert.equal(ready.result.structuredContent.tickets[0].id, "T-0001");

  await initGitRepo(root);

  const claimed = await mcp.request(5, "tools/call", {
    name: "claim_ticket",
    arguments: {
      id: "T-0001",
      owner: "codex/main"
    }
  });
  assert.equal(claimed.result.structuredContent.execution.owner, "codex/main");

  const started = await mcp.request(6, "tools/call", {
    name: "start_ticket",
    arguments: {
      id: "T-0001",
      owner: "codex/main"
    }
  });
  assert.equal(started.result.structuredContent.execution.phase, "started");

  const executionStatus = await mcp.request(7, "tools/call", {
    name: "execution_status",
    arguments: {}
  });
  assert.equal(executionStatus.result.structuredContent.tickets[0].phase, "started");

  await mcp.close();
  await rm(root, { recursive: true, force: true });
});
