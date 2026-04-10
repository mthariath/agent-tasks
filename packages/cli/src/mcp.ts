import {
  createEpic,
  createTicket,
  indexProject,
  setEntityStatus,
  updateEntity
} from "@agenttasks/core";
import type { EpicCreateInput, EntityPatch, ProjectIndex, TicketCreateInput } from "@agenttasks/core";
import { Coordinator } from "./coordinator.js";

const SERVER_INFO = {
  name: "agenttasks",
  version: "0.1.0"
};

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

function writeMessage(message: unknown): void {
  const payload = JSON.stringify(message);
  const header = `Content-Length: ${Buffer.byteLength(payload, "utf8")}\r\n\r\n`;
  process.stdout.write(header);
  process.stdout.write(payload);
}

function writeResult(id: string | number | null | undefined, result: unknown): void {
  if (id === undefined) {
    return;
  }
  writeMessage({
    jsonrpc: "2.0",
    id,
    result
  });
}

function writeError(id: string | number | null | undefined, code: number, message: string): void {
  if (id === undefined) {
    return;
  }
  writeMessage({
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message
    }
  });
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`"${field}" must be a non-empty string`);
  }
  return value;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asStringList(value: unknown, field: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`"${field}" must be an array of strings`);
  }
  return value;
}

function asRecord(value: unknown, field: string): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`"${field}" must be an object`);
  }
  return value as Record<string, unknown>;
}

function renderToolResult(result: unknown): { content: Array<{ type: "text"; text: string }>; structuredContent: unknown } {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2)
      }
    ],
    structuredContent: result
  };
}

function summarizeProject(index: ProjectIndex): Record<string, unknown> {
  return {
    name: index.config.name,
    rootDir: index.rootDir,
    tickets: index.tickets.length,
    epics: index.epics.length,
    issues: index.issues.length,
    workflow: {
      statuses: index.config.workflow.statuses,
      start: index.config.workflow.start,
      end: index.planning.endStatuses
    },
    planning: {
      ready: index.planning.readyIds.length,
      active: index.planning.activeIds.length,
      blocked: index.planning.blockedIds.length,
      criticalPath: index.planning.criticalPathIds
    }
  };
}

function getEntityPayload(index: ProjectIndex, id: string): Record<string, unknown> {
  const entity = index.byId.get(id);
  if (!entity) {
    throw new Error(`entity "${id}" not found`);
  }

  const base = {
    id: entity.frontmatter.id,
    kind: entity.kind,
    title: entity.frontmatter.title,
    status: entity.frontmatter.status,
    labels: entity.frontmatter.labels ?? [],
    references: entity.frontmatter.references ?? [],
    body: entity.body
  };

  if (entity.kind === "epic") {
    return {
      ...base,
      priority: entity.frontmatter.priority,
      rollup: {
        statusCounts: index.config.workflow.statuses.map((status) => ({
          status,
          count: index.tickets.filter((ticket) => ticket.frontmatter.epic === entity.frontmatter.id && ticket.frontmatter.status === status).length
        }))
      }
    };
  }

  const planning = index.planning.byTicket.get(id);
  return {
    ...base,
    epic: entity.frontmatter.epic,
    kindLabel: entity.frontmatter.kind,
    priority: entity.frontmatter.priority,
    assigned_to: entity.frontmatter.assigned_to,
    depends_on: entity.frontmatter.depends_on ?? [],
    references: entity.frontmatter.references ?? [],
    points: entity.frontmatter.points,
    customFields: entity.customFields,
    planning: {
      ready: planning?.ready ?? false,
      active: planning?.active ?? false,
      blocked: planning?.blocked ?? false,
      ended: planning?.ended ?? false,
      wave: planning?.wave,
      satisfiedDependencies: planning?.satisfiedDependencies ?? [],
      unsatisfiedDependencies: planning?.unsatisfiedDependencies ?? [],
      unblocks: planning?.unblocks ?? []
    },
    reverseDependencies: index.reverseDependencies.get(id) ?? []
  };
}

