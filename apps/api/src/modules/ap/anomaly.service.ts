import { eq, and, sql, gte, ne } from 'drizzle-orm';
import { purchaseInvoices, vendors } from '@runq/db';
import type { Db } from '@runq/db';

export interface Anomaly {
  invoiceId: string;
  invoiceNumber: string;
  vendorName: string;
  amount: number;
  anomalyType: 'amount_outlier' | 'new_vendor_large' | 'frequency_spike' | 'duplicate_adjacent';
  reason: string;
  severity: 'high' | 'medium';
}

export class AnomalyService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async detectAnomalies(): Promise<Anomaly[]> {
    const cutoff = new Date(Date.now() - 90 * 86400_000).toISOString().split('T')[0]!;

    const [outliers, newVendor, spikes, duplicates] = await Promise.all([
      this.detectAmountOutliers(cutoff),
      this.detectNewVendorLarge(cutoff),
      this.detectFrequencySpikes(cutoff),
      this.detectDuplicateAdjacent(cutoff),
    ]);

    return [...outliers, ...newVendor, ...spikes, ...duplicates];
  }

  private async detectAmountOutliers(cutoff: string): Promise<Anomaly[]> {
    const rows = await this.db.execute<{
      id: string;
      invoice_number: string;
      vendor_name: string;
      total_amount: string;
      avg_amount: string;
      ratio: string;
    }>(sql`
      WITH vendor_avg AS (
        SELECT pi.vendor_id, AVG(pi.total_amount::numeric) AS avg_amt
        FROM purchase_invoices pi
        WHERE pi.tenant_id = ${this.tenantId}
          AND pi.status != 'cancelled'
          AND pi.invoice_date >= (CURRENT_DATE - INTERVAL '6 months')
        GROUP BY pi.vendor_id
        HAVING COUNT(*) >= 2
      )
      SELECT pi.id, pi.invoice_number, v.name AS vendor_name,
             pi.total_amount, va.avg_amt::text AS avg_amount,
             (pi.total_amount::numeric / va.avg_amt)::numeric(10,1) AS ratio
      FROM purchase_invoices pi
      JOIN vendors v ON v.id = pi.vendor_id
      JOIN vendor_avg va ON va.vendor_id = pi.vendor_id
      WHERE pi.tenant_id = ${this.tenantId}
        AND pi.status != 'cancelled'
        AND pi.invoice_date >= ${cutoff}
        AND pi.total_amount::numeric > 2 * va.avg_amt
    `);

    return rows.rows.map((r) => ({
      invoiceId: r.id,
      invoiceNumber: r.invoice_number,
      vendorName: r.vendor_name,
      amount: parseFloat(r.total_amount),
      anomalyType: 'amount_outlier' as const,
      reason: `₹${parseFloat(r.total_amount).toLocaleString('en-IN')} is ${r.ratio}x the average of ₹${parseFloat(r.avg_amount).toLocaleString('en-IN')} for this vendor`,
      severity: 'high' as const,
    }));
  }

  private async detectNewVendorLarge(cutoff: string): Promise<Anomaly[]> {
    const rows = await this.db.execute<{
      id: string;
      invoice_number: string;
      vendor_name: string;
      total_amount: string;
    }>(sql`
      SELECT pi.id, pi.invoice_number, v.name AS vendor_name, pi.total_amount
      FROM purchase_invoices pi
      JOIN vendors v ON v.id = pi.vendor_id
      WHERE pi.tenant_id = ${this.tenantId}
        AND pi.status != 'cancelled'
        AND pi.invoice_date >= ${cutoff}
        AND pi.total_amount::numeric > 50000
        AND (
          SELECT COUNT(*) FROM purchase_invoices p2
          WHERE p2.vendor_id = pi.vendor_id
            AND p2.tenant_id = ${this.tenantId}
            AND p2.status != 'cancelled'
        ) = 1
    `);

    return rows.rows.map((r) => ({
      invoiceId: r.id,
      invoiceNumber: r.invoice_number,
      vendorName: r.vendor_name,
      amount: parseFloat(r.total_amount),
      anomalyType: 'new_vendor_large' as const,
      reason: `First bill from this vendor, amount ₹${parseFloat(r.total_amount).toLocaleString('en-IN')} exceeds ₹50,000`,
      severity: 'medium' as const,
    }));
  }

  private async detectFrequencySpikes(cutoff: string): Promise<Anomaly[]> {
    const rows = await this.db.execute<{
      vendor_name: string;
      bill_count: string;
      min_date: string;
      max_date: string;
      day_span: string;
      sample_id: string;
      sample_number: string;
      sample_amount: string;
    }>(sql`
      WITH clustered AS (
        SELECT pi.vendor_id, v.name AS vendor_name,
               COUNT(*) AS bill_count,
               MIN(pi.invoice_date) AS min_date,
               MAX(pi.invoice_date) AS max_date,
               (MAX(pi.invoice_date)::date - MIN(pi.invoice_date)::date) AS day_span,
               (array_agg(pi.id ORDER BY pi.invoice_date DESC))[1] AS sample_id,
               (array_agg(pi.invoice_number ORDER BY pi.invoice_date DESC))[1] AS sample_number,
               (array_agg(pi.total_amount ORDER BY pi.invoice_date DESC))[1] AS sample_amount
        FROM purchase_invoices pi
        JOIN vendors v ON v.id = pi.vendor_id
        WHERE pi.tenant_id = ${this.tenantId}
          AND pi.status != 'cancelled'
          AND pi.invoice_date >= ${cutoff}
        GROUP BY pi.vendor_id, v.name
        HAVING COUNT(*) >= 3
          AND (MAX(pi.invoice_date)::date - MIN(pi.invoice_date)::date) <= 7
      )
      SELECT * FROM clustered
    `);

    return rows.rows.map((r) => ({
      invoiceId: r.sample_id,
      invoiceNumber: r.sample_number,
      vendorName: r.vendor_name,
      amount: parseFloat(r.sample_amount),
      anomalyType: 'frequency_spike' as const,
      reason: `${r.bill_count} bills from this vendor in ${parseInt(r.day_span) + 1} days`,
      severity: 'medium' as const,
    }));
  }

  private async detectDuplicateAdjacent(cutoff: string): Promise<Anomaly[]> {
    const rows = await this.db.execute<{
      id: string;
      invoice_number: string;
      vendor_name: string;
      total_amount: string;
      other_number: string;
      other_amount: string;
      day_diff: string;
    }>(sql`
      SELECT DISTINCT ON (pi.id)
        pi.id, pi.invoice_number, v.name AS vendor_name, pi.total_amount,
        p2.invoice_number AS other_number, p2.total_amount AS other_amount,
        ABS(pi.invoice_date::date - p2.invoice_date::date) AS day_diff
      FROM purchase_invoices pi
      JOIN purchase_invoices p2
        ON p2.vendor_id = pi.vendor_id
        AND p2.tenant_id = pi.tenant_id
        AND p2.id != pi.id
        AND p2.status != 'cancelled'
        AND ABS(pi.total_amount::numeric - p2.total_amount::numeric) <= 100
        AND ABS(pi.invoice_date::date - p2.invoice_date::date) <= 5
      JOIN vendors v ON v.id = pi.vendor_id
      WHERE pi.tenant_id = ${this.tenantId}
        AND pi.status != 'cancelled'
        AND pi.invoice_date >= ${cutoff}
      ORDER BY pi.id, day_diff
    `);

    return rows.rows.map((r) => ({
      invoiceId: r.id,
      invoiceNumber: r.invoice_number,
      vendorName: r.vendor_name,
      amount: parseFloat(r.total_amount),
      anomalyType: 'duplicate_adjacent' as const,
      reason: `Similar to invoice #${r.other_number} (₹${parseFloat(r.other_amount).toLocaleString('en-IN')}, ${r.day_diff} days apart)`,
      severity: 'high' as const,
    }));
  }
}
