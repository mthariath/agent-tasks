# Extensions

Project-local coordinator extensions live here.

## How They Work

- `agenttasks serve` and other execution entrypoints load TypeScript extensions from this directory.
- Extensions can register lifecycle hooks for execution events and explicit project-local commands.
- Core execution invariants still live in the coordinator. Extensions add policy and automation on top.

## Active Extension Files

The loader activates:

- `*.ts` files directly in this directory
- `*/index.ts` files in subdirectories

The loader ignores:

- `api.ts`
- `*.example.ts`

## Starting Point

1. Copy an example into this directory or a subdirectory.
2. Edit the extension id and hook logic.
3. Start `agenttasks serve` or run a lifecycle command.
4. Inspect hook runs with `agenttasks hook-runs`.

Keep extension logic project-local and focused. If an extension needs to enforce a rule, prefer a blocking `before_*` hook. If it only reacts to committed work, use an `after_*` hook.
