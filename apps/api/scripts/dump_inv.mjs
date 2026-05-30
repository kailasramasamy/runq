import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
const f = process.argv[2];
console.error('reading', f);
const buf = readFileSync(f);
console.error('size', buf.length);
const wb = XLSX.read(buf, { type: 'buffer' });
console.error('sheets', wb.SheetNames);
const sh = wb.Sheets[wb.SheetNames[0]];
console.error('range', sh['!ref']);
// dump all non-empty cells
for (const k of Object.keys(sh)) {
  if (k.startsWith('!')) continue;
  process.stdout.write(`${k}=${JSON.stringify(sh[k].v)}\n`);
}
