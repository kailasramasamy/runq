import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';

// ─── Types ──────────────────────────────────────────────────────────────

export type WarehouseType = 'main' | 'godown' | 'shop' | 'vehicle' | 'virtual';

export interface Warehouse {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  type: WarehouseType;
  address: string | null;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OnHandRow {
  itemId: string;
  itemName: string;
  itemSku: string | null;
  itemUnit: string | null;
  warehouseId: string;
  warehouseName: string;
  batchNo: string;
  qty: number;
  avgCost: number;
  value: number;
  reorderLevel: number | null;
  lastMovementAt: string | null;
}

export interface LedgerRow {
  id: string;
  itemId: string;
  itemName: string;
  itemSku: string | null;
  warehouseId: string;
  warehouseName: string;
  batchNo: string | null;
  movementType: string;
  sourceType: string;
  sourceId: string;
  qtyIn: number;
  qtyOut: number;
  unitCost: number;
  runningQty: number;
  runningValue: number;
  movedAt: string;
  postedAt: string;
}

export interface Grn {
  id: string;
  grnNo: string;
  warehouseId: string;
  warehouseName: string;
  vendorId: string | null;
  vendorName: string | null;
  receivedDate: string;
  status: 'draft' | 'posted' | 'cancelled';
  totalValue: string;
  notes: string | null;
  vehicleNo: string | null;
  lrNo: string | null;
  journalEntryId: string | null;
  postedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
}

export interface GrnLine {
  id: string;
  itemId: string;
  itemName: string;
  itemSku: string | null;
  trackBatches: boolean;
  batchNo: string | null;
  mfgDate: string | null;
  expiryDate: string | null;
  qty: string;
  uom: string | null;
  unitRate: string;
  landedCostPerUnit: string;
  lineTotal: string;
  notes: string | null;
}

export interface GrnDetail extends Grn { lines: GrnLine[] }

export interface DeliveryNote {
  id: string;
  dnNo: string;
  warehouseId: string;
  warehouseName: string;
  customerId: string | null;
  customerName: string | null;
  dispatchDate: string;
  status: 'draft' | 'dispatched' | 'cancelled';
  totalValue: string;
  notes: string | null;
  vehicleNo: string | null;
  lrNo: string | null;
  eWayBillNo: string | null;
  journalEntryId: string | null;
  dispatchedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
}

export interface DnLine {
  id: string;
  itemId: string;
  itemName: string;
  itemSku: string | null;
  trackBatches: boolean;
  batchNo: string | null;
  qty: string;
  uom: string | null;
  unitCost: string;
  lineTotal: string;
}

export interface DeliveryNoteDetail extends DeliveryNote { lines: DnLine[] }

export interface InventoryKpis {
  totalValue: number;
  activeRows: number;
  lowStockCount: number;
  todayGrns: number;
  todayDeliveries: number;
}

// ─── Keys ──────────────────────────────────────────────────────────────

export const INV_KEYS = {
  warehouses: ['inv', 'warehouses'] as const,
  warehouse: (id: string) => ['inv', 'warehouses', id] as const,
  onHand: (filter?: Record<string, unknown>) => ['inv', 'on-hand', filter] as const,
  ledger: (filter?: Record<string, unknown>) => ['inv', 'ledger', filter] as const,
  grnList: (filter?: Record<string, unknown>) => ['inv', 'grn', 'list', filter] as const,
  grn: (id: string) => ['inv', 'grn', id] as const,
  dnList: (filter?: Record<string, unknown>) => ['inv', 'dn', 'list', filter] as const,
  dn: (id: string) => ['inv', 'dn', id] as const,
  dashboard: ['inv', 'dashboard'] as const,
};

const get = <T,>(r: { data: T }): T => r.data;

// ─── Warehouses ─────────────────────────────────────────────────────────

export function useWarehouses() {
  return useQuery({
    queryKey: INV_KEYS.warehouses,
    queryFn: () => api.get<{ data: Warehouse[] }>('/inventory/warehouses').then(get),
  });
}

export function useWarehouse(id: string) {
  return useQuery({
    queryKey: INV_KEYS.warehouse(id),
    queryFn: () => api.get<{ data: Warehouse }>(`/inventory/warehouses/${id}`).then(get),
    enabled: !!id,
  });
}

export function useCreateWarehouse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Warehouse>) =>
      api.post<{ data: Warehouse }>('/inventory/warehouses', body).then(get),
    onSuccess: () => qc.invalidateQueries({ queryKey: INV_KEYS.warehouses }),
  });
}

