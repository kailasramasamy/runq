import {
  Layers, ArrowDown, ArrowRight, Landmark, FileText, TrendingUp, Users, Settings,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const items: Array<[string, LucideIcon]> = [
  ['Dashboard', Layers],
  ['Receivable', ArrowDown],
  ['Payable', ArrowRight],
  ['Banking', Landmark],
  ['GST', FileText],
  ['Reports', TrendingUp],
  ['Vendors', Users],
  ['Settings', Settings],
];

interface MockSidebarProps {
  active?: string;
  dense?: boolean;
}

export function MockSidebar({ active = 'Dashboard', dense = false }: MockSidebarProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-0.5 border-r border-zinc-800/80 bg-zinc-950',
        dense ? 'w-14 px-1.5 py-3' : 'w-44 px-2.5 py-3',
      )}
    >
      <div className={cn('mb-3 flex items-center gap-2', dense ? 'justify-center' : 'px-1.5')}>
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-500">
          <span className="text-[11px] font-bold text-white">Q</span>
        </div>
        {!dense && <span className="text-sm font-semibold text-white">runQ</span>}
        {!dense && (
          <span className="ml-auto rounded border border-brand-400/30 px-1 py-px text-[8px] font-semibold uppercase tracking-wider text-brand-300">
            Finance
          </span>
        )}
      </div>
      {items.map(([label, Icon]) => {
        const isActive = label === active;
        return (
          <div
            key={label}
            className={cn(
              'flex items-center rounded-md',
              dense ? 'justify-center p-1.5' : 'gap-2 px-2 py-1.5 text-[11px]',
              isActive ? 'bg-zinc-800 text-white' : 'text-zinc-500',
            )}
          >
            <Icon size={dense ? 14 : 13} />
            {!dense && <span>{label}</span>}
          </div>
        );
      })}
      <div className="mt-auto" />
    </div>
  );
}
