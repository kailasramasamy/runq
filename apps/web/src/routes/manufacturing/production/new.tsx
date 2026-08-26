/**
 * Record Production — /manufacturing/production/new
 * Records finished goods produced WITHOUT a work order: the plant manager was
 * away and a technician made product directly. The server backflushes raw
 * materials from the BOM, FEFO-allocates batches, and posts the whole thing
 * as one unplanned work order on submit.
 * Spec: docs/manufacturing-plan.md §5.4.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { PageHeader, Button, useToast } from '@/components/ui';
import { useProductionPreview, useRecordProduction } from '@/hooks/queries/use-production';
import { ApiClientError } from '@/lib/api-client';
import { ProductionForm, type ProductionFormState } from './_production-form';
import {
  ProductionLinesPanel, batchKey, drawnTotal, type DrawDraft,
} from './_production-lines';
import { ProductionCostingStrip } from './_production-costing-strip';
import { ProductionWastagePanel, wastageFromLeft, type WastageDraft } from './_production-wastage';
import type { ProductionAllocation, ProductionShortage } from '@runq/types';
import type { ProductionLineOverride, ProductionPreviewInput } from '@runq/validators';

const INITIAL_STATE: ProductionFormState = {
  bomId: '', producedQty: '', warehouseId: '', batchNo: '',
  expiryDate: '', shift: '', producedOn: new Date().toISOString().slice(0, 10), notes: '',
};

export function RecordProductionPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [form, setForm] = useState<ProductionFormState>(INITIAL_STATE);
  /** What the operator typed, keyed by batch. The only source of the draw. */
  const [draw, setDraw] = useState<DrawDraft>({});
  const [wastage, setWastage] = useState<WastageDraft>({});
  const [submitShortages, setSubmitShortages] = useState<ProductionShortage[] | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const recordM = useRecordProduction();

  function patchForm(patch: Partial<ProductionFormState>) {
    setForm((s) => ({ ...s, ...patch }));
    setSubmitShortages(null);
  }

  // Overrides are only meaningful against a specific BOM + warehouse — a new
  // pick invalidates them.
  useEffect(() => { setDraw({}); setWastage({}); }, [form.bomId, form.warehouseId]);

  const rawBody: ProductionPreviewInput = useMemo(() => ({
    bomId: form.bomId || undefined,
    producedQty: Number(form.producedQty) || 0,
    warehouseId: form.warehouseId,
  }), [form.bomId, form.producedQty, form.warehouseId]);

  const [debouncedBody, setDebouncedBody] = useState(rawBody);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedBody(rawBody), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(rawBody)]);

  const hasQuery = !!form.bomId && !!form.warehouseId && debouncedBody.producedQty > 0;
  const { data: previewRes, isLoading: previewLoading, isFetching: previewFetching } =
    useProductionPreview(debouncedBody, hasQuery);
  const preview = previewRes?.data;

  function patchWastage(inputItemId: string, patch: { left?: string; notes?: string }) {
    setWastage((prev) => ({
      ...prev,
      [inputItemId]: { ...(prev[inputItemId] ?? { left: '', notes: '' }), ...patch },
    }));
  }

  /**
   * No batch is sent: the server FEFO-allocates the write-off against what the
   * run actually left behind. Naming a batch here gets it wrong — the run
   * usually drains the oldest batch completely, so the leftover is in whichever
   * batch the allocation stopped part-way through.
   */
  function wastagePayload() {
    const lines = (preview?.allocations ?? []).flatMap((a) => {
      const row = wastage[a.inputItemId];
      const qty = wastageFromLeft(a, row?.left ?? '', draw);
      if (qty <= 0) return [];
      return [{ itemId: a.inputItemId, qty, notes: row?.notes?.trim() || null }];
    });
    return lines.length ? { warehouseId: form.warehouseId, lines } : undefined;
  }

  function handleQtyChange(key: string, value: string) {
    setSubmitShortages(null);
    setDraw((prev) => ({ ...prev, [key]: value }));
  }

  /**
   * Fill this line from the server's suggestion — whole cans first, the
   * shortfall from one bigger batch. Replaces whatever the line held, so a
   * half-typed split does not get added to.
   */
  function handleSuggest(allocation: ProductionAllocation) {
    setSubmitShortages(null);
    setDraw((prev) => {
      const next = { ...prev };
      for (const b of allocation.pool) next[batchKey(b.itemId, b.batchNo)] = '';
      for (const s of allocation.suggestion) {
        next[batchKey(s.itemId, s.batchNo)] = String(s.qty);
      }
      return next;
    });
  }

  /** The typed split, as the API's line overrides. */
  function drawPayload(): ProductionLineOverride[] {
    return (preview?.allocations ?? []).flatMap((a) =>
      a.pool.flatMap((b) => {
        const qty = Number(draw[batchKey(b.itemId, b.batchNo)]) || 0;
        return qty > 0 ? [{ inputItemId: b.itemId, batchNo: b.batchNo, qty }] : [];
      }),
    );
  }

  /** Lines whose entered total does not match what the recipe needs. */
  const unbalanced = (preview?.allocations ?? []).filter((a) => {
    if (a.isOptional && drawnTotal(draw, a) === 0) return false;
    return Math.abs(a.requiredQty - drawnTotal(draw, a)) >= 0.0005;
  });

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.bomId) errs.bomId = 'BOM is required';
    if (!form.producedQty || Number(form.producedQty) <= 0) errs.producedQty = 'Produced qty must be positive';
    if (!form.warehouseId) errs.warehouseId = 'Warehouse is required';
    if (!form.producedOn) errs.producedOn = 'Produced-on date is required';
    if (preview?.outputTracksBatches && !form.expiryDate) errs.expiryDate = 'Expiry date is required for this item';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit() {
    setSubmitShortages(null);
    if (!validate()) return;
    if (preview && preview.shortages.length > 0) return;
    recordM.mutate(
      {
        bomId: form.bomId,
        producedQty: Number(form.producedQty),
        warehouseId: form.warehouseId,
        lines: drawPayload(),
        batchNo: form.batchNo || undefined,
        expiryDate: form.expiryDate || undefined,
        shift: form.shift || undefined,
        producedOn: form.producedOn || undefined,
        notes: form.notes || undefined,
        wastage: wastagePayload(),
      },
      {
        onSuccess: (res) => {
          const wo = res.data;
          const batchNote = form.batchNo ? ` — batch ${form.batchNo}` : '';
          toast(`Production recorded as ${wo.woNumber}${batchNote}`, 'success');
          for (const w of res.warnings ?? []) toast(w, 'info');
          navigate({ to: '/manufacturing/wos/$woId', params: { woId: wo.id } });
        },
        onError: (err) => {
          if (err instanceof ApiClientError && err.statusCode === 422) {
            const shortages = (err.details as unknown as { shortages?: ProductionShortage[] } | undefined)?.shortages;
            if (shortages?.length) { setSubmitShortages(shortages); toast('Stock changed — fix shortages below', 'error'); return; }
          }
          toast((err as Error).message || 'Failed to record production', 'error');
        },
      },
    );
  }

  const shortages = submitShortages ?? preview?.shortages ?? [];
  const canSubmit =
    hasQuery && !previewLoading && shortages.length === 0 &&
    unbalanced.length === 0 && !recordM.isPending;
  const outputLabel = preview
    ? `Will produce ${preview.producedQty} ${preview.outputUom} of ${preview.outputItemName}`
    : null;

  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex-1 pb-20">
        <PageHeader
          breadcrumbs={[
            { label: 'Manufacturing', href: '/manufacturing' },
            { label: 'Work Orders', href: '/manufacturing/wos' },
            { label: 'Record Production' },
          ]}
          title="Record Production"
          description="Log finished goods made without a work order — inputs backflush automatically from the BOM."
          actions={
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit}
              loading={recordM.isPending}
              title={
                shortages.length > 0
                  ? 'Resolve shortages before posting'
                  : unbalanced.length > 0
                    ? `Enter what went in for ${unbalanced.map((a) => a.inputItemName).join(', ')}`
                    : undefined
              }
              style={{ background: '#E11D48', borderColor: '#E11D48' }}
            >
              Post production
            </Button>
          }
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ProductionForm
            state={form}
            onChange={patchForm}
            outputTracksBatches={!!preview?.outputTracksBatches}
            outputLabel={outputLabel}
            errors={errors}
          />
          <div className="flex flex-col gap-4">
            <ProductionLinesPanel
              allocations={preview?.allocations ?? []}
              shortages={shortages}
              draft={draw}
              isLoading={previewLoading || previewFetching}
              hasQuery={hasQuery}
              onQtyChange={handleQtyChange}
              onSuggest={handleSuggest}
            />
            <ProductionWastagePanel
              allocations={preview?.allocations ?? []}
              draft={wastage}
              drawDraft={draw}
              onChange={patchWastage}
            />
          </div>
        </div>
      </div>

      <ProductionCostingStrip preview={preview} draft={draw} isLoading={hasQuery && previewLoading} />
    </div>
  );
}
