import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { PaginatedResponse, ApiSuccess } from '@runq/types';
import type {
  CreateNodeInput, UpdateNodeInput, CreateFarmerInput, UpdateFarmerInput,
  CreateRateChartInput, RecordPourInput, CreateLedgerEntryInput,
  CreateConsignmentInput, ReceiveConsignmentInput, CreatePayoutCycleInput,
  CreateNodeOperatorInput, UpsertGlSettingsInput, CreateOperatorPayoutInput,
} from '@runq/validators';

const BASE = '/milk-procurement';

// ── row shapes (API JSON; web doesn't import @runq/db) ────────────────────
export type MilkType = 'cow' | 'buffalo' | 'mixed';
export type NodeType = 'vmcc' | 'cc' | 'pp';
export type PayoutMode = 'direct_to_farmer' | 'via_vmcc';

export interface MpNode {
  id: string; code: string; name: string; nodeType: NodeType;
  parentNodeId: string | null; hasBmc: boolean; capacityLitres: string | null;
  payoutMode: PayoutMode | null; payeeVendorId: string | null;
  city: string | null; state: string | null; isActive: boolean;
}
export interface MpFarmer {
  id: string; code: string; name: string; phone: string | null; vendorId: string;
  isSociety: boolean; defaultMilkType: MilkType; cattleCount: number | null; isActive: boolean;
}
export interface MpRateChart {
  id: string; name: string; milkType: MilkType; pricingMode: 'matrix' | 'flat';
  flatRatePerLitre: string | null; scopeNodeId: string | null; season: string | null;
  effectiveFrom: string; effectiveTo: string | null; isActive: boolean;
}
export interface MpRateCell { id: string; fat: string; snf: string; ratePerLitre: string }
export interface MpRateRule {
  id: string; ruleType: 'quality_bonus' | 'volume_slab'; grade: string | null;
  minQty: string | null; maxQty: string | null; bonusPerLitre: string;
}
export interface MpRateChartDetail extends MpRateChart { cells: MpRateCell[]; rules: MpRateRule[] }
export interface MpRateResolution {
  rateChartId: string; baseRatePerLitre: number; bonusPerLitre: number;
  ratePerLitre: number; grade: 'a' | 'b' | 'c';
}
export interface MpPour {
  id: string; nodeId: string; farmerId: string; collectionDate: string;
  shift: 'am' | 'pm'; milkType: MilkType; qtyLitres: string; fat: string | null; snf: string | null;
  qualityGrade: string | null; ratePerLitre: string; lineAmount: string; receiptNo: string | null;
  status: 'recorded' | 'reversed';
}
export interface MpCollectionSummary {
  from: string; to: string; nodeId: string | null;
  totalQty: number; amQty: number; pmQty: number; pourCount: number;
  farmerCount: number; avgFat: number; avgSnf: number; grossAmount: number;
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
  dispatchFat: string | null; dispatchSnf: string | null;
  receiptFat: string | null; receiptSnf: string | null;
  varianceQty: string | null; variancePct: string | null;
  status: 'in_transit' | 'received' | 'reversed';
}
export function useConsignments(filters?: {
  kind?: string; toNodeId?: string; fromNodeId?: string; status?: string;
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
  avgFat: number | null; avgSnf: number | null;
}
export function useNodeAvailability(nodeId: string, collectionDate: string) {
  return useQuery({
    queryKey: ['mp', 'consignments', 'available', nodeId, collectionDate],
    queryFn: () => api.get<ApiSuccess<MpAvailability>>(`${BASE}/consignments/available${qs({ nodeId, collectionDate })}`),
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
  id: string; nodeId: string; userId: string | null; role: 'operator' | 'owner';
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
  milkPurchaseAccountId: string | null; farmerPayableAccountId: string | null;
}
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
