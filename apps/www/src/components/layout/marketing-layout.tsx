import { type ReactNode } from 'react';
import { Navbar } from './navbar';
import { Footer } from './footer';
import { useReveal } from '@/hooks/use-reveal';
import { useRouter } from '@/lib/router';

interface MarketingLayoutProps {
  children: ReactNode;
}

export default function MarketingLayout({ children }: MarketingLayoutProps) {
  const { path } = useRouter();
  // Re-runs on route change so newly-mounted .reveal elements are observed.
  useReveal(path);
  return (
    <div className="min-h-screen flex flex-col bg-white text-zinc-900">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
