import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/purchase_models.dart';
import '../api/purchase_repo.dart';

/// PP Phase 1 — Purchase Order providers. Mutations invalidate the
/// matching list + detail caches so the UI refreshes after send/close/cancel.

class POListParams {
  final String? status;
  final String? search;
  final String? vendorId;
  const POListParams({this.status, this.search, this.vendorId});

  @override
  bool operator ==(Object other) {
    if (other is! POListParams) return false;
    return other.status == status && other.search == search && other.vendorId == vendorId;
  }

  @override
  int get hashCode => Object.hash(status, search, vendorId);
}

class POListResult {
  final List<PurchaseOrder> data;
  final int total;
  final int totalPages;
  POListResult(this.data, this.total, this.totalPages);
}

final purchaseOrderListProvider =
    FutureProvider.autoDispose.family<POListResult, POListParams>((ref, p) async {
  final r = await purchaseRepo.listPOs(
    status: p.status,
    search: p.search,
    vendorId: p.vendorId,
  );
  return POListResult(r.data, r.total, r.totalPages);
});

final purchaseOrderDetailProvider =
    FutureProvider.autoDispose.family<PurchaseOrderWithLines, String>((ref, id) async {
  return purchaseRepo.getById(id);
});

final purchaseOrderLinkedDocsProvider = FutureProvider.autoDispose.family<
    ({
      List<Map<String, dynamic>> grns,
      List<Map<String, dynamic>> bills,
      List<Map<String, dynamic>> attachments,
    }),
    String>((ref, id) async {
  return purchaseRepo.linkedDocuments(id);
});
