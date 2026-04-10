# agent-tasks

`agent-tasks` is a git-native task standard and reference tool for humans and coding agents.

The standard is the point. Everything else in this repository exists to prove that the standard is usable:

- `.agent-tasks/` files are the source of truth
- tickets and epics are Markdown with YAML frontmatter
- workflow statuses and transitions live in project config
- workflow semantics can define `start`, `end`, and special status aliases for planning
- projects may define additional ticket fields in `project.yaml`
- tickets may optionally declare `assigned_to` for a human or agent identity
- tickets and epics may reference supporting repo docs such as `PLANS.md`, `DESIGN.md`, specs, or runbooks
- the reference CLI and TUI mutate files directly instead of hiding state in a backend

## Repo Layout

- `spec/` standard docs
- `packages/core/` parser, validator, indexer, mutation engine
- `packages/cli/` the `agenttasks` executable
- `skills/` opinionated workflow guidance for agents
- `templates/` starter/project templates
- `examples/` example `.agent-tasks/` projects
- `docs/` usage and design notes

## Quick Start

```bash
pnpm install
pnpm build
node packages/cli/dist/index.js init --name "My Project"
node packages/cli/dist/index.js validate
node packages/cli/dist/index.js tui
```

The non-interactive CLI runs under Node. The TUI re-execs itself under Bun so the OpenTUI renderer can run without making the rest of the CLI Bun-only.

By default, `init` now also:

- creates `.agent-tasks/WORKFLOW.md`
- creates `.agent-tasks/extensions/` scaffolding plus example TypeScript extension templates
- installs the default workflow skill pack into `.agents/skills/agent-tasks-default-workflow/`
- appends or updates a managed `agent-tasks` block in repo-local `AGENTS.md`

Use `--bare` to initialize only the `.agent-tasks/` standard without skills or passive agent guidance.

## V0 Scope

V0 includes:

- the on-disk standard
- a Node-based reference CLI
- a realtime terminal UI with board, people, and planning views plus ticket/epic detail
- TUI ticket creation and project-defined custom ticket fields
- dependency-aware planning: ready sets, execution waves, blocker analysis, and critical path summaries
- a local MCP stdio adapter over the same file-backed engine, one process per project root
- a local execution model with exclusive claims, worktree-backed starts, runtime validation, and a project-scoped coordinator
- project-local TypeScript coordinator extensions and lifecycle hooks
- one default workflow pack

## Convention Interop

`agent-tasks` is meant to work alongside common agent-context files:

- `AGENTS.md` for passive repo-wide guidance
- `PLANS.md` or ExecPlan-style docs for long-form implementation plans
- `DESIGN.md` for design-system or UI guidance

`.agent-tasks/` remains the canonical source of task, workflow, dependency, and execution state. Supporting docs stay external and can be linked from tickets and epics via `references`.

## Guidance Stack

`agent-tasks` uses a layered guidance model:

- `AGENTS.md`: short, always-on repo contract
- `.agent-tasks/WORKFLOW.md`: project-local workflow semantics and execution model
- workflow skills: on-demand task procedures such as creating, refining, and working tickets
- `.agent-tasks/extensions/README.md` plus extension docs: targeted context for repo-local automation and execution policy
- CLI/TUI/validation: discovery and enforcement affordances

The important distinction is:

- always-on guidance should stay short and stable
- workflow skills should teach procedures, not the whole architecture
- extension docs should be read when execution policy or automation matters, not kept in prompt context all the time

V0 intentionally excludes:

- hosted sync
- local web server / kanban
- any source of truth outside the repo
- a broad public plugin marketplace or custom TUI injection surface
