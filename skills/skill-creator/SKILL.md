---
name: skill-creator
description: Create new skills or improve existing ones. Use when a user wants to turn a repeated workflow into a skill, refine a SKILL.md, tighten skill trigger metadata, add validation prompts, or compare versions of a skill to see whether it actually helps.
---

# Skill Creator

Use this skill to define, revise, and validate skills. The goal is not just to write a `SKILL.md`, but to end up with a skill that triggers at the right times and improves outcomes in real use.

## Workflow

### 1. Capture intent

Start by extracting what is already known from the conversation and repo before asking questions.

Clarify these points:

1. What should the skill help the agent do?
2. When should it trigger?
3. What should the output or end state look like?
4. Is the task objective enough to benefit from validation prompts or benchmarks?

If the user is revising an existing skill, identify what is failing now: under-triggering, over-triggering, weak instructions, missing examples, or poor results during execution.

### 2. Gather examples and constraints

Collect concrete inputs before writing:

- repeated user requests this skill should cover
- example prompts the skill should handle
- edge cases and failure modes
- tools, files, or external systems the skill depends on

Ask only for the missing pieces. If the conversation already contains a workflow, treat that as the primary source material.

### 3. Draft the skill

Every skill should have a required `SKILL.md` and only the extra files it genuinely needs.

Minimal layout:

```text
skill-name/
├── SKILL.md
├── scripts/        # optional; use for deterministic or repetitive steps
├── references/     # optional; load only when needed
└── assets/         # optional; templates or other output resources
```

Write the frontmatter first:

- `name`: short, stable identifier
- `description`: what the skill does and when it should trigger

The description is the main trigger surface. Make it specific enough that the skill is not missed when it would help.

### 4. Keep the skill lean

Prefer concise instructions over long explanations. Assume the model is already capable and only add information that changes behavior materially.

Use progressive disclosure:

- keep core workflow in `SKILL.md`
- move detailed docs into `references/`
- put scripts in `scripts/` when reliability matters
- avoid extra docs like `README.md`, `CHANGELOG.md`, or process notes unless the system explicitly requires them

### 5. Write for execution

Prefer imperative instructions. Explain why a rule matters when that helps the model generalize.

Good patterns:

- state when to use the skill
- define the expected output or success condition
- include a small number of realistic examples when examples disambiguate behavior
- call out important failure modes or edge cases

Avoid:

- vague advice with no trigger cues
- example-specific rules that will overfit
- instructions that duplicate general model knowledge

### 6. Validate the skill

After drafting, create a short set of realistic test prompts. Two to five strong prompts is usually enough for an iteration.

If the environment supports subagents, compare:

- current skill vs no skill for new skills
- revised skill vs previous skill for edits

If subagents are not available, run the prompts inline and review the outputs critically.

Focus on:

- whether the skill triggers when it should
- whether the output quality improves
- whether the skill creates regressions or unnecessary rigidity
- whether the prompt became longer without adding value

### 7. Iterate

Revise based on observed failures, not just taste.

When improving the skill:

- generalize from patterns instead of patching for one example
- remove instructions that did not affect outcomes
- tighten trigger metadata if the skill is missed
- simplify any section that creates confusion or token bloat

## Writing Checklist

Before considering the skill done, verify:

- the `description` says both what the skill does and when to use it
- the body is concise and operational
- optional resources are referenced clearly from `SKILL.md`
- examples, if present, are realistic
- the skill does not depend on hidden context
- the skill does not ask the agent to do unsafe or misleading things

## Deliverables

When using this skill, aim to leave behind:

1. a usable `SKILL.md`
2. any necessary supporting files
3. a short set of validation prompts if the skill benefits from testing
4. a concise note on remaining risks or open questions
