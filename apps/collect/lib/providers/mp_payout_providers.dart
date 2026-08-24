import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/mp_models.dart';
import '../api/mp_running_models.dart';
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

/// Every payout line for one farmer, newest cycle first, each joined with its
/// cycle window and status (GET /payouts/my-lines). Readable by an operator for
/// a farmer at a node they hold — the server enforces that, so the operator and
/// farmer personas share the one endpoint.
final payoutLinesForFarmerProvider =
    FutureProvider.family<List<MpPayoutLine>, String>((ref, farmerId) async {
  return mpRepo.farmerPayoutLines(farmerId: farmerId);
});

/// A single farmer's ledger balance + entries (advances / loans / repayments).
final farmerLedgerProvider =
    FutureProvider.family<MpFarmerLedger, String>((ref, farmerId) async {
  return mpRepo.farmerLedger(farmerId: farmerId);
});

/// Goods sold to one farmer — the detail behind their `farmer_sale` deductions.
final farmerSalesProvider =
    FutureProvider.family<List<MpFarmerSale>, String>((ref, farmerId) async {
  // Reversed sales stay in the operator's list, struck through: a correction
  // they can't see is a correction they'll make twice.
  return mpRepo.farmerSales(farmerId: farmerId, includeReversed: true);
});

/// The counter catalogue, for the sale sheet's product picker.
final sellableItemsProvider = FutureProvider<List<MpSellableItem>>((ref) async {
  return mpRepo.sellableItems();
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

/// One VMCC's settlement bills — the money view for a centre whose milk is
/// bought in bulk rather than farmer by farmer, so it has payout cycles at its
/// parent CC but none of its own.
final nodeVmccBillsProvider =
    FutureProvider.family<List<MpVmccBill>, String>((ref, nodeId) async {
  return mpRepo.vmccBills(nodeId: nodeId);
});

/// One cycle's bills, per VMCC. For a CC that buys wholesale this IS the cycle:
/// there are no farmer payout lines to break down, so without these the detail
/// screen has nothing to show.
final cycleVmccBillsProvider =
    FutureProvider.family<List<MpVmccBill>, String>((ref, cycleId) async {
  return mpRepo.vmccBills(cycleId: cycleId, limit: 100);
});

/// The open cycle's running balance for a whole centre — a VMCC's farmers, or a
/// CC's VMCCs. This is the number an operator needs *before* a bill exists, so
/// it is computed live rather than read off payout lines.
final runningBalanceProvider =
    FutureProvider.family<MpRunningBalance, String>((ref, nodeId) async {
  return mpRepo.runningBalance(nodeId: nodeId);
});

/// One farmer's slice of the same window. Keyed on both ids because a farmer's
/// running total is only meaningful against the centre they poured at.
final farmerRunningBalanceProvider =
    FutureProvider.family<MpRunningBalance, ({String nodeId, String farmerId})>(
        (ref, p) async {
  return mpRepo.runningBalance(nodeId: p.nodeId, farmerId: p.farmerId);
});
