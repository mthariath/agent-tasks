# Releasing

The first public npm release should be published as a beta (`next`), not `latest`.

## Preconditions

- `pnpm install`
- `pnpm release:smoke`
- npm auth configured for the publishing account

## Publish Order

Publish the core package first, then the CLI:

```bash
cd packages/core
pnpm publish --tag next --access public

cd ../cli
pnpm publish --tag next --access public
```

## Install Check

After publishing, verify from a clean temp directory:

```bash
npm install -g @agenttasks/cli@next
agenttasks --help
agenttasks init --name "Smoke"
agenttasks validate
agenttasks ready
agenttasks plan
```

## Runtime Contract

- general CLI commands run on Node
- `agenttasks tui` requires Bun in the current beta release
- `serve` and `mcp` use the same file-backed engine as the CLI
