import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../api/reports_models.dart';
import '../../providers/reports_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../utils/format_inr.dart';
import '../../widgets/async_slot.dart';
import '../../widgets/runq_card.dart';
import '../../widgets/section_head.dart';
import 'monthly_pnl_line_sheet.dart';

/// Money → Reports → P&L. Same figures as the web Monthly view: sales against
/// milk (by pour date), materials and running costs, month by month.
class MonthlyPnlPanel extends ConsumerWidget {
  final DateRange range;
  final DateRange prevRange;
  final String periodLabel;
  const MonthlyPnlPanel({
    super.key,
    required this.range,
    required this.prevRange,
    required this.periodLabel,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pnl = ref.watch(monthlyPnlProvider(range));
    final prev = ref.watch(monthlyPnlProvider(prevRange));
    return AsyncSlot<MonthlyPnl>(
      value: pnl,
      onRetry: () => ref.invalidate(monthlyPnlProvider(range)),
      data: (cur) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _ProfitHero(
            amount: cur.operatingProfit.total,
            previous: prev.whenOrNull(data: (p) => p.operatingProfit.total),
            periodLabel: periodLabel,
          ),
          const SizedBox(height: 16),
          const SectionHead(title: 'Breakdown'),
          _Breakdown(pnl: cur, range: range),
          if (cur.months.length > 1) ...[
            const SizedBox(height: 16),
            const SectionHead(title: 'Month by month'),
            _MonthList(pnl: cur),
          ],
          const SizedBox(height: 12),
          _Notes(pnl: cur, range: range),
        ],
      ),
    );
  }
}

Color _profitColor(BuildContext context, double v) {
  final dark = Theme.of(context).brightness == Brightness.dark;
  if (v >= 0) return dark ? const Color(0xFF34D399) : const Color(0xFF047857);
  return dark ? const Color(0xFFF87171) : RunqColors.redInk;
}

String _signed(double v) =>
    v >= 0 ? formatINR(v, compact: true) : '−${formatINR(v.abs(), compact: true)}';

String _monthLabel(String month) => DateFormat('MMM yy').format(DateTime.parse('$month-01'));

class _ProfitHero extends StatelessWidget {
  final double amount;
  final double? previous;
  final String periodLabel;
  const _ProfitHero({required this.amount, required this.previous, required this.periodLabel});

  @override
  Widget build(BuildContext context) {
    final delta = previous == null ? null : amount - previous!;
    final up = (delta ?? 0) >= 0;
    return Container(
      decoration: BoxDecoration(
        gradient: RunqColors.heroGradient,
        borderRadius: BorderRadius.circular(RunqRadii.hero),
      ),
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('OPERATING PROFIT · ${periodLabel.toUpperCase()}',
              style: RunqText.label.copyWith(color: Colors.white.withValues(alpha: 0.65))),
          const SizedBox(height: 8),
          Text(_signed(amount), style: RunqText.display.copyWith(color: Colors.white, height: 1.05)),
          if (delta != null) ...[
            const SizedBox(height: 10),
            Row(mainAxisSize: MainAxisSize.min, children: [
              Icon(up ? Icons.arrow_upward_rounded : Icons.arrow_downward_rounded,
                  size: 14, color: up ? const Color(0xFFA7F3D0) : const Color(0xFFFCA5A5)),
              const SizedBox(width: 4),
              Text('${up ? '+' : '−'}${formatINR(delta.abs(), compact: true)} vs prev period',
                  style: RunqText.body.copyWith(color: Colors.white.withValues(alpha: 0.85))),
            ]),
          ],
        ],
      ),
    );
  }
}

class _Breakdown extends StatelessWidget {
  final MonthlyPnl pnl;
  final DateRange range;
  const _Breakdown({required this.pnl, required this.range});

  List<Widget> _section(BuildContext context, String key) {
    final s = pnl.section(key);
    if (s == null || s.lines.isEmpty) return const [];
    return [
      _SectionLabel(s.label),
      for (final l in s.lines)
        _Line(
          label: l.label,
          amount: l.total,
          onTap: () => showMonthlyPnlLineSheet(context, lineKey: l.key, label: l.label, range: range),
        ),
      _Line(label: s.totals.label, amount: s.totals.total, strong: true),
      const SizedBox(height: 14),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final hasNonOp = (pnl.section('nonOperating')?.lines ?? const []).isNotEmpty;
    final hasBooked = pnl.profitBookedAsExpense.total != 0;
    return RunqCard(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ..._section(context, 'revenue'),
          ..._section(context, 'expenses'),
          _Line(label: 'Operating profit', amount: pnl.operatingProfit.total, profit: true),
          if (hasNonOp) ...[
            const SizedBox(height: 14),
            ..._section(context, 'nonOperating'),
          ],
          if (hasNonOp || hasBooked) _Line(label: 'Net profit', amount: pnl.netProfit.total, profit: true),
          if (hasBooked) ...[
            const SizedBox(height: 14),
            const _SectionLabel('Where the profit went'),
            _Line(
              label: pnl.profitBookedAsExpense.label,
              amount: pnl.profitBookedAsExpense.total,
              onTap: () => showMonthlyPnlLineSheet(context,
                  lineKey: pnl.profitBookedAsExpense.key, label: pnl.profitBookedAsExpense.label, range: range),
            ),
            _OfficialLine(label: pnl.profitRetained.label, amount: pnl.profitRetained.total),
          ],
        ],
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final String text;
  const _SectionLabel(this.text);

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(text.toUpperCase(), style: RunqText.label.copyWith(color: RT(context).muted2)),
      );
}

class _Line extends StatelessWidget {
  final String label;
  final double amount;
  final bool strong;
  final bool profit;
  final VoidCallback? onTap;
  const _Line({required this.label, required this.amount, this.strong = false, this.profit = false, this.onTap});

