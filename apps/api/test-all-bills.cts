const fs = require('fs');
const path = require('path');

async function main() {
  const { PDFParse } = await import('pdf-parse');
  const { tryLocalExtraction } = require('./src/modules/ap/local-extract');

  const dir = '/Users/vaidehi/Dropbox/Documents/Venture/STS-Vrindavan/2026-2027/GST Purchase Bills/';
  const files = fs.readdirSync(dir).filter((f: string) => f.endsWith('.pdf')).sort();

  for (const f of files) {
    const buf = fs.readFileSync(path.join(dir, f));
    const p = new PDFParse({ data: buf });
    let text = '';
    try { const r = await p.getText(); text = r.text || ''; } catch (e) { console.log(`\n=== ${f} === PDF parse failed: ${(e as Error).message}`); continue; }
    await p.destroy();

    const out = tryLocalExtraction(text);
    console.log(`\n=== ${f} ===`);
    console.log(`Text length: ${text.length} chars`);
    if (!out) {
      console.log('LOCAL: failed → would fall back to AI');
      console.log('First 400 chars of text:', text.slice(0, 400).replace(/\n/g, ' | '));
    } else {
      console.log(`LOCAL: OK | vendor=${out.vendorName} | inv=${out.invoiceNumber} | date=${out.invoiceDate}`);
      console.log(`Items: ${out.items.length} | subtotal=${out.subtotal} | tax=${out.taxAmount} | total=${out.totalAmount}`);
      out.items.forEach((it, i) => console.log(`  [${i+1}] ${it.itemName} | hsn=${it.hsnSacCode} | qty=${it.quantity} | rate=${it.unitPrice} | amt=${it.amount} | tax%=${it.taxRate}`));
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
