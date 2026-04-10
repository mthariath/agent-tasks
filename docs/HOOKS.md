# Hooks

Hooks are coordinator lifecycle handlers registered by project-local extensions.

## Event Set

Current events:

- `after_claim`
- `before_start`
- `after_start`
- `before_finish`
- `after_finish`
- `after_block`
- `after_release`
- `review_requested`

## Semantics

- `before_*` hooks are blocking.
- `after_*` hooks are observational and run after committed state changes.
- `review_requested` fires after a successful finish when the coordinator resolved a review or handoff state.

## Blocking

A blocking hook may reject an action by returning:

```ts
return context.block("tests must pass before finish", "finish_checks_required")
```

If a blocking hook rejects:

- the guarded action does not proceed
- the hook run record is marked `blocked`
- the caller gets the structured rejection detail

## Failures

- blocking hook failures cancel the action
- non-blocking hook failures are recorded and surfaced, but do not roll back committed state
- interrupted in-flight runs are marked `abandoned` on the next coordinator startup

## Run Records

Hook run records live under `.agent-tasks/.runtime/hooks/` and include:

- extension id
- hook id
- event
- status
- timestamps
- ticket id when applicable
- payload
- error detail when blocked or failed
