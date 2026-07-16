import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/mp_models.dart';
import '../api/mp_repo.dart';
import '../utils/format.dart';
import 'dart:async';
import 'package:shared_preferences/shared_preferences.dart';
import 'auth_provider.dart';

/// The centre currently being operated as. Null → show the picker. Used by
/// admins (owner/accountant/viewer) operating "view as" any centre, AND by
/// field-operators who are directly assigned to more than one node (they pick
/// which one to run). A single-node operator never sets this.
/// Set via [setActiveNode] so the pick survives a cold start (audit E7).
final mpActiveNodeProvider = StateProvider<MpNode?>((ref) => null);

const _activeNodePrefKey = 'dhenu-active-node';

/// Set (or clear) the operated centre AND persist the choice, so a cold start
/// resumes the last centre instead of dropping the admin back to the picker.
void setActiveNode(WidgetRef ref, MpNode? node) {
  ref.read(mpActiveNodeProvider.notifier).state = node;
  unawaited(SharedPreferences.getInstance().then((p) =>
      node == null ? p.remove(_activeNodePrefKey) : p.setString(_activeNodePrefKey, node.id)));
}

/// One-shot guard: restore applies only once per session, so an explicit
/// "back to picker" isn't immediately overridden by the saved centre.
final activeNodeRestoreConsumedProvider = StateProvider<bool>((ref) => false);

/// The persisted last-operated centre, resolved against the live node list —
/// null when nothing was saved or the node no longer exists/is inactive.
final restoredActiveNodeProvider = FutureProvider<MpNode?>((ref) async {
  final prefs = await SharedPreferences.getInstance();
  final id = prefs.getString(_activeNodePrefKey);
  if (id == null) return null;
  final nodes = await mpRepo.nodes(limit: 500);
  final match = nodes.where((n) => n.id == id && n.isActive);
  return match.isEmpty ? null : match.first;
});

/// The farmer an admin is currently "viewing as" — operate the app as that
/// farmer. Null → not in farmer view. Mirrors [mpActiveNodeProvider] but for the
/// farmer persona; the farmer-scoped providers thread its id into repo calls so
/// the backend returns that farmer's data (owner/admin may pass an explicit
/// farmerId within the tenant). Always null for a real farmer login — the server
/// self-scopes those. Takes precedence over [mpActiveNodeProvider] in the admin
/// home, so setting a farmer clears any active node.
final mpViewAsFarmerProvider = StateProvider<MpFarmer?>((ref) => null);

/// All active farmers in the tenant — source for the admin "view as farmer"
/// picker. The server returns the whole tenant for owner/admin roles; the picker
/// searches this list client-side.
final tenantFarmersProvider = FutureProvider<List<MpFarmer>>((ref) async {
  final farmers = await mpRepo.farmers(limit: 500);
  return farmers.where((f) => f.isActive).toList();
});

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

/// Today's tenant-wide collection summary (no node scope) — total milk collected
/// across the whole network plus qty-weighted avg fat/SNF/water. Backs the admin
/// home summary card.
final tenantTodaySummaryProvider = FutureProvider<MpCollectionSummary?>((ref) async {
  final today = todayIso();
  return mpRepo.collectionSummary(from: today, to: today);
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
