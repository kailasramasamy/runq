import { Button } from '@/components/ui/button';
import { useRouter } from '@/lib/router';

export default function NotFound() {
  const { navigate } = useRouter();
  return (
    <section className="section px-4 flex flex-col items-center justify-center text-center">
      <p className="text-7xl font-bold text-zinc-800 mb-4">404</p>
      <h1 className="text-2xl font-semibold text-zinc-100 mb-3">Page not found</h1>
      <p className="text-zinc-400 mb-8">This page doesn't exist or has been moved.</p>
      <Button onClick={() => navigate('/')}>Back to Home</Button>
    </section>
  );
}
