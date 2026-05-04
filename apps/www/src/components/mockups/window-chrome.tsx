import { type ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WindowChromeProps {
  url?: string;
  dark?: boolean;
  height?: number | string;
  className?: string;
  children: ReactNode;
}

export function WindowChrome({ url = 'app.runq.in', dark = true, height, className, children }: WindowChromeProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border',
        dark ? 'border-zinc-800 bg-zinc-950' : 'border-zinc-200 bg-white',
        className,
      )}
      style={height !== undefined ? { height } : undefined}
    >
      <div
        className={cn(
          'flex items-center gap-3 border-b px-4 py-2.5',
          dark ? 'border-zinc-800/80 bg-zinc-900/60' : 'border-zinc-200 bg-zinc-50',
        )}
      >
        <div className="flex gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
          <div className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
          <div className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
        </div>
        <div
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-md py-1 text-[11px]',
            dark ? 'bg-zinc-900 text-zinc-500' : 'bg-white text-zinc-400 border border-zinc-200',
          )}
        >
          <Lock size={10} />
          <span className="font-mono">{url}</span>
        </div>
        <div className={cn('h-5 w-5 rounded-md', dark ? 'bg-zinc-900' : 'bg-white border border-zinc-200')} />
      </div>
      <div className="relative h-[calc(100%-41px)]">{children}</div>
    </div>
  );
}
