import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { PaginatedResponse, ApiSuccess } from '@runq/types';
import type {
  CreateVmccInput, CreateChillingCentreInput, CreateProcessingPlantInput,
  UpdateVmccInput, UpdateChillingCentreInput, UpdateProcessingPlantInput,
  CreateFarmerInput, UpdateFarmerInput,
  CreateRateChartInput, RecordPourInput, CreateLedgerEntryInput,
  CreateConsignmentInput, ReceiveConsignmentInput, CreatePayoutCycleInput,
  CreateNodeOperatorInput, UpdateNodeOperatorInput, UpsertGlSettingsInput, CreateOperatorPayoutInput,
  CloseShiftInput, ReopenShiftInput,
} from '@runq/validators';

const BASE = '/milk-procurement';

// ── row shapes (API JSON; web doesn't import @runq/db) ────────────────────
export type MilkType = 'cow' | 'buffalo' | 'mixed' | 'cow_a1' | 'cow_a2';

export function milkTypeLabel(t: MilkType): string {
  switch (t) {
    case 'cow_a1': return 'Cow A1 (regular)';
    case 'cow_a2': return 'Cow A2 (desi)';
    case 'buffalo': return 'Buffalo';
    case 'mixed': return 'Mixed';
    case 'cow': return 'Cow (legacy)';
  }
}

export type NodeType = 'vmcc' | 'cc' | 'pp';
export type PayoutMode = 'direct_to_farmer' | 'via_vmcc';

export type MeasurementMode = 'analyzer' | 'lactometer';

export interface MpNode {
  id: string; code: string; name: string; nodeType: NodeType;
  parentNodeId: string | null; hasBmc: boolean;
  dispatchMode: 'per_shift' | 'day' | 'overnight'; capacityLitres: string | null;
  payoutMode: PayoutMode | null; payeeVendorId: string | null;
  measurementMode: MeasurementMode;
  collectionShifts: 'both' | 'am' | 'pm';
  allowedMilkTypes: MilkType[] | null;
  defaultMilkType: MilkType | null;
  rateChartId: string | null;
  city: string | null; state: string | null; isActive: boolean;
}
export type CattleBreed = 'desi_natti' | 'crossbred' | 'jersey' | 'hf' | 'gir' | 'sahiwal' | 'murrah' | 'other';
export interface CattleBreedCount { breed: CattleBreed; count: number }
export interface MpFarmerAttachment { id: string; kind: string; fileName: string; fileSize: number; mimeType: string }

export interface MpFarmer {
  id: string; code: string; name: string; phone: string | null; vendorId: string;
  isSociety: boolean; defaultMilkType: MilkType; suppliedMilkTypes?: MilkType[] | null;
  primaryNodeId?: string | null; cattleCount: number | null; isActive: boolean;
  village?: string | null; address?: string | null; aadhaar?: string | null;
  cattleBreeds?: CattleBreedCount[] | null; inMilkCount?: number | null;
  lat?: number | null; lng?: number | null;
  bankAccountName?: string | null; bankAccountNumber?: string | null;
  bankIfsc?: string | null; bankName?: string | null; upiId?: string | null;
  profilePhotoUrl?: string | null;
  rateChartId?: string | null;
}
export interface MpRateChart {
  id: string; name: string; milkType: MilkType; pricingMode: 'matrix' | 'flat' | 'clr';
  flatRatePerLitre: string | null; scopeNodeId: string | null; season: string | null;
  effectiveFrom: string; effectiveTo: string | null; isActive: boolean;
  /** Anti-dilution SNF floor; null = gate off. */
  snfGateMin: string | null;
  /** SNF shown on every row of a FAT-only chart. Display only. */
  referenceSnf: string | null;
}
/** Picker label for a rate chart: name · milk type · mode. */
export function rateChartLabel(c: MpRateChart): string {
  return `${c.name} · ${milkTypeLabel(c.milkType)} · ${c.pricingMode}${c.isActive ? '' : ' (inactive)'}`;
}
export interface MpRateCell {
  id: string;
  fat: string | null; snf: string | null; clr: string | null;
  ratePerLitre: string;
}
export interface MpRateRule {
  id: string; ruleType: 'quality_bonus' | 'volume_slab' | 'quarterly_fat_bonus'; grade: string | null;
  minQty: string | null; maxQty: string | null;
  /** Tier floor for `quarterly_fat_bonus`; null for the per-pour rule types. */
  fatMin: string | null;
  bonusPerLitre: string;
}
export interface MpRateChartDetail extends MpRateChart { cells: MpRateCell[]; rules: MpRateRule[] }
export interface MpRateResolution {
  rateChartId: string; baseRatePerLitre: number; bonusPerLitre: number;
  ratePerLitre: number; grade: 'a' | 'b' | 'c' | null;
}
export interface MpPour {
  id: string; nodeId: string; farmerId: string; collectionDate: string;
  shift: 'am' | 'pm'; milkType: MilkType; qtyLitres: string; fat: string | null; snf: string | null;
  clr: string | null; water: number | null;
  qualityGrade: string | null; ratePerLitre: string; lineAmount: string; receiptNo: string | null;
  status: 'recorded' | 'reversed';
}
export interface MpMilkTypeRow {
  milkType: MilkType;
  totalQty: number; amQty: number; pmQty: number; pourCount: number;
  farmerCount: number; avgFat: number; avgSnf: number; avgWater: number; grossAmount: number;
}
export interface MpCollectionNodeRow {
  nodeId: string; nodeName: string; nodeCode: string; nodeType: NodeType;
  totalQty: number; amQty: number; pmQty: number; pourCount: number;
  farmerCount: number; avgFat: number; avgSnf: number; avgWater: number; grossAmount: number;
}
export interface MpCollectionSummary {
  from: string; to: string; nodeId: string | null;
  totalQty: number; amQty: number; pmQty: number; pourCount: number;
  farmerCount: number; avgFat: number; avgSnf: number; avgWater: number | null; grossAmount: number;
  byMilkType: MpMilkTypeRow[];
  byCc: MpCollectionNodeRow[];
  byNode: MpCollectionNodeRow[];
}
export interface MpLedgerEntry {
  id: string; farmerId: string; entryType: string; amount: string;
  balanceAfter: string; occurredOn: string;
}

