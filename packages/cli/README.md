# @agenttasks/cli

`agenttasks` is the reference CLI and TUI for the `agent-tasks` file format.

## Install

```bash
npm install -g @agenttasks/cli@next
```

The general CLI runs on Node.

`agenttasks tui` currently requires [Bun](https://bun.sh) in this beta release because the OpenTUI renderer is launched through Bun.

## Common Commands

```bash
agenttasks init --name "My Project"
agenttasks validate
agenttasks ready
agenttasks plan
agenttasks serve
agenttasks mcp
agenttasks tui
```

## Docs

- Repo: https://github.com/mthariath/agent-tasks
- CLI reference: https://github.com/mthariath/agent-tasks/blob/main/docs/CLI.md
- Execution model: https://github.com/mthariath/agent-tasks/blob/main/docs/EXECUTION_MODEL.md
- Extensions: https://github.com/mthariath/agent-tasks/blob/main/docs/EXTENSIONS.md
