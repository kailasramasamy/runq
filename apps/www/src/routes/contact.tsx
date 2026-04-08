import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, Phone, MapPin, Send, CheckCircle2, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: 'easeOut' as const },
  }),
};

interface FormState {
  name: string;
  email: string;
  phone: string;
  company: string;
  message: string;
}

const INITIAL: FormState = { name: '', email: '', phone: '', company: '', message: '' };

// Assembled at runtime so scrapers can't regex the source HTML
function useContactInfo() {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  useEffect(() => {
    setEmail(['hello', '@', 'quartex', '.', 'in'].join(''));
    setPhone(['+91 ', '8197', '0', '204', '59'].join(''));
  }, []);
  return { email, phone };
}

function ContactInfo() {
  const { email, phone } = useContactInfo();

  const items = [
    {
      icon: <Mail className="size-5" />,
      label: 'Email',
      value: email,
      href: email ? `mailto:${email}` : undefined,
    },
    {
      icon: <Phone className="size-5" />,
      label: 'Phone',
      value: phone,
      href: phone ? `tel:${phone.replace(/\s/g, '')}` : undefined,
    },
    {
      icon: <MapPin className="size-5" />,
      label: 'Office',
      value: 'Quartex Technologies\nSy No 26, Janthgondanagalli\nMuthsandra Post, Varthur\nSarjapur Hobli\nBangalore 560087\nKarnataka, India',
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {items.map((item) => (
        <div key={item.label} className="flex gap-4 rounded-2xl bg-zinc-900 border border-zinc-800 p-5">
          <div className="w-10 h-10 rounded-lg bg-primary-950 flex items-center justify-center text-primary-400 shrink-0">
            {item.icon}
          </div>
          <div className="min-w-0">
            <p className="text-xs text-zinc-500 mb-0.5 font-medium uppercase tracking-wide">{item.label}</p>
            {item.href ? (
              <a href={item.href} className="text-sm text-primary-400 hover:underline">{item.value}</a>
            ) : (
              <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-line">{item.value}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Contact() {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [honeypot, setHoneypot] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { document.title = 'Contact — runQ'; }, []);

  function set(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/v1/public/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, _hp: honeypot }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || `Error ${res.status}`);
      }
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="section">
        <div className="max-w-5xl mx-auto px-6">
          <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible" className="mb-16">
            <h1 className="font-display text-5xl md:text-6xl text-white mb-4">Let&apos;s talk</h1>
            <p className="text-zinc-400 text-lg max-w-xl">
              Whether you have a question about pricing, features, or want a demo — we read every message and reply within one business day.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-12">
            {/* Form */}
            <motion.div custom={1} variants={fadeUp} initial="hidden" animate="visible" className="lg:col-span-3">
              {submitted ? (
                <div className="rounded-2xl bg-emerald-950 border border-emerald-800 p-8 flex flex-col items-center text-center gap-4">
                  <CheckCircle2 className="size-12 text-emerald-400" />
                  <h2 className="text-xl font-semibold text-white">Message received</h2>
                  <p className="text-emerald-300 text-sm">We'll get back to you at {form.email} within one business day.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <Input label="Full name" placeholder="Priya Sharma" value={form.name} onChange={set('name')} required />
                    <Input label="Email" type="email" placeholder="priya@acme.in" value={form.email} onChange={set('email')} required />
                    <Input label="Phone" type="tel" placeholder="+91 98765 43210" value={form.phone} onChange={set('phone')} />
                    <Input label="Company name" placeholder="Acme Pvt Ltd" value={form.company} onChange={set('company')} />
                  </div>

                  {/* Honeypot — hidden from real users, filled by bots */}
                  <div className="absolute -left-[9999px]" aria-hidden="true" tabIndex={-1}>
                    <input
                      type="text"
                      name="website"
                      autoComplete="off"
                      value={honeypot}
                      onChange={(e) => setHoneypot(e.target.value)}
                      tabIndex={-1}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-zinc-300">Message</label>
                    <textarea
                      rows={5}
                      required
                      minLength={10}
                      placeholder="Tell us what you need..."
                      value={form.message}
                      onChange={set('message')}
                      className="w-full rounded-xl bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 border border-zinc-700 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-transparent transition-colors resize-none"
                    />
                  </div>

                  {error && (
                    <div className="flex items-center gap-2 text-sm text-red-400">
                      <AlertCircle className="size-4 shrink-0" />
                      {error}
                    </div>
                  )}

                  <Button type="submit" size="lg" className="self-start" disabled={loading}>
                    {loading ? 'Sending...' : 'Send message'} <Send className="size-4" />
                  </Button>
                </form>
              )}
            </motion.div>

            {/* Side info */}
            <motion.div custom={2} variants={fadeUp} initial="hidden" animate="visible" className="lg:col-span-2">
              <ContactInfo />
            </motion.div>
          </div>
        </div>
      </section>
    </div>
  );
}
