/**
 * CSV export helpers (Phase 5.1). Pure serialization + a download trigger —
 * no dependency, Excel-safe (quoted cells, CRLF line endings, UTF-8 BOM).
 */

const escapeCell = (value: unknown): string => {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
};

/** Serialize rows to CSV text. Column order: `headers` when given, else the
 *  union of keys from the first rows. */
export const toCsv = (
  rows: Array<Record<string, unknown>>,
  headers?: string[],
): string => {
  if (rows.length === 0) return (headers ?? []).length ? `${headers!.join(',')}\r\n` : '';
  const cols = headers ?? Array.from(new Set(rows.flatMap(row => Object.keys(row))));
  const lines = [cols.map(col => escapeCell(col)).join(',')];
  for (const row of rows) {
    lines.push(cols.map(col => escapeCell(row[col])).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
};

/** Trigger a client-side CSV download. */
export const downloadCsv = (
  filename: string,
  rows: Array<Record<string, unknown>>,
  headers?: string[],
): void => {
  // BOM so Excel opens UTF-8 (student names in Devanagari, etc.) correctly.
  const blob = new Blob([`\uFEFF${toCsv(rows, headers)}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