export function useUpdateWarehouse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<Warehouse> & { id: string }) =>
      api.put<{ data: Warehouse }>(`/inventory/warehouses/${id}`, body).then(get),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: INV_KEYS.warehouses });
      qc.invalidateQueries({ queryKey: INV_KEYS.warehouse(v.id) });
    },
  });
}

export function useDeleteWarehouse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ data: Warehouse }>(`/inventory/warehouses/${id}`).then(get),
    onSuccess: () => qc.invalidateQueries({ queryKey: INV_KEYS.warehouses }),
  });
}

// ─── Stock visibility ──────────────────────────────────────────────────

export function useOnHand(filter: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: INV_KEYS.onHand(filter),
    queryFn: () =>
      api
        .get<{ data: OnHandRow[] }>(`/inventory/stock/on-hand${qs(filter)}`)
        .then(get),
  });
}

export function useLedger(filter: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: INV_KEYS.ledger(filter),
    queryFn: () =>
      api.get<{ data: LedgerRow[] }>(`/inventory/stock/ledger${qs(filter)}`).then(get),
  });
}

// ─── GRN ───────────────────────────────────────────────────────────────

export interface GrnLineInput {
  itemId: string;
  batchNo?: string | null;
  mfgDate?: string | null;
  expiryDate?: string | null;
  qty: number;
  uom?: string | null;
  unitRate: number;
  landedCostPerUnit?: number;
  notes?: string | null;
}

export interface CreateGrnBody {
  warehouseId: string;
  vendorId?: string | null;
  receivedDate: string;
  vehicleNo?: string | null;
  lrNo?: string | null;
  notes?: string | null;
  lines: GrnLineInput[];
}

export function useGrnList(filter: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: INV_KEYS.grnList(filter),
    queryFn: () =>
      api.get<{
        data: Grn[]; page: number; limit: number; total: number; totalPages: number;
      }>(`/inventory/grn${qs(filter)}`),
  });
}

export function useGrn(id: string) {
  return useQuery({
    queryKey: INV_KEYS.grn(id),
    queryFn: () => api.get<{ data: GrnDetail }>(`/inventory/grn/${id}`).then(get),
    enabled: !!id,
  });
}

export function useCreateGrn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateGrnBody) =>
      api.post<{ data: Grn }>('/inventory/grn', body).then(get),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inv', 'grn'] });
      qc.invalidateQueries({ queryKey: INV_KEYS.dashboard });
    },
  });
}

export function usePostGrn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<{ data: Grn }>(`/inventory/grn/${id}/post`, {}).then(get),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ['inv'] });
      qc.invalidateQueries({ queryKey: INV_KEYS.grn(id) });
    },
  });
}

export function useCancelGrn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; reason: string }) =>
      api.post<{ data: Grn }>(`/inventory/grn/${v.id}/cancel`, { reason: v.reason }).then(get),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['inv'] });
      qc.invalidateQueries({ queryKey: INV_KEYS.grn(v.id) });
    },
  });
}

// ─── Delivery notes ────────────────────────────────────────────────────

export interface DnLineInput {
  itemId: string;
  batchNo?: string | null;
  qty: number;
  uom?: string | null;
}

export interface CreateDnBody {
  warehouseId: string;
  customerId?: string | null;
  dispatchDate: string;
  vehicleNo?: string | null;
  lrNo?: string | null;
  eWayBillNo?: string | null;
  notes?: string | null;
  lines: DnLineInput[];
}

