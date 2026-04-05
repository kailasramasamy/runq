import { eq, and } from 'drizzle-orm';
import { accounts, vendors, customers, bankAccounts } from '@runq/db';
import type { Db } from '@runq/db';
import { GLService } from '../gl/gl.service';

interface TrialBalanceLine {
  accountName: string;
  accountCode?: string;
  debit: number;
  credit: number;
}

interface OutstandingInvoice {
  partyName: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  amount: number;
  balance: number;
}

interface BankAccountLine {
  bankName: string;
  accountName: string;
  accountNumber: string;
  ifscCode: string;
  balance: number;
}

interface ImportResult {
  created: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

function parseCSV(csvData: string): string[][] {
  const lines = csvData.trim().split('\n');
  return lines.map((line) => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue; }
      current += ch;
    }
    result.push(current.trim());
    return result;
  });
}

export class TallyImportService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  // --- Trial Balance Import ---

  async importTrialBalance(csvData: string, asOfDate: string, createdBy?: string): Promise<ImportResult & { journalEntryId?: string }> {
    const rows = parseCSV(csvData);
    if (rows.length < 2) return { created: 0, skipped: 0, errors: [{ row: 0, message: 'No data rows found' }] };

    const headers = rows[0]!.map((h) => h.toLowerCase().trim());
    const nameIdx = headers.findIndex((h) => h.includes('account') || h.includes('ledger') || h.includes('name'));
    const codeIdx = headers.findIndex((h) => h.includes('code'));
    const debitIdx = headers.findIndex((h) => h.includes('debit'));
    const creditIdx = headers.findIndex((h) => h.includes('credit'));

    if (nameIdx === -1 || (debitIdx === -1 && creditIdx === -1)) {
      return { created: 0, skipped: 0, errors: [{ row: 0, message: 'CSV must have columns: Account Name, Debit, Credit' }] };
    }

    // Get existing accounts for mapping
    const existingAccounts = await this.db.select().from(accounts)
      .where(and(eq(accounts.tenantId, this.tenantId), eq(accounts.isActive, true)));

    const accountByName = new Map(existingAccounts.map((a) => [a.name.toLowerCase(), a]));
    const accountByCode = new Map(existingAccounts.map((a) => [a.code, a]));

    const lines: { accountCode: string; debit?: number; credit?: number; description?: string }[] = [];
    const errors: { row: number; message: string }[] = [];
    let skipped = 0;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]!;
      const name = row[nameIdx]?.trim();
      const code = codeIdx >= 0 ? row[codeIdx]?.trim() : undefined;
      const debit = debitIdx >= 0 ? parseFloat(row[debitIdx] || '0') : 0;
      const credit = creditIdx >= 0 ? parseFloat(row[creditIdx] || '0') : 0;

      if (!name || (debit === 0 && credit === 0)) { skipped++; continue; }

      // Try to match account
      let account = code ? accountByCode.get(code) : undefined;
      if (!account) account = accountByName.get(name.toLowerCase());

      if (!account) {
        errors.push({ row: i + 1, message: `No matching account for "${name}"${code ? ` (code: ${code})` : ''}. Create the account first or check the name.` });
        continue;
      }

      if (debit > 0) lines.push({ accountCode: account.code, debit, description: `Opening balance — ${name}` });
      if (credit > 0) lines.push({ accountCode: account.code, credit, description: `Opening balance — ${name}` });
    }

    if (lines.length < 2) {
      errors.push({ row: 0, message: `Need at least 2 accounts with balances. Found ${lines.length}.` });
      return { created: 0, skipped, errors };
    }

    // Check if balanced
    const totalDebit = lines.reduce((s, l) => s + (l.debit ?? 0), 0);
    const totalCredit = lines.reduce((s, l) => s + (l.credit ?? 0), 0);
    const diff = Math.abs(totalDebit - totalCredit);

    if (diff > 0.01) {
      // Add balancing entry to Retained Earnings / Opening Balance Equity
      const balancingAccount = accountByCode.get('3002') ?? accountByCode.get('3001');
      if (!balancingAccount) {
        errors.push({ row: 0, message: `Trial balance is off by ${diff.toFixed(2)}. No equity account found to auto-balance.` });
        return { created: 0, skipped, errors };
      }
      if (totalDebit > totalCredit) {
        lines.push({ accountCode: balancingAccount.code, credit: diff, description: 'Auto-balance adjustment' });
      } else {
        lines.push({ accountCode: balancingAccount.code, debit: diff, description: 'Auto-balance adjustment' });
      }
    }

    const glSvc = new GLService(this.db, this.tenantId);
    const entry = await glSvc.createJournalEntry({
      date: asOfDate,
      description: `Opening balances imported from Tally (as of ${asOfDate})`,
      sourceType: 'tally-import',
      lines,
    });

    return { created: lines.length, skipped, errors, journalEntryId: entry.id };
  }

  // --- Outstanding Receivables Import ---

  async importReceivables(csvData: string, createdBy?: string): Promise<ImportResult> {
    const rows = parseCSV(csvData);
    if (rows.length < 2) return { created: 0, skipped: 0, errors: [{ row: 0, message: 'No data rows' }] };

    const headers = rows[0]!.map((h) => h.toLowerCase().trim());
    const custIdx = headers.findIndex((h) => h.includes('customer') || h.includes('party') || h.includes('name'));
    const invIdx = headers.findIndex((h) => h.includes('invoice') || h.includes('number') || h.includes('ref'));
    const dateIdx = headers.findIndex((h) => h.includes('date') && !h.includes('due'));
    const dueIdx = headers.findIndex((h) => h.includes('due'));
    const amtIdx = headers.findIndex((h) => h.includes('amount') || h.includes('total'));
    const balIdx = headers.findIndex((h) => h.includes('balance') || h.includes('outstanding'));

    if (custIdx === -1 || amtIdx === -1) {
      return { created: 0, skipped: 0, errors: [{ row: 0, message: 'CSV must have: Customer/Party Name, Amount columns' }] };
    }

    const errors: { row: number; message: string }[] = [];
    let created = 0;
    let skipped = 0;

    // Get existing customers by name
    const existingCustomers = await this.db.select({ id: customers.id, name: customers.name })
      .from(customers).where(eq(customers.tenantId, this.tenantId));
    const customerByName = new Map(existingCustomers.map((c) => [c.name.toLowerCase(), c.id]));

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]!;
      const customerName = row[custIdx]?.trim();
      if (!customerName) { skipped++; continue; }

      const amount = parseFloat(row[amtIdx] || '0');
      const balance = balIdx >= 0 ? parseFloat(row[balIdx] || '0') : amount;
      if (amount <= 0) { skipped++; continue; }

      const invoiceNumber = invIdx >= 0 ? row[invIdx]?.trim() : undefined;
      const invoiceDate = dateIdx >= 0 ? row[dateIdx]?.trim() : undefined;
      const dueDate = dueIdx >= 0 ? row[dueIdx]?.trim() : undefined;

      // Auto-create customer if not exists
      let customerId = customerByName.get(customerName.toLowerCase());
      if (!customerId) {
        try {
          const [newCust] = await this.db.insert(customers).values({
            tenantId: this.tenantId,
            name: customerName,
          }).returning();
          customerId = newCust!.id;
          customerByName.set(customerName.toLowerCase(), customerId);
        } catch (err) {
          errors.push({ row: i + 1, message: `Failed to create customer "${customerName}"` });
          continue;
        }
      }

      // Create sales invoice as "sent" with the outstanding balance
      try {
        const { salesInvoices } = await import('@runq/db');
        const invNum = invoiceNumber || `TALLY-AR-${String(created + 1).padStart(4, '0')}`;
        const invDate = this.parseDate(invoiceDate) || new Date().toISOString().slice(0, 10);
        const due = this.parseDate(dueDate) || invDate;

        await this.db.insert(salesInvoices).values({
          tenantId: this.tenantId,
          customerId,
          invoiceNumber: invNum,
          invoiceDate: invDate,
          dueDate: due,
          subtotal: String(amount),
          taxAmount: '0',
          totalAmount: String(amount),
          amountReceived: String(amount - balance),
          balanceDue: String(balance),
          status: balance > 0 ? 'sent' : 'paid',
          createdBy: createdBy ?? null,
        });
        created++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push({ row: i + 1, message: `Failed to create invoice: ${msg}` });
      }
    }

    return { created, skipped, errors };
  }

  // --- Outstanding Payables Import ---

  async importPayables(csvData: string, createdBy?: string): Promise<ImportResult> {
    const rows = parseCSV(csvData);
    if (rows.length < 2) return { created: 0, skipped: 0, errors: [{ row: 0, message: 'No data rows' }] };

    const headers = rows[0]!.map((h) => h.toLowerCase().trim());
    const vendorIdx = headers.findIndex((h) => h.includes('vendor') || h.includes('party') || h.includes('name'));
    const invIdx = headers.findIndex((h) => h.includes('invoice') || h.includes('bill') || h.includes('number') || h.includes('ref'));
    const dateIdx = headers.findIndex((h) => h.includes('date') && !h.includes('due'));
    const dueIdx = headers.findIndex((h) => h.includes('due'));
    const amtIdx = headers.findIndex((h) => h.includes('amount') || h.includes('total'));
    const balIdx = headers.findIndex((h) => h.includes('balance') || h.includes('outstanding'));

    if (vendorIdx === -1 || amtIdx === -1) {
      return { created: 0, skipped: 0, errors: [{ row: 0, message: 'CSV must have: Vendor/Party Name, Amount columns' }] };
    }

    const errors: { row: number; message: string }[] = [];
    let created = 0;
    let skipped = 0;

    const existingVendors = await this.db.select({ id: vendors.id, name: vendors.name })
      .from(vendors).where(eq(vendors.tenantId, this.tenantId));
    const vendorByName = new Map(existingVendors.map((v) => [v.name.toLowerCase(), v.id]));

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]!;
      const vendorName = row[vendorIdx]?.trim();
      if (!vendorName) { skipped++; continue; }

      const amount = parseFloat(row[amtIdx] || '0');
      const balance = balIdx >= 0 ? parseFloat(row[balIdx] || '0') : amount;
      if (amount <= 0) { skipped++; continue; }

      const invoiceNumber = invIdx >= 0 ? row[invIdx]?.trim() : undefined;
      const invoiceDate = dateIdx >= 0 ? row[dateIdx]?.trim() : undefined;
      const dueDate = dueIdx >= 0 ? row[dueIdx]?.trim() : undefined;

      let vendorId = vendorByName.get(vendorName.toLowerCase());
      if (!vendorId) {
        try {
          const [newVendor] = await this.db.insert(vendors).values({
            tenantId: this.tenantId,
            name: vendorName,
          }).returning();
          vendorId = newVendor!.id;
          vendorByName.set(vendorName.toLowerCase(), vendorId);
        } catch (err) {
          errors.push({ row: i + 1, message: `Failed to create vendor "${vendorName}"` });
          continue;
        }
      }

      try {
        const { purchaseInvoices } = await import('@runq/db');
        const invNum = invoiceNumber || `TALLY-AP-${String(created + 1).padStart(4, '0')}`;
        const invDate = this.parseDate(invoiceDate) || new Date().toISOString().slice(0, 10);
        const due = this.parseDate(dueDate) || invDate;

        await this.db.insert(purchaseInvoices).values({
          tenantId: this.tenantId,
          vendorId,
          invoiceNumber: invNum,
          invoiceDate: invDate,
          dueDate: due,
          subtotal: String(amount),
          taxAmount: '0',
          totalAmount: String(amount),
          amountPaid: String(amount - balance),
          balanceDue: String(balance),
          status: balance > 0 ? 'approved' : 'paid',
        });
        created++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push({ row: i + 1, message: `Failed to create bill: ${msg}` });
      }
    }

    return { created, skipped, errors };
  }

  // --- Bank Accounts Import ---

  async importBankAccounts(csvData: string): Promise<ImportResult> {
    const rows = parseCSV(csvData);
    if (rows.length < 2) return { created: 0, skipped: 0, errors: [{ row: 0, message: 'No data rows' }] };

    const headers = rows[0]!.map((h) => h.toLowerCase().trim());
    const bankIdx = headers.findIndex((h) => h.includes('bank'));
    const nameIdx = headers.findIndex((h) => h.includes('account') && h.includes('name'));
    const numIdx = headers.findIndex((h) => h.includes('number') || h.includes('account no'));
    const ifscIdx = headers.findIndex((h) => h.includes('ifsc'));
    const balIdx = headers.findIndex((h) => h.includes('balance') || h.includes('amount'));

    if (numIdx === -1) {
      return { created: 0, skipped: 0, errors: [{ row: 0, message: 'CSV must have: Account Number column' }] };
    }

    const errors: { row: number; message: string }[] = [];
    let created = 0;
    let skipped = 0;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]!;
      const accountNumber = row[numIdx]?.trim();
      if (!accountNumber) { skipped++; continue; }

      const bankName = bankIdx >= 0 ? row[bankIdx]?.trim() : 'Bank';
      const accountName = nameIdx >= 0 ? row[nameIdx]?.trim() : `${bankName} - ${accountNumber.slice(-4)}`;
      const ifscCode = ifscIdx >= 0 ? row[ifscIdx]?.trim() : '';
      const balance = balIdx >= 0 ? parseFloat(row[balIdx] || '0') : 0;

      try {
        await this.db.insert(bankAccounts).values({
          tenantId: this.tenantId,
          name: accountName || `${bankName} Account`,
          bankName: bankName || 'Bank',
          accountNumber,
          ifscCode: ifscCode || 'UNKN0000000',
          openingBalance: String(balance),
          currentBalance: String(balance),
        });
        created++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push({ row: i + 1, message: `Failed to create bank account: ${msg}` });
      }
    }

    return { created, skipped, errors };
  }

  // --- Preview (dry run) ---

  async previewTrialBalance(csvData: string): Promise<{ lines: TrialBalanceLine[]; matched: number; unmatched: string[]; totalDebit: number; totalCredit: number }> {
    const rows = parseCSV(csvData);
    if (rows.length < 2) return { lines: [], matched: 0, unmatched: [], totalDebit: 0, totalCredit: 0 };

    const headers = rows[0]!.map((h) => h.toLowerCase().trim());
    const nameIdx = headers.findIndex((h) => h.includes('account') || h.includes('ledger') || h.includes('name'));
    const codeIdx = headers.findIndex((h) => h.includes('code'));
    const debitIdx = headers.findIndex((h) => h.includes('debit'));
    const creditIdx = headers.findIndex((h) => h.includes('credit'));

    const existingAccounts = await this.db.select().from(accounts)
      .where(and(eq(accounts.tenantId, this.tenantId), eq(accounts.isActive, true)));
    const accountByName = new Map(existingAccounts.map((a) => [a.name.toLowerCase(), a.code]));
    const accountByCode = new Map(existingAccounts.map((a) => [a.code, a.name]));

    const lines: TrialBalanceLine[] = [];
    const unmatched: string[] = [];
    let matched = 0;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]!;
      const name = row[nameIdx]?.trim() || '';
      const code = codeIdx >= 0 ? row[codeIdx]?.trim() : undefined;
      const debit = debitIdx >= 0 ? parseFloat(row[debitIdx] || '0') : 0;
      const credit = creditIdx >= 0 ? parseFloat(row[creditIdx] || '0') : 0;
      if (!name || (debit === 0 && credit === 0)) continue;

      const matchedCode = code && accountByCode.has(code) ? code : accountByName.get(name.toLowerCase());
      if (matchedCode) {
        matched++;
        lines.push({ accountName: name, accountCode: matchedCode, debit, credit });
      } else {
        unmatched.push(name);
        lines.push({ accountName: name, debit, credit });
      }
    }

    const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0);

    return { lines, matched, unmatched, totalDebit, totalCredit };
  }

  private parseDate(dateStr?: string): string | null {
    if (!dateStr) return null;
    // Handle DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, YYYYMMDD
    const s = dateStr.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
    const parts = s.split(/[\/\-\.]/);
    if (parts.length === 3) {
      const [a, b, c] = parts;
      if (a!.length === 4) return `${a}-${b!.padStart(2, '0')}-${c!.padStart(2, '0')}`;
      if (c!.length === 4) return `${c}-${b!.padStart(2, '0')}-${a!.padStart(2, '0')}`;
    }
    return null;
  }
}
