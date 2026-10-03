import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/recurring_bill_models.dart';
import '../api/recurring_bills_repo.dart';
import 'auth_provider.dart';

final recurringBillsProvider = FutureProvider<List<RecurringBill>>((ref) async {
  ref.watch(authProvider.select((s) => s.token));
  return recurringBillsRepo.list();
});

final recurringBillDetailProvider =
    FutureProvider.family<RecurringBillDetail, String>((ref, id) async {
  ref.watch(authProvider.select((s) => s.token));
  return recurringBillsRepo.detail(id);
});
