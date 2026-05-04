// Generic "audience" page used by 4 "For X" pages and 4 "Company" pages.
// Each importing page does: window.audiencePageData = {...}; before this script.

const { PageNav, PageFooter, usePageReveal, PageHero, FooterCTA } = window.Shell;
const { IconGrid, Section, GreySection, DarkSection, SectionHead } = window.Blocks;

function AudiencePage() {
  usePageReveal();
  const D = window.audiencePageData;
  return (
    <>
      <PageNav />
      <main>
        <PageHero eyebrow={D.eyebrow} title={D.title} titleItalic={D.titleItalic} subtitle={D.subtitle} accent={D.accent} />

        {D.lead && (
          <Section>
            <div className="reveal mx-auto max-w-[860px] space-y-4 text-[17px] leading-[1.7] text-zinc-700" style={{ textWrap: 'pretty' }}>
              {D.lead.map((p, i) => <p key={i}>{p}</p>)}
            </div>
          </Section>
        )}

        {D.features && (
          <GreySection>
            <SectionHead eyebrow={D.featuresEyebrow || 'WHAT YOU GET'} title={D.featuresTitle} subtitle={D.featuresSubtitle} accent={D.accent} />
            <div className="mt-12"><IconGrid items={D.features} accent={D.accent} cols={3} /></div>
          </GreySection>
        )}

        {D.steps && (
          <Section>
            <SectionHead eyebrow={D.stepsEyebrow || 'HOW IT WORKS'} title={D.stepsTitle} accent={D.accent} />
            <div className="mt-12 grid grid-cols-1 gap-5 lg:grid-cols-3">
              {D.steps.map(([n, t, b]) => (
                <div key={n} className="reveal lift rounded-2xl border border-zinc-200 bg-white p-7">
                  <div className="font-display text-3xl text-brand-500/60">{n}</div>
                  <div className="mt-3 text-lg font-semibold text-zinc-900">{t}</div>
                  <div className="mt-2 text-sm text-zinc-600" style={{ textWrap: 'pretty' }}>{b}</div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {D.darkPanel && (
          <DarkSection>
            <SectionHead eyebrow={D.darkPanel.eyebrow} title={D.darkPanel.title} accent="violet" />
            <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
              {D.darkPanel.items.map(([t, b], i) => (
                <div key={i} className="reveal rounded-2xl border border-white/10 bg-white/5 p-6">
                  <div className="text-base font-semibold text-white">{t}</div>
                  <div className="mt-2 text-sm text-zinc-400">{b}</div>
                </div>
              ))}
            </div>
          </DarkSection>
        )}

        <FooterCTA />
      </main>
      <PageFooter />
    </>
  );
}

ReactDOM.createRoot(document.getElementById('app')).render(<AudiencePage />);
