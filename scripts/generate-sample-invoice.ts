/**
 * Generates a sample vendor invoice HTML and converts to PDF via the system.
 * Run: npx tsx scripts/generate-sample-invoice.ts
 */

import { writeFileSync } from 'fs';

const html = `<!DOCTYPE html>
<html>
<head>
<style>
  body { font-family: Arial, sans-serif; font-size: 12px; color: #333; margin: 40px; }
  h1 { color: #1a1a1a; font-size: 22px; margin: 0; }
  .header { display: flex; justify-content: space-between; border-bottom: 2px solid #333; padding-bottom: 15px; margin-bottom: 20px; }
  .header-right { text-align: right; }
  .label { color: #666; font-size: 10px; text-transform: uppercase; margin-bottom: 2px; }
  .value { font-size: 13px; font-weight: bold; }
  .section { margin-bottom: 20px; }
  .two-col { display: flex; justify-content: space-between; }
  .col { width: 48%; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  th { background: #f5f5f5; border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 11px; text-transform: uppercase; }
  td { border: 1px solid #ddd; padding: 8px; }
  .right { text-align: right; }
  .totals { width: 300px; margin-left: auto; margin-top: 15px; }
  .totals td { border: none; padding: 4px 8px; }
  .totals .total-row { font-weight: bold; font-size: 14px; border-top: 2px solid #333; }
  .footer { margin-top: 40px; border-top: 1px solid #ddd; padding-top: 15px; font-size: 10px; color: #666; }
  .gstin-badge { background: #4f46e5; color: white; padding: 3px 8px; border-radius: 3px; font-size: 11px; font-weight: bold; }
</style>
</head>
<body>

<div class="header">
  <div>
    <h1>TAX INVOICE</h1>
    <p style="margin: 5px 0 0;">Original for Recipient</p>
  </div>
  <div class="header-right">
    <p style="font-size: 16px; font-weight: bold; margin: 0;">Packwell Industries Pvt Ltd</p>
    <p style="margin: 5px 0;">Plot 78, MIDC Bhosari, Pune 411026</p>
    <p style="margin: 2px 0;">Maharashtra, India</p>
    <p style="margin: 8px 0 0;"><span class="gstin-badge">GSTIN: 27AABCP5678B1Z3</span></p>
    <p style="margin: 5px 0;">PAN: AABCP5678B</p>
  </div>
</div>

<div class="two-col section">
  <div class="col">
    <div class="label">Bill To</div>
    <p style="font-weight: bold; margin: 5px 0;">Vrindavan Milk Products Pvt Ltd</p>
    <p style="margin: 2px 0;">Plot 42, MIDC Industrial Area</p>
    <p style="margin: 2px 0;">Andheri East, Mumbai 400093</p>
    <p style="margin: 2px 0;">Maharashtra, India</p>
    <p style="margin: 5px 0;"><strong>GSTIN:</strong> 27AABCV1234F1ZM</p>
  </div>
  <div class="col">
    <table style="width: 100%; border: none;">
      <tr><td class="label" style="border:none;">Invoice Number</td><td style="border:none; font-weight:bold;">PWI/2526/0847</td></tr>
      <tr><td class="label" style="border:none;">Invoice Date</td><td style="border:none;">25-Mar-2026</td></tr>
      <tr><td class="label" style="border:none;">Due Date</td><td style="border:none;">24-Apr-2026</td></tr>
      <tr><td class="label" style="border:none;">Place of Supply</td><td style="border:none;">Maharashtra (27)</td></tr>
      <tr><td class="label" style="border:none;">Reverse Charge</td><td style="border:none;">No</td></tr>
    </table>
  </div>
</div>

<table>
  <thead>
    <tr>
      <th style="width:5%">#</th>
      <th style="width:30%">Description</th>
      <th style="width:10%">HSN/SAC</th>
      <th class="right" style="width:8%">Qty</th>
      <th class="right" style="width:12%">Rate (₹)</th>
      <th class="right" style="width:12%">Amount (₹)</th>
      <th class="right" style="width:8%">GST %</th>
      <th class="right" style="width:12%">Tax (₹)</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>1</td>
      <td>HDPE Milk Pouches (500ml) - 10,000 pcs</td>
      <td>3923</td>
      <td class="right">10,000</td>
      <td class="right">1.80</td>
      <td class="right">18,000.00</td>
      <td class="right">18%</td>
      <td class="right">3,240.00</td>
    </tr>
    <tr>
      <td>2</td>
      <td>Printed Carton Boxes (24-pack) - 500 pcs</td>
      <td>4819</td>
      <td class="right">500</td>
      <td class="right">12.50</td>
      <td class="right">6,250.00</td>
      <td class="right">18%</td>
      <td class="right">1,125.00</td>
    </tr>
    <tr>
      <td>3</td>
      <td>Bottle Caps (LDPE) - 5,000 pcs</td>
      <td>3923</td>
      <td class="right">5,000</td>
      <td class="right">0.60</td>
      <td class="right">3,000.00</td>
      <td class="right">18%</td>
      <td class="right">540.00</td>
    </tr>
    <tr>
      <td>4</td>
      <td>Shrink Wrap Film (100m roll) - 20 rolls</td>
      <td>3920</td>
      <td class="right">20</td>
      <td class="right">350.00</td>
      <td class="right">7,000.00</td>
      <td class="right">18%</td>
      <td class="right">1,260.00</td>
    </tr>
  </tbody>
</table>

<table class="totals">
  <tr><td>Subtotal</td><td class="right">₹34,250.00</td></tr>
  <tr><td>CGST @ 9%</td><td class="right">₹3,082.50</td></tr>
  <tr><td>SGST @ 9%</td><td class="right">₹3,082.50</td></tr>
  <tr class="total-row"><td>Total</td><td class="right">₹40,415.00</td></tr>
</table>

<p style="margin-top: 15px; font-style: italic;">Amount in words: Forty Thousand Four Hundred Fifteen Rupees Only</p>

<div style="margin-top: 20px;">
  <div class="label">HSN Summary</div>
  <table style="width: 60%; margin-top: 5px;">
    <thead>
      <tr><th>HSN</th><th class="right">Taxable</th><th class="right">CGST</th><th class="right">SGST</th><th class="right">Total Tax</th></tr>
    </thead>
    <tbody>
      <tr><td>3923</td><td class="right">21,000.00</td><td class="right">1,890.00</td><td class="right">1,890.00</td><td class="right">3,780.00</td></tr>
      <tr><td>4819</td><td class="right">6,250.00</td><td class="right">562.50</td><td class="right">562.50</td><td class="right">1,125.00</td></tr>
      <tr><td>3920</td><td class="right">7,000.00</td><td class="right">630.00</td><td class="right">630.00</td><td class="right">1,260.00</td></tr>
    </tbody>
  </table>
</div>

<div class="two-col" style="margin-top: 30px;">
  <div class="col">
    <div class="label">Bank Details</div>
    <p style="margin: 5px 0;"><strong>Bank:</strong> HDFC Bank, Bhosari Branch</p>
    <p style="margin: 2px 0;"><strong>A/C No:</strong> 50100487654321</p>
    <p style="margin: 2px 0;"><strong>IFSC:</strong> HDFC0001234</p>
  </div>
  <div class="col" style="text-align: right;">
    <p style="margin-top: 40px; border-top: 1px solid #333; display: inline-block; padding-top: 5px;">
      For Packwell Industries Pvt Ltd<br/>
      <em>Authorised Signatory</em>
    </p>
  </div>
</div>

<div class="footer">
  <p>This is a computer-generated invoice. Subject to Mumbai jurisdiction.</p>
  <p>E&OE — Errors and Omissions Excepted</p>
</div>

</body>
</html>`;

