---
name: refining-tickets
description: Refine vague agent-tasks tickets into ready-to-work tickets using the default workflow pack. Use when a ticket exists but needs clearer outcome, acceptance criteria, dependencies, or epic placement before implementation starts.
---

# Refining Tickets

Use this skill to turn a rough ticket into a ready one.

## Required Read Order

1. Read `.agent-tasks/project.yaml`.
2. Read `.agent-tasks/WORKFLOW.md`.
3. Read the target ticket.
4. Read the linked epic if present.

## Workflow

1. Tighten the title so it names the actual outcome.
2. Fill in missing body sections only where they materially improve execution clarity.
3. Add dependencies only when another ticket truly must land first.
4. Remove or avoid fake serial dependencies when work is actually parallelizable.
5. Make readiness legible so another agent can tell whether the ticket can start now without guessing.
6. Add or clean up `references` when long-form plans, design docs, specs, or runbooks should be read alongside the ticket.
7. If a repo-specific start, finish, review, or escalation rule keeps recurring, prefer documenting it in project-local extension policy instead of bloating the ticket body.
8. Keep diffs small and preserve still-relevant user-authored notes.
9. Avoid inventing implementation details that are not supported by the project context.

## Validation

- After refinement, the ticket should be specific enough for an agent or human to begin safely.
- The dependency shape should reflect real prerequisites, not generic caution.
- Supporting docs should be referenced instead of copied into the ticket body when that keeps the ticket clearer.
- Repo-specific execution policy should live in workflow docs or extensions, not repeated ticket prose.
- If the project uses a custom body pattern, preserve it instead of forcing the default one.
