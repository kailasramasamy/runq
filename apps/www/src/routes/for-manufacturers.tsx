import { Building2, FileText, Hash, Receipt, RefreshCcw, ShieldCheck } from 'lucide-react';
import { AudiencePage, type AudienceData } from '@/components/marketing/audience-page';

const data: AudienceData = {
  documentTitle: 'For Manufacturers — runQ',
  eyebrow: 'FOR · MANUFACTURERS',
  title: 'Manufacturing-grade',
  titleItalic: 'accounting and GST.',
  subtitle:
    'e-Way bills bundled with invoices, ITC-04 returns from job-work challans, HSN summaries done right, and RCM handled natively. The finance side of the factory, sorted.',
  accent: 'amber',
  lead: [
    'Manufacturing books are not service-business books. You generate ten e-Way bills before lunch. You issue raw material on job-work challans and need to file ITC-04 every quarter. You pay freight and security under reverse charge. Every invoice line carries an HSN.',
    'runQ ships these primitives natively. e-Way bills and invoices are one object. ITC-04 is auto-prepared from your challans. HSN summaries flow into GSTR-1 automatically. RCM is tagged at bill entry and the ITC reversal is correct.',
  ],
  featuresTitle: 'Finance essentials for the factory.',
  features: [
    { Icon: Receipt,     title: 'Invoice + e-Way, one shot', body: 'Above ₹50,000 the e-Way is generated alongside. Vehicle number captured in two taps.' },
    { Icon: FileText,    title: 'Job-work challans',         body: 'Issue delivery challans for job work, track returns, feed the ITC-04 return automatically.' },
    { Icon: Hash,        title: 'HSN summary in GSTR-1',     body: '8-digit HSN for >₹5cr turnover, 6-digit for the rest. Auto-applied per item.' },
    { Icon: RefreshCcw,  title: 'Reverse charge (RCM)',      body: 'Freight, GTA, security services — RCM tagging native, ITC reversal handled correctly.' },
    { Icon: Building2,   title: 'Multi-GSTIN, multi-branch', body: 'One company, many state registrations. Branch P&Ls roll up; GST returns file per GSTIN.' },
    { Icon: ShieldCheck, title: 'Bill capture with approvals', body: 'Snap vendor bills, AI extracts GSTIN and tax splits, route by threshold for approval.' },
  ],
  darkPanel: {
    eyebrow: 'COMPLIANCE',
    title: 'Returns built for manufacturers.',
    items: [
      ['ITC-04 (job work)',         'Auto-prepared from your job-work challans. Quarterly filing in two clicks.'],
      ['HSN summary in GSTR-1',     '8-digit HSN for >₹5cr turnover, 6-digit for the rest. Auto-applied per item.'],
      ['Reverse charge (RCM)',      'Freight, GTA, security services — RCM tagging native, ITC reversal handled correctly.'],
    ],
  },
};

export default function ForManufacturersPage() {
  return <AudiencePage data={data} />;
}
