// Main app: shell + dashboard composition + tweaks
const { useState, useEffect, useMemo } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "density": "balanced",
  "sidebarStyle": "grouped",
  "accent": "indigo",
  "layoutPreset": "owner",
  "showCashflow": true,
  "showAgent": true,
  "showApprovals": true,
  "showGst": true,
  "showAging": true,
  "showClose": true
}/*EDITMODE-END*/;

const ACCENTS = {
  indigo: { light: "oklch(0.55 0.2 268)", dark: "oklch(0.72 0.18 268)", soft: "oklch(0.96 0.03 268)", softDark: "oklch(0.28 0.06 268)", text: "oklch(0.45 0.18 268)", textDark: "oklch(0.78 0.16 268)" },
  emerald: { light: "oklch(0.55 0.15 160)", dark: "oklch(0.7 0.16 160)", soft: "oklch(0.95 0.04 160)", softDark: "oklch(0.28 0.06 160)", text: "oklch(0.45 0.14 160)", textDark: "oklch(0.78 0.14 160)" },
  violet: { light: "oklch(0.55 0.22 305)", dark: "oklch(0.72 0.18 305)", soft: "oklch(0.96 0.04 305)", softDark: "oklch(0.3 0.07 305)", text: "oklch(0.48 0.2 305)", textDark: "oklch(0.78 0.16 305)" },
  rose: { light: "oklch(0.6 0.2 12)", dark: "oklch(0.72 0.18 12)", soft: "oklch(0.96 0.04 12)", softDark: "oklch(0.3 0.07 12)", text: "oklch(0.5 0.18 12)", textDark: "oklch(0.78 0.16 12)" },
};

// Route metadata: nav key → page header info + content renderer
const ROUTES = {
  dashboard:   { icon: "layout-dashboard", title: "Dashboard" },
  invoices:    { icon: "file-text",        title: "Invoices" },
  quotes:      { icon: "clipboard-list",   title: "Quotes & sales orders" },
  creditnotes: { icon: "file-minus",       title: "Credit notes" },
  receipts:    { icon: "receipt",          title: "Receipts" },
  customers:   { icon: "users",            title: "Customers" },
  collections: { icon: "alarm-clock",      title: "Collections" },
  dunning:     { icon: "bell",             title: "Dunning" },
  help:        { icon: "life-buoy",        title: "Help & docs" },
};

function App() {
  const [tweaks, setTweak] = window.useTweaks(TWEAK_DEFAULTS);
  const [active, setActive] = useState("dashboard");
  // Sub-route state: customer/invoice detail
  const [detail, setDetail] = useState(null); // { type: "customer"|"invoice", id: "..." }
  const [collapsed, setCollapsed] = useState(false);
  const [cmdkOpen, setCmdkOpen] = useState(false);

  const navigate = (key) => { setActive(key); setDetail(null); };

  // theme
  useEffect(() => {
    document.documentElement.classList.toggle("dark", tweaks.theme === "dark");
  }, [tweaks.theme]);

  // accent
  useEffect(() => {
    const a = ACCENTS[tweaks.accent] || ACCENTS.indigo;
    const isDark = tweaks.theme === "dark";
    const r = document.documentElement.style;
    r.setProperty("--accent", isDark ? a.dark : a.light);
    r.setProperty("--accent-soft", isDark ? a.softDark : a.soft);
    r.setProperty("--accent-text", isDark ? a.textDark : a.text);
  }, [tweaks.accent, tweaks.theme]);

  // ⌘K shortcut
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdkOpen((v) => !v);
      } else if (e.key === "Escape") {
        setCmdkOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const sidebarCollapsed = tweaks.sidebarStyle === "rail" ? true : collapsed;
  const densityClass = `density-${tweaks.density}`;

  return (
    <div className={`flex h-screen w-screen overflow-hidden ${densityClass}`}>
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setCollapsed(!collapsed)}
        active={active}
        onNavigate={navigate}
        theme={tweaks.theme}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar
          theme={tweaks.theme}
          onToggleTheme={() => setTweak("theme", tweaks.theme === "dark" ? "light" : "dark")}
          onOpenCmdk={() => setCmdkOpen(true)}
          onOpenAgent={() => setCmdkOpen(true)}
          page={{ icon: ROUTES[active]?.icon || "circle", crumb: RUNQ.COMPANY.name, title: ROUTES[active]?.title || "—" }}
          notifs={RUNQ.NOTIFICATIONS}
        />
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <RouterView active={active} detail={detail} setDetail={setDetail} tweaks={tweaks} />
        </main>
      </div>
      <CommandPalette open={cmdkOpen} onClose={() => setCmdkOpen(false)} />
      <TweaksUI tweaks={tweaks} setTweak={setTweak} />
    </div>
  );
}

