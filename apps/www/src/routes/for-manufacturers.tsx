import { GitBranch, Hash, Layers, Receipt, Smartphone, TrendingUp } from 'lucide-react';
import { AudiencePage, type AudienceData } from '@/components/marketing/audience-page';

const data: AudienceData = {
  documentTitle: 'For Manufacturers — runQ',
  eyebrow: 'FOR · MANUFACTURERS',
  title: 'For factories,',
  titleItalic: 'not just front offices.',
  subtitle:
    'Multi-warehouse stock, BoM and job work, e-Way bills bundled with invoices, and a mobile app for the supervisor who lives on the shop floor.',
  accent: 'amber',
  lead: [
    'Manufacturing books are not service-business books. You move physical things. You issue raw material to job workers. You ship from one warehouse and bill from another. You generate ten e-Way bills before lunch.',
    'runQ ships these primitives natively — not as bolted-on modules, but as how the product thinks. Inventory and finance share one ledger; an invoice and an e-Way bill are one object.',
  ],
  featuresTitle: 'Shop-floor essentials.',
  features: [
    { Icon: Layers,     title: 'Multi-warehouse stock',     body: 'Inventory by location, with stock transfer notes. Reorder levels per warehouse, per item.' },
    { Icon: GitBranch,  title: 'BoM & job work',            body: 'Bill of Materials, job-work challans, ITC-04 returns. Track what is at the vendor, in what stage.' },
    { Icon: Receipt,    title: 'Invoice + e-Way, one shot', body: 'Above ₹50,000 the e-Way is generated alongside. Vehicle number captured in two taps.' },
    { Icon: Hash,       title: 'Batch, serial, expiry',     body: 'Track batch numbers, manufacture and expiry dates. Mandatory for pharma, food, cosmetics.' },
    { Icon: Smartphone, title: 'Shop-floor app',            body: 'Supervisor scans a QR on the bag — issues to job worker, updates stock, books cost. From the phone.' },
    { Icon: TrendingUp, title: 'Item-wise margins',         body: 'Real cost (raw + labour + overhead) vs sale price, item by item. Updated nightly.' },
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
