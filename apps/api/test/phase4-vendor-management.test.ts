import { describe, it, expect } from 'vitest';
import { get, post, put, testSuffix } from './helpers';

describe('Phase 4: Vendor Contracts', () => {
  let contractId: string;
  const contractNumber = `CTR${testSuffix}`;

  it('creates a vendor contract', async () => {
    const vendors = await get('/ap/vendors');
    const vendorId = vendors.body.data?.[0]?.id;
    if (!vendorId) {
      console.log('No vendors found, skipping');
      return;
    }

    const { status, body } = await post('/vendor-management/contracts', {
      vendorId,
      contractNumber,
      title: `Supply Agreement${testSuffix}`,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      value: 500000,
      terms: 'Net 30 payment terms',
    });
    expect(status).toBe(201);
    expect(body.data).toHaveProperty('id');
    contractId = body.data.id;
  });

  it('lists contracts', async () => {
    const { status, body } = await get('/vendor-management/contracts');
    expect(status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
  });
});

describe('Phase 4: Vendor Ratings', () => {
  it('creates a vendor rating', async () => {
    const vendors = await get('/ap/vendors');
    const vendorId = vendors.body.data?.[0]?.id;
    if (!vendorId) {
      console.log('No vendors found, skipping');
      return;
    }

    const uniquePeriod = `T${Math.floor(Math.random() * 9999).toString().padStart(4, '0')}-Q${Math.floor(Math.random() * 4) + 1}`;
    const { status, body } = await post('/vendor-management/ratings', {
      vendorId,
      period: uniquePeriod,
      deliveryScore: 4,
      qualityScore: 5,
      pricingScore: 3,
      notes: 'Good quality, pricing could be better',
    });
    expect(status).toBe(201);
    expect(body.data.overallScore).toBe(4);
  });

  it('gets vendor scorecard', async () => {
    const vendors = await get('/ap/vendors');
    const vendorId = vendors.body.data?.[0]?.id;
    if (!vendorId) return;

    const { status, body } = await get(
      `/vendor-management/ratings/scorecard/${vendorId}`,
    );
    expect(status).toBe(200);
    expect(body.data).toHaveProperty('avgOverall');
  });
});

describe('Phase 4: Purchase Requisitions', () => {
  let requisitionId: string;

  it('creates a purchase requisition', async () => {
    const { status, body } = await post(
      '/vendor-management/requisitions',
      {
        description: `Office supplies${testSuffix}`,
        items: [
          {
            itemName: 'Printer Paper A4',
            quantity: 100,
            estimatedUnitPrice: 250,
          },
          {
            itemName: 'Ink Cartridges',
            quantity: 10,
            estimatedUnitPrice: 1500,
          },
        ],
      },
    );
    expect(status).toBe(201);
    expect(body.data).toHaveProperty('id');
    expect(body.data.totalAmount).toBe(40000);
    expect(body.data.status).toBe('draft');
    requisitionId = body.data.id;
  });

  it('lists requisitions', async () => {
    const { status, body } = await get(
      '/vendor-management/requisitions',
    );
    expect(status).toBe(200);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('approves a requisition', async () => {
    if (!requisitionId) return;
    const { status, body } = await put(
      `/vendor-management/requisitions/${requisitionId}/approve`,
      {},
    );
    expect(status).toBe(200);
    expect(body.data.status).toBe('approved');
  });
});

describe('Phase 4: Payment Schedules', () => {
  it('creates a payment schedule', async () => {
    const invoices = await get('/ap/purchase-invoices?page=1&limit=1');
    const invoice = invoices.body.data?.[0];
    if (!invoice) {
      console.log('No invoices found, skipping');
      return;
    }

    const { status, body } = await post(
      '/vendor-management/payment-schedules',
      {
        name: `Friday Payments${testSuffix}`,
        scheduledDate: '2026-04-04',
        items: [
          {
            invoiceId: invoice.id,
            vendorId: invoice.vendorId,
            amount: 10000,
          },
        ],
      },
    );
    expect(status).toBe(201);
    expect(body.data).toHaveProperty('id');
    expect(body.data.status).toBe('draft');
  });

  it('lists payment schedules', async () => {
    const { status, body } = await get(
      '/vendor-management/payment-schedules',
    );
    expect(status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
  });
});

describe('Phase 4: Early Payment Discounts', () => {
  it('lists early payment discount opportunities', async () => {
    const { status, body } = await get(
      '/vendor-management/early-payment-discounts',
    );
    expect(status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
  });
});
