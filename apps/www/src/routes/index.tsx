import { Hero } from '@/components/sections/hero';
import { ValueProps } from '@/components/sections/value-props';
import { ModulesPreview } from '@/components/sections/modules-preview';
import { Comparison } from '@/components/sections/comparison';
import { SocialProof } from '@/components/sections/social-proof';
import { CtaBanner } from '@/components/sections/cta-banner';

export function HomePage() {
  return (
    <main>
      <Hero />
      <ValueProps />
      <ModulesPreview />
      <Comparison />
      <SocialProof />
      <CtaBanner />
    </main>
  );
}