function listTicketsPayload(index: ProjectIndex, args: Record<string, unknown>): Record<string, unknown> {
  const status = asOptionalString(args.status);
  const epic = asOptionalString(args.epic);
  const assignedTo = asOptionalString(args.assigned_to);
  const readyOnly = args.ready === true;

  const tickets = index.tickets.filter((ticket) => {
    if (status && ticket.frontmatter.status !== status) {
      return false;
    }
    if (epic && ticket.frontmatter.epic !== epic) {
      return false;
    }
    if (assignedTo && ticket.frontmatter.assigned_to !== assignedTo) {
      return false;
    }
    if (readyOnly && !index.planning.readyIds.includes(ticket.frontmatter.id)) {
      return false;
    }
    return true;
  }).map((ticket) => ({
    id: ticket.frontmatter.id,
    title: ticket.frontmatter.title,
    status: ticket.frontmatter.status,
    epic: ticket.frontmatter.epic,
    assigned_to: ticket.frontmatter.assigned_to,
    depends_on: ticket.frontmatter.depends_on ?? [],
    references: ticket.frontmatter.references ?? [],
    ready: index.planning.byTicket.get(ticket.frontmatter.id)?.ready ?? false,
    wave: index.planning.byTicket.get(ticket.frontmatter.id)?.wave ?? null
  }));

  return { tickets };
}

function planningPayload(index: ProjectIndex): Record<string, unknown> {
  return {
    readyIds: index.planning.readyIds,
    waves: index.planning.waves,
    blockers: index.planning.blockingTickets,
    criticalPathIds: index.planning.criticalPathIds
  };
}

function executionPayload(index: ProjectIndex): Record<string, unknown> {
  return {
    tickets: [...index.execution.byTicket.values()],
    workspaces: index.execution.workspaces,
    server: index.execution.server ?? null,
    issues: index.issues.filter((issue) => issue.code.startsWith("execution."))
  };
}

const TOOLS: McpToolDefinition[] = [
  {
    name: "project_summary",
    description: "Get a project-level summary including workflow semantics and planning counts.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "list_tickets",
    description: "List tickets, optionally filtered by status, epic, assignee, or readiness.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string" },
        epic: { type: "string" },
        assigned_to: { type: "string" },
        ready: { type: "boolean" }
      },
      additionalProperties: false
    }
  },
  {
    name: "get_entity",
    description: "Get full detail for a ticket or epic by id.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" }
      },
      required: ["id"],
      additionalProperties: false
    }
  },
  {
    name: "ready_tickets",
    description: "Get the tickets that are ready to work right now.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "dependency_analysis",
    description: "Get dependency, blocker, and unblocker details for a ticket.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" }
      },
      required: ["id"],
      additionalProperties: false
    }
  },
  {
    name: "parallel_plan",
    description: "Get advisory execution waves, blocker counts, and ready tickets.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "critical_path",
    description: "Get the current advisory critical path through unfinished work.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "execution_status",
    description: "Get current execution claims, phases, workspaces, and execution issues.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "active_workspaces",
    description: "List active workspaces tracked by the local execution runtime.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "create_ticket",
    description: "Create a ticket with validated workflow fields and dependencies.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        status: { type: "string" },
        epic: { type: "string" },
        kind: { type: "string" },
        priority: { type: "string" },
        assigned_to: { type: "string" },
        depends_on: { type: "array", items: { type: "string" } },
        references: { type: "array", items: { type: "string" } },
        labels: { type: "array", items: { type: "string" } },
        body: { type: "string" },
        customFields: { type: "object" }
      },
      required: ["title"],
      additionalProperties: false
    }
  },
  {
    name: "create_epic",
    description: "Create an epic.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        status: { type: "string" },
        priority: { type: "string" },
        references: { type: "array", items: { type: "string" } },
        labels: { type: "array", items: { type: "string" } },
        body: { type: "string" }
      },
      required: ["title"],
      additionalProperties: false
    }
  },
  {
    name: "claim_ticket",
    description: "Claim a ticket exclusively for coding work.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        owner: { type: "string" }
      },
      required: ["id", "owner"],
      additionalProperties: false
    }
  },
  {
    name: "start_ticket",
    description: "Start a claimed ticket and create a same-tree or worktree execution workspace.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        owner: { type: "string" },
        mode: { type: "string", enum: ["same_tree", "worktree"] }
      },
      required: ["id", "owner"],
      additionalProperties: false
    }
  },
  {
    name: "block_ticket",
    description: "Mark a claimed ticket blocked and optionally add prerequisite dependencies.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        reason: { type: "string" },
        dependsOn: { type: "array", items: { type: "string" } }
      },
      required: ["id", "reason"],
      additionalProperties: false
    }
  },
  {
    name: "finish_ticket",
    description: "Mark a started or blocked ticket ready for review/integration.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" }
      },
      required: ["id"],
      additionalProperties: false
    }
  },
  {
    name: "release_ticket",
    description: "Release execution runtime state for a ticket.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        force: { type: "boolean" }
      },
      required: ["id"],
      additionalProperties: false
    }
  },
  {
    name: "set_references",
    description: "Replace a ticket or epic reference list with validated repo-relative file paths.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        references: { type: "array", items: { type: "string" } }
      },
      required: ["id", "references"],
      additionalProperties: false
    }
  },
  {
    name: "set_status",
    description: "Set entity status through validated workflow transitions.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        status: { type: "string" }
      },
      required: ["id", "status"],
      additionalProperties: false
    }
  },
  {
    name: "assign_ticket",
    description: "Assign a ticket to an identity string.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        assigned_to: { type: "string" }
      },
      required: ["id", "assigned_to"],
      additionalProperties: false
    }
  },
  {
    name: "clear_assignee",
    description: "Clear the assignee for a ticket.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" }
      },
      required: ["id"],
      additionalProperties: false
    }
  },
  {
    name: "update_ticket_dependencies",
    description: "Replace a ticket's dependency list with validated ticket ids.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        depends_on: { type: "array", items: { type: "string" } }
      },
      required: ["id", "depends_on"],
      additionalProperties: false
    }
  }
];

