export function padId(prefix: string, value: number): string {
  return `${prefix}-${String(value).padStart(4, "0")}`;
}

export function nowDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function nowTimestamp(): string {
  return new Date().toISOString();
}

export function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "ticket";
}
