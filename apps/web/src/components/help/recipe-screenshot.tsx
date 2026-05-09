/**
 * HTML mock screenshot. Renders a faithful preview of the runQ admin shell
 * (the real NAV_GROUPS sidebar + a topbar + a content area) and fills the
 * page with one of several view templates driven by the step's
 * ScreenshotSpec. The hint text is rendered with an accent ring + pulse dot
 * to point at the relevant element.
 */
import {
  Check, ChevronRight, Upload as UploadIcon, Sparkles,
} from 'lucide-react';
import { NAV_GROUPS } from '../layout/sidebar';
import type { ScreenshotSpec } from '@/lib/help-recipes';

export function RecipeScreenshot({ spec }: { spec: ScreenshotSpec }) {
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <Frame spec={spec} />
      <div className="border-t border-zinc-200 bg-zinc-50 px-3 py-1.5 text-[11px] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
        Preview · {spec.active} · {spec.title}
      </div>
    </div>
  );
}

function Frame({ spec }: { spec: ScreenshotSpec }) {
  return (
    <div className="flex h-[380px] w-full text-[11px]">
      <Sidebar active={spec.active} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <div className="min-w-0 flex-1 overflow-hidden p-3">
          <PageHeader title={spec.title} subtitle={spec.subtitle} />
          <Content spec={spec} />
        </div>
      </div>
    </div>
  );
}

function Sidebar({ active }: { active?: string }) {
  return (
    <div className="flex w-[150px] shrink-0 flex-col border-r border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/60">
      <div className="flex h-7 shrink-0 items-center gap-1.5 border-b border-zinc-200 px-2.5 dark:border-zinc-800">
        <div className="h-3.5 w-3.5 rounded bg-gradient-to-br from-indigo-500 to-violet-500" />
        <span className="text-[10px] font-semibold text-zinc-700 dark:text-zinc-200">runQ</span>
        <span className="rounded bg-indigo-100 px-1 py-[1px] text-[7px] font-semibold uppercase tracking-wider text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
          Finance
        </span>
      </div>
      <div className="flex-1 space-y-1 overflow-hidden px-1.5 py-2">
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi}>
            {group.label && (
              <div className="px-1.5 pb-0.5 pt-1.5 text-[7.5px] font-semibold uppercase tracking-[0.1em] text-zinc-400 dark:text-zinc-500">
                {group.label}
              </div>
            )}
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = item.label === active;
              const row = (
                <div
                  className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[9.5px] ${
                    isActive
                      ? 'bg-zinc-200/80 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
                      : 'text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  <Icon size={10} strokeWidth={isActive ? 2 : 1.75} />
                  <span className="truncate">{item.label}</span>
                </div>
              );
              return (
                <div key={item.key}>
                  {isActive ? <ActiveWrap>{row}</ActiveWrap> : row}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function ActiveWrap({ children }: { children: React.ReactNode }) {
  return <div className="relative">{children}</div>;
}

function Topbar() {
  return (
    <div className="flex h-7 shrink-0 items-center gap-2 border-b border-zinc-200 bg-white px-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex h-4 w-44 items-center rounded border border-zinc-200 bg-zinc-50 px-1.5 text-[9px] text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900">
        Search…
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        <div className="h-3.5 w-3.5 rounded-full bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-3.5 w-3.5 rounded-full bg-indigo-200 dark:bg-indigo-900/60" />
      </div>
    </div>
  );
}

function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-2">
      <div className="text-[12px] font-semibold text-zinc-900 dark:text-zinc-100">{title}</div>
      {subtitle && (
        <div className="text-[10px] text-zinc-500 dark:text-zinc-400">{subtitle}</div>
      )}
    </div>
  );
}

function Highlight({
  children,
  className = '',
}: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`relative inline-block ${className}`}>
      {children}
      <span className="pointer-events-none absolute -inset-1 rounded-md ring-2 ring-indigo-500/70" />
      <span className="absolute -right-1 -top-1 h-2 w-2 animate-pulse rounded-full bg-indigo-500 ring-2 ring-white dark:ring-zinc-950" />
    </span>
  );
}

// ── View templates ─────────────────────────────────────────────────────────

function Content({ spec }: { spec: ScreenshotSpec }) {
  switch (spec.view) {
    case 'list': return <ListView spec={spec} />;
    case 'form': return <FormView spec={spec} />;
    case 'totals': return <TotalsView spec={spec} />;
    case 'send': return <SendView spec={spec} />;
    case 'import': return <ImportView spec={spec} />;
    case 'checklist': return <ChecklistView spec={spec} />;
    case 'wizard': return <WizardView spec={spec} />;
  }
}

