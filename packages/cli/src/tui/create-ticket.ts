import type { ProjectIndex, TicketFieldDefinition, TicketFieldType, TicketFieldValue } from "@agenttasks/core";

import { ALL_EPICS_ID } from "./model.js";
import { formatFieldLabel, formatStatus } from "./strings.js";

export interface CreateDialogOption {
  name: string;
  description: string;
  value: string;
}

export interface CreateFieldSpec {
  key: string;
  label: string;
  type: TicketFieldType;
  required?: boolean;
  help?: string;
  options?: CreateDialogOption[];
  placeholder?: string;
  builtIn?: boolean;
}

export interface CreateTicketSubmission {
  title: string;
  status?: string;
  epic?: string;
  kind?: string;
  priority?: string;
  assigned_to?: string;
  customFields?: Record<string, TicketFieldValue>;
}

export function getCreateTicketFieldSpecs(index: ProjectIndex): CreateFieldSpec[] {
  const customDefinitions = index.config.fields?.ticket ?? [];
  const customFieldSpecs: CreateFieldSpec[] = customDefinitions.map((field) => ({
    key: field.key,
    label: formatFieldLabel(field),
    type: field.type,
    required: field.required,
    help: field.help,
    options: field.type === "enum"
      ? [
          ...(field.required ? [] : [{ name: "(unset)", description: "Leave this field empty", value: "" }]),
          ...(field.options ?? []).map((option) => ({
            name: option,
            description: `Set ${formatFieldLabel(field)} to ${option}`,
            value: option
          }))
        ]
      : field.type === "boolean"
        ? [
            ...(field.required ? [] : [{ name: "(unset)", description: "Leave this field empty", value: "" }]),
            { name: "true", description: `Set ${formatFieldLabel(field)} to true`, value: "true" },
            { name: "false", description: `Set ${formatFieldLabel(field)} to false`, value: "false" }
          ]
        : undefined
  }));

  return [
    { key: "title", label: "Title", type: "string", required: true, builtIn: true, placeholder: "Add dependency graph view" },
    {
      key: "status",
      label: "Status",
      type: "enum",
      required: true,
      builtIn: true,
      options: index.config.workflow.statuses.map((status) => ({
        name: formatStatus(status),
        description: `Create the ticket in ${formatStatus(status)}`,
        value: status
      }))
    },
    {
      key: "epic",
      label: "Epic",
      type: "enum",
      builtIn: true,
      options: [
        { name: "(none)", description: "Do not attach this ticket to an epic", value: "" },
        ...index.epics.map((epic) => ({
          name: `${epic.frontmatter.id} · ${epic.frontmatter.title}`,
          description: `Attach the ticket to ${epic.frontmatter.id}`,
          value: epic.frontmatter.id
        }))
      ]
    },
    { key: "kind", label: "Kind", type: "string", builtIn: true, placeholder: "feature" },
    { key: "priority", label: "Priority", type: "string", builtIn: true, placeholder: "medium" },
    { key: "assigned_to", label: "Assigned To", type: "string", builtIn: true, placeholder: "codex/main" },
    ...customFieldSpecs
  ];
}

export function getCreateTicketInitialValues(index: ProjectIndex, selectedEpicId: string): Record<string, string> {
  const customDefinitions = index.config.fields?.ticket ?? [];
  return {
    title: "",
    status: index.config.workflow.statuses[0] ?? "",
    epic: selectedEpicId !== ALL_EPICS_ID ? selectedEpicId : "",
    kind: "",
    priority: "",
    assigned_to: "",
    ...Object.fromEntries(customDefinitions.map((field) => [
      field.key,
      field.default === undefined ? "" : String(field.default)
    ]))
  };
}

export function getCreateTicketValueLabel(field: CreateFieldSpec, value: string): string {
  if (value === "") {
    return field.required ? "(required)" : "(unset)";
  }
  if (field.type === "boolean") {
    return value === "true" ? "true" : value === "false" ? "false" : value;
  }
  const option = field.options?.find((item) => item.value === value);
  return option?.name ?? value;
}

export function getCreateTicketReviewRows(index: ProjectIndex, values: Record<string, string>): Array<{ key: string; label: string; value: string; required?: boolean }> {
  return getCreateTicketFieldSpecs(index).map((field) => ({
    key: field.key,
    label: field.label,
    value: getCreateTicketValueLabel(field, values[field.key] ?? ""),
    required: field.required
  }));
}

function parseFieldValue(field: TicketFieldDefinition, value: string): TicketFieldValue {
  if (field.type === "number") {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) {
      throw new Error(`${formatFieldLabel(field)} must be a number`);
    }
    return parsed;
  }

  if (field.type === "boolean") {
    if (value !== "true" && value !== "false") {
      throw new Error(`${formatFieldLabel(field)} must be true or false`);
    }
    return value === "true";
  }

  if (field.type === "enum") {
    if (!field.options?.includes(value)) {
      throw new Error(`${formatFieldLabel(field)} must be one of ${field.options?.join(", ") ?? "the configured options"}`);
    }
    return value;
  }

  return value;
}

function requireNonEmpty(label: string, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} is required`);
  }
  return trimmed;
}

export function getCreateTicketSubmission(index: ProjectIndex, values: Record<string, string>): CreateTicketSubmission {
  const title = requireNonEmpty("title", values.title ?? "");
  const status = requireNonEmpty("status", values.status ?? "");

  if (!index.config.workflow.statuses.includes(status)) {
    throw new Error(`status must be one of ${index.config.workflow.statuses.join(", ")}`);
  }

  const customDefinitions = index.config.fields?.ticket ?? [];
  const customFields: Record<string, TicketFieldValue> = {};

  for (const field of customDefinitions) {
    const rawValue = (values[field.key] ?? "").trim();
    if (!rawValue) {
      if (field.required) {
        throw new Error(`${formatFieldLabel(field)} is required`);
      }
      continue;
    }
    customFields[field.key] = parseFieldValue(field, rawValue);
  }

  return {
    title,
    status,
    epic: values.epic?.trim() ? values.epic.trim() : undefined,
    kind: values.kind?.trim() ? values.kind.trim() : undefined,
    priority: values.priority?.trim() ? values.priority.trim() : undefined,
    assigned_to: values.assigned_to?.trim() ? values.assigned_to.trim() : undefined,
    customFields: Object.keys(customFields).length > 0 ? customFields : undefined
  };
}
