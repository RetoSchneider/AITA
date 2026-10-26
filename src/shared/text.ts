export function clip(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n[${text.length - limit} more characters]`;
}

export function toPosix(value: string): string {
  return value.replaceAll("\\", "/");
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function plural(
  count: number,
  singular: string,
  pluralForm = `${singular}s`,
): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}
