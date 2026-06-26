import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/mp_models.dart';
import '../api/mp_repo.dart';
import '../utils/format.dart';
import 'auth_provider.dart';

/// The centre currently being operated as. Null → show the picker. Used by
/// admins (owner/accountant/viewer) operating "view as" any centre, AND by
/// field-operators who are directly assigned to more than one node (they pick
/// which one to run). A single-node operator never sets this.
final mpActiveNodeProvider = StateProvider<MpNode?>((ref) => null);

/// The nodes a field-operator is DIRECTLY assigned to (not the descendant-
/// expanded scope). Backs the operator node-selector + in-shell switcher. The
/// API returns just their assigned VMCC(s)/CC(s)/PP(s) via `assignedOnly=true`.
final operatorAssignedNodesProvider = FutureProvider<List<MpNode>>((ref) async {
  final auth = ref.watch(authProvider);
  if (!auth.isAuthenticated) return const [];
  return mpRepo.nodes(assignedOnly: true, limit: 100);
});

/// The operator's assigned nodes. For a `field_operator` the API scopes
/// `GET /nodes` to just the nodes they run (via `mp_node_operators.user_id`),
/// so this returns exactly their VMCC(s)/CC(s)/PP(s). An admin (owner etc) gets
/// the full network — they pick context per-screen ("view as").
final operatorNodesProvider = FutureProvider<List<MpNode>>((ref) async {
  final auth = ref.watch(authProvider);
  if (!auth.isAuthenticated) return const [];
  return mpRepo.nodes(limit: 100);
});

/// Active farmers registered at a node (the VMCC capture picker source).
final nodeFarmersProvider = FutureProvider.family<List<MpFarmer>, String>((ref, nodeId) async {
  final farmers = await mpRepo.farmers(nodeId: nodeId, limit: 500);
  return farmers.where((f) => f.isActive).toList();
});

/// Today's collection summary for a node (the VMCC home hero numbers).
final nodeTodaySummaryProvider = FutureProvider.family<MpCollectionSummary?, String>((ref, nodeId) async {
  final today = todayIso();
  return mpRepo.collectionSummary(from: today, to: today, nodeId: nodeId);
});

/// A node's collection summary for a single chosen date — backs the VMCC report
/// screen's date picker. Keyed by (nodeId, date).
final nodeSummaryForDateProvider =
    FutureProvider.family<MpCollectionSummary?, NodeDateKey>((ref, key) async {
  return mpRepo.collectionSummary(from: key.date, to: key.date, nodeId: key.nodeId);
});

/// Per-day qty-weighted QC rollup of a node's pours over the last [days],
/// optionally scoped to one farmer — backs the VMCC QC trend chart. Keyed so
/// each window + farmer scope caches separately.
typedef PoursDailyKey = ({String nodeId, int days, String? farmerId});

final nodePoursDailyProvider =
    FutureProvider.family<List<MpPourDay>, PoursDailyKey>((ref, key) async {
  return mpRepo.poursDaily(
    nodeId: key.nodeId, farmerId: key.farmerId,
    from: isoDaysAgo(key.days - 1), to: todayIso(),
  );
});

/// Today's recorded pours at a node (recent entries list), newest first.
final nodeTodayPoursProvider = FutureProvider.family<List<MpPour>, String>((ref, nodeId) async {
  return mpRepo.pours(nodeId: nodeId, collectionDate: todayIso(), status: 'recorded', limit: 100);
});

/// Recorded pours at a node for a specific collection date — backs Record
/// Collection's entries list when the operator back-dates an entry. Today still
/// uses [nodeTodayPoursProvider] (it stays invalidated for Home + the summary).
typedef NodeDateKey = ({String nodeId, String date});

final nodePoursForDateProvider =
    FutureProvider.family<List<MpPour>, NodeDateKey>((ref, key) async {
  return mpRepo.pours(nodeId: key.nodeId, collectionDate: key.date, status: 'recorded', limit: 100);
});

/// Recorded pours over the last 30 days at a node (collection history), newest
/// first — grouped by date in the history screen.
final nodeHistoryPoursProvider = FutureProvider.family<List<MpPour>, String>((ref, nodeId) async {
  return mpRepo.pours(
      nodeId: nodeId, from: isoDaysAgo(30), to: todayIso(), status: 'recorded', limit: 500);
});

/// One farmer's recorded pours over the last 30 days at a node (the farmer
/// detail "Pours" tab). Scoped to `farmerId` server-side so we never pull the
/// whole node's history just to show a single farmer — keeps the payload small
/// and the query indexed instead of choking the app / straining the server.
typedef FarmerPoursKey = ({String nodeId, String farmerId});

final farmerHistoryPoursProvider =
    FutureProvider.family<List<MpPour>, FarmerPoursKey>((ref, key) async {
  return mpRepo.pours(
    nodeId: key.nodeId,
    farmerId: key.farmerId,
    from: isoDaysAgo(30),
    to: todayIso(),
    status: 'recorded',
    limit: 100,
  );
});

/// The signed-in operator's own comp terms + this month's earning (server
/// scopes to self by user_id). Drives the Bank & payout screen. Empty for
/// farmers / unlinked operators.
final operatorSelfProvider = FutureProvider<List<MpOperatorSelf>>((ref) async {
  final auth = ref.watch(authProvider);
  if (!auth.isAuthenticated || auth.user?.role != 'field_operator') return const [];
  return mpRepo.operatorSelf();
});

/// Quality band thresholds per milk type, keyed by nodeId (null = tenant default).
/// Cached per node; refreshes when provider is invalidated.
final qualityBandsProvider = FutureProvider.family<QualityBands, String?>((ref, nodeId) async {
  return mpRepo.qualityBands(nodeId: nodeId);
});

/// The node whose dashboard an operator lands on: the highest tier they manage
/// (PP ▸ CC ▸ VMCC), since a CC's assignment also resolves its child VMCCs.
/// Null while loading or if none assigned.
final primaryNodeProvider = Provider<AsyncValue<MpNode?>>((ref) {
  final nodes = ref.watch(operatorNodesProvider);
  return nodes.whenData((list) {
    if (list.isEmpty) return null;
    int rank(MpNode n) => n.isPp ? 3 : (n.isCc ? 2 : 1);
    return list.reduce((a, b) => rank(b) > rank(a) ? b : a);
  });
});
