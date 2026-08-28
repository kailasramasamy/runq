// Filter furniture for the full bank-transaction ledger: the direction
// segment, the date/category pills, and the category picker sheet.
//
// Direction is a segment because it is an axis that is always set to
// something; date and category are pills that state their own current value
// and open a sheet, so the row never becomes a wall of chips where two are lit
// at once and read as one broken multi-select.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/models.dart';
import '../../providers/bank_txn_feed_provider.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/date_range_sheet.dart';
import '../../widgets/list_filter_kit.dart';

const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

String _fmtDay(DateTime d) => '${d.day} ${_months[d.month - 1]}';

String dateRangeLabel(DateTime? from, DateTime? to) {
  if (from == null && to == null) return 'Any date';
  if (from != null && to != null) return '${_fmtDay(from)} – ${_fmtDay(to)}';
  if (from != null) return 'After ${_fmtDay(from)}';
  return 'Until ${_fmtDay(to!)}';
}

class BankTxnFilterBar extends ConsumerWidget {
  final BankTxnQuery query;
  final ValueChanged<BankTxnQuery> onChanged;
  const BankTxnFilterBar({super.key, required this.query, required this.onChanged});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final categories = ref.watch(bankTxnCategoriesProvider(query.accountId));
    final categoryName = categories.maybeWhen(
      data: (list) => list.where((c) => c.id == query.glAccountId).firstOrNull?.name,
      orElse: () => null,
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _DirectionSegment(
          value: query.direction,
          onChanged: (d) => onChanged(query.copyWith(direction: d)),
        ),
        const SizedBox(height: 10),
        SizedBox(
          height: 34,
          child: ListView(
            scrollDirection: Axis.horizontal,
            physics: const BouncingScrollPhysics(),
            children: [
              FilterPill(
                label: dateRangeLabel(query.from, query.to),
                active: query.from != null || query.to != null,
                leading: Icons.calendar_today_rounded,
                trailing: Icons.expand_more_rounded,
                onTap: () async {
                  final r = await showDateRangeSheet(
                    context,
                    initialFrom: query.from,
                    initialTo: query.to,
                  );
                  if (r == null) return;
                  // Built directly rather than via copyWith: clearing a range
                  // means writing nulls, which copyWith reads as "unchanged".
                  onChanged(BankTxnQuery(
                    accountId: query.accountId,
                    direction: query.direction,
                    from: r.from,
                    to: r.to,
                    glAccountId: query.glAccountId,
                    search: query.search,
                  ));
                },
              ),
              const SizedBox(width: 8),
              FilterPill(
                label: query.glAccountId == null
                    ? 'Any category'
                    : (categoryName ?? 'Category'),
                active: query.glAccountId != null,
                leading: Icons.sell_outlined,
                trailing: Icons.expand_more_rounded,
                onTap: () async {
                  final picked = await showCategorySheet(
                    context,
                    accountId: query.accountId,
                    selectedId: query.glAccountId,
                  );
                  if (picked == null) return;
                  onChanged(picked.id == _allCategories
                      ? query.copyWith(clearCategory: true)
                      : query.copyWith(glAccountId: picked.id));
                },
              ),
              if (query.hasFilters) ...[
                const SizedBox(width: 8),
                FilterPill(
                  label: 'Clear',
                  active: false,
                  leading: Icons.close_rounded,
                  onTap: () => onChanged(BankTxnQuery(
                    accountId: query.accountId,
                    search: query.search,
                  )),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _DirectionSegment extends StatelessWidget {
  final TxnDirection value;
  final ValueChanged<TxnDirection> onChanged;
  const _DirectionSegment({required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    const options = [
      (TxnDirection.all, 'All'),
      (TxnDirection.credit, 'Money in'),
      (TxnDirection.debit, 'Money out'),
    ];
    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: t.bgWarm,
        borderRadius: BorderRadius.circular(RunqRadii.input),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      child: Row(
        children: [
          for (final (dir, label) in options)
            Expanded(
              child: Material(
                color: dir == value ? t.surface : Colors.transparent,
                borderRadius: BorderRadius.circular(9),
                child: InkWell(
                  onTap: () => onChanged(dir),
                  borderRadius: BorderRadius.circular(9),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Text(
                      label,
                      textAlign: TextAlign.center,
                      style: RunqText.caption.copyWith(
                        color: dir == value ? t.ink : t.muted,
                        fontWeight: dir == value ? FontWeight.w600 : FontWeight.w500,
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Sentinel id for the "every category" row — distinct from 'none', which is
/// itself a real filter (rows with no category yet).
const _allCategories = '__all__';

Future<BankTxnCategory?> showCategorySheet(
  BuildContext context, {
  required String accountId,
  required String? selectedId,
}) {
  return showModalBottomSheet<BankTxnCategory>(
    context: context,
    isScrollControlled: true,
    backgroundColor: RT(context).surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
    ),
    builder: (_) => _CategorySheet(accountId: accountId, selectedId: selectedId),
  );
}

class _CategorySheet extends ConsumerWidget {
  final String accountId;
  final String? selectedId;
  const _CategorySheet({required this.accountId, required this.selectedId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final async = ref.watch(bankTxnCategoriesProvider(accountId));
    return SafeArea(
      top: false,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.7),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 40, height: 4,
                  decoration: BoxDecoration(
                      color: t.hairline, borderRadius: BorderRadius.circular(2)),
                ),
              ),
              const SizedBox(height: 14),
              Padding(
                padding: const EdgeInsets.only(left: 4, bottom: 10),
                child: Text('Category', style: RunqText.h3.copyWith(color: t.ink)),
              ),
              Flexible(
                child: async.when(
                  loading: () => const Padding(
                    padding: EdgeInsets.all(28),
                    child: Center(child: CircularProgressIndicator()),
                  ),
                  error: (e, _) => Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text('Could not load categories',
                        style: RunqText.caption.copyWith(color: t.muted)),
                  ),
                  data: (list) => ListView(
                    shrinkWrap: true,
                    physics: const BouncingScrollPhysics(),
                    keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                    children: [
                      _CategoryTile(
                        label: 'All categories',
                        count: list.fold<int>(0, (s, c) => s + c.count),
                        active: selectedId == null,
                        onTap: () => Navigator.pop(
                          context,
                          const BankTxnCategory(
                              id: _allCategories, name: 'All categories', count: 0),
                        ),
                      ),
                      for (final c in list)
                        _CategoryTile(
                          label: c.label,
                          count: c.count,
                          active: c.id == selectedId,
                          onTap: () => Navigator.pop(context, c),
                        ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CategoryTile extends StatelessWidget {
  final String label;
  final int count;
  final bool active;
  final VoidCallback onTap;
  const _CategoryTile({
    required this.label,
    required this.count,
    required this.active,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(RunqRadii.chip),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 13),
        child: Row(
          children: [
            Expanded(
              child: Text(
                label,
                style: RunqText.body.copyWith(
                  color: active ? t.brand : t.ink,
                  fontWeight: active ? FontWeight.w600 : FontWeight.w500,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const SizedBox(width: 10),
            Text('$count', style: RunqText.tabular(size: 12, w: FontWeight.w600, color: t.muted2)),
            const SizedBox(width: 8),
            Icon(
              active ? Icons.check_circle_rounded : Icons.circle_outlined,
              size: 18,
              color: active ? t.brand : t.hairline,
            ),
          ],
        ),
      ),
    );
  }
}