function ListView({ spec }: { spec: ScreenshotSpec }) {
  const cols = spec.fields ?? ['Name', 'Detail', 'Status', 'Action'];
  const rows = spec.rows ?? defaultRows(cols);
  const isAddAction = spec.hint.startsWith('+') || /^(Add|New|Create)/i.test(spec.hint);
  return (
    <div>
      <div className="mb-2 flex items-center justify-end">
        {isAddAction ? (
          <Highlight>
            <span className="inline-block rounded bg-indigo-600 px-2 py-1 text-[10px] font-medium text-white">{spec.hint}</span>
          </Highlight>
        ) : (
          <span className="rounded bg-indigo-600 px-2 py-1 text-[10px] font-medium text-white opacity-70">+ New</span>
        )}
      </div>
      <div className="overflow-hidden rounded border border-zinc-200 dark:border-zinc-800">
        <Header cols={cols} />
        {rows.map((r, i) => {
          const cells = cols.map((c) => r[c] ?? '');
          const highlightThis = !isAddAction && cells.some((cell) => cell === spec.hint);
          return (
            <div
              key={i}
              className={`grid items-center gap-2 px-2 py-1.5 text-[10px] ${
                i < rows.length - 1 ? 'border-b border-zinc-100 dark:border-zinc-800' : ''
              }`}
              style={{ gridTemplateColumns: gridCols(cols.length) }}
            >
              {cells.map((cell, ci) => {
                const node = (
                  <span
                    key={ci}
                    className={
                      ci === cols.length - 1
                        ? ''
                        : ci === cols.length - 2
                        ? 'text-right tabular-nums text-zinc-900 dark:text-zinc-100'
                        : 'truncate text-zinc-700 dark:text-zinc-300'
                    }
                  >
                    {ci === cols.length - 1 ? <Pill text={cell} /> : cell}
                  </span>
                );
                return highlightThis && cell === spec.hint ? (
                  <Highlight key={ci}>{node}</Highlight>
                ) : node;
              })}
            </div>
          );
        })}
      </div>
      {!isAddAction && !rows.some((r) => Object.values(r).includes(spec.hint)) && (
        <div className="mt-2">
          <Highlight>
            <span className="inline-block rounded bg-zinc-100 px-2 py-1 text-[10px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
              {spec.hint}
            </span>
          </Highlight>
        </div>
      )}
    </div>
  );
}

function Header({ cols }: { cols: string[] }) {
  return (
    <div
      className="grid gap-2 border-b border-zinc-200 bg-zinc-50 px-2 py-1.5 text-[9px] font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400"
      style={{ gridTemplateColumns: gridCols(cols.length) }}
    >
      {cols.map((c, i) => (
        <span key={c} className={i === cols.length - 2 ? 'text-right' : ''}>{c}</span>
      ))}
    </div>
  );
}

function gridCols(n: number) {
  if (n === 3) return '1.4fr 1.6fr 0.8fr';
  if (n === 4) return '1fr 1.5fr 0.8fr 0.7fr';
  if (n === 5) return '1.5fr 0.6fr 0.7fr 0.7fr 0.7fr';
  return '1fr '.repeat(n).trim();
}

