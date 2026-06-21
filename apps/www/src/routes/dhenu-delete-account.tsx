import { LegalPage, type LegalData } from '@/components/marketing/legal-page';

// Account & data deletion request page for the Dhenu mobile app. Linked from the
// Google Play Data Safety form (mandatory deletion URL). Dhenu accounts are
// provisioned by the dairy/VMCC admin, so deletion is request-based.
const data: LegalData = {
  documentTitle: 'Delete your account — Dhenu',
  eyebrow: 'DHENU · ACCOUNT DELETION',
  title: 'Delete your',
  titleItalic: 'account.',
  subtitle:
    'How to request deletion of your Dhenu account and the personal data associated with it.',
  updated: '21 June 2026',
  sections: [
    { t: 'About Dhenu accounts', body: [
      'Dhenu is the milk-procurement app operated by Quartex Technologies Pvt Ltd ("Quartex"). It is used by farmers and collection-centre operators on behalf of a dairy or village milk collection centre (VMCC).',
      'Your Dhenu login is set up by your dairy or VMCC administrator using your phone number and date of birth. You can ask, at any time, for your account and personal data to be deleted.',
    ]},
    { t: 'How to request deletion', body: [
      'Email support@runq.in from any address, or send a written request, with the subject line "Delete my Dhenu account". Include your full name and the 10-digit phone number registered with Dhenu so we can locate your account.',
      'Alternatively, ask your dairy or VMCC administrator to remove you — they can deactivate your login directly, which immediately disables access.',
      'We verify that the request comes from the account holder before deleting anything.',
    ]},
    { t: 'What gets deleted', body: [
      'Your login credentials: phone number, date of birth, and any linked Google or Apple sign-in.',
      'Your personal profile: name, address, village, Aadhaar number, photograph, cattle details, and GPS location pin.',
      'Your device push-notification tokens, so the app can no longer send you notifications.',
      'Once deleted, you will no longer be able to sign in to Dhenu.',
    ]},
    { t: 'What we retain, and why', body: [
      'Milk pour, quality, and payment records form part of the dairy’s financial and statutory books. As required by Indian tax and accounting law, these transaction records are retained by the operating dairy for up to 8 years, after which they are deleted.',
      'Where retained, these records are kept only as part of the dairy’s accounts and are de-linked from your contact and identity details to the extent the law allows.',
    ]},
    { t: 'Timeline', body: [
      'We acknowledge deletion requests within 3 working days and complete deletion of personal data within 30 days, except for records we are legally required to retain (see above).',
    ]},
    { t: 'Contact', body: [
      'For any question about account or data deletion, email support@runq.in. Quartex Technologies Pvt Ltd, Indiranagar, Bengaluru 560038.',
    ]},
  ],
};

export default function DhenuDeleteAccountPage() {
  return <LegalPage data={data} />;
}
