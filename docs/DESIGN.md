# Design Notes

## Why files instead of a database?

Because the standard is the product.

Database-backed task systems can be powerful, but they tend to make the application the source of truth. `agent-tasks` intentionally keeps state in the repo so the planning model remains inspectable, portable, and agent-agnostic.

## Why freeform Markdown bodies?

Because teams should be able to shape task bodies to their workflow without forking the standard. The standard only fixes the structural minimum. Workflow packs provide conventions on top.

## Why first-class epics?

Epics need a stable home for goals, scope, and grouping. Treating them as labels makes future project views weaker and overloads labels with meaning they should not have.
