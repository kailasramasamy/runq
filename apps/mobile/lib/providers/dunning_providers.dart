import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/dunning_models.dart';
import '../api/dunning_repo.dart';
import 'auth_provider.dart';

T _watchAuth<T>(Ref ref, T Function() build) {
  ref.watch(authProvider.select((s) => s.token));
  return build();
}

final overdueInvoicesProvider =
    FutureProvider<List<OverdueInvoice>>((ref) async {
  return _watchAuth(ref, () => dunningRepo.overdue());
});

final dunningRulesProvider = FutureProvider<List<DunningRule>>((ref) async {
  return _watchAuth(ref, () => dunningRepo.rules());
});
