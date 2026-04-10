# Extensions

`agent-tasks` supports project-local TypeScript extensions for coordinator behavior.

## Boundary

- Core workflow and execution invariants stay in `agent-tasks`.
- Extensions add project-specific policy and automation.
- Extensions do not replace tickets, workflow transitions, or dependency validation.

## Location

Project-local extensions live under `.agent-tasks/extensions/`.

The loader activates:

- `.agent-tasks/extensions/*.ts`
- `.agent-tasks/extensions/*/index.ts`

The loader ignores helper and template files such as `api.ts` and `*.example.ts`.

## API

Each extension exports a default object with:

- `id`
- `setup(api)`

The `api` surface is intentionally small:

- `on(event, handler)`
- `registerCommand(name, handler, description?)`

Handlers receive:

- project root
- event payload or command input
- logger
- `getIndex()` for a fresh project snapshot
- `block(detail, code?)` in hook contexts for blocking `before_*` hooks

## Loading and Failure Model

- Extensions load in stable path order.
- Duplicate extension ids or command names are rejected.
- Load failures are recorded in coordinator status and do not stop other extensions from loading.
- Hook runs are persisted under `.agent-tasks/.runtime/hooks/`.

## What To Put Here

Good fits:

- finish checks
- review queue automation
- stale worker escalation
- merge or PR handoff preparation
- project-specific notifications

Bad fits:

- replacing workflow transitions
- mutating ticket files directly
- storing canonical work state outside `.agent-tasks/`
