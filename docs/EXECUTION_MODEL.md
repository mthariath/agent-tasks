# Execution Model

`agent-tasks` keeps durable planning state in tracked ticket files and local execution state in gitignored runtime files.

## Scope

This execution model is intentionally narrow:

- single machine
- one project root per coordinator process
- exclusive claim per coding ticket
- worktrees by default for actual coding work
- no hosted backend
- no distributed locking

Planning, refinement, and triage can still happen without claims or worktrees.

## Durable State

Tracked ticket files remain the source of truth for:

- `status`
- `assigned_to`
- `depends_on`
- ticket body notes and handoff updates

`finish` means implementation is complete and ready for review or integration. It does not mean the work has already been merged.

## Runtime State

Local execution state lives under `.agent-tasks/.runtime/` and should stay out of git.

Runtime files include:

- `claims/<ticket-id>.json`
- `workspaces/<ticket-id>.json`
- `locks/<ticket-id>.lock`
- `hooks/<run-id>.json`
- `server.json`

These files are local coordination aids over the same tracked tickets, not a second source of truth.

## Lifecycle

### Claim

`agenttasks claim <ticket-id> --as <identity>`

- requires a non-empty owner
- fails if another owner already holds the claim
- aligns tracked `assigned_to` with the claim owner

### Start

`agenttasks start <ticket-id> --as <identity> [--same-tree|--worktree]`

- requires an existing claim by the same owner
- requires the ticket to be ready from `depends_on` plus workflow `end` semantics
- moves the ticket into `workflow.start`
- defaults to a git worktree for coding work

Default worktree shape:

- path: `../.worktrees/<repo-name>/<ticket-id>`
- branch: `ticket/<ticket-id>-<slug>`

### Block

`agenttasks block <ticket-id> --reason <text> [--depends-on <id>]...`

- requires a claim
- records a blocker note in the ticket body
- optionally adds real prerequisite tickets to `depends_on`
- moves into a blocked-like state only when the workflow defines one and the transition is allowed

### Finish

`agenttasks finish <ticket-id>`

- requires a claim
- moves into a configured review or handoff state when reachable
- appends an execution handoff note to the ticket body
- records runtime phase as `finished`

Review status resolution prefers `workflow.special.review`, then reachable non-end statuses, then reachable end statuses.

### Release

`agenttasks release <ticket-id> [--force]`

- clears claim and workspace runtime files
- `--force` exists for stale local state recovery
- does not delete the worktree directory in v1

## Coordinator

`agenttasks serve`

This starts a local project-scoped coordinator with HTTP endpoints for:

- execution status
- active workspaces
- execution validation
- extension status
- hook runs
- project-local extension commands
- claim/start/block/finish/release actions

## Extensions

Project-local TypeScript extensions live under `.agent-tasks/extensions/`.

- the coordinator loads `*.ts` files at the extension root and `*/index.ts` in child directories
- helper and template files such as `api.ts` and `*.example.ts` are ignored
- `before_*` hooks can block guarded actions
- `after_*` hooks run after committed lifecycle changes and cannot roll back state
- hook runs are persisted under `.agent-tasks/.runtime/hooks/`

See `docs/EXTENSIONS.md` and `docs/HOOKS.md` for the authoring model.

Multiple coordinators can run at the same time as long as each targets a different project root or port.

## MCP

`agenttasks mcp`

The local MCP adapter exposes the same execution lifecycle:

- `claim_ticket`
- `start_ticket`
- `block_ticket`
- `finish_ticket`
- `release_ticket`
- `execution_status`
- `active_workspaces`

MCP is optional. File-backed workflow remains primary.
