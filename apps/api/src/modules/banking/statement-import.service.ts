import { eq, and, desc, isNotNull } from 'drizzle-orm';
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
// Column synonyms — fast path for common Indian banks
// ────────────────────────────────────────────────────────────────────

const COLUMN_SYNONYMS: Record<string, RegExp> = {
  // Specific patterns first (to claim columns before generic ones)
  crDr: /^cr\s*\/\s*dr$|^dr\s*\/\s*cr$|^debit\s*\/\s*credit$|^credit\s*\/\s*debit$/i,
  amount: /\b(transaction\s*amount|txn\s*amount|amount)\b/i,
  valueDate: /\b(value\s*date|val\s*dt)\b/i,
  // Generic patterns
  date: /\b(date|txn\s*date|transaction\s*date|trans\s*date|posting\s*date|txn\s*posted\s*date)\b/i,
  narration: /\b(narration|description|particulars|details|remarks|transaction\s*details|transaction\s*remarks)\b/i,
  reference: /\b(reference|ref|chq|cheque|utr|ref\s*no|instrument|chq\s*no|transaction\s*id|trans\s*id)\b/i,
  debit: /\b(debit|dr|withdrawal|debit\s*amount|withdrawal\s*amount)\b/i,
  credit: /\b(credit|cr|deposit|credit\s*amount|deposit\s*amount)\b/i,
  balance: /\b(balance|closing\s*balance|running\s*balance|bal|available\s*balance)\b/i,
};