function defaultRows(cols: string[]) {
  const samples: Array<Record<string, string>> = [
    {
      'Invoice #': 'INV-2026-0042', 'Bill #': 'BILL-2026-0117', Customer: 'Acme Industries', Vendor: 'Stellar Logistics',
      Issued: '9 May 2026', Due: '23 May 2026', Date: '9 May 2026', Total: '₹1,28,400', Balance: '₹1,28,400', Amount: '₹1,28,400',
      Status: 'Paid', Method: 'NEFT', Reference: 'UPI/8451239876',
      Name: 'Acme Industries', Type: 'B2B', Contact: 'priya@acme.example', Terms: 'Net 30',
      Outstanding: '₹4.8L', Category: 'Services',
      Location: 'Mumbai · MH', 'Run ID': 'PR-2026-018', Source: 'Auto', Count: '52', 'Run ID ': 'PR-2026-018',
      Period: 'Apr 2026', ARN: 'AA270425019842M', 'Filed at': '15 Apr, 11:42 am',
      Bank: 'HDFC Bank · ****1234', Account: '****1234', 'Last reconciled': '30 Apr 2026',
      Narration: 'NEFT IN ACME-IND-INV0041',
      Match: '92%', Confidence: '92%',
      Format: 'Tally Prime XML',
      Action: 'Send reminder',
      Template: 'INV-TPL-CONS', Frequency: 'Monthly', 'Next run': '1 Jun 2026',
      'Assigned to': 'Priya Mehta', Invoice: 'INV-2026-0040',
      'Last activity': '30 Apr 2026', 'Locked at': '—',
      Currency: 'INR',
      'Default GL account': 'Office expenses · 5400',
      GSTIN: '27AAACA1234F1Z5',
    },
    {
      'Invoice #': 'INV-2026-0041', 'Bill #': 'BILL-2026-0116', Customer: 'Pinecone Foods', Vendor: 'Banyan Tech',
      Issued: '8 May 2026', Due: '22 May 2026', Date: '8 May 2026', Total: '₹84,200', Balance: '₹84,200', Amount: '₹84,200',
      Status: 'Sent', Method: 'UPI', Reference: 'NEFT/HDFC/0911',
      Name: 'Pinecone Foods', Type: 'B2B', Contact: 'rohit@pinecone.in', Terms: 'Net 15',
      Outstanding: '₹2.4L', Category: 'Software',
      Location: 'Bengaluru · KA', 'Run ID': 'PR-2026-017', Source: 'Manual', Count: '8',
      Period: 'Mar 2026', ARN: 'AA270325018621J', 'Filed at': '17 Mar, 4:18 pm',
      Bank: 'ICICI Bank · ****5678', Account: '****5678', 'Last reconciled': '31 Mar 2026',
      Narration: 'IMPS IN PINECONE/INV0041',
      Match: '88%', Confidence: '88%',
      Format: 'CSV',
      Action: 'Mark paid',
      Template: 'INV-TPL-RETAIN', Frequency: 'Quarterly', 'Next run': '1 Jul 2026',
      'Assigned to': 'Arjun Rao', Invoice: 'INV-2026-0039',
      'Last activity': '31 Mar 2026',
      Currency: 'INR',
      GSTIN: '06ABCBT9876P1Z2',
    },
    {
      'Invoice #': 'INV-2026-0040', 'Bill #': 'BILL-2026-0115', Customer: 'Banyan Tech', Vendor: 'Pinecone Foods',
      Issued: '5 May 2026', Due: '19 May 2026', Date: '5 May 2026', Total: '₹2,46,000', Balance: '₹2,46,000', Amount: '₹2,46,000',
      Status: 'Overdue', Method: 'RTGS', Reference: 'RTGS/AXIS/4421',
      Name: 'Banyan Tech', Type: 'Enterprise', Contact: 'finance@banyan.io', Terms: 'Net 45',
      Outstanding: '₹4.8L', Category: 'Logistics',
      Location: 'Hyderabad · TG', 'Run ID': 'PR-2026-016', Source: 'Auto', Count: '34',
      Period: 'Feb 2026', ARN: 'AA270225017218B', 'Filed at': '17 Feb, 2:05 pm',
      Bank: 'Axis Bank · ****9012', Account: '****9012', 'Last reconciled': '28 Feb 2026',
      Narration: 'RTGS BANYAN TECH/INV0040',
      Match: 'Unmatched', Confidence: '—',
      Format: 'JSON',
      Action: 'Call customer',
      Template: 'INV-TPL-LOGI', Frequency: 'Monthly', 'Next run': '1 Jun 2026',
      'Assigned to': 'Owner', Invoice: 'INV-2026-0038',
      'Last activity': '28 Feb 2026',
      Currency: 'INR',
      GSTIN: '29MNNNL4321K1Z9',
    },
  ];
  return samples.map((s) => {
    const out: Record<string, string> = {};
    for (const c of cols) out[c] = s[c] ?? placeholder(c);
    return out;
  });
}

function placeholder(col: string) {
  if (/amount|outstanding|total/i.test(col)) return '₹84,200';
  if (/date|run|invoice/i.test(col)) return '9 May 2026';
  if (/status|action/i.test(col)) return 'Open';
  if (/email/i.test(col)) return 'ap@vendor.in';
  return '—';
}

function Pill({ text }: { text: string }) {
  const tone =
    /paid|active|done|cleared|live|posted/i.test(text) ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' :
    /sent|approved|matched/i.test(text) ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' :
    /overdue|failed|error/i.test(text) ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' :
    /draft|pending|review/i.test(text) ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' :
    'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300';
  return <span className={`rounded px-1.5 py-0.5 text-[9px] ${tone}`}>{text}</span>;
}

function FormView({ spec }: { spec: ScreenshotSpec }) {
  const fields = spec.fields ?? ['Name', 'Detail', 'Notes'];
  return (
    <div className="space-y-1.5 rounded border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      {fields.map((label) => (
        <Field key={label} label={label} value={fieldSample(label)} highlight={label === spec.hint} />
      ))}
    </div>
  );
}

