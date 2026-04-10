type Scalar = string | number | boolean | null;
type YAMLValue = Scalar | YAMLMap | YAMLValue[];
export interface YAMLMap {
  [key: string]: YAMLValue;
}

interface ParsedLine {
  indent: number;
  content: string;
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function parseScalar(raw: string): YAMLValue {
  const value = raw.trim();
  if (value === "") {
    return "";
  }
  if (value === "null") {
    return null;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  if (/^-?\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }
  if (/^-?\d+\.\d+$/.test(value)) {
    return Number.parseFloat(value);
  }
  if (value === "[]") {
    return [];
  }
  return stripQuotes(value);
}

function normalizeLines(input: string): ParsedLine[] {
  return input
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => ({
      indent: line.match(/^ */)?.[0].length ?? 0,
      content: line.trimEnd()
    }))
    .filter((line) => {
      const trimmed = line.content.trim();
      return trimmed !== "" && !trimmed.startsWith("#");
    });
}

function parseSequence(lines: ParsedLine[], start: number, indent: number): [YAMLValue[], number] {
  const items: YAMLValue[] = [];
  let index = start;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.content.trim();
    if (line.indent < indent || !trimmed.startsWith("- ")) {
      break;
    }
    if (line.indent > indent) {
      throw new Error(`Invalid indentation near "${trimmed}"`);
    }

    const valueText = trimmed.slice(2).trim();
    const mappingMatch = valueText.match(/^([^:]+):(.*)$/);
    if (mappingMatch) {
      const syntheticLine: ParsedLine = {
        indent: indent + 2,
        content: `${mappingMatch[1].trim()}:${mappingMatch[2]}`
      };
      const [nested, nextIndex] = parseMapping([syntheticLine, ...lines.slice(index + 1)], 0, indent + 2);
      items.push(nested);
      index += nextIndex;
      continue;
    }

    if (valueText === "") {
      const next = lines[index + 1];
      if (!next || next.indent <= indent) {
        items.push("");
        index += 1;
        continue;
      }
      const [nested, nextIndex] = parseBlock(lines, index + 1, next.indent);
      items.push(nested);
      index = nextIndex;
      continue;
    }

    items.push(parseScalar(valueText));
    index += 1;
  }

  return [items, index];
}

function parseMapping(lines: ParsedLine[], start: number, indent: number): [YAMLMap, number] {
  const result: YAMLMap = {};
  let index = start;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.content.trim();
    if (line.indent < indent || trimmed.startsWith("- ")) {
      break;
    }
    if (line.indent > indent) {
      throw new Error(`Invalid indentation near "${trimmed}"`);
    }

    const match = trimmed.match(/^([^:]+):(.*)$/);
    if (!match) {
      throw new Error(`Invalid YAML line "${trimmed}"`);
    }

    const [, rawKey, rawRest] = match;
    const key = rawKey.trim();
    const rest = rawRest.trim();

    if (rest !== "") {
      result[key] = parseScalar(rest);
      index += 1;
      continue;
    }

    const next = lines[index + 1];
    if (!next || next.indent <= indent) {
      result[key] = "";
      index += 1;
      continue;
    }

    const [nested, nextIndex] = parseBlock(lines, index + 1, next.indent);
    result[key] = nested;
    index = nextIndex;
  }

  return [result, index];
}

function parseBlock(lines: ParsedLine[], start: number, indent: number): [YAMLValue, number] {
  const first = lines[start];
  if (!first) {
    return [{}, start];
  }
  if (first.content.trim().startsWith("- ")) {
    return parseSequence(lines, start, indent);
  }
  return parseMapping(lines, start, indent);
}

export function parseYAML<T>(input: string): T {
  const lines = normalizeLines(input);
  if (lines.length === 0) {
    return {} as T;
  }
  const [parsed] = parseBlock(lines, 0, lines[0].indent);
  if (Array.isArray(parsed) || parsed === null || typeof parsed !== "object") {
    throw new Error("Top-level YAML document must be a mapping");
  }
  return parsed as T;
}

function formatScalar(value: YAMLValue): string {
  if (typeof value === "string") {
    if (value === "" || /[:#\n]/.test(value)) {
      return JSON.stringify(value);
    }
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value === null) {
    return "null";
  }
  return "";
}

function stringifyValue(value: YAMLValue, indent = 0): string[] {
  const prefix = " ".repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return [`${prefix}[]`];
    }
    return value.flatMap((item) => {
      if (Array.isArray(item) || (item && typeof item === "object")) {
        const nested = stringifyValue(item, indent + 2);
        const [first, ...rest] = nested;
        return [`${prefix}- ${first.trimStart()}`, ...rest];
      }
      return [`${prefix}- ${formatScalar(item)}`];
    });
  }

  if (value && typeof value === "object") {
    const lines: string[] = [];
    for (const [key, child] of Object.entries(value)) {
      if (child === undefined) {
        continue;
      }
      if (Array.isArray(child) && child.length === 0) {
        lines.push(`${prefix}${key}: []`);
      } else if (Array.isArray(child) || (child !== null && typeof child === "object")) {
        lines.push(`${prefix}${key}:`);
        lines.push(...stringifyValue(child, indent + 2));
      } else {
        lines.push(`${prefix}${key}: ${formatScalar(child)}`);
      }
    }
    return lines;
  }

  return [`${prefix}${formatScalar(value)}`];
}

export function stringifyYAML(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Top-level YAML document must be a mapping");
  }
  return `${stringifyValue(value as YAMLMap).join("\n")}\n`;
}
