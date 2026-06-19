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

/// Today's outbound consignments from a node (all statuses, all kinds).
final nodeOutboundConsignmentsProvider =
    FutureProvider.family<List<MpConsignment>, String>((ref, nodeId) async {
  return mpRepo.consignments(fromNodeId: nodeId, collectionDate: todayIso(), limit: 200);
});

/// Availability (collected / dispatched / available) for a node today.
/// `shift` scopes the figure to AM/PM for no-BMC nodes that dispatch each shift
/// separately; pass null for BMC nodes that pool the whole day.
typedef AvailabilityArgs = ({String nodeId, String? shift});

final nodeAvailabilityProvider =
    FutureProvider.family<MpAvailability?, AvailabilityArgs>((ref, args) async {
  return mpRepo.availability(args.nodeId, todayIso(), shift: args.shift);
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
typedef VmccCollection = ({MpNode vmcc, double collected, double amQty, double pmQty, int farmers});

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
    );
  }));
});
