export function escapeCell(value: string): string {
  return escapeText(value.replace(/\r?\n/g, " "));
}

export function escapeText(value: string): string {
  return escapeHtml(value)
    .replace(/[\\`*_[\]{}()#+!|>-]/g, "\\$&")
    .replace(/^(\s*\d+)\.(?=\s)/gm, "$1\\.");
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function codeSpan(value: string): string {
  const text = value.replace(/\r?\n/g, " ");
  const longest = Math.max(
    0,
    ...(text.match(/`+/g) ?? []).map((run) => run.length),
  );
  const fence = "`".repeat(longest + 1);
  const padding = longest > 0 || /^\s|\s$/.test(text) ? " " : "";
  return `${fence}${padding}${text}${padding}${fence}`;
}
