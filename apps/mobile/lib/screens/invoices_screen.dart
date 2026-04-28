import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../api/models.dart';
import '../providers/data_providers.dart';
import '../theme/runq_tokens.dart';
import '../theme/runq_theme.dart';
import '../utils/format_inr.dart';
import '../widgets/async_slot.dart';
import '../widgets/avatar.dart';
import '../widgets/date_range_sheet.dart';
import '../widgets/runq_card.dart';
import '../widgets/status_pill.dart';

class _Tab {
  final String key, label;
  final String? statusFilter;
  const _Tab(this.key, this.label, this.statusFilter);
}

const _tabs = <_Tab>[
  _Tab('all', 'All', null),
  _Tab('outstanding', 'Outstanding', 'sent'),
  _Tab('overdue', 'Overdue', 'overdue'),
  _Tab('paid', 'Paid', 'paid'),
  _Tab('drafts', 'Drafts', 'draft'),
];

class InvoicesScreen extends ConsumerStatefulWidget {
  const InvoicesScreen({super.key});

  @override
  ConsumerState<InvoicesScreen> createState() => _InvoicesScreenState();
}

class _InvoicesScreenState extends ConsumerState<InvoicesScreen> {
  String tabKey = 'all';
  String search = '';
  DateTime? dateFrom;
  DateTime? dateTo;

  bool get _hasDateFilter => dateFrom != null || dateTo != null;

  InvoiceFilter get _filter {
    final t = _tabs.firstWhere((t) => t.key == tabKey, orElse: () => _tabs.first);
    return InvoiceFilter(
      status: t.statusFilter,
      search: search.trim().isEmpty ? null : search.trim(),
      dateFrom: dateFrom,
      dateTo: dateTo,
    );
  }

  Future<void> _openFilterSheet() async {
    final result = await showDateRangeSheet(context, initialFrom: dateFrom, initialTo: dateTo);
    if (result == null) return;
    setState(() {
      dateFrom = result.from;
      dateTo = result.to;
    });
  }

