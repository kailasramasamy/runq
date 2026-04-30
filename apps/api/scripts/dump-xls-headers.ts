/**
 * Quick script to dump the first 20 rows of an XLS/XLSX file.
 * Usage: tsx apps/api/scripts/dump-xls-headers.ts <path-to-file>
 */
import * as XLSX from 'xlsx';
import { readFileSync } from 'fs';

const filePath = process.argv[2];
if (!filePath) { console.error('Usage: tsx dump-xls-headers.ts <file>'); process.exit(1); }

const buffer = readFileSync(filePath);
const workbook = XLSX.read(buffer, { type: 'buffer' });
const sheetName = workbook.SheetNames[0]!;
const sheet = workbook.Sheets[sheetName]!;
const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });

console.log(`Sheet: ${sheetName}, Total rows: ${rows.length}\n`);
for (let i = 0; i < Math.min(rows.length, 20); i++) {
  console.log(`Row ${i}: ${JSON.stringify(rows[i])}`);
}
