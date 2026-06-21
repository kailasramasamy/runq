import { LegalPage, type LegalData } from '@/components/marketing/legal-page';

// Privacy policy for the Dhenu milk-procurement mobile app. Linked from the
// Google Play store listing (mandatory privacy policy URL). Discloses the data
// the app actually collects — phone, DOB, name, address, Aadhaar, photos, GPS —
// so it stays consistent with the Play Data Safety declaration.
const data: LegalData = {
  documentTitle: 'Privacy — Dhenu',
  eyebrow: 'DHENU · PRIVACY',
  title: 'Dhenu privacy',
  titleItalic: 'policy.',
  subtitle:
    'What the Dhenu app collects, why, how it is stored, and the choices you have. Specific to the Dhenu milk-procurement app.',
  updated: '21 June 2026',
  sections: [
    { t: 'Who we are', body: [
      'Dhenu is a milk-procurement app operated by Quartex Technologies Pvt Ltd ("Quartex", "we", "us"), registered office at Indiranagar, Bengaluru 560038. We are a data fiduciary under the Digital Personal Data Protection Act 2023.',
      'Dhenu is used by farmers and collection-centre operators on behalf of a dairy or village milk collection centre (VMCC). This policy covers the Dhenu mobile app specifically.',
    ]},
    { t: 'Information we collect', body: [
      'Account and identity: name, phone number, date of birth, and — where the operating dairy requires it for member KYC — Aadhaar number. Your phone number and date of birth are used to sign you in.',
      'Profile: address, village, cattle/breed details, and a profile photograph, where provided by you or your collection-centre operator.',
      'Location: a precise GPS pin captured only when a farm location is being registered. We do not track your location in the background.',
      'Photos: images you or your operator capture for your profile or for procurement records.',
      'Authentication: if you sign in with Google or Apple, we receive a basic account identifier from that provider to recognise you on future logins.',
      'Device: a push-notification token so the app can notify you about collections and payments.',
    ]},
    { t: 'Why we collect it', body: [
      'To run milk procurement: record your pours, milk quality, rates, and payments, and show them back to you.',
      'To sign you in and keep your account secure (phone + date of birth, or Google/Apple).',
      'To send you operational notifications about collections, dispatch, and payments.',
      'To meet the operating dairy’s record-keeping and KYC obligations under Indian law.',
      'We do not use your data for advertising, and we do not sell it.',
    ]},
    { t: 'Data storage and security', body: [
      'Data is hosted on AWS Mumbai (ap-south-1), encrypted at rest and in transit (TLS).',
      'Sign-in is handled via Google Firebase Authentication. Access to production data is restricted and logged.',
      'Aadhaar and other sensitive identifiers are stored only where required and are not displayed beyond the operating dairy’s authorised users.',
    ]},
    { t: 'Sharing your data', body: [
      'With your operating dairy / VMCC: your procurement records, profile, and KYC are visible to the dairy you supply, as that is who you transact with.',
      'With service providers strictly needed to run Dhenu: AWS (hosting) and Google Firebase (authentication and push notifications).',
      'With government authorities only on a valid legal request, limited to the data demanded.',
      'Never sold, never shared with advertisers.',
    ]},
    { t: 'Your rights', body: [
      'You can ask to access or correct your personal data at any time by contacting your dairy/VMCC administrator or emailing support@runq.in.',
      'You can request deletion of your account and personal data at runq.in/dhenu/delete-account. Transaction records that form part of the dairy’s statutory books are retained as required by Indian tax law (up to 8 years) and then deleted.',
    ]},
    { t: 'Children', body: [
      'Dhenu is a tool for adults working in dairy procurement and is not directed at children under 18.',
    ]},
    { t: 'Changes and contact', body: [
      'We will update this page when our practices change; the current version always lives at runq.in/dhenu/privacy.',
      'For any privacy question, email support@runq.in. Quartex Technologies Pvt Ltd, Indiranagar, Bengaluru 560038.',
    ]},
  ],
};

export default function DhenuPrivacyPage() {
  return <LegalPage data={data} />;
}
