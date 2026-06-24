import { LegalPage, type LegalData } from '@/components/marketing/legal-page';

// Support page for the Dhenu milk-procurement mobile app. Linked from the
// Apple App Store and Google Play listings (support URL). Gives users a real
// contact channel plus answers to the most common questions.
const data: LegalData = {
  documentTitle: 'Support — Dhenu',
  eyebrow: 'DHENU · SUPPORT',
  title: 'Dhenu',
  titleItalic: 'support.',
  subtitle:
    'Help with the Dhenu milk-procurement app — signing in, recording milk, rates, payments, and your account.',
  updated: '24 June 2026',
  sections: [
    { t: 'Get in touch', body: [
      'Email us at support@runq.in and we will reply within 1 working day. Please tell us your name, the 10-digit phone number registered with Dhenu, and the dairy or collection centre you work with so we can find your account quickly.',
      'For urgent collection-time issues, your dairy or VMCC administrator can also help directly — they manage logins and can correct entries on the spot.',
    ]},
    { t: 'Signing in', body: [
      'Dhenu uses your phone number and date of birth for first sign-in, set up by your dairy or VMCC administrator. After that you can link Google or Apple sign-in for faster access.',
      'Can’t sign in? Check that your phone number and date of birth match what your dairy registered. After repeated failed attempts the login locks for safety — ask your administrator to reset it.',
    ]},
    { t: 'Recording milk & rates', body: [
      'Operators: record a pour by selecting the farmer, the shift (AM/PM), and milk type, then entering litres or CLR. The rate is calculated automatically from quality (FAT/SNF or CLR).',
      'Farmers: your daily and per-cycle volume, quality, and earnings appear on your home screen, and the rate chart shows what each quality band pays before you pour.',
      'Spotted a wrong entry? Ask your collection-centre operator to correct it before the shift is closed. After close, contact support@runq.in.',
    ]},
    { t: 'Payments', body: [
      'Your payment history and the amount payable for each cycle are shown under Payments in the app. Payments are made by your operating dairy according to its cycle.',
      'If a payment looks wrong or missing, contact your dairy/VMCC administrator first, or email support@runq.in and we will investigate.',
    ]},
    { t: 'Language', body: [
      'Dhenu is available in English and regional languages. You can change the app language from your phone settings or your profile, where supported by your dairy.',
    ]},
    { t: 'Privacy & account deletion', body: [
      'Read how we handle your data at runq.in/dhenu/privacy.',
      'To delete your account and personal data, see runq.in/dhenu/delete-account.',
    ]},
    { t: 'Who we are', body: [
      'Dhenu is operated by Quartex Technologies Pvt Ltd, Indiranagar, Bengaluru 560038. For any question about the app, email support@runq.in.',
    ]},
  ],
};

export default function DhenuSupportPage() {
  return <LegalPage data={data} />;
}