export const MP_KEYS = {
  nodes: (f?: unknown) => ['mp', 'nodes', f] as const,
  farmers: (f?: unknown) => ['mp', 'farmers', f] as const,
  rateCharts: (f?: unknown) => ['mp', 'rate-charts', f] as const,
  rateChart: (id: string) => ['mp', 'rate-charts', id] as const,
  resolveRate: (f?: unknown) => ['mp', 'rate-charts', 'resolve', f] as const,
  pours: (f?: unknown) => ['mp', 'pours', f] as const,
  ledger: (farmerId?: string) => ['mp', 'ledger', farmerId] as const,
  collection: (f?: unknown) => ['mp', 'reports', 'collection', f] as const,
  qualityBands: (nodeId?: string) => ['mp', 'quality-bands', nodeId ?? null] as const,
  qualityBandsConfig: (nodeId?: string) => ['mp', 'quality-bands-config', nodeId ?? null] as const,
};

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : '';
}

// ── nodes ─────────────────────────────────────────────────────────────────
// Reads are shared across all node types; writes are type-specific resources.
export type CreateNodeBody = CreateVmccInput | CreateChillingCentreInput | CreateProcessingPlantInput;
export type UpdateNodeBody = UpdateVmccInput | UpdateChillingCentreInput | UpdateProcessingPlantInput;

/** Map a node type to its dedicated write resource. */
export function nodeEndpoint(nodeType: NodeType): string {
  switch (nodeType) {
    case 'vmcc': return '/vmccs';
    case 'cc': return '/chilling-centres';
    case 'pp': return '/processing-plants';
  }
}

export function useNodes(filters?: { nodeType?: NodeType; search?: string; limit?: number }) {
  return useQuery({
    queryKey: MP_KEYS.nodes(filters),
    queryFn: () => api.get<PaginatedResponse<MpNode>>(`${BASE}/nodes${qs({ ...filters })}`),
  });
}
export function useNode(id: string) {
  return useQuery({
    queryKey: ['mp', 'nodes', id],
    queryFn: () => api.get<ApiSuccess<MpNode>>(`${BASE}/nodes/${id}`),
    enabled: !!id,
  });
}
export function useCreateNode(nodeType: NodeType) {
  const c = useQueryClient();
  return useMutation({
    mutationFn: (d: CreateNodeBody) => api.post<ApiSuccess<MpNode>>(`${BASE}${nodeEndpoint(nodeType)}`, d),
    onSuccess: () => c.invalidateQueries({ queryKey: ['mp', 'nodes'] }),
  });
}
export function useUpdateNode(nodeType: NodeType) {
  const c = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateNodeBody }) =>
      api.put<ApiSuccess<MpNode>>(`${BASE}${nodeEndpoint(nodeType)}/${id}`, data),
    onSuccess: () => {
      c.invalidateQueries({ queryKey: ['mp', 'nodes'] });
      // a changed rate-chart override invalidates cached rate previews
      c.invalidateQueries({ queryKey: ['mp', 'rate-charts', 'resolve'] });
    },
  });
}
export function useDeactivateNode() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: ({ id, nodeType }: { id: string; nodeType: NodeType }) =>
      api.post<ApiSuccess<MpNode>>(`${BASE}${nodeEndpoint(nodeType)}/${id}/deactivate`, {}),
    onSuccess: () => c.invalidateQueries({ queryKey: ['mp', 'nodes'] }),
  });
}

// ── farmers ─────────────────────────────────────────────────────────────────
export function useFarmers(filters?: { nodeId?: string; search?: string; limit?: number }) {
  return useQuery({
    queryKey: MP_KEYS.farmers(filters),
    queryFn: () => api.get<PaginatedResponse<MpFarmer>>(`${BASE}/farmers${qs({ ...filters })}`),
  });
}
export function useFarmer(id: string) {
  return useQuery({
    queryKey: ['mp', 'farmers', 'detail', id],
    queryFn: () => api.get<ApiSuccess<MpFarmer>>(`${BASE}/farmers/${id}`),
    enabled: !!id,
  });
}
export function useCreateFarmer() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: (d: CreateFarmerInput) => api.post<ApiSuccess<MpFarmer>>(`${BASE}/farmers`, d),
    onSuccess: () => c.invalidateQueries({ queryKey: ['mp', 'farmers'] }),
  });
}
export function useUpdateFarmer() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateFarmerInput }) =>
      api.put<ApiSuccess<MpFarmer>>(`${BASE}/farmers/${id}`, data),
    onSuccess: () => {
      c.invalidateQueries({ queryKey: ['mp', 'farmers'] });
      // a changed rate-chart override invalidates cached rate previews
      c.invalidateQueries({ queryKey: ['mp', 'rate-charts', 'resolve'] });
    },
  });
}
export function useDeleteFarmer() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`${BASE}/farmers/${id}`),
    onSuccess: () => c.invalidateQueries({ queryKey: ['mp', 'farmers'] }),
  });
}

export function useUploadFarmerAttachment(farmerId: string) {
  const c = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, kind }: { file: File; kind: 'profile_photo' | 'kyc' | 'aadhaar' | 'other' }) => {
      const form = new FormData();
      form.append('file', file);
      form.append('kind', kind);
      const json = await api.upload<ApiSuccess<MpFarmerAttachment>>(
        `${BASE}/farmers/${farmerId}/attachments`,
        form,
      );
      return json.data;
    },
    onSuccess: () => c.invalidateQueries({ queryKey: ['mp', 'farmers'] }),
  });
}

// ── rate charts ─────────────────────────────────────────────────────────────
export function useRateCharts(filters?: { milkType?: MilkType; limit?: number }) {
  return useQuery({
    queryKey: MP_KEYS.rateCharts(filters),
    queryFn: () => api.get<PaginatedResponse<MpRateChart>>(`${BASE}/rate-charts${qs({ ...filters })}`),
  });
}
export function useRateChart(id: string) {
  return useQuery({
    queryKey: MP_KEYS.rateChart(id),
    queryFn: () => api.get<ApiSuccess<MpRateChartDetail>>(`${BASE}/rate-charts/${id}`),
    enabled: !!id,
  });
}
export function useCreateRateChart() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: (d: CreateRateChartInput) => api.post<ApiSuccess<MpRateChartDetail>>(`${BASE}/rate-charts`, d),
    onSuccess: () => c.invalidateQueries({ queryKey: ['mp', 'rate-charts'] }),
  });
}

