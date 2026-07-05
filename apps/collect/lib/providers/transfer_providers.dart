import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/mp_models.dart';
import '../api/mp_repo.dart';
import '../utils/format.dart';

/// Today's inbound consignments to a node (all statuses).
/// Key: nodeId. Callers filter by kind/status client-side to avoid
/// multi-key families (per Wave B4 architecture note).
final nodeInboundConsignmentsProvider =
    FutureProvider.family<List<MpConsignment>, String>((ref, nodeId) async {
  return mpRepo.consignments(toNodeId: nodeId, collectionDate: todayIso(), limit: 200);
});

/// Inbound consignments to a node for a specific date (all statuses). Used by
/// manual receive, where the operator may backfill a past date and the
/// already-received markers must follow the chosen date.
typedef InboundByDateArgs = ({String nodeId, String date});

final nodeInboundByDateProvider =
    FutureProvider.family<List<MpConsignment>, InboundByDateArgs>((ref, args) async {
  return mpRepo.consignments(toNodeId: args.nodeId, collectionDate: args.date, limit: 200);
});

/// Received inbound consignments (vmcc→cc) at a node over the last [days],
/// newest first. Powers the CC receive-history page and the aggregated QC
/// report. Keyed by (nodeId, days) so 7/14/30-day windows cache separately.
typedef ReceivedRangeArgs = ({String nodeId, int days});

final nodeReceivedRangeProvider =
    FutureProvider.family<List<MpConsignment>, ReceivedRangeArgs>((ref, args) async {
  return mpRepo.consignments(
    toNodeId: args.nodeId, kind: 'vmcc_to_cc', status: 'received',
    from: isoDaysAgo(args.days - 1), to: todayIso(), limit: 500,
  );
});

/// Per-day received rollup at a CC over the last [days] (newest first). Light
/// list payload — one row per day; per-day detail is fetched lazily on expand
/// via [nodeReceivedDayDetailProvider]. Keyed by (nodeId, days).
final nodeReceivedDailyProvider =
    FutureProvider.family<List<MpReceivedDay>, ReceivedRangeArgs>((ref, args) async {
  return mpRepo.receivedDaily(
    nodeId: args.nodeId, from: isoDaysAgo(args.days - 1), to: todayIso(),
  );
});

/// Received consignment detail rows (vmcc→cc) at a node on one collection date.
/// Fetched only when its day is expanded in the receive history.
typedef ReceivedDayArgs = ({String nodeId, String date});

final nodeReceivedDayDetailProvider =
    FutureProvider.family<List<MpConsignment>, ReceivedDayArgs>((ref, args) async {
  return mpRepo.consignments(
    toNodeId: args.nodeId, kind: 'vmcc_to_cc', status: 'received',
    collectionDate: args.date, limit: 200,
  );
});

/// Single-VMCC collection summary for one date — supplies the effective per-shift
/// ₹/L (amRate/pmRate) shown in the receive-history breakup. Fetched lazily when
/// a VMCC entry is expanded, cached per (nodeId, date).
final nodeDaySummaryProvider =
    FutureProvider.family<MpCollectionSummary?, ReceivedDayArgs>((ref, args) async {
  return mpRepo.collectionSummary(from: args.date, to: args.date, nodeId: args.nodeId);
});

/// Today's outbound consignments from a node (all statuses, all kinds).
final nodeOutboundConsignmentsProvider =
    FutureProvider.family<List<MpConsignment>, String>((ref, nodeId) async {
  return mpRepo.consignments(fromNodeId: nodeId, collectionDate: todayIso(), limit: 200);
});

/// Outbound consignments from a node on a specific collection date — backs the
/// dispatch screen's date picker for backfilling a missed day.
typedef NodeDateArgs = ({String nodeId, String date});

final nodeOutboundForDateProvider =
    FutureProvider.family<List<MpConsignment>, NodeDateArgs>((ref, args) async {
  return mpRepo.consignments(fromNodeId: args.nodeId, collectionDate: args.date, limit: 200);
});

/// Outbound dispatches from a node over the last [days] for the given leg
/// [kind] ('vmcc_to_cc' | 'cc_to_pp'), newest first. Powers the dispatch-history
/// screen. All statuses included so in-transit dispatches still show. Keyed by
/// (nodeId, kind, days) so each leg + window caches separately.
typedef DispatchedRangeArgs = ({String nodeId, String kind, int days});

final nodeDispatchedRangeProvider =
    FutureProvider.family<List<MpConsignment>, DispatchedRangeArgs>((ref, args) async {
  return mpRepo.consignments(
    fromNodeId: args.nodeId, kind: args.kind,
    from: isoDaysAgo(args.days - 1), to: todayIso(), limit: 500,
  );
});

