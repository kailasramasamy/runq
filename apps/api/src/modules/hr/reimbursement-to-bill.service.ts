import { eq, and } from 'drizzle-orm';
import {
  expenseClaims, expenseClaimItems, employees, vendors,
} from '@runq/db';
import type { Db } from '@runq/db';
import { PurchaseInvoiceService } from '../ap/purchase-invoice.service';
import { VendorService } from '../ap/vendor.service';
import { NotFoundError, ConflictError } from '../../utils/errors';

/**
 * Convert an approved expense claim into a draft AP bill, creating a vendor
 * shadow of the employee on first use.
 *
 * Why a vendor per employee: AP bills require a vendor. The employee record
 * carries personal info; the vendor record carries AP-side data (bank, GSTIN,
 * payment terms). They mirror each other, and `employees.vendor_id` keeps the
 * link.
 */
export class ReimbursementToBillService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  async post(claimId: string, employeeId: string, userId: string) {
    const [claim] = await this.db
      .select()
      .from(expenseClaims)
      .where(and(eq(expenseClaims.id, claimId), eq(expenseClaims.tenantId, this.tenantId)))
      .limit(1);
    if (!claim) throw new NotFoundError('Expense claim');
    if (claim.status !== 'approved') throw new ConflictError('Only approved claims can be posted to AP');
    if (claim.billId) throw new ConflictError('Bill already exists for this claim');

    const items = await this.db
      .select()
      .from(expenseClaimItems)
      .where(and(
        eq(expenseClaimItems.tenantId, this.tenantId),
        eq(expenseClaimItems.claimId, claimId),
      ));
    if (items.length === 0) throw new ConflictError('Claim has no items');

    const [emp] = await this.db
      .select()
      .from(employees)
      .where(and(eq(employees.id, employeeId), eq(employees.tenantId, this.tenantId)))
      .limit(1);
    if (!emp) throw new NotFoundError('Employee');

    const vendorId = emp.vendorId ?? await this.ensureEmployeeVendor(emp);

    const subtotal = items.reduce((s, i) => s + Number(i.amount), 0);
    const piService = new PurchaseInvoiceService(this.db, this.tenantId);
    const bill = await piService.create({
      vendorId,
      invoiceNumber: `EXP-${claim.claimNumber}`,
      invoiceDate: claim.claimDate,
      dueDate: claim.claimDate,
      items: items.map((i) => ({
        itemName: `${i.category}: ${i.description}`,
        quantity: 1,
        unitPrice: Number(i.amount),
        amount: Number(i.amount),
      })),
      subtotal,
      taxAmount: 0,
      totalAmount: subtotal,
      notes: `Auto-created from expense claim ${claim.claimNumber}`,
      reverseCharge: false,
    } as any, userId);

    await this.db
      .update(expenseClaims)
      .set({ billId: bill.id, employeeId, updatedAt: new Date() })
      .where(and(eq(expenseClaims.id, claimId), eq(expenseClaims.tenantId, this.tenantId)));

    return { billId: bill.id, vendorId };
  }

  /** Create a vendor record mirroring an employee, link it back, return its id. */
  private async ensureEmployeeVendor(emp: typeof employees.$inferSelect): Promise<string> {
    const vendorSvc = new VendorService(this.db, this.tenantId);
    const name = `${emp.firstName}${emp.lastName ? ' ' + emp.lastName : ''} (Employee)`;
    const vendor = await vendorSvc.create({
      name,
      email: emp.email ?? null,
      phone: emp.phone ?? null,
      pan: emp.pan ?? null,
      bankAccountNumber: emp.bankAccountNumber ?? null,
      bankIfsc: emp.bankIfsc ?? null,
      bankName: emp.bankName ?? null,
      paymentTermsDays: 0,
      category: 'employee',
    } as any);

    await this.db
      .update(employees)
      .set({ vendorId: vendor.id, updatedAt: new Date() })
      .where(and(eq(employees.id, emp.id), eq(employees.tenantId, this.tenantId)));

    return vendor.id;
  }
}
