import { eq, and, gte, lte, inArray } from 'drizzle-orm';
import {
  salesInvoices,
  purchaseInvoices,
  payments,
  paymentReceipts,
  vendors,
  customers,
  bankAccounts,
  tenants,
} from '@runq/db';
import type { Db } from '@runq/db';
import { NotFoundError } from '../../utils/errors';

type SalesInvoiceRow = typeof salesInvoices.$inferSelect & { customerName: string; cgstAmount: string; sgstAmount: string; igstAmount: string };
type PurchaseInvoiceRow = typeof purchaseInvoices.$inferSelect & { vendorName: string; cgstAmount: string; sgstAmount: string; igstAmount: string; tdsAmount: string };
type PaymentRow = typeof payments.$inferSelect & { vendorName: string; bankName: string | null };
type ReceiptRow = typeof paymentReceipts.$inferSelect & { customerName: string; bankName: string | null };

export class TallyService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  private async getCompanyName(): Promise<string> {
    const [row] = await this.db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, this.tenantId)).limit(1);
    if (!row) throw new NotFoundError('Tenant');
    return row.name;
  }

  private formatTallyDate(dateStr: string): string {
    return dateStr.replace(/-/g, '');
  }

  private escapeXml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private buildSalesVoucher(invoice: SalesInvoiceRow): string {
    const total = parseFloat(invoice.totalAmount).toFixed(2);
    const subtotal = parseFloat(invoice.subtotal).toFixed(2);
    const customer = this.escapeXml(invoice.customerName);
    const cgst = parseFloat(invoice.cgstAmount).toFixed(2);
    const sgst = parseFloat(invoice.sgstAmount).toFixed(2);
    const igst = parseFloat(invoice.igstAmount).toFixed(2);
    const hasCgstSgst = parseFloat(cgst) > 0;
    const hasIgst = parseFloat(igst) > 0;

    const taxEntries: string[] = [];
    if (hasCgstSgst) {
      taxEntries.push(this.buildLedgerLine('Output CGST', 'No', cgst));
      taxEntries.push(this.buildLedgerLine('Output SGST', 'No', sgst));
    }
    if (hasIgst) {
      taxEntries.push(this.buildLedgerLine('Output IGST', 'No', igst));
    }

    return `<TALLYMESSAGE xmlns:UDF="TallyUDF">
<VOUCHER VCHTYPE="Sales" ACTION="Create">
  <DATE>${this.formatTallyDate(invoice.invoiceDate)}</DATE>
  <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
  <VOUCHERNUMBER>${this.escapeXml(invoice.invoiceNumber)}</VOUCHERNUMBER>
  <PARTYLEDGERNAME>${customer}</PARTYLEDGERNAME>
  <NARRATION>Sales invoice ${this.escapeXml(invoice.invoiceNumber)}</NARRATION>
  <ALLLEDGERENTRIES.LIST>
    <LEDGERNAME>${customer}</LEDGERNAME>
    <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
    <AMOUNT>-${total}</AMOUNT>
  </ALLLEDGERENTRIES.LIST>
  <ALLLEDGERENTRIES.LIST>
    <LEDGERNAME>Sales Account</LEDGERNAME>
    <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
    <AMOUNT>${subtotal}</AMOUNT>
  </ALLLEDGERENTRIES.LIST>
${taxEntries.join('\n')}
</VOUCHER>
</TALLYMESSAGE>`;
  }

  private buildLedgerLine(name: string, isDeemed: string, amount: string): string {
    return `  <ALLLEDGERENTRIES.LIST>
    <LEDGERNAME>${this.escapeXml(name)}</LEDGERNAME>
    <ISDEEMEDPOSITIVE>${isDeemed}</ISDEEMEDPOSITIVE>
    <AMOUNT>${amount}</AMOUNT>
  </ALLLEDGERENTRIES.LIST>`;
  }

  private buildPurchaseVoucher(invoice: PurchaseInvoiceRow): string {
    const total = parseFloat(invoice.totalAmount).toFixed(2);
    const subtotal = parseFloat(invoice.subtotal).toFixed(2);
    const vendor = this.escapeXml(invoice.vendorName);
    const cgst = parseFloat(invoice.cgstAmount).toFixed(2);
    const sgst = parseFloat(invoice.sgstAmount).toFixed(2);
    const igst = parseFloat(invoice.igstAmount).toFixed(2);
    const tds = parseFloat(invoice.tdsAmount).toFixed(2);
    const hasCgstSgst = parseFloat(cgst) > 0;
    const hasIgst = parseFloat(igst) > 0;
    const hasTds = parseFloat(tds) > 0;

    const taxEntries: string[] = [];
    if (hasCgstSgst) {
      taxEntries.push(this.buildLedgerLine('Input CGST', 'Yes', `-${cgst}`));
      taxEntries.push(this.buildLedgerLine('Input SGST', 'Yes', `-${sgst}`));
    }
    if (hasIgst) {
      taxEntries.push(this.buildLedgerLine('Input IGST', 'Yes', `-${igst}`));
    }
    if (hasTds) {
      taxEntries.push(this.buildLedgerLine('TDS Payable', 'No', tds));
    }

    return `<TALLYMESSAGE xmlns:UDF="TallyUDF">
<VOUCHER VCHTYPE="Purchase" ACTION="Create">
  <DATE>${this.formatTallyDate(invoice.invoiceDate)}</DATE>
  <VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>
  <VOUCHERNUMBER>${this.escapeXml(invoice.invoiceNumber)}</VOUCHERNUMBER>
  <PARTYLEDGERNAME>${vendor}</PARTYLEDGERNAME>
  <NARRATION>Purchase invoice ${this.escapeXml(invoice.invoiceNumber)}</NARRATION>
  <ALLLEDGERENTRIES.LIST>
    <LEDGERNAME>Purchase Account</LEDGERNAME>
    <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
    <AMOUNT>-${subtotal}</AMOUNT>
  </ALLLEDGERENTRIES.LIST>
${taxEntries.join('\n')}
  <ALLLEDGERENTRIES.LIST>
    <LEDGERNAME>${vendor}</LEDGERNAME>
    <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
    <AMOUNT>${total}</AMOUNT>
  </ALLLEDGERENTRIES.LIST>
</VOUCHER>
</TALLYMESSAGE>`;
  }

  private buildPaymentVoucher(payment: PaymentRow): string {
    const amount = parseFloat(payment.amount).toFixed(2);
    const vendor = this.escapeXml(payment.vendorName);
    const bank = this.escapeXml(payment.bankName ?? 'Bank Account');
    const narration = payment.utrNumber ? `NEFT UTR: ${payment.utrNumber}` : (payment.notes ?? '');
    return `<TALLYMESSAGE xmlns:UDF="TallyUDF">
<VOUCHER VCHTYPE="Payment" ACTION="Create">
  <DATE>${this.formatTallyDate(payment.paymentDate)}</DATE>
  <VOUCHERTYPENAME>Payment</VOUCHERTYPENAME>
  <PARTYLEDGERNAME>${vendor}</PARTYLEDGERNAME>
  <NARRATION>${this.escapeXml(narration)}</NARRATION>
  <ALLLEDGERENTRIES.LIST>
    <LEDGERNAME>${vendor}</LEDGERNAME>
    <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
    <AMOUNT>-${amount}</AMOUNT>
  </ALLLEDGERENTRIES.LIST>
  <ALLLEDGERENTRIES.LIST>
    <LEDGERNAME>${bank}</LEDGERNAME>
    <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
    <AMOUNT>${amount}</AMOUNT>
  </ALLLEDGERENTRIES.LIST>
</VOUCHER>
</TALLYMESSAGE>`;
  }

  private buildReceiptVoucher(receipt: ReceiptRow): string {
    const amount = parseFloat(receipt.amount).toFixed(2);
    const customer = this.escapeXml(receipt.customerName);
    const bank = this.escapeXml(receipt.bankName ?? 'Bank Account');
    return `<TALLYMESSAGE xmlns:UDF="TallyUDF">
<VOUCHER VCHTYPE="Receipt" ACTION="Create">
  <DATE>${this.formatTallyDate(receipt.receiptDate)}</DATE>
  <VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>
  <PARTYLEDGERNAME>${customer}</PARTYLEDGERNAME>
  <ALLLEDGERENTRIES.LIST>
    <LEDGERNAME>${bank}</LEDGERNAME>
    <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
    <AMOUNT>-${amount}</AMOUNT>
  </ALLLEDGERENTRIES.LIST>
  <ALLLEDGERENTRIES.LIST>
    <LEDGERNAME>${customer}</LEDGERNAME>
    <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
    <AMOUNT>${amount}</AMOUNT>
  </ALLLEDGERENTRIES.LIST>
</VOUCHER>
</TALLYMESSAGE>`;
  }

  private wrapEnvelope(companyName: string, vouchers: string[]): string {
    const company = this.escapeXml(companyName);
    return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
<HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
<BODY>
<IMPORTDATA>
<REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>${company}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC>
<REQUESTDATA>
${vouchers.join('\n')}
</REQUESTDATA>
</IMPORTDATA>
</BODY>
</ENVELOPE>`;
  }

  async exportVouchers(dateFrom: string, dateTo: string): Promise<string> {
    const companyName = await this.getCompanyName();

    const [salesRows, purchaseRows, paymentRows, receiptRows] = await Promise.all([
      this.fetchSalesInvoices(dateFrom, dateTo),
      this.fetchPurchaseInvoices(dateFrom, dateTo),
      this.fetchPayments(dateFrom, dateTo),
      this.fetchReceipts(dateFrom, dateTo),
    ]);

    const vouchers = [
      ...salesRows.map((r) => this.buildSalesVoucher(r)),
      ...purchaseRows.map((r) => this.buildPurchaseVoucher(r)),
      ...paymentRows.map((r) => this.buildPaymentVoucher(r)),
      ...receiptRows.map((r) => this.buildReceiptVoucher(r)),
    ];

    return this.wrapEnvelope(companyName, vouchers);
  }

  async exportLedgerMasters(): Promise<string> {
    const companyName = await this.getCompanyName();

    const [customerRows, vendorRows, bankRows] = await Promise.all([
      this.db.select({ name: customers.name }).from(customers).where(and(eq(customers.tenantId, this.tenantId), eq(customers.isActive, true))),
      this.db.select({ name: vendors.name }).from(vendors).where(and(eq(vendors.tenantId, this.tenantId), eq(vendors.isActive, true))),
      this.db.select({ name: bankAccounts.name }).from(bankAccounts).where(and(eq(bankAccounts.tenantId, this.tenantId), eq(bankAccounts.isActive, true))),
    ]);

    const ledgers = [
      ...customerRows.map((r) => this.buildLedgerEntry(r.name, 'Sundry Debtors')),
      ...vendorRows.map((r) => this.buildLedgerEntry(r.name, 'Sundry Creditors')),
      ...bankRows.map((r) => this.buildLedgerEntry(r.name, 'Bank Accounts')),
      // GST tax ledgers
      this.buildLedgerEntry('Output CGST', 'Duties & Taxes'),
      this.buildLedgerEntry('Output SGST', 'Duties & Taxes'),
      this.buildLedgerEntry('Output IGST', 'Duties & Taxes'),
      this.buildLedgerEntry('Input CGST', 'Duties & Taxes'),
      this.buildLedgerEntry('Input SGST', 'Duties & Taxes'),
      this.buildLedgerEntry('Input IGST', 'Duties & Taxes'),
      this.buildLedgerEntry('TDS Payable', 'Duties & Taxes'),
    ];

    return this.wrapLedgerEnvelope(companyName, ledgers);
  }

  private buildLedgerEntry(name: string, parent: string): string {
    const escapedName = this.escapeXml(name);
    const escapedParent = this.escapeXml(parent);
    return `<TALLYMESSAGE xmlns:UDF="TallyUDF">
<LEDGER NAME="${escapedName}" ACTION="Create">
  <NAME>${escapedName}</NAME>
  <PARENT>${escapedParent}</PARENT>
</LEDGER>
</TALLYMESSAGE>`;
  }

  private wrapLedgerEnvelope(companyName: string, ledgers: string[]): string {
    const company = this.escapeXml(companyName);
    return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
<HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
<BODY>
<IMPORTDATA>
<REQUESTDESC><REPORTNAME>All Masters</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>${company}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC>
<REQUESTDATA>
${ledgers.join('\n')}
</REQUESTDATA>
</IMPORTDATA>
</BODY>
</ENVELOPE>`;
  }

  private async fetchSalesInvoices(dateFrom: string, dateTo: string): Promise<SalesInvoiceRow[]> {
    const EXPORT_STATUSES = ['sent', 'partially_paid', 'paid'] as const;
    return this.db
      .select({
        id: salesInvoices.id, tenantId: salesInvoices.tenantId,
        invoiceNumber: salesInvoices.invoiceNumber, customerId: salesInvoices.customerId,
        invoiceDate: salesInvoices.invoiceDate, dueDate: salesInvoices.dueDate,
        subtotal: salesInvoices.subtotal, taxAmount: salesInvoices.taxAmount,
        totalAmount: salesInvoices.totalAmount, amountReceived: salesInvoices.amountReceived,
        balanceDue: salesInvoices.balanceDue, status: salesInvoices.status,
        discountPercent: salesInvoices.discountPercent, discountDays: salesInvoices.discountDays,
        notes: salesInvoices.notes, fileUrl: salesInvoices.fileUrl,
        placeOfSupply: salesInvoices.placeOfSupply, placeOfSupplyCode: salesInvoices.placeOfSupplyCode,
        isInterState: salesInvoices.isInterState, reverseCharge: salesInvoices.reverseCharge,
        cgstAmount: salesInvoices.cgstAmount, sgstAmount: salesInvoices.sgstAmount,
        igstAmount: salesInvoices.igstAmount, cessAmount: salesInvoices.cessAmount,
        irnNumber: salesInvoices.irnNumber, irnDate: salesInvoices.irnDate,
        createdAt: salesInvoices.createdAt, updatedAt: salesInvoices.updatedAt,
        customerName: customers.name,
      })
      .from(salesInvoices)
      .innerJoin(customers, eq(salesInvoices.customerId, customers.id))
      .where(and(
        eq(salesInvoices.tenantId, this.tenantId),
        inArray(salesInvoices.status, [...EXPORT_STATUSES]),
        gte(salesInvoices.invoiceDate, dateFrom),
        lte(salesInvoices.invoiceDate, dateTo),
      ));
  }

  private async fetchPurchaseInvoices(dateFrom: string, dateTo: string): Promise<PurchaseInvoiceRow[]> {
    const EXPORT_STATUSES = ['approved', 'partially_paid', 'paid'] as const;
    return this.db
      .select({
        id: purchaseInvoices.id, tenantId: purchaseInvoices.tenantId,
        invoiceNumber: purchaseInvoices.invoiceNumber, vendorId: purchaseInvoices.vendorId,
        poId: purchaseInvoices.poId, grnId: purchaseInvoices.grnId,
        invoiceDate: purchaseInvoices.invoiceDate, dueDate: purchaseInvoices.dueDate,
        subtotal: purchaseInvoices.subtotal, taxAmount: purchaseInvoices.taxAmount,
        totalAmount: purchaseInvoices.totalAmount, amountPaid: purchaseInvoices.amountPaid,
        balanceDue: purchaseInvoices.balanceDue, status: purchaseInvoices.status,
        matchStatus: purchaseInvoices.matchStatus, matchNotes: purchaseInvoices.matchNotes,
        approvedBy: purchaseInvoices.approvedBy, approvedAt: purchaseInvoices.approvedAt,
        wmsInvoiceId: purchaseInvoices.wmsInvoiceId,
        placeOfSupply: purchaseInvoices.placeOfSupply, placeOfSupplyCode: purchaseInvoices.placeOfSupplyCode,
        isInterState: purchaseInvoices.isInterState, reverseCharge: purchaseInvoices.reverseCharge,
        cgstAmount: purchaseInvoices.cgstAmount, sgstAmount: purchaseInvoices.sgstAmount,
        igstAmount: purchaseInvoices.igstAmount, cessAmount: purchaseInvoices.cessAmount,
        tdsSection: purchaseInvoices.tdsSection, tdsAmount: purchaseInvoices.tdsAmount,
        createdAt: purchaseInvoices.createdAt, updatedAt: purchaseInvoices.updatedAt,
        vendorName: vendors.name,
      })
      .from(purchaseInvoices)
      .innerJoin(vendors, eq(purchaseInvoices.vendorId, vendors.id))
      .where(and(
        eq(purchaseInvoices.tenantId, this.tenantId),
        inArray(purchaseInvoices.status, [...EXPORT_STATUSES]),
        gte(purchaseInvoices.invoiceDate, dateFrom),
        lte(purchaseInvoices.invoiceDate, dateTo),
      ));
  }

  private async fetchPayments(dateFrom: string, dateTo: string): Promise<PaymentRow[]> {
    return this.db
      .select({
        id: payments.id, tenantId: payments.tenantId,
        vendorId: payments.vendorId, bankAccountId: payments.bankAccountId,
        paymentDate: payments.paymentDate, amount: payments.amount,
        paymentMethod: payments.paymentMethod, utrNumber: payments.utrNumber,
        status: payments.status, notes: payments.notes,
        approvedBy: payments.approvedBy, approvedAt: payments.approvedAt,
        createdAt: payments.createdAt, updatedAt: payments.updatedAt,
        vendorName: vendors.name, bankName: bankAccounts.name,
      })
      .from(payments)
      .innerJoin(vendors, eq(payments.vendorId, vendors.id))
      .leftJoin(bankAccounts, eq(payments.bankAccountId, bankAccounts.id))
      .where(and(
        eq(payments.tenantId, this.tenantId),
        eq(payments.status, 'completed'),
        gte(payments.paymentDate, dateFrom),
        lte(payments.paymentDate, dateTo),
      ));
  }

  private async fetchReceipts(dateFrom: string, dateTo: string): Promise<ReceiptRow[]> {
    return this.db
      .select({
        id: paymentReceipts.id, tenantId: paymentReceipts.tenantId,
        customerId: paymentReceipts.customerId, bankAccountId: paymentReceipts.bankAccountId,
        receiptDate: paymentReceipts.receiptDate, amount: paymentReceipts.amount,
        paymentMethod: paymentReceipts.paymentMethod, referenceNumber: paymentReceipts.referenceNumber,
        notes: paymentReceipts.notes,
        createdAt: paymentReceipts.createdAt, updatedAt: paymentReceipts.updatedAt,
        customerName: customers.name, bankName: bankAccounts.name,
      })
      .from(paymentReceipts)
      .innerJoin(customers, eq(paymentReceipts.customerId, customers.id))
      .leftJoin(bankAccounts, eq(paymentReceipts.bankAccountId, bankAccounts.id))
      .where(and(
        eq(paymentReceipts.tenantId, this.tenantId),
        gte(paymentReceipts.receiptDate, dateFrom),
        lte(paymentReceipts.receiptDate, dateTo),
      ));
  }
}
