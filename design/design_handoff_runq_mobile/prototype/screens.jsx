// screens.jsx — all major screens for runQ Mobile
// Loaded after data.js, ui.jsx. Exposes window.RunQScreens = { Dashboard, Invoices, Bills, BillScan, Banking, Approvals, Agent, InvoiceDetail }

window.RunQScreens = (() => {
  const D = window.RunQData;
  const { formatINR, fromNow, dueLabel, StatusPill, Avatar, Sparkline, Card, SectionHead, Sparkle, I } = window.RunQUI;

  // shared layout helpers ---------------------------------------------------
  const PAD = 16;
  const Row = ({ children, gap = 12, align = 'center', justify = 'flex-start', wrap, style }) => (
    <div style={{ display: 'flex', alignItems: align, justifyContent: justify, gap, flexWrap: wrap ? 'wrap' : 'nowrap', ...style }}>{children}</div>
  );
  const Col = ({ children, gap = 0, style }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap, ...style }}>{children}</div>
  );

  // Common screen header (replaces iOS large title, themed for runQ) -------
  function ScreenHeader({ title, subtitle, right, theme }) {
    return (
      <div style={{ padding: '14px 16px 8px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', color: '#1A1714', lineHeight: 1.1 }}>{title}</div>
          {subtitle && <div style={{ fontSize: 13, color: '#7B7468', marginTop: 4 }}>{subtitle}</div>}
        </div>
        {right}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // DASHBOARD
  // ════════════════════════════════════════════════════════════════════════
  function Dashboard({ tweaks, nav }) {
    const totalCash = D.banks.reduce((s, b) => s + b.balance, 0);
    const arOver = D.invoices.filter(i => i.status === 'overdue').reduce((s, i) => s + i.amount, 0);
    const apDue = D.bills.filter(b => b.status !== 'paid').reduce((s, b) => s + (b.amount - (b.paid || 0)), 0);
    const showInsights = tweaks.aiProminence !== 'subtle';

    return (
      <Col style={{ paddingBottom: 100 }}>
        {/* Greeting + bell */}
        <div style={{ padding: '10px 16px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, color: '#7B7468' }}>Tuesday, 28 April</div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em', color: '#1A1714' }}>Good morning, Arjun</div>
          </div>
          <Row gap={6}>
            <button style={iconBtn}><I.search size={20} color="#605A52"/></button>
            <button style={iconBtn} onClick={() => nav.go('approvals')}>
              <I.bell size={20} color="#605A52"/>
              <span style={dot}/>
            </button>
          </Row>
        </div>

        {/* Hero — cash position */}
        <div style={{ padding: '10px 16px 0' }}>
          <Card padded={false} style={{ overflow: 'hidden', background: 'linear-gradient(160deg, #312E81 0%, #4F46E5 60%, #6366F1 100%)', border: 0 }}>
            <div style={{ padding: 18, color: '#fff' }}>
              <Row justify="space-between" align="flex-start">
                <div>
                  <div style={{ fontSize: 12, opacity: 0.75, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>Cash position</div>
                  <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{formatINR(totalCash)}</div>
                  <Row gap={6} style={{ marginTop: 4, fontSize: 12, opacity: 0.85 }}>
                    <I.arrowUp size={13} color="#A5F3D5"/>
                    <span>+{formatINR(382000)} this week</span>
                  </Row>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.14)', padding: '4px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600 }}>4 accounts</div>
              </Row>
              <div style={{ marginTop: 10, marginLeft: -4 }}>
                <Sparkline data={D.cashSpark} w={336} h={56} stroke="#fff" fill="rgba(255,255,255,0.12)"/>
              </div>
              <Row justify="space-between" style={{ marginTop: 4, fontSize: 11, opacity: 0.7 }}>
                <span>14 days ago</span><span>today</span>
              </Row>
            </div>
            {/* Pay-in / Pay-out strip */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid rgba(255,255,255,0.15)' }}>
              <button onClick={() => nav.go('invoices')} style={miniStat}>
                <span style={{ opacity: 0.75, fontSize: 11 }}>To collect (AR)</span>
                <span style={{ fontWeight: 600, fontSize: 16, fontVariantNumeric: 'tabular-nums' }}>{formatINR(arOver, { compact: true })}</span>
                <span style={{ fontSize: 11, color: '#FCA5A5' }}>2 overdue</span>
              </button>
              <button onClick={() => nav.go('bills')} style={{ ...miniStat, borderLeft: '1px solid rgba(255,255,255,0.15)' }}>
                <span style={{ opacity: 0.75, fontSize: 11 }}>To pay (AP)</span>
                <span style={{ fontWeight: 600, fontSize: 16, fontVariantNumeric: 'tabular-nums' }}>{formatINR(apDue, { compact: true })}</span>
                <span style={{ fontSize: 11, color: '#FCD34D' }}>3 due this week</span>
              </button>
            </div>
          </Card>
        </div>

        {/* Quick actions */}
        <div style={{ padding: '18px 16px 0' }}>
          <Row gap={10}>
            {[
              { icon: <I.camera size={20} color="#4F46E5"/>, label: 'Scan bill', sub: 'AI extract', go: 'billScan' },
              { icon: <I.send size={20} color="#0891B2"/>, label: 'Invoice', sub: 'Create + send', go: 'invoices' },
              { icon: <I.bank size={20} color="#16A34A"/>, label: 'Reconcile', sub: '13 to match', go: 'banking' },
              { icon: <I.check size={20} color="#D97706"/>, label: 'Approve', sub: '4 pending', go: 'approvals' },
            ].map((a, i) => (
              <button key={i} onClick={() => nav.go(a.go)} style={{
                flex: 1, minWidth: 0, background: '#fff', border: '0.5px solid rgba(20,18,16,0.08)',
                borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column',
                alignItems: 'flex-start', gap: 6, cursor: 'pointer', height: 96,
                boxShadow: '0 1px 3px rgba(20,18,16,0.04)',
              }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: '#F6F4F0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{a.icon}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#1A1714', letterSpacing: '-0.01em' }}>{a.label}</div>
                <div style={{ fontSize: 10, color: '#9C9489', marginTop: -2 }}>{a.sub}</div>
              </button>
            ))}
          </Row>
        </div>

        {/* AI insights */}
        {showInsights && (
          <div style={{ padding: '20px 16px 0' }}>
            <SectionHead title={tweaks.aiProminence === 'prominent' ? '✨ Needs your attention' : 'Needs your attention'} action="Ask agent" onAction={() => nav.go('agent')}/>
            <div style={{ display: 'flex', gap: 10, overflowX: 'auto', margin: '0 -16px', padding: '0 16px 4px', scrollSnapType: 'x mandatory' }} className="scrollbar-hide">

              {/* Card 1 — Overdue (warn) */}
              <button onClick={() => nav.go('invoices')} style={{
                flex: '0 0 200px', scrollSnapAlign: 'start',
                background: 'linear-gradient(160deg,#FEF3C7,#FDE68A)',
                borderRadius: 16, padding: 14, border: '0.5px solid rgba(146,64,14,0.12)',
                display: 'flex', flexDirection: 'column', gap: 8,
                cursor: 'pointer', textAlign: 'left', height: 148,
              }}>
                <Row justify="space-between" align="center">
                  <div style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(146,64,14,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <I.activity size={16} color="#92400E"/>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#92400E', letterSpacing: '0.06em', textTransform: 'uppercase', background: 'rgba(146,64,14,0.1)', padding: '3px 7px', borderRadius: 6 }}>Overdue</span>
                </Row>
                <Col gap={2} style={{ marginTop: 'auto' }}>
                  <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: '#1A1714', fontVariantNumeric: 'tabular-nums' }}>{formatINR(499500, { compact: true })}</span>
                  <span style={{ fontSize: 12, color: '#7B5614' }}>2 invoices · 11d since reminder</span>
                </Col>
                <Row gap={4} style={{ color: '#92400E', fontSize: 12, fontWeight: 600 }}>
                  <I.wa size={13} color="#92400E"/> <span>Send reminder</span> <I.arrowR size={11} color="#92400E"/>
                </Row>
              </button>

              {/* Card 2 — Early discount (suggestion) */}
              <button style={{
                flex: '0 0 200px', scrollSnapAlign: 'start',
                background: 'linear-gradient(160deg,#EDE9FE,#DDD6FE)',
                borderRadius: 16, padding: 14, border: '0.5px solid rgba(91,33,182,0.12)',
                display: 'flex', flexDirection: 'column', gap: 8,
                cursor: 'pointer', textAlign: 'left', height: 148,
              }}>
                <Row justify="space-between" align="center">
                  <div style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(91,33,182,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Sparkle size={16} color="#5B21B6"/>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#5B21B6', letterSpacing: '0.06em', textTransform: 'uppercase', background: 'rgba(91,33,182,0.1)', padding: '3px 7px', borderRadius: 6 }}>Save</span>
                </Row>
                <Col gap={2} style={{ marginTop: 'auto' }}>
                  <Row gap={4} align="baseline">
                    <span style={{ fontSize: 11, color: '#5B21B6', fontWeight: 600 }}>SAVE</span>
                    <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: '#1A1714', fontVariantNumeric: 'tabular-nums' }}>{formatINR(11744)}</span>
                  </Row>
                  <span style={{ fontSize: 12, color: '#5B3CB6' }}>Bharat Steel · 2% by 5 May</span>
                </Col>
                <Row gap={4} style={{ color: '#5B21B6', fontSize: 12, fontWeight: 600 }}>
                  <span>Pay now</span> <I.arrowR size={11} color="#5B21B6"/>
                </Row>
              </button>

              {/* Card 3 — GST status (good/warn mix) */}
              <button style={{
                flex: '0 0 200px', scrollSnapAlign: 'start',
                background: 'linear-gradient(160deg,#ECFDF5,#D1FAE5)',
                borderRadius: 16, padding: 14, border: '0.5px solid rgba(4,120,87,0.12)',
                display: 'flex', flexDirection: 'column', gap: 8,
                cursor: 'pointer', textAlign: 'left', height: 148,
              }}>
                <Row justify="space-between" align="center">
                  <div style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(4,120,87,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                    <svg width="32" height="32" viewBox="0 0 32 32" style={{ position: 'absolute', inset: 0 }}>
                      <circle cx="16" cy="16" r="12" stroke="rgba(4,120,87,0.18)" strokeWidth="3" fill="none"/>
                      <circle cx="16" cy="16" r="12" stroke="#047857" strokeWidth="3" fill="none"
                        strokeDasharray={`${0.92 * 75.4} 75.4`} strokeLinecap="round"
                        transform="rotate(-90 16 16)"/>
                    </svg>
                    <span style={{ fontSize: 9, fontWeight: 700, color: '#047857', position: 'relative' }}>92%</span>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#047857', letterSpacing: '0.06em', textTransform: 'uppercase', background: 'rgba(4,120,87,0.1)', padding: '3px 7px', borderRadius: 6 }}>On track</span>
                </Row>
                <Col gap={2} style={{ marginTop: 'auto' }}>
                  <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: '#1A1714' }}>13 days</span>
                  <span style={{ fontSize: 12, color: '#066045' }}>GSTR-1 April · 2 invoices missing HSN</span>
                </Col>
                <Row gap={4} style={{ color: '#047857', fontSize: 12, fontWeight: 600 }}>
                  <span>Fix &amp; review</span> <I.arrowR size={11} color="#047857"/>
                </Row>
              </button>

              {/* Card 4 — Cash forecast */}
              <button onClick={() => nav.go('agent')} style={{
                flex: '0 0 200px', scrollSnapAlign: 'start',
                background: 'linear-gradient(160deg,#1E1B4B,#312E81)',
                borderRadius: 16, padding: 14, border: '0.5px solid rgba(255,255,255,0.08)',
                display: 'flex', flexDirection: 'column', gap: 8,
                cursor: 'pointer', textAlign: 'left', height: 148, color: '#fff',
              }}>
                <Row justify="space-between" align="center">
                  <div style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <I.activity size={16} color="#A5B4FC"/>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#FCA5A5', letterSpacing: '0.06em', textTransform: 'uppercase' }}>−26%</span>
                </Row>
                <Col gap={2} style={{ marginTop: 'auto' }}>
                  <span style={{ fontSize: 11, opacity: 0.65, fontWeight: 500 }}>Cash · 30 days</span>
                  <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{formatINR(4720000, { compact: true })}</span>
                </Col>
                <Row gap={4} style={{ fontSize: 12, fontWeight: 600, opacity: 0.85 }}>
                  <Sparkle size={11} color="#A5B4FC"/><span>Ask agent</span><I.arrowR size={11} color="#fff"/>
                </Row>
              </button>
            </div>
          </div>
        )}

        {/* GST readiness */}
        <div style={{ padding: '18px 16px 0' }}>
          <Card padded>
            <Row justify="space-between" align="flex-start">
              <div>
                <Row gap={6} style={{ marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#9C9489', textTransform: 'uppercase', letterSpacing: '0.06em' }}>GSTR-1 · April</span>
                  <StatusPill status="sent" dense/>
                </Row>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#1A1714' }}>92% ready to file</div>
                <div style={{ fontSize: 12, color: '#7B7468', marginTop: 2 }}>Due in 13 days · 2 invoices need HSN</div>
              </div>
              <button style={{ ...primaryBtn, padding: '8px 14px', fontSize: 13 }}>Review</button>
            </Row>
            <div style={{ marginTop: 12, height: 6, background: '#F0EDE8', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ width: '92%', height: '100%', background: 'linear-gradient(90deg,#4F46E5,#7C3AED)', borderRadius: 999 }}/>
            </div>
          </Card>
        </div>

        {/* Recent activity */}
        <div style={{ padding: '20px 16px 0' }}>
          <SectionHead title="Activity"/>
          <Card padded={false}>
            {[
              { who: 'Krishna Distributors', what: 'paid ₹80,000 against INV-141', when: '12m ago', icon: <I.arrowDn size={16} color="#16A34A"/>, tint: '#ECFDF5' },
              { who: 'Bharat Steel', what: 'sent bill ₹5.87L · auto-matched to PO', when: '2h ago', icon: <Sparkle size={14}/>, tint: '#F3E8FF' },
              { who: 'You', what: 'approved Universal Packaging payment', when: '4h ago', icon: <I.check size={16} color="#3D44C5"/>, tint: '#EEF1FE' },
            ].map((a, i, arr) => (
              <Row key={i} style={{ padding: 14, borderBottom: i < arr.length - 1 ? '0.5px solid rgba(20,18,16,0.06)' : 'none' }}>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: a.tint, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{a.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: '#1A1714' }}><b style={{ fontWeight: 600 }}>{a.who}</b> {a.what}</div>
                  <div style={{ fontSize: 11, color: '#9C9489', marginTop: 1 }}>{a.when}</div>
                </div>
              </Row>
            ))}
          </Card>
        </div>
      </Col>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // INVOICES (AR)
  // ════════════════════════════════════════════════════════════════════════
  function Invoices({ tweaks, nav }) {
    const [tab, setTab] = React.useState('all');
    const tabs = [
      { id: 'all', label: 'All', count: D.invoices.length },
      { id: 'overdue', label: 'Overdue', count: D.invoices.filter(i => i.status === 'overdue').length },
      { id: 'unpaid', label: 'Unpaid', count: D.invoices.filter(i => i.status !== 'paid').length },
      { id: 'paid', label: 'Paid', count: D.invoices.filter(i => i.status === 'paid').length },
    ];
    const filtered = D.invoices.filter(i =>
      tab === 'all' ? true :
      tab === 'overdue' ? i.status === 'overdue' :
      tab === 'paid' ? i.status === 'paid' :
      i.status !== 'paid'
    );
    const total = filtered.reduce((s, i) => s + (i.amount - (i.paid || 0)), 0);

    return (
      <Col style={{ paddingBottom: 100 }}>
        <ScreenHeader
          title="Invoices"
          subtitle={`${filtered.length} · ${formatINR(total)} outstanding`}
          right={<Row gap={6}>
            <button style={iconBtn}><I.search size={20} color="#605A52"/></button>
            <button style={iconBtn}><I.filter size={20} color="#605A52"/></button>
          </Row>}
        />
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, padding: '4px 16px 12px', overflowX: 'auto' }} className="scrollbar-hide">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '7px 12px', borderRadius: 999, border: 0, cursor: 'pointer',
              background: tab === t.id ? '#1A1714' : '#F0EDE8',
              color: tab === t.id ? '#fff' : '#3F3A33',
              fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {t.label}
              <span style={{ background: tab === t.id ? 'rgba(255,255,255,0.2)' : 'rgba(20,18,16,0.08)', padding: '1px 6px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>{t.count}</span>
            </button>
          ))}
        </div>

        {/* List grouped by recency */}
        <div style={{ padding: '0 16px' }}>
          <Card padded={false}>
            {filtered.map((inv, i, arr) => {
              const cust = D.byId.customer(inv.customerId);
              return (
                <button key={inv.id} onClick={() => nav.go('invoiceDetail', { id: inv.id })} style={{
                  width: '100%', textAlign: 'left', background: 'none', border: 0,
                  borderBottom: i < arr.length - 1 ? '0.5px solid rgba(20,18,16,0.06)' : 'none',
                  padding: 14, cursor: 'pointer', display: 'block',
                }}>
                  <Row align="flex-start" gap={12}>
                    <Avatar short={cust.short} name={cust.name} size={40}/>
                    <Col style={{ flex: 1, minWidth: 0 }} gap={2}>
                      <Row justify="space-between" gap={8}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#1A1714', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cust.name}</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#1A1714', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{formatINR(inv.amount)}</span>
                      </Row>
                      <Row justify="space-between" gap={8}>
                        <span style={{ fontSize: 12, color: '#7B7468', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {inv.id} · {dueLabel(inv.due)}
                        </span>
                        <StatusPill status={inv.status} dense/>
                      </Row>
                      {inv.status === 'partially_paid' && (
                        <div style={{ marginTop: 6, height: 4, background: '#F0EDE8', borderRadius: 99 }}>
                          <div style={{ width: `${(inv.paid / inv.amount) * 100}%`, height: '100%', background: '#16A34A', borderRadius: 99 }}/>
                        </div>
                      )}
                    </Col>
                  </Row>
                </button>
              );
            })}
          </Card>
        </div>
      </Col>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // INVOICE DETAIL
  // ════════════════════════════════════════════════════════════════════════
  function InvoiceDetail({ id, nav }) {
    const inv = D.invoices.find(i => i.id === id) || D.invoices[1];
    const cust = D.byId.customer(inv.customerId);
    const subtotal = inv.amount - inv.gst;
    return (
      <Col style={{ paddingBottom: 120 }}>
        <Row style={{ padding: '12px 12px 4px' }} justify="space-between">
          <button onClick={() => nav.back()} style={iconBtn}><I.chev size={20} color="#1A1714" style={{ transform: 'rotate(180deg)' }}/></button>
          <Row gap={4}>
            <button style={iconBtn}><I.eye size={20} color="#605A52"/></button>
            <button style={iconBtn}><I.moreH size={20} color="#605A52"/></button>
          </Row>
        </Row>
        <div style={{ padding: '0 16px 8px' }}>
          <div style={{ fontSize: 12, color: '#9C9489', fontWeight: 600, letterSpacing: '0.04em' }}>{inv.id}</div>
          <Row justify="space-between" align="flex-end" style={{ marginTop: 4 }}>
            <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em', color: '#1A1714' }}>{formatINR(inv.amount)}</div>
            <StatusPill status={inv.status}/>
          </Row>
          <div style={{ fontSize: 13, color: '#7B7468', marginTop: 4 }}>{dueLabel(inv.due)} · created {new Date(inv.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</div>
        </div>

        {/* customer card */}
        <div style={{ padding: '12px 16px 0' }}>
          <Card>
            <Row gap={12}>
              <Avatar short={cust.short} name={cust.name} size={42}/>
              <Col style={{ flex: 1 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#1A1714' }}>{cust.name}</span>
                <span style={{ fontSize: 12, color: '#7B7468' }}>{cust.gstin} · {cust.city}</span>
              </Col>
              <button style={iconBtn}><I.chev size={18} color="#9C9489"/></button>
            </Row>
          </Card>
        </div>

        {/* line items */}
        <div style={{ padding: '12px 16px 0' }}>
          <SectionHead title="Items"/>
          <Card padded={false}>
            {[
              { name: 'Cotton fabric — Grade A', qty: '120 m', rate: 280, amt: 33600, hsn: '5208' },
              { name: 'Polyester blend — Indigo', qty: '85 m', rate: 410, amt: 34850, hsn: '5407' },
              { name: 'Tailoring service', qty: '18 hr', rate: 2080, amt: 37414, hsn: '9988' },
            ].map((it, i, arr) => (
              <div key={i} style={{ padding: 14, borderBottom: i < arr.length - 1 ? '0.5px solid rgba(20,18,16,0.06)' : 'none' }}>
                <Row justify="space-between">
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#1A1714' }}>{it.name}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1A1714', fontVariantNumeric: 'tabular-nums' }}>{formatINR(it.amt)}</span>
                </Row>
                <div style={{ fontSize: 11, color: '#9C9489', marginTop: 2 }}>{it.qty} · ₹{it.rate}/u · HSN {it.hsn}</div>
              </div>
            ))}
            <div style={{ padding: 14, background: '#FAF8F4' }}>
              {[['Subtotal', subtotal], ['CGST 9%', inv.gst / 2], ['SGST 9%', inv.gst / 2]].map(([k, v]) => (
                <Row justify="space-between" key={k} style={{ marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: '#7B7468' }}>{k}</span>
                  <span style={{ fontSize: 12, color: '#3F3A33', fontVariantNumeric: 'tabular-nums' }}>{formatINR(v)}</span>
                </Row>
              ))}
              <div style={{ borderTop: '0.5px solid rgba(20,18,16,0.1)', marginTop: 6, paddingTop: 6 }}>
                <Row justify="space-between">
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1A1714' }}>Total</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#1A1714', fontVariantNumeric: 'tabular-nums' }}>{formatINR(inv.amount)}</span>
                </Row>
              </div>
            </div>
          </Card>
        </div>

        {/* sticky CTA bar */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 34, padding: '10px 16px', background: 'linear-gradient(180deg, rgba(247,245,241,0) 0%, #F7F5F1 30%)' }}>
          <Row gap={8}>
            <button style={{ ...secondaryBtn, flex: 1 }}>
              <I.wa size={16} color="#16A34A"/> WhatsApp
            </button>
            <button style={{ ...primaryBtn, flex: 1.4 }}>Record payment</button>
          </Row>
        </div>
      </Col>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // BILLS (AP)
  // ════════════════════════════════════════════════════════════════════════
  function Bills({ tweaks, nav }) {
    const [tab, setTab] = React.useState('all');
    const tabs = [
      { id: 'all', label: 'All' },
      { id: 'pending', label: 'Pending', count: D.bills.filter(b => b.status === 'pending_match').length },
      { id: 'approved', label: 'Approved', count: D.bills.filter(b => b.status === 'approved').length },
      { id: 'paid', label: 'Paid' },
    ];
    const filtered = D.bills.filter(b =>
      tab === 'all' ? true :
      tab === 'pending' ? b.status === 'pending_match' :
      tab === 'approved' ? b.status === 'approved' :
      b.status === 'paid'
    );

    return (
      <Col style={{ paddingBottom: 100 }}>
        <ScreenHeader
          title="Bills"
          subtitle={`${filtered.length} bills · ${formatINR(filtered.reduce((s,b)=>s+b.amount, 0))}`}
          right={<button onClick={() => nav.go('billScan')} style={{
            ...primaryBtn, padding: '8px 12px', fontSize: 13, gap: 6,
          }}><I.camera size={16} color="#fff"/> Scan</button>}
        />
        <div style={{ display: 'flex', gap: 8, padding: '4px 16px 12px', overflowX: 'auto' }} className="scrollbar-hide">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '7px 12px', borderRadius: 999, border: 0, cursor: 'pointer',
              background: tab === t.id ? '#1A1714' : '#F0EDE8',
              color: tab === t.id ? '#fff' : '#3F3A33',
              fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>{t.label}{t.count != null && <span style={{ background: tab === t.id ? 'rgba(255,255,255,0.2)' : 'rgba(20,18,16,0.08)', padding: '1px 6px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>{t.count}</span>}</button>
          ))}
        </div>

        <div style={{ padding: '0 16px' }}>
          <Card padded={false}>
            {filtered.map((b, i, arr) => {
              const v = D.byId.vendor(b.vendorId);
              return (
                <div key={b.id} style={{ padding: 14, borderBottom: i < arr.length - 1 ? '0.5px solid rgba(20,18,16,0.06)' : 'none' }}>
                  <Row align="flex-start" gap={12}>
                    <Avatar short={v.short} name={v.name} size={40} square/>
                    <Col style={{ flex: 1, minWidth: 0 }} gap={3}>
                      <Row justify="space-between" gap={8}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#1A1714', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.name}</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#1A1714', fontVariantNumeric: 'tabular-nums' }}>{formatINR(b.amount)}</span>
                      </Row>
                      <Row gap={6} wrap>
                        <span style={{ fontSize: 12, color: '#7B7468' }}>{b.id} · {dueLabel(b.due)}</span>
                      </Row>
                      <Row gap={6} wrap style={{ marginTop: 2 }}>
                        <StatusPill status={b.status} dense/>
                        {b.has3wm === 'matched' && <StatusPill status="matched" dense/>}
                        {b.ai && (
                          <span style={{ background: '#F3E8FF', color: '#5B21B6', padding: '2px 6px', borderRadius: 6, fontSize: 10, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <Sparkle size={10} color="#5B21B6"/> AI extracted
                          </span>
                        )}
                      </Row>
                    </Col>
                  </Row>
                </div>
              );
            })}
          </Card>
        </div>
      </Col>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // BILL SCAN — AI extraction screen
  // ════════════════════════════════════════════════════════════════════════
  function BillScan({ nav }) {
    const [step, setStep] = React.useState(0); // 0 capture, 1 processing, 2 review
    React.useEffect(() => {
      if (step === 1) {
        const t = setTimeout(() => setStep(2), 1800);
        return () => clearTimeout(t);
      }
    }, [step]);

    return (
      <Col style={{ paddingBottom: 110, background: step === 0 ? '#0A0907' : '#F7F5F1', minHeight: '100%' }}>
        <Row style={{ padding: '12px 12px 4px' }} justify="space-between">
          <button onClick={() => nav.back()} style={{ ...iconBtn, background: step === 0 ? 'rgba(255,255,255,0.16)' : '#fff' }}>
            <I.x size={20} color={step === 0 ? '#fff' : '#1A1714'}/>
          </button>
          <div style={{ color: step === 0 ? '#fff' : '#1A1714', fontSize: 14, fontWeight: 600 }}>
            {step === 0 ? 'Scan bill' : step === 1 ? 'Reading…' : 'Review extracted data'}
          </div>
          <div style={{ width: 36 }}/>
        </Row>

        {step === 0 && (
          <Col style={{ paddingTop: 60, alignItems: 'center', color: '#fff' }}>
            <div style={{ width: 280, height: 380, border: '2px dashed rgba(255,255,255,0.4)', borderRadius: 18, position: 'relative', overflow: 'hidden', background: 'rgba(255,255,255,0.04)' }}>
              {/* mock paper */}
              <div style={{ position: 'absolute', top: 30, left: 24, right: 24, bottom: 30, background: '#fafaf7', borderRadius: 6, padding: 14, color: '#1A1714', fontSize: 9, lineHeight: 1.4, transform: 'rotate(-1.5deg)' }}>
                <div style={{ fontSize: 11, fontWeight: 700 }}>BHARAT STEEL CO.</div>
                <div style={{ color: '#7B7468' }}>GSTIN 07AABCB1212X1Z1</div>
                <div style={{ marginTop: 10, fontWeight: 700 }}>TAX INVOICE</div>
                <div style={{ marginTop: 4 }}>Inv: BS/2026/4421</div>
                <div>Date: 27-Apr-2026</div>
                <div style={{ marginTop: 12, borderTop: '1px solid #ccc', paddingTop: 6 }}>
                  <div>MS Sheet 4mm × 8 sheets · ₹4,98,000</div>
                  <div>GI Sheet 1.5mm × 12 · ₹89,200</div>
                </div>
                <div style={{ marginTop: 14, fontWeight: 700 }}>Total ₹5,87,200</div>
              </div>
              {/* scanning corners */}
              {[[8,8],[8,372],[252,8],[252,372]].map(([x,y], i) => (
                <div key={i} style={{ position: 'absolute', left: x, top: y, width: 22, height: 22, borderTop: y===8 ? '3px solid #4F46E5' : 0, borderBottom: y!==8 ? '3px solid #4F46E5' : 0, borderLeft: x===8 ? '3px solid #4F46E5' : 0, borderRight: x!==8 ? '3px solid #4F46E5' : 0, borderRadius: 4 }}/>
              ))}
            </div>
            <div style={{ marginTop: 28, textAlign: 'center', padding: '0 32px' }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Position the bill in the frame</div>
              <div style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>Auto-capture when steady</div>
            </div>
            <Row gap={20} style={{ marginTop: 36 }}>
              <button style={{ ...iconBtn, width: 56, height: 56, background: 'rgba(255,255,255,0.16)' }}>
                <I.upload size={22} color="#fff"/>
              </button>
              <button onClick={() => setStep(1)} style={{
                width: 72, height: 72, borderRadius: '50%',
                border: '4px solid #fff',
                background: '#4F46E5', cursor: 'pointer',
                boxShadow: '0 0 0 4px rgba(79,70,229,0.25)',
              }}/>
              <button style={{ ...iconBtn, width: 56, height: 56, background: 'rgba(255,255,255,0.16)' }}>
                <I.flash size={22} color="#fff"/>
              </button>
            </Row>
          </Col>
        )}

        {step === 1 && (
          <Col style={{ paddingTop: 80, alignItems: 'center', gap: 24 }}>
            <div style={{ width: 88, height: 88, borderRadius: '50%', background: 'linear-gradient(135deg,#4F46E5,#7C3AED)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              <div style={{ position: 'absolute', inset: -8, borderRadius: '50%', border: '3px solid #4F46E5', opacity: 0.25, animation: 'rqPulse 1.4s ease-in-out infinite' }}/>
              <Sparkle size={36} color="#fff"/>
            </div>
            <Col gap={2} style={{ alignItems: 'center', padding: '0 32px', textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 600, color: '#1A1714' }}>AI is reading your bill</div>
              <div style={{ fontSize: 13, color: '#7B7468' }}>Extracting vendor, items, GST and TDS…</div>
            </Col>
            <Col gap={10} style={{ width: '100%', padding: '0 32px', marginTop: 8 }}>
              {['Detecting layout', 'Reading vendor & GSTIN', 'Parsing line items', 'Calculating tax'].map((s, i) => (
                <Row key={s} gap={10}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', background: i < 3 ? '#16A34A' : '#F0EDE8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {i < 3 ? <I.check size={12} color="#fff" strokeWidth={3}/> : <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#9C9489', animation: 'rqPulse 0.9s ease-in-out infinite' }}/>}
                  </div>
                  <span style={{ fontSize: 13, color: i < 3 ? '#1A1714' : '#7B7468' }}>{s}</span>
                </Row>
              ))}
            </Col>
          </Col>
        )}

        {step === 2 && (
          <Col style={{ paddingTop: 8 }}>
            <div style={{ padding: '0 16px' }}>
              <Row gap={6} style={{ background: '#F3E8FF', padding: '10px 12px', borderRadius: 12 }}>
                <Sparkle size={14} color="#5B21B6"/>
                <span style={{ fontSize: 12, color: '#5B21B6', fontWeight: 500 }}>Extracted with 96% confidence · review and confirm</span>
              </Row>
            </div>

            <div style={{ padding: '12px 16px 0' }}>
              <Card>
                <Col gap={12}>
                  {[
                    { k: 'Vendor', v: 'Bharat Steel Co.', sub: 'Auto-matched · GSTIN 07AABCB1212X1Z1', ai: true },
                    { k: 'Bill number', v: 'BS/2026/4421', ai: true },
                    { k: 'Bill date', v: '27 Apr 2026', ai: true },
                    { k: 'Due date', v: '12 May 2026 · Net 15', ai: false },
                  ].map((f, i) => (
                    <div key={i} style={{ borderBottom: i < 3 ? '0.5px solid rgba(20,18,16,0.06)' : 'none', paddingBottom: i < 3 ? 12 : 0 }}>
                      <Row justify="space-between" align="flex-start">
                        <Col>
                          <span style={{ fontSize: 11, color: '#9C9489', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{f.k}</span>
                          <span style={{ fontSize: 14, color: '#1A1714', fontWeight: 500, marginTop: 2 }}>{f.v}</span>
                          {f.sub && <span style={{ fontSize: 11, color: '#7B7468', marginTop: 1 }}>{f.sub}</span>}
                        </Col>
                        {f.ai && <Sparkle size={12}/>}
                      </Row>
                    </div>
                  ))}
                </Col>
              </Card>
            </div>

            <div style={{ padding: '12px 16px 0' }}>
              <SectionHead title="Line items · 2"/>
              <Card padded={false}>
                {[
                  { name: 'MS Sheet 4mm', qty: '8 sheet', rate: 62250, amt: 498000 },
                  { name: 'GI Sheet 1.5mm', qty: '12 sheet', rate: 7434, amt: 89200 },
                ].map((it, i, arr) => (
                  <div key={i} style={{ padding: 14, borderBottom: i < arr.length - 1 ? '0.5px solid rgba(20,18,16,0.06)' : 'none' }}>
                    <Row justify="space-between">
                      <Col>
                        <span style={{ fontSize: 13, fontWeight: 500, color: '#1A1714' }}>{it.name}</span>
                        <span style={{ fontSize: 11, color: '#9C9489', marginTop: 2 }}>{it.qty} · ₹{it.rate.toLocaleString('en-IN')}/u</span>
                      </Col>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#1A1714', fontVariantNumeric: 'tabular-nums' }}>{formatINR(it.amt)}</span>
                    </Row>
                  </div>
                ))}
                <div style={{ padding: 14, background: '#FAF8F4' }}>
                  <Row justify="space-between" style={{ marginBottom: 4 }}><span style={{ fontSize: 12, color: '#7B7468' }}>Subtotal</span><span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{formatINR(497624)}</span></Row>
                  <Row justify="space-between" style={{ marginBottom: 4 }}><span style={{ fontSize: 12, color: '#7B7468' }}>IGST 18%</span><span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{formatINR(89576)}</span></Row>
                  <Row justify="space-between" style={{ borderTop: '0.5px solid rgba(20,18,16,0.1)', paddingTop: 6, marginTop: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Total</span>
                    <span style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatINR(587200)}</span>
                  </Row>
                </div>
              </Card>
            </div>

            <div style={{ padding: '12px 16px 0' }}>
              <Card style={{ background: '#EAF1FB', border: '0.5px solid rgba(31,77,168,0.2)' }}>
                <Row gap={10}>
                  <I.link size={20} color="#1F4DA8"/>
                  <Col style={{ flex: 1 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#1F4DA8' }}>Auto-matched to PO/2026/0341</span>
                    <span style={{ fontSize: 11, color: '#1F4DA8', opacity: 0.8, marginTop: 1 }}>3-way match passed · qty + price within 0.4% tolerance</span>
                  </Col>
                </Row>
              </Card>
            </div>

            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 34, padding: '10px 16px', background: 'linear-gradient(180deg, rgba(247,245,241,0) 0%, #F7F5F1 30%)' }}>
              <Row gap={8}>
                <button style={{ ...secondaryBtn, flex: 1 }}>Save draft</button>
                <button onClick={() => nav.go('bills')} style={{ ...primaryBtn, flex: 1.4 }}>Approve & file</button>
              </Row>
            </div>
          </Col>
        )}
      </Col>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // BANKING
  // ════════════════════════════════════════════════════════════════════════
  function Banking({ nav }) {
    const total = D.banks.reduce((s, b) => s + b.balance, 0);
    const uncatTotal = D.banks.reduce((s, b) => s + b.uncategorized, 0);

    return (
      <Col style={{ paddingBottom: 100 }}>
        <ScreenHeader title="Banking" subtitle={`${D.banks.length} accounts · ${formatINR(total)}`}
          right={<button style={iconBtn}><I.refresh size={20} color="#605A52"/></button>}/>

        {/* account cards (carousel) */}
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '4px 16px 16px', scrollSnapType: 'x mandatory' }} className="scrollbar-hide">
          {D.banks.map(b => (
            <div key={b.id} style={{
              flex: '0 0 240px', scrollSnapAlign: 'start',
              background: '#fff', borderRadius: 14, padding: 14,
              border: '0.5px solid rgba(20,18,16,0.08)',
              boxShadow: '0 1px 3px rgba(20,18,16,0.04)',
            }}>
              <Row justify="space-between" align="flex-start">
                <div style={{ width: 32, height: 32, borderRadius: 8, background: b.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, letterSpacing: '0.02em' }}>{b.short}</div>
                {b.uncategorized > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 6, background: '#FFF6E0', color: '#8A5A00' }}>{b.uncategorized} to match</span>
                )}
              </Row>
              <div style={{ fontSize: 11, color: '#9C9489', marginTop: 12, fontWeight: 500 }}>{b.bank}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#1A1714', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{formatINR(b.balance)}</div>
              <div style={{ fontSize: 11, color: '#7B7468', marginTop: 2 }}>{b.acct} · {b.type}</div>
            </div>
          ))}
        </div>

        {/* reconciliation banner */}
        {uncatTotal > 0 && (
          <div style={{ padding: '0 16px 12px' }}>
            <Card style={{ background: 'linear-gradient(120deg,#EEF1FE,#F3E8FF)', border: '0.5px solid rgba(99,102,241,0.2)' }}>
              <Row justify="space-between" align="center">
                <Col gap={2}>
                  <Row gap={6}>
                    <Sparkle size={14}/>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#5B21B6', textTransform: 'uppercase', letterSpacing: '0.04em' }}>AI ready</span>
                  </Row>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#1A1714' }}>{uncatTotal} transactions to reconcile</span>
                  <span style={{ fontSize: 12, color: '#5B21B6' }}>9 already auto-matched · review & approve</span>
                </Col>
                <I.chev size={20} color="#5B21B6"/>
              </Row>
            </Card>
          </div>
        )}

        <SectionHead title="Recent · ICICI 4421"/>

        <div style={{ padding: '0 16px' }}>
          <Card padded={false}>
            {D.bankTxns.map((t, i, arr) => (
              <div key={t.id} style={{ padding: 14, borderBottom: i < arr.length - 1 ? '0.5px solid rgba(20,18,16,0.06)' : 'none' }}>
                <Row align="flex-start" gap={12}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: t.dir === 'in' ? '#ECFDF5' : '#FCEAEA', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {t.dir === 'in' ? <I.arrowDn size={16} color="#16A34A"/> : <I.arrowUp size={16} color="#B42318"/>}
                  </div>
                  <Col style={{ flex: 1, minWidth: 0 }} gap={2}>
                    <Row justify="space-between" gap={8}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#1A1714', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>
                        {t.matchedTo || t.suggested || 'Uncategorized'}
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: t.dir === 'in' ? '#16A34A' : '#1A1714', fontVariantNumeric: 'tabular-nums' }}>
                        {t.dir === 'in' ? '+' : '−'}{formatINR(Math.abs(t.amount), { currency: true })}
                      </span>
                    </Row>
                    <span style={{ fontSize: 11, color: '#9C9489', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.narration}</span>
                    <Row gap={6} style={{ marginTop: 3 }}>
                      {t.matchedTo ? (
                        <Row gap={4} style={{ background: '#ECFDF5', padding: '2px 6px', borderRadius: 6 }}>
                          <I.check size={11} color="#047857" strokeWidth={2.5}/>
                          <span style={{ fontSize: 10, color: '#047857', fontWeight: 600 }}>Matched · {Math.round(t.confidence * 100)}%</span>
                        </Row>
                      ) : (
                        <Row gap={4} style={{ background: '#F3E8FF', padding: '2px 6px', borderRadius: 6 }}>
                          <Sparkle size={10} color="#5B21B6"/>
                          <span style={{ fontSize: 10, color: '#5B21B6', fontWeight: 600 }}>AI suggests · tap to confirm</span>
                        </Row>
                      )}
                    </Row>
                  </Col>
                </Row>
              </div>
            ))}
          </Card>
        </div>
      </Col>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // APPROVALS
  // ════════════════════════════════════════════════════════════════════════
  function Approvals({ nav }) {
    const [done, setDone] = React.useState({});
    const total = D.approvals.reduce((s, a) => s + a.amount, 0);

    return (
      <Col style={{ paddingBottom: 100 }}>
        <ScreenHeader title="Approvals" subtitle={`${D.approvals.length} pending · ${formatINR(total)}`}
          right={<button style={iconBtn}><I.filter size={20} color="#605A52"/></button>}/>

        <div style={{ padding: '0 16px 14px' }}>
          {D.approvals.map(a => {
            const isDone = done[a.id];
            return (
              <Card key={a.id} style={{ marginBottom: 10, opacity: isDone ? 0.5 : 1, transition: 'opacity 0.3s' }}>
                <Row justify="space-between" align="flex-start">
                  <Col gap={4} style={{ flex: 1, minWidth: 0 }}>
                    <Row gap={6}>
                      {a.urgent && <span style={{ background: '#FCEAEA', color: '#B42318', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 6, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Urgent</span>}
                      <span style={{ fontSize: 11, color: '#9C9489', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {a.kind === 'bill' ? 'Bill approval' : a.kind === 'payment' ? 'Pay run' : 'Invoice approval'}
                      </span>
                    </Row>
                    <span style={{ fontSize: 15, fontWeight: 600, color: '#1A1714' }}>{a.who}</span>
                    <span style={{ fontSize: 12, color: '#7B7468' }}>{a.ref}</span>
                    <Row gap={6} style={{ marginTop: 3, fontSize: 11, color: '#9C9489' }}>
                      <I.user size={12} color="#9C9489"/>
                      <span>by {a.requestedBy} · {fromNow(a.requestedAt)}</span>
                    </Row>
                  </Col>
                  <span style={{ fontSize: 18, fontWeight: 700, color: '#1A1714', fontVariantNumeric: 'tabular-nums' }}>{formatINR(a.amount, { compact: true })}</span>
                </Row>
                {!isDone && (
                  <Row gap={8} style={{ marginTop: 12 }}>
                    <button onClick={() => setDone(d => ({ ...d, [a.id]: 'rejected' }))} style={{ ...secondaryBtn, flex: 1, padding: '8px 12px', fontSize: 13 }}>
                      <I.x size={14} color="#605A52"/> Decline
                    </button>
                    <button onClick={() => setDone(d => ({ ...d, [a.id]: 'approved' }))} style={{ ...primaryBtn, flex: 1.4, padding: '8px 12px', fontSize: 13 }}>
                      <I.check size={14} color="#fff" strokeWidth={2.5}/> Approve
                    </button>
                  </Row>
                )}
                {isDone && (
                  <Row gap={6} style={{ marginTop: 10, fontSize: 12, color: isDone === 'approved' ? '#047857' : '#B42318', fontWeight: 600 }}>
                    {isDone === 'approved' ? <I.check size={14} color="#047857" strokeWidth={2.5}/> : <I.x size={14} color="#B42318"/>}
                    <span>{isDone === 'approved' ? 'Approved · sent to next step' : 'Declined'}</span>
                  </Row>
                )}
              </Card>
            );
          })}
        </div>
      </Col>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // AI AGENT (chat)
  // ════════════════════════════════════════════════════════════════════════
  function Agent({ nav }) {
    const [msgs, setMsgs] = React.useState([
      { from: 'ai', text: 'Hi Arjun — I have your books up to today, 28 April. What would you like to know?' },
      { from: 'ai', kind: 'suggestions', items: ['Show overdue invoices', 'Cash position next 30 days', 'Top 5 expenses this month'] },
    ]);
    const [draft, setDraft] = React.useState('');
    const send = (t) => {
      const text = (t || draft).trim();
      if (!text) return;
      setMsgs(m => [...m, { from: 'user', text }]);
      setDraft('');
      setTimeout(() => {
        setMsgs(m => [...m, {
          from: 'ai', kind: 'card', title: 'Cash position · next 30 days',
          body: 'Based on bills due, scheduled receipts and your pay-run cadence:',
          metric: '₹47.2L', delta: '−₹16.6L vs today',
          chart: [63, 61, 60, 58, 55, 53, 52, 51, 49, 48, 47.2],
          actions: ['View forecast', 'Adjust pay run'],
        }]);
      }, 600);
    };

    return (
      <Col style={{ height: '100%' }}>
        <Row style={{ padding: '12px 16px', borderBottom: '0.5px solid rgba(20,18,16,0.06)' }} justify="space-between">
          <Col>
            <Row gap={8}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg,#4F46E5,#7C3AED)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Sparkle size={16} color="#fff"/>
              </div>
              <Col>
                <span style={{ fontSize: 15, fontWeight: 600, color: '#1A1714' }}>runQ Agent</span>
                <span style={{ fontSize: 11, color: '#16A34A' }}>● Up to date · 28 Apr</span>
              </Col>
            </Row>
          </Col>
          <button style={iconBtn}><I.moreH size={20} color="#605A52"/></button>
        </Row>

        <Col gap={12} style={{ flex: 1, overflow: 'auto', padding: '16px 16px 80px' }}>
          {msgs.map((m, i) => {
            if (m.from === 'user') {
              return (
                <div key={i} style={{ alignSelf: 'flex-end', maxWidth: '78%', background: '#1A1714', color: '#fff', padding: '10px 14px', borderRadius: 16, borderBottomRightRadius: 4, fontSize: 14 }}>{m.text}</div>
              );
            }
            if (m.kind === 'suggestions') {
              return (
                <Col key={i} gap={6} style={{ marginTop: 4 }}>
                  {m.items.map(s => (
                    <button key={s} onClick={() => send(s)} style={{
                      alignSelf: 'flex-start', maxWidth: '88%',
                      background: '#fff', border: '0.5px solid rgba(79,70,229,0.3)',
                      color: '#4F46E5', padding: '8px 14px', borderRadius: 16,
                      fontSize: 13, fontWeight: 500, cursor: 'pointer', textAlign: 'left',
                    }}>{s}</button>
                  ))}
                </Col>
              );
            }
            if (m.kind === 'card') {
              return (
                <div key={i} style={{ alignSelf: 'flex-start', maxWidth: '90%' }}>
                  <div style={{ fontSize: 14, color: '#1A1714', marginBottom: 8, padding: '0 4px' }}>{m.body}</div>
                  <Card>
                    <span style={{ fontSize: 11, color: '#9C9489', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{m.title}</span>
                    <Row align="flex-end" gap={8} style={{ marginTop: 4 }}>
                      <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', color: '#1A1714', fontVariantNumeric: 'tabular-nums' }}>{m.metric}</span>
                      <span style={{ fontSize: 12, color: '#B42318', fontWeight: 600, paddingBottom: 6 }}>{m.delta}</span>
                    </Row>
                    <div style={{ marginTop: 6, marginLeft: -4 }}>
                      <Sparkline data={m.chart} w={280} h={50} stroke="#4F46E5" fill="#EEF1FE"/>
                    </div>
                    <Row gap={8} style={{ marginTop: 10 }}>
                      {m.actions.map(a => (
                        <button key={a} style={{ ...secondaryBtn, padding: '6px 12px', fontSize: 12, flex: 1 }}>{a}</button>
                      ))}
                    </Row>
                  </Card>
                </div>
              );
            }
            return (
              <Row key={i} align="flex-start" gap={8}>
                <div style={{ width: 26, height: 26, borderRadius: 7, background: 'linear-gradient(135deg,#4F46E5,#7C3AED)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Sparkle size={13} color="#fff"/>
                </div>
                <div style={{ background: '#fff', padding: '10px 14px', borderRadius: 16, borderBottomLeftRadius: 4, fontSize: 14, color: '#1A1714', border: '0.5px solid rgba(20,18,16,0.06)' }}>{m.text}</div>
              </Row>
            );
          })}
        </Col>

        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 34, padding: '10px 16px', background: '#F7F5F1' }}>
          <Row gap={8} style={{ background: '#fff', borderRadius: 22, padding: '4px 4px 4px 16px', border: '0.5px solid rgba(20,18,16,0.1)' }}>
            <input
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              placeholder="Ask about your finances…"
              style={{ flex: 1, border: 0, outline: 'none', background: 'none', fontSize: 14, color: '#1A1714' }}
            />
            <button onClick={() => send()} style={{
              width: 36, height: 36, borderRadius: '50%', border: 0,
              background: draft.trim() ? '#4F46E5' : '#E8E4DD',
              cursor: draft.trim() ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <I.arrowUp size={18} color="#fff" strokeWidth={2.5}/>
            </button>
          </Row>
        </div>
      </Col>
    );
  }

  // ── shared button styles ────────────────────────────────────────────────
  const iconBtn = {
    width: 36, height: 36, borderRadius: 10, border: 0,
    background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', position: 'relative',
    boxShadow: '0 1px 0 rgba(20,18,16,0.04), 0 1px 3px rgba(20,18,16,0.05)',
  };
  const dot = { position: 'absolute', top: 7, right: 8, width: 7, height: 7, borderRadius: '50%', background: '#EF4444', border: '1.5px solid #fff' };
  const primaryBtn = {
    background: '#1A1714', color: '#fff', border: 0, padding: '12px 18px',
    borderRadius: 12, fontWeight: 600, fontSize: 14, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  };
  const secondaryBtn = {
    background: '#fff', color: '#3F3A33', border: '0.5px solid rgba(20,18,16,0.12)',
    padding: '12px 18px', borderRadius: 12, fontWeight: 600, fontSize: 14, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  };
  const miniStat = {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
    padding: '12px 16px', background: 'transparent', border: 0, color: '#fff', cursor: 'pointer', textAlign: 'left',
  };

  return { Dashboard, Invoices, InvoiceDetail, Bills, BillScan, Banking, Approvals, Agent };
})();
