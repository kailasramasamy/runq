window.legalPageData = {
  eyebrow: 'LEGAL · GST COMPLIANCE',
  title: 'GST',
  titleItalic: 'compliance.',
  subtitle: 'How runQ stays in step with the GSTN, IRP, and the e-Way bill portal. What is supported, how filings work, and what stays your responsibility.',
  updated: '02 May 2026',
  sections: [
    { t: 'GSTN integration', body: [
      'runQ is a GSTN Suvidha Provider (GSP)-backed platform. We connect via GSP infrastructure to the GST common portal for return filing, ledger sync, and 2B fetch.',
      'GSTR-1, GSTR-3B, GSTR-2B, GSTR-9, GSTR-9C, CMP-08, GSTR-4, ITC-04 are all supported end-to-end. GSTR-2A is read-only for reconciliation.',
    ]},
    { t: 'e-Invoice (IRN)', body: [
      'Direct integration with the Invoice Registration Portal (IRP). IRN and signed QR are generated and embedded on the invoice PDF in real time.',
      'Applicable to taxpayers with aggregate turnover above ₹5 crore. runQ auto-detects threshold and prompts when activation is required.',
    ]},
    { t: 'e-Way bill', body: [
      'Direct integration with ewaybillgst.gov.in. Generated alongside the invoice for inter-state movement above ₹50,000 (₹1,00,000 in some intra-state cases).',
      'Vehicle number, transporter ID, distance — captured at point of dispatch, on web or mobile.',
    ]},
    { t: 'Reconciliation and matching', body: [
      'GSTR-2B is fetched on the 14th of every month and matched line-by-line against your purchase ledger.',
      'Mismatches are categorised: missing in 2B, missing in books, value differences, rate differences, GSTIN mismatches. Each surfaces in your dashboard with a recommended action.',
      'ITC eligibility is computed correctly for blocked credits (Section 17(5)) and proportionate reversal (Rule 42/43).',
    ]},
    { t: 'Multi-GSTIN and multi-state', body: [
      'A single company in runQ can host multiple GSTINs (one per state of registration). Returns are filed per GSTIN; financials roll up to the parent.',
      'Inter-branch stock transfers are handled with delivery challans and tax invoices as appropriate, with input tax credit flowing correctly.',
    ]},
    { t: 'Your responsibilities', body: [
      'You remain responsible for the accuracy of the data and the legal correctness of the returns you file. runQ is a tool, not a tax adviser.',
      'We strongly recommend a Chartered Accountant review every monthly return before submission. The CA Portal and bulk filing tools are designed for exactly this.',
      'Late fees, interest, and penalties imposed by the GST authorities for delayed filing or incorrect data remain your responsibility.',
    ]},
    { t: 'Deprecations and updates', body: [
      'GSTN periodically deprecates schemas. We update our integrations within 7 days of any GSTN/IRP advisory and notify affected customers in advance.',
      'Subscribe to runq.in/changelog for compliance-related updates.',
    ]},
  ],
};
