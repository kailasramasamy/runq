import { eq, and } from 'drizzle-orm';
import { salesInvoices, customers } from '@runq/db';
import type { Db } from '@runq/db';
import { NotFoundError } from '../../utils/errors';

export interface InterestResult {
  principal: number;
  rate: number;
  daysOverdue: number;
  interestAmount: number;
}

export class InterestService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async calculateInterest(invoiceId: string): Promise<InterestResult> {
    const [row] = await this.db
      .select({
        balanceDue: salesInvoices.balanceDue,
        dueDate: salesInvoices.dueDate,
        customerId: salesInvoices.customerId,
        status: salesInvoices.status,
      })
      .from(salesInvoices)
      .where(
        and(eq(salesInvoices.id, invoiceId), eq(salesInvoices.tenantId, this.tenantId)),
      )
      .limit(1);

    if (!row) throw new NotFoundError('SalesInvoice');

    const [customer] = await this.db
      .select({ overdueInterestRate: customers.overdueInterestRate })
      .from(customers)
      .where(
        and(eq(customers.id, row.customerId), eq(customers.tenantId, this.tenantId)),
      )
      .limit(1);

    const rate = customer?.overdueInterestRate
      ? Number(customer.overdueInterestRate)
      : 0;

    const principal = Number(row.balanceDue);
    const daysOverdue = this.calcDaysOverdue(row.dueDate);
    const interestAmount =
      daysOverdue > 0 && rate > 0
        ? Math.round((principal * rate / 100) * (daysOverdue / 365) * 100) / 100
        : 0;

    return { principal, rate, daysOverdue, interestAmount };
  }

  private calcDaysOverdue(dueDate: string): number {
    const today = new Date().toISOString().slice(0, 10);
    const diff = new Date(today).getTime() - new Date(dueDate).getTime();
    return Math.max(0, Math.floor(diff / 86_400_000));
  }
}
