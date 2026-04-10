# Specification Overview

`agent-tasks` defines a git-native project planning format for humans and agents.

## Core Principles

- Files in the repo are canonical.
- The format must be understandable without a dedicated app.
- Agents should be able to read and mutate task state safely.
- Workflow configuration belongs in project config, not hardcoded in the tool.
- Ticket bodies are freeform Markdown; workflow packs recommend structure without making it mandatory.

## Required Project Structure

```text
.agent-tasks/
├── project.yaml
├── README.md
├── WORKFLOW.md
├── epics/
├── tickets/
└── templates/
```

## Required Ticket Fields

- `id`
- `title`
- `status`

## Configurable Workflow

Statuses and transitions live in `.agent-tasks/project.yaml`. The reference tool validates values and enforces transitions during status changes.

## Optional Assignment

Tickets may include `assigned_to` as a freeform single-value identity for a human or agent, such as `mickey`, `codex/main`, or `pi/refiner`.

## First-Class Epics

Epics are their own Markdown files. They are not labels and they are not special ticket subtypes in v0.
