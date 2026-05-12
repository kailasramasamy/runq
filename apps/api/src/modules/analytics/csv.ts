function escape(v: unknown): string {
  if (v == null) return '';
  const s = typeof v === 'string' ? v : String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => unknown;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [columns.map((c) => escape(c.header)).join(',')];
  for (const row of rows) {
    lines.push(columns.map((c) => escape(c.value(row))).join(','));
  }
  return lines.join('\n');
}

export const CSV_HEADERS = {
  'content-type': 'text/csv; charset=utf-8',
} as const;

export function csvFilenameHeader(name: string): Record<string, string> {
  const safe = name.replace(/[^a-zA-Z0-9_-]+/g, '_');
  return { 'content-disposition': `attachment; filename="${safe}.csv"` };
}
