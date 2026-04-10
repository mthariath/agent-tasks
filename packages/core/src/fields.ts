import type {
  ProjectConfig,
  Ticket,
  TicketFieldDefinition,
  TicketFieldType,
  TicketFieldValue,
  TicketFrontmatter,
  ValidationIssue
} from "./types.js";

const RESERVED_TICKET_KEYS = new Set([
  "id",
  "title",
  "status",
  "epic",
  "kind",
  "priority",
  "assigned_to",
  "depends_on",
  "references",
  "labels",
  "points",
  "created_at",
  "updated_at"
]);

export function isReservedTicketField(key: string): boolean {
  return RESERVED_TICKET_KEYS.has(key);
}

export function getTicketFieldDefinitions(config: ProjectConfig): TicketFieldDefinition[] {
  return config.fields?.ticket ?? [];
}

export function getTicketFieldDefinitionMap(config: ProjectConfig): Map<string, TicketFieldDefinition> {
  return new Map(getTicketFieldDefinitions(config).map((definition) => [definition.key, definition]));
}

function isFieldType(value: unknown): value is TicketFieldType {
  return value === "string" || value === "number" || value === "boolean" || value === "enum";
}

function formatType(type: TicketFieldType): string {
  return type;
}

function coerceFieldValue(definition: TicketFieldDefinition, value: unknown): TicketFieldValue {
  switch (definition.type) {
    case "string":
      if (typeof value === "string") {
        return value;
      }
      break;
    case "number":
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
      break;
    case "boolean":
      if (typeof value === "boolean") {
        return value;
      }
      if (typeof value === "string") {
        if (value === "true") {
          return true;
        }
        if (value === "false") {
          return false;
        }
      }
      break;
    case "enum":
      if (typeof value === "string" && (definition.options ?? []).includes(value)) {
        return value;
      }
      break;
    default:
      break;
  }

  if (definition.type === "enum") {
    throw new Error(`field "${definition.key}" must be one of ${(definition.options ?? []).join(", ")}`);
  }
  throw new Error(`field "${definition.key}" must be a ${formatType(definition.type)}`);
}

export function normalizeTicketCustomFields(
  config: ProjectConfig,
  values: Record<string, unknown> | undefined,
  mode: "create" | "update"
): Record<string, TicketFieldValue> {
  const definitions = getTicketFieldDefinitions(config);
  const definitionMap = getTicketFieldDefinitionMap(config);
  const source = values ?? {};
  const normalized: Record<string, TicketFieldValue> = {};

  for (const key of Object.keys(source)) {
    const definition = definitionMap.get(key);
    if (!definition) {
      throw new Error(`field "${key}" is not defined in project.yaml`);
    }
    const value = source[key];
    if (value === undefined || value === null) {
      continue;
    }
    normalized[key] = coerceFieldValue(definition, value);
  }

  if (mode === "create") {
    for (const definition of definitions) {
      if (!(definition.key in normalized) && definition.default !== undefined) {
        normalized[definition.key] = coerceFieldValue(definition, definition.default);
      }
      if (definition.required && !(definition.key in normalized)) {
        throw new Error(`field "${definition.key}" is required`);
      }
    }
  }

  return normalized;
}

export function splitTicketAttributes(
  config: ProjectConfig,
  attributes: Record<string, unknown>
): {
  frontmatter: TicketFrontmatter;
  customFields: Record<string, TicketFieldValue>;
  invalidFields: Record<string, unknown>;
  extraFields: Record<string, unknown>;
} {
  const definitionMap = getTicketFieldDefinitionMap(config);
  const frontmatter: Partial<TicketFrontmatter> = {};
  const customFields: Record<string, TicketFieldValue> = {};
  const invalidFields: Record<string, unknown> = {};
  const extraFields: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(attributes)) {
    if (isReservedTicketField(key)) {
      (frontmatter as unknown as Record<string, unknown>)[key] = value;
      continue;
    }

    const definition = definitionMap.get(key);
    if (!definition) {
      extraFields[key] = value;
      continue;
    }

    try {
      customFields[key] = coerceFieldValue(definition, value);
    } catch {
      invalidFields[key] = value;
    }
  }

  return { frontmatter: frontmatter as TicketFrontmatter, customFields, invalidFields, extraFields };
}

