import { parseYAML, stringifyYAML } from "./yaml.js";

export interface ParsedFrontmatter<T> {
  attributes: T;
  body: string;
}

export function parseFrontmatter<T>(input: string): ParsedFrontmatter<T> {
  const normalized = input.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    throw new Error("Markdown file is missing YAML frontmatter");
  }

  const end = normalized.indexOf("\n---\n", 4);
  if (end === -1) {
    throw new Error("Markdown frontmatter is not closed");
  }

  const rawAttributes = normalized.slice(4, end);
  const body = normalized.slice(end + 5).replace(/^\n/, "");
  return {
    attributes: parseYAML<T>(rawAttributes),
    body
  };
}

export function stringifyFrontmatter(attributes: object, body: string): string {
  return `---\n${stringifyYAML(attributes)}---\n\n${body.trimEnd()}\n`;
}
