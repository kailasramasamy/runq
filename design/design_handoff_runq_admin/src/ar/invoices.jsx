// ─── Invoices list + detail ──────────────────────────────────────────────────
const { useState: useStateInv, useMemo: useMemoInv } = React;

function InvoiceList({ onView }) {
  const [search, setSearch] = useStateInv("");
  const [statusFilter, setStatusFilter] = useStateInv("");
  const [customerFilter, setCustomerFilter] = useStateInv("");
  const [page, setPage] = useStateInv(1);
  const limit = 10;

  const filtered = useMemoInv(() => {
    return AR.INVOICES.filter((inv) => {
      if (statusFilter && inv.status !== statusFilter) return false;
      if (customerFilter && inv.customerId !== customerFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!inv.invoiceNumber.toLowerCase().includes(q) && !inv.customerName.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [search, statusFilter, customerFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / limit));
  const invoices = filtered.slice((page - 1) * limit, page * limit);

  // Aggregations
  const totalOutstanding = filtered.reduce((a, i) => a + i.balanceDue, 0);
  const overdue = filtered.filter(i => i.status === "overdue");
  const overdueAmt = overdue.reduce((a, i) => a + i.balanceDue, 0);
  const draftCount = filtered.filter(i => i.status === "draft").length;
  const paidThisMonth = filtered.filter(i => i.status === "paid").reduce((a, i) => a + i.totalAmount, 0);

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "AR", href: "#" }, { label: "Invoices" }]}
        title="Invoices"
        description="Sales invoices and e-Invoice status across all customers."
        actions={
          <>
            <Button variant="outline" size="sm" icon="download">Export</Button>
            <Button variant="outline" icon="upload">Import</Button>
            <Button icon="plus">New invoice</Button>
          </>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatTile label="Outstanding" value={formatINR(totalOutstanding, { short: true })} sub={`${filtered.filter(i => i.balanceDue > 0).length} open invoices`} />
        <StatTile label="Overdue" value={formatINR(overdueAmt, { short: true })} sub={`${overdue.length} invoices`} tone="neg" />
        <StatTile label="Drafts" value={draftCount} sub="Awaiting send" tone="warn" />
        <StatTile label="Paid (this view)" value={formatINR(paidThisMonth, { short: true })} sub="Cleared invoices" tone="pos" />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="w-72">
          <Input icon="search" placeholder="Search invoice # or customer…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          options={[
            { value: "", label: "All statuses" },
            { value: "draft", label: "Draft" },
            { value: "sent", label: "Sent" },
            { value: "viewed", label: "Viewed" },
            { value: "partially_paid", label: "Partially paid" },
            { value: "paid", label: "Paid" },
            { value: "overdue", label: "Overdue" },
            { value: "cancelled", label: "Cancelled" },
          ]}
        />
        <Select
          value={customerFilter}
          onChange={(e) => { setCustomerFilter(e.target.value); setPage(1); }}
          options={[
            { value: "", label: "All customers" },
            ...AR.CUSTOMERS.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
        <Button variant="outline" size="sm" icon="sliders-horizontal">More filters</Button>
        <div className="flex-1" />
        <span className="text-[12px] text-3 num">{filtered.length} invoices</span>
      </div>

      <Table>
        <TableHeader>
          <tr>
            <Th>Invoice #</Th>
            <Th>Customer</Th>
            <Th>Issued</Th>
            <Th>Due</Th>
            <Th align="right">Total</Th>
            <Th align="right">Balance</Th>
            <Th>Status</Th>
            <Th>e-Inv</Th>
          </tr>
        </TableHeader>
        <TableBody>
          {invoices.length === 0 ? (
            <tr><td colSpan={8}><EmptyState icon="file-text" title="No invoices found" description="Try adjusting your filters or create a new invoice." /></td></tr>
          ) : invoices.map((inv) => {
            const overdueDays = inv.status === "overdue" ? daysBetween(inv.dueDate, "2026-05-25") : null;
            return (
              <TableRow key={inv.id} onClick={() => onView(inv.id)}>
                <TableCell>
                  <div className="num text-[12px] accent-text font-medium">{inv.invoiceNumber}</div>
                  {inv.reference && inv.reference !== "—" && (
                    <div className="text-[10.5px] text-3 num">{inv.reference}</div>
                  )}
                </TableCell>
                <TableCell>
                  <div className="font-medium text-1">{inv.customerName}</div>
                  <div className="text-[10.5px] text-3">{inv.lineCount} line{inv.lineCount > 1 ? "s" : ""}</div>
                </TableCell>
                <TableCell className="text-2 num">{formatDate(inv.issueDate)}</TableCell>
                <TableCell>
                  <div className="text-2 num">{formatDate(inv.dueDate)}</div>
                  {overdueDays != null && overdueDays > 0 && (
                    <div className="text-[10.5px] neg-text font-medium num">{overdueDays}d overdue</div>
                  )}
                </TableCell>
                <TableCell numeric align="right">{formatINR(inv.totalAmount)}</TableCell>
                <TableCell numeric align="right" className="font-medium">
                  {inv.balanceDue > 0 ? formatINR(inv.balanceDue) : <span className="text-3">—</span>}
                </TableCell>
                <TableCell><StatusBadge status={inv.status} /></TableCell>
                <TableCell>
                  {inv.hasEinvoice ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-2" title={`IRN: ${inv.irn}`}>
                      <Icon name="check-circle-2" size={12} className="pos-text" />
                      <span className="num text-[10.5px]">{inv.irn}</span>
                    </span>
                  ) : (
                    <span className="text-[11px] text-3">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <div className="mt-3">
        <Pagination page={page} totalPages={totalPages} total={filtered.length} limit={limit} onPageChange={setPage} />
      </div>
    </div>
  );
}

function daysBetween(d1, d2) {
  const a = new Date(d1).getTime();
  const b = new Date(d2).getTime();
  return Math.floor((b - a) / 86400000);
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
}

// ─── Invoice Detail ──────────────────────────────────────────────────────────
function InvoiceDetail({ invoiceId, onBack }) {
  const inv = AR.INVOICES.find((x) => x.id === invoiceId);
  if (!inv) return <div className="text-2 text-[13px]">Invoice not found.</div>;

  const customer = AR.CUSTOMERS.find((c) => c.id === inv.customerId);
  const lines = inv.id === "inv_001" ? AR.INVOICE_LINES_001 : generateLines(inv);
  const subtotal = lines.reduce((a, l) => a + l.amount, 0);
  const totalTax = lines.reduce((a, l) => a + l.taxAmount, 0);
  const isOverdue = inv.status === "overdue";
  const isPaid = inv.status === "paid";
  const overdueDays = isOverdue ? daysBetween(inv.dueDate, "2026-05-25") : 0;
  const linkedReceipts = AR.RECEIPTS.filter((r) => r.invoiceIds.includes(inv.id));
  const linkedCNs = AR.CREDIT_NOTES.filter((cn) => cn.invoiceId === inv.id);

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "AR", href: "#" }, { label: "Invoices", href: "#" }, { label: inv.invoiceNumber }]}
        title={inv.invoiceNumber}
        titleBadge={<StatusBadge status={inv.status} />}
        actions={
          <>
            <Button variant="ghost" icon="arrow-left" onClick={onBack}>Back</Button>
            <Button variant="outline" size="sm" icon="download">PDF</Button>
            <Button variant="outline" size="sm" icon="send">Send</Button>
            <Button variant="outline" size="sm" icon="receipt">Record receipt</Button>
            <Button variant="outline" size="sm" icon="file-minus">Credit note</Button>
            <Button variant="outline" size="sm" icon="more-horizontal" />
          </>
        }
      />

      {/* Banner — overdue warning */}
      {isOverdue && (
        <div className="rounded-xl border mb-5 px-4 py-3 flex items-start gap-3" style={{ borderColor: "color-mix(in oklab, var(--neg) 30%, transparent)", background: "var(--neg-soft)" }}>
          <Icon name="alert-triangle" size={16} className="neg-text shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="text-[13px] font-medium neg-text">{overdueDays} days overdue</div>
            <div className="text-[12px] text-2 mt-0.5">Last reminder sent on May 22, 2026 · {customer?.contactPerson} hasn't opened it yet.</div>
          </div>
          <Button size="sm" icon="bell">Send reminder</Button>
          <Button size="sm" variant="outline" icon="phone">Log call</Button>
        </div>
      )}
      {isPaid && (
        <div className="rounded-xl border mb-5 px-4 py-3 flex items-center gap-3" style={{ borderColor: "color-mix(in oklab, var(--pos) 30%, transparent)", background: "var(--pos-soft)" }}>
          <Icon name="check-circle-2" size={16} className="pos-text shrink-0" />
          <div className="text-[13px] pos-text font-medium">Fully paid</div>
          <div className="text-[12px] text-2">Cleared by {linkedReceipts[0]?.receiptDate || inv.issueDate} · {linkedReceipts[0]?.referenceNumber || "Bank transfer"}</div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: invoice document */}
        <div className="lg:col-span-2 space-y-4">
          {/* Document */}
          <div className="surface border border-app rounded-xl overflow-hidden">
            <div className="px-6 py-5 border-b border-soft flex items-start justify-between">
              <div>
                <div className="text-[10.5px] text-3 font-medium uppercase tracking-wider">Tax invoice</div>
                <div className="num text-[18px] font-semibold text-1 mt-0.5">{inv.invoiceNumber}</div>
                {inv.reference && inv.reference !== "—" && (
                  <div className="text-[11px] text-3 mt-0.5">PO: <span className="num text-2">{inv.reference}</span></div>
                )}
              </div>
              <div className="text-right">
                <img src="assets/runq-dark.png" className="h-5 ml-auto opacity-90 dark:hidden" alt="runQ" />
                <img src="assets/runq-light.png" className="h-5 ml-auto opacity-90 hidden dark:block" alt="runQ" />
                <div className="text-[10.5px] text-3 mt-1">{RUNQ.COMPANY.name}</div>
                <div className="text-[10px] text-3 num">{RUNQ.COMPANY.gstin}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-6 px-6 py-4 border-b border-soft">
              <div>
                <div className="text-[10.5px] text-3 font-medium uppercase tracking-wider mb-1.5">Bill to</div>
                <div className="text-[13px] font-semibold text-1">{customer?.name}</div>
                <div className="text-[11.5px] text-2 mt-0.5">{customer?.addressLine1}</div>
                {customer?.addressLine2 && <div className="text-[11.5px] text-2">{customer.addressLine2}</div>}
                <div className="text-[11.5px] text-2">{customer?.city}, {customer?.state} – {customer?.pincode}</div>
                <div className="text-[10.5px] text-3 num mt-1">GSTIN: {customer?.gstin}</div>
                <div className="text-[10.5px] text-3 num">PAN: {customer?.pan}</div>
              </div>
              <div className="text-right space-y-1.5">
                <div>
                  <div className="text-[10.5px] text-3 font-medium uppercase tracking-wider">Issue date</div>
                  <div className="text-[12.5px] text-1 num">{formatDate(inv.issueDate)}</div>
                </div>
                <div>
                  <div className="text-[10.5px] text-3 font-medium uppercase tracking-wider">Due date</div>
                  <div className="text-[12.5px] text-1 num">{formatDate(inv.dueDate)}</div>
                </div>
                <div>
                  <div className="text-[10.5px] text-3 font-medium uppercase tracking-wider">Place of supply</div>
                  <div className="text-[12.5px] text-1">{customer?.state}</div>
                </div>
              </div>
            </div>

            {/* Line items */}
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr>
                    <Th>#</Th>
                    <Th>Description</Th>
                    <Th>HSN</Th>
                    <Th align="right">Qty</Th>
                    <Th align="right">Rate</Th>
                    <Th align="right">Tax</Th>
                    <Th align="right">Amount</Th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={l.id} className="border-b border-soft last:border-b-0">
                      <td className="px-4 py-2.5 text-3 num">{i + 1}</td>
                      <td className="px-4 py-2.5 text-1">{l.description}</td>
                      <td className="px-4 py-2.5 text-2 num">{l.hsn}</td>
                      <td className="px-4 py-2.5 text-2 num text-right">{l.qty} <span className="text-3 text-[10.5px]">{l.unit}</span></td>
                      <td className="px-4 py-2.5 text-2 num text-right">{formatINR(l.rate)}</td>
                      <td className="px-4 py-2.5 text-2 num text-right">{l.taxRate}%</td>
                      <td className="px-4 py-2.5 text-1 num text-right font-medium">{formatINR(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="px-6 py-4 border-t border-soft flex justify-end">
              <div className="w-72 space-y-1.5">
                <div className="flex justify-between text-[12.5px]">
                  <span className="text-2">Subtotal</span>
                  <span className="num text-1">{formatINR(subtotal)}</span>
                </div>
                <div className="flex justify-between text-[12.5px]">
                  <span className="text-2">CGST 9%</span>
                  <span className="num text-1">{formatINR(totalTax / 2)}</span>
                </div>
                <div className="flex justify-between text-[12.5px]">
                  <span className="text-2">SGST 9%</span>
                  <span className="num text-1">{formatINR(totalTax / 2)}</span>
                </div>
                <div className="flex justify-between text-[14px] font-semibold pt-2 border-t border-soft">
                  <span className="text-1">Total</span>
                  <span className="num text-1">{formatINR(inv.totalAmount)}</span>
                </div>
                {inv.balanceDue !== inv.totalAmount && (
                  <div className="flex justify-between text-[13px] pt-1.5 mt-1.5 border-t border-soft">
                    <span className="text-2">Balance due</span>
                    <span className={`num font-semibold ${inv.balanceDue === 0 ? "pos-text" : "neg-text"}`}>{formatINR(inv.balanceDue)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Activity timeline */}
          <ActivityTimeline inv={inv} linkedReceipts={linkedReceipts} linkedCNs={linkedCNs} customer={customer} />
        </div>

        {/* Right: sidebar */}
        <div className="space-y-4">
          {/* Balance card */}
          <div className="surface border border-app rounded-xl p-4">
            <div className="text-[10.5px] text-3 font-medium uppercase tracking-wider">Balance due</div>
            <div className={`num text-[28px] font-semibold mt-1 tabular-nums ${inv.balanceDue === 0 ? "pos-text" : "text-1"}`}>{formatINR(inv.balanceDue)}</div>
            <div className="text-[11px] text-3 mt-0.5">of {formatINR(inv.totalAmount)} total</div>

            {/* Progress bar */}
            <div className="h-1.5 surface-2 rounded-full mt-3 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${((inv.totalAmount - inv.balanceDue) / inv.totalAmount * 100).toFixed(1)}%`, background: "var(--pos)" }} />
            </div>
            <div className="flex items-center justify-between mt-1.5 text-[10.5px] text-3 num">
              <span>{((inv.totalAmount - inv.balanceDue) / inv.totalAmount * 100).toFixed(0)}% paid</span>
              <span>{inv.balanceDue > 0 ? `${formatINR(inv.balanceDue)} pending` : "Settled"}</span>
            </div>
          </div>

          {/* Customer mini */}
          <div className="surface border border-app rounded-xl p-4">
            <div className="flex items-center gap-2.5 mb-2">
              <Avatar name={customer?.name} size={32} />
              <div className="min-w-0">
                <div className="font-medium text-1 text-[13px] truncate">{customer?.name}</div>
                <div className="text-[11px] text-3 truncate">{customer?.contactPerson}</div>
              </div>
            </div>
            <div className="space-y-1.5 text-[11.5px]">
              <div className="flex items-center gap-2 text-2"><Icon name="mail" size={11} className="text-3 shrink-0" /><span className="truncate">{customer?.email}</span></div>
              <div className="flex items-center gap-2 text-2"><Icon name="phone" size={11} className="text-3 shrink-0" /><span className="num">{customer?.phone}</span></div>
              <div className="flex items-center gap-2 text-2"><Icon name="map-pin" size={11} className="text-3 shrink-0" /><span className="truncate">{customer?.city}, {customer?.state}</span></div>
            </div>
            <div className="border-t border-soft mt-3 pt-3 flex items-center justify-between">
              <span className="text-[11px] text-3">Outstanding</span>
              <span className="num text-[12.5px] font-medium text-1">{formatINR(customer?.outstandingAmount || 0)}</span>
            </div>
          </div>

          {/* e-Invoice card */}
          {inv.hasEinvoice && (
            <div className="surface border border-app rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon name="shield-check" size={14} className="pos-text" />
                <div className="text-[12px] font-semibold text-1">e-Invoice generated</div>
              </div>
              <div className="space-y-1 text-[11px] text-2">
                <div><span className="text-3">IRN: </span><span className="num">{inv.irn}</span></div>
                <div><span className="text-3">Status: </span><span className="pos-text font-medium">Verified by GSTN</span></div>
                <div><span className="text-3">Generated: </span>{formatDate(inv.issueDate)}</div>
              </div>
              <Button size="sm" variant="outline" icon="qr-code" className="w-full mt-3">View QR / IRN</Button>
            </div>
          )}

          {/* Linked docs */}
          <div className="surface border border-app rounded-xl p-4">
            <div className="text-[12px] font-semibold text-1 mb-2">Linked documents</div>
            <div className="space-y-1.5 text-[11.5px]">
              {linkedReceipts.length === 0 && linkedCNs.length === 0 && (
                <div className="text-3 text-[11px]">No linked documents.</div>
              )}
              {linkedReceipts.map((r) => (
                <div key={r.id} className="flex items-center gap-2 text-2 hover:text-1 cursor-pointer">
                  <Icon name="receipt" size={12} className="text-3" />
                  <span className="num text-[11px]">{r.referenceNumber}</span>
                  <span className="ml-auto num text-1 font-medium">{formatINR(r.amount, { short: true })}</span>
                </div>
              ))}
              {linkedCNs.map((cn) => (
                <div key={cn.id} className="flex items-center gap-2 text-2 hover:text-1 cursor-pointer">
                  <Icon name="file-minus" size={12} className="text-3" />
                  <span className="num text-[11px] accent-text">{cn.creditNoteNumber}</span>
                  <span className="ml-auto num text-1 font-medium">{formatINR(cn.amount, { short: true })}</span>
                </div>
              ))}
              <button className="flex items-center gap-1.5 text-[11px] accent-text hover:underline mt-1.5 pt-1.5 border-t border-soft w-full">
                <Icon name="plus" size={11} /> Link document
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActivityTimeline({ inv, linkedReceipts, linkedCNs, customer }) {
  const events = [];
  events.push({ at: inv.issueDate, icon: "file-plus", title: "Invoice created", detail: `Drafted by ${RUNQ.COMPANY.user.name}`, tone: "info" });
  if (inv.hasEinvoice) events.push({ at: inv.issueDate, icon: "shield-check", title: "e-Invoice generated", detail: `IRN ${inv.irn} · Verified by GSTN`, tone: "ok" });
  events.push({ at: inv.issueDate, icon: "send", title: "Sent to customer", detail: `${customer?.email}`, tone: "info" });
  if (["viewed","partially_paid","paid","overdue"].includes(inv.status)) {
    events.push({ at: addDays(inv.issueDate, 2), icon: "eye", title: "Customer viewed invoice", detail: "Opened from email link", tone: "info" });
  }
  if (inv.status === "overdue") {
    events.push({ at: addDays(inv.dueDate, 1), icon: "bell", title: "Auto-reminder sent", detail: "Dunning rule: Friendly reminder — 3 days after due", tone: "warn" });
  }
  linkedReceipts.forEach((r) => {
    events.push({ at: r.receiptDate, icon: "receipt", title: `Payment received — ${formatINR(r.amount, { short: true })}`, detail: `${r.paymentMethod.replace(/_/g," ")} · ${r.referenceNumber}`, tone: "ok" });
  });
  linkedCNs.forEach((cn) => {
    events.push({ at: cn.issueDate, icon: "file-minus", title: `Credit note ${cn.creditNoteNumber}`, detail: cn.reason, tone: "info" });
  });
  events.sort((a, b) => new Date(a.at) - new Date(b.at));

  return (
    <div className="surface border border-app rounded-xl">
      <div className="px-5 py-3 border-b border-soft flex items-center gap-2">
        <Icon name="history" size={14} className="text-2" />
        <h3 className="text-[13px] font-semibold text-1">Activity</h3>
      </div>
      <div className="px-5 py-4">
        <ol className="relative border-l border-app ml-2 space-y-4">
          {events.map((e, i) => (
            <li key={i} className="ml-4 relative">
              <span className={`absolute -left-[24px] top-0.5 h-4 w-4 rounded-full surface border border-app flex items-center justify-center`}>
                <Icon name={e.icon} size={9} className={e.tone === "ok" ? "pos-text" : e.tone === "warn" ? "warn-text" : "accent-text"} />
              </span>
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-[12.5px] font-medium text-1">{e.title}</div>
                <div className="text-[10.5px] text-3 num shrink-0">{formatDate(e.at)}</div>
              </div>
              <div className="text-[11.5px] text-3 mt-0.5">{e.detail}</div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function addDays(iso, n) {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// Synthesize 3-4 plausible lines for invoices we don't have detailed lines for
function generateLines(inv) {
  const subtotal = inv.totalAmount - inv.taxAmount;
  const lineCount = Math.min(inv.lineCount || 3, 6);
  const each = Math.floor(subtotal / lineCount);
  const items = [
    { description: "Professional services — engagement Q1", hsn: "998313", unit: "service" },
    { description: "Implementation & integration support", hsn: "998313", unit: "hours" },
    { description: "Training & enablement", hsn: "998313", unit: "days" },
    { description: "Software licensing — annual", hsn: "998434", unit: "license" },
    { description: "Support & maintenance retainer", hsn: "998314", unit: "service" },
    { description: "Consulting deliverables", hsn: "998313", unit: "lot" },
  ];
  return Array.from({ length: lineCount }, (_, i) => {
    const tpl = items[i % items.length];
    const amount = i === lineCount - 1 ? subtotal - each * (lineCount - 1) : each;
    const taxAmount = Math.round(amount * 0.18);
    return {
      id: i + 1,
      description: tpl.description,
      hsn: tpl.hsn,
      unit: tpl.unit,
      qty: tpl.unit === "hours" ? 40 : tpl.unit === "days" ? 5 : 1,
      rate: tpl.unit === "hours" ? Math.round(amount / 40) : tpl.unit === "days" ? Math.round(amount / 5) : amount,
      taxRate: 18,
      amount,
      taxAmount,
    };
  });
}

window.InvoiceList = InvoiceList;
window.InvoiceDetail = InvoiceDetail;
