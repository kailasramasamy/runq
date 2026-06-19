import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/mp_models.dart';
import '../api/mp_repo.dart';
import 'farmer_providers.dart' show cycleConfigProvider, buildCyclePeriods, MpCyclePeriod;

export 'farmer_providers.dart' show MpCyclePeriod;

/// Payout cycles scoped to one VMCC node (newest period first).
final nodeCyclesProvider =
    FutureProvider.family<List<MpPayoutCycle>, String>((ref, nodeId) async {
  return mpRepo.payoutCycles(scopeNodeId: nodeId, limit: 50);
});

/// Full cycle detail (lines + deductions) for the detail screen.
final cycleDetailProvider =
    FutureProvider.family<MpPayoutCycle?, String>((ref, cycleId) async {
  return mpRepo.payoutCycle(cycleId);
});

/// A single farmer's ledger balance + entries (advances / loans / repayments).
final farmerLedgerProvider =
    FutureProvider.family<({double balance, List<MpLedgerEntry> entries}), String>(
        (ref, farmerId) async {
  return mpRepo.farmerLedger(farmerId: farmerId);
});

/// Recent cadence-aligned cycle windows to offer when starting a new cycle
/// (index 0 = the in-progress window). Cadence-only, persona-agnostic.
final recentCyclePeriodsProvider = FutureProvider<List<MpCyclePeriod>>((ref) async {
  final cfg = await ref.watch(cycleConfigProvider.future);
  return buildCyclePeriods(cfg, DateTime.now(), 6);
});

/// Operator compensation lines for the manager's subtree over a period — what
/// each VMCC operator is owed (commission/salary + rent), already-paid flagged.
final operatorPayoutComputeProvider =
    FutureProvider.family<List<MpOperatorPayoutLine>, ({String from, String to})>(
        (ref, p) async {
  return mpRepo.operatorPayoutCompute(from: p.from, to: p.to);
});
