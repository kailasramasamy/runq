import { eq, and, desc } from 'drizzle-orm';
import * as XLSX from 'xlsx';
import { bankAccounts, bankTransactions, bankStatementFormatAliases } from '@runq/db';
import type { Db } from '@runq/db';
import type {
  ParsedStatementFile,
  ParsedStatementTransaction,
  StatementParseResult,
  BankStatementImportResult,
} from '@runq/types';
import { extractPdfText } from '../ar/invoice-import/extractors/pdf-text';
import { extractImageText } from '../ar/invoice-import/extractors/image-ocr';
import { analyze, extractFromPDF, extractFromImage, isAIEnabled } from '../../utils/ai/claude.service';
import { randomUUID } from 'crypto';

// ────────────────────────────────────────────────────────────────────
// Helpers — file type detection
// ────────────────────────────────────────────────────────────────────

function isSpreadsheet(fileName: string, mimeType: string): boolean {
  if (
    mimeType.includes('spreadsheet') ||
    mimeType === 'application/vnd.ms-excel' ||
    mimeType === 'text/csv' ||
    mimeType === 'text/plain' ||
    mimeType === 'application/octet-stream'
  ) return true;
  return /\.(xlsx|xls|csv)$/i.test(fileName);
}

function isPdf(fileName: string, mimeType: string): boolean {
  return mimeType === 'application/pdf' || /\.pdf$/i.test(fileName);
}

function isImage(fileName: string, mimeType: string): boolean {
  if (mimeType.startsWith('image/')) return true;
  return /\.(jpe?g|png|webp)$/i.test(fileName);
}

// ────────────────────────────────────────────────────────────────────
// Column synonyms — broad enough for most Indian banks
// ────────────────────────────────────────────────────────────────────

const COLUMN_SYNONYMS: Record<string, RegExp> = {
  date: /\b(date|txn\s*date|transaction\s*date|trans\s*date|posting\s*date|txn\s*posted\s*date)\b/i,
  valueDate: /\b(value\s*date|val\s*dt)\b/i,
  narration: /\b(narration|description|particulars|details|remarks|transaction\s*details)\b/i,
  reference: /\b(reference|ref|chq|cheque|utr|ref\s*no|instrument|chq\s*no|transaction\s*id|trans\s*id)\b/i,
  debit: /\b(debit|dr|withdrawal|debit\s*amount|withdrawal\s*amount)\b/i,
  credit: /\b(credit|cr|deposit|credit\s*amount|deposit\s*amount)\b/i,
  balance: /\b(balance|closing\s*balance|running\s*balance|bal|available\s*balance)\b/i,
  // Single-amount column (ICICI, Axis, etc.) — needs Cr/Dr indicator
  amount: /\b(transaction\s*amount|txn\s*amount|amount)\b/i,
  crDr: /^cr\s*\/\s*dr$|^dr\s*\/\s*cr$/i,
};

// ────────────────────────────────────────────────────────────────────
// Bank name patterns for auto-detection
// ────────────────────────────────────────────────────────────────────

const BANK_NAME_PATTERNS: { pattern: RegExp; name: string }[] = [
  { pattern: /\bicici\b/i, name: 'icici' },
  { pattern: /\bhdfc\b/i, name: 'hdfc' },
  { pattern: /\bsbi\b|state\s*bank\s*of\s*india/i, name: 'sbi' },
  { pattern: /\baxis\b/i, name: 'axis' },
  { pattern: /\bkotak\b/i, name: 'kotak' },
  { pattern: /\byes\s*bank\b/i, name: 'yes bank' },
  { pattern: /\bindusind\b/i, name: 'indusind' },
  { pattern: /\bbob\b|bank\s*of\s*baroda/i, name: 'bank of baroda' },
  { pattern: /\bpnb\b|punjab\s*national/i, name: 'pnb' },
  { pattern: /\bunion\s*bank/i, name: 'union bank' },
  { pattern: /\bcanara\b/i, name: 'canara' },
  { pattern: /\bfederal\s*bank\b/i, name: 'federal bank' },
  { pattern: /\bidbi\b/i, name: 'idbi' },
  { pattern: /\brbl\b/i, name: 'rbl' },
  { pattern: /\bbandhan\b/i, name: 'bandhan' },
  { pattern: /\biob\b|indian\s*overseas/i, name: 'iob' },
  { pattern: /\buco\s*bank\b/i, name: 'uco bank' },
  { pattern: /\bsouth\s*indian\s*bank\b/i, name: 'south indian bank' },
  { pattern: /\bdbs\b/i, name: 'dbs' },
  { pattern: /\bciti\s*bank\b/i, name: 'citi' },
  { pattern: /\bhsbc\b/i, name: 'hsbc' },
  { pattern: /\bstandard\s*chartered\b/i, name: 'standard chartered' },
];

