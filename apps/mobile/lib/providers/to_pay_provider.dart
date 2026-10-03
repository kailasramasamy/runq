import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/to_pay_models.dart';
import '../api/to_pay_repo.dart';
import 'auth_provider.dart';

/// Keyed by 'YYYY-MM'; null is the outstanding view.
final toPayProvider = FutureProvider.autoDispose.family<ToPay, String?>((ref, month) async {
  ref.watch(authProvider.select((s) => s.token));
  return toPayRepo.fetch(month: month);
});