async function handleToolCall(rootDir: string, name: string, args: Record<string, unknown>): Promise<unknown> {
  const index = await indexProject(rootDir);
  const coordinator = await Coordinator.create(rootDir);

  switch (name) {
    case "project_summary":
      return renderToolResult(summarizeProject(index));
    case "list_tickets":
      return renderToolResult(listTicketsPayload(index, args));
    case "get_entity":
      return renderToolResult(getEntityPayload(index, asString(args.id, "id")));
    case "ready_tickets":
      return renderToolResult({
        tickets: index.planning.readyIds.map((ticketId) => getEntityPayload(index, ticketId))
      });
    case "dependency_analysis":
      return renderToolResult(getEntityPayload(index, asString(args.id, "id")));
    case "parallel_plan":
      return renderToolResult(planningPayload(index));
    case "critical_path":
      return renderToolResult({
        criticalPathIds: index.planning.criticalPathIds,
        tickets: index.planning.criticalPathIds.map((ticketId) => getEntityPayload(index, ticketId))
      });
    case "execution_status":
      return renderToolResult(executionPayload(index));
    case "active_workspaces":
      return renderToolResult({ workspaces: index.execution.workspaces });
    case "create_ticket": {
      const ticket = await createTicket(rootDir, {
        title: asString(args.title, "title"),
        status: asOptionalString(args.status),
        epic: asOptionalString(args.epic),
        kind: asOptionalString(args.kind),
        priority: asOptionalString(args.priority),
        assigned_to: asOptionalString(args.assigned_to),
        depends_on: asStringList(args.depends_on, "depends_on"),
        references: asStringList(args.references, "references"),
        labels: asStringList(args.labels, "labels"),
        body: asOptionalString(args.body),
        customFields: asRecord(args.customFields, "customFields")
      } satisfies TicketCreateInput);
      return renderToolResult({
        id: ticket.frontmatter.id,
        kind: ticket.kind,
        title: ticket.frontmatter.title
      });
    }
    case "create_epic": {
      const epic = await createEpic(rootDir, {
        title: asString(args.title, "title"),
        status: asOptionalString(args.status),
        priority: asOptionalString(args.priority),
        references: asStringList(args.references, "references"),
        labels: asStringList(args.labels, "labels"),
        body: asOptionalString(args.body)
      } satisfies EpicCreateInput);
      return renderToolResult({
        id: epic.frontmatter.id,
        kind: epic.kind,
        title: epic.frontmatter.title
      });
    }
    case "claim_ticket": {
      const result = await coordinator.claimTicket(asString(args.id, "id"), asString(args.owner, "owner"));
      return renderToolResult(result);
    }
    case "start_ticket": {
      const mode = asOptionalString(args.mode);
      if (mode !== undefined && mode !== "same_tree" && mode !== "worktree") {
        throw new Error("\"mode\" must be \"same_tree\" or \"worktree\"");
      }
      const result = await coordinator.startTicket(asString(args.id, "id"), {
        owner: asString(args.owner, "owner"),
        mode
      });
      return renderToolResult(result);
    }
    case "block_ticket": {
      const result = await coordinator.blockTicket(asString(args.id, "id"), {
        reason: asString(args.reason, "reason"),
        dependsOn: asStringList(args.dependsOn, "dependsOn")
      });
      return renderToolResult(result);
    }
    case "finish_ticket": {
      const result = await coordinator.finishTicket(asString(args.id, "id"));
      return renderToolResult(result);
    }
    case "release_ticket": {
      const result = await coordinator.releaseTicket(asString(args.id, "id"), {
        force: args.force === true
      });
      return renderToolResult(result);
    }
    case "set_references": {
      const entity = await updateEntity(rootDir, asString(args.id, "id"), {
        references: asStringList(args.references, "references") ?? []
      });
      return renderToolResult({
        id: entity.frontmatter.id,
        references: entity.frontmatter.references ?? []
      });
    }
    case "set_status": {
      const entity = await setEntityStatus(rootDir, asString(args.id, "id"), asString(args.status, "status"));
      return renderToolResult({
        id: entity.frontmatter.id,
        status: entity.frontmatter.status
      });
    }
    case "assign_ticket": {
      const entity = await updateEntity(rootDir, asString(args.id, "id"), {
        assigned_to: asString(args.assigned_to, "assigned_to")
      } satisfies EntityPatch);
      return renderToolResult({
        id: entity.frontmatter.id,
        assigned_to: entity.kind === "ticket" ? entity.frontmatter.assigned_to ?? null : null
      });
    }
    case "clear_assignee": {
      const entity = await updateEntity(rootDir, asString(args.id, "id"), { assigned_to: null });
      return renderToolResult({
        id: entity.frontmatter.id,
        assigned_to: entity.kind === "ticket" ? entity.frontmatter.assigned_to ?? null : null
      });
    }
    case "update_ticket_dependencies": {
      const entity = await updateEntity(rootDir, asString(args.id, "id"), {
        depends_on: asStringList(args.depends_on, "depends_on") ?? []
      });
      return renderToolResult({
        id: entity.frontmatter.id,
        depends_on: entity.kind === "ticket" ? entity.frontmatter.depends_on ?? [] : []
      });
    }
    default:
      throw new Error(`unknown tool "${name}"`);
  }
}

