import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/purchase_models.dart';
import '../api/purchase_repo.dart';

/// PP Phase 2 — providers for receive-against-PO. Mutation invalidations
/// land in the screen's onSuccess so the PO detail counters refresh.
final poReceiveTemplateProvider =
    FutureProvider.autoDispose.family<ReceiveTemplate, String>((ref, poId) async {
  return purchaseRepo.getReceiveTemplate(poId);
});
