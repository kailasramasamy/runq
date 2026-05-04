// Legal page renderer — content-dense plain-text. Each importing page sets window.legalPageData.
const { PageNav, PageFooter, usePageReveal, PageHero, FooterCTA } = window.Shell;
const { Section } = window.Blocks;

function LegalPage() {
  usePageReveal();
  const D = window.legalPageData;
  return (
    <>
      <PageNav />
      <main>
        <PageHero eyebrow={D.eyebrow} title={D.title} titleItalic={D.titleItalic} subtitle={D.subtitle} accent="brand" />

        <Section>
          <div className="grid grid-cols-12 gap-10">
            <aside className="col-span-12 lg:col-span-3">
              <div className="reveal sticky top-20 rounded-2xl border border-zinc-200 bg-white p-5 text-sm">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">In this document</div>
                <ul className="mt-3 space-y-2 text-zinc-600">
                  {D.sections.map((s, i) => (
                    <li key={i}><a href={`#s${i + 1}`} className="hover:text-zinc-900">{i + 1}. {s.t}</a></li>
                  ))}
                </ul>
                <div className="mt-5 border-t border-zinc-200 pt-4 text-xs text-zinc-500">Last updated: {D.updated}</div>
              </div>
            </aside>
            <article className="col-span-12 lg:col-span-9">
              <div className="reveal space-y-10">
                {D.sections.map((s, i) => (
                  <div key={i} id={`s${i + 1}`}>
                    <h2 className="text-xl font-semibold text-zinc-900">{i + 1}. {s.t}</h2>
                    <div className="mt-3 space-y-3 text-[15px] leading-[1.7] text-zinc-600" style={{ textWrap: 'pretty' }}>
                      {s.body.map((p, j) => <p key={j}>{p}</p>)}
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </Section>

        <FooterCTA />
      </main>
      <PageFooter />
    </>
  );
}

ReactDOM.createRoot(document.getElementById('app')).render(<LegalPage />);
