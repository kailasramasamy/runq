// Manufacturing Phase 1 providers. Mutations invalidate matching list +
// detail caches so the UI refreshes after create/update/cancel.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/manufacturing_models.dart';
import '../api/manufacturing_repo.dart';

export '../api/manufacturing_repo.dart' show manufacturingRepo;
export '../api/manufacturing_models.dart'
    show WoConsumptionRow, WoOutputRow, SuggestedBatch, WoCostingPreview, WoCloseResult,
        MfgDashboard, MfgTopBom, WoSummaryRow, YieldTrendPoint;

// ── BOM providers ─────────────────────────────────────────────────────────

class BomListParams {
  final String? outputItemId;
  final bool? isActive;
  final String? search;
  const BomListParams({this.outputItemId, this.isActive, this.search});

  @override
  bool operator ==(Object other) {
    if (other is! BomListParams) return false;
    return other.outputItemId == outputItemId &&
        other.isActive == isActive &&
        other.search == search;
  }

  @override
  int get hashCode => Object.hash(outputItemId, isActive, search);
}

class BomListResult {
  final List<BomListRow> data;
  final int total;
  final int totalPages;
  BomListResult(this.data, this.total, this.totalPages);
}

final bomListProvider =
    FutureProvider.autoDispose.family<BomListResult, BomListParams>((ref, p) async {
  final r = await manufacturingRepo.listBoms(
    outputItemId: p.outputItemId,
    isActive: p.isActive,
    search: p.search,
    // Category-ordered so the screen can section the list without a group
    // reappearing further down. The screen has no load-more, so it asks for
    // the whole set in one page rather than silently stopping at 25 — BOM
    // counts are in the tens even for a busy plant.
    sort: 'category',
    limit: 200,
  );
  return BomListResult(r.data, r.total, r.totalPages);
});

final bomDetailProvider =
    FutureProvider.autoDispose.family<Bom, String>((ref, id) async {
  return manufacturingRepo.getBom(id);
});

// ── Work Order providers ──────────────────────────────────────────────────

class WoListParams {
  final String? status;
  final String? bomId;
  final String? warehouseId;
  final String? scheduledFrom;
  final String? scheduledTo;

  /// Single day the WO was *active* on — scheduled for it, or started /
  /// completed / closed on it. Wider than scheduledFrom/To by design: a run
  /// scheduled yesterday and finished this morning is today's work.
  final String? activeOn;
  final String? search;
  const WoListParams({
    this.status,
    this.bomId,
    this.warehouseId,
    this.scheduledFrom,
    this.scheduledTo,
    this.activeOn,
    this.search,
  });

  @override
  bool operator ==(Object other) {
    if (other is! WoListParams) return false;
    return other.status == status &&
        other.bomId == bomId &&
        other.warehouseId == warehouseId &&
        other.scheduledFrom == scheduledFrom &&
        other.scheduledTo == scheduledTo &&
        other.activeOn == activeOn &&
        other.search == search;
  }

  @override
  int get hashCode =>
      Object.hash(status, bomId, warehouseId, scheduledFrom, scheduledTo, activeOn, search);
}

class WoListResult {
  final List<WorkOrderListRow> data;
  final int total;
  final int totalPages;
  WoListResult(this.data, this.total, this.totalPages);
}

final workOrderListProvider =
    FutureProvider.autoDispose.family<WoListResult, WoListParams>((ref, p) async {
  final r = await manufacturingRepo.listWos(
    status: p.status,
    bomId: p.bomId,
    warehouseId: p.warehouseId,
    scheduledFrom: p.scheduledFrom,
    scheduledTo: p.scheduledTo,
    activeOn: p.activeOn,
    search: p.search,
  );
  return WoListResult(r.data, r.total, r.totalPages);
});

final workOrderDetailProvider =
    FutureProvider.autoDispose.family<WorkOrder, String>((ref, id) async {
  return manufacturingRepo.getWo(id);
});