function RouterView({ active, detail, setDetail, tweaks }) {
  const pad = tweaks.density === "comfortable" ? "p-7" : tweaks.density === "dense" ? "p-4" : "p-6";

  if (active === "dashboard") return <Dashboard tweaks={tweaks} />;

  // Detail views
  if (detail?.type === "customer") {
    return <div className={`max-w-[1400px] mx-auto ${pad}`}><CustomerDetail customerId={detail.id} onBack={() => setDetail(null)} /></div>;
  }
  if (detail?.type === "invoice") {
    return <div className={`max-w-[1400px] mx-auto ${pad}`}><InvoiceDetail invoiceId={detail.id} onBack={() => setDetail(null)} /></div>;
  }

  let content = null;
  if (active === "customers")        content = <CustomerList onView={(id) => setDetail({ type: "customer", id })} />;
  else if (active === "invoices")    content = <InvoiceList onView={(id) => setDetail({ type: "invoice", id })} />;
  else if (active === "quotes")      content = <QuotesSOsPage />;
  else if (active === "creditnotes") content = <CreditNotesPage />;
  else if (active === "receipts")    content = <ReceiptsPage />;
  else if (active === "collections") content = <CollectionsPage />;
  else if (active === "dunning")     content = <DunningPage />;
  else if (active === "help")        content = <HelpRoot />;
  else content = <ComingSoon route={active} />;

  return <div className={`max-w-[1400px] mx-auto ${pad}`}>{content}</div>;
}

function ComingSoon({ route }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="h-14 w-14 rounded-full surface-2 border border-app flex items-center justify-center text-3 mb-4">
        <Icon name="construction" size={22} />
      </div>
      <h2 className="text-[18px] font-semibold text-1">{route} — coming soon</h2>
      <p className="text-[13px] text-3 mt-1.5 max-w-md">This module is on the roadmap. The AR module (Customers, Invoices, Quotes, Credit notes, Receipts, Collections, Dunning) is fully designed — switch to one of those from the sidebar.</p>
    </div>
  );
}

