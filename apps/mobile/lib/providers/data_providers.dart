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

final gstReturnsProvider = FutureProvider<List<GstReturn>>((ref) async {
  return _watchAuth(ref, () => gstRepo.list());
});

final gstReturnDetailProvider =
    FutureProvider.family<GstReturnDetail, String>((ref, id) async {
  return _watchAuth(ref, () => gstRepo.get(id));
});

/// Company GSTN identity (gstin + username) for pre-filling the auth sheet.
/// Null on failure so the sheet falls back to manual entry.
final gstCompanyProfileProvider = FutureProvider<GstCompanyProfile?>((ref) async {
  return _watchAuth(ref, () async {
    try {
      return await gstRepo.companyGstProfile();
    } catch (_) {
      return null;
    }
  });
});

final gst2bSummaryProvider =
    FutureProvider.family<Gstr2bSummary, String>((ref, period) async {
  return _watchAuth(ref, () => gstRepo.summary2b(period));
});

class Gstr2bFilter {
  final String period;
  final String? status;
  const Gstr2bFilter({required this.period, this.status});

  @override
  bool operator ==(Object o) =>
      o is Gstr2bFilter && o.period == period && o.status == status;
  @override
  int get hashCode => Object.hash(period, status);
}

final gst2bMatchesProvider =
    FutureProvider.family<List<Gstr2bMatch>, Gstr2bFilter>((ref, f) async {
  return _watchAuth(ref, () => gstRepo.matches2b(f.period, status: f.status));
});

final activityProvider = FutureProvider<List<ActivityEntry>>((ref) async {
  return _watchAuth(ref, () => dashboardRepo.activity());
});

final invoiceSummaryProvider = FutureProvider<InvoiceSummary>((ref) async {
  return _watchAuth(ref, () => invoicesRepo.summary());
});

class InvoiceFilter {
  final String? customerId;
  final String? status;
  final String? search;
  final DateTime? dateFrom;
  final DateTime? dateTo;
  const InvoiceFilter({this.customerId, this.status, this.search, this.dateFrom, this.dateTo});

  @override
  bool operator ==(Object o) =>
      o is InvoiceFilter &&
      o.customerId == customerId &&
      o.status == status &&
      o.search == search &&
      o.dateFrom == dateFrom &&
      o.dateTo == dateTo;
  @override
  int get hashCode => Object.hash(customerId, status, search, dateFrom, dateTo);
}

final invoicesProvider = FutureProvider.family<PaginatedResponse<Invoice>, InvoiceFilter>((ref, f) async {
  return _watchAuth(ref, () => invoicesRepo.list(
        customerId: f.customerId,
        status: f.status,
        search: f.search,
        dateFrom: f.dateFrom,
        dateTo: f.dateTo,
      ));
});

/// Per-customer summary — scopes every metric (totals, overdue, draft count)
/// to the given customer. Pass `null` to get the tenant-wide summary, same
/// as [invoiceSummaryProvider] (we keep both so existing call sites that
/// only ever want the global view stay untouched).
final filteredInvoiceSummaryProvider = FutureProvider.family<InvoiceSummary, String?>((ref, customerId) async {
  return _watchAuth(ref, () => invoicesRepo.summary(customerId: customerId));
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
  final String? vendorId;
  final String? status;
  final String? search;
  final DateTime? dateFrom;
  final DateTime? dateTo;
  const BillFilter({this.vendorId, this.status, this.search, this.dateFrom, this.dateTo});

  @override
  bool operator ==(Object o) =>
      o is BillFilter &&
      o.vendorId == vendorId &&
      o.status == status &&
      o.search == search &&
      o.dateFrom == dateFrom &&
      o.dateTo == dateTo;
  @override
  int get hashCode => Object.hash(vendorId, status, search, dateFrom, dateTo);
}

final billsProvider = FutureProvider.family<PaginatedResponse<Bill>, BillFilter>((ref, f) async {
  return _watchAuth(ref, () => billsRepo.list(
        vendorId: f.vendorId,
        status: f.status,
        search: f.search,
        dateFrom: f.dateFrom,
        dateTo: f.dateTo,
      ));
});

/// Per-vendor AP summary — scopes outstanding / overdue / pending-approval
/// counts to the given vendor. Pass `null` to get the tenant-wide view
/// (same payload as [billsSummaryProvider]). Existing call sites use
/// [billsSummaryProvider] unchanged so the dashboard isn't disturbed.
final filteredBillsSummaryProvider = FutureProvider.family<BillsSummary, String?>((ref, vendorId) async {
  return _watchAuth(ref, () => billsRepo.summary(vendorId: vendorId));
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

final expenseAccountsProvider = FutureProvider<List<GlAccount>>((ref) async {
  return _watchAuth(ref, () => bankingRepo.expenseAccounts());
});

final pendingPaymentsProvider = FutureProvider<List<PendingPayment>>((ref) async {
  return _watchAuth(ref, () => bankingRepo.pendingPayments());
});

final bankTxnsProvider = FutureProvider.family<PaginatedResponse<BankTxn>, String>((ref, accountId) async {
  return _watchAuth(ref, () => bankingRepo.transactions(accountId));
});

/// Unreconciled txns for an account, fetched server-side so old stragglers
/// aren't hidden behind [bankTxnsProvider]'s 50-most-recent window. Backs the
/// banking screen's "Unmatched" filter.
final bankUnreconciledTxnsProvider =
    FutureProvider.family<PaginatedResponse<BankTxn>, String>((ref, accountId) async {
  return _watchAuth(ref, () => bankingRepo.transactions(accountId, reconStatus: 'unreconciled'));
});

/// Date of the most recent imported transaction on the account — backs the
/// 'Synced till …' chip in the banking screen.
final bankLastSyncDateProvider = FutureProvider.family<DateTime?, String>((ref, accountId) async {
  return _watchAuth(ref, () => bankingRepo.lastSyncDate(accountId));
});

/// Cheap inbox count for the dashboard quick-action badge. Polls keep it
/// reasonably fresh; mutations elsewhere should also `ref.invalidate` this
/// provider for instant updates.
final inboxCountProvider = FutureProvider<int>((ref) async {
  return _watchAuth(ref, () => inboxRepo.count());
});

/// Full grouped payload for the inbox screen.
final inboxProvider = FutureProvider<InboxPayload>((ref) async {
  return _watchAuth(ref, () => inboxRepo.list());
});

final pendingApprovalsProvider = FutureProvider<List<ApprovalInstance>>((ref) async {
  return _watchAuth(ref, () => approvalsRepo.pending());
});