// ── rate chart assignments ───────────────────────────────────────────────────
export type RateScope = 'tenant' | 'node' | 'farmer';
export type PricingFamily = 'fat_snf' | 'clr';
/** Where the effective chart came from, relative to the scope being viewed. */
export type AssignmentSource = 'own' | 'node' | 'parent' | 'tenant';

export interface MpEffectiveAssignment {
  milkType: MilkType;
  pricingFamily: PricingFamily;
  rateChartId: string;
  chartName: string;
  pricingMode: 'matrix' | 'flat' | 'clr';
  chartActive: boolean;
  source: AssignmentSource;
}

/** Everything pricing this scope, inherited rows included. */
export function useEffectiveAssignments(scopeType: RateScope, scopeId?: string) {
  return useQuery({
    queryKey: ['mp', 'rate-assign', scopeType, scopeId ?? 'tenant'],
    queryFn: () => api.get<ApiSuccess<MpEffectiveAssignment[]>>(
      `${BASE}/rate-charts/assignments/effective${qs({ scopeType, scopeId })}`),
    enabled: scopeType === 'tenant' || !!scopeId,
  });
}

/** One day+shift of a bulk VMCC's supply, priced — the audit trail behind a bill. */
export interface MpVmccBillDetailLine {
  date: string;
  shift: 'am' | 'pm';
  milkType: MilkType;
  qtyLitres: number;
  fat: number | null;
  snf: number | null;
  water: number | null;
  ratePerLitre: number | null;
  amount: number;
}
export interface MpVmccBillDetail {
  periodStart: string;
  periodEnd: string;
  lines: MpVmccBillDetailLine[];
  totalQty: number;
  totalAmount: number;
  unpricedLines: number;
}

export function useVmccBillDetail(
  params: { year: number; month: number; half: 'first' | 'second'; vmccNodeId: string } | null,
) {
  return useQuery({
    queryKey: ['mp', 'billing', 'vmcc-detail', params],
    queryFn: () => api.get<ApiSuccess<MpVmccBillDetail>>(`${BASE}/billing/vmcc-detail${qs({ ...params! })}`),
    enabled: !!params,
  });
}

/** Effective slots keyed by node id — one call for a whole list. */
export function useAssignmentsByNode() {
  return useQuery({
    queryKey: ['mp', 'rate-assign', 'by-node'],
    queryFn: () => api.get<ApiSuccess<Record<string, MpEffectiveAssignment[]>>>(
      `${BASE}/rate-charts/assignments/by-node`),
  });
}

/** Invalidate every assignment view + cached rate previews after a change. */
function invalidateAssignments(c: ReturnType<typeof useQueryClient>) {
  c.invalidateQueries({ queryKey: ['mp', 'rate-assign'] });
  c.invalidateQueries({ queryKey: ['mp', 'rate-charts', 'resolve'] });
}

export function useAssignRateChart() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: (d: { scopeType: RateScope; scopeId?: string; rateChartId: string }) =>
      api.put<ApiSuccess<unknown>>(`${BASE}/rate-charts/assignments`, d),
    onSuccess: () => invalidateAssignments(c),
  });
}

export function useUnassignRateChart() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: (d: { scopeType: RateScope; scopeId?: string; milkType: MilkType; pricingFamily: PricingFamily }) =>
      api.delete<ApiSuccess<unknown>>(`${BASE}/rate-charts/assignments${qs({ ...d })}`),
    onSuccess: () => invalidateAssignments(c),
  });
}
export function useDeactivateRateChart() {
  const c = useQueryClient();
  return useMutation({
    // `force` retries past the guard that refuses to leave a scope unpriced.
    mutationFn: ({ id, force }: { id: string; force?: boolean }) =>
      api.post<ApiSuccess<MpRateChart>>(`${BASE}/rate-charts/${id}/deactivate`, { force: force ?? false }),
    onSuccess: () => c.invalidateQueries({ queryKey: ['mp', 'rate-charts'] }),
  });
}
export function useResolveRate(params: {
  milkType: MilkType; fat?: number; snf?: number; clr?: number;
  cycleQtyLitres?: number; scopeNodeId?: string; onDate?: string;
} | null) {
  return useQuery({
    queryKey: MP_KEYS.resolveRate(params),
    queryFn: () => api.get<ApiSuccess<MpRateResolution>>(`${BASE}/rate-charts/resolve${qs({ ...params! })}`),
    enabled: !!params,
  });
}

// ── pours ─────────────────────────────────────────────────────────────────
export function usePours(filters?: {
  nodeId?: string; farmerId?: string; collectionDate?: string;
  from?: string; to?: string; shift?: string; status?: string; page?: number; limit?: number;
}) {
  return useQuery({
    queryKey: MP_KEYS.pours(filters),
    queryFn: () => api.get<PaginatedResponse<MpPour>>(`${BASE}/pours${qs({ ...filters })}`),
  });
}
/** A farmer's recorded pours over a window — backs the farmer bill's View.
 *  Unlike a bulk VMCC, a farmer has real pours, so each pour is a line already. */
export function useFarmerBillPours(
  params: { farmerId: string; from: string; to: string } | null,
) {
  return useQuery({
    queryKey: MP_KEYS.pours({ ...params, status: 'recorded' }),
    queryFn: () => api.get<PaginatedResponse<MpPour>>(
      `${BASE}/pours${qs({ ...params!, status: 'recorded', limit: 500 })}`),
    enabled: !!params,
  });
}

export function useRecordPour() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: (d: RecordPourInput) => api.post<ApiSuccess<MpPour>>(`${BASE}/pours`, d),
    onSuccess: () => c.invalidateQueries({ queryKey: ['mp', 'pours'] }),
  });
}
export interface CorrectPourBody {
  qtyLitres: number; fat?: number | null; snf?: number | null;
  clr?: number | null; water?: number | null;
}
export function useCorrectPour() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: CorrectPourBody }) =>
      api.post<ApiSuccess<MpPour>>(`${BASE}/pours/${id}/correct`, data),
    // a correction reverses+repriced → refresh pour lists and the daily reports
    onSuccess: () => {
      c.invalidateQueries({ queryKey: ['mp', 'pours'] });
      c.invalidateQueries({ queryKey: ['mp', 'reports'] });
    },
  });
}

