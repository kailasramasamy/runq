import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { PaginatedResponse, ApiSuccess } from '@runq/types';
import type {
  CreateNodeInput, UpdateNodeInput, CreateFarmerInput, UpdateFarmerInput,
  CreateRateChartInput, RecordPourInput, CreateLedgerEntryInput,
  CreateConsignmentInput, ReceiveConsignmentInput, CreatePayoutCycleInput,
  CreateNodeOperatorInput, UpsertGlSettingsInput, CreateOperatorPayoutInput,
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
  parentNodeId: string | null; hasBmc: boolean; overnightPooling: boolean; capacityLitres: string | null;
  payoutMode: PayoutMode | null; payeeVendorId: string | null;
  measurementMode: MeasurementMode;
  collectionShifts: 'both' | 'am' | 'pm';
  allowedMilkTypes: MilkType[] | null;
  defaultMilkType: MilkType | null;
  city: string | null; state: string | null; isActive: boolean;
}
export type CattleBreed = 'desi_natti' | 'crossbred' | 'jersey' | 'hf' | 'gir' | 'sahiwal' | 'murrah' | 'other';
export interface CattleBreedCount { breed: CattleBreed; count: number }
export interface MpFarmerAttachment { id: string; kind: string; fileName: string; fileSize: number; mimeType: string }

export interface MpFarmer {
  id: string; code: string; name: string; phone: string | null; vendorId: string;
  isSociety: boolean; defaultMilkType: MilkType; cattleCount: number | null; isActive: boolean;
  dateOfBirth?: string | null;
  village?: string | null; address?: string | null; aadhaar?: string | null;
  cattleBreeds?: CattleBreedCount[] | null; inMilkCount?: number | null;
  lat?: number | null; lng?: number | null;
  bankAccountName?: string | null; bankAccountNumber?: string | null;
  bankIfsc?: string | null; bankName?: string | null; upiId?: string | null;
  profilePhotoUrl?: string | null;
}
export interface MpRateChart {
  id: string; name: string; milkType: MilkType; pricingMode: 'matrix' | 'flat' | 'clr';
  flatRatePerLitre: string | null; scopeNodeId: string | null; season: string | null;
  effectiveFrom: string; effectiveTo: string | null; isActive: boolean;
}
export interface MpRateCell {
  id: string;
  fat: string | null; snf: string | null; clr: string | null;
  ratePerLitre: string;
}
export interface MpRateRule {
  id: string; ruleType: 'quality_bonus' | 'volume_slab'; grade: string | null;
  minQty: string | null; maxQty: string | null; bonusPerLitre: string;
}
export interface MpRateChartDetail extends MpRateChart { cells: MpRateCell[]; rules: MpRateRule[] }
export interface MpRateResolution {
  rateChartId: string; baseRatePerLitre: number; bonusPerLitre: number;
  ratePerLitre: number; grade: 'a' | 'b' | 'c' | null;
}
export interface MpPour {
  id: string; nodeId: string; farmerId: string; collectionDate: string;
  shift: 'am' | 'pm'; milkType: MilkType; qtyLitres: string; fat: string | null; snf: string | null;
  water: number | null;
  qualityGrade: string | null; ratePerLitre: string; lineAmount: string; receiptNo: string | null;
  status: 'recorded' | 'reversed';
}
export interface MpCollectionSummary {
  from: string; to: string; nodeId: string | null;
  totalQty: number; amQty: number; pmQty: number; pourCount: number;
  farmerCount: number; avgFat: number; avgSnf: number; avgWater: number | null; grossAmount: number;
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
};

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : '';
}

// ── nodes ─────────────────────────────────────────────────────────────────
export function useNodes(filters?: { nodeType?: NodeType; search?: string; limit?: number }) {
  return useQuery({
    queryKey: MP_KEYS.nodes(filters),
    queryFn: () => api.get<PaginatedResponse<MpNode>>(`${BASE}/nodes${qs({ ...filters })}`),
  });
}
export function useCreateNode() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: (d: CreateNodeInput) => api.post<ApiSuccess<MpNode>>(`${BASE}/nodes`, d),
    onSuccess: () => c.invalidateQueries({ queryKey: ['mp', 'nodes'] }),
  });
}
export function useUpdateNode() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateNodeInput }) =>
      api.put<ApiSuccess<MpNode>>(`${BASE}/nodes/${id}`, data),
    onSuccess: () => c.invalidateQueries({ queryKey: ['mp', 'nodes'] }),
  });
}
export function useDeactivateNode() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<ApiSuccess<MpNode>>(`${BASE}/nodes/${id}/deactivate`, {}),
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
    onSuccess: () => c.invalidateQueries({ queryKey: ['mp', 'farmers'] }),
  });
}
export function useDeactivateFarmer() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<ApiSuccess<MpFarmer>>(`${BASE}/farmers/${id}/deactivate`, {}),
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
      const token = localStorage.getItem('runq-token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const tenantId = localStorage.getItem('runq-active-tenant-id');
      if (tenantId) headers['X-Tenant-Id'] = tenantId;
      const res = await fetch(`/api/v1${BASE}/farmers/${farmerId}/attachments`, {
        method: 'POST', headers, body: form,
      });
      if (!res.ok) throw await res.json();
      return (await res.json()).data as MpFarmerAttachment;
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
export function useDeactivateRateChart() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<ApiSuccess<MpRateChart>>(`${BASE}/rate-charts/${id}/deactivate`, {}),
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
export function useRecordPour() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: (d: RecordPourInput) => api.post<ApiSuccess<MpPour>>(`${BASE}/pours`, d),
    onSuccess: () => c.invalidateQueries({ queryKey: ['mp', 'pours'] }),
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
export function useCollectionSummary(q: { from: string; to: string; nodeId?: string }) {
  return useQuery({
    queryKey: MP_KEYS.collection(q),
    queryFn: () => api.get<ApiSuccess<MpCollectionSummary>>(`${BASE}/reports/collection${qs({ ...q })}`),
    enabled: !!q.from && !!q.to,
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
}
export interface MpCycleDetail extends MpPayoutCycle { lines: MpPayoutLine[] }
export function usePayoutCycles(filters?: { status?: string; limit?: number }) {
  return useQuery({
    queryKey: ['mp', 'cycles', filters],
    queryFn: () => api.get<PaginatedResponse<MpPayoutCycle>>(`${BASE}/payouts/cycles${qs({ ...filters })}`),
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
  dob: string | null; role: 'operator' | 'owner';
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
export function useDeactivateOperator() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<ApiSuccess<MpOperator>>(`${BASE}/operators/${id}/deactivate`, {}),
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
  operatorId: string; nodeId: string; nodeName: string; role: string; compType: string;
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
    onSuccess: () => c.invalidateQueries({ queryKey: ['mp', 'operator-payouts'] }),
  });
}

// ── config (gl settings) ─────────────────────────────────────────────────────
export interface MpGlSettings {
  id: string; defaultPayoutMode: PayoutMode;
  cycleDays: number | null; cycleAnchorDate: string | null; autoGenerateCycle: boolean;
  supportPhone: string | null; supportEmail: string | null; supportWhatsapp: string | null;
  milkPurchaseAccountId: string | null; farmerPayableAccountId: string | null;
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
