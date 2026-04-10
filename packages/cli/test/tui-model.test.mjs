import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";

import { createEpic, createTicket, indexProject, initProject } from "@agenttasks/core";
import {
  ALL_EPICS_ID,
  UNASSIGNED_ID,
  getAssigneeEntries,
  getBoardColumns,
  getEpicEntries,
  getPlanBuckets,
  getStatusStripItems,
  getVisibleBoardColumns,
  getVisibleTickets,
  summarizeAssignments
} from "../dist/tui/model.js";

test("tui model groups tickets by epic, status, assignment, and strip hints", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agenttasks-tui-"));
  await initProject(root, "TUI Test");

  const epic = await createEpic(root, { title: "UI", status: "backlog" });
  await createTicket(root, {
    title: "Board shell",
    status: "ready",
    epic: epic.frontmatter.id,
    assigned_to: "codex/main",
    labels: ["ui"]
  });
  await createTicket(root, {
    title: "Watcher",
    status: "in_progress",
    epic: epic.frontmatter.id,
    assigned_to: "pi/refiner"
  });
  await createTicket(root, {
    title: "Follow-up",
    status: "ready",
    depends_on: ["T-0001"]
  });
  await createTicket(root, {
    title: "Empty state",
    status: "blocked"
  });

  const index = await indexProject(root);
  const entries = getEpicEntries(index);
  assert.equal(entries[0].id, ALL_EPICS_ID);
  assert.equal(entries[1].id, epic.frontmatter.id);

  const visible = getVisibleTickets(index, {
    epicId: epic.frontmatter.id,
    search: "board"
  });
  assert.equal(visible.length, 1);
  assert.equal(visible[0].frontmatter.title, "Board shell");

  const columns = getBoardColumns(index, {
    epicId: ALL_EPICS_ID,
    search: ""
  });
  assert.equal(columns.find((column) => column.status === "ready")?.tickets.length, 2);
  assert.equal(columns.find((column) => column.status === "in_progress")?.tickets.length, 1);

  const visibleColumns = getVisibleBoardColumns(columns, 2, 3);
  assert.deepEqual(visibleColumns.map((column) => column.status), ["ready", "in_progress", "blocked"]);

  const strip = getStatusStripItems(columns, 2);
  assert.deepEqual(
    strip.map((item) => [item.direction, item.status, item.available]),
    [
      ["previous", "ready", true],
      ["current", "in_progress", true],
      ["next", "blocked", true]
    ]
  );

  const assignees = getAssigneeEntries(index, "");
  assert.equal(assignees[0].id, "codex/main");
  assert.equal(assignees.at(-1)?.id, UNASSIGNED_ID);

  const summary = summarizeAssignments(index.tickets);
  assert.deepEqual(summary, ["codex/main 1", "pi/refiner 1"]);

  const planBuckets = getPlanBuckets(index);
  assert.equal(planBuckets[0]?.id, "ready");
  assert.equal(planBuckets[0]?.tickets[0]?.frontmatter.title, "Board shell");
  assert.ok(planBuckets.some((bucket) => bucket.id === "blockers"));

  await rm(root, { recursive: true, force: true });
});
