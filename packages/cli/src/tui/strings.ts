import type { TicketFieldDefinition } from "@agenttasks/core";

export function normalizeAssignee(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function formatStatus(status: string): string {
  return status.replaceAll("_", " ");
}

export function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

export function formatFieldLabel(definition: TicketFieldDefinition): string {
  return definition.label ?? definition.key.replaceAll("_", " ");
}
