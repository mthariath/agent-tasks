<!-- agenttasks:managed:start -->
## agent-tasks

This repository uses `.agent-tasks/` as canonical planning state for project work.

- Before significant implementation, read the relevant ticket or epic plus `.agent-tasks/project.yaml` and `.agent-tasks/WORKFLOW.md`.
- Read referenced supporting docs such as `PLANS.md`, `DESIGN.md`, specs, or runbooks when they are relevant to the task.
- Prefer tickets that are actually ready from dependency and workflow semantics.
- If execution policy or repo-local automation matters, check `.agent-tasks/extensions/README.md`.
- Keep dependencies and status accurate as work changes.
- When working under a ticket, keep its status and body current.
- If coordinator-backed execution is available, prefer lifecycle actions over ad hoc status or file edits.
- Respect configured workflow transitions instead of assuming status names.
- Use the installed `agent-tasks` workflow skills when they match the task.
<!-- agenttasks:managed:end -->
