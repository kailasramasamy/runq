import type { StatementOfAccount, StatementRow } from './portal.service';

interface RenderInput {
  companyName: string;
  customerName: string;
  statement: StatementOfAccount;
}

function formatINR(n: number): string {
  const abs = Math.abs(n);
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs);
  return n < 0 ? `(${formatted})` : formatted;
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderRow(row: StatementRow): string {
  const debit = row.debit > 0 ? formatINR(row.debit) : '';
  const credit = row.credit > 0 ? formatINR(row.credit) : '';
  return `
    <tr>
      <td>${formatDate(row.date)}</td>
      <td>${escapeHtml(row.description)}</td>
      <td class="num">${debit}</td>
      <td class="num credit">${credit}</td>
      <td class="num bal">${formatINR(row.runningBalance)}</td>
    </tr>
  `;
}

export function renderStatementHtml({ companyName, customerName, statement }: RenderInput): string {
  const rowsHtml = statement.rows.map(renderRow).join('');
  const periodLabel = `${formatDate(statement.fromDate)} to ${formatDate(statement.toDate)}`;
  const generatedOn = formatDate(new Date().toISOString().slice(0, 10));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Statement of Account</title>
  <style>
    @page { size: A4; margin: 15mm; }
    * { box-sizing: border-box; }
    body {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      color: #111827;
      font-size: 11px;
      margin: 0;
      padding: 0;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 16px;
      border-bottom: 2px solid #111827;
      margin-bottom: 20px;
    }
    .header h1 {
      font-size: 20px;
      font-weight: 700;
      margin: 0 0 4px;
      color: #111827;
    }
    .header .subtitle { color: #6b7280; font-size: 11px; }
    .header .meta { text-align: right; font-size: 10px; color: #6b7280; }
    .header .meta strong { display: block; color: #111827; font-size: 11px; font-weight: 600; }

    .summary {
      display: flex;
      gap: 12px;
      margin-bottom: 20px;
    }
    .summary .card {
      flex: 1;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 10px 12px;
    }
    .summary .card .label {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #6b7280;
      margin-bottom: 4px;
    }
    .summary .card .value {
      font-size: 14px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
    .summary .card.closing .value { color: #dc2626; }

    table.ledger {
      width: 100%;
      border-collapse: collapse;
      font-size: 10.5px;
    }
    table.ledger thead th {
      text-align: left;
      padding: 8px 6px;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #6b7280;
      border-bottom: 1px solid #d1d5db;
      background: #f9fafb;
    }
    table.ledger thead th.num { text-align: right; }
    table.ledger tbody td {
      padding: 7px 6px;
      border-bottom: 1px solid #f3f4f6;
      vertical-align: top;
    }
    table.ledger tbody td.num {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    table.ledger tbody td.credit { color: #059669; }
    table.ledger tbody td.bal { font-weight: 600; }

    .totals {
      margin-top: 14px;
      padding: 10px 12px;
      background: #f9fafb;
      border-radius: 6px;
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      font-weight: 600;
    }
    .totals .closing-amount { color: #dc2626; font-variant-numeric: tabular-nums; }

    .footer {
      margin-top: 24px;
      padding-top: 12px;
      border-top: 1px solid #e5e7eb;
      font-size: 9px;
      color: #6b7280;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>${escapeHtml(companyName)}</h1>
      <div class="subtitle">Statement of Account</div>
    </div>
    <div class="meta">
      <strong>${escapeHtml(customerName)}</strong>
      Period: ${periodLabel}<br />
      Generated: ${generatedOn}
    </div>
  </div>

  <div class="summary">
    <div class="card">
      <div class="label">Opening Balance</div>
      <div class="value">₹ ${formatINR(statement.openingBalance)}</div>
    </div>
    <div class="card">
      <div class="label">Total Invoiced</div>
      <div class="value">₹ ${formatINR(statement.rows.filter((r) => r.type === 'invoice').reduce((s, r) => s + r.debit, 0))}</div>
    </div>
    <div class="card">
      <div class="label">Total Received</div>
      <div class="value">₹ ${formatINR(statement.rows.filter((r) => r.type !== 'invoice').reduce((s, r) => s + r.credit, 0))}</div>
    </div>
    <div class="card closing">
      <div class="label">Closing Balance</div>
      <div class="value">₹ ${formatINR(statement.closingBalance)}</div>
    </div>
  </div>

  <table class="ledger">
    <thead>
      <tr>
        <th style="width:80px;">Date</th>
        <th>Description</th>
        <th class="num" style="width:90px;">Debit (₹)</th>
        <th class="num" style="width:90px;">Credit (₹)</th>
        <th class="num" style="width:100px;">Balance (₹)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${formatDate(statement.fromDate)}</td>
        <td><em>Opening Balance</em></td>
        <td class="num"></td>
        <td class="num"></td>
        <td class="num bal">${formatINR(statement.openingBalance)}</td>
      </tr>
      ${rowsHtml}
    </tbody>
  </table>

  <div class="totals">
    <span>Closing Balance as of ${formatDate(statement.toDate)}</span>
    <span class="closing-amount">₹ ${formatINR(statement.closingBalance)}</span>
  </div>

  <div class="footer">
    Reply with any discrepancies within 7 days. After 7 days, this statement is considered confirmed.
  </div>
</body>
</html>`;
}