/// Availability (collected / dispatched / available) for a node today.
/// `shift` scopes the figure to AM/PM for no-BMC nodes that dispatch each shift
/// separately; pass null for BMC nodes that pool the whole day.
typedef AvailabilityArgs = ({String nodeId, String? shift});

final nodeAvailabilityProvider =
    FutureProvider.family<MpAvailability?, AvailabilityArgs>((ref, args) async {
  return mpRepo.availability(args.nodeId, todayIso(), shift: args.shift);
});

/// Availability for a node on a specific collection date — backs the dispatch
/// screen's date picker. `shift` scopes AM/PM for no-BMC nodes (null for BMC).
typedef AvailabilityDateArgs = ({String nodeId, String date, String? shift});

final nodeAvailabilityForDateProvider =
    FutureProvider.family<MpAvailability?, AvailabilityDateArgs>((ref, args) async {
  return mpRepo.availability(args.nodeId, args.date, shift: args.shift);
});

/// Which shifts are closed for collection at a node today. Drives the close
/// banner on Record Collection and the hard dispatch gate. Key: nodeId.
final shiftStatusProvider =
    FutureProvider.family<MpShiftStatus, String>((ref, nodeId) async {
  return mpRepo.shiftStatus(nodeId, todayIso());
});

/// Shift-closure status for a node on a specific date — gates back-dated
/// dispatch (a past day can only be dispatched once its collection was closed).
final shiftStatusForDateProvider =
    FutureProvider.family<MpShiftStatus, NodeDateArgs>((ref, args) async {
  return mpRepo.shiftStatus(args.nodeId, args.date);
});

/// All active nodes of a given nodeType ('vmcc' | 'cc' | 'pp').
final nodesByTypeProvider =
    FutureProvider.family<List<MpNode>, String>((ref, nodeType) async {
  return mpRepo.nodes(nodeType: nodeType, limit: 200);
});

/// Recent QC tests — no filter (PP sees all subject types).
final recentQcTestsProvider = FutureProvider<List<MpQcTest>>((ref) async {
  return mpRepo.qcTests();
});

/// Live today-collection at each child VMCC of a CC — regardless of dispatch, so
/// the CC operator sees how much milk sits at each VMCC at any moment.
/// Per-shift qty-weighted QC (fat/snf/water) and effective ₹/L rate for one slot
/// — powers the CC-home entry's expanded AM/PM breakdown.
typedef ShiftQc = ({double fat, double snf, double water, double rate});

typedef VmccCollection = ({
  MpNode vmcc,
  double collected,
  double amQty,
  double pmQty,
  int farmers,
  ShiftQc am,
  ShiftQc pm,
});

final ccVmccCollectionsProvider =
    FutureProvider.family<List<VmccCollection>, String>((ref, ccNodeId) async {
  final all = await ref.watch(nodesByTypeProvider('vmcc').future);
  final children = all.where((n) => n.parentNodeId == ccNodeId && n.isActive).toList();
  final today = todayIso();
  return Future.wait(children.map((v) async {
    final s = await mpRepo.collectionSummary(from: today, to: today, nodeId: v.id);
    return (
      vmcc: v,
      collected: s?.totalQty ?? 0.0,
      amQty: s?.amQty ?? 0.0,
      pmQty: s?.pmQty ?? 0.0,
      farmers: s?.farmerCount ?? 0,
      am: (fat: s?.amFat ?? 0, snf: s?.amSnf ?? 0, water: s?.amWater ?? 0, rate: s?.amRate ?? 0),
      pm: (fat: s?.pmFat ?? 0, snf: s?.pmSnf ?? 0, water: s?.pmWater ?? 0, rate: s?.pmRate ?? 0),
    );
  }));
});

/// A rate-chart resolution for one QC reading, keyed by (milk type, fat, snf,
/// node). Used to price a manual-receive VMCC shift on the CC home, where the
/// receipt carries no per-litre rate — the ₹/L is resolved from its QC against
/// the node's active rate chart. Null when no chart resolves.
typedef ReceiptRateKey = ({MilkType milkType, double fat, double snf, String nodeId, String? onDate});

final receiptRateProvider = FutureProvider.family<double?, ReceiptRateKey>((ref, k) async {
  final res = await mpRepo.resolveRate(
      milkType: k.milkType, fat: k.fat, snf: k.snf, scopeNodeId: k.nodeId, onDate: k.onDate);
  return res?.ratePerLitre;
});
