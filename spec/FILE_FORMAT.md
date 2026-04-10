# File Format

## Project Config

`project.yaml` is a YAML mapping. V0 supports this shape:

```yaml
version: 1
name: Example Project
workflow:
  name: default
  statuses:
    - backlog
    - ready
    - in_progress
    - blocked
    - in_review
    - done
  transitions:
    backlog:
      - ready
      - blocked
    ready:
      - in_progress
      - blocked
    in_progress:
      - in_review
      - blocked
      - ready
    blocked:
      - ready
      - in_progress
    in_review:
      - done
      - in_progress
    done: []
  start: in_progress
  end:
    - done
  special:
    blocked:
      - blocked
    active:
      - in_review
    review:
      - in_review
id_prefixes:
  ticket: T
  epic: E
fields:
  ticket:
    - key: area
      label: Area
      type: enum
      required: true
      options:
        - frontend
        - backend
    - key: qa_required
      type: boolean
      default: false
    - key: estimate
      type: number
```

### Configurable ticket fields

- `fields.ticket` may define additional top-level ticket frontmatter fields.
- Supported field types in the reference tool are:
  - `string`
  - `number`
  - `boolean`
  - `enum`
- Built-in ticket fields such as `id`, `title`, `status`, `epic`, `assigned_to`, and `depends_on` are reserved and cannot be redefined.

## Convention Interop

`agent-tasks` is meant to coexist with common agent-context files:

- `AGENTS.md` for passive repo-wide guidance
- `PLANS.md` or other ExecPlan-style docs for long-lived execution plans
- `DESIGN.md` for design-system or UI guidance

The standard does not own those file formats. Tickets and epics may reference them as supporting documents.

### Workflow semantics

- `workflow.start` is the status the workflow considers active when work begins.
- `workflow.end` lists statuses that satisfy dependencies for planning purposes.
- `workflow.special.blocked` may list statuses that should never be treated as ready.
- `workflow.special.active` may list additional active, non-ready statuses such as review.
- `workflow.special.review` may list review or handoff statuses that `finish` should prefer.
- The reference planner falls back to terminal statuses when `workflow.end` is omitted, but explicit `end` statuses are preferred.

## Ticket File

Ticket files live in `.agent-tasks/tickets/`.

```md
---
id: T-0001
title: Build parser
status: ready
epic: E-0001
kind: feature
priority: medium
assigned_to: codex/main
depends_on:
  - T-0002
references:
  - docs/plans/parser.md
  - docs/DESIGN.md
labels:
  - parser
  - core
points: 3
created_at: 2026-04-09
updated_at: 2026-04-09
area: frontend
qa_required: false
estimate: 3
---

## Context

Freeform Markdown body.
```

### Required fields

- `id`
- `title`
- `status`

### Optional fields

- `epic`
- `kind`
- `priority`
- `assigned_to`
- `depends_on`
- `labels`
- `points`
- `references`
- `created_at`
- `updated_at`
- project-defined ticket fields declared in `project.yaml`

## Epic File

Epic files live in `.agent-tasks/epics/`.

```md
---
id: E-0001
title: Foundations
status: backlog
priority: high
labels:
  - v0
references:
  - docs/EXECUTION_MODEL.md
created_at: 2026-04-09
updated_at: 2026-04-09
---

## Goal

Freeform Markdown body.
```

## Body Rules

- The body is user-customizable Markdown.
- The standard does not require named sections.
- Workflow packs may recommend section layouts and templates.

## Relationship Rules

- `depends_on` is the only stored dependency direction.
- Reverse dependencies are derived.
- Missing dependency targets are validation errors.
- Dependencies must reference tickets, not epics.
- Self-dependencies are invalid.
- Dependency cycles are validation errors in the reference tool.
- Readiness is computed from `depends_on` plus workflow `end` semantics.

## Reference Rules

- `references` is an optional list of repo-relative file paths.
- References may point to design docs, plans, specs, or other supporting files.
- Absolute paths are invalid.
- Paths that resolve outside the repo are invalid.
- Missing reference targets are validation errors in the reference tool.

## Runtime Rules

- `.agent-tasks/.runtime/` is local execution state and should be gitignored.
- Runtime files are not canonical task state.
- The reference tool stores claims, workspaces, locks, and coordinator metadata there.