export function useDnList(filter: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: INV_KEYS.dnList(filter),
    queryFn: () =>
      api.get<{
        data: DeliveryNote[]; page: number; limit: number; total: number; totalPages: number;
      }>(`/inventory/delivery-notes${qs(filter)}`),
  });
}

export function useDn(id: string) {
  return useQuery({
    queryKey: INV_KEYS.dn(id),
    queryFn: () => api.get<{ data: DeliveryNoteDetail }>(`/inventory/delivery-notes/${id}`).then(get),
    enabled: !!id,
  });
}

export function useCreateDn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateDnBody) =>
      api.post<{ data: DeliveryNote }>('/inventory/delivery-notes', body).then(get),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inv', 'dn'] }),
  });
}

export function useDispatchDn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ data: DeliveryNote }>(`/inventory/delivery-notes/${id}/dispatch`, {}).then(get),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inv'] }),
  });
}

export function useCancelDn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; reason: string }) =>
      api.post<{ data: DeliveryNote }>(`/inventory/delivery-notes/${v.id}/cancel`, { reason: v.reason }).then(get),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inv'] }),
  });
}

// ─── Dashboard ────────────────────────────────────────────────────────

export function useInventoryDashboard() {
  return useQuery({
    queryKey: INV_KEYS.dashboard,
    queryFn: () => api.get<{ data: InventoryKpis }>('/inventory/dashboard').then(get),
  });
}

// ─── Transfers ─────────────────────────────────────────────────────────

export interface Transfer {
  id: string;
  transferNo: string;
  fromWarehouseId: string;
  fromWarehouseName: string;
  toWarehouseId: string;
  toWarehouseName: string;
  status: 'draft' | 'in_transit' | 'received' | 'cancelled';
  totalValue: string;
  vehicleNo: string | null;
  notes: string | null;
  dispatchedAt: string | null;
  receivedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
}

export interface TransferLine {
  id: string;
  itemId: string;
  itemName: string;
  itemSku: string | null;
  trackBatches: boolean;
  batchNo: string | null;
  qty: string;
  qtyReceived: string;
  unitCost: string;
  lineTotal: string;
}

export interface TransferDetail extends Transfer { lines: TransferLine[] }

export interface CreateTransferBody {
  fromWarehouseId: string;
  toWarehouseId: string;
  vehicleNo?: string | null;
  notes?: string | null;
  lines: { itemId: string; batchNo?: string | null; qty: number }[];
}

export const INV_TRANSFER_KEYS = {
  list: (f?: Record<string, unknown>) => ['inv', 'transfers', 'list', f] as const,
  detail: (id: string) => ['inv', 'transfers', id] as const,
};

export function useTransferList(filter: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: INV_TRANSFER_KEYS.list(filter),
    queryFn: () =>
      api.get<{ data: Transfer[]; page: number; limit: number; total: number; totalPages: number }>(
        `/inventory/transfers${qs(filter)}`,
      ),
  });
}

export function useTransfer(id: string) {
  return useQuery({
    queryKey: INV_TRANSFER_KEYS.detail(id),
    queryFn: () => api.get<{ data: TransferDetail }>(`/inventory/transfers/${id}`).then(get),
    enabled: !!id,
  });
}

export function useCreateTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTransferBody) =>
      api.post<{ data: Transfer }>('/inventory/transfers', body).then(get),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inv', 'transfers'] }),
  });
}

export function useDispatchTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ data: Transfer }>(`/inventory/transfers/${id}/dispatch`, {}).then(get),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inv'] }),
  });
}

export function useReceiveTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; lineReceipts?: { lineId: string; qtyReceived: number }[] }) =>
      api
        .post<{ data: Transfer }>(`/inventory/transfers/${v.id}/receive`, { lineReceipts: v.lineReceipts })
        .then(get),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inv'] }),
  });
}