// ── Phase 2 providers ─────────────────────────────────────────────────────

/// Live consumption rows for a WO.
final woConsumptionProvider =
    FutureProvider.autoDispose.family<List<WoConsumptionRow>, String>((ref, woId) async {
  return manufacturingRepo.listConsumption(woId);
});

/// Live output rows for a WO.
final woOutputProvider =
    FutureProvider.autoDispose.family<List<WoOutputRow>, String>((ref, woId) async {
  return manufacturingRepo.listOutput(woId);
});

/// Live costing preview for a WO.
final woPreviewProvider =
    FutureProvider.autoDispose.family<WoCostingPreview, String>((ref, woId) async {
  return manufacturingRepo.getCostingPreview(woId);
});

/// Params bag for the suggested-batches provider.
class SuggestedBatchesParams {
  final String woId;
  final String inputItemId;
  final String warehouseId;
  final double? requiredQty;

  const SuggestedBatchesParams({
    required this.woId,
    required this.inputItemId,
    required this.warehouseId,
    this.requiredQty,
  });

  @override
  bool operator ==(Object other) {
    if (other is! SuggestedBatchesParams) return false;
    return other.woId == woId &&
        other.inputItemId == inputItemId &&
        other.warehouseId == warehouseId &&
        other.requiredQty == requiredQty;
  }

  @override
  int get hashCode => Object.hash(woId, inputItemId, warehouseId, requiredQty);
}

final suggestedBatchesProvider =
    FutureProvider.autoDispose.family<List<SuggestedBatch>, SuggestedBatchesParams>(
  (ref, p) async {
    return manufacturingRepo.getSuggestedBatches(
      p.woId,
      inputItemId: p.inputItemId,
      warehouseId: p.warehouseId,
      requiredQty: p.requiredQty,
    );
  },
);

// ── Phase 3 providers ─────────────────────────────────────────────────────

/// Manufacturing dashboard — single call replacing the 4 list queries.
final mfgDashboardProvider =
    FutureProvider.autoDispose<MfgDashboard>((ref) async {
  return manufacturingRepo.getDashboard();
});

/// Params for the WO summary report.
class WoSummaryParams {
  final String? bomId;
  final String? warehouseId;
  final String? status;
  final String? from;
  final String? to;

  const WoSummaryParams({
    this.bomId,
    this.warehouseId,
    this.status,
    this.from,
    this.to,
  });

  @override
  bool operator ==(Object other) {
    if (other is! WoSummaryParams) return false;
    return other.bomId == bomId &&
        other.warehouseId == warehouseId &&
        other.status == status &&
        other.from == from &&
        other.to == to;
  }

  @override
  int get hashCode => Object.hash(bomId, warehouseId, status, from, to);
}

final woSummaryProvider =
    FutureProvider.autoDispose.family<List<WoSummaryRow>, WoSummaryParams>(
  (ref, p) async => manufacturingRepo.getWoSummary(
    bomId: p.bomId,
    warehouseId: p.warehouseId,
    status: p.status,
    from: p.from,
    to: p.to,
  ),
);

/// Params for the yield trend report.
class YieldTrendParams {
  final String? bomId;
  final String bucket;
  final String? from;
  final String? to;

  const YieldTrendParams({
    this.bomId,
    this.bucket = 'day',
    this.from,
    this.to,
  });

  @override
  bool operator ==(Object other) {
    if (other is! YieldTrendParams) return false;
    return other.bomId == bomId &&
        other.bucket == bucket &&
        other.from == from &&
        other.to == to;
  }

  @override
  int get hashCode => Object.hash(bomId, bucket, from, to);
}

final yieldTrendProvider =
    FutureProvider.autoDispose.family<List<YieldTrendPoint>, YieldTrendParams>(
  (ref, p) async => manufacturingRepo.getYieldTrend(
    bomId: p.bomId,
    bucket: p.bucket,
    from: p.from,
    to: p.to,
  ),
);
