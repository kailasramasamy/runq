import { LegalPage } from '@/components/legal-page';

export default function Privacy() {
  return (
    <LegalPage
      title="Privacy Policy"
      subtitle="How runQ collects, uses, and protects your data."
      effectiveDate="May 1, 2026"
    >
      <p>
        runQ ("we", "us", or "our") is operated by Quartex Technologies, based in Bangalore, India.
        This Privacy Policy explains what information we collect when you use the runQ web application,
        mobile apps, and related services (the "Service"), how we use it, and the choices you have.
      </p>
      <p>
        By using runQ, you agree to the collection and use of information as described in this policy.
      </p>

      <h2>1. Information we collect</h2>

      <h3>Information you provide</h3>
      <ul>
        <li><strong>Account information:</strong> name, email address, phone number, and password.</li>
        <li><strong>Business information:</strong> company name, GSTIN, PAN, address, state, and bank account details for the Banking module.</li>
        <li><strong>Financial records:</strong> invoices, bills, payments, receipts, customer and vendor details, and any other accounting data you enter or upload.</li>
        <li><strong>Photos and files:</strong> bill scans, receipts, and other documents you upload through the bill capture feature or share into the app.</li>
        <li><strong>GST credentials:</strong> GST portal username (the password and OTP are never stored — they are forwarded directly to GSTN through our authorized GSP and discarded).</li>
        <li><strong>Communications:</strong> messages you send to us via the support channel or email.</li>
      </ul>

      <h3>Information collected automatically</h3>
      <ul>
        <li><strong>Usage logs:</strong> request timestamps, API endpoint accessed, error codes — used for operational monitoring, fraud prevention, and audit trails. These are not used for behavioural analytics.</li>
        <li><strong>Device and connection data:</strong> IP address, browser type, mobile OS, app version. Used for security and to ensure compatibility.</li>
      </ul>

      <p>
        runQ does not use third-party advertising or analytics SDKs, and does not track you across other apps or websites.
      </p>

      <h2>2. How we use your information</h2>
      <p>We use the information we collect solely to:</p>
      <ul>
        <li>Provide and operate the Service (authentication, sending invoices, recording payments, generating reports, GST filing).</li>
        <li>Communicate with you about your account, security alerts, billing, and product updates.</li>
        <li>Maintain audit logs and support legal/regulatory compliance (e.g., GST, Income Tax, anti-fraud).</li>
        <li>Improve the Service through aggregated, anonymized usage patterns.</li>
        <li>Respond to support requests.</li>
      </ul>
      <p>
        We do <strong>not</strong> sell, rent, or share your personal or business data with third parties for advertising, marketing, or any other commercial purpose.
      </p>

      <h2>3. Sharing of information</h2>
      <p>We share information only with:</p>
      <ul>
        <li><strong>Authorized service providers</strong> we engage to operate runQ (e.g., cloud hosting on Amazon Web Services Mumbai region, email delivery, WhatsApp Business API, payment gateways for billing). These providers are bound by contract to protect your data.</li>
        <li><strong>GSTN and authorized GSPs</strong> when you initiate GST return filing or fetch GSTR-2B data through runQ.</li>
        <li><strong>Banking partners and account aggregators</strong> when you connect a bank account for reconciliation.</li>
        <li><strong>Legal authorities</strong> when required by law, court order, or to protect the rights, safety, or property of runQ, our users, or the public.</li>
        <li><strong>Acquirers</strong> in the event of a merger, acquisition, or sale of assets — with notice and continued protection under this policy or an equivalent one.</li>
      </ul>

      <h2>4. Data location and security</h2>
      <p>
        Your data is hosted in Amazon Web Services (Mumbai, ap-south-1). It is encrypted in transit (TLS 1.3) and at rest (AES-256). We perform daily backups with point-in-time recovery and 30-day retention.
      </p>
      <p>
        Access to production systems is restricted, multi-factor authenticated, and audit-logged. We follow industry-standard practices and are working toward SOC 2 Type II compliance.
      </p>
      <p>
        No method of transmission or storage is 100% secure. While we strive to protect your information, we cannot guarantee absolute security.
      </p>

      <h2>5. Data retention</h2>
      <p>
        We retain your data for as long as your account is active. If you cancel your account, we retain your business records for up to <strong>seven years</strong> to comply with Indian Income Tax and GST record-keeping requirements, after which the data is permanently deleted.
      </p>
      <p>
        You may request earlier deletion of personal information that is not subject to a legal retention obligation by writing to <a href="mailto:support@runq.in">support@runq.in</a>.
      </p>

      <h2>6. Your rights</h2>
      <p>You have the right to:</p>
      <ul>
        <li><strong>Access</strong> the personal data we hold about you.</li>
        <li><strong>Correct</strong> inaccurate data — most fields are editable directly in the app.</li>
        <li><strong>Export</strong> your accounting data at any time (CSV, Excel, or JSON exports are available in-app).</li>
        <li><strong>Delete</strong> your personal data, subject to legal retention requirements.</li>
        <li><strong>Withdraw consent</strong> for any optional processing.</li>
      </ul>
      <p>
        To exercise any of these rights, email <a href="mailto:support@runq.in">support@runq.in</a>. We respond within 30 days.
      </p>

      <h2>7. Children's privacy</h2>
      <p>
        runQ is a business productivity service intended for adults (18+). We do not knowingly collect data from children under 18. If you believe a child has provided us with personal information, please contact us and we will delete it.
      </p>

      <h2>8. Changes to this policy</h2>
      <p>
        We may update this Privacy Policy from time to time. Material changes will be communicated to you via email or an in-app notice at least 30 days before the change takes effect. The "Effective" date at the top of this page reflects the latest revision.
      </p>

      <h2>9. Contact</h2>
      <p>
        Questions about this policy or your data? Reach us at:
      </p>
      <p>
        <strong>Quartex Technologies</strong><br />
        Email: <a href="mailto:support@runq.in">support@runq.in</a><br />
        Bangalore, India
      </p>
    </LegalPage>
  );
}
