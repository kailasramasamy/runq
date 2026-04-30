import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../api/models.dart';
import '../api/repos.dart';
import '../theme/runq_tokens.dart';
import '../theme/runq_theme.dart';
import '../utils/format_inr.dart';
import '../widgets/avatar.dart';
import '../widgets/runq_card.dart';
import '../widgets/status_pill.dart';

class _Results {
  final List<Invoice> invoices;
  final List<Bill> bills;
  const _Results({required this.invoices, required this.bills});
  bool get isEmpty => invoices.isEmpty && bills.isEmpty;
}

final _queryProvider = StateProvider.autoDispose<String>((_) => '');

final _resultsProvider = FutureProvider.autoDispose<_Results>((ref) async {
  final q = ref.watch(_queryProvider).trim();
  if (q.length < 2) return const _Results(invoices: [], bills: []);

  // Hit invoices + bills in parallel; failures on either side don't break
  // the other.
  final futures = await Future.wait([
    invoicesRepo.list(search: q, limit: 20).then((p) => p.data).catchError((_) => <Invoice>[]),
    billsRepo.list(search: q, limit: 20).then((p) => p.data).catchError((_) => <Bill>[]),
  ]);
  return _Results(invoices: futures[0] as List<Invoice>, bills: futures[1] as List<Bill>);
});

class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key});

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  final _ctrl = TextEditingController();
  final _focus = FocusNode();
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _focus.requestFocus());
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _ctrl.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _onChanged(String v) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 280), () {
      ref.read(_queryProvider.notifier).state = v;
    });
  }

  void _clear() {
    _ctrl.clear();
    _onChanged('');
  }

  @override
  Widget build(BuildContext context) {
    final q = ref.watch(_queryProvider);
    final results = ref.watch(_resultsProvider);

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            _SearchHeader(controller: _ctrl, focus: _focus, onChanged: _onChanged, onClear: _clear),
            Expanded(
              child: q.trim().length < 2
                  ? const _Hint()
                  : results.when(
                      data: (r) => r.isEmpty
                          ? _Empty(query: q)
                          : _ResultList(results: r),
                      loading: () => const _Loading(),
                      error: (e, _) => _Empty(query: q, error: e.toString()),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SearchHeader extends StatefulWidget {
  final TextEditingController controller;
  final FocusNode focus;
  final ValueChanged<String> onChanged;
  final VoidCallback onClear;
  const _SearchHeader({required this.controller, required this.focus, required this.onChanged, required this.onClear});

  @override
  State<_SearchHeader> createState() => _SearchHeaderState();
}

class _SearchHeaderState extends State<_SearchHeader> {
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 16, 8),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
            onPressed: () => Navigator.pop(context),
          ),
          Expanded(
            child: Container(
              height: 44,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              decoration: BoxDecoration(
                color: t.inputFill,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  Icon(Icons.search_rounded, size: 18, color: t.muted),
                  const SizedBox(width: 8),
                  Expanded(
                    child: TextField(
                      controller: widget.controller,
                      focusNode: widget.focus,
                      autofocus: true,
                      textInputAction: TextInputAction.search,
                      style: RunqText.body.copyWith(color: t.ink),
                      cursorColor: RunqColors.indigo,
                      decoration: InputDecoration(
                        hintText: 'Invoices, bills, customers, vendors',
                        hintStyle: RunqText.body.copyWith(color: t.muted2),
                        isDense: true,
                        border: InputBorder.none,
                        contentPadding: EdgeInsets.zero,
                      ),
                      onChanged: (v) {
                        setState(() {}); // refresh clear button visibility
                        widget.onChanged(v);
                      },
                    ),
                  ),
                  if (widget.controller.text.isNotEmpty)
                    GestureDetector(
                      onTap: () {
                        widget.onClear();
                        setState(() {});
                      },
                      child: Padding(
                        padding: const EdgeInsets.only(left: 6),
                        child: Icon(Icons.close_rounded, size: 18, color: t.muted),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Hint extends StatelessWidget {
  const _Hint();

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 64),
      child: Column(
        children: [
          Icon(Icons.search_rounded, size: 36, color: t.muted2),
          const SizedBox(height: 10),
          Text('Search across runQ',
              style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 15)),
          const SizedBox(height: 4),
          Text(
            'Try a customer name, invoice number, vendor or bill number.',
            textAlign: TextAlign.center,
            style: RunqText.caption.copyWith(color: t.muted),
          ),
        ],
      ),
    );
  }
}

class _Loading extends StatelessWidget {
  const _Loading();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.symmetric(vertical: 48),
      child: Center(
        child: SizedBox(
          width: 22, height: 22,
          child: CircularProgressIndicator(strokeWidth: 2, color: RT(context).brand),
        ),
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  final String query;
  final String? error;
  const _Empty({required this.query, this.error});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 64),
      child: Column(
        children: [
          Icon(error != null ? Icons.cloud_off_rounded : Icons.search_off_rounded,
              size: 36, color: t.muted2),
          const SizedBox(height: 10),
          Text(error != null ? "Couldn't search" : 'No results for "$query"',
              style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 15),
              textAlign: TextAlign.center),
          if (error == null) ...[
            const SizedBox(height: 4),
            Text('Try a different name, number or partial match.',
                textAlign: TextAlign.center,
                style: RunqText.caption.copyWith(color: t.muted)),
          ],
        ],
      ),
    );
  }
}

