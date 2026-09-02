// Day summary — one plant day on one screen.
//
// The owner's question at the end of a shift: what came in, what did we
// make, what went out, and what am I still holding? Every number is read off
// the stock ledger for one IST calendar day, so a night shift's 4am run
// files under the day it belongs to (see api mfg-day.ts).
//
// Sections live in `_day_sections.dart`; this file owns the day itself —
// picking it, stepping through it, and the warehouse it is scoped to.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/inventory_day_models.dart';
import '../../providers/inventory_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '_day_sections.dart';
import 'widgets/inv_colors.dart';
import 'widgets/inv_primitives.dart';

/// Today on the plant floor, not on the handset. The users are in India and
/// the API buckets everything in IST, so a phone left on another timezone
/// must not ask for the wrong day.
DateTime istNow() => DateTime.now().toUtc().add(const Duration(hours: 5, minutes: 30));

String isoDate(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-'
    '${d.month.toString().padLeft(2, '0')}-'
    '${d.day.toString().padLeft(2, '0')}';

class InventoryDaySummaryScreen extends ConsumerStatefulWidget {
  const InventoryDaySummaryScreen({super.key, this.initialDate});

  /// Optional YYYY-MM-DD to open on — lets a notification or a report deep
  /// link straight to the day it is about.
  final String? initialDate;

  @override
  ConsumerState<InventoryDaySummaryScreen> createState() =>
      _InventoryDaySummaryScreenState();
}

class _InventoryDaySummaryScreenState
    extends ConsumerState<InventoryDaySummaryScreen> {
  late DateTime _date;
  String? _warehouseId;

  @override
  void initState() {
    super.initState();
    final parsed = widget.initialDate == null
        ? null
        : DateTime.tryParse(widget.initialDate!);
    final n = istNow();
    _date = parsed ?? DateTime(n.year, n.month, n.day);
  }

  DateTime get _today {
    final n = istNow();
    return DateTime(n.year, n.month, n.day);
  }

  bool get _isToday => isoDate(_date) == isoDate(_today);

  void _step(int days) {
    final next = _date.add(Duration(days: days));
    // Never forward past today: there is no ledger in the future, and an
    // empty screen is indistinguishable from a quiet day.
    if (next.isAfter(_today)) return;
    setState(() => _date = next);
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime(2020),
      lastDate: _today,
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: Theme.of(ctx).colorScheme.copyWith(
            primary: InvColors.amber,
          ),
        ),
        child: child!,
      ),
    );
    if (picked != null) setState(() => _date = picked);
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final key = (date: isoDate(_date), warehouseId: _warehouseId);
    final async = ref.watch(invDaySummaryProvider(key));

    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: InvPlainAppBar(
        title: 'Day summary',
        subtitle: _prettyDate(_date),
        onBack: () => context.pop(),
        trailing: IconButton(
          icon: const Icon(Icons.calendar_today_rounded, size: 20),
          tooltip: 'Pick a date',
          onPressed: _pickDate,
        ),
      ),
      body: RefreshIndicator(
        color: InvColors.brand(context),
        onRefresh: () async => ref.invalidate(invDaySummaryProvider(key)),
        child: ListView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.only(bottom: 120),
          children: [
            _DayNav(
              label: _isToday ? 'Today' : _prettyDate(_date),
              sub: _isToday ? _prettyDate(_date) : null,
              canGoForward: !_isToday,
              onPrev: () => _step(-1),
              onNext: () => _step(1),
              onTapLabel: _pickDate,
            ),
            _HeroTotals(async: async),
            _WarehouseFilter(
              selected: _warehouseId,
              onSelect: (id) => setState(() => _warehouseId = id),
            ),
            ...async.when(
              loading: () => [const _DayLoading()],
              error: (e, _) => [_DayError(message: '$e')],
              data: (d) => _sections(d),
            ),
          ],
        ),
      ),
    );
  }

  List<Widget> _sections(InvDaySummary d) {
    if (d.totals.isQuiet && d.materials.every((m) => !m.moved)) {
      return [
        InvEmptyState(
          icon: Icons.nights_stay_outlined,
          title: 'Nothing moved on this day',
          subtitle: 'No receipts, production or dispatches were recorded for '
              '${_prettyDate(_date)}.',
        ),
      ];
    }
    return [
      DayMaterialsSection(rows: d.materials),
      DayProducedSection(rows: d.produced),
      DayDispatchSection(rows: d.dispatched),
      DayOtherSection(rows: d.other),
    ];
  }
}

String _prettyDate(DateTime d) {
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return '${days[d.weekday - 1]}, ${d.day} ${months[d.month - 1]} ${d.year}';
}

// ── Date stepper ──────────────────────────────────────────────────────────

