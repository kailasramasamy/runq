import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../api/api_client.dart';
import '../api/models.dart';
import '../api/repos.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../utils/format_inr.dart';
import '../widgets/date_range_sheet.dart';
import '../widgets/list_filter_kit.dart';
import 'customer_order_row.dart';

final customerOrdersProvider = FutureProvider.autoDispose<List<CustomerOrderRow>>((ref) async {
  return orderRepo.listInbox(limit: 100);
});

enum CustomerOrderFilter { all, toReview, parsing, invoiced, errors }

extension on CustomerOrderFilter {
  String get label => switch (this) {
        CustomerOrderFilter.all => 'All',
        CustomerOrderFilter.toReview => 'To review',
        CustomerOrderFilter.parsing => 'Parsing',
        CustomerOrderFilter.invoiced => 'Invoiced',
        CustomerOrderFilter.errors => 'Errors',
      };

  bool matches(CustomerOrderRow r) {
    final s = r.displayStatus;
    return switch (this) {
      CustomerOrderFilter.all => true,
      CustomerOrderFilter.toReview => s == 'ready' || s == 'needs review',
      CustomerOrderFilter.parsing => s == 'parsing',
      CustomerOrderFilter.invoiced => s == 'invoiced',
      CustomerOrderFilter.errors => s == 'error' || s == 'rejected',
    };
  }
}

/// Mobile Customer POs — every customer-order upload (parsing, ready,
/// invoiced, error). Tap a row to open the parse review screen, or tap the
/// linked invoice chip on an invoiced row to jump straight to that invoice.
///
/// Layout: filter pills → summary cards → searchable order history, each row
/// carrying its own upload-date block.
class CustomerOrdersScreen extends ConsumerStatefulWidget {
  const CustomerOrdersScreen({super.key});

  @override
  ConsumerState<CustomerOrdersScreen> createState() => _CustomerOrdersScreenState();
}

class _CustomerOrdersScreenState extends ConsumerState<CustomerOrdersScreen> {
  final _searchCtrl = TextEditingController();
  String _query = '';
  CustomerOrderFilter _filter = CustomerOrderFilter.all;
  DateTime? _from;
  DateTime? _to;

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  bool _inRange(DateTime d) {
    if (_from != null && d.isBefore(DateTime(_from!.year, _from!.month, _from!.day))) return false;
    if (_to != null && d.isAfter(DateTime(_to!.year, _to!.month, _to!.day, 23, 59))) return false;
    return true;
  }

  bool _matchesQuery(CustomerOrderRow r) {
    if (_query.isEmpty) return true;
    final hay = [
      r.displayTitle,
      r.customerName ?? '',
      r.buyerNameRaw ?? '',
      r.poNumberExtracted ?? '',
      r.fileName ?? '',
      r.approvedInvoiceNumber ?? '',
      r.displayStatus,
    ].join(' ').toLowerCase();
    return hay.contains(_query);
  }

