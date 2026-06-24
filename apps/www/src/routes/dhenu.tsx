import { useEffect, type ReactNode } from 'react';
import { Droplets, IndianRupee, LineChart, Truck, Snowflake, Languages } from 'lucide-react';
import { Section, GreySection, SectionHead, IconGrid, type IconGridItem } from '@/components/marketing/blocks';
import { cn } from '@/lib/utils';

// Marketing landing page for the Dhenu milk-procurement app. Used as the App
// Store / Play Store "marketing URL" (runq.in/dhenu). Reuses the www block
// library with an emerald accent and the app screenshots in /public/dhenu.

const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.quartex.dhenu';
const APP_STORE_URL = '#'; // TODO: replace with apps.apple.com/app/idXXXX once the app is approved

const features: IconGridItem[] = [
  { Icon: Droplets,   title: 'Record milk in seconds', body: 'Pick the farmer, shift, and milk type, then enter litres or CLR. The rate is calculated instantly from quality (FAT/SNF or CLR).' },
  { Icon: LineChart,  title: 'Know your rate first',    body: 'Farmers see a clear FAT/SNF rate chart and know exactly what each quality band pays — before they pour.' },
  { Icon: IndianRupee,title: 'Transparent payments',    body: 'Every rupee accounted for. Per-cycle payable and full payout history, visible to the farmer.' },
  { Icon: Truck,      title: 'Dispatch & reconcile',    body: 'Send and reconcile in one tap, with shift-wise availability so nothing is double-counted.' },
  { Icon: Snowflake,  title: 'Chilling-centre view',    body: 'See every VMCC in one place — collected, in transit, received — and monitor chilling-tank capacity live.' },
  { Icon: Languages,  title: 'Works in your language',  body: 'Available in English and regional languages, built to be simple and fast on everyday phones.' },
];

const gallery: Array<[string, string]> = [
  ['farmer-home.png',      'Farmer home — milk and money at a glance'],
  ['farmer-payment.png',   'Transparent payment history'],
  ['farmer-rate-chart.png','Rate chart by FAT and SNF'],
  ['vmcc-collection.png',  'Recording a collection'],
  ['vmcc-dispatch.png',    'Dispatch and reconcile'],
  ['cc-home.png',          'Collection-centre overview'],
];

function Phone({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-[2rem] border-[5px] border-zinc-900 bg-zinc-900',
        'shadow-2xl shadow-emerald-900/25',
        className,
      )}
    >
      <img src={src} alt={alt} loading="lazy" className="block w-full" />
    </div>
  );
}