// ────────────────────────────────────────────────────────────────────
// Date parsing
// ────────────────────────────────────────────────────────────────────

function parseDate(str: string): string | null {
  const clean = str.trim().replace(/"/g, '');
  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    const year = y!.length === 2 ? `20${y}` : y;
    return `${year}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
  }
  // Excel serial number
  if (/^\d{5}$/.test(clean)) {
    const serial = parseInt(clean, 10);
    const epoch = Date.UTC(1899, 11, 30);
    const ms = epoch + serial * 86_400_000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  const iso = new Date(clean);
  return isNaN(iso.getTime()) ? null : iso.toISOString().slice(0, 10);
}

function splitCSVLine(line: string): string[] {
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
}

// ────────────────────────────────────────────────────────────────────
// AI prompt for bank statement parsing
// ────────────────────────────────────────────────────────────────────

const BANK_STATEMENT_SYSTEM_PROMPT = `You are a bank statement parser. Extract transactions from the given bank statement text.

Return a JSON object with this exact schema:
{
  "bankName": "string or null — the bank name if detectable",
  "transactions": [
    {
      "transactionDate": "YYYY-MM-DD",
      "valueDate": "YYYY-MM-DD or null",
      "type": "credit" or "debit",
      "amount": number (always positive),
      "reference": "string or null",
      "narration": "string or null",
      "runningBalance": number or null
    }
  ]
}

Rules:
- Dates must be in YYYY-MM-DD format
- Amount is always positive — use the type field for direction
- If there's a single amount column, determine credit/debit from context (CR/DR markers, +/- signs, or balance movement)
- Extract the bank name from headers, logos, or any identifier in the text
- Return ONLY the JSON, no markdown fencing or explanation`;

// ────────────────────────────────────────────────────────────────────
// Main service
// ────────────────────────────────────────────────────────────────────

export class StatementImportService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  // ── Parse phase ──────────────────────────────────────────────────

  async parseFiles(
    files: { fileName: string; buffer: Buffer; mimeType: string }[],
  ): Promise<StatementParseResult> {
    // Load tenant's bank accounts + last sync dates in one pass
    const allAccounts = await this.db
      .select({
        id: bankAccounts.id,
        name: bankAccounts.name,
        bankName: bankAccounts.bankName,
      })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.tenantId, this.tenantId), eq(bankAccounts.isActive, true)));

    const accountSyncDates = await Promise.all(
      allAccounts.map(async (acc) => {
        const [last] = await this.db
          .select({ transactionDate: bankTransactions.transactionDate })
          .from(bankTransactions)
          .where(and(
            eq(bankTransactions.bankAccountId, acc.id),
            eq(bankTransactions.tenantId, this.tenantId),
          ))
          .orderBy(desc(bankTransactions.transactionDate))
          .limit(1);
        return { ...acc, lastSyncDate: last?.transactionDate ?? null };
      }),
    );

    // Load saved format aliases for this tenant
    const aliases = await this.db
      .select()
      .from(bankStatementFormatAliases)
      .where(eq(bankStatementFormatAliases.tenantId, this.tenantId));

    const parsedFiles: ParsedStatementFile[] = [];

    for (const file of files) {
      try {
        const parsed = await this.parseOneFile(file, allAccounts, aliases);
        parsedFiles.push(parsed);
      } catch (err) {
        parsedFiles.push({
          fileName: file.fileName,
          transactions: [],
          detectedAccountId: null,
          detectedBankName: null,
          parserUsed: 'spreadsheet',
          error: (err as Error).message,
        });
      }
    }

    return {
      files: parsedFiles,
      accounts: accountSyncDates.map((a) => ({
        id: a.id,
        name: a.name,
        bankName: a.bankName,
        lastSyncDate: a.lastSyncDate,
      })),
    };
  }

  // ── Commit phase ─────────────────────────────────────────────────

  async commitImport(
    accountId: string,
    transactions: ParsedStatementTransaction[],
  ): Promise<BankStatementImportResult> {
    const [account] = await this.db
      .select()
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, accountId), eq(bankAccounts.tenantId, this.tenantId)))
      .limit(1);

    if (!account) {
      return { imported: 0, duplicatesSkipped: 0, errors: [{ row: 0, message: 'Bank account not found' }] };
    }

    // Load existing dedup keys
    const existingKeys = await this.loadExistingKeys(accountId);
    const importBatchId = randomUUID();
    const newRows: typeof bankTransactions.$inferInsert[] = [];
    let duplicatesSkipped = 0;
    let lastBalance: number | null = null;
    const errors: { row: number; message: string }[] = [];

    for (let i = 0; i < transactions.length; i++) {
      const txn = transactions[i]!;
      try {
        if (this.isDuplicate(existingKeys, txn)) {
          duplicatesSkipped++;
          continue;
        }

        newRows.push({
          tenantId: this.tenantId,
          bankAccountId: accountId,
          transactionDate: txn.transactionDate,
          valueDate: txn.valueDate ?? null,
          type: txn.type,
          amount: txn.amount.toString(),
          reference: txn.reference,
          narration: txn.narration,
          runningBalance: txn.runningBalance?.toString() ?? null,
          reconStatus: 'unreconciled',
          importBatchId,
        });

        if (txn.runningBalance !== null) lastBalance = txn.runningBalance;
      } catch (err) {
        errors.push({ row: i + 1, message: (err as Error).message });
      }
    }

    if (newRows.length > 0) {
      await this.db.insert(bankTransactions).values(newRows);
    }

    if (lastBalance !== null) {
      await this.db
        .update(bankAccounts)
        .set({ currentBalance: lastBalance.toString(), updatedAt: new Date() })
        .where(eq(bankAccounts.id, accountId));
    }

    return { imported: newRows.length, duplicatesSkipped, errors };
  }

  // ── Single-file parser cascade ───────────────────────────────────

  private async parseOneFile(
    file: { fileName: string; buffer: Buffer; mimeType: string },
    tenantAccounts: { id: string; name: string; bankName: string }[],
    aliases: typeof bankStatementFormatAliases.$inferSelect[],
  ): Promise<ParsedStatementFile> {
    const { fileName, buffer, mimeType } = file;

    // 1. Spreadsheet path
    if (isSpreadsheet(fileName, mimeType)) {
      return this.parseSpreadsheet(fileName, buffer, tenantAccounts, aliases);
    }

    // 2. PDF path — extract text first, then try heuristic, then AI
    if (isPdf(fileName, mimeType)) {
      const pdf = await extractPdfText(buffer);
      if (pdf.hasUsableText) {
        const heuristic = this.parseFromText(pdf.text, fileName, tenantAccounts);
        if (heuristic && heuristic.transactions.length > 0) return heuristic;
      }
      // AI fallback for PDF
      if (isAIEnabled()) {
        return this.parseWithAI(fileName, buffer, mimeType, tenantAccounts, aliases, pdf.hasUsableText ? pdf.text : null);
      }
      throw new Error(`Could not parse PDF '${fileName}'. No text layer found and AI is not configured.`);
    }

    // 3. Image path — OCR first, then AI
    if (isImage(fileName, mimeType)) {
      const ocr = await extractImageText(buffer);
      if (ocr.hasUsableText) {
        const heuristic = this.parseFromText(ocr.text, fileName, tenantAccounts);
        if (heuristic && heuristic.transactions.length > 0) return heuristic;
      }
      // AI fallback for image
      if (isAIEnabled()) {
        return this.parseWithAI(fileName, buffer, mimeType, tenantAccounts, aliases, ocr.hasUsableText ? ocr.text : null);
      }
      throw new Error(`Could not parse image '${fileName}'. OCR yielded no usable text and AI is not configured.`);
    }

    throw new Error(`Unsupported file type for '${fileName}'. Supported: xlsx, xls, csv, pdf, jpg, png.`);
  }

  // ── Spreadsheet parser ───────────────────────────────────────────

  private parseSpreadsheet(
    fileName: string,
    buffer: Buffer,
    tenantAccounts: { id: string; name: string; bankName: string }[],
    aliases: typeof bankStatementFormatAliases.$inferSelect[],
  ): ParsedStatementFile {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error(`No sheets found in '${fileName}'`);

    const sheet = workbook.Sheets[sheetName]!;
    const rawRows: string[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: '',
    });

    if (rawRows.length < 2) throw new Error(`File '${fileName}' has no data rows`);

    // Scan for the header row — skip bank name / logo rows at the top
    const { headerIdx, headerMap } = this.findHeaderRow(rawRows, aliases);
    if (headerIdx < 0 || !headerMap) {
      throw new Error(`Could not detect column headers in '${fileName}'. Expected: Date, Narration, Debit, Credit, Balance`);
    }

    // Detect bank from content above header
    const topContent = rawRows.slice(0, Math.min(headerIdx + 1, 10)).flat().join(' ');
    const detectedBankName = this.detectBankName(topContent);
    const detectedAccountId = this.matchBankAccount(detectedBankName, tenantAccounts);

    // Parse data rows
    const transactions: ParsedStatementTransaction[] = [];
    for (let i = headerIdx + 1; i < rawRows.length; i++) {
      const cols = rawRows[i]!;
      const txn = this.parseRowFromMap(cols, headerMap);
      if (txn) transactions.push(txn);
    }

    return {
      fileName,
      transactions,
      detectedAccountId,
      detectedBankName,
      parserUsed: 'spreadsheet',
    };
  }

  /**
   * Find the header row by trying each row against:
   * 1. Saved format aliases (exact header signature match)
   * 2. Heuristic column synonym matching
   */
  private findHeaderRow(
    rows: string[][],
    aliases: typeof bankStatementFormatAliases.$inferSelect[],
  ): { headerIdx: number; headerMap: Record<string, number> | null } {
    // Try up to the first 15 rows as potential headers
    const searchLimit = Math.min(rows.length, 15);

    for (let i = 0; i < searchLimit; i++) {
      const row = rows[i]!;
      const signature = this.normalizeHeaderSignature(row);
      if (!signature) continue;

      // 1. Check saved aliases first (learned from AI)
      const alias = aliases.find((a) => a.headerSignature === signature);
      if (alias) {
        return { headerIdx: i, headerMap: alias.columnMapping };
      }

      // 2. Heuristic column matching
      const map = this.detectColumnsFromRow(row);
      if (map) {
        const hasAmountInfo = map['debit'] !== undefined || map['credit'] !== undefined || map['amount'] !== undefined;
        const hasDate = map['date'] !== undefined || map['valueDate'] !== undefined;
        if (hasDate && hasAmountInfo) {
          return { headerIdx: i, headerMap: map };
        }
      }
    }

    return { headerIdx: -1, headerMap: null };
  }

  private normalizeHeaderSignature(row: string[]): string | null {
    const cleaned = row.map((c) => c.toString().trim().toLowerCase()).filter(Boolean);
    return cleaned.length >= 3 ? cleaned.join(',') : null;
  }

  private detectColumnsFromRow(headerRow: string[]): Record<string, number> | null {
    const map: Record<string, number> = {};
    const usedColumns = new Set<number>();

    // Two passes: first pass for specific fields (crDr, amount, valueDate),
    // second pass for generic fields. Prevents "Cr/Dr" matching both crDr AND debit/credit.
    const specificFirst = ['crDr', 'amount', 'valueDate'];
    const allFields = Object.entries(COLUMN_SYNONYMS);
    const sorted = [
      ...allFields.filter(([f]) => specificFirst.includes(f)),
      ...allFields.filter(([f]) => !specificFirst.includes(f)),
    ];

    for (const [field, regex] of sorted) {
      if (map[field] !== undefined) continue;
      for (let i = 0; i < headerRow.length; i++) {
        if (usedColumns.has(i)) continue;
        const cell = headerRow[i]!.toString().trim().toLowerCase();
        if (!cell) continue;
        if (regex.test(cell)) {
          map[field] = i;
          usedColumns.add(i);
          break;
        }
      }
    }
    return Object.keys(map).length >= 2 ? map : null;
  }

  private parseRowFromMap(
    cols: string[],
    map: Record<string, number>,
  ): ParsedStatementTransaction | null {
    // Try both 'date' and 'valueDate' — some banks only have Value Date
    let dateStr = map['date'] !== undefined ? (cols[map['date']] ?? '').toString().trim() : '';
    // For ICICI-style: Txn Posted Date has time appended ("02/04/2026 09:33:31 AM")
    // Strip time portion before parsing
    dateStr = dateStr.replace(/\s+\d{1,2}:\d{2}.*$/i, '').trim();
    if (!dateStr && map['valueDate'] !== undefined) {
      dateStr = (cols[map['valueDate']] ?? '').toString().trim();
    }
    if (!dateStr) return null;

    const transactionDate = parseDate(dateStr);
    if (!transactionDate) return null;

    let type: 'credit' | 'debit';
    let amount: number;

    // Pattern 1: Single amount column + Cr/Dr indicator (ICICI, Axis, etc.)
    if (map['amount'] !== undefined) {
      const amtStr = map['amount'] !== undefined ? (cols[map['amount']] ?? '').toString() : '';
      amount = parseFloat(amtStr.replace(/[,\s]/g, '')) || 0;
      if (amount === 0) return null;

      const crDrStr = map['crDr'] !== undefined ? (cols[map['crDr']] ?? '').toString().trim().toUpperCase() : '';
      type = crDrStr === 'CR' ? 'credit' : 'debit';
    } else {
      // Pattern 2: Separate debit/credit columns (HDFC, SBI, etc.)
      const debitStr = map['debit'] !== undefined ? (cols[map['debit']] ?? '').toString() : '';
      const creditStr = map['credit'] !== undefined ? (cols[map['credit']] ?? '').toString() : '';
      const debit = parseFloat(debitStr.replace(/[,\s]/g, '')) || 0;
      const credit = parseFloat(creditStr.replace(/[,\s]/g, '')) || 0;

      if (debit === 0 && credit === 0) return null;

      type = credit > 0 ? 'credit' : 'debit';
      amount = credit > 0 ? credit : debit;
    }

    const balanceStr = map['balance'] !== undefined ? (cols[map['balance']] ?? '').toString() : '';
    const runningBalance = balanceStr ? (parseFloat(balanceStr.replace(/[,\s]/g, '')) || null) : null;

    const valueDateStr = map['valueDate'] !== undefined ? (cols[map['valueDate']] ?? '').toString().trim() : '';

    return {
      transactionDate,
      valueDate: valueDateStr ? parseDate(valueDateStr) : null,
      type,
      amount,
      reference: map['reference'] !== undefined ? (cols[map['reference']]?.toString().trim() || null) : null,
      narration: map['narration'] !== undefined ? (cols[map['narration']]?.toString().trim() || null) : null,
      runningBalance,
    };
  }

  // ── Text heuristic parser (PDF text / OCR output) ────────────────

  private parseFromText(
    text: string,
    fileName: string,
    tenantAccounts: { id: string; name: string; bankName: string }[],
  ): ParsedStatementFile | null {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length < 3) return null;

    const detectedBankName = this.detectBankName(lines.slice(0, 10).join(' '));
    const detectedAccountId = this.matchBankAccount(detectedBankName, tenantAccounts);

    // Try to find tabular data — lines that start with a date-like pattern
    const dateLineRegex = /^(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/;
    const transactions: ParsedStatementTransaction[] = [];

    for (const line of lines) {
      const match = line.match(dateLineRegex);
      if (!match) continue;

      const transactionDate = parseDate(match[1]!);
      if (!transactionDate) continue;

      // Extract amounts — look for number patterns
      const amounts = [...line.matchAll(/(?:[\d,]+\.\d{2})/g)].map(
        (m) => parseFloat(m[0].replace(/,/g, '')),
      );

      if (amounts.length === 0) continue;

      // Heuristic: if we have 2+ amounts, last is balance, second-to-last is the txn amount
      // With DR/CR markers
      const hasDr = /\bdr\b/i.test(line);
      const hasCr = /\bcr\b/i.test(line);

      let amount: number;
      let type: 'credit' | 'debit';
      let runningBalance: number | null = null;

      if (amounts.length >= 3) {
        // Likely: debit, credit, balance columns
        runningBalance = amounts[amounts.length - 1]!;
        const debitAmt = amounts[amounts.length - 3] ?? 0;
        const creditAmt = amounts[amounts.length - 2] ?? 0;
        if (creditAmt > 0 && debitAmt === 0) {
          type = 'credit'; amount = creditAmt;
        } else {
          type = 'debit'; amount = debitAmt || creditAmt;
        }
      } else if (amounts.length === 2) {
        runningBalance = amounts[1]!;
        amount = amounts[0]!;
        type = hasCr ? 'credit' : 'debit';
      } else {
        amount = amounts[0]!;
        type = hasCr ? 'credit' : hasDr ? 'debit' : 'debit';
      }

      // Extract narration — text between date and first amount
      const firstAmountIdx = line.indexOf(amounts[0]!.toFixed(2).replace(/\.?0+$/, ''));
      const narration = firstAmountIdx > 0
        ? line.slice(match[0].length, firstAmountIdx).trim().replace(/\s+/g, ' ') || null
        : null;

      transactions.push({
        transactionDate,
        valueDate: null,
        type,
        amount,
        reference: null,
        narration,
        runningBalance,
      });
    }

    if (transactions.length === 0) return null;

    return {
      fileName,
      transactions,
      detectedAccountId,
      detectedBankName,
      parserUsed: 'text-heuristic',
    };
  }

  // ── AI parser (last resort) ──────────────────────────────────────

  private async parseWithAI(
    fileName: string,
    buffer: Buffer,
    mimeType: string,
    tenantAccounts: { id: string; name: string; bankName: string }[],
    aliases: typeof bankStatementFormatAliases.$inferSelect[],
    extractedText: string | null,
  ): Promise<ParsedStatementFile> {
    let rawJson: string | null = null;

    if (extractedText) {
      // Cheapest path: send pre-extracted text
      rawJson = await analyze(
        BANK_STATEMENT_SYSTEM_PROMPT,
        `Parse these bank statement transactions:\n\n${extractedText.slice(0, 8000)}`,
        4096,
      );
    } else if (isPdf(fileName, mimeType)) {
      rawJson = await extractFromPDF(
        buffer.toString('base64'),
        BANK_STATEMENT_SYSTEM_PROMPT,
        'Parse all transactions from this bank statement PDF.',
        8192,
      );
    } else if (isImage(fileName, mimeType)) {
      const mediaType = mimeType.startsWith('image/')
        ? mimeType as 'image/jpeg' | 'image/png' | 'image/webp'
        : 'image/jpeg';
      rawJson = await extractFromImage(
        buffer.toString('base64'),
        mediaType,
        BANK_STATEMENT_SYSTEM_PROMPT,
        'Parse all transactions from this bank statement image.',
        8192,
      );
    }

    if (!rawJson) {
      throw new Error(`AI could not parse '${fileName}'`);
    }

    // Parse the JSON response
    const jsonMatch = rawJson.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error(`AI returned non-JSON for '${fileName}'`);

    const parsed = JSON.parse(jsonMatch[0]) as {
      bankName?: string | null;
      transactions: {
        transactionDate: string;
        valueDate?: string | null;
        type: 'credit' | 'debit';
        amount: number;
        reference?: string | null;
        narration?: string | null;
        runningBalance?: number | null;
      }[];
    };

    const detectedBankName = parsed.bankName ?? this.detectBankName(extractedText ?? '');
    const detectedAccountId = this.matchBankAccount(detectedBankName, tenantAccounts);

    const transactions: ParsedStatementTransaction[] = parsed.transactions
      .filter((t) => t.transactionDate && t.amount > 0)
      .map((t) => ({
        transactionDate: t.transactionDate,
        valueDate: t.valueDate ?? null,
        type: t.type,
        amount: t.amount,
        reference: t.reference ?? null,
        narration: t.narration ?? null,
        runningBalance: t.runningBalance ?? null,
      }));

    // Learn from AI: if this was a spreadsheet-like format with headers,
    // save the column mapping for next time. We do this by re-reading the
    // file if it's a spreadsheet, but since we're in the AI path for
    // PDF/images, we save the bank name pattern for future detection.
    if (detectedBankName) {
      await this.saveLearnedBankPattern(detectedBankName);
    }

    return {
      fileName,
      transactions,
      detectedAccountId,
      detectedBankName,
      parserUsed: 'ai',
    };
  }

  /**
   * After a successful spreadsheet parse where column detection worked,
   * save the header signature → column mapping so future imports of the
   * same format skip heuristic detection and use the saved mapping.
   */
  async saveFormatAlias(
    headerRow: string[],
    columnMapping: Record<string, number>,
    bankName: string,
  ): Promise<void> {
    const signature = this.normalizeHeaderSignature(headerRow);
    if (!signature) return;

    // Check if alias already exists
    const [existing] = await this.db
      .select({ id: bankStatementFormatAliases.id })
      .from(bankStatementFormatAliases)
      .where(and(
        eq(bankStatementFormatAliases.tenantId, this.tenantId),
        eq(bankStatementFormatAliases.headerSignature, signature),
      ))
      .limit(1);

    if (existing) {
      await this.db
        .update(bankStatementFormatAliases)
        .set({ columnMapping, bankNamePattern: bankName.toLowerCase(), updatedAt: new Date() })
        .where(eq(bankStatementFormatAliases.id, existing.id));
    } else {
      await this.db.insert(bankStatementFormatAliases).values({
        tenantId: this.tenantId,
        bankNamePattern: bankName.toLowerCase(),
        headerSignature: signature,
        columnMapping,
      });
    }
  }

  private async saveLearnedBankPattern(bankName: string): Promise<void> {
    // Save a generic alias for bank name detection learning
    const signature = `__ai_learned__${bankName.toLowerCase()}`;
    const [existing] = await this.db
      .select({ id: bankStatementFormatAliases.id })
      .from(bankStatementFormatAliases)
      .where(and(
        eq(bankStatementFormatAliases.tenantId, this.tenantId),
        eq(bankStatementFormatAliases.headerSignature, signature),
      ))
      .limit(1);

    if (!existing) {
      await this.db.insert(bankStatementFormatAliases).values({
        tenantId: this.tenantId,
        bankNamePattern: bankName.toLowerCase(),
        headerSignature: signature,
        columnMapping: {},
      });
    }
  }

  // ── Bank detection ───────────────────────────────────────────────

  private detectBankName(text: string): string | null {
    for (const { pattern, name } of BANK_NAME_PATTERNS) {
      if (pattern.test(text)) return name;
    }
    return null;
  }

  private matchBankAccount(
    detectedBankName: string | null,
    tenantAccounts: { id: string; name: string; bankName: string }[],
  ): string | null {
    if (!detectedBankName) return null;
    const lower = detectedBankName.toLowerCase();
    const match = tenantAccounts.find(
      (a) => a.bankName.toLowerCase().includes(lower) || lower.includes(a.bankName.toLowerCase()),
    );
    return match?.id ?? null;
  }

  // ── Dedup helpers (mirrors TransactionService logic) ─────────────

  private async loadExistingKeys(bankAccountId: string): Promise<{
    refs: Set<string>;
    composites: Set<string>;
  }> {
    const existing = await this.db
      .select({
        reference: bankTransactions.reference,
        transactionDate: bankTransactions.transactionDate,
        type: bankTransactions.type,
        amount: bankTransactions.amount,
        narration: bankTransactions.narration,
      })
      .from(bankTransactions)
      .where(and(
        eq(bankTransactions.tenantId, this.tenantId),
        eq(bankTransactions.bankAccountId, bankAccountId),
      ));

    const refs = new Set<string>();
    const composites = new Set<string>();

    for (const row of existing) {
      if (row.reference) {
        refs.add(row.reference);
      } else {
        composites.add(`${row.transactionDate}|${row.type}|${row.amount}|${row.narration ?? ''}`);
      }
    }

    return { refs, composites };
  }

  private isDuplicate(
    existingKeys: { refs: Set<string>; composites: Set<string> },
    txn: ParsedStatementTransaction,
  ): boolean {
    if (txn.reference) {
      return existingKeys.refs.has(txn.reference);
    }
    const key = `${txn.transactionDate}|${txn.type}|${txn.amount}|${txn.narration ?? ''}`;
    return existingKeys.composites.has(key);
  }
}
