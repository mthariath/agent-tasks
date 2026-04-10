import { createServer } from "node:http";
import {
  indexProject,
  writeServerRecord,
  clearServerRecord
} from "@agenttasks/core";
import { Coordinator } from "./coordinator.js";

async function readJsonBody(request: import("node:http").IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const input = Buffer.concat(chunks).toString("utf8").trim();
  if (!input) {
    return {};
  }
  const parsed = JSON.parse(input);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("request body must be an object");
  }
  return parsed as Record<string, unknown>;
}

function writeJson(response: import("node:http").ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`\"${field}\" must be a non-empty string`);
  }
  return value.trim();
}

function asMode(value: unknown): "same_tree" | "worktree" | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === "same_tree" || value === "worktree") {
    return value;
  }
  throw new Error("\"mode\" must be \"same_tree\" or \"worktree\"");
}

function asStringList(value: unknown, field: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`\"${field}\" must be an array of strings`);
  }
  return value;
}

export async function startCoordinatorServer(rootDir: string, options: { port?: number; host?: string } = {}): Promise<void> {
  const host = options.host ?? "127.0.0.1";
  const requestedPort = options.port ?? 0;
  const coordinator = await Coordinator.create(rootDir);

  const server = createServer(async (request, response) => {
    try {
      const method = request.method ?? "GET";
      const url = new URL(request.url ?? "/", `http://${host}`);

      if (method === "GET" && url.pathname === "/health") {
        writeJson(response, 200, { ok: true });
        return;
      }

      if (method === "GET" && url.pathname === "/execution/status") {
        const index = await indexProject(rootDir);
        writeJson(response, 200, {
          tickets: [...index.execution.byTicket.values()],
          server: index.execution.server ?? null,
          issues: index.issues.filter((issue) => issue.code.startsWith("execution.")),
          extensions: await coordinator.status()
        });
        return;
      }

      if (method === "GET" && url.pathname === "/execution/workspaces") {
        const index = await indexProject(rootDir);
        writeJson(response, 200, {
          workspaces: index.execution.workspaces
        });
        return;
      }

      if (method === "GET" && url.pathname === "/extensions/status") {
        writeJson(response, 200, await coordinator.status());
        return;
      }

      if (method === "GET" && url.pathname === "/hooks/runs") {
        writeJson(response, 200, { runs: await coordinator.listHookRuns() });
        return;
      }

      if (method === "POST" && url.pathname === "/execution/claim") {
        const body = await readJsonBody(request);
        const result = await coordinator.claimTicket(asString(body.id, "id"), asString(body.owner, "owner"));
        writeJson(response, 200, result);
        return;
      }

      if (method === "POST" && url.pathname === "/execution/start") {
        const body = await readJsonBody(request);
        const result = await coordinator.startTicket(asString(body.id, "id"), {
          owner: asString(body.owner, "owner"),
          mode: asMode(body.mode)
        });
        writeJson(response, 200, result);
        return;
      }

      if (method === "POST" && url.pathname === "/execution/block") {
        const body = await readJsonBody(request);
        const result = await coordinator.blockTicket(asString(body.id, "id"), {
          reason: asString(body.reason, "reason"),
          dependsOn: asStringList(body.dependsOn, "dependsOn")
        });
        writeJson(response, 200, result);
        return;
      }

      if (method === "POST" && url.pathname === "/execution/finish") {
        const body = await readJsonBody(request);
        const result = await coordinator.finishTicket(asString(body.id, "id"));
        writeJson(response, 200, result);
        return;
      }

      if (method === "POST" && url.pathname === "/execution/release") {
        const body = await readJsonBody(request);
        const result = await coordinator.releaseTicket(asString(body.id, "id"), {
          force: body.force === true
        });
        writeJson(response, 200, result);
        return;
      }

      if (method === "GET" && url.pathname === "/execution/validate") {
        const issues = await coordinator.validateExecution();
        writeJson(response, 200, { issues });
        return;
      }

      if (method === "POST" && url.pathname.startsWith("/extensions/commands/")) {
        const body = await readJsonBody(request);
        const name = decodeURIComponent(url.pathname.slice("/extensions/commands/".length));
        writeJson(response, 200, { result: await coordinator.runCommand(name, body) });
        return;
      }

      writeJson(response, 404, { error: { code: "not_found", detail: `${method} ${url.pathname}` } });
    } catch (error) {
      writeJson(response, 400, { error: { code: "request_failed", detail: (error as Error).message } });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(requestedPort, host, () => {
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("failed to determine server address");
  }

  await writeServerRecord(rootDir, {
    pid: process.pid,
    port: address.port,
    host,
    startedAt: new Date().toISOString()
  });

  console.log(`agenttasks serve listening on http://${host}:${address.port}`);

  const close = async () => {
    await clearServerRecord(rootDir);
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  };

  const shutdown = () => {
    void close().finally(() => {
      process.exit(0);
    });
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  await new Promise<void>(() => {});
}
