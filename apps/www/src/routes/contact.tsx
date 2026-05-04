import { Bell, Building, FileText, GitBranch, Sparkles, Users } from 'lucide-react';
import { AudiencePage, type AudienceData } from '@/components/marketing/audience-page';

const data: AudienceData = {
  documentTitle: 'Contact — runQ',
  eyebrow: 'COMPANY · CONTACT',
  title: 'Get in touch.',
  titleItalic: 'Real humans answer.',
  subtitle: 'Sales, support, partnerships, press — every email below routes to a real human in Bengaluru. Most replies land within four working hours.',
  accent: 'brand',
  lead: [
    'Quartex Technologies Pvt Ltd · 4th floor, 100 Feet Road, Indiranagar, Bengaluru 560038, Karnataka, India · CIN U72200KA2024PTC123456 · GSTIN 29AABCQ8910K1Z3.',
    'For product support, the fastest path is the in-app chat from your runQ dashboard — our team monitors it 9 AM to 9 PM IST, seven days a week. For everything else, the channels below are quickest.',
  ],
  featuresEyebrow: 'CHANNELS',
  featuresTitle: 'Pick your reason.',
  features: [
    { Icon: Sparkles,  title: 'Sales',           body: 'sales@runq.in · For demos, pricing for >20 users, and multi-entity setups. Average reply: 2 hours.' },
    { Icon: Bell,      title: 'Support',         body: 'support@runq.in · For product issues, billing, and migration help. In-app chat is fastest.' },
    { Icon: Users,     title: 'CA partnerships', body: 'ca@runq.in · For practitioners managing 10+ client books. We have a dedicated CA program.' },
    { Icon: FileText,  title: 'Press',           body: 'press@runq.in · For journalists and analysts. Press kit on request.' },
    { Icon: GitBranch, title: 'Engineering',     body: 'eng@runq.in · For API access, integration partners, and security disclosures.' },
    { Icon: Building,  title: 'Office',          body: 'Indiranagar, Bengaluru. Walk-ins by appointment only — book a time first.' },
  ],
  darkPanel: {
    eyebrow: 'GRIEVANCE OFFICER',
    title: 'Per India IT Rules 2021.',
    items: [
      ['Name',    'Mr. Aarav Iyer, Director — Quartex Technologies Pvt Ltd.'],
      ['Email',   'grievance@runq.in. We acknowledge within 24 hours and resolve within 15 days as required by law.'],
      ['Address', '4th floor, 100 Feet Road, Indiranagar, Bengaluru 560038, Karnataka, India.'],
    ],
  },
};

export default function ContactPage() {
  return <AudiencePage data={data} />;
}