/** Remove a wrongly recorded pour — soft-reverses it, keeping the audit trail. */
export function useReversePour() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<ApiSuccess<MpPour>>(`${BASE}/pours/${id}/reverse`, {}),
    onSuccess: () => {
      c.invalidateQueries({ queryKey: ['mp', 'pours'] });
      c.invalidateQueries({ queryKey: ['mp', 'reports'] });
    },
  });
}

// ── shift close (per-slot collection close + dispatch gate) ──────────────────
export interface MpShiftStatus { am: boolean; pm: boolean }
function invalidateAfterClose(c: ReturnType<typeof useQueryClient>) {
  c.invalidateQueries({ queryKey: ['mp', 'pours'] });
  c.invalidateQueries({ queryKey: ['mp', 'shift-status'] });
  c.invalidateQueries({ queryKey: ['mp', 'consignments', 'available'] });
}
export function useShiftStatus(nodeId: string, date: string) {
  return useQuery({
    queryKey: ['mp', 'shift-status', nodeId, date],
    queryFn: () => api.get<ApiSuccess<MpShiftStatus>>(`${BASE}/shifts/status${qs({ nodeId, date })}`),
    enabled: !!nodeId && !!date,
  });
}
export function useCloseShift() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: (d: CloseShiftInput) => api.post<ApiSuccess<MpShiftStatus>>(`${BASE}/shifts/close`, d),
    onSuccess: () => invalidateAfterClose(c),
  });
}
export function useReopenShift() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: (d: ReopenShiftInput) => api.post<ApiSuccess<MpShiftStatus>>(`${BASE}/shifts/reopen`, d),
    onSuccess: () => invalidateAfterClose(c),
  });
}

// ── payout ledger ───────────────────────────────────────────────────────────
export function useFarmerLedger(farmerId?: string) {
  return useQuery({
    queryKey: MP_KEYS.ledger(farmerId),
    queryFn: () => api.get<ApiSuccess<{ balance: number; entries: MpLedgerEntry[] }>>(`${BASE}/payouts/ledger${qs({ farmerId })}`),
    enabled: !!farmerId,
  });
}
export function useAddLedgerEntry() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: (d: CreateLedgerEntryInput) => api.post<ApiSuccess<MpLedgerEntry>>(`${BASE}/payouts/ledger`, d),
    onSuccess: () => c.invalidateQueries({ queryKey: ['mp', 'ledger'] }),
  });
}

// ── reports ─────────────────────────────────────────────────────────────────
// Qty-weighted per-day QC rollups, newest day first (see report.service.ts).
export interface MpPourDay {
  date: string; totalQty: number; farmerCount: number;
  fat: number | null; snf: number | null; water: number | null;
}
export interface MpReceivedDay {
  date: string; totalQty: number; vmccCount: number;
  fat: number | null; snf: number | null; water: number | null;
}
export function useCollectionSummary(q: { from: string; to: string; nodeId?: string }) {
  return useQuery({
    queryKey: MP_KEYS.collection(q),
    queryFn: () => api.get<ApiSuccess<MpCollectionSummary>>(`${BASE}/reports/collection${qs({ ...q })}`),
    enabled: !!q.from && !!q.to,
  });
}
export function usePoursDaily(q: { nodeId: string; from: string; to: string; farmerId?: string }) {
  return useQuery({
    queryKey: ['mp', 'reports', 'pours-daily', q],
    queryFn: () => api.get<ApiSuccess<MpPourDay[]>>(`${BASE}/reports/pours-daily${qs({ ...q })}`),
    enabled: !!q.nodeId && !!q.from && !!q.to,
  });
}
export interface MpQualityTrendRow {
  date: string; milkType: MilkType; totalQty: number;
  fat: number | null; snf: number | null; water: number | null;
}
export function useQualityTrend(q: { from: string; to: string; nodeId?: string }) {
  return useQuery({
    queryKey: ['mp', 'reports', 'quality-trend', q],
    queryFn: () => api.get<ApiSuccess<MpQualityTrendRow[]>>(`${BASE}/reports/quality-trend${qs({ ...q })}`),
    enabled: !!q.from && !!q.to,
  });
}
// Per-day full rollup per milk type — same columns as the "By milk type — today"
// home table, one row per (date, milk type). Newest day first.
export interface MpMilkTypeDayRow {
  date: string; milkType: MilkType;
  totalQty: number; amQty: number; pmQty: number; pourCount: number;
  farmerCount: number; avgFat: number; avgSnf: number;
  amFat: number; pmFat: number; amSnf: number; pmSnf: number; amRate: number; pmRate: number; avgWater: number; amWater: number; pmWater: number; grossAmount: number;
}
export function useMilkTypeDaily(q: { from: string; to: string; nodeId?: string }) {
  return useQuery({
    queryKey: ['mp', 'reports', 'milk-type-daily', q],
    queryFn: () => api.get<ApiSuccess<MpMilkTypeDayRow[]>>(`${BASE}/reports/milk-type-daily${qs({ ...q })}`),
    enabled: !!q.from && !!q.to,
  });
}
// Per-day full rollup per node (VMCC or parent CC) — same columns as the home
// "By … — today" tables, one row per (date, node). Node picked via dropdown.
export interface MpNodeDayRow {
  date: string; nodeId: string; nodeName: string; nodeCode: string;
  totalQty: number; amQty: number; pmQty: number; pourCount: number;
  farmerCount: number; avgFat: number; avgSnf: number;
  amFat: number; pmFat: number; amSnf: number; pmSnf: number; amRate: number; pmRate: number; avgWater: number; amWater: number; pmWater: number; grossAmount: number;
}
export function useNodeDaily(q: { from: string; to: string; groupBy: 'vmcc' | 'cc' }) {
  return useQuery({
    queryKey: ['mp', 'reports', 'node-daily', q],
    queryFn: () => api.get<ApiSuccess<MpNodeDayRow[]>>(`${BASE}/reports/node-daily${qs({ ...q })}`),
    enabled: !!q.from && !!q.to,
  });
}

