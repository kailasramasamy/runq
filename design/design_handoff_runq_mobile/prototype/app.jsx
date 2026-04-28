// app.jsx — runQ Mobile prototype shell
// Owns navigation state, bottom tab bar, FAB, and Tweaks integration.

const { useState, useRef, useEffect } = React;
const S = window.RunQScreens;
const { I, Sparkle } = window.RunQUI;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "primary": "#4F46E5",
  "accent": "#7C3AED",
  "density": "regular",
  "aiProminence": "moderate",
  "navStyle": "fab",
  "showTabLabels": true
}/*EDITMODE-END*/;

const TABS = [
  { id: 'dashboard', label: 'Home',     icon: I.home },
  { id: 'invoices',  label: 'Invoices', icon: I.receipt },
  { id: 'bills',     label: 'Bills',    icon: I.bill },
  { id: 'banking',   label: 'Banking',  icon: I.bank },
  { id: 'agent',     label: 'Agent',    icon: I.sparkle },
];

function App() {
  const [tweaks, setTweaks] = window.useTweaks(TWEAK_DEFAULTS);
  const [stack, setStack] = useState([{ screen: 'dashboard', params: {} }]);
  const [fabOpen, setFabOpen] = useState(false);

  const current = stack[stack.length - 1];
  const nav = {
    go: (screen, params = {}) => {
      setStack(s => [...s, { screen, params }]);
      setFabOpen(false);
    },
    set: (screen, params = {}) => setStack([{ screen, params }]),
    back: () => setStack(s => s.length > 1 ? s.slice(0, -1) : s),
  };

  // Keep "tab" in sync with stack root for highlighting
  const root = stack[0].screen;

  // Detail/modal screens hide the tab bar (standard mobile pattern).
  // Agent also hides it because it owns the bottom with its composer.
  const HIDE_TABS = new Set(['invoiceDetail', 'billScan', 'agent', 'approvals']);
  const showTabs = !HIDE_TABS.has(current.screen);

  const renderScreen = () => {
    const props = { tweaks, nav, ...current.params };
    switch (current.screen) {
      case 'dashboard':     return <S.Dashboard {...props}/>;
      case 'invoices':      return <S.Invoices {...props}/>;
      case 'invoiceDetail': return <S.InvoiceDetail {...props}/>;
      case 'bills':         return <S.Bills {...props}/>;
      case 'billScan':      return <S.BillScan {...props}/>;
      case 'banking':       return <S.Banking {...props}/>;
      case 'approvals':     return <S.Approvals {...props}/>;
      case 'agent':         return <S.Agent {...props}/>;
      default:              return <S.Dashboard {...props}/>;
    }
  };

  // The screen content area excludes the status bar (top 54px) but includes
  // the home indicator zone (bottom 34px). Tab bar floats above home indicator.
  const useFab = tweaks.navStyle === 'fab';

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#F7F5F1', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* status bar spacer */}
      <div style={{ height: 54, flexShrink: 0 }}/>
      {/* screen content */}
      <div key={current.screen + JSON.stringify(current.params)} style={{ flex: 1, overflow: 'auto', position: 'relative', animation: 'rqFade 0.18s ease-out' }}>
        {renderScreen()}
      </div>

      {/* FAB sheet (above tabbar) */}
      {useFab && fabOpen && (
        <>
          <div onClick={() => setFabOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(20,18,16,0.4)', backdropFilter: 'blur(2px)', zIndex: 39, animation: 'rqFade 0.15s ease-out' }}/>
          <div style={{ position: 'absolute', bottom: 110, left: 0, right: 0, padding: '0 16px', zIndex: 40, animation: 'rqSlideUp 0.22s cubic-bezier(.2,.8,.2,1)' }}>
            <div style={{ background: '#fff', borderRadius: 20, padding: 8, boxShadow: '0 12px 40px rgba(20,18,16,0.2)' }}>
              {[
                { icon: <I.camera size={20} color="#4F46E5"/>, title: 'Scan a bill', sub: 'AI extracts vendor, items, GST', go: 'billScan' },
                { icon: <I.send size={20} color="#0891B2"/>, title: 'Create invoice', sub: 'Send via WhatsApp or email', go: 'invoices' },
                { icon: <I.arrowDn size={20} color="#16A34A"/>, title: 'Record payment', sub: 'Customer paid you', go: 'invoices' },
                { icon: <I.bank size={20} color="#D97706"/>, title: 'Pay a vendor', sub: 'NEFT, UPI or pay run', go: 'bills' },
              ].map((a, i, arr) => (
                <button key={i} onClick={() => nav.go(a.go)} style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                  background: 'none', border: 0, padding: '12px 10px', cursor: 'pointer',
                  borderBottom: i < arr.length - 1 ? '0.5px solid rgba(20,18,16,0.06)' : 'none',
                  textAlign: 'left',
                }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: '#F6F4F0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{a.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1714' }}>{a.title}</div>
                    <div style={{ fontSize: 12, color: '#7B7468', marginTop: 1 }}>{a.sub}</div>
                  </div>
                  <I.chev size={16} color="#9C9489"/>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Bottom tab bar */}
      {showTabs && <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        paddingBottom: 28, paddingTop: 6, zIndex: 30,
        background: 'linear-gradient(180deg, rgba(247,245,241,0) 0%, rgba(247,245,241,0.9) 30%, #F7F5F1 60%)',
      }}>
        <div style={{
          margin: '0 12px',
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          borderRadius: 22,
          border: '0.5px solid rgba(20,18,16,0.08)',
          boxShadow: '0 4px 16px rgba(20,18,16,0.08), 0 1px 0 rgba(255,255,255,0.7) inset',
          display: 'flex', alignItems: 'center', justifyContent: 'space-around',
          padding: '6px 4px', position: 'relative',
        }}>
          {TABS.slice(0, 2).map(t => <TabButton key={t.id} t={t} active={root === t.id} onClick={() => nav.set(t.id)} showLabel={tweaks.showTabLabels}/>)}
          {useFab ? (
            <button onClick={() => setFabOpen(o => !o)} style={{
              width: 50, height: 50, borderRadius: 16, border: 0,
              background: fabOpen ? '#1A1714' : 'linear-gradient(135deg,' + tweaks.primary + ',' + tweaks.accent + ')',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', flexShrink: 0,
              boxShadow: '0 6px 20px ' + hexAlpha(tweaks.primary, 0.4),
              transform: fabOpen ? 'rotate(45deg)' : 'rotate(0)',
              transition: 'transform 0.2s, background 0.2s',
            }}>
              <I.plus size={22} color="#fff" strokeWidth={2.5}/>
            </button>
          ) : <TabButton t={TABS[2]} active={root === TABS[2].id} onClick={() => nav.set(TABS[2].id)} showLabel={tweaks.showTabLabels}/>}
          {(useFab ? TABS.slice(2, 4) : TABS.slice(3)).map(t => <TabButton key={t.id} t={t} active={root === t.id} onClick={() => nav.set(t.id)} showLabel={tweaks.showTabLabels}/>)}
          {useFab && <TabButton t={TABS[4]} active={root === TABS[4].id} onClick={() => nav.set(TABS[4].id)} showLabel={tweaks.showTabLabels}/>}
        </div>
      </div>}

      {/* Tweaks panel */}
      <window.TweaksPanel>
        <window.TweakSection label="Appearance"/>
        <window.TweakColor label="Primary"  value={tweaks.primary} onChange={v => setTweaks('primary', v)}/>
        <window.TweakColor label="Accent"   value={tweaks.accent}  onChange={v => setTweaks('accent', v)}/>
        <window.TweakRadio label="Density"  value={tweaks.density} options={['compact','regular','comfy']} onChange={v => setTweaks('density', v)}/>
        <window.TweakSection label="Behaviour"/>
        <window.TweakRadio  label="AI prominence" value={tweaks.aiProminence} options={['subtle','moderate','prominent']} onChange={v => setTweaks('aiProminence', v)}/>
        <window.TweakRadio  label="Navigation"    value={tweaks.navStyle}     options={['fab','tabs']} onChange={v => setTweaks('navStyle', v)}/>
        <window.TweakToggle label="Tab labels"    value={tweaks.showTabLabels} onChange={v => setTweaks('showTabLabels', v)}/>
      </window.TweaksPanel>
    </div>
  );
}

function TabButton({ t, active, onClick, showLabel }) {
  const Ic = t.icon;
  return (
    <button onClick={onClick} style={{
      flex: 1, background: 'none', border: 0, padding: '6px 4px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
      cursor: 'pointer',
      color: active ? '#1A1714' : '#9C9489',
    }}>
      <Ic size={22} color={active ? '#1A1714' : '#9C9489'} strokeWidth={active ? 2 : 1.75}/>
      {showLabel && <span style={{ fontSize: 10, fontWeight: active ? 600 : 500, letterSpacing: '0.01em' }}>{t.label}</span>}
    </button>
  );
}

function hexAlpha(hex, a) {
  // Accept #RGB or #RRGGBB
  const m = hex.replace('#', '');
  const f = m.length === 3 ? m.split('').map(c => c + c).join('') : m;
  const r = parseInt(f.slice(0, 2), 16);
  const g = parseInt(f.slice(2, 4), 16);
  const b = parseInt(f.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

window.RunQApp = App;