// Order matters: specific first, then generic
const SYNONYM_ORDER = ['crDr', 'amount', 'valueDate', 'date', 'narration', 'reference', 'debit', 'credit', 'balance'];

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
  // Strip time suffix (e.g. "02/04/2026 09:33:31 AM")
  const clean = str.trim().replace(/"/g, '').replace(/\s+\d{1,2}:\d{2}.*$/i, '').trim();
  if (!clean) return null;

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

/** True when the string looks like a date (dd/mm/yyyy, ISO, or Excel serial). */
function looksLikeDate(s: string): boolean {
  return parseDate(s) !== null;
}

/** True when the string looks like a currency amount (e.g. "1,234.56"). */
function looksLikeAmount(s: string): boolean {
  const clean = s.replace(/[,\s]/g, '');
  return /^\d+(\.\d{1,2})?$/.test(clean) && parseFloat(clean) > 0;
}

/** True when the string is a Cr/Dr indicator. */
function looksLikeCrDr(s: string): boolean {
  const upper = s.trim().toUpperCase();
  return upper === 'CR' || upper === 'DR' || upper === 'C' || upper === 'D';
}

// ────────────────────────────────────────────────────────────────────
// AI prompts
// ────────────────────────────────────────────────────────────────────

const AI_COLUMN_MAPPING_PROMPT = `You are analyzing a bank statement spreadsheet. I'll give you the first rows of the file. Determine the column mapping.

Return a JSON object with this exact schema:
{
  "headerRowIndex": <0-based index of the header row>,
  "bankName": "string or null",
  "columnMapping": {
    "date": <column index for transaction/posting date>,
    "valueDate": <column index for value date, or null if not present>,
    "narration": <column index for narration/description/particulars>,
    "reference": <column index for reference/UTR/cheque number, or null>,
    "balance": <column index for running/available balance, or null>
  },
  "amountFormat": "separate" or "single",
  // If amountFormat is "separate":
  "debitColumn": <column index>,
  "creditColumn": <column index>,
  // If amountFormat is "single":
  "amountColumn": <column index>,
  "crDrColumn": <column index for CR/DR indicator, or null if determined by sign>
}

Rules:
- Column indices are 0-based
- The header row might not be the first row — banks often put title/account info above
- Look at the DATA rows (below the header) to verify your mapping makes sense
- "separate" means there are distinct debit and credit columns
- "single" means there's one amount column with a separate Cr/Dr indicator
- Return ONLY the JSON, no explanation`;

const AI_FULL_PARSE_PROMPT = `You are a bank statement parser. Extract transactions from the given bank statement.

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
// Column mapping type used internally and stored in aliases
// ────────────────────────────────────────────────────────────────────

interface ColumnMapping {
  date?: number;
  valueDate?: number;
  narration?: number;
  reference?: number;
  balance?: number;
  // Separate debit/credit columns
  debit?: number;
  credit?: number;
  // Single amount + indicator
  amount?: number;
  crDr?: number;
}

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
    const allAccounts = await this.db
      .select({ id: bankAccounts.id, name: bankAccounts.name, bankName: bankAccounts.bankName })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.tenantId, this.tenantId), eq(bankAccounts.isActive, true)));

    const accountSyncDates = await Promise.all(
      allAccounts.map(async (acc) => {
        const [last] = await this.db
          .select({ transactionDate: bankTransactions.transactionDate })
          .from(bankTransactions)
          .where(and(eq(bankTransactions.bankAccountId, acc.id), eq(bankTransactions.tenantId, this.tenantId)))
          .orderBy(desc(bankTransactions.transactionDate))
          .limit(1);
        return { ...acc, lastSyncDate: last?.transactionDate ?? null };
      }),
    );

    const aliases = await this.db
      .select()
      .from(bankStatementFormatAliases)
      .where(eq(bankStatementFormatAliases.tenantId, this.tenantId));

    const parsedFiles: ParsedStatementFile[] = [];
    for (const file of files) {
      try {
        parsedFiles.push(await this.parseOneFile(file, allAccounts, aliases));
      } catch (err) {
        parsedFiles.push({
          fileName: file.fileName, transactions: [], detectedAccountId: null,
          detectedBankName: null, parserUsed: 'spreadsheet',
          error: (err as Error).message,
        });
      }
    }

    return {
      files: parsedFiles,
      accounts: accountSyncDates.map((a) => ({
        id: a.id, name: a.name, bankName: a.bankName, lastSyncDate: a.lastSyncDate,
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

    const existingKeys = await this.loadExistingKeys(accountId);
    const importBatchId = randomUUID();
    const newRows: typeof bankTransactions.$inferInsert[] = [];
    let duplicatesSkipped = 0;
    const errors: { row: number; message: string }[] = [];

    for (let i = 0; i < transactions.length; i++) {
      const txn = transactions[i]!;
      try {
        if (this.isDuplicate(existingKeys, txn)) { duplicatesSkipped++; continue; }
        newRows.push({
          tenantId: this.tenantId, bankAccountId: accountId,
          transactionDate: txn.transactionDate, valueDate: txn.valueDate ?? null,
          type: txn.type, amount: txn.amount.toString(),
          reference: txn.reference, narration: txn.narration,
          runningBalance: txn.runningBalance?.toString() ?? null,
          reconStatus: 'unreconciled', importBatchId,
        });
      } catch (err) {
        errors.push({ row: i + 1, message: (err as Error).message });
      }
    }

    if (newRows.length > 0) {
      await this.db.insert(bankTransactions).values(newRows);
    }

    // Sync currentBalance to the closing balance of the latest dated txn
    // that has a runningBalance — works even when an import is all duplicates.
    const [latest] = await this.db
      .select({ runningBalance: bankTransactions.runningBalance })
      .from(bankTransactions)
      .where(
        and(
          eq(bankTransactions.tenantId, this.tenantId),
          eq(bankTransactions.bankAccountId, accountId),
          isNotNull(bankTransactions.runningBalance),
        ),
      )
      .orderBy(desc(bankTransactions.transactionDate), desc(bankTransactions.createdAt))
      .limit(1);
    if (latest?.runningBalance) {
      await this.db.update(bankAccounts)
        .set({ currentBalance: latest.runningBalance, updatedAt: new Date() })
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

    if (isSpreadsheet(fileName, mimeType)) {
      return this.parseSpreadsheet(fileName, buffer, tenantAccounts, aliases);
    }

    if (isPdf(fileName, mimeType)) {
      const pdf = await extractPdfText(buffer);
      if (pdf.hasUsableText) {
        const heuristic = this.parseFromText(pdf.text, fileName, tenantAccounts);
        if (heuristic && heuristic.transactions.length > 0) return heuristic;
      }
      if (isAIEnabled()) {
        return this.parseWithAIFull(fileName, buffer, mimeType, tenantAccounts, pdf.hasUsableText ? pdf.text : null);
      }
      throw new Error(`Could not parse PDF '${fileName}'. No text layer found and AI is not configured.`);
    }

    if (isImage(fileName, mimeType)) {
      const ocr = await extractImageText(buffer);
      if (ocr.hasUsableText) {
        const heuristic = this.parseFromText(ocr.text, fileName, tenantAccounts);
        if (heuristic && heuristic.transactions.length > 0) return heuristic;
      }
      if (isAIEnabled()) {
        return this.parseWithAIFull(fileName, buffer, mimeType, tenantAccounts, ocr.hasUsableText ? ocr.text : null);
      }
      throw new Error(`Could not parse image '${fileName}'. OCR yielded no usable text and AI is not configured.`);
    }

    throw new Error(`Unsupported file type for '${fileName}'. Supported: xlsx, xls, csv, pdf, jpg, png.`);
  }

  // ── Spreadsheet parser (4-tier cascade) ──────────────────────────
  //
  // Tier 1: Saved alias (exact header signature match)
  // Tier 2: Regex synonym matching on header names
  // Tier 3: Data-driven detection (look at cell values, not names)
  // Tier 4: AI column mapping (send first rows, get indices back, parse locally)
  //
  // After any successful parse, save the mapping for next time.

  private async parseSpreadsheet(
    fileName: string,
    buffer: Buffer,
    tenantAccounts: { id: string; name: string; bankName: string }[],
    aliases: typeof bankStatementFormatAliases.$inferSelect[],
  ): Promise<ParsedStatementFile> {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error(`No sheets found in '${fileName}'`);

    const sheet = workbook.Sheets[sheetName]!;
    const rawRows: string[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1, raw: false, defval: '',
    });

    if (rawRows.length < 2) throw new Error(`File '${fileName}' has no data rows`);

    // Detect bank from all content
    const allText = rawRows.slice(0, 30).flat().join(' ');
    const detectedBankName = this.detectBankName(allText);
    const detectedAccountId = this.matchBankAccount(detectedBankName, tenantAccounts);

    // ── Tier 1: Saved alias ──────────────────────────────────
    for (let i = 0; i < Math.min(rawRows.length, 30); i++) {
      const sig = this.normalizeHeaderSignature(rawRows[i]!);
      if (!sig) continue;
      const alias = aliases.find((a) => a.headerSignature === sig);
      if (alias) {
        const txns = this.parseDataRows(rawRows, i, alias.columnMapping as ColumnMapping);
        if (txns.length > 0) {
          return { fileName, transactions: txns, detectedAccountId, detectedBankName, parserUsed: 'spreadsheet' };
        }
      }
    }

    // ── Tier 2: Regex synonym matching ───────────────────────
    for (let i = 0; i < Math.min(rawRows.length, 30); i++) {
      const map = this.detectColumnsByName(rawRows[i]!);
      if (map) {
        const txns = this.parseDataRows(rawRows, i, map);
        if (txns.length > 0) {
          await this.saveAlias(rawRows[i]!, map, detectedBankName ?? 'unknown');
          return { fileName, transactions: txns, detectedAccountId, detectedBankName, parserUsed: 'spreadsheet' };
        }
      }
    }

    // ── Tier 3: Data-driven detection ────────────────────────
    const dataResult = this.detectColumnsByData(rawRows);
    if (dataResult) {
      const txns = this.parseDataRows(rawRows, dataResult.headerIdx, dataResult.mapping);
      if (txns.length > 0) {
        await this.saveAlias(rawRows[dataResult.headerIdx]!, dataResult.mapping, detectedBankName ?? 'unknown');
        return { fileName, transactions: txns, detectedAccountId, detectedBankName, parserUsed: 'spreadsheet' };
      }
    }

    // ── Tier 4: AI column mapping ────────────────────────────
    if (isAIEnabled()) {
      const aiResult = await this.getAIColumnMapping(rawRows);
      if (aiResult) {
        const txns = this.parseDataRows(rawRows, aiResult.headerIdx, aiResult.mapping);
        if (txns.length > 0) {
          await this.saveAlias(rawRows[aiResult.headerIdx]!, aiResult.mapping, aiResult.bankName ?? detectedBankName ?? 'unknown');
          return {
            fileName, transactions: txns,
            detectedAccountId: this.matchBankAccount(aiResult.bankName, tenantAccounts) ?? detectedAccountId,
            detectedBankName: aiResult.bankName ?? detectedBankName,
            parserUsed: 'ai',
          };
        }
      }
    }

    throw new Error(
      `Could not detect columns in '${fileName}'. The format isn't recognized. ` +
      (isAIEnabled() ? 'Even AI could not determine the column layout.' : 'Enable AI (ANTHROPIC_API_KEY) for automatic format detection.'),
    );
  }

  // ── Tier 2: Name-based column detection ──────────────────────────

  private detectColumnsByName(headerRow: string[]): ColumnMapping | null {
    const map: ColumnMapping = {};
    const usedColumns = new Set<number>();

    for (const field of SYNONYM_ORDER) {
      const regex = COLUMN_SYNONYMS[field]!;
      for (let i = 0; i < headerRow.length; i++) {
        if (usedColumns.has(i)) continue;
        const cell = headerRow[i]!.toString().trim().toLowerCase();
        if (!cell) continue;
        if (regex.test(cell)) {
          (map as Record<string, number>)[field] = i;
          usedColumns.add(i);
          break;
        }
      }
    }

    // Must have date + some amount info
    const hasDate = map.date !== undefined || map.valueDate !== undefined;
    const hasAmount = map.debit !== undefined || map.credit !== undefined || map.amount !== undefined;
    return hasDate && hasAmount ? map : null;
  }

  // ── Tier 3: Data-driven column detection ─────────────────────────
  //
  // Instead of matching column names, analyze cell VALUES in rows below
  // each candidate header. A column is a "date" if most data cells parse
  // as dates, a "number" if they parse as amounts, a "crDr" if cells
  // are all CR/DR, etc.

  private detectColumnsByData(
    rows: string[][],
  ): { headerIdx: number; mapping: ColumnMapping } | null {
    const searchLimit = Math.min(rows.length - 2, 30); // need at least 2 data rows below

    for (let hIdx = 0; hIdx < searchLimit; hIdx++) {
      const header = rows[hIdx]!;
      if (header.filter((c) => c.toString().trim()).length < 3) continue;

      // Sample the next 5 data rows
      const sampleRows = rows.slice(hIdx + 1, hIdx + 6).filter((r) => r.some((c) => c.toString().trim()));
      if (sampleRows.length < 2) continue;

      const colCount = Math.max(...[header, ...sampleRows].map((r) => r.length));
      const colProfiles: { dates: number; amounts: number; crDrs: number; texts: number }[] = [];

      for (let c = 0; c < colCount; c++) {
        let dates = 0, amounts = 0, crDrs = 0, texts = 0;
        for (const row of sampleRows) {
          const val = (row[c] ?? '').toString().trim();
          if (!val) continue;
          if (looksLikeDate(val)) dates++;
          else if (looksLikeCrDr(val)) crDrs++;
          else if (looksLikeAmount(val)) amounts++;
          else texts++;
        }
        colProfiles.push({ dates, amounts, crDrs, texts });
      }

      // Assign roles based on profiles
      const mapping: ColumnMapping = {};
      const assigned = new Set<number>();
      const threshold = sampleRows.length * 0.5; // >50% of rows must match

      // Find date columns
      for (let c = 0; c < colProfiles.length; c++) {
        if (colProfiles[c]!.dates >= threshold && !assigned.has(c)) {
          if (mapping.date === undefined) { mapping.date = c; assigned.add(c); }
          else if (mapping.valueDate === undefined) { mapping.valueDate = c; assigned.add(c); }
        }
      }
      if (mapping.date === undefined) continue; // no date column = not a transaction table

      // Find Cr/Dr indicator column
      for (let c = 0; c < colProfiles.length; c++) {
        if (colProfiles[c]!.crDrs >= threshold && !assigned.has(c)) {
          mapping.crDr = c; assigned.add(c); break;
        }
      }

      // Find amount columns
      const amountCols: number[] = [];
      for (let c = 0; c < colProfiles.length; c++) {
        if (colProfiles[c]!.amounts >= threshold && !assigned.has(c)) {
          amountCols.push(c);
        }
      }

      if (mapping.crDr !== undefined && amountCols.length >= 1) {
        // Single-amount format: one amount col + Cr/Dr indicator
        mapping.amount = amountCols[0]!;
        assigned.add(amountCols[0]!);
        if (amountCols.length >= 2) {
          mapping.balance = amountCols[1]!;
          assigned.add(amountCols[1]!);
        }
      } else if (amountCols.length >= 2) {
        // Separate debit/credit columns (or amount + balance)
        mapping.debit = amountCols[0]!;
        mapping.credit = amountCols[1]!;
        assigned.add(amountCols[0]!);
        assigned.add(amountCols[1]!);
        if (amountCols.length >= 3) {
          mapping.balance = amountCols[2]!;
          assigned.add(amountCols[2]!);
        }
      } else if (amountCols.length === 1) {
        // Single amount, no Cr/Dr indicator — might need balance movement to determine direction
        mapping.amount = amountCols[0]!;
        assigned.add(amountCols[0]!);
      } else {
        continue; // no amount columns found
      }

      // Must have some way to determine amount
      if (mapping.amount === undefined && mapping.debit === undefined) continue;

      // Find longest text column for narration
      let bestText = -1, bestLen = 0;
      for (let c = 0; c < colProfiles.length; c++) {
        if (assigned.has(c)) continue;
        const avgLen = sampleRows.reduce((sum, r) => sum + (r[c] ?? '').toString().trim().length, 0) / sampleRows.length;
        if (colProfiles[c]!.texts >= threshold && avgLen > bestLen) {
          bestLen = avgLen;
          bestText = c;
        }
      }
      if (bestText >= 0) { mapping.narration = bestText; assigned.add(bestText); }

      // Find a reference column — shorter text column
      for (let c = 0; c < colProfiles.length; c++) {
        if (assigned.has(c)) continue;
        if (colProfiles[c]!.texts > 0 && c !== bestText) {
          mapping.reference = c; assigned.add(c); break;
        }
      }

      return { headerIdx: hIdx, mapping };
    }

    return null;
  }

  // ── Tier 4: AI column mapping ────────────────────────────────────

  private async getAIColumnMapping(
    rows: string[][],
  ): Promise<{ headerIdx: number; mapping: ColumnMapping; bankName: string | null } | null> {
    // Send first 15 rows to AI for column mapping (NOT full parsing)
    const sample = rows.slice(0, 30).map((r, i) => `Row ${i}: ${JSON.stringify(r)}`).join('\n');

    const rawJson = await analyze(
      AI_COLUMN_MAPPING_PROMPT,
      `Analyze these rows from a bank statement spreadsheet:\n\n${sample}`,
      2048,
    );
    if (!rawJson) return null;

    try {
      const jsonMatch = rawJson.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]) as {
        headerRowIndex: number;
        bankName?: string | null;
        columnMapping: Record<string, number | null>;
        amountFormat?: 'separate' | 'single';
        debitColumn?: number;
        creditColumn?: number;
        amountColumn?: number;
        crDrColumn?: number | null;
      };

      const mapping: ColumnMapping = {};
      const cm = parsed.columnMapping;
      if (cm.date !== null && cm.date !== undefined) mapping.date = cm.date;
      if (cm.valueDate !== null && cm.valueDate !== undefined) mapping.valueDate = cm.valueDate;
      if (cm.narration !== null && cm.narration !== undefined) mapping.narration = cm.narration;
      if (cm.reference !== null && cm.reference !== undefined) mapping.reference = cm.reference;
      if (cm.balance !== null && cm.balance !== undefined) mapping.balance = cm.balance;

      if (parsed.amountFormat === 'single') {
        if (parsed.amountColumn !== undefined) mapping.amount = parsed.amountColumn;
        if (parsed.crDrColumn !== null && parsed.crDrColumn !== undefined) mapping.crDr = parsed.crDrColumn;
      } else {
        if (parsed.debitColumn !== undefined) mapping.debit = parsed.debitColumn;
        if (parsed.creditColumn !== undefined) mapping.credit = parsed.creditColumn;
      }

      const hasDate = mapping.date !== undefined || mapping.valueDate !== undefined;
      const hasAmount = mapping.debit !== undefined || mapping.credit !== undefined || mapping.amount !== undefined;
      if (!hasDate || !hasAmount) return null;

      return {
        headerIdx: parsed.headerRowIndex,
        mapping,
        bankName: parsed.bankName ?? null,
      };
    } catch {
      return null;
    }
  }

  // ── Parse data rows using a column mapping ───────────────────────

  private parseDataRows(
    rows: string[][],
    headerIdx: number,
    map: ColumnMapping,
  ): ParsedStatementTransaction[] {
    const transactions: ParsedStatementTransaction[] = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const txn = this.parseOneRow(rows[i]!, map);
      if (txn) transactions.push(txn);
    }
    return transactions;
  }

  private parseOneRow(cols: string[], map: ColumnMapping): ParsedStatementTransaction | null {
    // Get date
    let dateStr = map.date !== undefined ? (cols[map.date] ?? '').toString().trim() : '';
    dateStr = dateStr.replace(/\s+\d{1,2}:\d{2}.*$/i, '').trim();
    if (!dateStr && map.valueDate !== undefined) {
      dateStr = (cols[map.valueDate] ?? '').toString().trim();
    }
    if (!dateStr) return null;

    const transactionDate = parseDate(dateStr);
    if (!transactionDate) return null;

    // Get amount + type
    let type: 'credit' | 'debit';
    let amount: number;

    if (map.amount !== undefined) {
      // Single-amount format
      const amtStr = (cols[map.amount] ?? '').toString();
      amount = parseFloat(amtStr.replace(/[,\s]/g, '')) || 0;
      if (amount === 0) return null;

      if (map.crDr !== undefined) {
        const crDr = (cols[map.crDr] ?? '').toString().trim().toUpperCase();
        type = (crDr === 'CR' || crDr === 'C') ? 'credit' : 'debit';
      } else {
        // No Cr/Dr indicator — try to infer from balance movement
        type = 'debit'; // default, user can correct
      }
    } else {
      // Separate debit/credit columns
      const debitStr = map.debit !== undefined ? (cols[map.debit] ?? '').toString() : '';
      const creditStr = map.credit !== undefined ? (cols[map.credit] ?? '').toString() : '';
      const debit = parseFloat(debitStr.replace(/[,\s]/g, '')) || 0;
      const credit = parseFloat(creditStr.replace(/[,\s]/g, '')) || 0;

      if (debit === 0 && credit === 0) return null;
      type = credit > 0 ? 'credit' : 'debit';
      amount = credit > 0 ? credit : debit;
    }

    const balanceStr = map.balance !== undefined ? (cols[map.balance] ?? '').toString() : '';
    const runningBalance = balanceStr ? (parseFloat(balanceStr.replace(/[,\s]/g, '')) || null) : null;
    const valueDateStr = map.valueDate !== undefined ? (cols[map.valueDate] ?? '').toString().trim() : '';

    return {
      transactionDate,
      valueDate: valueDateStr ? parseDate(valueDateStr) : null,
      type,
      amount,
      reference: map.reference !== undefined ? (cols[map.reference]?.toString().trim() || null) : null,
      narration: map.narration !== undefined ? (cols[map.narration]?.toString().trim() || null) : null,
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

    const dateLineRegex = /^(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/;
    const transactions: ParsedStatementTransaction[] = [];

    for (const line of lines) {
      const match = line.match(dateLineRegex);
      if (!match) continue;

      const transactionDate = parseDate(match[1]!);
      if (!transactionDate) continue;

      const amounts = [...line.matchAll(/(?:[\d,]+\.\d{2})/g)].map(
        (m) => parseFloat(m[0].replace(/,/g, '')),
      );
      if (amounts.length === 0) continue;

      const hasDr = /\bdr\b/i.test(line);
      const hasCr = /\bcr\b/i.test(line);

      let amount: number;
      let type: 'credit' | 'debit';
      let runningBalance: number | null = null;

      if (amounts.length >= 3) {
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

      const firstAmountIdx = line.indexOf(amounts[0]!.toFixed(2).replace(/\.?0+$/, ''));
      const narration = firstAmountIdx > 0
        ? line.slice(match[0].length, firstAmountIdx).trim().replace(/\s+/g, ' ') || null
        : null;

      transactions.push({ transactionDate, valueDate: null, type, amount, reference: null, narration, runningBalance });
    }

    if (transactions.length === 0) return null;
    return { fileName, transactions, detectedAccountId, detectedBankName, parserUsed: 'text-heuristic' };
  }

  // ── AI full parse (PDF/image last resort) ────────────────────────

  private async parseWithAIFull(
    fileName: string,
    buffer: Buffer,
    mimeType: string,
    tenantAccounts: { id: string; name: string; bankName: string }[],
    extractedText: string | null,
  ): Promise<ParsedStatementFile> {
    let rawJson: string | null = null;

    if (extractedText) {
      rawJson = await analyze(AI_FULL_PARSE_PROMPT, `Parse these bank statement transactions:\n\n${extractedText.slice(0, 8000)}`, 4096);
    } else if (isPdf(fileName, mimeType)) {
      rawJson = await extractFromPDF(buffer.toString('base64'), AI_FULL_PARSE_PROMPT, 'Parse all transactions from this bank statement PDF.', 8192);
    } else if (isImage(fileName, mimeType)) {
      const mediaType = mimeType.startsWith('image/') ? mimeType as 'image/jpeg' | 'image/png' | 'image/webp' : 'image/jpeg';
      rawJson = await extractFromImage(buffer.toString('base64'), mediaType, AI_FULL_PARSE_PROMPT, 'Parse all transactions from this bank statement image.', 8192);
    }

    if (!rawJson) throw new Error(`AI could not parse '${fileName}'`);

    const jsonMatch = rawJson.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error(`AI returned non-JSON for '${fileName}'`);

    const parsed = JSON.parse(jsonMatch[0]) as {
      bankName?: string | null;
      transactions: {
        transactionDate: string; valueDate?: string | null; type: 'credit' | 'debit';
        amount: number; reference?: string | null; narration?: string | null;
        runningBalance?: number | null;
      }[];
    };

    const detectedBankName = parsed.bankName ?? this.detectBankName(extractedText ?? '');
    const detectedAccountId = this.matchBankAccount(detectedBankName, tenantAccounts);

    const transactions: ParsedStatementTransaction[] = parsed.transactions
      .filter((t) => t.transactionDate && t.amount > 0)
      .map((t) => ({
        transactionDate: t.transactionDate, valueDate: t.valueDate ?? null,
        type: t.type, amount: t.amount, reference: t.reference ?? null,
        narration: t.narration ?? null, runningBalance: t.runningBalance ?? null,
      }));

    return { fileName, transactions, detectedAccountId, detectedBankName, parserUsed: 'ai' };
  }

  // ── Alias persistence ────────────────────────────────────────────

  private async saveAlias(headerRow: string[], mapping: ColumnMapping, bankName: string): Promise<void> {
    const signature = this.normalizeHeaderSignature(headerRow);
    if (!signature) return;

    const [existing] = await this.db
      .select({ id: bankStatementFormatAliases.id })
      .from(bankStatementFormatAliases)
      .where(and(
        eq(bankStatementFormatAliases.tenantId, this.tenantId),
        eq(bankStatementFormatAliases.headerSignature, signature),
      ))
      .limit(1);

    if (existing) {
      await this.db.update(bankStatementFormatAliases)
        .set({ columnMapping: mapping as Record<string, number>, bankNamePattern: bankName.toLowerCase(), updatedAt: new Date() })
        .where(eq(bankStatementFormatAliases.id, existing.id));
    } else {
      await this.db.insert(bankStatementFormatAliases).values({
        tenantId: this.tenantId,
        bankNamePattern: bankName.toLowerCase(),
        headerSignature: signature,
        columnMapping: mapping as Record<string, number>,
      });
    }
  }

  private normalizeHeaderSignature(row: string[]): string | null {
    const cleaned = row.map((c) => c.toString().trim().toLowerCase()).filter(Boolean);
    return cleaned.length >= 3 ? cleaned.join(',') : null;
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
    return tenantAccounts.find(
      (a) => a.bankName.toLowerCase().includes(lower) || lower.includes(a.bankName.toLowerCase()),
    )?.id ?? null;
  }

  // ── Dedup helpers ────────────────────────────────────────────────

  private async loadExistingKeys(bankAccountId: string): Promise<{ refs: Set<string>; composites: Set<string> }> {
    const existing = await this.db
      .select({
        reference: bankTransactions.reference, transactionDate: bankTransactions.transactionDate,
        type: bankTransactions.type, amount: bankTransactions.amount, narration: bankTransactions.narration,
      })
      .from(bankTransactions)
      .where(and(eq(bankTransactions.tenantId, this.tenantId), eq(bankTransactions.bankAccountId, bankAccountId)));

    const refs = new Set<string>();
    const composites = new Set<string>();
    for (const row of existing) {
      if (row.reference) refs.add(row.reference);
      else composites.add(`${row.transactionDate}|${row.type}|${row.amount}|${row.narration ?? ''}`);
    }
    return { refs, composites };
  }

  private isDuplicate(existingKeys: { refs: Set<string>; composites: Set<string> }, txn: ParsedStatementTransaction): boolean {
    if (txn.reference) return existingKeys.refs.has(txn.reference);
    return existingKeys.composites.has(`${txn.transactionDate}|${txn.type}|${txn.amount}|${txn.narration ?? ''}`);
  }
}
