# Agent Workflow

This project uses `.agent-tasks/` as canonical planning state for humans and agents.

## Agent Contract

- Read `.agent-tasks/project.yaml` before mutating ticket or epic status.
- Read the relevant ticket and linked epic before starting significant work.
- Read any referenced supporting docs when they are relevant to the task, especially files such as `PLANS.md`, `DESIGN.md`, specs, or runbooks.
- Before taking ownership of a ticket, confirm whether it is actually ready from `depends_on` plus workflow `end` semantics.
- Prefer tickets that are ready now over tickets that are still dependency-blocked.
- When several tickets are ready, prefer work that can proceed in parallel without colliding with another active owner.
- If this project uses `assigned_to`, claim a ticket only when actually taking ownership of the work.
- Keep ticket bodies and frontmatter factual and current while work is underway.
- Use configured workflow semantics instead of assuming status names such as `blocked` or `done` always exist.
- If a ticket is too vague to execute safely, refine it before implementation or stop and report why.

## Default Semantics

- `assigned_to`: use a stable human or agent identity such as `mickey`, `codex/main`, or `pi/refiner`.
- `workflow.start` identifies the primary active work state.
- `workflow.end` identifies statuses that satisfy dependencies for planning and readiness.
- `depends_on` lists true prerequisites only; do not create fake serial chains when work can proceed in parallel.
- Dependency-not-ready and actively blocked are different states: unresolved prerequisites belong in `depends_on`, while a blocked-like workflow state is for started work that is materially stalled.
- Active work should move into the project's configured active state when one exists and the transition is allowed.
- If a blocked-like state exists and is reachable, use it when work is materially blocked; otherwise record the blocker in the body without inventing a status.
- Before marking work complete, make sure acceptance criteria or equivalent body sections still match reality.
- Keep long-form implementation and design context in referenced supporting docs instead of bloating the ticket body.

## Planner and MCP

- Planning views and commands are advisory helpers over the same files; they do not replace reading the ticket itself.
- If a local `agenttasks mcp` server is available, agents may use it for structured planning queries or safe mutations, but direct file workflow remains primary.

## Coordinator and Extensions

- If execution behavior or repo-specific automation matters, read `.agent-tasks/extensions/README.md`.
- `agenttasks serve` is the local coordinator for execution behavior such as claims, start/finish hooks, and project-local commands.
- Project-local extensions may enforce `before_*` checks or run `after_*` automation around execution lifecycle actions.
- Treat extensions as policy and automation over the same workflow, not as a second source of truth.
- If coordinator-backed execution is available, prefer it over ad hoc status or file mutations that would bypass hook-enforced behavior.

## Supporting Docs

- Use ticket or epic `references` for repo-relative supporting docs such as `docs/DESIGN.md`, `PLANS.md`, specs, or runbooks.
- Treat referenced docs as supporting context, not as a second source of workflow truth.
- Keep `.agent-tasks/` canonical for status, dependencies, assignment, and execution state.

## Body Conventions

Unless this project adopts another structure, tickets should generally use:

- `Context`
- `Outcome`
- `Acceptance Criteria`
- `Notes`

Epics should generally describe:

- goal
- scope
- important notes, risks, or dependencies
