import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/models.dart';
import '../providers/data_providers.dart';
import '../theme/runq_tokens.dart';
import '../theme/runq_theme.dart';
import '../utils/format_inr.dart';
import '../services/bill_intake.dart';
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
  _Tab('to_approve', 'Pending match', 'pending_match'),
  _Tab('approved', 'Approved', 'approved'),
  _Tab('partial', 'Part-paid', 'partially_paid'),
  _Tab('paid', 'Paid', 'paid'),
];

class BillsScreen extends ConsumerStatefulWidget {
  const BillsScreen({super.key});

  @override
  ConsumerState<BillsScreen> createState() => _BillsScreenState();
}

class _BillsScreenState extends ConsumerState<BillsScreen> {
  String tabKey = 'all';
  DateTime? dateFrom;
  DateTime? dateTo;

  bool get _hasDateFilter => dateFrom != null || dateTo != null;

  BillFilter get _filter {
    final t = _tabs.firstWhere((t) => t.key == tabKey, orElse: () => _tabs.first);
    return BillFilter(status: t.statusFilter, dateFrom: dateFrom, dateTo: dateTo);
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
    final list = ref.watch(billsProvider(_filter));
    return SafeArea(
      bottom: false,
      child: Column(
        children: [
          _Header(onFilter: _openFilterSheet, filterActive: _hasDateFilter),
          _TabBar(activeKey: tabKey, onTap: (k) => setState(() => tabKey = k)),
          const SizedBox(height: 16),
          Expanded(
            child: RefreshIndicator(
              color: RunqColors.indigo,
              onRefresh: () async {
                ref.invalidate(billsProvider(_filter));
                ref.invalidate(billsSummaryProvider);
                await ref.read(billsProvider(_filter).future).catchError((_) => throw 0);
              },
              child: AsyncSlot<PaginatedResponse<Bill>>(
                value: list,
                onRetry: () => ref.invalidate(billsProvider(_filter)),
                data: (page) {
                  if (page.data.isEmpty) {
                    return const Center(
                      child: EmptyState(
                        icon: Icons.description_outlined,
                        title: 'No bills',
                        subtitle: 'Scan a bill from the FAB to get started.',
                      ),
                    );
                  }
                  return ListView.separated(
                    physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 120),
                    itemCount: page.data.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (_, i) => _BillRow(bill: page.data[i]),
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
  final VoidCallback onFilter;
  final bool filterActive;
  const _Header({required this.onFilter, required this.filterActive});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 16, 16),
      child: Row(
        children: [
          Text('Bills', style: RunqText.h2.copyWith(color: t.ink)),
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
          const SizedBox(width: 8),
          GestureDetector(
            onTap: () => startBillIntake(context),
            child: Container(
              width: 40, height: 40,
              decoration: BoxDecoration(
                color: RunqColors.indigo,
                shape: BoxShape.circle,
                boxShadow: RunqShadows.fab,
              ),
              child: const Icon(Icons.camera_alt_outlined, color: Colors.white, size: 20),
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
                  bottom: BorderSide(color: isActive ? RunqColors.indigo : Colors.transparent, width: 2),
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

class _BillRow extends StatelessWidget {
  final Bill bill;
  const _BillRow({required this.bill});

  String _date(DateTime d) {
    const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${d.day} ${m[d.month - 1]}';
  }

  @override
  Widget build(BuildContext context) {
    return RunqCard(
      onTap: () {},
      padding: const EdgeInsets.all(14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          RqAvatar(name: bill.vendorName, size: 36),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(bill.vendorName, style: RunqText.bodyStrong, maxLines: 1, overflow: TextOverflow.ellipsis),
                const SizedBox(height: 2),
                Text('${bill.invoiceNumber} · ${_date(bill.invoiceDate)}', style: RunqText.caption),
                const SizedBox(height: 6),
                Row(
                  children: [
                    StatusPill(bill.status),
                    if (bill.matchStatus == 'matched') ...[
                      const SizedBox(width: 6),
                      _MatchChip(matched: true),
                    ] else if (bill.status == 'pending_match' || bill.matchStatus == 'mismatch') ...[
                      const SizedBox(width: 6),
                      _MatchChip(matched: false),
                    ],
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(formatINR(bill.totalAmount), style: RunqText.tabular(size: 15, w: FontWeight.w700)),
        ],
      ),
    );
  }
}

class _MatchChip extends StatelessWidget {
  final bool matched;
  const _MatchChip({required this.matched});

  @override
  Widget build(BuildContext context) {
    final color = matched ? RunqColors.greenInk : RunqColors.amberInk;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(matched ? Icons.check_circle_rounded : Icons.error_outline_rounded, size: 12, color: color),
        const SizedBox(width: 3),
        Text(matched ? '3WM' : 'Match needed',
            style: RunqText.caption.copyWith(color: color, fontSize: 11, fontWeight: FontWeight.w600)),
      ],
    );
  }
}
