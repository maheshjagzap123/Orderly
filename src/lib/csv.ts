/** Minimal, dependency-free CSV helpers for client-side report export. */

/** Escape a single CSV cell (quote when it contains comma, quote, or newline). */
function escapeCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Build a CSV string from a header row + data rows. */
export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  const lines = [headers.map(escapeCell).join(",")];
  for (const row of rows) lines.push(row.map(escapeCell).join(","));
  return lines.join("\r\n");
}

/** Trigger a browser download of CSV text as a .csv file. */
export function downloadCsv(filename: string, csv: string): void {
  // Prepend a UTF-8 BOM so Excel opens non-ASCII (₹, names) correctly.
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
