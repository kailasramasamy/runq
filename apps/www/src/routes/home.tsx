import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useRouter } from '@/lib/router';

export default function Home() {
  const { navigate } = useRouter();
  return (
    <section className="flex flex-col items-center justify-center text-center px-4 py-32 section">
      <Badge variant="primary" className="mb-6">Now in Early Access</Badge>
      <h1 className="font-display text-5xl md:text-7xl text-zinc-100 mb-6 leading-tight max-w-3xl">
        Run your business,<br />not your <span className="gradient-text italic">books.</span>
      </h1>
      <p className="text-lg text-zinc-400 mb-10 max-w-xl leading-relaxed">
        Modern ERP for Indian SMEs. GST invoicing, bank reconciliation, vendor management — all in one place.
      </p>
      <div className="flex flex-col sm:flex-row gap-4 items-center">
        <Button size="lg" onClick={() => navigate('/get-started')}>Get Started Free</Button>
        <Button size="lg" variant="secondary" onClick={() => navigate('/finance')}>See Finance Module</Button>
      </div>
    </section>
  );
}
