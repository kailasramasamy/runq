// ─── Quotes / Sales Orders / Credit Notes / Receipts list pages ──────────────
const { useState: useStateOther, useMemo: useMemoOther } = React;

// ─── Quotes & SOs (combined page with tabs) ──────────────────────────────────
function QuotesSOsPage() {
  const [tab, setTab] = useStateOther("quotes");

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "AR", href: "#" }, { label: "Quotes & sales orders" }]}
        title="Quotes & sales orders"
        description="Pre-invoice documents — track what's quoted, accepted, and converted."
        actions={
          <>
            <Button variant="outline" size="sm" icon="download">Export</Button>
            <Button icon="plus">{tab === "quotes" ? "New quote" : "New sales order"}</Button>
          </>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatTile label="Open quotes" value={AR.QUOTES.filter(q => ["sent","viewed","draft"].includes(q.status)).length} sub={formatINR(AR.QUOTES.filter(q => ["sent","viewed","draft"].includes(q.status)).reduce((a,q)=>a+q.totalAmount,0), { short: true })} />
        <StatTile label="Accepted (this view)" value={AR.QUOTES.filter(q => q.status === "accepted").length} sub="Ready to convert" tone="pos" />
        <StatTile label="Open sales orders" value={AR.SALES_ORDERS.filter(s => s.status === "open").length} sub={`${AR.SALES_ORDERS.filter(s => s.fulfilment === "partial").length} partial fulfilment`} />
        <StatTile label="Win rate (90d)" value="64%" sub="of quotes accepted" tone="pos" />
      </div>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "quotes", label: "Quotes", count: AR.QUOTES.length },
          { id: "sos", label: "Sales orders", count: AR.SALES_ORDERS.length },
        ]}
      />

      {tab === "quotes" ? <QuotesTable /> : <SalesOrdersTable />}
    </div>
  );
}