function StoreBadges({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-3', className)}>
      <a
        href={APP_STORE_URL}
        className="inline-flex items-center gap-2.5 rounded-xl bg-zinc-900 px-4 py-2.5 text-white transition-colors hover:bg-zinc-800"
      >
        <svg viewBox="0 0 384 512" width="20" height="20" fill="currentColor" aria-hidden="true">
          <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zM256.2 65.4c30-35.6 27.3-68 26.4-79.6-26.5 1.5-57.2 18-74.7 38.3-19.3 21.7-30.6 48.6-28.2 78.9 28.7 2.2 54.9-12.6 76.5-37.6z"/>
        </svg>
        <span className="text-left leading-tight">
          <span className="block text-[10px] opacity-80">Download on the</span>
          <span className="block text-sm font-semibold">App Store</span>
        </span>
      </a>
      <a
        href={PLAY_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2.5 rounded-xl bg-zinc-900 px-4 py-2.5 text-white transition-colors hover:bg-zinc-800"
      >
        <svg viewBox="0 0 512 512" width="20" height="20" aria-hidden="true">
          <path fill="#34d399" d="M47 24.8C40 28.6 36 35.6 36 45v422c0 9.4 4 16.4 11 20.2l245-231.1z"/>
          <path fill="#6ee7b7" d="M364.4 207.8L292 256.1l72.4 48.3 84.2-47.1c12.6-7 12.6-26.2 0-33.2z"/>
          <path fill="#a7f3d0" d="M47 487.2c5.4 2.9 12.4 2.3 19.6-1.7l298-166.9-72.4-62.5z"/>
          <path fill="#10b981" d="M47 24.8L292 256.1l72.4-62.5-298-166.9c-7.2-4-14.2-4.6-19.4-1.9z"/>
        </svg>
        <span className="text-left leading-tight">
          <span className="block text-[10px] opacity-80">Get it on</span>
          <span className="block text-sm font-semibold">Google Play</span>
        </span>
      </a>
    </div>
  );
}

export default function DhenuPage() {
  useEffect(() => {
    document.title = 'Dhenu — milk procurement, made simple';
  }, []);

  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="aurora" />
        <div
          className="absolute inset-0 line-grid-light opacity-50"
          style={{
            maskImage: 'radial-gradient(ellipse at 50% 30%, black 0%, transparent 70%)',
            WebkitMaskImage: 'radial-gradient(ellipse at 50% 30%, black 0%, transparent 70%)',
          }}
        />
        <div className="relative mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-12 px-5 pt-16 pb-12 lg:grid-cols-2 lg:px-8 lg:pt-24 lg:pb-20">
          <div>
            <div className="reveal text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
              DHENU · MILK PROCUREMENT
            </div>
            <h1
              className="reveal mt-3 leading-[1.05] tracking-tight text-zinc-900"
              style={{ fontSize: 'clamp(2rem, 5vw, 3.6rem)', textWrap: 'balance' }}
            >
              <span className="font-semibold">Your whole milk chain,</span>{' '}
              <span className="font-display italic bg-gradient-to-r from-emerald-500 to-teal-600 bg-clip-text text-transparent">
                in one app.
              </span>
            </h1>
            <p className="reveal mt-5 max-w-xl text-base text-zinc-600 lg:text-lg" style={{ textWrap: 'pretty' }}>
              Weigh, rate, dispatch, pay — from the farmer's pour to the chilling centre. Fair rates farmers
              can see, payouts they can trust. Built for India's dairies, VMCCs, and collection centres.
            </p>
            <StoreBadges className="reveal mt-8" />
          </div>
          <div className="reveal flex justify-center lg:justify-end">
            <Phone src="/dhenu/farmer-home.png" alt="Dhenu farmer home screen" className="w-[270px] sm:w-[300px]" />
          </div>
        </div>
      </section>

      {/* Features */}
      <GreySection>
        <SectionHead
          eyebrow="WHAT YOU GET"
          title="Everything procurement needs, nothing it doesn't."
          subtitle="One app for farmers, collection operators, and chilling centres — fast, accurate, and transparent."
          accent="emerald"
        />
        <div className="mt-12">
          <IconGrid items={features} accent="emerald" cols={3} />
        </div>
      </GreySection>

      {/* Gallery */}
      <Section>
        <SectionHead eyebrow="A LOOK INSIDE" title="See it in action." accent="emerald" />
        <div className="mt-10 flex snap-x snap-mandatory gap-5 overflow-x-auto pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {gallery.map(([file, alt]) => (
            <Phone
              key={file}
              src={`/dhenu/${file}`}
              alt={alt}
              className="w-[210px] flex-none snap-center sm:w-[230px]"
            />
          ))}
        </div>
      </Section>

      {/* Download CTA */}
      <section className="relative overflow-hidden bg-zinc-950 py-20 text-zinc-100">
        <div className="absolute inset-0 dot-grid opacity-40" />
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(16,185,129,0.18), transparent 60%)' }}
        />
        <div className="relative mx-auto max-w-[1200px] px-5 text-center lg:px-8">
          <h2 className="reveal text-3xl tracking-tight lg:text-5xl">
            <span className="font-semibold">Bring your milk chain</span>{' '}
            <span className="font-display italic bg-gradient-to-r from-emerald-300 to-teal-300 bg-clip-text text-transparent">
              into one app.
            </span>
          </h2>
          <p className="reveal mx-auto mt-4 max-w-xl text-zinc-400" style={{ textWrap: 'pretty' }}>
            Accurate, transparent, and fast — from the first pour to the final payout.
          </p>
          <StoreBadges className="reveal mt-8 justify-center" />
          <p className="reveal mt-6 text-sm text-zinc-500">
            Questions? <a href="/dhenu/support" className="text-emerald-400 hover:text-emerald-300">We're here to help</a>.
          </p>
        </div>
      </section>
    </main>
  );
}
