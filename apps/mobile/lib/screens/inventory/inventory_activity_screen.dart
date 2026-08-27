// Stock Movement — the filtered, valued view of the stock ledger.
//
// Home's Movement tiles ("Today in", "Today out") are rupee figures, and both
// used to open the same unfiltered list of quantities: the tap answered a
// different question than the one it was asked. This screen takes the filter
// as a route argument, so "Today out" lands on today's outflow with today's
// outflow money on top, and every other cut of the ledger is one chip away.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/inventory_models.dart';
import '../../providers/inventory_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/inv_colors.dart';
import 'widgets/inv_primitives.dart';
import 'widgets/movement_filters.dart';

class InventoryActivityScreen extends ConsumerStatefulWidget {
  const InventoryActivityScreen({super.key, this.initial});

  /// Filter the screen opens with. Home passes 'in'/'out' + 'today'; the
  /// More menu and the Home card's "See all" open unfiltered on today.
  final InvMovementFilter? initial;

  @override
  ConsumerState<InventoryActivityScreen> createState() =>
      _InventoryActivityScreenState();
}

class _InventoryActivityScreenState
    extends ConsumerState<InventoryActivityScreen> {
  late InvMovementFilter _filter =
      widget.initial ?? const InvMovementFilter();
  final _searchCtrl = TextEditingController();
  bool _searching = false;

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  void _apply(InvMovementFilter f) => setState(() => _filter = f);

  void _toggleSearch() {
    setState(() {
      _searching = !_searching;
      if (!_searching && _filter.search.isNotEmpty) {
        _searchCtrl.clear();
        _filter = _filter.copyWith(search: '');
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final async = ref.watch(invMovementFeedProvider(_filter));
    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: InvPlainAppBar(
        title: 'Stock Movement',
        onBack: () => context.pop(),
        trailing: IconButton(
          icon: Icon(
            _searching ? Icons.close_rounded : Icons.search_rounded,
            size: 20,
            color: t.ink,
          ),
          onPressed: _toggleSearch,
        ),
      ),
      body: RefreshIndicator(
        color: InvColors.brand(context),
        onRefresh: () async {
          ref.invalidate(invMovementFeedProvider);
          await ref.read(invMovementFeedProvider(_filter).future);
        },
        child: ListView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: const EdgeInsets.only(bottom: 40),
          children: [
            const SizedBox(height: 12),
            if (_searching) ...[
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: InvSearchBar(
                  controller: _searchCtrl,
                  hint: 'Item, SKU or batch',
                  onChanged: (v) => _apply(_filter.copyWith(search: v)),
                ),
              ),
              const SizedBox(height: 12),
            ],
            // Controls first, then what they add up to. The money header is a
            // reading of the current filter, so it belongs under the controls
            // that set it — and putting the filters at the top means the
            // active cut is visible without scrolling back up.
            InvMovementFilterBar(filter: _filter, onChanged: _apply),
            const SizedBox(height: 12),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: InvMovementMoneyHeader(
                summary: async.valueOrNull?.summary,
                periodLabel: _headerLabel(),
                direction: _filter.direction,
              ),
            ),
            const SizedBox(height: 14),
            async.when(
              loading: () => const Padding(
                padding: EdgeInsets.symmetric(vertical: 48),
                child: Center(child: CircularProgressIndicator()),
              ),
              error: (e, _) => _error(context, '$e'),
              data: (feed) =>
                  feed.rows.isEmpty ? _empty() : _days(context, feed.rows),
            ),
          ],
        ),
      ),
    );
  }

  /// The header's eyebrow now has to carry the type too — with the chip rows
  /// gone, "TODAY" alone wouldn't say that the figures under it are only
  /// adjustments.
  String _headerLabel() {
    final period = invMovementPeriodLabel(_filter.period);
    if (_filter.type != null) {
      return '$period · ${invMovementLabel(_filter.type!)}';
    }
    if (_filter.group != null) {
      final g = invMovementGroups.firstWhere((g) => g.value == _filter.group);
      return '$period · ${g.label}';
    }
    return period;
  }

  Widget _empty() => InvEmptyState(
        icon: Icons.history_rounded,
        title: _filter.hasNarrowing ? 'Nothing matches' : 'No movements yet',
        subtitle: _filter.hasNarrowing
            ? 'Widen the window or clear a filter to see more.'
            : 'Receive or dispatch stock to see entries here.',
      );

  Widget _error(BuildContext context, String msg) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Text(
        'Failed to load movement: $msg',
        style: RunqText.caption.copyWith(color: t.muted),
        textAlign: TextAlign.center,
      ),
    );
  }

  /// Rows grouped into one card per calendar day.
  ///
  /// A flat list reads as noise the moment the window is wider than today:
  /// the day header carries that day's own in / out money, so scrolling a
  /// month answers "which day did the value move" without a chart.
  Widget _days(BuildContext context, List<InvActivity> rows) {
    final groups = <DateTime, List<InvActivity>>{};
    for (final r in rows) {
      final day = DateTime(r.movedAt.year, r.movedAt.month, r.movedAt.day);
      groups.putIfAbsent(day, () => []).add(r);
    }
    final t = RT(context);
    return Column(
      children: [
        for (final day in groups.keys) ...[
          _DayHeader(day: day, rows: groups[day]!),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
            child: InvCard(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
              child: Column(
                children: [
                  for (var i = 0; i < groups[day]!.length; i++) ...[
                    _MovementRow(a: groups[day]![i]),
                    if (i < groups[day]!.length - 1)
                      Divider(height: 1, thickness: 0.5, color: t.hairlineSoft),
                  ],
                ],
              ),
            ),
          ),
        ],
      ],
    );
  }
}

