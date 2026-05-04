import { Eye, GitBranch, Mic, Smartphone, Sparkles, Users } from 'lucide-react';
import { AudiencePage, type AudienceData } from '@/components/marketing/audience-page';

const data: AudienceData = {
  documentTitle: 'Careers — runQ',
  eyebrow: 'COMPANY · CAREERS',
  title: 'Build the books',
  titleItalic: 'India deserves.',
  subtitle: 'A small, senior team in Bengaluru. Full ownership, real customers, hard problems — GST, banking rails, AI on Indian text.',
  accent: 'brand',
  lead: [
    'We are 14 people right now. Most of us have shipped consumer- and SMB-grade software in India before, and most of us have battle scars from Tally. We work in person three days a week from Indiranagar, and remotely the other two.',
    'We are hiring across product engineering, ML, design, and partnerships. Compensation is at par with top Indian SaaS startups, plus meaningful equity. Most importantly: every role has user contact and a tight loop with finance.',
  ],
  featuresEyebrow: 'OPEN ROLES',
  featuresTitle: 'Six roles, five teams.',
  features: [
    { Icon: GitBranch,  title: 'Senior Backend Engineer',   body: 'Bengaluru / Hybrid. Go + Postgres. Bank rails, AA framework, GSTN integrations. 5+ years.' },
    { Icon: Sparkles,   title: 'Applied ML Engineer',       body: 'Bengaluru. Bill OCR, bank statement matching, Indian-language NLP. PyTorch + production.' },
    { Icon: Smartphone, title: 'iOS / Android Engineer',    body: 'Swift / Kotlin. Native, not RN. Offline-first. Deep Lottie & motion design comfort welcome.' },
    { Icon: Eye,        title: 'Product Designer',          body: 'Visual + interaction, end-to-end. Strong typography. Mobile-first instincts non-negotiable.' },
    { Icon: Users,      title: 'CA Partnerships Lead',      body: 'Practising or ex-practice CA, 5+ years. You will own our Tier-1 city CA ecosystem.' },
    { Icon: Mic,        title: 'Founding Customer Success', body: 'Drove customer success at a finance SaaS before? You will define our motion top-to-bottom.' },
  ],
  darkPanel: {
    eyebrow: 'WORKING HERE',
    title: 'How we operate.',
    items: [
      ['In person, mostly',   'Three days a week in Indiranagar. Real whiteboards, real notebooks, real chai.'],
      ['Customer Tuesdays',   'Every Tuesday afternoon, two team members go on customer calls. Engineers included. Especially engineers.'],
      ['Equity that matters', 'Standard + meaningful. We grant on impact, not on tenure.'],
    ],
  },
};

export default function CareersPage() {
  return <AudiencePage data={data} />;
}
