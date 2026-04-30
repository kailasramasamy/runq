import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/payrun_models.dart';
import '../api/payrun_repo.dart';
import 'auth_provider.dart';

T _watchAuth<T>(Ref ref, T Function() build) {
  ref.watch(authProvider.select((s) => s.token));
  return build();
}

final payRunQueueProvider = FutureProvider<PaymentQueue>((ref) async {
  return _watchAuth(ref, () => payRunRepo.queue());
});

final payRunListProvider = FutureProvider<List<PaymentRun>>((ref) async {
  return _watchAuth(ref, () => payRunRepo.list());
});

final payRunDetailProvider =
    FutureProvider.family<PaymentRunWithLines, String>((ref, id) async {
  return _watchAuth(ref, () => payRunRepo.get(id));
});
