import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as XLSX from 'xlsx';
const dir = process.argv[2] || '/Users/vaidehi/Dropbox/Documents/Venture/Milk Analysis/Invoice-2026/April/4am Fresh';
const files = readdirSync(dir).filter(f => f.endsWith('.xlsx')).sort();
const rows = [];
for (const f of files) {
  const wb = XLSX.read(readFileSync(join(dir, f)), { type: 'buffer' });
  const sh = wb.Sheets[wb.SheetNames[0]];
  const inv = sh['D5']?.v;
  const date = sh['D4']?.v;
  rows.push({ file: f, inv: inv == null ? null : String(inv), date });
}
for (const r of rows) console.log(`${r.inv ?? '(none)'}\t${r.file}`);
console.log(`TOTAL: ${rows.length}`);
