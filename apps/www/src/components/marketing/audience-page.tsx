import { useEffect } from 'react';
import { type LucideIcon } from 'lucide-react';
import { PageHero } from './page-hero';
import { FooterCTA } from './footer-cta';
import { Section, GreySection, DarkSection, SectionHead, IconGrid, type Accent, type IconGridItem } from './blocks';

export interface AudienceData {
  eyebrow: string;
  title: string;
  titleItalic?: string;
  subtitle: string;
  accent?: Accent;
  lead?: string[];
  featuresEyebrow?: string;
  featuresTitle?: string;
  featuresSubtitle?: string;
  features?: IconGridItem[];
  stepsEyebrow?: string;
  stepsTitle?: string;
  steps?: Array<[string, string, string]>;
  darkPanel?: {
    eyebrow: string;
    title: string;
    items: Array<[string, string]>;
  };
  documentTitle?: string;
}

export function AudiencePage({ data }: { data: AudienceData }) {
  useEffect(() => {
    if (data.documentTitle) document.title = data.documentTitle;
  }, [data.documentTitle]);

  return (
    <main>
      <PageHero
        eyebrow={data.eyebrow}
        title={data.title}
        titleItalic={data.titleItalic}
        subtitle={data.subtitle}
        accent={data.accent}
      />

      {data.lead && (
        <Section>
          <div
            className="reveal mx-auto max-w-[860px] space-y-4 text-[17px] leading-[1.7] text-zinc-700"
            style={{ textWrap: 'pretty' }}
          >
            {data.lead.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </Section>
      )}

      {data.features && (
        <GreySection>
          <SectionHead
            eyebrow={data.featuresEyebrow ?? 'WHAT YOU GET'}
            title={data.featuresTitle ?? ''}
            subtitle={data.featuresSubtitle}
            accent={data.accent}
          />
          <div className="mt-12">
            <IconGrid items={data.features} accent={data.accent} cols={3} />
          </div>
        </GreySection>
      )}

      {data.steps && (
        <Section>
          <SectionHead
            eyebrow={data.stepsEyebrow ?? 'HOW IT WORKS'}
            title={data.stepsTitle ?? ''}
            accent={data.accent}
          />
          <div className="mt-12 grid grid-cols-1 gap-5 lg:grid-cols-3">
            {data.steps.map(([n, t, b]) => (
              <div key={n} className="reveal lift rounded-2xl border border-zinc-200 bg-white p-7">
                <div className="font-display text-3xl text-brand-500/60">{n}</div>
                <div className="mt-3 text-lg font-semibold text-zinc-900">{t}</div>
                <div className="mt-2 text-sm text-zinc-600" style={{ textWrap: 'pretty' }}>
                  {b}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {data.darkPanel && (
        <DarkSection>
          <SectionHead eyebrow={data.darkPanel.eyebrow} title={data.darkPanel.title} accent="violet" dark />
          <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
            {data.darkPanel.items.map(([t, b], i) => (
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
  );
}

// re-export the LucideIcon type for convenience
export type { LucideIcon };