function Dashboard({ tweaks }) {
  const preset = tweaks.layoutPreset;
  const gap = tweaks.density === "comfortable" ? "gap-6" : tweaks.density === "dense" ? "gap-3" : "gap-5";
  const pad = tweaks.density === "comfortable" ? "p-7" : tweaks.density === "dense" ? "p-4" : "p-6";

  return (
    <div className={`max-w-[1400px] mx-auto ${pad} space-y-5`}>
      <DashboardHero />

      <KpiStrip />

      {/* Owner preset: cashflow + agent side by side, then approvals/aging, then GST + close */}
      {preset === "owner" && (
        <>
          <div className={`grid grid-cols-1 xl:grid-cols-3 ${gap} items-stretch`}>
            {tweaks.showCashflow && <div className="xl:col-span-2"><CashflowChart /></div>}
            {tweaks.showAgent && <AgentFeed />}
          </div>
          <div className={`grid grid-cols-1 lg:grid-cols-3 ${gap}`}>
            {tweaks.showApprovals && <div className="lg:col-span-2"><Approvals /></div>}
            <QuickActions />
          </div>
          {tweaks.showAging && <AgingPanel />}
          <div className={`grid grid-cols-1 lg:grid-cols-2 ${gap}`}>
            {tweaks.showGst && <GstReadiness />}
            {tweaks.showClose && <CloseChecklist />}
          </div>
          <RecentDocs />
        </>
      )}

      {/* Accountant preset: approvals first, then aging, close, GST */}
      {preset === "accountant" && (
        <>
          <div className={`grid grid-cols-1 lg:grid-cols-3 ${gap}`}>
            {tweaks.showApprovals && <div className="lg:col-span-2"><Approvals /></div>}
            <QuickActions />
          </div>
          {tweaks.showAging && <AgingPanel />}
          <div className={`grid grid-cols-1 lg:grid-cols-2 ${gap} items-stretch`}>
            {tweaks.showClose && <CloseChecklist />}
            {tweaks.showAgent && <AgentFeed />}
          </div>
          {tweaks.showCashflow && <CashflowChart />}
          {tweaks.showGst && <GstReadiness />}
          <RecentDocs />
        </>
      )}

      {/* CA preset: GST + close + aging dominant */}
      {preset === "ca" && (
        <>
          <div className={`grid grid-cols-1 lg:grid-cols-2 ${gap}`}>
            {tweaks.showGst && <GstReadiness />}
            {tweaks.showClose && <CloseChecklist />}
          </div>
          {tweaks.showAging && <AgingPanel />}
          <div className={`grid grid-cols-1 xl:grid-cols-3 ${gap} items-stretch`}>
            {tweaks.showCashflow && <div className="xl:col-span-2"><CashflowChart /></div>}
            {tweaks.showAgent && <AgentFeed />}
          </div>
          <div className={`grid grid-cols-1 lg:grid-cols-3 ${gap}`}>
            {tweaks.showApprovals && <div className="lg:col-span-2"><Approvals /></div>}
            <QuickActions />
          </div>
          <RecentDocs />
        </>
      )}
    </div>
  );
}

function TweaksUI({ tweaks, setTweak }) {
  const T = window.TweaksPanel;
  const Section = window.TweakSection;
  const Radio = window.TweakRadio;
  const Toggle = window.TweakToggle;
  if (!T) return null;
  return (
    <T title="Tweaks">
      <Section title="Theme">
        <Radio value={tweaks.theme} onChange={(v) => setTweak("theme", v)} options={[
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
        ]} />
      </Section>
      <Section title="Accent">
        <Radio value={tweaks.accent} onChange={(v) => setTweak("accent", v)} options={[
          { value: "indigo", label: "Indigo" },
          { value: "emerald", label: "Emerald" },
          { value: "violet", label: "Violet" },
          { value: "rose", label: "Rose" },
        ]} />
      </Section>
      <Section title="Density">
        <Radio value={tweaks.density} onChange={(v) => setTweak("density", v)} options={[
          { value: "comfortable", label: "Comfy" },
          { value: "balanced", label: "Balanced" },
          { value: "dense", label: "Dense" },
        ]} />
      </Section>
      <Section title="Sidebar">
        <Radio value={tweaks.sidebarStyle} onChange={(v) => setTweak("sidebarStyle", v)} options={[
          { value: "grouped", label: "Grouped" },
          { value: "rail", label: "Icon rail" },
        ]} />
      </Section>
      <Section title="Layout preset">
        <Radio value={tweaks.layoutPreset} onChange={(v) => setTweak("layoutPreset", v)} options={[
          { value: "owner", label: "Owner" },
          { value: "accountant", label: "Accountant" },
          { value: "ca", label: "CA" },
        ]} />
      </Section>
      <Section title="Widgets">
        <Toggle label="Cash flow forecast" checked={tweaks.showCashflow} onChange={(v) => setTweak("showCashflow", v)} />
        <Toggle label="Agent activity" checked={tweaks.showAgent} onChange={(v) => setTweak("showAgent", v)} />
        <Toggle label="Approvals queue" checked={tweaks.showApprovals} onChange={(v) => setTweak("showApprovals", v)} />
        <Toggle label="GST readiness" checked={tweaks.showGst} onChange={(v) => setTweak("showGst", v)} />
        <Toggle label="Aging" checked={tweaks.showAging} onChange={(v) => setTweak("showAging", v)} />
        <Toggle label="Close checklist" checked={tweaks.showClose} onChange={(v) => setTweak("showClose", v)} />
      </Section>
    </T>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
