window.legalPageData = {
  eyebrow: 'LEGAL · SECURITY',
  title: 'Security',
  titleItalic: 'practices.',
  subtitle: 'How we protect your books, your bank links, and your customers\' data. Continuously audited, annually attested.',
  updated: '02 May 2026',
  sections: [
    { t: 'Hosting and data residency', body: [
      'All customer data is hosted on AWS Mumbai (ap-south-1). Data never leaves India in normal operation.',
      'Backup region is AWS Hyderabad (ap-south-2). Backups are encrypted at rest and accessible only to a small operations team under a break-glass workflow.',
    ]},
    { t: 'Encryption', body: [
      'In transit: TLS 1.3, with HSTS, certificate pinning on mobile apps, and forward secrecy.',
      'At rest: AES-256-GCM. Per-tenant key derivation. Customer data is never co-mingled at the storage layer.',
      'In our backups: separately keyed, with keys held in AWS KMS under multi-party access policies.',
    ]},
    { t: 'Access control', body: [
      'Role-based access for our employees. Production access requires SSO + hardware key; logged immutably; reviewed quarterly.',
      'Customer-side: granular roles (owner, finance, articles, CA, read-only). Audit log retained 7 years on paid plans.',
      'IP allowlisting and SSO/SAML available on Scale and CA Practice plans.',
    ]},
    { t: 'Bank and payment connections', body: [
      'We connect via the RBI Account Aggregator (AA) framework and via licensed bank-feed providers. We never store bank login credentials.',
      'Connections are read-only. You can revoke access at any time from your bank portal or from runQ Settings > Connections.',
      'Payments collected through runQ run on Razorpay\'s PCI-DSS Level 1 infrastructure. We do not store card data.',
    ]},
    { t: 'Audits and certifications', body: [
      'SOC 2 Type II — annual, by a Big Four firm. Latest report available under NDA from security@runq.in.',
      'ISO 27001 — certified, audited annually.',
      'MeitY empanelment — Tier IV equivalent, current.',
      'GDPR — applicable for our EU-based customers via Standard Contractual Clauses.',
    ]},
    { t: 'Incident response', body: [
      'A documented runbook with clear owners. We commit to detection within 4 hours and customer notification within 24 hours of confirmed incident, in line with CERT-In guidelines.',
      'Post-incident, a public root-cause analysis is published at runq.in/incidents within 14 days.',
    ]},
    { t: 'Responsible disclosure', body: [
      'We run a private bug bounty via HackerOne. Email security@runq.in for an invite.',
      'We honour responsible disclosure with a 90-day window. Critical vulnerabilities reward up to ₹2,00,000.',
    ]},
  ],
};