/// ‹ Today › — the control the whole screen turns on, so it sits above the
/// numbers rather than behind a menu. Forward is disabled on today.
class _DayNav extends StatelessWidget {
  const _DayNav({
    required this.label,
    required this.sub,
    required this.canGoForward,
    required this.onPrev,
    required this.onNext,
    required this.onTapLabel,
  });
  final String label;
  final String? sub;
  final bool canGoForward;
  final VoidCallback onPrev;
  final VoidCallback onNext;
  final VoidCallback onTapLabel;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
      child: Container(
        decoration: BoxDecoration(
          color: t.surface,
          border: Border.all(color: t.hairline),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Row(
          children: [
            _NavArrow(icon: Icons.chevron_left_rounded, onTap: onPrev),
            Expanded(
              child: InkWell(
                onTap: onTapLabel,
                borderRadius: BorderRadius.circular(10),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  child: Column(
                    children: [
                      Text(
                        label,
                        style: RunqText.h4.copyWith(color: t.ink),
                        textAlign: TextAlign.center,
                      ),
                      if (sub != null)
                        Text(
                          sub!,
                          style: RunqText.caption.copyWith(color: t.muted),
                          textAlign: TextAlign.center,
                        ),
                    ],
                  ),
                ),
              ),
            ),
            _NavArrow(
              icon: Icons.chevron_right_rounded,
              onTap: canGoForward ? onNext : null,
            ),
          ],
        ),
      ),
    );
  }
}

class _NavArrow extends StatelessWidget {
  const _NavArrow({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return IconButton(
      onPressed: onTap,
      icon: Icon(icon, size: 26),
      color: onTap == null ? t.muted2 : t.ink,
      splashRadius: 22,
    );
  }
}

// ── Hero totals ───────────────────────────────────────────────────────────

/// The three numbers the day is judged on, in the order the goods travel:
/// received → produced → dispatched. Kept on the gradient so they read as
/// the answer and everything below reads as the working.
class _HeroTotals extends StatelessWidget {
  const _HeroTotals({required this.async});
  final AsyncValue<InvDaySummary> async;

  @override
  Widget build(BuildContext context) {
    final k = async.valueOrNull?.totals;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: Container(
        padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
        decoration: BoxDecoration(
          gradient: InvColors.heroGradient,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: InvColors.amberDeep.withValues(alpha: 0.25),
              blurRadius: 14,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: Column(
          children: [
            IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Expanded(
                    child: InvHeroKpi(
                      label: 'Received',
                      value: compactINR(k?.receivedValue ?? 0),
                      footnote: _docs(k?.receivedDocs, 'receipt'),
                      tone: InvKpiTone.good,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: InvHeroKpi(
                      label: 'Produced',
                      value: compactINR(k?.producedValue ?? 0),
                      footnote: _docs(k?.producedDocs, 'run'),
                      tone: InvKpiTone.good,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Expanded(
                    child: InvHeroKpi(
                      label: 'Dispatched',
                      value: compactINR(k?.dispatchedValue ?? 0),
                      footnote: _docs(k?.dispatchedDocs, 'dispatch'),
                      tone: InvKpiTone.bad,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    // Consumption is what production cost the store, and the
                    // only figure here that explains a falling raw-material
                    // balance without a receipt or a dispatch behind it.
                    child: InvHeroKpi(
                      label: 'Consumed',
                      value: compactINR(k?.consumedValue ?? 0),
                      footnote: 'into production',
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _docs(int? n, String noun) {
    if (n == null) return ' ';
    return '$n $noun${n == 1 ? '' : 's'}';
  }
}

// ── Warehouse filter ──────────────────────────────────────────────────────

class _WarehouseFilter extends ConsumerWidget {
  const _WarehouseFilter({required this.selected, required this.onSelect});
  final String? selected;
  final ValueChanged<String?> onSelect;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final warehouses = ref.watch(invWarehousesProvider).valueOrNull ?? const [];
    // One warehouse is no choice at all — the pills would only take space
    // away from the day.
    if (warehouses.length < 2) return const SizedBox(height: 4);
    return SizedBox(
      height: 46,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
        children: [
          InvFilterPill(
            label: 'All warehouses',
            active: selected == null,
            onTap: () => onSelect(null),
          ),
          for (final w in warehouses) ...[
            const SizedBox(width: 8),
            InvFilterPill(
              label: w.name,
              active: selected == w.id,
              onTap: () => onSelect(w.id),
            ),
          ],
        ],
      ),
    );
  }
}

// ── Loading / error ───────────────────────────────────────────────────────

class _DayLoading extends StatelessWidget {
  const _DayLoading();

  @override
  Widget build(BuildContext context) => const Padding(
    padding: EdgeInsets.symmetric(vertical: 60),
    child: Center(child: CircularProgressIndicator()),
  );
}

class _DayError extends StatelessWidget {
  const _DayError({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) => InvEmptyState(
    icon: Icons.cloud_off_rounded,
    title: "Couldn't load this day",
    subtitle: message,
  );
}
