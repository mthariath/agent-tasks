<p align="center">
  <img src="./apps/docs/public/mascot.svg" width="190" alt="agent-tasks mascot" />
</p>

<h1 align="center">agent-tasks</h1>

<p align="center">
  <strong>Git-native task state for humans and coding agents.</strong>
  <br />
  Keep tickets, dependencies, workflow, planning, and execution state in your repo.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/files-first-e96819" alt="Files first" />
  <img src="https://img.shields.io/badge/CLI%20%2B%20TUI%20%2B%20MCP-supported-2175c5" alt="CLI, TUI, and MCP" />
  <img src="https://img.shields.io/badge/TypeScript-strict-3178c6" alt="TypeScript strict" />
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &middot;
  <a href="#what-ships">What Ships</a> &middot;
  <a href="./spec/FILE_FORMAT.md">File Format</a> &middot;
  <a href="./docs/CLI.md">CLI</a> &middot;
  <a href="./docs/EXECUTION_MODEL.md">Execution Model</a>
</p>

---

## The Problem

Task state usually ends up split across too many systems.

- code lives in git
- plans live in docs
- the task board lives in some separate app
- agents have to guess which system is actually authoritative

That gets worse once you start coordinating multiple coding agents. The work graph, readiness, blockers, and execution state often exist only in prompt text or in someone's head.

## The Solution

`agent-tasks` keeps the durable task state in the repo itself.

Tickets and epics are Markdown files with YAML frontmatter. Workflow rules live in `project.yaml`. Supporting docs like `AGENTS.md`, `PLANS.md`, and `DESIGN.md` stay external, but tickets can point to them directly through `references`.

On top of that standard, the repo ships a reference toolchain:

- a CLI for init, validation, planning, and lifecycle actions
- a realtime TUI for board, people, and plan views
- an MCP adapter over the same file-backed engine
- a local coordinator for claims, worktrees, and execution runtime state
- project-local TypeScript extensions and hooks for repo-specific policy

The point is not another hosted task app. The point is a small standard that both humans and agents can read, mutate, diff, and review in git.

## Install Beta

```bash
npm install -g @agenttasks/cli@next
```

The general CLI runs on Node.

`agenttasks tui` currently requires [Bun](https://bun.sh) in the beta release because the OpenTUI renderer is launched through Bun.

## Quick Start

```bash
agenttasks init --name "My Project"
agenttasks validate
agenttasks tui
```

Useful follow-ups:

```bash
agenttasks ready
agenttasks plan
agenttasks serve
agenttasks mcp
```

If you are developing from source instead of installing from npm:

```bash
pnpm install
pnpm build
node packages/cli/dist/index.js init --name "My Project"
```

## What Ships

### Standard

- `.agent-tasks/` as the canonical project task directory
- tickets and epics as Markdown with YAML frontmatter
- configurable workflow statuses, transitions, and semantics
- optional custom ticket fields in `project.yaml`
- optional `references` to supporting docs and specs

### Planning

- ready-now analysis from dependencies plus workflow end states
- execution waves for parallelizable work
- blocker and reverse-blocker analysis
- critical-path summaries

### Execution

- exclusive claims
- worktree-backed starts by default for coding work
- finish/release lifecycle actions
- runtime validation under `.agent-tasks/.runtime/`
- local coordinator via `agenttasks serve`

### Automation

- local MCP adapter via `agenttasks mcp`
- project-local TypeScript extensions in `.agent-tasks/extensions/`
- lifecycle hooks for policy like review gates or finish checks

## A Tiny Example

```yaml
---
id: T-0042
title: Add review queue
epic: E-0001
status: ready
depends_on: [T-0038]
assigned_to: codex/main
references:
  - docs/EXECUTION_MODEL.md
---
```

That is enough for the toolchain to understand the work item, validate it, place it on the board, derive readiness, and coordinate execution.

## Repo Layout

- `apps/docs/` Astro landing page
- `spec/` standard docs
- `packages/core/` parser, validator, indexer, planning engine, and mutation layer
- `packages/cli/` the `@agenttasks/cli` package, `agenttasks` executable, TUI, MCP adapter, and coordinator
- `skills/` opinionated workflow guidance for agents
- `templates/` project templates and managed guidance blocks
- `examples/` example `.agent-tasks/` projects
- `docs/` usage and design notes

## Convention Interop

`agent-tasks` is meant to work alongside common agent-context files:

- `AGENTS.md` for passive repo-wide guidance
- `PLANS.md` or ExecPlan-style docs for long-form implementation plans
- `DESIGN.md` for design-system or UI guidance

`.agent-tasks/` stays canonical for task, workflow, dependency, and execution state. The supporting docs remain ordinary repo files and can be linked from tickets and epics via `references`.

## Guidance Stack

The repo uses a layered guidance model:

- `AGENTS.md`: short always-on repo contract
- `.agent-tasks/WORKFLOW.md`: project-local workflow semantics and execution model
- workflow skills: on-demand procedures for creating, refining, and working tickets
- `.agent-tasks/extensions/README.md`: targeted context for repo-local automation and execution policy
- CLI, TUI, and validation: discovery and enforcement affordances

That split matters. Always-on guidance should stay short. Skills should teach procedures. Extension docs should be pulled in when execution policy actually matters.

## Current Scope

V0 includes:

- the on-disk standard
- a Node-based reference CLI
- a realtime terminal UI
- dependency-aware planning
- a local MCP adapter
- a local execution model with claims and worktrees
- project-local TypeScript coordinator extensions
- one default workflow pack

V0 intentionally excludes:

- hosted sync
- any source of truth outside the repo
- a broad public plugin marketplace
- a hosted multi-tenant scheduler

## Docs

- [File format](./spec/FILE_FORMAT.md)
- [CLI reference](./docs/CLI.md)
- [Execution model](./docs/EXECUTION_MODEL.md)
- [Extensions](./docs/EXTENSIONS.md)
- [Hooks](./docs/HOOKS.md)
- [Releasing](./docs/RELEASING.md)

## Contributing

The repo is still moving quickly. If you are working inside it with agents, start with the root `AGENTS.md` plus `.agent-tasks/WORKFLOW.md`.