// One row per (date, farmer, milk type) with AM/PM combined — a farmer who
// supplies more than one milk type gets a row per type. `nodeId` is the VMCC.
export interface MpFarmerDayRow {
  date: string; farmerId: string; nodeId: string; milkType: MilkType;
  totalQty: number; amQty: number; pmQty: number; pourCount: number;
  farmerCount: number; avgFat: number; avgSnf: number;
  amFat: number; pmFat: number; amSnf: number; pmSnf: number; amRate: number; pmRate: number; avgWater: number; amWater: number; pmWater: number; grossAmount: number;
}
export function useFarmerDaily(q: { from: string; to: string; nodeId?: string; farmerId?: string }) {
  return useQuery({
    queryKey: ['mp', 'reports', 'farmer-daily', q],
    queryFn: () => api.get<ApiSuccess<MpFarmerDayRow[]>>(`${BASE}/reports/farmer-daily${qs({ ...q })}`),
    enabled: !!q.from && !!q.to,
  });
}
export function useReceivedDaily(q: { nodeId: string; from: string; to: string }) {
  return useQuery({
    queryKey: ['mp', 'reports', 'received-daily', q],
    queryFn: () => api.get<ApiSuccess<MpReceivedDay[]>>(`${BASE}/reports/received-daily${qs({ ...q })}`),
    enabled: !!q.nodeId && !!q.from && !!q.to,
  });
}

// Whole-network flow snapshot for one date + optional shift (see report.service).
export interface MpFlowNode {
  nodeId: string; collected: number; dispatchedOut: number; receivedIn: number; onHand: number;
}
export interface MpFlowEdge {
  fromNodeId: string; toNodeId: string; kind: 'vmcc_to_cc' | 'cc_to_pp';
  dispatchedQty: number; receivedQty: number; measuredLoss: number; variancePct: number | null;
}
export interface MpFlowReport {
  date: string; shift: 'am' | 'pm' | null;
  nodes: MpFlowNode[]; edges: MpFlowEdge[];
  totals: { collected: number; dispatched: number; received: number; receivedAtPlant: number; measuredLoss: number };
}
export function useFlow(q: { date: string; shift?: 'am' | 'pm' }) {
  return useQuery({
    queryKey: ['mp', 'reports', 'flow', q],
    queryFn: () => api.get<ApiSuccess<MpFlowReport>>(`${BASE}/reports/flow${qs({ ...q })}`),
    enabled: !!q.date,
  });
}

// ── consignments ────────────────────────────────────────────────────────────
export interface MpConsignment {
  id: string; consignmentNo: string; kind: 'vmcc_to_cc' | 'cc_to_pp';
  fromNodeId: string; toNodeId: string; collectionDate: string; shift: 'am' | 'pm' | null;
  containerNo: string | null; dispatchQty: string | null; receiptQty: string | null;
  dispatchFat: string | null; dispatchSnf: string | null; dispatchWater: number | null;
  receiptFat: string | null; receiptSnf: string | null; receiptWater: number | null;
  varianceQty: string | null; variancePct: string | null;
  status: 'in_transit' | 'received' | 'reversed';
  /** Each type travels as its own leg. Null on legs dispatched before the split. */
  milkType: MilkType | null;
}

/** Table-friendly variant: em dash for legs dispatched before the type split. */
export function milkTypeLabelOrDash(t: MilkType | null | undefined): string {
  return t ? milkTypeLabel(t) : '—';
}
export function useConsignments(filters?: {
  kind?: string; toNodeId?: string; fromNodeId?: string; status?: string; shift?: string;
  collectionDate?: string; from?: string; to?: string; page?: number; limit?: number;
}) {
  return useQuery({
    queryKey: ['mp', 'consignments', filters],
    queryFn: () => api.get<PaginatedResponse<MpConsignment>>(`${BASE}/consignments${qs({ ...filters })}`),
  });
}
export function useDispatchConsignment() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: (d: CreateConsignmentInput) => api.post<ApiSuccess<MpConsignment>>(`${BASE}/consignments`, d),
    onSuccess: () => c.invalidateQueries({ queryKey: ['mp', 'consignments'] }),
  });
}
export function useReceiveConsignment() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ReceiveConsignmentInput }) =>
      api.post<ApiSuccess<MpConsignment>>(`${BASE}/consignments/${id}/receive`, data),
    onSuccess: () => c.invalidateQueries({ queryKey: ['mp', 'consignments'] }),
  });
}
/** Correct a received consignment's receipt figures — the "daily data" for a
 *  bulk VMCC that supplies the CC directly (no farmer pours). */
export function useEditReceipt() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ReceiveConsignmentInput }) =>
      api.post<ApiSuccess<MpConsignment>>(`${BASE}/consignments/${id}/edit-receipt`, data),
    onSuccess: () => {
      c.invalidateQueries({ queryKey: ['mp', 'consignments'] });
      c.invalidateQueries({ queryKey: ['mp', 'reports'] });
    },
  });
}
export interface MpAvailability {
  nodeId: string; collectionDate: string; nodeType: NodeType;
  collected: number; dispatched: number; available: number;
  avgFat: number | null; avgSnf: number | null; avgWater: number | null;
}
export function useNodeAvailability(nodeId: string, collectionDate: string, shift?: 'am' | 'pm') {
  return useQuery({
    queryKey: ['mp', 'consignments', 'available', nodeId, collectionDate, shift ?? null],
    queryFn: () => api.get<ApiSuccess<MpAvailability>>(`${BASE}/consignments/available${qs({ nodeId, collectionDate, shift })}`),
    enabled: !!nodeId && !!collectionDate,
  });
}

