import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/recurring_bill_models.dart';
import '../../providers/recurring_bill_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/async_slot.dart';
import '../../widgets/list_filter_kit.dart';
import '../../widgets/section_head.dart';
import 'recurring_bill_row.dart';
import 'recurring_bills_hero.dart';
import 'recurring_widgets.dart';

class RecurringBillsScreen extends ConsumerStatefulWidget {
  const RecurringBillsScreen({super.key});

  @override
  ConsumerState<RecurringBillsScreen> createState() => _RecurringBillsScreenState();
}

class _RecurringBillsScreenState extends ConsumerState<RecurringBillsScreen> {
  String _filter = 'all';

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final async = ref.watch(recurringBillsProvider);
    return Scaffold(
      backgroundColor: t.bgWarmer,
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: RunqColors.indigo,
        foregroundColor: Colors.white,
        onPressed: () => context.push('/recurring-bills/new'),
        icon: const Icon(Icons.add),
        label: const Text('New'),
      ),
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          color: t.brand,
          onRefresh: () async => ref.invalidate(recurringBillsProvider),
          child: AsyncSlot<List<RecurringBill>>(
            value: async,
            onRetry: () => ref.invalidate(recurringBillsProvider),
            data: _content,
          ),
        ),
      ),
    );
  }

  Widget _content(List<RecurringBill> rows) {
    final shown = _filter == 'all' ? rows : rows.where((r) => r.category == _filter).toList();
    return CustomScrollView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
      slivers: [
        const SliverToBoxAdapter(child: _Header()),
        if (rows.isEmpty)
          const SliverPadding(
            padding: EdgeInsets.fromLTRB(16, 40, 16, 120),
            sliver: SliverToBoxAdapter(
              child: EmptyState(
                icon: Icons.home_work_outlined,
                title: 'No agreements yet',
                subtitle: 'Tap New agreement to add rent or a transport retainer.',
              ),
            ),
          )
        else ...[
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            sliver: SliverToBoxAdapter(child: RecurringBillsHero(rows: rows)),
          ),
          SliverToBoxAdapter(child: _filters(rows)),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
            sliver: SliverToBoxAdapter(
              child: SectionHead(
                  title: '${shown.length} ${shown.length == 1 ? 'agreement' : 'agreements'}'),
            ),
          ),
          _list(shown),
        ],
      ],
    );
  }

  Widget _list(List<RecurringBill> shown) {
    if (shown.isEmpty) {
      return SliverPadding(
        padding: const EdgeInsets.fromLTRB(16, 24, 16, 120),
        sliver: SliverToBoxAdapter(
          child: EmptyState(
            icon: Icons.filter_list_rounded,
            title: 'No ${categoryLabel(_filter).toLowerCase()} agreements',
          ),
        ),
      );
    }
    return SliverPadding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 120),
      sliver: SliverList.separated(
        itemCount: shown.length,
        separatorBuilder: (_, _) => const SizedBox(height: 8),
        itemBuilder: (_, i) => RecurringBillRow(r: shown[i]),
      ),
    );
  }

  Widget _filters(List<RecurringBill> rows) {
    int count(String c) => rows.where((r) => r.category == c).length;
    final options = [
      ('all', 'All', rows.length),
      ('rent', 'Rent', count('rent')),
      ('transport', 'Transport', count('transport')),
    ];
    return SizedBox(
      height: 38,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: [
          for (final o in options) ...[
            FilterPill(
              label: o.$2,
              badge: o.$3,
              active: _filter == o.$1,
              onTap: () => setState(() => _filter = o.$1),
            ),
            const SizedBox(width: 8),
          ],
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header();

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 12, 16, 16),
      child: Row(
        children: [
          IconButton(
            onPressed: () => Navigator.of(context).pop(),
            icon: Icon(Icons.arrow_back_rounded, color: t.ink),
          ),
          const SizedBox(width: 4),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('Payables', style: RunqText.body.copyWith(color: t.muted)),
                Text('Rent & transport', style: RunqText.h2.copyWith(color: t.ink)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
