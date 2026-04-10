import type { ProjectConfig } from "./types.js";
import {
  GENERATED_DEFAULT_AGENT_GUIDANCE_BLOCK,
  GENERATED_DEFAULT_EXTENSION_AUTO_TEST_ON_FINISH,
  GENERATED_DEFAULT_EXTENSION_MERGE_HANDOFF,
  GENERATED_DEFAULT_EXTENSION_REVIEW_QUEUE,
  GENERATED_DEFAULT_EXTENSION_STALE_WORKER,
  GENERATED_DEFAULT_EXTENSIONS_API,
  GENERATED_DEFAULT_EXTENSIONS_README,
  GENERATED_DEFAULT_EPIC_TEMPLATE,
  GENERATED_DEFAULT_GITIGNORE_BLOCK,
  GENERATED_DEFAULT_SKILL_CREATING_TICKETS,
  GENERATED_DEFAULT_SKILL_MANAGING_STATUS,
  GENERATED_DEFAULT_SKILL_REFINING_TICKETS,
  GENERATED_DEFAULT_SKILL_WORKING_TICKETS,
  GENERATED_DEFAULT_TASKS_README,
  GENERATED_DEFAULT_TICKET_TEMPLATE,
  GENERATED_DEFAULT_WORKFLOW_GUIDE
} from "./generated-default-content.js";

export const TASKS_DIR = ".agent-tasks";
export const PROJECT_CONFIG = "project.yaml";
export const TICKETS_DIR = "tickets";
export const EPICS_DIR = "epics";
export const TEMPLATES_DIR = "templates";
export const EXTENSIONS_DIR = "extensions";
export const RUNTIME_DIR = ".runtime";
export const RUNTIME_CLAIMS_DIR = "claims";
export const RUNTIME_WORKSPACES_DIR = "workspaces";
export const RUNTIME_LOCKS_DIR = "locks";
export const RUNTIME_SERVER_FILE = "server.json";
export const AGENTS_FILE = "AGENTS.md";
export const AGENTS_MANAGED_START = "<!-- agenttasks:managed:start -->";
export const AGENTS_MANAGED_END = "<!-- agenttasks:managed:end -->";
export const GITIGNORE_FILE = ".gitignore";
export const GITIGNORE_MANAGED_START = "# agenttasks:managed:start";
export const GITIGNORE_MANAGED_END = "# agenttasks:managed:end";
export const WORKFLOW_FILE = "WORKFLOW.md";
export const AGENT_SKILLS_DIR = ".agents";
export const AGENT_SKILLS_SUBDIR = "skills";
export const DEFAULT_WORKFLOW_PACK = "agent-tasks-default-workflow";

export const DEFAULT_WORKFLOW_NAME = "default";

export const DEFAULT_PROJECT_CONFIG: ProjectConfig = {
  version: 1,
  name: "Agent Tasks Project",
  workflow: {
    name: DEFAULT_WORKFLOW_NAME,
    statuses: ["backlog", "ready", "in_progress", "blocked", "in_review", "done"],
    transitions: {
      backlog: ["ready", "blocked"],
      ready: ["in_progress", "blocked"],
      in_progress: ["in_review", "blocked", "ready"],
      blocked: ["ready", "in_progress"],
      in_review: ["done", "in_progress"],
      done: []
    },
    start: "in_progress",
    end: ["done"],
    special: {
      blocked: ["blocked"],
      active: ["in_review"],
      review: ["in_review"]
    }
  },
  id_prefixes: {
    ticket: "T",
    epic: "E"
  }
};

export const DEFAULT_TICKET_TEMPLATE = GENERATED_DEFAULT_TICKET_TEMPLATE;
export const DEFAULT_EPIC_TEMPLATE = GENERATED_DEFAULT_EPIC_TEMPLATE;
export const DEFAULT_TICKET_BODY = DEFAULT_TICKET_TEMPLATE;
export const DEFAULT_EPIC_BODY = DEFAULT_EPIC_TEMPLATE;
export const DEFAULT_TASKS_README = GENERATED_DEFAULT_TASKS_README;
export const DEFAULT_WORKFLOW_GUIDE = GENERATED_DEFAULT_WORKFLOW_GUIDE;
export const DEFAULT_EXTENSIONS_README = GENERATED_DEFAULT_EXTENSIONS_README;
export const DEFAULT_EXTENSIONS_API = GENERATED_DEFAULT_EXTENSIONS_API;
export const DEFAULT_EXTENSION_REVIEW_QUEUE = GENERATED_DEFAULT_EXTENSION_REVIEW_QUEUE;
export const DEFAULT_EXTENSION_AUTO_TEST_ON_FINISH = GENERATED_DEFAULT_EXTENSION_AUTO_TEST_ON_FINISH;
export const DEFAULT_EXTENSION_MERGE_HANDOFF = GENERATED_DEFAULT_EXTENSION_MERGE_HANDOFF;
export const DEFAULT_EXTENSION_STALE_WORKER = GENERATED_DEFAULT_EXTENSION_STALE_WORKER;
export const DEFAULT_AGENT_GUIDANCE_BLOCK = GENERATED_DEFAULT_AGENT_GUIDANCE_BLOCK;
export const DEFAULT_GITIGNORE_BLOCK = GENERATED_DEFAULT_GITIGNORE_BLOCK;
export const DEFAULT_SKILL_CREATING_TICKETS = GENERATED_DEFAULT_SKILL_CREATING_TICKETS;
export const DEFAULT_SKILL_REFINING_TICKETS = GENERATED_DEFAULT_SKILL_REFINING_TICKETS;
export const DEFAULT_SKILL_WORKING_TICKETS = GENERATED_DEFAULT_SKILL_WORKING_TICKETS;
export const DEFAULT_SKILL_MANAGING_STATUS = GENERATED_DEFAULT_SKILL_MANAGING_STATUS;
