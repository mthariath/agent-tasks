---
name: managing-status
description: Manage agent-tasks status changes safely using the default workflow pack. Use when a ticket or epic needs a status mutation that must respect the configured transition graph in `.agent-tasks/project.yaml`.
---

# Managing Status

Use this skill for status-only mutations or checks.

## Required Read Order

1. Read `.agent-tasks/project.yaml`.
2. Read `.agent-tasks/WORKFLOW.md` when workflow semantics matter.
3. Read the current entity before changing it.
4. If the status change is part of active execution or review policy, check `.agent-tasks/extensions/README.md`.

## Workflow

1. Confirm the current status before changing it.
2. Apply only allowed transitions.
3. Make sure the change still makes sense relative to dependency readiness and downstream planning.
4. If coordinator-backed execution or review policy is available, do not use raw status changes to bypass lifecycle hooks or project-local automation.
5. If the desired state is not reachable, explain the blocked transition instead of forcing it.
6. Update `updated_at` through the normal mutation path.

## Guardrails

- Do not assume statuses like `blocked` or `done` exist in every project.
- Use workflow semantics and the configured transition graph, not hardcoded names.
- Do not use a blocked-like status as a substitute for unresolved `depends_on` prerequisites.
- Treat reaching an end status as a claim that downstream dependencies are now satisfied.
- Do not bypass coordinator-enforced execution behavior with status-only edits when lifecycle actions are available.
