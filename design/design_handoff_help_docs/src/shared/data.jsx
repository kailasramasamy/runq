// ─── Mock data for the runQ dashboard ───────────────────────────────────────

const COMPANY = {
  name: "Khurana Trading Co.",
  gstin: "27AABCK1234L1Z5",
  fy: "FY 2025–26",
  period: "Apr 2026 — Mar 2027",
  user: { name: "Vaidehi K.", email: "vaidehi@khurana.co", role: "Owner" },
  greetingFirstName: "Vaidehi",
};

const KPIS = [
  {
    key: "cash",
    label: "Cash position",
    value: 4286400,
    delta: +6.2,
    spark: [3.1, 3.4, 3.3, 3.6, 3.9, 3.7, 4.0, 4.1, 4.0, 4.2, 4.18, 4.286],
    accent: "pos",
    sub: "Across 4 accounts",
  },
  {
    key: "ar",
    label: "Receivables",
    value: 2814200,
    delta: -3.1,
    spark: [3.0, 2.95, 3.1, 3.0, 2.9, 2.85, 2.9, 2.88, 2.86, 2.83, 2.82, 2.81],
    accent: "warn",
    sub: "₹4.2L overdue · 18 invoices",
  },
  {
    key: "ap",
    label: "Payables",
    value: 1142800,
    delta: -8.4,
    spark: [1.5, 1.45, 1.4, 1.35, 1.3, 1.28, 1.25, 1.22, 1.18, 1.16, 1.15, 1.14],
    accent: "neg",
    sub: "₹62k due in 7 days",
  },
  {
    key: "burn",
    label: "Net burn (30d)",
    value: 412300,
    delta: +2.4,
    spark: [3.8, 3.9, 4.0, 4.1, 4.0, 4.05, 4.1, 4.08, 4.12, 4.1, 4.11, 4.12],
    accent: "neutral",
    sub: "Runway: 10.4 months",
  },
  {
    key: "revenue",
    label: "Revenue MTD",
    value: 1820000,
    delta: +14.3,
    spark: [0.2, 0.4, 0.6, 0.8, 0.95, 1.1, 1.2, 1.35, 1.5, 1.6, 1.74, 1.82],
    accent: "pos",
    sub: "vs ₹15.9L last month",
  },
];

const CASHFLOW = {
  // Index 0..89 days from today; positive = inflow, negative = outflow
  // Pre-built monthly summary for the chart
  months: [
    { label: "Jan", in: 14.2, out: 11.8 },
    { label: "Feb", in: 16.4, out: 12.1 },
    { label: "Mar", in: 18.1, out: 13.5 },
    { label: "Apr", in: 17.6, out: 12.9 },
    { label: "May", in: 19.3, out: 13.2 },
    { label: "Jun", in: 22.0, out: 14.8 },
    // forecast (last 3, dashed)
    { label: "Jul", in: 21.4, out: 15.2, forecast: true },
    { label: "Aug", in: 23.8, out: 15.9, forecast: true },
    { label: "Sep", in: 24.9, out: 16.4, forecast: true },
  ],
  forecast90: { in: 7012000, out: 4754000, net: 2258000 },
};

const AGENT_FEED = [
  {
    id: 1,
    when: "2 min ago",
    icon: "scan-line",
    title: "Categorized 8 expenses from HDFC statement",
    detail: "₹1.42L matched to vendors · 2 need review",
    cta: "Review",
    severity: "info",
  },
  {
    id: 2,
    when: "14 min ago",
    icon: "file-text",
    title: "Drafted GSTR-1 for June",
    detail: "146 invoices reconciled · 0 mismatches",
    cta: "Open draft",
    severity: "ok",
  },
  {
    id: 3,
    when: "1 hr ago",
    icon: "alert-triangle",
    title: "Flagged duplicate bill from Reliance",
    detail: "BILL-2308 (₹84,200) appears twice",
    cta: "Compare",
    severity: "warn",
  },
  {
    id: 4,
    when: "2 hr ago",
    icon: "send",
    title: "Sent payment reminders to 6 customers",
    detail: "Total outstanding: ₹3.18L · 30+ days overdue",
    cta: "View thread",
    severity: "info",
  },
  {
    id: 5,
    when: "Today, 9:14",
    icon: "sparkles",
    title: "Reconciled 142 bank transactions overnight",
    detail: "98% auto-matched · 3 unmatched flagged",
    cta: "View",
    severity: "ok",
  },
];

