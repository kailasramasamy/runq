// data.js — mock data for runQ mobile prototype
// Keeps numbers India-realistic for an SME (lakhs/crores) and statuses
// straight from the docs.

window.RunQData = (() => {
  const today = new Date('2026-04-28');

  const customers = [
    { id: 'c1', name: 'Sundaram Textiles', short: 'ST', gstin: '33AAACS1234A1Z5', city: 'Coimbatore', outstanding: 348000, score: 92 },
    { id: 'c2', name: 'Krishna Distributors', short: 'KD', gstin: '36AABCK7766L1ZT', city: 'Hyderabad', outstanding: 1245000, score: 78 },
    { id: 'c3', name: 'Madhav Polymers', short: 'MP', gstin: '24AABCM9090F1ZQ', city: 'Surat', outstanding: 87500, score: 88 },
    { id: 'c4', name: 'Royal Hardware', short: 'RH', gstin: '27AAACR4321B1Z9', city: 'Pune', outstanding: 0, score: 95 },
    { id: 'c5', name: 'Vasudha Foods', short: 'VF', gstin: '29AABCV5566K1ZP', city: 'Bengaluru', outstanding: 215000, score: 84 },
  ];

  const vendors = [
    { id: 'v1', name: 'Bharat Steel Co.', short: 'BS', gstin: '07AABCB1212X1Z1', city: 'Delhi' },
    { id: 'v2', name: 'Universal Packaging', short: 'UP', gstin: '27AAFCU2090R1Z2', city: 'Mumbai' },
    { id: 'v3', name: 'Coromandel Logistics', short: 'CL', gstin: '33AAACC8765D1Z3', city: 'Chennai' },
    { id: 'v4', name: 'Nimbus Tech Services', short: 'NT', gstin: '29AAACN4567T1Z4', city: 'Bengaluru' },
    { id: 'v5', name: 'Harmony Stationers', short: 'HS', gstin: '24AAACH9090F1ZQ', city: 'Ahmedabad' },
  ];

  // Sales invoices (AR)
  const invoices = [
    { id: 'INV-2026-0142', customerId: 'c2', amount: 285400, date: '2026-04-26', due: '2026-05-26', status: 'sent', items: 6, gst: 43544 },
    { id: 'INV-2026-0141', customerId: 'c1', amount: 124800, date: '2026-04-24', due: '2026-05-09', status: 'partially_paid', paid: 80000, items: 3, gst: 19036 },
    { id: 'INV-2026-0140', customerId: 'c5', amount: 67200, date: '2026-04-22', due: '2026-04-29', status: 'sent', items: 2, gst: 10250 },
    { id: 'INV-2026-0139', customerId: 'c3', amount: 87500, date: '2026-04-08', due: '2026-04-23', status: 'overdue', items: 4, gst: 13348 },
    { id: 'INV-2026-0138', customerId: 'c2', amount: 412000, date: '2026-04-04', due: '2026-04-19', status: 'overdue', items: 8, gst: 62847 },
    { id: 'INV-2026-0137', customerId: 'c4', amount: 156000, date: '2026-04-02', due: '2026-04-17', status: 'paid', items: 5, gst: 23797 },
    { id: 'INV-2026-0136', customerId: 'c1', amount: 223200, date: '2026-03-28', due: '2026-04-12', status: 'paid', items: 7, gst: 34047 },
    { id: 'INV-2026-0135', customerId: 'c5', amount: 147800, date: '2026-03-24', due: '2026-04-08', status: 'paid', items: 4, gst: 22546 },
  ];

  // Vendor bills (AP)
  const bills = [
    { id: 'BIL-2026-0089', vendorId: 'v1', amount: 587200, date: '2026-04-27', due: '2026-05-12', status: 'pending_match', items: 4, gst: 89576, ai: true, hasPO: true, has3wm: 'matched' },
    { id: 'BIL-2026-0088', vendorId: 'v2', amount: 64500, date: '2026-04-26', due: '2026-05-11', status: 'approved', items: 2, gst: 9839, ai: true },
    { id: 'BIL-2026-0087', vendorId: 'v3', amount: 38900, date: '2026-04-25', due: '2026-05-10', status: 'approved', items: 1, gst: 5934, ai: false },
    { id: 'BIL-2026-0086', vendorId: 'v4', amount: 142000, date: '2026-04-24', due: '2026-05-08', status: 'partially_paid', paid: 50000, items: 1, gst: 21661, ai: true },
    { id: 'BIL-2026-0085', vendorId: 'v5', amount: 12450, date: '2026-04-22', due: '2026-04-29', status: 'approved', items: 6, gst: 1899, ai: true },
    { id: 'BIL-2026-0084', vendorId: 'v1', amount: 248700, date: '2026-04-18', due: '2026-04-30', status: 'paid', items: 3, gst: 37937, ai: false },
  ];

  const approvals = [
    { id: 'a1', kind: 'bill', ref: 'BIL-2026-0089', who: 'Bharat Steel Co.', amount: 587200, requestedBy: 'Anita Rao', requestedAt: '2026-04-27T10:14:00', urgent: true },
    { id: 'a2', kind: 'payment', ref: 'PAY batch · 4 bills', who: 'Pay run · weekly', amount: 364050, requestedBy: 'Priya M.', requestedAt: '2026-04-27T08:02:00', urgent: false },
    { id: 'a3', kind: 'invoice', ref: 'INV-2026-0143', who: 'Sundaram Textiles', amount: 198000, requestedBy: 'Vikram S.', requestedAt: '2026-04-26T17:40:00', urgent: false },
    { id: 'a4', kind: 'bill', ref: 'BIL-2026-0090', who: 'Coromandel Logistics', amount: 22400, requestedBy: 'Anita Rao', requestedAt: '2026-04-26T15:25:00', urgent: false },
  ];

  const banks = [
    { id: 'b1', bank: 'ICICI Bank', short: 'ICICI', acct: '··· 4421', balance: 4828340, type: 'Current', uncategorized: 8, color: '#F37021' },
    { id: 'b2', bank: 'HDFC Bank', short: 'HDFC', acct: '··· 9087', balance: 1245600, type: 'Current', uncategorized: 3, color: '#004C8F' },
    { id: 'b3', bank: 'Razorpay', short: 'RZP', acct: 'PG · live', balance: 287400, type: 'Payment Gateway', uncategorized: 2, color: '#072654' },
    { id: 'b4', bank: 'Petty Cash', short: 'PC', acct: 'On-hand', balance: 24800, type: 'Cash', uncategorized: 0, color: '#65574A' },
  ];

  const bankTxns = [
    { id: 't1', bankId: 'b1', date: '2026-04-28', narration: 'IMPS-IN/SUNDARAM TEXTILES/INV0141', amount: 80000, dir: 'in', matchedTo: 'INV-2026-0141', confidence: 0.98 },
    { id: 't2', bankId: 'b1', date: '2026-04-28', narration: 'NEFT-OUT/UNIVERSAL PKG/Bill 88', amount: -64500, dir: 'out', matchedTo: 'BIL-2026-0088', confidence: 0.95 },
    { id: 't3', bankId: 'b1', date: '2026-04-28', narration: 'POS/SWIGGY*INSTAMART/4421', amount: -1240, dir: 'out', matchedTo: null, confidence: 0.0, suggested: 'Office Snacks' },
    { id: 't4', bankId: 'b1', date: '2026-04-27', narration: 'UPI/CORO LOG@axis/p2m', amount: -38900, dir: 'out', matchedTo: 'BIL-2026-0087', confidence: 0.92 },
    { id: 't5', bankId: 'b1', date: '2026-04-27', narration: 'ACH-DR/SALARY APRIL/HRMS', amount: -842000, dir: 'out', matchedTo: null, confidence: 0.0, suggested: 'Salaries — April' },
    { id: 't6', bankId: 'b1', date: '2026-04-27', narration: 'IMPS-IN/MADHAV POLY/refund', amount: 12500, dir: 'in', matchedTo: null, confidence: 0.0, suggested: 'Refund · Madhav Polymers' },
  ];

  const insights = [
    { id: 'i1', tone: 'good', title: 'Cash position is healthy', body: 'You ended yesterday with ₹63.85L across 4 accounts — 18% above your 90-day average.' },
    { id: 'i2', tone: 'warn', title: '2 invoices crossed 30 days', body: '₹4.99L overdue from Krishna Distributors. Last reminder sent 11 days ago.' },
    { id: 'i3', tone: 'tip', title: 'Take an early-pay discount', body: 'Bharat Steel offers 2% if paid by May 5. Saving ₹11,744 — pay now?' },
  ];

  // Cash position sparkline — last 14 days, in lakhs
  const cashSpark = [52, 51.4, 53.8, 54.2, 55.1, 54.6, 56.0, 57.3, 58.1, 60.4, 61.8, 62.2, 63.1, 63.85];

  return {
    today,
    customers, vendors,
    invoices, bills, approvals,
    banks, bankTxns,
    insights, cashSpark,
    byId: {
      customer: (id) => customers.find(c => c.id === id),
      vendor:   (id) => vendors.find(v => v.id === id),
    },
  };
})();