// ── Day header ────────────────────────────────────────────────────────────

class _DayHeader extends StatelessWidget {
  const _DayHeader({required this.day, required this.rows});
  final DateTime day;
  final List<InvActivity> rows;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    var inV = 0.0, outV = 0.0;
    for (final r in rows) {
      if (r.isIn) {
        inV += r.qtyIn * r.unitCost;
      } else {
        outV += r.qtyOut * r.unitCost;
      }
    }
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 8),
      child: Row(
        children: [
          Text(
            _dayLabel(day),
            style: RunqText.micro.copyWith(
              color: t.muted,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.5,
            ),
          ),
          const Spacer(),
          if (inV > 0) _tally('+${compactINR(inV)}', InvColors.success),
          if (inV > 0 && outV > 0) const SizedBox(width: 8),
          if (outV > 0) _tally('-${compactINR(outV)}', InvColors.amberDeep),
        ],
      ),
    );
  }

  Widget _tally(String text, Color c) => Text(
        text,
        style: RunqText.micro.copyWith(
          color: c,
          fontWeight: FontWeight.w700,
          letterSpacing: 0,
          fontFeatures: const [FontFeature.tabularFigures()],
        ),
      );

  static const _months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  static String _dayLabel(DateTime d) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final diff = today.difference(d).inDays;
    if (diff == 0) return 'TODAY';
    if (diff == 1) return 'YESTERDAY';
    final y = d.year == now.year ? '' : ' ${d.year}';
    return '${d.day} ${_months[d.month - 1]}$y'.toUpperCase();
  }
}

// ── Row ───────────────────────────────────────────────────────────────────

/// One ledger entry: what moved, how much of it, and what it was worth.
///
/// Quantity leads and value sits under it, not the other way round. The
/// rupee figure is the reason the user is on this screen, but it is the
/// derived number — a ₹0 line is normal for stock the GL capitalises later
/// (MP raw milk), and reading "₹0" as the headline would look like a bug.
class _MovementRow extends StatelessWidget {
  const _MovementRow({required this.a});
  final InvActivity a;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final inbound = a.isIn;
    final tone = inbound ? InvColors.success : InvColors.error;
    final meta = [
      invMovementLabel(a.movementType),
      a.warehouseName,
      if (a.batchNo != null && a.batchNo!.isNotEmpty) a.batchNo!,
    ].join(' · ');
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: InvActivityIcon.colorFor(invMovementIconKey(a.movementType))
                  .withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(
              InvActivityIcon.iconFor(invMovementIconKey(a.movementType)),
              size: 17,
              color: InvActivityIcon.colorFor(invMovementIconKey(a.movementType)),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                // The unit belongs to the item, not to the number: this feed
                // mixes SKUs, so "A2 Desi Cow Milk 500ml" identifies what
                // moved, while a unit tacked onto the quantity just made the
                // right-hand column ragged.
                Text.rich(
                  TextSpan(children: [
                    TextSpan(
                      text: a.itemName,
                      style: RunqText.bodyStrong.copyWith(color: t.ink),
                    ),
                    if ((a.itemUnit ?? '').isNotEmpty)
                      TextSpan(
                        text: '  ${a.itemUnit}',
                        style: RunqText.caption.copyWith(color: t.muted2),
                      ),
                  ]),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 1),
                Text(
                  meta,
                  style: RunqText.caption.copyWith(color: t.muted),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                _qty(a),
                style: RunqText.caption.copyWith(
                  color: tone,
                  fontWeight: FontWeight.w700,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
              const SizedBox(height: 2),
              Text(
                a.unitCost > 0 ? indianINR(a.value.abs()) : '—',
                style: RunqText.micro.copyWith(
                  color: t.muted,
                  letterSpacing: 0,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
              const SizedBox(height: 1),
              Text(
                _time(a.movedAt),
                style: RunqText.micro.copyWith(color: t.muted2, letterSpacing: 0),
              ),
            ],
          ),
        ],
      ),
    );
  }

  /// Signed magnitude only — the unit now rides with the item name.
  static String _qty(InvActivity a) {
    final q = a.signedQty;
    final mag = q.abs();
    final s = mag == mag.roundToDouble()
        ? mag.toStringAsFixed(0)
        : mag.toStringAsFixed(2);
    return '${q < 0 ? '-' : '+'}$s';
  }

  static String _time(DateTime when) {
    final h = when.hour % 12 == 0 ? 12 : when.hour % 12;
    final m = when.minute.toString().padLeft(2, '0');
    return '$h:$m ${when.hour < 12 ? 'am' : 'pm'}';
  }
}
