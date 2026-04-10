# Agent Tasks

This directory is the git-native source of truth for project planning.

- `project.yaml` defines workflow configuration such as statuses and transitions.
- `epics/` contains first-class epic files.
- `tickets/` contains work items with YAML frontmatter and Markdown bodies.
- `templates/` contains project-local body templates for new epics and tickets.

The reference CLI and TUI mutate these files directly.