function handleRequest(rootDir: string, request: JsonRpcRequest): void {
  if (request.method === "notifications/initialized") {
    return;
  }

  if (!request.method) {
    writeError(request.id, -32600, "invalid request");
    return;
  }

  if (request.method === "initialize") {
    writeResult(request.id, {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {}
      },
      serverInfo: SERVER_INFO
    });
    return;
  }

  if (request.method === "ping") {
    writeResult(request.id, {});
    return;
  }

  if (request.method === "tools/list") {
    writeResult(request.id, { tools: TOOLS });
    return;
  }

  if (request.method === "tools/call") {
    const params = request.params ?? {};
    const name = typeof params.name === "string" ? params.name : "";
    const args = asRecord(params.arguments, "arguments") ?? {};
    handleToolCall(rootDir, name, args)
      .then((result) => {
        writeResult(request.id, result);
      })
      .catch((error) => {
        writeError(request.id, -32000, (error as Error).message);
      });
    return;
  }

  writeError(request.id, -32601, `method "${request.method}" not found`);
}

export async function startMcpServer(rootDir: string): Promise<void> {
  process.stdin.setEncoding("utf8");
  let buffer = "";

  process.stdin.on("data", (chunk: string) => {
    buffer += chunk;

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

      const contentLength = Number.parseInt(match[1] ?? "0", 10);
      const payloadStart = headerEnd + 4;
      const payloadEnd = payloadStart + contentLength;
      if (buffer.length < payloadEnd) {
        break;
      }

      const payload = buffer.slice(payloadStart, payloadEnd);
      buffer = buffer.slice(payloadEnd);

      try {
        const request = JSON.parse(payload) as JsonRpcRequest;
        handleRequest(rootDir, request);
      } catch (error) {
        writeError(null, -32700, `parse error: ${(error as Error).message}`);
      }
    }
  });

  await new Promise<void>((resolve) => {
    process.stdin.on("end", () => resolve());
  });
}
