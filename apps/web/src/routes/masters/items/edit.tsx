import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Calculator } from 'lucide-react';
import {
  PageHeader,
  Card,
  CardContent,
  Button,
  ConfirmationDialog,
  useToast,
} from '@/components/ui';
import { useItem, useDeleteItem } from '@/hooks/queries/use-items';
import { ItemForm } from './item-form';

export function ItemEditPage({ itemId }: { itemId?: string }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const remove = useDeleteItem();
  const { data, isLoading } = useItem(itemId);
  const item = data?.data;
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const isCreate = !itemId;
  const goBack = () => navigate({ to: '/masters/items' });

  async function handleDelete() {
    if (!item) return;
    try {
      await remove.mutateAsync(item.id);
      toast('Item deleted', 'success');
      setConfirmingDelete(false);
      goBack();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Failed to delete item';
      toast(msg, 'error');
      setConfirmingDelete(false);
    }
  }

  // Edit mode but item not yet loaded
  if (!isCreate && (isLoading || !item)) {
    return (
      <div className="max-w-5xl">
        <PageHeader
          title="Edit Item"
          breadcrumbs={[{ label: 'Masters' }, { label: 'Items', href: '/masters/items' }, { label: 'Edit' }]}
        />
        <Card>
          <CardContent className="p-8 text-center text-zinc-400">Loading…</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-4">
      <PageHeader
        title={isCreate ? 'New Item' : `Edit — ${item!.name}`}
        breadcrumbs={[
          { label: 'Masters' },
          { label: 'Items', href: '/masters/items' },
          { label: isCreate ? 'New' : item!.name },
        ]}
        description={
          isCreate
            ? 'Create a new product or service for invoices, bills, and price lists.'
            : `${item!.brand ? item!.brand + ' · ' : ''}${item!.grammage ?? item!.unit ?? ''}${item!.ean ? ' · EAN ' + item!.ean : ''}`
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {!isCreate && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  navigate({
                    to: '/masters/items/$itemId/analysis',
                    params: { itemId: item!.id },
                    search: { from: 'edit' },
                  })
                }
              >
                <Calculator size={14} /> Cost & Profit Analysis
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={goBack}>
              <ArrowLeft size={14} /> Back to Items
            </Button>
          </div>
        }
      />

      <Card>
        <CardContent className="pt-5">
          <ItemForm
            key={item?.id ?? 'new'}
            item={item ?? undefined}
            onClose={goBack}
            onDelete={isCreate ? undefined : () => setConfirmingDelete(true)}
            onOpenAnalysis={
              isCreate
                ? undefined
                : () =>
                    navigate({
                      to: '/masters/items/$itemId/analysis',
                      params: { itemId: item!.id },
                      search: { from: 'edit' },
                    })
            }
          />
        </CardContent>
      </Card>

      <ConfirmationDialog
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        onConfirm={handleDelete}
        title="Delete item?"
        description={
          item
            ? `"${item.name}" will be permanently deleted. This cannot be undone. If the item is referenced by a price list, deletion will be blocked.`
            : ''
        }
        confirmLabel="Delete"
        variant="danger"
        loading={remove.isPending}
      />
    </div>
  );
}
