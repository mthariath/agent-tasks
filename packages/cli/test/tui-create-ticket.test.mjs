import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { appendFile, mkdtemp, rm } from "node:fs/promises";

import { createEpic, indexProject, initProject } from "@agenttasks/core";
import {
  getCreateTicketFieldSpecs,
  getCreateTicketInitialValues,
  getCreateTicketReviewRows,
  getCreateTicketSubmission
} from "../dist/tui/create-ticket.js";

test("create-ticket helpers derive wizard fields, defaults, and typed submission", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agenttasks-create-ticket-"));
  await initProject(root, "Create Ticket Test");
  await appendFile(path.join(root, ".agent-tasks", "project.yaml"), `\nfields:\n  ticket:\n    - key: area\n      label: Area\n      type: enum\n      required: true\n      options:\n        - frontend\n        - backend\n    - key: estimate\n      type: number\n    - key: qa_required\n      type: boolean\n      default: false\n`);

  const epic = await createEpic(root, { title: "UI Shell", status: "backlog" });
  const index = await indexProject(root);

  const fields = getCreateTicketFieldSpecs(index);
  assert.equal(fields[0].key, "title");
  assert.equal(fields[1].key, "status");
  assert.equal(fields.at(-1)?.key, "qa_required");

  const initialValues = getCreateTicketInitialValues(index, epic.frontmatter.id);
  assert.equal(initialValues.epic, epic.frontmatter.id);
  assert.equal(initialValues.qa_required, "false");

  const submission = getCreateTicketSubmission(index, {
    ...initialValues,
    title: "Build dialog wizard",
    status: "ready",
    area: "frontend",
    estimate: "3",
    qa_required: "true"
  });

  assert.equal(submission.title, "Build dialog wizard");
  assert.equal(submission.status, "ready");
  assert.equal(submission.epic, epic.frontmatter.id);
  assert.deepEqual(submission.customFields, {
    area: "frontend",
    estimate: 3,
    qa_required: true
  });

  const reviewRows = getCreateTicketReviewRows(index, {
    ...initialValues,
    title: "Build dialog wizard",
    area: "frontend"
  });
  assert.equal(reviewRows.find((row) => row.key === "area")?.value, "frontend");
  assert.equal(reviewRows.find((row) => row.key === "qa_required")?.value, "false");

  await rm(root, { recursive: true, force: true });
});
