/**
 * Read-only utility: dumps the plain text that pdf-parse extracts from
 * a PDF, used to tune the text-heuristic parser. No DB access.
 *
 *   pnpm tsx scripts/dump-pdf-text.ts <path-to-pdf>
 */
import { readFileSync } from 'node:fs';
import { extractPdfText } from '../src/modules/ar/invoice-import/extractors/pdf-text';

async function main(): Promise<void> {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: tsx dump-pdf-text.ts <path-to-pdf>');
    process.exit(1);
  }
  const buf = readFileSync(file);
  const result = await extractPdfText(buf);
  console.log(`Pages: ${result.pageCount}`);
  console.log(`Text length: ${result.text.length}`);
  console.log(`Usable: ${result.hasUsableText}`);
  console.log('--- TEXT ---');
  console.log(result.text);
  console.log('--- END ---');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