  @override
  Widget build(BuildContext context) {
    final row = _row(context);
    if (onTap == null) return row;
    return InkWell(onTap: onTap, borderRadius: BorderRadius.circular(6), child: row);
  }

  Widget _row(BuildContext context) {
    final t = RT(context);
    final emphasis = strong || profit;
    return Container(
      padding: EdgeInsets.only(top: emphasis ? 8 : 3, bottom: 3),
      decoration: emphasis
          ? BoxDecoration(border: Border(top: BorderSide(color: t.hairline, width: 0.5)))
          : null,
      child: Row(children: [
        Expanded(
          child: Text(label,
              style: emphasis ? RunqText.bodyStrong.copyWith(color: t.ink) : RunqText.body.copyWith(color: t.muted)),
        ),
        Text(
          profit ? _signed(amount) : formatINR(amount, compact: true),
          style: RunqText.tabular(
            size: profit ? 16 : 14,
            w: emphasis ? FontWeight.w700 : FontWeight.w600,
            color: profit ? _profitColor(context, amount) : t.ink,
          ),
        ),
        if (onTap != null) Icon(Icons.chevron_right_rounded, size: 18, color: t.muted2),
      ]),
    );
  }
}

/// The official-books figure, in a muted blue-grey band so it isn't read as the internal profit.
class _OfficialLine extends StatelessWidget {
  final String label;
  final double amount;
  const _OfficialLine({required this.label, required this.amount});

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final fg = dark ? const Color(0xFF94A3B8) : const Color(0xFF64748B);
    final style = RunqText.body.copyWith(color: fg, fontStyle: FontStyle.italic);
    return Container(
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: dark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(children: [
        Expanded(child: Text(label, style: style)),
        Text(_signed(amount), style: RunqText.tabular(color: fg).copyWith(fontStyle: FontStyle.italic)),
      ]),
    );
  }
}

class _MonthList extends StatelessWidget {
  final MonthlyPnl pnl;
  const _MonthList({required this.pnl});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final revenue = pnl.section('revenue')?.totals.values ?? const <double>[];
    double cost(int i) => pnl.section('expenses')?.totals.values[i] ?? 0;
    return RunqCard(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Column(children: [
        for (var i = pnl.months.length - 1; i >= 0; i--)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Row(children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('${_monthLabel(pnl.months[i])}${pnl.provisionalMonths.contains(pnl.months[i]) ? ' *' : ''}',
                      style: RunqText.bodyStrong.copyWith(color: t.ink)),
                  Text(
                    'Sales ${formatINR(i < revenue.length ? revenue[i] : 0, compact: true)} · '
                    'Costs ${formatINR(cost(i), compact: true)}',
                    style: RunqText.caption.copyWith(color: t.muted),
                  ),
                ]),
              ),
              Text(_signed(pnl.operatingProfit.values[i]),
                  style: RunqText.tabular(
                      size: 15, w: FontWeight.w700, color: _profitColor(context, pnl.operatingProfit.values[i]))),
            ]),
          ),
      ]),
    );
  }
}

class _Notes extends StatelessWidget {
  final MonthlyPnl pnl;
  final DateRange range;
  const _Notes({required this.pnl, required this.range});

  @override
  Widget build(BuildContext context) {
    final style = RunqText.caption.copyWith(color: RT(context).muted);
    final hasMilk = (pnl.section('expenses')?.lines ?? const []).any((l) => l.key == 'milk');
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (hasMilk) Text('Milk is costed by pour date; bulk VMCC milk by its billing cycle.', style: style),
        if (pnl.provisionalMonths.isNotEmpty)
          Text('* Milk cost incomplete — a VMCC cycle is not billed yet.', style: style),
        if (pnl.excludedStock.total != 0)
          GestureDetector(
            onTap: () => showMonthlyPnlLineSheet(context,
                lineKey: pnl.excludedStock.key, label: pnl.excludedStock.label, range: range),
            child: Text('Stock movements of ${formatINR(pnl.excludedStock.total, compact: true)} are left out — '
                'purchases are already counted when bought. Tap to see them.', style: style),
          ),
        Text('Tap any line to see the entries behind it. In an expense list, “Not an expense” moves an entry '
            'you booked as an expense for the books into “Where the profit went”.', style: style),
      ]),
    );
  }
}