// ── payout cycles ────────────────────────────────────────────────────────────
export interface MpPayoutCycle {
  id: string; cycleNo: string; scopeNodeId: string | null; periodStart: string; periodEnd: string;
  status: 'open' | 'locked' | 'paid' | 'reversed';
  totalQty: string; totalGross: string; totalDeductions: string; totalNet: string;
}
export interface MpPayoutLine {
  id: string; farmerId: string; qtyLitres: string; grossAmount: string; bonusAmount: string;
  deductionTotal: string; netAmount: string; paymentId: string | null; settledViaNodeId: string | null;
  statementNo: string | null; deductions: { id: string; deductionType: string; amount: string }[];
  paidAt: string | null; billId: string | null;
  farmerName: string; farmerCode: string;
  vmccNodeId: string | null; vmccName: string | null; viaVmcc: boolean;
}
export interface MpCycleDetail extends MpPayoutCycle {
  lines: MpPayoutLine[];
  // VMCC-bill roll-up — pooled centres have no farmer lines, so their payable
  // shows through these.
  billTotal: number; billPaidTotal: number;
}
/** Cycle list row = the cycle plus its farmer-line and VMCC-bill roll-ups. */
export interface MpPayoutCycleListRow extends MpPayoutCycle {
  lineCount: number; paidCount: number; netTotal: number; paidTotal: number;
  billCount: number; billPaidCount: number; billTotal: number; billPaidTotal: number;
}
export function usePayoutCycles(filters?: { status?: string; limit?: number }) {
  return useQuery({
    queryKey: ['mp', 'cycles', filters],
    queryFn: () => api.get<PaginatedResponse<MpPayoutCycleListRow>>(`${BASE}/payouts/cycles${qs({ ...filters })}`),
  });
}
export function usePayoutCycle(id: string) {
  return useQuery({
    queryKey: ['mp', 'cycles', id],
    queryFn: () => api.get<ApiSuccess<MpCycleDetail>>(`${BASE}/payouts/cycles/${id}`),
    enabled: !!id,
  });
}
export function useCreatePayoutCycle() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: (d: CreatePayoutCycleInput) => api.post<ApiSuccess<MpCycleDetail>>(`${BASE}/payouts/cycles`, d),
    onSuccess: () => c.invalidateQueries({ queryKey: ['mp', 'cycles'] }),
  });
}
export function useCycleAction(action: 'lock' | 'pay') {
  const c = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<ApiSuccess<MpPayoutCycle>>(`${BASE}/payouts/cycles/${id}/${action}`, {}),
    onSuccess: () => c.invalidateQueries({ queryKey: ['mp', 'cycles'] }),
  });
}

// ── operators ────────────────────────────────────────────────────────────────
export interface MpOperator {
  id: string; nodeId: string; userId: string | null; name: string | null; phone: string | null;
  role: 'operator' | 'owner';
  compType: 'per_litre_commission' | 'fixed_salary';
  ratePerLitre: string | null; monthlySalary: string | null; rentAmount: string | null;
  effectiveFrom: string; isActive: boolean;
}
export interface MpOperatorComp {
  nodeId: string; from: string; to: string; nodeQty: number;
  operators: { id: string; role: string; compType: string; commission: number; salary: number; rent: number; total: number }[];
}
export function useOperators(filters?: { nodeId?: string; limit?: number }) {
  return useQuery({
    queryKey: ['mp', 'operators', filters],
    queryFn: () => api.get<PaginatedResponse<MpOperator>>(`${BASE}/operators${qs({ ...filters })}`),
  });
}
export function useCreateOperator() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: (d: CreateNodeOperatorInput) => api.post<ApiSuccess<MpOperator>>(`${BASE}/operators`, d),
    onSuccess: () => c.invalidateQueries({ queryKey: ['mp', 'operators'] }),
  });
}
export function useUpdateOperator() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateNodeOperatorInput }) =>
      api.put<ApiSuccess<MpOperator>>(`${BASE}/operators/${id}`, data),
    onSuccess: () => c.invalidateQueries({ queryKey: ['mp', 'operators'] }),
  });
}
export function useDeactivateOperator() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<ApiSuccess<MpOperator>>(`${BASE}/operators/${id}/deactivate`, {}),
    onSuccess: () => c.invalidateQueries({ queryKey: ['mp', 'operators'] }),
  });
}
export function useDeleteOperator() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`${BASE}/operators/${id}`),
    onSuccess: () => c.invalidateQueries({ queryKey: ['mp', 'operators'] }),
  });
}
export function useOperatorCommission(q: { nodeId: string; from: string; to: string }) {
  return useQuery({
    queryKey: ['mp', 'operators', 'commission', q],
    queryFn: () => api.get<ApiSuccess<MpOperatorComp>>(`${BASE}/operators/commission${qs({ ...q })}`),
    enabled: !!q.nodeId && !!q.from && !!q.to,
  });
}

// ── operator payouts (lightweight tracking) ──────────────────────────────────
export interface MpOperatorPayoutLine {
  operatorId: string; nodeId: string; nodeName: string; name: string | null; role: string; compType: string;
  nodeQty: number; commission: number; salary: number; rent: number; total: number;
  paidPayoutId: string | null; paidOn: string | null;
}
export interface MpOperatorPayout {
  id: string; operatorId: string; nodeId: string; periodStart: string; periodEnd: string;
  nodeQty: string; commission: string; salary: string; rent: string; total: string;
  payeeVendorId: string | null; paidOn: string; reference: string | null;
}
export function useOperatorPayoutCompute(q: { from: string; to: string; nodeId?: string }) {
  return useQuery({
    queryKey: ['mp', 'operator-payouts', 'compute', q],
    queryFn: () => api.get<ApiSuccess<{ from: string; to: string; lines: MpOperatorPayoutLine[] }>>(`${BASE}/operator-payouts/compute${qs({ ...q })}`),
    enabled: !!q.from && !!q.to,
  });
}
export function useOperatorPayouts(filters?: { nodeId?: string; operatorId?: string; from?: string; to?: string; page?: number; limit?: number }) {
  return useQuery({
    queryKey: ['mp', 'operator-payouts', filters],
    queryFn: () => api.get<PaginatedResponse<MpOperatorPayout>>(`${BASE}/operator-payouts${qs({ ...filters })}`),
  });
}
export function useMarkOperatorPayout() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: (d: CreateOperatorPayoutInput) => api.post<ApiSuccess<MpOperatorPayout>>(`${BASE}/operator-payouts`, d),
    onSuccess: () => {
      c.invalidateQueries({ queryKey: ['mp', 'operator-payouts'] });
      c.invalidateQueries({ queryKey: ['mp', 'vmcc-bills'] }); // refresh the direct-billing operator flags
    },
  });
}

