/**
 * Read-only inspector for the 4am Fresh invoice xlsx files.
 *
 * Walks the directory passed as the first argument, parses every .xlsx,
 * and reports:
 *   - per-file: invoice number, date, customer line, grand total, line count
 *   - aggregated: unique (item name, gst rate) pairs with min/max billed
 *     price and how many invoices each appears on
 *
 * Used to confirm the item-name → items-master mapping table before the
 * actual importer runs anything against the DB. Touches no DB, no API.
 *
 * Usage:
 *   pnpm tsx apps/api/scripts/inspect-4am-invoices.ts \
 *     "/Users/vaidehi/Dropbox/Documents/Venture/Milk Analysis/Invoice-2026/April/4am Fresh"
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as XLSX from 'xlsx';

interface LineItem {
  name: string;
  qty: number;
  unitPrice: number;
  cgst: number;
  sgst: number;
  total: number;
}

interface ParsedInvoice {
  file: string;
  invoiceNumber: string | null;
  date: string | null;
  poNumber: string | null;
  buyerName: string | null;
  lineItems: LineItem[];
  grandTotal: number;
}

function excelSerialToISO(serial: number): string {
  // Excel epoch is 1899-12-30 (with the historical leap year bug baked in).
  const epoch = new Date(Date.UTC(1899, 11, 30));
  const ms = epoch.getTime() + serial * 86400 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

function parseInvoice(filePath: string): ParsedInvoice | null {
  const buf = readFileSync(filePath);
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]!]!;

  const cell = (addr: string): unknown => {
    const c = sheet[addr];
    return c?.v;
  };

  const invoiceNumber = cell('D5') != null ? String(cell('D5')) : null;
  const dateRaw = cell('D4');
  const date =
    typeof dateRaw === 'number'
      ? excelSerialToISO(dateRaw)
      : dateRaw != null
      ? String(dateRaw)
      : null;
  const poNumber = cell('D6') != null ? String(cell('D6')) : null;
  const buyerName = cell('C9') != null ? String(cell('C9')) : null;

  // Layout-agnostic line item parsing: the template drifted between April 1
  // (11 line slots, grand total at row 30) and April 3+ (13 line slots, grand
  // total at row 33). Walk rows from 19 onwards. A row is a line item iff
  // column A holds a non-empty product name string and column B holds a
  // numeric quantity > 0. Stop when we hit a row whose column A is the
  // literal "Grand Total" — that's the totals row.
  const lineItems: LineItem[] = [];
  let grandTotal = 0;
  for (let row = 19; row <= 50; row++) {
    const a = cell(`A${row}`);
    if (typeof a === 'string' && a.trim().toLowerCase() === 'grand total') {
      grandTotal = Number(cell(`H${row}`) ?? 0);
      break;
    }
    const name = a;
    const qty = cell(`B${row}`);
    const unitPrice = cell(`D${row}`);
    const cgst = cell(`F${row}`);
    const sgst = cell(`G${row}`);
    const total = cell(`H${row}`);
    if (name == null || typeof name !== 'string') continue;
    if (qty == null || qty === '' || Number(qty) <= 0) continue;
    lineItems.push({
      name: String(name).trim(),
      qty: Number(qty),
      unitPrice: Number(unitPrice ?? 0),
      cgst: Number(cgst ?? 0),
      sgst: Number(sgst ?? 0),
      total: Number(total ?? 0),
    });
  }

  return {
    file: filePath.split('/').pop()!,
    invoiceNumber,
    date,
    poNumber,
    buyerName,
    lineItems,
    grandTotal,
  };
}

function main(): void {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: tsx inspect-4am-invoices.ts <directory>');
    process.exit(1);
  }

  const files = readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.xlsx'))
    .map((f) => join(dir, f))
    .filter((p) => statSync(p).size > 0)
    .sort();

  console.log(`Scanning ${files.length} xlsx files in ${dir}\n`);

  // Per-file summary
  const parsed: ParsedInvoice[] = [];
  for (const f of files) {
    try {
      const inv = parseInvoice(f);
      if (!inv) continue;
      parsed.push(inv);
      const lineCount = inv.lineItems.length;
      console.log(
        `  ${inv.file.padEnd(38)}  inv ${String(inv.invoiceNumber ?? '?').padEnd(8)}  ` +
          `${inv.date ?? '?'}  ${String(lineCount).padStart(2)} lines  total ₹${inv.grandTotal.toFixed(2)}`,
      );
    } catch (err) {
      console.log(`  ${f.split('/').pop()}  PARSE ERROR: ${(err as Error).message}`);
    }
  }

  // Aggregate unique items
  interface ItemAggregate {
    invoices: Set<string>;
    minUnitPrice: number;
    maxUnitPrice: number;
    totalQty: number;
    hasGst: boolean;
  }
  const items = new Map<string, ItemAggregate>();
  for (const inv of parsed) {
    for (const li of inv.lineItems) {
      const key = li.name;
      let agg = items.get(key);
      if (!agg) {
        agg = {
          invoices: new Set(),
          minUnitPrice: li.unitPrice,
          maxUnitPrice: li.unitPrice,
          totalQty: 0,
          hasGst: false,
        };
        items.set(key, agg);
      }
      agg.invoices.add(inv.file);
      agg.minUnitPrice = Math.min(agg.minUnitPrice, li.unitPrice);
      agg.maxUnitPrice = Math.max(agg.maxUnitPrice, li.unitPrice);
      agg.totalQty += li.qty;
      if (li.cgst > 0 || li.sgst > 0) agg.hasGst = true;
    }
  }

  console.log(`\nUnique items across all invoices: ${items.size}\n`);
  const sorted = [...items.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [name, agg] of sorted) {
    const priceRange =
      agg.minUnitPrice === agg.maxUnitPrice
        ? `₹${agg.minUnitPrice.toFixed(2)}`
        : `₹${agg.minUnitPrice.toFixed(2)}–₹${agg.maxUnitPrice.toFixed(2)}`;
    console.log(
      `  ${name.padEnd(40)}  ${priceRange.padStart(18)}  ${agg.hasGst ? '5% GST' : 'exempt'}  ` +
        `qty ${agg.totalQty}  in ${agg.invoices.size}/${parsed.length} invoices`,
    );
  }

  // Buyer sanity check — should be the same across all files.
  const buyers = new Set(parsed.map((p) => p.buyerName));
  console.log(`\nDistinct buyer names: ${buyers.size}`);
  for (const b of buyers) console.log(`  - ${b}`);

  // Invoice number uniqueness
  const numbers = parsed.map((p) => p.invoiceNumber);
  const dupes = numbers.filter((n, i) => numbers.indexOf(n) !== i);
  if (dupes.length > 0) {
    console.log(`\nDUPLICATE invoice numbers found:`);
    for (const d of [...new Set(dupes)]) console.log(`  - ${d}`);
  } else {
    console.log(`\nAll invoice numbers unique.`);
  }
}

main();
