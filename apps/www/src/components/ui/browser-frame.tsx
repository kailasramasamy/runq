import { useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ── Lightbox ─────────────────────────────────────────────────────────────── */

function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [handleKey]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 flex size-10 items-center justify-center rounded-full bg-zinc-800/80 text-zinc-400 hover:text-white transition-colors"
        aria-label="Close"
      >
        <X className="size-5" />
      </button>
      <img
        src={src}
        alt={alt}
        className="relative z-10 max-h-[90vh] max-w-[95vw] rounded-lg shadow-2xl object-contain"
      />
    </div>
  );
}

/* ── Browser Frame ────────────────────────────────────────────────────────── */

interface BrowserFrameProps {
  src: string;
  alt: string;
  className?: string;
}

export function BrowserFrame({ src, alt, className }: BrowserFrameProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div
        onClick={() => setOpen(true)}
        className={cn(
          'rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/40 overflow-hidden',
          'cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:border-zinc-700 hover:shadow-primary-500/10',
          className,
        )}
      >
        {/* Title bar */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-800 bg-zinc-900">
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
            <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
            <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
          </div>
          <div className="flex-1 mx-8">
            <div className="h-5 rounded-md bg-zinc-800 max-w-xs mx-auto" />
          </div>
        </div>
        {/* Screenshot */}
        <img src={src} alt={alt} className="w-full block" loading="lazy" />
      </div>
      {open && <Lightbox src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
}

/* ── Phone Frame ──────────────────────────────────────────────────────────── */

interface PhoneFrameProps {
  src: string;
  alt: string;
  className?: string;
}

export function PhoneFrame({ src, alt, className }: PhoneFrameProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div
        onClick={() => setOpen(true)}
        className={cn(
          'relative mx-auto w-[280px] cursor-pointer transition-all duration-300 hover:scale-[1.03]',
          className,
        )}
      >
        {/* Phone shell */}
        <div className="rounded-[2.5rem] border-[3px] border-zinc-700 bg-zinc-900 p-2 shadow-2xl shadow-black/40 transition-colors duration-300 hover:border-zinc-600">
          {/* Notch */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-5 bg-zinc-900 rounded-b-2xl z-10" />
          {/* Screen */}
          <div className="rounded-[2rem] overflow-hidden bg-zinc-950">
            <img src={src} alt={alt} className="w-full block" loading="lazy" />
          </div>
        </div>
      </div>
      {open && <Lightbox src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
}