export function useCancelTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; reason: string }) =>
      api.post<{ data: Transfer }>(`/inventory/transfers/${v.id}/cancel`, { reason: v.reason }).then(get),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inv'] }),
  });
}

// ─── Adjustments ───────────────────────────────────────────────────────

export type AdjustmentReason =
  | 'damage' | 'expiry' | 'theft' | 'found' | 'revaluation' | 'correction' | 'opening_balance';

export interface Adjustment {
  id: string;
  adjNo: string;
  warehouseId: string;
  warehouseName: string;
  reason: AdjustmentReason;
  adjustmentDate: string;
  status: 'draft' | 'pending_approval' | 'posted' | 'cancelled';
  requiresApproval: boolean;
  totalValueDelta: string;
  notes: string | null;
  journalEntryId: string | null;
  postedAt: string | null;
  createdAt: string;
}

export interface AdjustmentLine {
  id: string;
  itemId: string;
  itemName: string;
  itemSku: string | null;
  trackBatches: boolean;
  batchNo: string | null;
  qtyDelta: string;
  unitCost: string;
  valueDelta: string;
  notes: string | null;
}

export interface AdjustmentDetail extends Adjustment { lines: AdjustmentLine[] }

export interface CreateAdjustmentBody {
  warehouseId: string;
  reason: AdjustmentReason;
  adjustmentDate: string;
  notes?: string | null;
  requiresApproval?: boolean;
  lines: {
    itemId: string;
    batchNo?: string | null;
    qtyDelta: number;
    unitCost?: number;
    notes?: string | null;
  }[];
}

export const INV_ADJ_KEYS = {
  list: (f?: Record<string, unknown>) => ['inv', 'adjustments', 'list', f] as const,
  detail: (id: string) => ['inv', 'adjustments', id] as const,
};

export function useAdjustmentList(filter: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: INV_ADJ_KEYS.list(filter),
    queryFn: () =>
      api.get<{
        data: Adjustment[]; page: number; limit: number; total: number; totalPages: number;
      }>(`/inventory/adjustments${qs(filter)}`),
  });
}

export function useAdjustment(id: string) {
  return useQuery({
    queryKey: INV_ADJ_KEYS.detail(id),
    queryFn: () => api.get<{ data: AdjustmentDetail }>(`/inventory/adjustments/${id}`).then(get),
    enabled: !!id,
  });
}

export function useCreateAdjustment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateAdjustmentBody) =>
      api.post<{ data: Adjustment }>('/inventory/adjustments', body).then(get),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inv', 'adjustments'] }),
  });
}

export function useApproveAdjustment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ data: Adjustment }>(`/inventory/adjustments/${id}/approve`, {}).then(get),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inv', 'adjustments'] }),
  });
}

export function usePostAdjustment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ data: Adjustment }>(`/inventory/adjustments/${id}/post`, {}).then(get),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inv'] }),
  });
}

export function useCancelAdjustment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; reason: string }) =>
      api
        .post<{ data: Adjustment }>(`/inventory/adjustments/${v.id}/cancel`, { reason: v.reason })
        .then(get),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inv', 'adjustments'] }),
  });
}

// ─── Stock take ────────────────────────────────────────────────────────

export interface StockTake {
  id: string;
  stNo: string;
  warehouseId: string;
  warehouseName: string;
  scope: 'full' | 'partial' | 'cycle';
  status: 'in_progress' | 'reviewed' | 'posted' | 'cancelled';
  frozen: boolean;
  startedAt: string;
  completedAt: string | null;
  adjustmentId: string | null;
  notes: string | null;
}

export interface StockTakeLine {
  id: string;
  itemId: string;
  itemName: string;
  itemSku: string | null;
  itemUnit: string | null;
  batchNo: string | null;
  systemQty: string;
  countedQty: string | null;
  unitCost: string;
  recountFlag: boolean;
  variance: number | null;
}

