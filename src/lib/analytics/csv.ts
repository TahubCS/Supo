// Pure CSV helpers (RFC 4180) with spreadsheet formula-injection protection.

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = value instanceof Date ? value.toISOString() : String(value);
  // Customer-controlled text must not be evaluated as a formula by Excel/Sheets.
  if (typeof value === "string" && FORMULA_PREFIX.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(",");
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [csvRow(header), ...rows.map(csvRow)].join("\r\n") + "\r\n";
}
