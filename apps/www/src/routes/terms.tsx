import { LegalPage } from '@/components/legal-page';

export default function Terms() {
  return (
    <LegalPage
      title="Terms of Service"
      subtitle="The agreement between you and runQ when you use our services."
      effectiveDate="May 1, 2026"
    >
      <p>
        These Terms of Service ("Terms") govern your use of runQ — a software-as-a-service finance and operations
        platform — provided by Quartex Technologies ("runQ", "we", "us"), based in Bangalore, India.
        By creating an account or using the Service, you agree to these Terms.
      </p>

      <h2>1. Eligibility</h2>
      <p>
        runQ is intended for businesses and adult professionals (18+) operating in India. By using the Service,
        you represent that you have the authority to bind your organization to these Terms.
      </p>

      <h2>2. Your account</h2>
      <ul>
        <li>You are responsible for maintaining the confidentiality of your login credentials and for all activity under your account.</li>
        <li>Notify us immediately at <a href="mailto:support@runq.in">support@runq.in</a> if you suspect unauthorized access.</li>
        <li>You may invite team members and assign them roles. The account owner is responsible for actions taken by all users on the account.</li>
      </ul>

      <h2>3. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use runQ for any unlawful purpose or in violation of Indian law (including tax, GST, and anti-money-laundering regulations).</li>
        <li>Upload malicious code, attempt to gain unauthorized access to the Service, or disrupt its operation.</li>
        <li>Reverse-engineer, scrape, or resell the Service without our written consent.</li>
        <li>Use the Service to generate fraudulent invoices, falsified financial records, or to evade tax obligations.</li>
        <li>Impersonate another person or entity, or upload data you do not have the right to share.</li>
      </ul>

      <h2>4. Subscription and billing</h2>
      <ul>
        <li>runQ is offered on a subscription basis (Starter, Pro, Enterprise) plus a free trial period.</li>
        <li>Fees are billed in advance and are non-refundable except as required by law or as specifically stated.</li>
        <li>You authorize us to charge your designated payment method on each billing cycle until you cancel.</li>
        <li>We may change prices with 30 days' written notice. Continued use after the change indicates acceptance.</li>
        <li>You can cancel anytime; cancellation takes effect at the end of your current billing period.</li>
      </ul>

      <h2>5. Your data</h2>
      <p>
        You retain all rights, title, and ownership of the data you upload to runQ ("Customer Data"). You grant us
        a limited, non-exclusive license to host, process, transmit, and display Customer Data solely for the
        purpose of providing and improving the Service.
      </p>
      <p>
        Our handling of personal data is governed by our <a href="/privacy">Privacy Policy</a>. You can export your
        data at any time and request deletion subject to legal retention obligations.
      </p>

      <h2>6. GST filing and third-party integrations</h2>
      <p>
        runQ integrates with the GST Network (GSTN) through authorized GST Suvidha Providers (GSPs), banking
        partners through account aggregators, and various communication providers (WhatsApp, email, SMS).
      </p>
      <p>
        You are responsible for the accuracy and completeness of the information you submit through these integrations
        — including GST returns, payment instructions, and communications sent to your customers and vendors.
        runQ acts as an intermediary and is not liable for filing rejections, payment failures, or compliance
        issues arising from incorrect data.
      </p>

      <h2>7. Service availability</h2>
      <p>
        We aim for 99.9% uptime, but the Service is provided on an "as is" and "as available" basis. We may
        perform planned maintenance with at least 48 hours' notice. We are not liable for downtime caused by
        third-party providers, force majeure events, or factors outside our reasonable control.
      </p>

      <h2>8. Intellectual property</h2>
      <p>
        runQ, the runQ logo, the Service software, and all related content (excluding Customer Data) are owned
        by Quartex Technologies and protected by Indian and international copyright, trademark, and other laws.
        Nothing in these Terms grants you any right to use our trademarks or branding without prior written consent.
      </p>

      <h2>9. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, runQ's total liability for any claim arising out of or relating
        to these Terms or the Service will not exceed the fees you paid us in the twelve months preceding the
        claim. We are not liable for indirect, incidental, consequential, or punitive damages, including loss of
        profits, data, or goodwill.
      </p>

      <h2>10. Indemnification</h2>
      <p>
        You agree to indemnify and hold harmless runQ, its directors, employees, and agents from any claims,
        damages, losses, or costs (including reasonable legal fees) arising from your breach of these Terms or
        your misuse of the Service.
      </p>

      <h2>11. Termination</h2>
      <ul>
        <li>You may terminate your account at any time from in-app settings or by emailing us.</li>
        <li>We may suspend or terminate your account for breach of these Terms, non-payment, or fraudulent activity, with or without notice.</li>
        <li>Upon termination, your access to the Service will end. You can export your data for up to 30 days after termination, after which it may be deleted (subject to legal retention requirements described in our Privacy Policy).</li>
      </ul>

      <h2>12. Governing law and jurisdiction</h2>
      <p>
        These Terms are governed by the laws of India. Any dispute arising out of or relating to these Terms
        or the Service will be subject to the exclusive jurisdiction of the courts at Bangalore, Karnataka.
      </p>

      <h2>13. Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. Material changes will be notified by email or in-app at
        least 30 days before they take effect. Continued use of the Service after the effective date constitutes
        acceptance of the revised Terms.
      </p>

      <h2>14. Contact</h2>
      <p>
        <strong>Quartex Technologies</strong><br />
        Email: <a href="mailto:support@runq.in">support@runq.in</a><br />
        Bangalore, India
      </p>
    </LegalPage>
  );
}