export function serializeTicketAttributes(config: ProjectConfig, ticket: Ticket): Record<string, unknown> {
  const attributes: Record<string, unknown> = { ...ticket.frontmatter };

  for (const definition of getTicketFieldDefinitions(config)) {
    if (ticket.customFields[definition.key] !== undefined) {
      attributes[definition.key] = ticket.customFields[definition.key];
    }
  }

  for (const [key, value] of Object.entries(ticket.extraFields)) {
    if (!(key in attributes)) {
      attributes[key] = value;
    }
  }
  for (const [key, value] of Object.entries(ticket.invalidFields)) {
    if (!(key in attributes)) {
      attributes[key] = value;
    }
  }

  return attributes;
}

export function validateTicketFieldDefinitions(
  config: ProjectConfig,
  issues: ValidationIssue[],
  configFilePath: string
): void {
  const seen = new Set<string>();

  for (const definition of getTicketFieldDefinitions(config)) {
    if (!definition.key || typeof definition.key !== "string") {
      issues.push({
        level: "error",
        code: "config.fields.ticket.key",
        message: "ticket field definitions require a non-empty key",
        path: configFilePath
      });
      continue;
    }

    if (seen.has(definition.key)) {
      issues.push({
        level: "error",
        code: "config.fields.ticket.duplicate",
        message: `duplicate ticket field "${definition.key}"`,
        path: configFilePath
      });
      continue;
    }
    seen.add(definition.key);

    if (isReservedTicketField(definition.key)) {
      issues.push({
        level: "error",
        code: "config.fields.ticket.reserved",
        message: `ticket field "${definition.key}" is reserved`,
        path: configFilePath
      });
    }

    if (!isFieldType(definition.type)) {
      issues.push({
        level: "error",
        code: "config.fields.ticket.type",
        message: `ticket field "${definition.key}" has invalid type "${String(definition.type)}"`,
        path: configFilePath
      });
      continue;
    }

    if (definition.type === "enum") {
      if (!Array.isArray(definition.options) || definition.options.length === 0 || definition.options.some((option) => typeof option !== "string")) {
        issues.push({
          level: "error",
          code: "config.fields.ticket.enum",
          message: `ticket field "${definition.key}" must define string enum options`,
          path: configFilePath
        });
        continue;
      }
    } else if (definition.options !== undefined) {
      issues.push({
        level: "error",
        code: "config.fields.ticket.options",
        message: `ticket field "${definition.key}" only supports options for enum fields`,
        path: configFilePath
      });
    }

    if (definition.default !== undefined) {
      try {
        coerceFieldValue(definition, definition.default);
      } catch (error) {
        issues.push({
          level: "error",
          code: "config.fields.ticket.default",
          message: (error as Error).message,
          path: configFilePath
        });
      }
    }
  }
}

export function validateTicketCustomFields(
  config: ProjectConfig,
  ticket: Ticket,
  issues: ValidationIssue[]
): void {
  const definitions = getTicketFieldDefinitions(config);

  for (const key of Object.keys(ticket.extraFields)) {
    issues.push({
      level: "warning",
      code: "ticket.fields.unknown",
      message: `ticket "${ticket.frontmatter.id}" has undeclared custom field "${key}"`,
      entityId: ticket.frontmatter.id,
      path: ticket.path
    });
  }

  for (const [key] of Object.entries(ticket.invalidFields)) {
    issues.push({
      level: "error",
      code: "ticket.fields.invalid",
      message: `ticket "${ticket.frontmatter.id}" has invalid value for field "${key}"`,
      entityId: ticket.frontmatter.id,
      path: ticket.path
    });
  }

  for (const definition of definitions) {
    const value = ticket.customFields[definition.key];
    if (value === undefined) {
      if (definition.required) {
        issues.push({
          level: "error",
          code: "ticket.fields.required",
          message: `ticket "${ticket.frontmatter.id}" is missing required field "${definition.key}"`,
          entityId: ticket.frontmatter.id,
          path: ticket.path
        });
      }
      continue;
    }

    try {
      coerceFieldValue(definition, value);
    } catch (error) {
      issues.push({
        level: "error",
        code: "ticket.fields.invalid",
        message: `ticket "${ticket.frontmatter.id}" ${(error as Error).message}`,
        entityId: ticket.frontmatter.id,
        path: ticket.path
      });
    }
  }
}
