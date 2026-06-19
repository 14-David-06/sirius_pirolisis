export function escapeAirtableValue(value: string): string {
  return value
    .replace(/[\x00-\x1f\x7f]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'");
}
