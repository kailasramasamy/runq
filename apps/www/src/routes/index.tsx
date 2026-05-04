import { Hero } from '@/components/sections/hero';
import { ValueProps } from '@/components/sections/value-props';
import { ProductShowcase } from '@/components/sections/product-showcase';
import { MobileBand } from '@/components/sections/mobile-band';
import { AiBand } from '@/components/sections/ai-band';
import { ForCAs } from '@/components/sections/for-cas';
import { Comparison } from '@/components/sections/comparison';
import { CtaBanner } from '@/components/sections/cta-banner';

export function HomePage() {
  return (
    <>
      <Hero />
      <ValueProps />
      <ProductShowcase />
      <MobileBand />
      <AiBand />
      <ForCAs />
      <Comparison />
      <CtaBanner />
    </>
  );
}