  Future<void> _pickRange() async {
    final res = await showDateRangeSheet(context, initialFrom: _from, initialTo: _to);
    if (res == null) return;
    setState(() {
      _from = res.from;
      _to = res.to;
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final inbox = ref.watch(customerOrdersProvider);
    return Scaffold(
      backgroundColor: t.bgWarmer,
      appBar: AppBar(
        title: const Text('Customer POs'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
          onPressed: () => context.pop(),
        ),
      ),
      body: SafeArea(
        child: RefreshIndicator(
          color: RunqColors.indigo,
          onRefresh: () async {
            ref.invalidate(customerOrdersProvider);
            await ref.read(customerOrdersProvider.future).catchError((_) => <CustomerOrderRow>[]);
          },
          child: inbox.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => _Centered(
              icon: Icons.error_outline_rounded,
              title: e is ApiException ? e.message : 'Could not load customer orders',
              action: 'Retry',
              onAction: () => ref.invalidate(customerOrdersProvider),
            ),
            data: (all) {
              if (all.isEmpty) {
                return const _Centered(
                  icon: Icons.inbox_outlined,
                  title: 'No customer orders yet',
                  subtitle:
                      'Share or upload an order from a customer — it lands here, AI parses it, and you approve it into an invoice.',
                );
              }
              // Date range scopes the counts and cards; the status filter and
              // search only narrow the list beneath them.
              final scoped = all.where((r) => _inRange(r.uploadedAt)).toList();
              final rows = scoped.where(_filter.matches).where(_matchesQuery).toList();
              return ListView(
                physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                padding: const EdgeInsets.fromLTRB(12, 12, 12, 24),
                children: [
                  _header(t, scoped, rows.isEmpty),
                  if (rows.isNotEmpty)
                    _OrderList(rows: rows, onAfterDelete: () => ref.invalidate(customerOrdersProvider)),
                ],
              );
            },
          ),
        ),
      ),
    );
  }

  Widget _header(RunqTokens t, List<CustomerOrderRow> scoped, bool noMatches) {
    int count(CustomerOrderFilter f) =>
        f == CustomerOrderFilter.all ? scoped.length : scoped.where(f.matches).length;
    // Value still waiting on a human — the number that decides whether this
    // screen needs attention today.
    final pending = scoped
        .where(CustomerOrderFilter.toReview.matches)
        .fold<double>(0, (s, r) => s + (r.grandTotal ?? 0));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          height: 38,
          child: ListView(
            scrollDirection: Axis.horizontal,
            children: [
              FilterPill(
                label: listRangeLabel(_from, _to),
                active: _from != null || _to != null,
                trailing: Icons.keyboard_arrow_down_rounded,
                onTap: _pickRange,
              ),
              const SizedBox(width: 8),
              Container(width: 1, margin: const EdgeInsets.symmetric(vertical: 8), color: t.hairline),
              const SizedBox(width: 8),
              for (final f in CustomerOrderFilter.values) ...[
                FilterPill(
                  label: f.label,
                  active: f == _filter,
                  badge: count(f),
                  onTap: () => setState(() => _filter = f),
                ),
                const SizedBox(width: 8),
              ],
            ],
          ),
        ),
        const SizedBox(height: 14),
        IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: ListStatCard(
                  icon: Icons.inbox_rounded,
                  label: count(CustomerOrderFilter.all) == 1 ? 'ORDER' : 'ORDERS',
                  value: '${count(CustomerOrderFilter.all)}',
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: ListStatCard(
                  icon: Icons.pending_actions_rounded,
                  label: 'TO REVIEW',
                  value: formatINR(pending, compact: true),
                  tinted: true,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 18),
        Text('Order history', style: RunqText.h3.copyWith(color: t.ink)),
        const SizedBox(height: 10),
        ListSearchField(
          controller: _searchCtrl,
          onChanged: (v) => setState(() => _query = v.trim().toLowerCase()),
          hint: 'Search customer, PO no., file…',
        ),
        const SizedBox(height: 12),
        if (noMatches)
          _EmptyFilter(
            label: _filter.label,
            onClear: () => setState(() {
              _filter = CustomerOrderFilter.all;
              _query = '';
              _searchCtrl.clear();
            }),
          ),
      ],
    );
  }
}

class _OrderList extends StatelessWidget {
  final List<CustomerOrderRow> rows;
  final VoidCallback onAfterDelete;
  const _OrderList({required this.rows, required this.onAfterDelete});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    // One card for the whole list, rows separated by hairlines — orders are
    // sparse enough that per-day section headers would outnumber the rows.
    return Material(
      color: t.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: t.hairline),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          for (var i = 0; i < rows.length; i++) ...[
            if (i > 0) Divider(height: 1, thickness: 1, color: t.hairlineSoft, indent: 70),
            OrderInboxRow(row: rows[i], onAfterDelete: onAfterDelete),
          ],
        ],
      ),
    );
  }
}

class _EmptyFilter extends StatelessWidget {
  final String label;
  final VoidCallback onClear;
  const _EmptyFilter({required this.label, required this.onClear});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 32, 24, 24),
      child: Column(
        children: [
          Icon(Icons.filter_alt_off_rounded, size: 32, color: t.muted),
          const SizedBox(height: 10),
          Text('Nothing matches “$label”',
              textAlign: TextAlign.center,
              style: RunqText.bodyStrong.copyWith(color: t.ink)),
          const SizedBox(height: 6),
          Text('Try a different filter, widen the dates, or clear the search.',
              textAlign: TextAlign.center,
              style: RunqText.caption.copyWith(color: t.muted)),
          const SizedBox(height: 14),
          OutlinedButton(onPressed: onClear, child: const Text('Show all')),
        ],
      ),
    );
  }
}

class _Centered extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final String? action;
  final VoidCallback? onAction;
  const _Centered({
    required this.icon,
    required this.title,
    this.subtitle,
    this.action,
    this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        const SizedBox(height: 80),
        Icon(icon, size: 36, color: t.muted),
        const SizedBox(height: 12),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Text(title,
              textAlign: TextAlign.center,
              style: RunqText.bodyStrong.copyWith(color: t.ink)),
        ),
        if (subtitle != null) ...[
          const SizedBox(height: 6),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Text(subtitle!,
                textAlign: TextAlign.center,
                style: RunqText.caption.copyWith(color: t.muted)),
          ),
        ],
        if (action != null) ...[
          const SizedBox(height: 16),
          Center(child: OutlinedButton(onPressed: onAction, child: Text(action!))),
        ],
      ],
    );
  }
}