export interface StockTakeDetail extends StockTake { lines: StockTakeLine[] }

export const INV_ST_KEYS = {
  list: (f?: Record<string, unknown>) => ['inv', 'stock-takes', 'list', f] as const,
  detail: (id: string) => ['inv', 'stock-takes', id] as const,
};

export function useStockTakeList(filter: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: INV_ST_KEYS.list(filter),
    queryFn: () =>
      api.get<{
        data: StockTake[]; page: number; limit: number; total: number; totalPages: number;
      }>(`/inventory/stock-takes${qs(filter)}`),
  });
}

export function useStockTake(id: string) {
  return useQuery({
    queryKey: INV_ST_KEYS.detail(id),
    queryFn: () => api.get<{ data: StockTakeDetail }>(`/inventory/stock-takes/${id}`).then(get),
    enabled: !!id,
  });
}

export function useStartStockTake() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      warehouseId: string; scope?: 'full' | 'partial' | 'cycle';
      categoryId?: string | null; notes?: string | null; freeze?: boolean;
    }) => api.post<{ data: StockTake }>('/inventory/stock-takes', body).then(get),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inv', 'stock-takes'] }),
  });
}

export function useUpsertCountLines() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: {
      id: string;
      lines: { itemId: string; batchNo?: string | null; countedQty: number }[];
    }) =>
      api.post<{ data: { upserted: number } }>(
        `/inventory/stock-takes/${v.id}/lines`,
        { lines: v.lines },
      ).then(get),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: INV_ST_KEYS.detail(v.id) }),
  });
}

export function useUpdateCountLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; lineId: string; countedQty: number; recountFlag?: boolean }) =>
      api.put<{ data: StockTakeLine }>(
        `/inventory/stock-takes/${v.id}/lines/${v.lineId}`,
        { countedQty: v.countedQty, recountFlag: v.recountFlag },
      ).then(get),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: INV_ST_KEYS.detail(v.id) }),
  });
}

export function usePostStockTake() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ data: StockTake }>(`/inventory/stock-takes/${id}/post`, {}).then(get),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inv'] }),
  });
}

export function useCancelStockTake() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ data: StockTake }>(`/inventory/stock-takes/${id}/cancel`, {}).then(get),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inv', 'stock-takes'] }),
  });
}

// ─── Reorder + expiry ──────────────────────────────────────────────────

export interface ReorderAlert {
  itemId: string;
  warehouseId: string;
  itemName: string;
  itemSku: string | null;
  itemUnit: string | null;
  warehouseName: string;
  reorderLevel: number;
  reorderQty: number;
  leadTimeDays: number | null;
  onHand: number;
  shortBy: number;
}

export function useReorderAlerts() {
  return useQuery({
    queryKey: ['inv', 'reorder-alerts'] as const,
    queryFn: () => api.get<{ data: ReorderAlert[] }>('/inventory/stock/reorder-alerts').then(get),
  });
}

export interface ExpiryRow {
  itemId: string;
  warehouseId: string;
  batchNo: string;
  qty: number;
  value: number;
  itemName: string;
  itemSku: string | null;
  itemUnit: string | null;
  warehouseName: string;
  expiryDate: string;
  daysToExpiry: number;
}

export function useExpiring(args: { withinDays: number; includeExpired?: boolean }) {
  return useQuery({
    queryKey: ['inv', 'expiring', args] as const,
    queryFn: () =>
      api
        .get<{ data: ExpiryRow[] }>(`/inventory/stock/expiring${qs(args)}`)
        .then(get),
  });
}

// ─── helpers ───────────────────────────────────────────────────────────

function qs(filter: Record<string, unknown>) {
  const entries = Object.entries(filter).filter(
    ([, v]) => v !== undefined && v !== null && v !== '',
  );
  if (entries.length === 0) return '';
  const sp = new URLSearchParams();
  for (const [k, v] of entries) sp.set(k, String(v));
  return `?${sp.toString()}`;
}