class _ResultList extends StatelessWidget {
  final _Results results;
  const _ResultList({required this.results});

  @override
  Widget build(BuildContext context) {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        if (results.invoices.isNotEmpty) ...[
          _SectionHeader(label: 'Invoices', count: results.invoices.length),
          for (final inv in results.invoices) _InvoiceRow(invoice: inv),
          const SizedBox(height: 16),
        ],
        if (results.bills.isNotEmpty) ...[
          _SectionHeader(label: 'Bills', count: results.bills.length),
          for (final bill in results.bills) _BillRow(bill: bill),
        ],
      ],
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String label;
  final int count;
  const _SectionHeader({required this.label, required this.count});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 4, 4, 8),
      child: Row(
        children: [
          Text(label.toUpperCase(), style: RunqText.label.copyWith(color: t.muted2)),
          const SizedBox(width: 6),
          Text('· $count',
              style: RunqText.caption.copyWith(color: t.muted2, fontSize: 11)),
        ],
      ),
    );
  }
}

class _InvoiceRow extends StatelessWidget {
  final Invoice invoice;
  const _InvoiceRow({required this.invoice});

  String _date(DateTime d) {
    const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${d.day} ${m[d.month - 1]}';
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: RunqCard(
        onTap: invoice.id.isEmpty ? null : () => context.push('/invoices/${invoice.id}'),
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            RqAvatar(name: invoice.customerName, size: 36),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(invoice.customerName,
                            style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 14),
                            maxLines: 1, overflow: TextOverflow.ellipsis),
                      ),
                      const SizedBox(width: 8),
                      Text(formatINR(invoice.totalAmount),
                          style: RunqText.tabular(size: 14, w: FontWeight.w700, color: t.ink)),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Expanded(
                        child: Text('${invoice.invoiceNumber} · ${_date(invoice.invoiceDate)}',
                            style: RunqText.caption.copyWith(color: t.muted2, fontSize: 11),
                            maxLines: 1, overflow: TextOverflow.ellipsis),
                      ),
                      const SizedBox(width: 8),
                      StatusPill(invoice.status, warning: invoice.status == 'overdue'),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _BillRow extends StatelessWidget {
  final Bill bill;
  const _BillRow({required this.bill});

  String _date(DateTime d) {
    const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${d.day} ${m[d.month - 1]}';
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: RunqCard(
        onTap: bill.id.isEmpty ? null : () => context.push('/bills/${bill.id}'),
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            RqAvatar(name: bill.vendorName, size: 36),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(bill.vendorName,
                            style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 14),
                            maxLines: 1, overflow: TextOverflow.ellipsis),
                      ),
                      const SizedBox(width: 8),
                      Text(formatINR(bill.totalAmount),
                          style: RunqText.tabular(size: 14, w: FontWeight.w700, color: t.ink)),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Expanded(
                        child: Text('${bill.invoiceNumber} · ${_date(bill.invoiceDate)}',
                            style: RunqText.caption.copyWith(color: t.muted2, fontSize: 11),
                            maxLines: 1, overflow: TextOverflow.ellipsis),
                      ),
                      const SizedBox(width: 8),
                      StatusPill(bill.status),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