  @override
  Widget build(BuildContext context) {
    final summary = ref.watch(invoiceSummaryProvider);
    final list = ref.watch(invoicesProvider(_filter));
    return SafeArea(
      bottom: false,
      child: Column(
        children: [
          _Header(
            onSearch: (v) => setState(() => search = v),
            onFilter: _openFilterSheet,
            filterActive: _hasDateFilter,
          ),
          _TabBar(activeKey: tabKey, onTap: (k) => setState(() => tabKey = k)),
          const SizedBox(height: 12),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: _SummaryStrip(summary: summary),
          ),
          const SizedBox(height: 16),
          Expanded(
            child: RefreshIndicator(
              color: RunqColors.indigo,
              onRefresh: () async {
                ref.invalidate(invoicesProvider(_filter));
                ref.invalidate(invoiceSummaryProvider);
                await ref.read(invoicesProvider(_filter).future).catchError((_) => throw 0);
              },
              child: AsyncSlot<PaginatedResponse<Invoice>>(
                value: list,
                onRetry: () => ref.invalidate(invoicesProvider(_filter)),
                data: (page) {
                  if (page.data.isEmpty) {
                    return const Center(
                      child: EmptyState(
                        icon: Icons.receipt_long_outlined,
                        title: 'No invoices',
                        subtitle: 'Try a different tab or clear the search.',
                      ),
                    );
                  }
                  return ListView.separated(
                    physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 120),
                    itemCount: page.data.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (_, i) => _InvoiceRow(invoice: page.data[i]),
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  final ValueChanged<String> onSearch;
  final VoidCallback onFilter;
  final bool filterActive;
  const _Header({required this.onSearch, required this.onFilter, required this.filterActive});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('Invoices', style: RunqText.h2.copyWith(color: t.ink)),
              const Spacer(),
              Material(
                color: Colors.transparent,
                child: InkWell(
                  onTap: onFilter,
                  customBorder: const CircleBorder(),
                  child: Stack(
                    clipBehavior: Clip.none,
                    children: [
                      Container(
                        width: 40, height: 40,
                        decoration: BoxDecoration(
                          color: t.surface,
                          shape: BoxShape.circle,
                          border: Border.all(color: t.hairline, width: 0.5),
                        ),
                        child: Icon(Icons.tune_rounded, size: 20, color: t.ink),
                      ),
                      if (filterActive)
                        Positioned(
                          right: 9, top: 9,
                          child: Container(
                            width: 8, height: 8,
                            decoration: BoxDecoration(
                              color: RunqColors.indigo,
                              shape: BoxShape.circle,
                              border: Border.all(color: t.surface, width: 1.5),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Container(
            height: 40,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(
              color: t.surface,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: t.hairline, width: 0.5),
            ),
            child: Row(
              children: [
                Icon(Icons.search_rounded, size: 18, color: t.muted),
                const SizedBox(width: 8),
                Expanded(
                  child: TextField(
                    onChanged: onSearch,
                    style: RunqText.body.copyWith(fontSize: 14, color: t.ink),
                    decoration: InputDecoration(
                      hintText: 'Search invoices, customers',
                      hintStyle: RunqText.body.copyWith(color: t.muted2),
                      isDense: true,
                      border: InputBorder.none,
                      contentPadding: EdgeInsets.zero,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _TabBar extends StatelessWidget {
  final String activeKey;
  final ValueChanged<String> onTap;
  const _TabBar({required this.activeKey, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final tk = RT(context);
    return SizedBox(
      height: 40,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: _tabs.length,
        itemBuilder: (_, i) {
          final t = _tabs[i];
          final isActive = t.key == activeKey;
          return GestureDetector(
            onTap: () => onTap(t.key),
            behavior: HitTestBehavior.opaque,
            child: Container(
              margin: const EdgeInsets.only(right: 18),
              decoration: BoxDecoration(
                border: Border(
                  bottom: BorderSide(
                    color: isActive ? RunqColors.indigo : Colors.transparent,
                    width: 2,
                  ),
                ),
              ),
              child: Center(
                child: Text(
                  t.label,
                  style: RunqText.body.copyWith(
                    fontSize: 13,
                    color: isActive ? tk.ink : tk.muted,
                    fontWeight: isActive ? FontWeight.w600 : FontWeight.w500,
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _SummaryStrip extends StatelessWidget {
  final AsyncValue<InvoiceSummary> summary;
  const _SummaryStrip({required this.summary});

  @override
  Widget build(BuildContext context) {
    return summary.maybeWhen(
      data: (s) => Row(
        children: [
          Expanded(
            child: _StatCard(
              label: 'Outstanding',
              value: formatINR(s.totalOutstanding, compact: true),
              sub: 'across all customers',
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: _StatCard(
              label: 'Overdue',
              value: formatINR(s.overdueAmount, compact: true),
              sub: '${s.overdueCount} ${s.overdueCount == 1 ? 'invoice' : 'invoices'}',
              tone: RunqColors.redInk,
            ),
          ),
        ],
      ),
      orElse: () => const SizedBox.shrink(),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String label, value, sub;
  final Color? tone;
  const _StatCard({required this.label, required this.value, required this.sub, this.tone});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return RunqCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label.toUpperCase(), style: RunqText.label.copyWith(color: t.muted)),
          const SizedBox(height: 6),
          Text(value, style: RunqText.tabular(size: 22, w: FontWeight.w700, color: tone ?? t.ink)),
          const SizedBox(height: 2),
          Text(sub, style: RunqText.caption.copyWith(fontSize: 11, color: tone ?? t.muted)),
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
    final isPartial = invoice.status == 'partially_paid';
    return RunqCard(
      onTap: () {
        debugPrint('[invoice-row] tap → /invoices/${invoice.id}');
        if (invoice.id.isEmpty) return;
        context.push('/invoices/${invoice.id}');
      },
      padding: const EdgeInsets.all(14),
      child: Column(
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              RqAvatar(name: invoice.customerName, size: 36),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(invoice.customerName, style: RunqText.bodyStrong, maxLines: 1, overflow: TextOverflow.ellipsis),
                    const SizedBox(height: 2),
                    Text('${invoice.invoiceNumber} · ${_date(invoice.invoiceDate)}', style: RunqText.caption),
                    const SizedBox(height: 6),
                    if (!isPartial)
                      StatusPill(invoice.status, warning: invoice.status == 'overdue'),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Text(formatINR(invoice.totalAmount), style: RunqText.tabular(size: 15, w: FontWeight.w700)),
            ],
          ),
          if (isPartial) ...[
            const SizedBox(height: 10),
            _PartialPayBar(paid: invoice.amountReceived, total: invoice.totalAmount),
          ],
        ],
      ),
    );
  }
}

class _PartialPayBar extends StatelessWidget {
  final double paid, total;
  const _PartialPayBar({required this.paid, required this.total});

  @override
  Widget build(BuildContext context) {
    final pct = total <= 0 ? 0.0 : (paid / total).clamp(0.0, 1.0);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(2),
          child: Container(
            height: 4,
            color: const Color(0xFFE5E7EB),
            child: Align(
              alignment: Alignment.centerLeft,
              child: FractionallySizedBox(
                widthFactor: pct,
                child: Container(color: RunqColors.indigo),
              ),
            ),
          ),
        ),
        const SizedBox(height: 6),
        Text('${formatINR(paid)} of ${formatINR(total)} paid',
            style: RunqText.caption.copyWith(fontSize: 11)),
      ],
    );
  }
}

