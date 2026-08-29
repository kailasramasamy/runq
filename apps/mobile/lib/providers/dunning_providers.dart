import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/dunning_models.dart';
import '../api/dunning_repo.dart';
import 'auth_provider.dart';

T _watchAuth<T>(Ref ref, T Function() build) {
  ref.watch(authProvider.select((s) => s.token));
  return build();
}

/// All open receivables — due and not yet due — so the aging screen totals
/// the same figure as the Money hub's Receivables KPI. Reminders are still
/// sent off the server's overdue-only list.
final openInvoicesProvider =
    FutureProvider<List<OverdueInvoice>>((ref) async {
  return _watchAuth(ref, () => dunningRepo.open());
});

final dunningRulesProvider = FutureProvider<List<DunningRule>>((ref) async {
  return _watchAuth(ref, () => dunningRepo.rules());
});