// ── VMCC billing ──────────────────────────────────────────────────────────────
export type BillStatus = 'generated' | 'paid' | 'reversed';
export interface MpVmccBill {
  id: string; billNo: string; payoutCycleId: string; vmccNodeId: string; ccNodeId: string;
  payeeVendorId: string | null;
  milkCost: string; commission: string; salary: string; rent: string; totalAmount: string;
  qtyLitres: string; farmerCount: number; status: BillStatus;
  paymentId: string | null; txnReference: string | null; paymentMode: string | null;
  paymentDate: string | null; paidAt: string | null;
}
export interface MpVmccBillListRow extends MpVmccBill { vmccName: string; vmccCode: string }
/** Compute-on-the-fly preview row (amounts are numbers, not decimal strings). */
export interface MpBillableVmcc {
  vmccNodeId: string; vmccName: string; vmccCode: string; payeeVendorId: string | null;
  milkCost: number; qtyLitres: number; farmerCount: number;
  commission: number; salary: number; rent: number; total: number;
  bill: MpVmccBill | null;
}
export interface PayVmccBillBody { txnReference?: string; paymentMode: string; paymentDate: string }
export type BillingHalf = 'first' | 'second';
export interface BillingPeriodSel { year: number; month: number; half: BillingHalf }

export interface MpCycleBillingSummary {
  cycleId: string; cycleNo: string; periodStart: string; periodEnd: string;
  cycleStatus: string; billCount: number; paidBillCount: number;
  billedTotal: number; paidTotal: number; pendingTotal: number;
  /** The CC this cycle is scoped to, or null for a legacy whole-tenant cycle. */
  scopeNodeId: string | null; scopeName: string | null;
}
export function useCycleBillingSummary(limit = 5) {
  return useQuery({
    queryKey: ['mp', 'vmcc-bills', 'cycle-summary', limit],
    queryFn: () => api.get<ApiSuccess<MpCycleBillingSummary[]>>(`${BASE}/billing/cycle-summary${qs({ limit })}`),
  });
}

export function useBillableVmccs(q: BillingPeriodSel & { ccNodeId: string }, enabled = true) {
  return useQuery({
    queryKey: ['mp', 'vmcc-bills', 'billable', q],
    queryFn: () => api.get<ApiSuccess<MpBillableVmcc[]>>(`${BASE}/billing/billable${qs({ ...q })}`),
    enabled: enabled && !!q.ccNodeId && !!q.year && !!q.month && !!q.half,
  });
}
export type MpSanitySeverity = 'error' | 'warning';
export type MpSanityCode =
  | 'unpriced_receipt' | 'orphan_pour' | 'qty_spike' | 'no_payee_vendor' | 'operator_payout_overlap';
export interface MpSanityIssue {
  code: MpSanityCode; severity: MpSanitySeverity;
  vmccNodeId: string | null; label: string; detail: string;
  count: number; qtyLitres: number; amount: number;
}
export interface MpSanityReport {
  cycleStatus: string | null; checkedVmccs: number; issues: MpSanityIssue[];
}
/** Read-only pre-flight before generating bills — unbilled pours, unpriced collections, blockers. */
export function useBillingSanityCheck(q: BillingPeriodSel & { ccNodeId: string }, enabled = true) {
  return useQuery({
    queryKey: ['mp', 'vmcc-bills', 'sanity', q],
    queryFn: () => api.get<ApiSuccess<MpSanityReport>>(`${BASE}/billing/sanity${qs({ ...q })}`),
    enabled: enabled && !!q.ccNodeId && !!q.year && !!q.month && !!q.half,
  });
}
export interface MpDirectPaymentRow {
  vmccNodeId: string; vmccName: string; vmccCode: string;
  farmerCount: number; paidCount: number;
  netOwed: number; paidAmount: number; pendingAmount: number;
}
export interface MpDirectFarmerBill {
  lineId: string; farmerId: string; farmerName: string; farmerCode: string;
  vmccNodeId: string; vmccName: string;
  qtyLitres: number; grossAmount: number; deductionTotal: number; netAmount: number;
  paid: boolean; paymentReference: string | null;
}
export interface MpDirectDetail {
  cycleId: string | null;
  periodStart: string; periodEnd: string;
  vmccs: MpDirectPaymentRow[];
  farmers: MpDirectFarmerBill[];
  operators: MpOperatorPayoutLine[];
}
export function useDirectDetail(q: BillingPeriodSel & { ccNodeId: string }, enabled = true) {
  return useQuery({
    queryKey: ['mp', 'vmcc-bills', 'direct', q],
    queryFn: () => api.get<ApiSuccess<MpDirectDetail>>(`${BASE}/billing/direct${qs({ ...q })}`),
    enabled: enabled && !!q.ccNodeId && !!q.year && !!q.month && !!q.half,
  });
}
/** Settle one farmer's bill in direct mode (posts GL + AP payment + txn confirmation). */
export function useSettleFarmer() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: ({ lineId, data }: { lineId: string; data: PayVmccBillBody }) =>
      api.post<ApiSuccess<unknown>>(`${BASE}/billing/farmers/${lineId}/settle`, data),
    onSuccess: () => invalidateBills(c),
  });
}
export function useReverseFarmer() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: (lineId: string) => api.post<ApiSuccess<unknown>>(`${BASE}/billing/farmers/${lineId}/reverse`, {}),
    onSuccess: () => invalidateBills(c),
  });
}
export interface SettleOperatorBody extends PayVmccBillBody { periodStart: string; periodEnd: string }
export function useSettleOperator() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: ({ operatorId, data }: { operatorId: string; data: SettleOperatorBody }) =>
      api.post<ApiSuccess<unknown>>(`${BASE}/billing/operators/${operatorId}/settle`, data),
    onSuccess: () => { invalidateBills(c); c.invalidateQueries({ queryKey: ['mp', 'operator-payouts'] }); },
  });
}
/** Rebuild a direct-mode CC's farmer lines from corrected pours (milk-data fix). */
export function useRegenerateDirect() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: (d: BillingPeriodSel & { ccNodeId: string }) =>
      api.post<ApiSuccess<{ rebuilt: boolean }>>(`${BASE}/billing/regenerate`, d),
    onSuccess: () => invalidateBills(c),
  });
}
export function useReverseOperator() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: ({ operatorId, periodStart, periodEnd }: { operatorId: string; periodStart: string; periodEnd: string }) =>
      api.post<ApiSuccess<unknown>>(`${BASE}/billing/operators/${operatorId}/reverse`, { periodStart, periodEnd }),
    onSuccess: () => { invalidateBills(c); c.invalidateQueries({ queryKey: ['mp', 'operator-payouts'] }); },
  });
}
export function useVmccBills(filters?: { cycleId?: string; ccNodeId?: string; status?: BillStatus; limit?: number }) {
  return useQuery({
    queryKey: ['mp', 'vmcc-bills', filters],
    queryFn: () => api.get<PaginatedResponse<MpVmccBillListRow>>(`${BASE}/billing/bills${qs({ ...filters })}`),
  });
}

