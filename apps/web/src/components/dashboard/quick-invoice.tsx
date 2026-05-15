import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Zap, ArrowRight } from 'lucide-react';
import { Card, CardHeader, CardContent, CardSkeleton, Button, Modal } from '@/components/ui';
import { formatINR } from '@/lib/utils';
import { useQuickTemplates, type QuickInvoiceTemplate } from '@/hooks/queries/use-quick-templates';
import { GenerateInvoiceModal } from '@/components/ar/generate-invoice-modal';

function TemplateCard({ template, onGenerate }: {
  template: QuickInvoiceTemplate;
  onGenerate: () => void;
}) {
  const itemCount = template.items.length;
  const defaultTotal = template.items.reduce((sum, it) => {
    const line = it.defaultQuantity * it.unitPrice;
    const tax = it.taxRate ? line * (it.taxRate / 100) : 0;
    return sum + line + tax;
  }, 0);

  return (
    <button
      onClick={onGenerate}
      className="group flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 text-left transition-all hover:border-indigo-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 hover:dark:border-indigo-700"
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {template.name}
          </p>
          <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
            {template.customerName ?? 'Customer'}
          </p>
        </div>
        <div className="ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 transition-colors group-hover:bg-indigo-100 dark:bg-indigo-950/50 dark:text-indigo-400 dark:group-hover:bg-indigo-900/50">
          <Zap size={16} />
        </div>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-400 dark:text-zinc-500">
          {itemCount} item{itemCount !== 1 ? 's' : ''}
        </span>
        <span className="font-mono font-medium text-zinc-700 dark:text-zinc-300">
          {formatINR(defaultTotal)}
        </span>
      </div>
    </button>
  );
}

export function QuickInvoiceWidget() {
  const { data, isLoading } = useQuickTemplates();
  const navigate = useNavigate();
  const [generating, setGenerating] = useState<QuickInvoiceTemplate | null>(null);

  const templates = (data?.data ?? []).filter((t) => t.isActive);

  if (isLoading) {
    return <CardSkeleton />;
  }

  if (templates.length === 0) return null;

  return (
    <>
      <Card>
        <CardHeader
          title="Quick Invoice"
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate({ to: '/finance/ar/quick-templates' as '/' })}
            >
              All Templates <ArrowRight size={14} />
            </Button>
          }
        />
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {templates.slice(0, 8).map((tpl) => (
              <TemplateCard
                key={tpl.id}
                template={tpl}
                onGenerate={() => setGenerating(tpl)}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <Modal
        open={!!generating}
        onClose={() => setGenerating(null)}
        title={generating?.name ?? ''}
      >
        {generating && (
          <GenerateInvoiceModal
            key={generating.id}
            template={generating}
            onClose={() => setGenerating(null)}
          />
        )}
      </Modal>
    </>
  );
}
