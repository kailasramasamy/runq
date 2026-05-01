import { useEffect, type ReactNode } from 'react';

interface LegalPageProps {
  title: string;
  subtitle?: string;
  effectiveDate: string;
  children: ReactNode;
}

export function LegalPage({ title, subtitle, effectiveDate, children }: LegalPageProps) {
  useEffect(() => { document.title = `${title} — runQ`; }, [title]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="section">
        <div className="max-w-3xl mx-auto px-6">
          <h1 className="font-display text-4xl md:text-5xl text-white mb-3 leading-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-zinc-400 text-lg mb-2">{subtitle}</p>
          )}
          <p className="text-zinc-500 text-sm mb-12">Effective {effectiveDate}</p>
          <div className="legal-content text-zinc-400 leading-relaxed space-y-4">
            {children}
          </div>
        </div>
      </section>
    </div>
  );
}
