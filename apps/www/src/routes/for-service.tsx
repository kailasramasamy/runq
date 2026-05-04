import { Clock, Coins, FileText, Globe, RefreshCcw, Users } from 'lucide-react';
import { AudiencePage, type AudienceData } from '@/components/marketing/audience-page';

const data: AudienceData = {
  documentTitle: 'For Service Businesses — runQ',
  eyebrow: 'FOR · SERVICE BUSINESSES',
  title: 'For agencies, clinics,',
  titleItalic: 'and people who bill time.',
  subtitle:
    'Recurring invoicing, retainer tracking, professional-fee TDS handling, and GST on services done correctly — including reverse charge for foreign clients.',
  accent: 'violet',
  lead: [
    'Service businesses move on retainers, milestones, and the occasional one-off. You bill in INR, USD, or GBP. Your clients deduct TDS. You owe GST under reverse charge for some imported services. The accounting is fiddly.',
    'runQ knows. Recurring invoicing is first-class. TDS is captured correctly when you receive the payment. GST on export of services (LUT or with-payment) is one click. And the AR aging report tells you which retainer client is two months behind.',
  ],
  featuresTitle: 'For the way services bill.',
  features: [
    { Icon: RefreshCcw, title: 'Recurring invoices',    body: 'Monthly retainers, AMCs, subscriptions. Set once, runQ raises and reconciles every cycle.' },
    { Icon: Coins,      title: 'Multi-currency',        body: 'Bill in USD, EUR, GBP. Forex gain/loss booked at receipt. Bank-rate or RBI reference rate.' },
    { Icon: FileText,   title: 'TDS on receipts',       body: 'Customer deducts TDS? runQ matches Form 26AS, books the deduction, claims the credit.' },
    { Icon: Globe,      title: 'Export of services',    body: 'LUT-based zero-rated invoices, or with-payment refund flow. FIRC tracking included.' },
    { Icon: Clock,      title: 'Time & milestone billing', body: 'Convert tracked hours or signed-off milestones into invoices in one click.' },
    { Icon: Users,      title: 'Client portal',         body: 'Read-only client portal: invoices, statements, payment history. White-labelled with your brand.' },
  ],
  darkPanel: {
    eyebrow: 'GST FOR SERVICES',
    title: 'The slightly-tricky bits, handled.',
    items: [
      ['Reverse charge (import of services)', 'Hire a foreign contractor or use a SaaS tool? GST under RCM, ITC claim, all automated.'],
      ['Composition for services',            'Eligible service businesses on the 6% scheme — CMP-08 quarterly returns ready to file.'],
      ['SAC code suggestions',                'Pick the correct Service Accounting Code from a curated list. We default the right tax rate.'],
    ],
  },
};

export default function ForServicePage() {
  return <AudiencePage data={data} />;
}