function fieldSample(label: string) {
  const map: Record<string, string> = {
    'Invoice number': 'INV-2026-0043',
    'Bill number': 'BILL-2026-0117',
    'Customer': 'Acme Industries  ·  GSTIN 27AAACA1234F1Z5',
    'Vendor': 'Stellar Logistics',
    'Vendor GSTIN': '06ABCSL9876P1Z2',
    'GSTIN': '27AAACA1234F1Z5',
    'GSTIN auto-fill': '27AAACA1234F1Z5  ✓',
    'Invoice date': '9 May 2026',
    'Bill date': '5 May 2026',
    'Due date': '23 May 2026',
    'Date': '9 May 2026',
    'Pay date': '14 May 2026',
    'Bank account': 'HDFC Bank · ****1234',
    'Bank': 'HDFC Bank',
    'Method': 'NEFT',
    'PAN': 'AAACA1234F',
    'TDS section': '194C',
    'TDS rate': '2%',
    'TDS deduction': '₹2,360',
    'Amount': '₹1,18,000',
    'Total': '₹1,47,640',
    'Address': 'Plot 14, Andheri East, Mumbai 400069',
    'Place of supply': 'Maharashtra (27)',
    'Default GST': '18%',
    'Payment terms': 'Net 30',
    'Email to': 'ap@acme.example  ·  cfo@acme.example',
    'Forward to': 'inbox+a8f2@runq.in',
    'Or upload': 'invoice-may.pdf',
    'Subject': 'Invoice INV-2026-0043 from runQ Inc',
    'Approval chain': 'Owner → Finance lead',
    'Approver': 'Priya Mehta',
    'GL account': 'Office expenses · 5400',
    'Notes': 'Includes May reimbursements',
    'Reference': 'UPI · 8451239876',
    'Pattern': 'INV-{fy}-{seq}',
    'Prefix': 'INV',
    'Next number': '0044',
    'Legal name': 'runQ Software India Pvt Ltd',
    'Start month': 'April',
    'Current FY': 'FY 2026–27',
    'Currency': 'INR',
    'Default': '✓',
    'Account': '****1234',
    'Outstanding': '₹4.8L',
    'Last invoice': '9 May 2026',
    'Status': 'Active',
    'Remitter': 'runQ Software India · HDFC',
    'Allocations': '2 invoices selected',
    'Frequency': 'Monthly',
    'Next run': '1 Jun 2026',
    'ARN': '—',
    'Sign with': 'EVC',
    'Filename': 'tally_april_2026.xml',
    'Format': 'Tally Prime XML',
    'Period': 'Apr 1 – Apr 30, 2026',
    'Closing balance': '₹12,84,200',
    'Locked by': 'Owner',
    'Locked at': '9 May 2026, 6:42 pm',
    'Live from': 'Today',
    'Channels': 'Email + SMS',
    'Touch 1': 'Day 0 · Email · Friendly nudge',
    'Touch 2': 'Day 7 · Email · Reminder',
    'Touch 3': 'Day 14 · Email + SMS · Past due',
    'Touch 4': 'Day 21 · Phone · Final notice',
    'Use case': 'CA handoff',
    'Last run': '5 May 2026',
    'Statement period': 'Apr 1 – Apr 30',
    'Source': 'Email',
    'Template': 'INV-TPL-CONS',
  };
  return map[label] ?? '—';
}

function Field({
  label, value, highlight,
}: { label: string; value: string; highlight?: boolean }) {
  const inner = (
    <div className="flex h-6 items-center rounded border border-zinc-200 bg-zinc-50 px-2 text-[10px] text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
      {value}
    </div>
  );
  return (
    <div>
      <div className="mb-0.5 text-[9px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</div>
      {highlight ? <Highlight className="block">{inner}</Highlight> : inner}
    </div>
  );
}

