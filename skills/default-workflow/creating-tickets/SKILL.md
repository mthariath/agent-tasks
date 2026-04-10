---
name: creating-tickets
description: Create new agent-tasks tickets using the default workflow pack. Use when a user describes new work that should become a ticket in `.agent-tasks/tickets/`.
---

# Creating Tickets

Use this skill when new work should be captured as a ticket.

## Required Read Order

1. Read `.agent-tasks/project.yaml`.
2. Read `.agent-tasks/WORKFLOW.md`.
3. Read nearby ticket templates or example tickets when they exist.

## Workflow

1. Reuse configured statuses; when unspecified, use the earliest non-terminal status that fits the workflow.
2. Attach the ticket to an existing epic when one clearly fits.
3. Use only one directional dependency field: `depends_on`.
4. Add dependencies only for real prerequisites that must complete before the ticket can start.
5. Avoid fake serial chains when work can proceed in parallel.
6. If the project uses `assigned_to`, leave it empty unless the creating agent is explicitly taking ownership immediately.
7. Add `references` when supporting docs such as `PLANS.md`, `DESIGN.md`, specs, or runbooks materially improve execution clarity.
8. If execution or review behavior depends on repo-local automation, point at the relevant extension docs or runbooks instead of restating that policy in the ticket.
9. Keep the body concise, factual, and aligned with the project-local workflow conventions so another agent can tell whether the ticket is ready without guessing.

## Validation

- The created ticket should be actionable without guessing the goal.
- The title should name the concrete outcome, not just the activity.
- Dependencies should make readiness clearer, not noisier.
- References should point at real supporting docs, not placeholder files.
- Repo-wide automation or approval policy should usually live in workflow docs or extensions, not inside every ticket.
- Do not invent unsupported implementation details.
