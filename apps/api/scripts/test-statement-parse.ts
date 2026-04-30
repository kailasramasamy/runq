/**
 * Quick test: parse a bank statement file using the new parser.
 * Usage: tsx scripts/test-statement-parse.ts <path-to-file>
 */
import * as XLSX from 'xlsx';
import { readFileSync } from 'fs';

const filePath = process.argv[2];
if (!filePath) { console.error('Usage: tsx test-statement-parse.ts <file>'); process.exit(1); }

// Inline the core parsing logic to test without DB
const COLUMN_SYNONYMS: Record<string, RegExp> = {
  date: /\b(date|txn\s*date|transaction\s*date|trans\s*date|posting\s*date|txn\s*posted\s*date)\b/i,
  valueDate: /\b(value\s*date|val\s*dt)\b/i,
  narration: /\b(narration|description|particulars|details|remarks|transaction\s*details)\b/i,
  reference: /\b(reference|ref|chq|cheque|utr|ref\s*no|instrument|chq\s*no|transaction\s*id|trans\s*id)\b/i,
  debit: /\b(debit|dr|withdrawal|debit\s*amount|withdrawal\s*amount)\b/i,
  credit: /\b(credit|cr|deposit|credit\s*amount|deposit\s*amount)\b/i,
  balance: /\b(balance|closing\s*balance|running\s*balance|bal|available\s*balance)\b/i,
  amount: /\b(transaction\s*amount|txn\s*amount|amount)\b/i,
  crDr: /\b(cr\s*\/\s*dr|dr\s*\/\s*cr|type|cr\/dr)\b/i,
};

function detectColumns(headerRow: string[]): Record<string, number> | null {
  const map: Record<string, number> = {};
  for (let i = 0; i < headerRow.length; i++) {
    const cell = headerRow[i]!.toString().trim().toLowerCase();
    if (!cell) continue;
    for (const [field, regex] of Object.entries(COLUMN_SYNONYMS)) {
      if (regex.test(cell) && map[field] === undefined) {
        map[field] = i;
      }
    }
  }
  return Object.keys(map).length >= 2 ? map : null;
}

function parseDate(str: string): string | null {
  const clean = str.trim().replace(/"/g, '').replace(/\s+\d{1,2}:\d{2}.*$/i, '');
  const dmyMatch = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    const year = y!.length === 2 ? `20${y}` : y;
    return `${year}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
  }
  const iso = new Date(clean);
  return isNaN(iso.getTime()) ? null : iso.toISOString().slice(0, 10);
}

const buffer = readFileSync(filePath);
const workbook = XLSX.read(buffer, { type: 'buffer' });
const sheet = workbook.Sheets[workbook.SheetNames[0]!]!;
const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });

// Find header row
let headerIdx = -1;
let headerMap: Record<string, number> | null = null;
for (let i = 0; i < Math.min(rows.length, 15); i++) {
  const map = detectColumns(rows[i]!);
  if (map) {
    const hasAmount = map['debit'] !== undefined || map['credit'] !== undefined || map['amount'] !== undefined;
    const hasDate = map['date'] !== undefined || map['valueDate'] !== undefined;
    if (hasDate && hasAmount) {
      headerIdx = i;
      headerMap = map;
      break;
    }
  }
}

console.log(`Header row: ${headerIdx}`);
console.log(`Column mapping:`, headerMap);
console.log(`Header values:`, rows[headerIdx]?.join(' | '));
console.log('---');

if (!headerMap) { console.error('No header found!'); process.exit(1); }

let parsed = 0;
for (let i = headerIdx + 1; i < rows.length; i++) {
  const cols = rows[i]!;
  let dateStr = headerMap['date'] !== undefined ? (cols[headerMap['date']] ?? '').toString().trim() : '';
  dateStr = dateStr.replace(/\s+\d{1,2}:\d{2}.*$/i, '').trim();
  if (!dateStr && headerMap['valueDate'] !== undefined) {
    dateStr = (cols[headerMap['valueDate']] ?? '').toString().trim();
  }
  if (!dateStr) continue;
  const date = parseDate(dateStr);
  if (!date) continue;

  let type: string, amount: number;
  if (headerMap['amount'] !== undefined) {
    const amtStr = (cols[headerMap['amount']] ?? '').toString();
    amount = parseFloat(amtStr.replace(/[,\s]/g, '')) || 0;
    if (amount === 0) continue;
    const crDr = headerMap['crDr'] !== undefined ? (cols[headerMap['crDr']] ?? '').toString().trim().toUpperCase() : '';
    type = crDr === 'CR' ? 'credit' : 'debit';
  } else {
    const debit = parseFloat((cols[headerMap['debit'] ?? 0] ?? '').toString().replace(/[,\s]/g, '')) || 0;
    const credit = parseFloat((cols[headerMap['credit'] ?? 0] ?? '').toString().replace(/[,\s]/g, '')) || 0;
    if (debit === 0 && credit === 0) continue;
    type = credit > 0 ? 'credit' : 'debit';
    amount = credit > 0 ? credit : debit;
  }

  parsed++;
  if (parsed <= 5) {
    const narration = headerMap['narration'] !== undefined ? (cols[headerMap['narration']] ?? '').toString().slice(0, 60) : '';
    console.log(`${date} | ${type.padEnd(6)} | ${String(amount).padStart(12)} | ${narration}`);
  }
}

console.log(`---\nTotal parsed: ${parsed}`);
