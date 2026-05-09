// ─── Customers list + detail ─────────────────────────────────────────────────
const { useState: useStateCust, useMemo: useMemoCust } = React;

function CustomerList({ onView }) {
  const [search, setSearch] = useStateCust("");
  const [typeFilter, setTypeFilter] = useStateCust("");
  const [page, setPage] = useStateCust(1);
  const limit = 8;

  const filtered = useMemoCust(() => {
    return AR.CUSTOMERS.filter((c) => {
      if (typeFilter && c.type !== typeFilter) return false;
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [search, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / limit));
  const customers = filtered.slice((page - 1) * limit, page * limit);

  const totalOutstanding = filtered.reduce((a, c) => a + c.outstandingAmount, 0);

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "AR", href: "#" }, { label: "Customers" }]}
        title="Customers"
        description="Manage your customer relationships and outstanding balances."
        actions={
          <>
            <Button variant="outline" size="sm" icon="download">Export CSV</Button>
            <Button variant="outline" icon="upload">Import customers</Button>
            <Button icon="plus">New customer</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatTile label="Total customers" value={AR.CUSTOMERS.length} sub={`${AR.CUSTOMERS.filter(c => c.isActive).length} active`} />
        <StatTile label="Outstanding (all)" value={formatINR(totalOutstanding, { short: true })} sub="Across active accounts" />
        <StatTile label="Avg. credit score" value={Math.round(AR.CUSTOMERS.reduce((a, c) => a + c.creditScore, 0) / AR.CUSTOMERS.length)} sub="Higher is safer" tone="pos" />
        <StatTile label="High-risk accounts" value={AR.CUSTOMERS.filter(c => c.riskLevel === "high").length} sub="Need monitoring" tone="neg" />
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="w-72">
          <Input
            icon="search"
            placeholder="Search customers…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          options={[
            { value: "", label: "All types" },
            { value: "b2b", label: "B2B" },
            { value: "b2c", label: "B2C" },
            { value: "payment_gateway", label: "Payment gateway" },
          ]}
        />
        <div className="flex-1" />
        <span className="text-[12px] text-3 num">{filtered.length} customers</span>
      </div>

      <Table>
        <TableHeader>
          <tr>
            <Th>Name</Th>
            <Th>Type</Th>
            <Th>Contact</Th>
            <Th>Terms</Th>
            <Th>Risk</Th>
            <Th align="right">Outstanding</Th>
            <Th>Status</Th>
            <Th />
          </tr>
        </TableHeader>
        <TableBody>
          {customers.length === 0 ? (
            <tr><td colSpan={8}><EmptyState icon="users" title="No customers found" description="Try adjusting your filters." /></td></tr>
          ) : customers.map((c) => (
            <TableRow key={c.id} onClick={() => onView(c.id)}>
              <TableCell>
                <div className="flex items-center gap-2.5">
                  <Avatar name={c.name} size={28} />
                  <div className="min-w-0">
                    <div className="font-medium text-1 truncate">{c.name}</div>
                    <div className="text-[11px] text-3 truncate">{c.gstin}</div>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={c.type === "b2b" ? "info" : c.type === "payment_gateway" ? "primary" : "default"}>
                  {c.type === "b2b" ? "B2B" : c.type === "payment_gateway" ? "Gateway" : "B2C"}
                </Badge>
              </TableCell>
              <TableCell className="text-2">
                <div className="text-[12.5px]">{c.contactPerson}</div>
                <div className="text-[11px] text-3">{c.email}</div>
              </TableCell>
              <TableCell className="text-2">Net {c.paymentTermsDays}d</TableCell>
              <TableCell>
                <CreditScorePill score={c.creditScore} risk={c.riskLevel} />
              </TableCell>
              <TableCell align="right" numeric className="font-semibold">
                {c.outstandingAmount > 0 ? formatINR(c.outstandingAmount) : <span className="text-3">—</span>}
              </TableCell>
              <TableCell>
                <Badge variant={c.isActive ? "success" : "outline"}>{c.isActive ? "Active" : "Inactive"}</Badge>
              </TableCell>
              <TableCell align="right">
                <Icon name="chevron-right" size={14} className="text-3" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="mt-3">
        <Pagination page={page} totalPages={totalPages} total={filtered.length} limit={limit} onPageChange={setPage} />
      </div>
    </div>
  );
}

function CreditScorePill({ score, risk }) {
  const tone = risk === "high" ? "neg" : risk === "medium" ? "warn" : "pos";
  const bg = tone === "pos" ? "var(--pos-soft)" : tone === "warn" ? "var(--warn-soft)" : "var(--neg-soft)";
  const fg = tone === "pos" ? "var(--pos)" : tone === "warn" ? "var(--warn)" : "var(--neg)";
  return (
    <span className="inline-flex items-center gap-1.5 px-1.5 py-[3px] rounded text-[11px] font-medium num" style={{ background: bg, color: fg }}>
      <Icon name={tone === "pos" ? "shield-check" : tone === "warn" ? "shield-alert" : "shield-x"} size={11} />
      {score}
    </span>
  );
}

// ─── Customer Detail ─────────────────────────────────────────────────────────
function CustomerDetail({ customerId, onBack }) {
  const c = AR.CUSTOMERS.find((x) => x.id === customerId);
  if (!c) return <div className="text-2 text-[13px]">Customer not found.</div>;

  const customerInvoices = AR.INVOICES.filter((i) => i.customerId === customerId);
  const customerReceipts = AR.RECEIPTS.filter((r) => r.customerId === customerId);
  const portalUrl = `https://pay.runq.io/portal/s/${c.id.slice(-8)}`;

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "AR", href: "#" }, { label: "Customers", href: "#" }, { label: c.name }]}
        title={c.name}
        titleBadge={c.nickname && <Badge variant="info">{c.nickname}</Badge>}
        actions={
          <>
            <Button variant="ghost" icon="arrow-left" onClick={onBack}>Back</Button>
            <Badge variant={c.isActive ? "success" : "outline"}>{c.isActive ? "Active" : "Inactive"}</Badge>
            <CreditScorePill score={c.creditScore} risk={c.riskLevel} />
            <Button variant="outline" icon="pencil">Edit</Button>
            <Button variant="outline" icon="more-horizontal" />
          </>
        }
      />

      {/* Outstanding hero */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <div className="surface border border-app rounded-xl p-5 lg:col-span-2 relative overflow-hidden">
          <div className="absolute -right-12 -top-12 w-44 h-44 rounded-full opacity-50" style={{ background: "radial-gradient(circle, var(--accent-soft) 0%, transparent 70%)" }} />
          <div className="relative">
            <div className="text-[11px] text-3 font-medium uppercase tracking-wider">Outstanding balance</div>
            <div className="num text-[40px] font-semibold text-1 mt-2 leading-none tabular-nums">{formatINR(c.outstandingAmount)}</div>
            <div className="flex items-center gap-4 mt-3 text-[12px] text-3">
              <span><span className="num text-1 font-medium">{customerInvoices.filter(i => i.status === "overdue").length}</span> overdue</span>
              <span>·</span>
              <span><span className="num text-1 font-medium">{customerInvoices.filter(i => ["sent","viewed","partially_paid"].includes(i.status)).length}</span> open</span>
              <span>·</span>
              <span>Avg DSO <span className="num text-1 font-medium">{c.paymentTermsDays + 4}d</span></span>
            </div>
            <div className="flex items-center gap-2 mt-4">
              <Button icon="plus" size="sm">New invoice</Button>
              <Button variant="outline" icon="receipt" size="sm">Record receipt</Button>
              <Button variant="outline" icon="bell" size="sm">Send reminder</Button>
            </div>
          </div>
        </div>
        <div className="surface border border-app rounded-xl p-5">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] text-3 font-medium uppercase tracking-wider">Payment portal</div>
            <Icon name="external-link" size={13} className="text-3" />
          </div>
          <p className="text-[12px] text-2 mb-3">Share this link so {c.nickname || "the customer"} can view and pay invoices online — no login required.</p>
          <div className="surface-2 border border-app rounded-md px-2.5 py-2 text-[11px] num text-2 truncate mb-2">{portalUrl}</div>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" icon="copy">Copy</Button>
            <Button size="sm" variant="outline" icon="rotate-cw">Regenerate</Button>
          </div>
        </div>
      </div>

      {/* Detail cards grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <DetailCard title="Basic info" icon="user">
          <DetailRow label="Type" value={c.type === "b2b" ? "B2B" : c.type === "payment_gateway" ? "Payment gateway" : "B2C"} />
          <DetailRow label="Contact person" value={c.contactPerson} />
          <DetailRow label="Email" value={c.email} mono />
          <DetailRow label="Phone" value={c.phone} mono />
          <DetailRow label="Payment terms" value={`Net ${c.paymentTermsDays} days`} />
          <DetailRow label="Credit limit" value={c.creditLimit ? formatINR(c.creditLimit) : "No limit"} />
        </DetailCard>
        <DetailCard title="Tax & legal" icon="shield-check">
          <DetailRow label="GSTIN" value={c.gstin} mono />
          <DetailRow label="PAN" value={c.pan} mono />
          <DetailRow label="Place of supply" value={`${c.state} (${c.gstin.slice(0,2)})`} />
          <DetailRow label="Address" value={`${c.addressLine1}${c.addressLine2 ? `, ${c.addressLine2}` : ""}, ${c.city}, ${c.state} – ${c.pincode}`} />
        </DetailCard>
      </div>

      {/* Invoices */}
      <div className="surface border border-app rounded-xl mb-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-soft">
          <div className="flex items-center gap-2">
            <Icon name="file-text" size={14} className="text-2" />
            <h3 className="text-[13px] font-semibold text-1">Recent invoices</h3>
            <span className="text-[11px] text-3 num">({customerInvoices.length})</span>
          </div>
          <Button variant="ghost" size="sm">View all</Button>
        </div>
        {customerInvoices.length === 0 ? (
          <EmptyState icon="file-text" title="No invoices yet" description="Sales invoices for this customer will appear here." />
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                <Th>Invoice #</Th>
                <Th>Issued</Th>
                <Th>Due</Th>
                <Th align="right">Total</Th>
                <Th align="right">Balance</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {customerInvoices.slice(0, 6).map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell><span className="num text-[12px] accent-text font-medium">{inv.invoiceNumber}</span></TableCell>
                  <TableCell className="text-2 num">{inv.issueDate}</TableCell>
                  <TableCell className="text-2 num">{inv.dueDate}</TableCell>
                  <TableCell numeric align="right">{formatINR(inv.totalAmount)}</TableCell>
                  <TableCell numeric align="right" className="font-medium">{formatINR(inv.balanceDue)}</TableCell>
                  <TableCell><StatusBadge status={inv.status} /></TableCell>
                </TableRow>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Receipts */}
      <div className="surface border border-app rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-soft">
          <div className="flex items-center gap-2">
            <Icon name="receipt" size={14} className="text-2" />
            <h3 className="text-[13px] font-semibold text-1">Receipts</h3>
            <span className="text-[11px] text-3 num">({customerReceipts.length})</span>
          </div>
          <Button variant="ghost" size="sm">View all</Button>
        </div>
        {customerReceipts.length === 0 ? (
          <EmptyState icon="receipt" title="No receipts yet" description="Payments from this customer will appear here." />
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Method</Th>
                <Th>Reference</Th>
                <Th align="right">Amount</Th>
              </tr>
            </thead>
            <tbody>
              {customerReceipts.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="num">{r.receiptDate}</TableCell>
                  <TableCell className="capitalize text-2">{r.paymentMethod.replace(/_/g," ")}</TableCell>
                  <TableCell className="text-2 num text-[11.5px]">{r.referenceNumber}</TableCell>
                  <TableCell numeric align="right" className="font-medium">{formatINR(r.amount)}</TableCell>
                </TableRow>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function DetailCard({ title, icon, children }) {
  return (
    <div className="surface border border-app rounded-xl">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-soft">
        <Icon name={icon} size={14} className="text-2" />
        <h3 className="text-[13px] font-semibold text-1">{title}</h3>
      </div>
      <div className="px-5 py-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
        {children}
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono = false }) {
  return (
    <div className="min-w-0">
      <div className="text-[10.5px] text-3 font-medium uppercase tracking-wider mb-0.5">{label}</div>
      <div className={`text-[12.5px] text-1 ${mono ? "num" : ""} break-words`}>{value || <span className="text-3">—</span>}</div>
    </div>
  );
}

window.CustomerList = CustomerList;
window.CustomerDetail = CustomerDetail;
window.CreditScorePill = CreditScorePill;
window.DetailCard = DetailCard;
window.DetailRow = DetailRow;
