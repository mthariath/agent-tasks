---
name: working-tickets
description: Execute work under agent-tasks tickets using the default workflow pack. Use when implementing, debugging, or otherwise carrying out a specific ticket and keeping it current while you work.
---

# Working Tickets

Use this skill when actually doing the work described by a ticket.

## Required Read Order

1. Read `.agent-tasks/project.yaml`.
2. Read `.agent-tasks/WORKFLOW.md`.
3. Read the target ticket.
4. Read the linked epic if present.
5. Read any relevant ticket or epic `references`, especially supporting docs such as `PLANS.md`, `DESIGN.md`, specs, or runbooks.
6. If execution policy or project automation matters, read `.agent-tasks/extensions/README.md`.
7. If available, use planner outputs or a local `agenttasks mcp` session as optional helpers for readiness and dependency checks.

## Workflow

1. Confirm the ticket is actionable. If it is too vague, refine it first or stop and explain why execution is unsafe.
2. Check whether the ticket is actually ready from `depends_on` plus workflow `end` semantics before you claim it.
3. If the ticket is not ready, do not blindly start it. Either refine its dependencies, switch to truly ready work, or explain concretely why it cannot start.
4. If the project uses `assigned_to` and you are taking ownership, set it to a stable identity string.
5. Move the ticket into the appropriate active workflow state only if the transition is allowed.
6. Keep frontmatter and body factual while work is underway.
7. Prefer referenced supporting docs for long-form plans or design context instead of copying them into the ticket body.
8. If new prerequisite work is discovered, update `depends_on` only when the other ticket truly must finish first.
9. If blockers appear after work has started, use the configured blocked-like state only when one exists and is reachable; otherwise document the blocker in the body without inventing a status.
10. If coordinator-backed execution is available, prefer lifecycle actions such as claim/start/block/finish over raw file edits that would bypass hooks or project-local automation.
11. If start or finish is blocked by project policy, inspect the coordinator or extension behavior instead of forcing ticket state by hand.
12. Before completion, make sure the body, acceptance criteria, dependency state, and relevant references still match reality so downstream tickets unblock correctly.
13. Move to the appropriate review or terminal state only through allowed transitions.

## Guardrails

- Do not claim a ticket just because you inspected it.
- Prefer ready-now work when choosing among multiple tickets.
- Do not force invalid transitions.
- Do not rewrite user intent casually.
- Do not add derived state such as reverse dependency fields.
- Treat MCP as optional local tooling, not a separate source of truth.
- Do not bypass coordinator-enforced execution policy with direct status edits when lifecycle actions are available.
