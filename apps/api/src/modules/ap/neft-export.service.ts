import { eq, and, inArray } from 'drizzle-orm';
import {
  payments,
  paymentAllocations,
  purchaseInvoices,
  vendors,
  paymentSchedules,
  paymentScheduleItems,
} from '@runq/db';
import type { Db } from '@runq/db';
import { NotFoundError, ConflictError } from '../../utils/errors';
import { toNumber } from '../../utils/decimal';

const CSV_HEADER = 'Payment Type,Beneficiary Name,Beneficiary Account No,IFSC Code,Amount,Narration';

interface PaymentRow {
  vendorName: string;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  amount: string;
  invoiceNumber: string | null;
  paymentId: string;
}

export class NEFTExportService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async generatePaymentFile(paymentIds: string[]): Promise<string> {
    if (paymentIds.length === 0) throw new ConflictError('No payment IDs provided');

    const rows = await this.db
      .select({
        paymentId: payments.id,
        amount: payments.amount,
        vendorName: vendors.name,
        bankAccountNumber: vendors.bankAccountNumber,
        bankIfsc: vendors.bankIfsc,
        invoiceNumber: purchaseInvoices.invoiceNumber,
      })
      .from(payments)
      .innerJoin(vendors, eq(payments.vendorId, vendors.id))
      .leftJoin(paymentAllocations, eq(paymentAllocations.paymentId, payments.id))
      .leftJoin(purchaseInvoices, eq(paymentAllocations.invoiceId, purchaseInvoices.id))
      .where(and(
        eq(payments.tenantId, this.tenantId),
        inArray(payments.id, paymentIds),
      ));

    if (rows.length === 0) throw new NotFoundError('Payments');
    return this.buildCSV(rows);
  }

  async generateFromSchedule(scheduleId: string): Promise<string> {
    const [schedule] = await this.db.select()
      .from(paymentSchedules)
      .where(and(eq(paymentSchedules.id, scheduleId), eq(paymentSchedules.tenantId, this.tenantId)))
      .limit(1);

    if (!schedule) throw new NotFoundError('Payment schedule');

    const rows = await this.db
      .select({
        paymentId: paymentScheduleItems.id,
        amount: paymentScheduleItems.amount,
        vendorName: vendors.name,
        bankAccountNumber: vendors.bankAccountNumber,
        bankIfsc: vendors.bankIfsc,
        invoiceNumber: purchaseInvoices.invoiceNumber,
      })
      .from(paymentScheduleItems)
      .innerJoin(vendors, eq(paymentScheduleItems.vendorId, vendors.id))
      .innerJoin(purchaseInvoices, eq(paymentScheduleItems.invoiceId, purchaseInvoices.id))
      .where(and(
        eq(paymentScheduleItems.scheduleId, scheduleId),
        eq(paymentScheduleItems.tenantId, this.tenantId),
      ));

    if (rows.length === 0) throw new ConflictError('No items in schedule');
    return this.buildCSV(rows);
  }

  private buildCSV(rows: PaymentRow[]): string {
    const lines = [CSV_HEADER];

    for (const row of rows) {
      if (!row.bankAccountNumber || !row.bankIfsc) {
        throw new ConflictError(`Vendor "${row.vendorName}" is missing bank details (account number or IFSC)`);
      }

      const narration = row.invoiceNumber
        ? `Payment for ${row.invoiceNumber}`
        : `Payment ${row.paymentId}`;

      lines.push([
        'NEFT',
        this.escapeCSV(row.vendorName),
        row.bankAccountNumber,
        row.bankIfsc,
        toNumber(row.amount).toFixed(2),
        this.escapeCSV(narration),
      ].join(','));
    }

    return lines.join('\n');
  }

  private escapeCSV(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}
