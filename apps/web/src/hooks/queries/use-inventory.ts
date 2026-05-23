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