// Write HTML file
const htmlPath = '/Users/vaidehi/Downloads/sample-vendor-invoice.html';
writeFileSync(htmlPath, html);
console.log(`HTML invoice written to: ${htmlPath}`);
console.log('');
console.log('To convert to PDF, open the HTML file in your browser and press Cmd+P → Save as PDF');
console.log('Or use: /usr/sbin/cupsfilter sample-vendor-invoice.html > sample-vendor-invoice.pdf');

// Also write a simpler text version as a fallback
const textInvoice = `
PACKWELL INDUSTRIES PVT LTD
Plot 78, MIDC Bhosari, Pune 411026, Maharashtra
GSTIN: 27AABCP5678B1Z3 | PAN: AABCP5678B

TAX INVOICE
Invoice No: PWI/2526/0847    Date: 25-Mar-2026    Due: 24-Apr-2026

Bill To: Vrindavan Milk Products Pvt Ltd
GSTIN: 27AABCV1234F1ZM
Plot 42, MIDC Industrial Area, Andheri East, Mumbai 400093

Sr  Description                              HSN    Qty      Rate     Amount   GST%    Tax
1   HDPE Milk Pouches (500ml) - 10000 pcs   3923   10000    1.80   18000.00   18%   3240.00
2   Printed Carton Boxes (24-pack) - 500     4819     500   12.50    6250.00   18%   1125.00
3   Bottle Caps (LDPE) - 5000 pcs           3923    5000    0.60    3000.00   18%    540.00
4   Shrink Wrap Film (100m roll) - 20 rolls  3920      20  350.00    7000.00   18%   1260.00

                                              Subtotal:  34,250.00
                                              CGST @9%:   3,082.50
                                              SGST @9%:   3,082.50
                                              TOTAL:     40,415.00

Amount in words: Forty Thousand Four Hundred Fifteen Rupees Only
Place of Supply: Maharashtra (27) | Reverse Charge: No
`;
console.log(textInvoice);
