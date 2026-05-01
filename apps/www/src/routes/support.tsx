import { LegalPage } from '@/components/legal-page';

export default function Support() {
  return (
    <LegalPage
      title="Support"
      subtitle="We're here to help you get the most out of runQ."
      effectiveDate="May 1, 2026"
    >
      <h2>Get in touch</h2>
      <p>
        The fastest way to reach us is by email. We respond within one business day, often much sooner.
      </p>
      <ul>
        <li><strong>Email:</strong> <a href="mailto:support@runq.in">support@runq.in</a></li>
        <li><strong>Web:</strong> <a href="https://www.runq.in">www.runq.in</a></li>
        <li><strong>Hours:</strong> Monday – Friday, 9:00 AM – 7:00 PM IST</li>
      </ul>

      <h2>What to include in your email</h2>
      <p>To help us help you faster, please include:</p>
      <ul>
        <li>The email address associated with your runQ account.</li>
        <li>A short description of what you were doing when the issue happened.</li>
        <li>The screen or feature involved (e.g., "Creating an invoice", "GSTR-1 generation", "Bank reconciliation").</li>
        <li>A screenshot or screen recording, if possible — this often saves a round trip.</li>
        <li>The device and OS (iOS / Android version, or browser if on web).</li>
      </ul>

      <h2>Common topics</h2>

      <h3>Billing and subscriptions</h3>
      <p>
        Questions about plans, invoices, upgrades, downgrades, or cancellations? Email us with your account
        email and we'll sort it out.
      </p>

      <h3>GST filing</h3>
      <p>
        If a return failed to upload or you're seeing a validation error, share the period (e.g., MM/YYYY)
        and the error message. Our team can usually identify the issue from the GSP response.
      </p>

      <h3>Bank reconciliation</h3>
      <p>
        If transactions are missing or duplicated, let us know the bank account and the date range.
        We can re-pull the statement or run the matching engine on a clean slate.
      </p>

      <h3>Bill scan / AI extraction</h3>
      <p>
        If the AI extracted incorrect data, you can edit any field manually inside the draft bill.
        Forwarding us the original bill PDF helps us improve the model for everyone.
      </p>

      <h2>Account deletion</h2>
      <p>
        To request deletion of your runQ account and personal data, email <a href="mailto:support@runq.in">support@runq.in</a>
        from your registered address with the subject "Delete my account". We'll confirm and process the
        request within 30 days. Note that some financial records are retained for up to seven years to comply with
        Indian tax law — see our <a href="/privacy">Privacy Policy</a> for details.
      </p>

      <h2>Feedback and feature requests</h2>
      <p>
        We build runQ for businesses like yours, and we love hearing what would make it better.
        Email us with the subject "Feedback" or "Feature request" and tell us what you'd like to see.
      </p>

      <h2>Status and incidents</h2>
      <p>
        For service availability and incident updates, we will post notices in-app. If runQ isn't loading
        and you suspect an outage, please email us right away.
      </p>
    </LegalPage>
  );
}