const APPROVALS = [
  { id: "BILL-2412", who: "Reliance Industries", amount: 184250, age: "2d", type: "bill" },
  { id: "PAY-9821", who: "Tata Consultancy", amount: 92400, age: "4h", type: "payment" },
  { id: "BILL-2419", who: "DHL Express", amount: 18620, age: "1d", type: "bill" },
  { id: "PAY-9824", who: "Aditya Birla", amount: 245000, age: "12h", type: "payment" },
];

const AGING_AR = [
  { label: "Current", amount: 1622000, count: 38 },
  { label: "1–30", amount: 745000, count: 21 },
  { label: "31–60", amount: 268000, count: 9 },
  { label: "61–90", amount: 124000, count: 4 },
  { label: "90+", amount: 55200, count: 2 },
];
const AGING_AP = [
  { label: "Current", amount: 612000, count: 14 },
  { label: "1–30", amount: 318000, count: 11 },
  { label: "31–60", amount: 142800, count: 5 },
  { label: "61–90", amount: 48000, count: 2 },
  { label: "90+", amount: 22000, count: 1 },
];

const GST = {
  period: "June 2026",
  score: 86,
  gstr1: { status: "draft", due: "Jul 11", days: 7 },
  gstr3b: { status: "pending", due: "Jul 20", days: 16 },
  signals: [
    { label: "All B2B invoices have GSTIN", ok: true },
    { label: "HSN codes complete", ok: true },
    { label: "ITC reconciliation", ok: false, detail: "3 mismatches with 2A/2B" },
    { label: "Place of supply set", ok: true },
    { label: "Reverse charge flagged", ok: false, detail: "1 entry pending review" },
  ],
};

const NOTIFICATIONS = [
  { id: 1, title: "GST filing due in 7 days", body: "GSTR-1 for June 2026 is in draft.", when: "10 min ago", unread: true, type: "warn" },
  { id: 2, title: "Payment received", body: "₹84,200 from Sharma Steel against INV-2104", when: "1 hr ago", unread: true, type: "ok" },
  { id: 3, title: "3 duplicate invoices detected", body: "Reliance Industries — review needed.", when: "Today, 9:02", unread: false, type: "warn" },
  { id: 4, title: "Bank statement imported", body: "HDFC Current ····2381 · 247 transactions", when: "Today, 8:45", unread: false, type: "info" },
];

const BANKS = [
  { name: "HDFC Current", last: "2381", balance: 2845200, color: "#0066B3" },
  { name: "ICICI Savings", last: "9012", balance: 982400, color: "#F47A1F" },
  { name: "Axis Petty Cash", last: "4421", balance: 286400, color: "#97144D" },
  { name: "Kotak Tax Reserve", last: "7732", balance: 172400, color: "#EF3E23" },
];

const INVOICE_DRAFTS = [
  { id: "INV-2118", to: "Tata Consultancy", amount: 184000, status: "draft" },
  { id: "INV-2119", to: "Wipro Ltd", amount: 92500, status: "sent" },
  { id: "INV-2120", to: "Infosys", amount: 248000, status: "draft" },
];

window.RUNQ = {
  COMPANY, KPIS, CASHFLOW, AGENT_FEED, APPROVALS,
  AGING_AR, AGING_AP, GST, NOTIFICATIONS, BANKS, INVOICE_DRAFTS,
};

window.formatINR = function (n, opts = {}) {
  if (n == null) return "—";
  const abs = Math.abs(n);
  if (opts.short) {
    if (abs >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
    if (abs >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
    if (abs >= 1e3) return `₹${(n / 1e3).toFixed(1)}k`;
    return `₹${n.toFixed(0)}`;
  }
  return "₹" + Math.round(n).toLocaleString("en-IN");
};
