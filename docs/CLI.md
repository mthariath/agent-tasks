# CLI Reference

The reference executable is `agenttasks`.

## Install

```bash
npm install -g @agenttasks/cli@next
```

- General CLI commands run on Node.
- `agenttasks tui` currently requires [Bun](https://bun.sh) in the beta release.

## Commands

```bash
agenttasks init [--name <name>] [--starter default] [--with-skills|--without-skills] [--with-agent-guidance|--without-agent-guidance] [--bare]
agenttasks validate
agenttasks ready
agenttasks plan
agenttasks deps <ticket-id>
agenttasks critical-path
agenttasks extensions
agenttasks hook-runs
agenttasks claim <ticket-id> --as <identity>
agenttasks start <ticket-id> --as <identity> [--same-tree|--worktree]
agenttasks block <ticket-id> --reason <text> [--depends-on <id>]...
agenttasks finish <ticket-id>
agenttasks release <ticket-id> [--force]
agenttasks validate-execution
agenttasks serve [--root <path>] [--port <port>]
agenttasks list [--status <status>] [--epic <epic>] [--label <label>] [--assigned-to <identity>]
agenttasks show <id>
agenttasks create ticket --title <title> [--assigned-to <identity>] [--reference <path>]... [--field <key=value>]... [options]
agenttasks create epic --title <title> [--reference <path>]... [options]
agenttasks edit <id> [--assigned-to <identity> | --clear-assigned-to] [--reference <path>]... [--clear-references] [--field <key=value>]... [--clear-field <key>]... [options]
agenttasks set-status <id> <status>
agenttasks mcp [--root <path>]
agenttasks tui
```

## Important Behavior

- `init` creates `.agent-tasks/`, local body templates, `.agent-tasks/WORKFLOW.md`, and project README content.
- `init` also creates `.agent-tasks/extensions/` scaffolding plus example TypeScript extensions.
- By default, `init` also installs the default workflow skill pack into `.agents/skills/agent-tasks-default-workflow/`.
- By default, `init` appends or updates a managed `agent-tasks` block in repo-local `AGENTS.md`.
- `init` also appends or updates a managed `.gitignore` block so `.agent-tasks/.runtime/` stays local.
- `--bare` skips workflow skill installation and `AGENTS.md` integration.
- `validate` reports structural and workflow issues.
- `ready` lists tickets whose dependencies are satisfied by workflow `end` statuses.
- `plan` shows advisory waves, biggest blockers, and the current critical path.
- `deps <ticket-id>` shows dependency satisfaction, reverse dependencies, and direct unblock impact.
- `critical-path` prints the current unfinished longest dependency chain.
- `extensions` shows loaded extensions, load failures, and registered project-local commands.
- `hook-runs` shows persisted extension hook runs from `.agent-tasks/.runtime/hooks/`.
- `claim` creates an exclusive local execution claim and aligns `assigned_to`.
- `start` requires a matching claim, validates readiness, and defaults to a git worktree for coding work.
- `block` records a blocker note and can add real prerequisite tickets to `depends_on`.
- `finish` records an execution handoff and moves into a review or handoff state.
- `release` clears local runtime claim/workspace state.
- `validate-execution` reports runtime claim/workspace issues.
- `serve` starts a local project-scoped execution coordinator over the same file-backed engine.
- `serve` also loads project-local TypeScript extensions and exposes extension status plus command endpoints.
- `set-status` enforces configured transition rules.
- `mcp` starts a local stdio MCP adapter for the current project root.
- multiple `mcp` instances can run at the same time as long as each process targets its own project root.
- multiple `serve` instances can run at the same time as long as each process targets its own project root or port.
- `tui` launches a realtime OpenTUI interface with board, people, and planning views, ticket/epic detail, assignment flows, missing-project onboarding, and ticket creation via `n`.
- if Bun is missing, `tui` fails with an explicit install message instead of a raw spawn error.
- `assigned_to` is a freeform single assignee field for humans or agents.
- projects may define extra ticket fields in `.agent-tasks/project.yaml`; CLI create/edit uses `--field` and `--clear-field` for them.
- tickets and epics may carry `references`, which are plain repo-relative supporting-doc paths such as `docs/DESIGN.md` or `PLANS.md`.
- project-local coordinator extensions live under `.agent-tasks/extensions/`; see `docs/EXTENSIONS.md` and `docs/HOOKS.md`.
- `--root` lets CLI, TUI, and MCP commands target a different project directory.