function TotalsView({ spec }: { spec: ScreenshotSpec }) {
  const cols = spec.fields;
  return (
    <div className="space-y-2 rounded border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      {cols && (
        <div className="overflow-hidden rounded border border-zinc-200 dark:border-zinc-800">
          <Header cols={cols} />
          {defaultRows(cols).slice(0, 2).map((r, i) => (
            <div
              key={i}
              className={`grid gap-2 px-2 py-1 text-[10px] ${i < 1 ? 'border-b border-zinc-100 dark:border-zinc-800' : ''}`}
              style={{ gridTemplateColumns: gridCols(cols.length) }}
            >
              {cols.map((c, ci) => (
                <span
                  key={ci}
                  className={
                    ci === cols.length - 1
                      ? 'text-right tabular-nums text-zinc-900 dark:text-zinc-100'
                      : 'truncate text-zinc-700 dark:text-zinc-300'
                  }
                >
                  {r[c] ?? placeholder(c)}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}
      {spec.bullets && (
        <div className="space-y-1 rounded border border-zinc-200 bg-zinc-50 p-2 text-[10px] dark:border-zinc-800 dark:bg-zinc-900">
          {spec.bullets.map((b) => {
            const [label, value] = b.split(' · ');
            return (
              <div key={b} className="flex items-center justify-between text-zinc-700 dark:text-zinc-300">
                <span>{label}</span>
                <span className="tabular-nums">{value ?? ''}</span>
              </div>
            );
          })}
        </div>
      )}
      <div className="pt-1">
        <Highlight>
          <span className="inline-block rounded bg-indigo-600 px-2 py-1 text-[10px] font-semibold text-white">{spec.hint}</span>
        </Highlight>
      </div>
    </div>
  );
}

function SendView({ spec }: { spec: ScreenshotSpec }) {
  const fields = spec.fields ?? ['Email to', 'Subject'];
  return (
    <div className="space-y-1.5 rounded border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      {fields.map((f) => (
        <Field key={f} label={f} value={fieldSample(f)} />
      ))}
      <div className="flex items-center justify-end pt-2">
        <Highlight>
          <span className="inline-flex items-center gap-1 rounded bg-indigo-600 px-2 py-1 text-[10px] font-semibold text-white">
            {spec.hint} <ChevronRight size={10} />
          </span>
        </Highlight>
      </div>
    </div>
  );
}

function ImportView({ spec }: { spec: ScreenshotSpec }) {
  return (
    <div className="space-y-2">
      {spec.fields?.map((f) => <Field key={f} label={f} value={fieldSample(f)} />)}
      <Highlight className="block">
        <div className="flex h-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 text-[10px] text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
          <UploadIcon size={16} />
          <span>{spec.hint}</span>
        </div>
      </Highlight>
    </div>
  );
}

function ChecklistView({ spec }: { spec: ScreenshotSpec }) {
  const items = spec.bullets ?? [];
  return (
    <div className="space-y-1 rounded border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-950">
      {items.map((item, i) => {
        const isHint = item === spec.hint;
        const done = i < Math.floor(items.length * 0.6) && !isHint;
        const row = (
          <div
            className={`flex items-center gap-2 rounded px-1.5 py-1 text-[10px] ${
              done ? 'text-zinc-500 dark:text-zinc-400' : 'text-zinc-800 dark:text-zinc-200'
            }`}
          >
            <span
              className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded ${
                done
                  ? 'bg-emerald-500 text-white'
                  : 'border border-zinc-300 dark:border-zinc-600'
              }`}
            >
              {done && <Check size={9} strokeWidth={3} />}
            </span>
            <span className={done ? 'line-through opacity-70' : ''}>{item}</span>
          </div>
        );
        return isHint ? (
          <Highlight key={i} className="block">{row}</Highlight>
        ) : (
          <div key={i}>{row}</div>
        );
      })}
    </div>
  );
}

function WizardView({ spec }: { spec: ScreenshotSpec }) {
  const items = spec.bullets ?? [];
  return (
    <div className="space-y-2">
      {spec.subtitle?.startsWith('✨') ? (
        <div className="flex items-center gap-1.5 rounded border border-indigo-200 bg-indigo-50 px-2 py-1 text-[10px] text-indigo-800 dark:border-indigo-900/40 dark:bg-indigo-950/30 dark:text-indigo-200">
          <Sparkles size={10} /> {spec.subtitle.replace('✨ ', '')}
        </div>
      ) : null}
      <div className="space-y-1 rounded border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-950">
        {items.map((item, i) => {
          const isHint = item === spec.hint || item.startsWith(spec.hint);
          const block = (
            <div
              className={`flex items-center gap-2 rounded px-2 py-1.5 text-[10px] ${
                isHint
                  ? 'bg-indigo-100/70 font-medium text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200'
                  : 'text-zinc-700 dark:text-zinc-300'
              }`}
            >
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-zinc-200 text-[9px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {i + 1}
              </span>
              <span className="truncate">{item}</span>
            </div>
          );
          return isHint ? <Highlight key={i} className="block">{block}</Highlight> : <div key={i}>{block}</div>;
        })}
      </div>
    </div>
  );
}
