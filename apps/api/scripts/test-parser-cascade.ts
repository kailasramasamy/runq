/**
 * One-off smoke test for the parser cascade. Reads each xlsx file in a
 * directory and runs it through invoiceImportParserService. Read-only,
 * touches no DB.
 *
 *   pnpm tsx scripts/test-parser-cascade.ts <dir>
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { invoiceImportParserService } from '../src/modules/ar/invoice-import/parser.service';

async function main(): Promise<void> {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: tsx test-parser-cascade.ts <directory>');
    process.exit(1);
  }
  const files = readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.xlsx'))
    .map((f) => join(dir, f))
    .filter((p) => statSync(p).size > 0)
    .sort();

  console.log(`Parsing ${files.length} files via the cascade...\n`);

  let ok = 0;
  let fail = 0;
  for (const f of files) {
    try {
      const buf = readFileSync(f);
      const invoices = await invoiceImportParserService.parseBuffer(
        buf,
        f.split('/').pop()!,
        'auto',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      for (const inv of invoices) {
        ok++;
        console.log(
          `  ${inv.sourceFile.padEnd(38)}  parser=${inv.parserUsed.padEnd(24)}  inv ${inv.invoiceNumber.padEnd(8)}  ${inv.invoiceDate}  ${String(inv.lineItems.length).padStart(2)} lines  src ₹${inv.sourceGrandTotal.toFixed(2)}  computed subtotal ₹${inv.computedSubtotal.toFixed(2)}  warnings ${inv.warnings.length}`,
        );
        if (inv.warnings.length > 0) {
          for (const w of inv.warnings) console.log(`    ⚠ ${w}`);
        }
      }
    } catch (err) {
      fail++;
      console.log(`  ${f.split('/').pop()}  FAILED: ${(err as Error).message}`);
    }
  }

  console.log(`\nDone. ${ok} parsed, ${fail} failed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
