import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/models.dart';
import '../api/repos.dart';
import 'auth_provider.dart';

// Re-fetch all domain data when the auth token changes.
T _watchAuth<T>(Ref ref, T Function() build) {
  ref.watch(authProvider.select((s) => s.token));
  return build();
}

final dashboardSummaryProvider = FutureProvider<DashboardSummary>((ref) async {
  return _watchAuth(ref, () => dashboardRepo.summary());
});

final cashTrendProvider = FutureProvider<CashTrend>((ref) async {
  return _watchAuth(ref, () => dashboardRepo.cashTrend());
});

final gstReadinessProvider = FutureProvider<GstReadiness?>((ref) async {
  return _watchAuth(ref, () => dashboardRepo.gstReadiness());
});

final activityProvider = FutureProvider<List<ActivityEntry>>((ref) async {
  return _watchAuth(ref, () => dashboardRepo.activity());
});

final invoiceSummaryProvider = FutureProvider<InvoiceSummary>((ref) async {
  return _watchAuth(ref, () => invoicesRepo.summary());
});

class InvoiceFilter {
  final String? status;
  final String? search;
  final DateTime? dateFrom;
  final DateTime? dateTo;
  const InvoiceFilter({this.status, this.search, this.dateFrom, this.dateTo});

  @override
  bool operator ==(Object o) =>
      o is InvoiceFilter &&
      o.status == status &&
      o.search == search &&
      o.dateFrom == dateFrom &&
      o.dateTo == dateTo;
  @override
  int get hashCode => Object.hash(status, search, dateFrom, dateTo);
}

final invoicesProvider = FutureProvider.family<PaginatedResponse<Invoice>, InvoiceFilter>((ref, f) async {
  return _watchAuth(ref, () => invoicesRepo.list(
        status: f.status,
        search: f.search,
        dateFrom: f.dateFrom,
        dateTo: f.dateTo,
      ));
});

final invoiceDetailProvider = FutureProvider.family<InvoiceWithDetails, String>((ref, id) async {
  return _watchAuth(ref, () => invoicesRepo.detail(id));
});

final invoiceReceiptsProvider = FutureProvider.family<List<InvoiceReceipt>, String>((ref, id) async {
  return _watchAuth(ref, () => invoicesRepo.receipts(id));
});

final billsSummaryProvider = FutureProvider<BillsSummary>((ref) async {
  return _watchAuth(ref, () => billsRepo.summary());
});

class BillFilter {
  final String? status;
  final String? search;
  final DateTime? dateFrom;
  final DateTime? dateTo;
  const BillFilter({this.status, this.search, this.dateFrom, this.dateTo});

  @override
  bool operator ==(Object o) =>
      o is BillFilter &&
      o.status == status &&
      o.search == search &&
      o.dateFrom == dateFrom &&
      o.dateTo == dateTo;
  @override
  int get hashCode => Object.hash(status, search, dateFrom, dateTo);
}

final billsProvider = FutureProvider.family<PaginatedResponse<Bill>, BillFilter>((ref, f) async {
  return _watchAuth(ref, () => billsRepo.list(
        status: f.status,
        search: f.search,
        dateFrom: f.dateFrom,
        dateTo: f.dateTo,
      ));
});

final billDetailProvider = FutureProvider.family<BillWithDetails, String>((ref, id) async {
  return _watchAuth(ref, () => billsRepo.detail(id));
});

final billAttachmentsProvider = FutureProvider.family<List<BillAttachment>, String>((ref, id) async {
  return _watchAuth(ref, () => billsRepo.attachments(id));
});

final bankAccountsProvider = FutureProvider<List<BankAccount>>((ref) async {
  return _watchAuth(ref, () => bankingRepo.accounts());
});

final bankTxnsProvider = FutureProvider.family<PaginatedResponse<BankTxn>, String>((ref, accountId) async {
  return _watchAuth(ref, () => bankingRepo.transactions(accountId));
});

final pendingApprovalsProvider = FutureProvider<List<ApprovalInstance>>((ref) async {
  return _watchAuth(ref, () => approvalsRepo.pending());
});