function QuotesTable() {
  return (
    <Table>
      <TableHeader>
        <tr>
          <Th>Quote #</Th>
          <Th>Customer</Th>
          <Th>Issued</Th>
          <Th>Valid till</Th>
          <Th align="right">Total</Th>
          <Th>Status</Th>
          <Th />
        </tr>
      </TableHeader>
      <TableBody>
        {AR.QUOTES.map((q) => (
          <TableRow key={q.id}>
            <TableCell><span className="num text-[12px] accent-text font-medium">{q.quoteNumber}</span></TableCell>
            <TableCell><span className="font-medium text-1">{q.customerName}</span><div className="text-[10.5px] text-3">{q.lineCount} lines</div></TableCell>
            <TableCell className="text-2 num">{formatDate(q.issueDate)}</TableCell>
            <TableCell className="text-2 num">{formatDate(q.validTill)}</TableCell>
            <TableCell numeric align="right" className="font-medium">{formatINR(q.totalAmount)}</TableCell>
            <TableCell><StatusBadge status={q.status} /></TableCell>
            <TableCell align="right">
              {q.status === "accepted" ? (
                <Button size="sm" variant="outline" icon="arrow-right">Convert to invoice</Button>
              ) : (
                <Icon name="chevron-right" size={14} className="text-3" />
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function SalesOrdersTable() {
  return (
    <Table>
      <TableHeader>
        <tr>
          <Th>SO #</Th>
          <Th>Customer</Th>
          <Th>Issued</Th>
          <Th>Expected delivery</Th>
          <Th align="right">Total</Th>
          <Th>Fulfilment</Th>
          <Th>Status</Th>
        </tr>
      </TableHeader>
      <TableBody>
        {AR.SALES_ORDERS.map((s) => (
          <TableRow key={s.id}>
            <TableCell><span className="num text-[12px] accent-text font-medium">{s.soNumber}</span></TableCell>
            <TableCell><span className="font-medium text-1">{s.customerName}</span><div className="text-[10.5px] text-3">{s.lineCount} lines</div></TableCell>
            <TableCell className="text-2 num">{formatDate(s.issueDate)}</TableCell>
            <TableCell className="text-2 num">{formatDate(s.expectedDelivery)}</TableCell>
            <TableCell numeric align="right" className="font-medium">{formatINR(s.totalAmount)}</TableCell>
            <TableCell>
              {s.fulfilment === "delivered" ? <Badge variant="success">Delivered</Badge> :
               s.fulfilment === "partial" ? <Badge variant="warning">Partial</Badge> :
               <Badge variant="default">Pending</Badge>}
            </TableCell>
            <TableCell><StatusBadge status={s.status} /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ─── Credit Notes ─────────────────────────────────────────────────────────────
function CreditNotesPage() {
  const totalIssued = AR.CREDIT_NOTES.filter(c => c.status !== "draft" && c.status !== "cancelled").reduce((a,c)=>a+c.amount,0);

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "AR", href: "#" }, { label: "Credit notes" }]}
        title="Credit notes"
        description="Refunds, adjustments, and discounts issued against sales invoices."
        actions={
          <>
            <Button variant="outline" size="sm" icon="download">Export</Button>
            <Button icon="plus">New credit note</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatTile label="Issued (this view)" value={AR.CREDIT_NOTES.filter(c => c.status === "issued" || c.status === "adjusted").length} sub={formatINR(totalIssued, { short: true })} />
        <StatTile label="Pending adjustment" value={AR.CREDIT_NOTES.filter(c => c.status === "issued").length} sub="Not yet applied" tone="warn" />
        <StatTile label="Drafts" value={AR.CREDIT_NOTES.filter(c => c.status === "draft").length} sub="Awaiting issue" />
        <StatTile label="Avg. amount" value={formatINR(Math.round(totalIssued / Math.max(1, AR.CREDIT_NOTES.length)), { short: true })} sub="Per credit note" />
      </div>

      <Table>
        <TableHeader>
          <tr>
            <Th>Credit note #</Th>
            <Th>Customer</Th>
            <Th>Linked invoice</Th>
            <Th>Issued</Th>
            <Th>Reason</Th>
            <Th align="right">Amount</Th>
            <Th>Status</Th>
          </tr>
        </TableHeader>
        <TableBody>
          {AR.CREDIT_NOTES.map((cn) => (
            <TableRow key={cn.id}>
              <TableCell><span className="num text-[12px] accent-text font-medium">{cn.creditNoteNumber}</span></TableCell>
              <TableCell><span className="font-medium text-1">{cn.customerName}</span></TableCell>
              <TableCell>
                {cn.invoiceNumber ? (
                  <span className="num text-[11.5px] text-2 hover:text-1 cursor-pointer hover:underline">{cn.invoiceNumber}</span>
                ) : (
                  <span className="text-3 text-[11.5px]">Standalone</span>
                )}
              </TableCell>
              <TableCell className="text-2 num">{formatDate(cn.issueDate)}</TableCell>
              <TableCell><span className="text-2 text-[12px]">{cn.reason}</span></TableCell>
              <TableCell numeric align="right" className="font-medium">{formatINR(cn.amount)}</TableCell>
              <TableCell><StatusBadge status={cn.status} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Receipts ─────────────────────────────────────────────────────────────────
function ReceiptsPage() {
  const [search, setSearch] = useStateOther("");
  const [methodFilter, setMethodFilter] = useStateOther("");

  const filtered = useMemoOther(() => {
    return AR.RECEIPTS.filter((r) => {
      if (methodFilter && r.paymentMethod !== methodFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!r.customerName.toLowerCase().includes(q) && !r.referenceNumber.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [search, methodFilter]);

  const total = filtered.reduce((a, r) => a + r.amount, 0);
  const byMethod = filtered.reduce((acc, r) => {
    acc[r.paymentMethod] = (acc[r.paymentMethod] || 0) + r.amount;
    return acc;
  }, {});

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "AR", href: "#" }, { label: "Receipts" }]}
        title="Receipts"
        description="Customer payments — bank transfers, UPI, cheques, and gateway settlements."
        actions={
          <>
            <Button variant="outline" size="sm" icon="link">Match unallocated</Button>
            <Button variant="outline" size="sm" icon="download">Export</Button>
            <Button icon="plus">Record receipt</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatTile label="Total received" value={formatINR(total, { short: true })} sub={`${filtered.length} receipts in view`} tone="pos" />
        <StatTile label="Bank transfers" value={formatINR(byMethod.bank_transfer || 0, { short: true })} sub="NEFT" />
        <StatTile label="RTGS" value={formatINR(byMethod.rtgs || 0, { short: true })} sub="High-value transfers" />
        <StatTile label="Unallocated" value={formatINR(filtered.filter(r => r.invoiceIds.length === 0).reduce((a,r)=>a+r.amount,0), { short: true })} sub={`${filtered.filter(r => r.invoiceIds.length === 0).length} need matching`} tone="warn" />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="w-72">
          <Input icon="search" placeholder="Search customer or reference…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select
          value={methodFilter}
          onChange={(e) => setMethodFilter(e.target.value)}
          options={[
            { value: "", label: "All payment methods" },
            { value: "bank_transfer", label: "Bank transfer" },
            { value: "rtgs", label: "RTGS" },
            { value: "cheque", label: "Cheque" },
            { value: "upi", label: "UPI" },
          ]}
        />
        <div className="flex-1" />
        <span className="text-[12px] text-3 num">{filtered.length} receipts</span>
      </div>

      <Table>
        <TableHeader>
          <tr>
            <Th>Date</Th>
            <Th>Customer</Th>
            <Th>Method</Th>
            <Th>Reference</Th>
            <Th>Allocated to</Th>
            <Th align="right">Amount</Th>
            <Th />
          </tr>
        </TableHeader>
        <TableBody>
          {filtered.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="num text-2">{formatDate(r.receiptDate)}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Avatar name={r.customerName} size={24} />
                  <span className="font-medium text-1">{r.customerName}</span>
                </div>
              </TableCell>
              <TableCell>
                <PaymentMethodBadge method={r.paymentMethod} />
              </TableCell>
              <TableCell className="num text-[11.5px] text-2">{r.referenceNumber}</TableCell>
              <TableCell>
                {r.invoiceIds.length > 0 ? (
                  <span className="num text-[11.5px] accent-text hover:underline cursor-pointer">
                    {r.invoiceIds.map(id => AR.INVOICES.find(i => i.id === id)?.invoiceNumber).filter(Boolean).join(", ")}
                  </span>
                ) : (
                  <Badge variant="warning">Unallocated</Badge>
                )}
              </TableCell>
              <TableCell numeric align="right" className="font-semibold pos-text">{formatINR(r.amount)}</TableCell>
              <TableCell align="right">
                <Icon name="chevron-right" size={14} className="text-3" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function PaymentMethodBadge({ method }) {
  const cfg = {
    bank_transfer: { icon: "building-bank", label: "Bank transfer" },
    rtgs: { icon: "zap", label: "RTGS" },
    cheque: { icon: "scroll-text", label: "Cheque" },
    upi: { icon: "smartphone", label: "UPI" },
  }[method] ?? { icon: "wallet", label: method };
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] text-2">
      <Icon name={cfg.icon} size={11} className="text-3" />
      {cfg.label}
    </span>
  );
}

window.QuotesSOsPage = QuotesSOsPage;
window.CreditNotesPage = CreditNotesPage;
window.ReceiptsPage = ReceiptsPage;
