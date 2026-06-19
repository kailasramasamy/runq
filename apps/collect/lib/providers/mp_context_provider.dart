import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/mp_models.dart';
import '../api/mp_repo.dart';
import '../utils/format.dart';
import 'auth_provider.dart';

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

/// Today's recorded pours at a node (recent entries list), newest first.
final nodeTodayPoursProvider = FutureProvider.family<List<MpPour>, String>((ref, nodeId) async {
  return mpRepo.pours(nodeId: nodeId, collectionDate: todayIso(), status: 'recorded', limit: 100);
});

/// Recorded pours over the last 30 days at a node (collection history), newest
/// first — grouped by date in the history screen.
final nodeHistoryPoursProvider = FutureProvider.family<List<MpPour>, String>((ref, nodeId) async {
  return mpRepo.pours(
      nodeId: nodeId, from: isoDaysAgo(30), to: todayIso(), status: 'recorded', limit: 500);
});

/// The signed-in operator's own comp terms + this month's earning (server
/// scopes to self by user_id). Drives the Bank & payout screen. Empty for
/// farmers / unlinked operators.
final operatorSelfProvider = FutureProvider<List<MpOperatorSelf>>((ref) async {
  final auth = ref.watch(authProvider);
  if (!auth.isAuthenticated || auth.user?.role != 'field_operator') return const [];
  return mpRepo.operatorSelf();
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
