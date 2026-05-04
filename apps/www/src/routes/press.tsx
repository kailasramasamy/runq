import { FileText } from 'lucide-react';
import { AudiencePage, type AudienceData } from '@/components/marketing/audience-page';

const data: AudienceData = {
  documentTitle: 'Press — runQ',
  eyebrow: 'COMPANY · PRESS',
  title: 'Press & media.',
  titleItalic: 'On the record.',
  subtitle: 'Resources, statements, brand assets, and contact for journalists, analysts, and partners writing about Indian SME software.',
  accent: 'brand',
  lead: [
    'For media inquiries, please contact press@runq.in. We typically respond within one business day. For analyst briefings or deeper data conversations, mention your outlet and timeframe in the first email.',
    'Press kit, logos, leadership headshots, and product screenshots are available on request. We are happy to make our founders or our compliance lead available for on-the-record conversations about the state of GST in India.',
  ],
  featuresEyebrow: 'IN THE NEWS',
  featuresTitle: 'Recent coverage.',
  features: [
    { Icon: FileText, title: 'YourStory · Apr 2026',       body: '"runQ raises seed round to take on Tally on mobile" — coverage of our funding announcement.' },
    { Icon: FileText, title: 'Inc42 · Mar 2026',           body: 'A profile of the Indian SME accounting market and where runQ fits among Tally, Zoho, and Vyapar.' },
    { Icon: FileText, title: 'The Ken · Feb 2026',         body: "Long-read on the role of AI in Indian compliance — featuring runQ's bill OCR pipeline." },
    { Icon: FileText, title: 'Economic Times · Jan 2026',  body: 'Coverage of our beta launch and early CA partnerships in Tier-1 cities.' },
    { Icon: FileText, title: 'Moneycontrol · Dec 2025',    body: '"GST 2.0 and the next wave of fintech" — quoting our CEO on policy direction.' },
    { Icon: FileText, title: 'TechCrunch India · Nov 2025', body: 'Brief on India SaaS exports and the domestic SME software landscape.' },
  ],
  darkPanel: {
    eyebrow: 'BRAND & ASSETS',
    title: 'Use our marks correctly.',
    items: [
      ['Wordmark', '"runQ" — lower-case, with the "Q" intentionally capitalised. Always paired with the "Finance" badge in product contexts.'],
      ['Color',    'Primary: oklch(0.59 0.20 264). Use on white/zinc-50 backgrounds for product references; use white-on-zinc-950 for mockup contexts.'],
      ['Avoid',    'Do not stretch the wordmark, do not change the "Q" capitalisation, do not place on busy backgrounds.'],
    ],
  },
};

export default function PressPage() {
  return <AudiencePage data={data} />;
}