// ── payment history ─────────────────────────────────────────────────────────
export type MpPaymentKind = 'vmcc_bill' | 'farmer' | 'operator';
export interface MpPaymentHistoryRow {
  id: string; kind: MpPaymentKind; date: string;
  payee: string; payeeCode: string | null; context: string | null;
  cycleNo: string | null; amount: string;
  paymentMode: string | null; reference: string | null; recordedBy: string | null;
}
export interface MpPaymentHistoryFilters {
  type?: MpPaymentKind; paymentMode?: string; dateFrom?: string; dateTo?: string; search?: string;
}
export function useMpPayments(filters: MpPaymentHistoryFilters, page = 1, limit = 25) {
  return useQuery({
    queryKey: ['mp', 'payments', filters, page, limit],
    queryFn: () => api.get<PaginatedResponse<MpPaymentHistoryRow>>(
      `${BASE}/billing/payments${qs({ ...filters, page, limit })}`,
    ),
  });
}
function invalidateBills(c: ReturnType<typeof useQueryClient>) {
  c.invalidateQueries({ queryKey: ['mp', 'vmcc-bills'] });
  c.invalidateQueries({ queryKey: ['mp', 'cycles'] });
}
export function useGenerateVmccBills() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: (d: BillingPeriodSel & { ccNodeId: string; vmccNodeId?: string }) =>
      api.post<ApiSuccess<MpVmccBill[]>>(`${BASE}/billing/generate`, d),
    onSuccess: () => invalidateBills(c),
  });
}
export function usePayVmccBill() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: PayVmccBillBody }) =>
      api.post<ApiSuccess<MpVmccBill>>(`${BASE}/billing/bills/${id}/pay`, data),
    onSuccess: () => invalidateBills(c),
  });
}
export function useReverseVmccBill() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<ApiSuccess<MpVmccBill>>(`${BASE}/billing/bills/${id}/reverse`, {}),
    onSuccess: () => invalidateBills(c),
  });
}

// ── quality bands ─────────────────────────────────────────────────────────────
export type QualityMetric = 'fat' | 'snf' | 'clr';
export interface QualityBandRange { goodMin: number; watchMin: number }
export type QualityBandMetrics = Partial<Record<QualityMetric, QualityBandRange>>
export type QualityBandMap = Partial<Record<MilkType, QualityBandMetrics>>
export interface QualityBandRow {
  id: string; tenantId: string; nodeId: string | null;
  milkType: MilkType; metric: QualityMetric; goodMin: string; watchMin: string;
  createdAt: string; updatedAt: string;
}
export interface UpsertQualityBandsInput {
  nodeId?: string | null;
  bands: { milkType: MilkType; metric: QualityMetric; goodMin: number; watchMin: number }[];
}

// ── config (gl settings) ─────────────────────────────────────────────────────
export interface MpGlSettings {
  id: string; defaultPayoutMode: PayoutMode;
  cycleDays: number | null; cycleAnchorDate: string | null; autoGenerateCycle: boolean;
  supportPhone: string | null; supportEmail: string | null; supportWhatsapp: string | null;
  milkPurchaseAccountId: string | null; farmerPayableAccountId: string | null;
  commissionExpenseAccountId: string | null;
  rawMilkWarehouseId: string | null;
}

export type MpMilkType = 'cow' | 'buffalo' | 'mixed' | 'cow_a1' | 'cow_a2';
export interface MpRawMilkItem { id: string; milkType: MpMilkType; itemId: string; }
export function useGlSettings() {
  return useQuery({
    queryKey: ['mp', 'gl-settings'],
    queryFn: () => api.get<ApiSuccess<MpGlSettings | null>>(`${BASE}/config/gl-settings`),
  });
}
export function useUpsertGlSettings() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: (d: UpsertGlSettingsInput) => api.put<ApiSuccess<MpGlSettings>>(`${BASE}/config/gl-settings`, d),
    onSuccess: () => c.invalidateQueries({ queryKey: ['mp', 'gl-settings'] }),
  });
}

// ── raw-milk inventory mapping (P1.2) ────────────────────────────────────────
export function useRawMilkItems() {
  return useQuery({
    queryKey: ['mp', 'raw-milk-items'],
    queryFn: () => api.get<ApiSuccess<MpRawMilkItem[]>>(`${BASE}/config/raw-milk-items`),
  });
}
export function useUpsertRawMilkItems() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: (mappings: { milkType: MpMilkType; itemId: string }[]) =>
      api.put<ApiSuccess<MpRawMilkItem[]>>(`${BASE}/config/raw-milk-items`, { mappings }),
    onSuccess: () => c.invalidateQueries({ queryKey: ['mp', 'raw-milk-items'] }),
  });
}

// ── quality bands ─────────────────────────────────────────────────────────────
export function useQualityBands(nodeId?: string) {
  return useQuery({
    queryKey: MP_KEYS.qualityBands(nodeId),
    queryFn: () => api.get<ApiSuccess<QualityBandMap>>(`${BASE}/quality-bands${qs({ nodeId })}`),
  });
}
export function useQualityBandsConfig(nodeId?: string) {
  return useQuery({
    queryKey: MP_KEYS.qualityBandsConfig(nodeId),
    queryFn: () => api.get<ApiSuccess<QualityBandRow[]>>(`${BASE}/quality-bands/config${qs({ nodeId })}`),
  });
}
export function useUpsertQualityBands() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: (d: UpsertQualityBandsInput) => api.put<ApiSuccess<void>>(`${BASE}/quality-bands`, d),
    onSuccess: () => c.invalidateQueries({ queryKey: ['mp', 'quality-bands'] }),
  });
}
