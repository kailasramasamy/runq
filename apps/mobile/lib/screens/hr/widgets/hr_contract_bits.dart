// Small presentational pieces shared by the contract list, detail screen
// and the advance / settle sheets.

library;

import 'package:flutter/material.dart';
import '../../../api/hr_contract_models.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'hr_colors.dart';
import 'hr_widgets.dart';

const _kMon = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

String hrContractDate(DateTime d) => '${d.day} ${_kMon[d.month - 1]}';

String hrContractDateFull(DateTime d) =>
    '${d.day} ${_kMon[d.month - 1]} ${d.year}';

/// "18" or "18.5" — never "18.0", which reads like a precision nobody has.
String hrFormatDays(double n) =>
    n == n.roundToDouble() ? n.toInt().toString() : n.toStringAsFixed(1);

/// "1 Aug → ongoing" for open-ended work, or a closed span.
String hrContractTerm(HrContract c) => c.endDate == null
    ? '${hrContractDate(c.startDate)} → ongoing'
    : '${hrContractDate(c.startDate)} → ${hrContractDate(c.endDate!)}';

/// How the contract prices work, in one short phrase.
String hrContractCompLabel(HrContract c) {
  if (c.isTask) return '${hrFormatINR(c.fixedAmount ?? 0)} fixed';
  final rates = c.members.fold<double>(0, (s, m) => s + m.dailyRate);
  if (rates > 0) return '${hrFormatINR(rates)}/day';
  return '—';
}

/// Colour pairs: green reads "done and paid", amber "in flight", grey
/// "closed without money moving". Both themes declared explicitly.
List<Color> _statusColors(BuildContext context, String status) {
  final isDark = Theme.of(context).brightness == Brightness.dark;
  if (isDark) {
    return switch (status) {
      'active' || 'approved' || 'part paid' =>
        const [Color(0xFF78350F), Color(0xFFFCD34D)],
      'completed' || 'paid' => const [Color(0xFF14532D), Color(0xFF86EFAC)],
      'draft' || 'paused' => const [Color(0xFF1E3A8A), Color(0xFF93C5FD)],
      _ => const [Color(0xFF334155), Color(0xFFCBD5E1)],
    };
  }
  return switch (status) {
    'active' || 'approved' || 'part paid' =>
      const [Color(0xFFFEF3C7), Color(0xFF78350F)],
    'completed' || 'paid' => const [Color(0xFFDCFCE7), Color(0xFF14532D)],
    'draft' || 'paused' => const [Color(0xFFDBEAFE), Color(0xFF1E3A8A)],
    _ => const [Color(0xFFF1F5F9), Color(0xFF475569)],
  };
}

String hrContractStatusLabel(String s) => switch (s) {
      'active' => 'Active',
      'completed' => 'Completed',
      'cancelled' => 'Cancelled',
      'draft' => 'Draft',
      'approved' => 'Approved',
      'paid' => 'Paid',
      'part paid' => 'Part paid',
      'paused' => 'Paused',
      'recovered' => 'Recovered',
      _ => s,
    };

class HrContractStatusChip extends StatelessWidget {
  final String status;
  const HrContractStatusChip({super.key, required this.status});

  @override
  Widget build(BuildContext context) {
    final pair = _statusColors(context, status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: pair[0],
        borderRadius: BorderRadius.circular(RunqRadii.chip),
      ),
      child: Text(
        hrContractStatusLabel(status),
        style: RunqText.label.copyWith(color: pair[1], fontWeight: FontWeight.w700),
      ),
    );
  }
}

/// Small outline chip naming the contract type.
class HrContractTypeChip extends StatelessWidget {
  final String type;
  const HrContractTypeChip({super.key, required this.type});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(RunqRadii.chip),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      child: Text(contractTypeLabel(type),
          style: RunqText.micro.copyWith(color: t.muted)),
    );
  }
}

/// One line of a money breakdown.
class HrMoneyRow extends StatelessWidget {
  final String label;
  final String? sublabel;
  final double amount;
  final bool negative;
  final bool emphasis;
  const HrMoneyRow({
    super.key,
    required this.label,
    required this.amount,
    this.sublabel,
    this.negative = false,
    this.emphasis = false,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = HrColors.brand(context);
    final valueStyle = emphasis
        ? RunqText.h4.copyWith(color: brand, fontWeight: FontWeight.w800)
        : RunqText.body.copyWith(
            color: negative ? t.muted : t.ink,
            fontWeight: FontWeight.w600,
          );
    return Padding(
      padding: EdgeInsets.symmetric(vertical: emphasis ? 8 : 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: emphasis
                      ? RunqText.bodyStrong.copyWith(color: t.ink)
                      : RunqText.body.copyWith(color: t.muted),
                ),
                if (sublabel != null) ...[
                  const SizedBox(height: 2),
                  Text(sublabel!, style: RunqText.caption.copyWith(color: t.muted2)),
                ],
              ],
            ),
          ),
          const SizedBox(width: 12),
          Text('${negative ? '− ' : ''}${hrFormatINR(amount)}', style: valueStyle),
        ],
      ),
    );
  }
}

/// Warning callout. Both palettes declared — a fixed amber on a dark
/// surface is the classic unreadable-callout bug.
class HrContractWarning extends StatelessWidget {
  final String text;
  final bool severe;
  const HrContractWarning({super.key, required this.text, this.severe = false});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final (bg, ink) = switch ((severe, isDark)) {
      (true, true) => (const Color(0xFF7F1D1D), const Color(0xFFFCA5A5)),
      (true, false) => (const Color(0xFFFEE2E2), const Color(0xFF7F1D1D)),
      (false, true) => (const Color(0xFF78350F), const Color(0xFFFCD34D)),
      (false, false) => (const Color(0xFFFEF3C7), const Color(0xFF78350F)),
    };
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            severe ? Icons.error_outline_rounded : Icons.warning_amber_rounded,
            size: 16,
            color: ink,
          ),
          const SizedBox(width: 8),
          Expanded(child: Text(text, style: RunqText.caption.copyWith(color: ink))),
        ],
      ),
    );
  }
}

/// The running position: earned so far, less advances, equals outstanding.
/// This is the headline the whole feature exists to show.
class HrBalanceStrip extends StatelessWidget {
  final double earned, advances, outstanding;
  final DateTime throughDate;
  final bool isOpenEnded;

  /// Days worked so far. A fourth money-sized cell would crowd a phone, so
  /// this rides the caption instead. Null on a task lump sum.
  final double? daysWorked;

  /// True when those days are man-days across a crew, not one person's
  /// calendar.
  final bool isCrew;

  /// "2 leave, 1 paused" — why the count is short of the calendar.
  final String excludedNote;
  const HrBalanceStrip({
    super.key,
    this.daysWorked,
    this.isCrew = false,
    this.excludedNote = '',
    required this.earned,
    required this.advances,
    required this.outstanding,
    required this.throughDate,
    required this.isOpenEnded,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: HrColors.tealSubtle,
        borderRadius: BorderRadius.circular(RunqRadii.card),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(child: _cell(context, 'Earned', earned, false)),
              _divider(t),
              Expanded(child: _cell(context, 'Advances', advances, true)),
              _divider(t),
              Expanded(child: _cell(context, 'Outstanding', outstanding, false,
                  emphasis: true)),
            ],
          ),
          const SizedBox(height: 8),
          Text(_caption(), style: RunqText.caption.copyWith(color: t.muted)),
          if (excludedNote.isNotEmpty) ...[
            const SizedBox(height: 2),
            Text('$excludedNote excluded',
                style: RunqText.caption.copyWith(color: t.muted2)),
          ],
        ],
      ),
    );
  }

  /// "18 days worked · up to 20 Aug 2026", or just the term on a lump sum.
  String _caption() {
    final term = isOpenEnded
        ? 'counting to ${hrContractDateFull(throughDate)} · ongoing'
        : 'up to ${hrContractDateFull(throughDate)}';
    if (daysWorked == null) {
      return term[0].toUpperCase() + term.substring(1);
    }
    return '${hrFormatDays(daysWorked!)} '
        '${isCrew ? 'crew-days' : 'days'} worked · $term';
  }

  Widget _divider(RunqTokens t) =>
      Container(width: 0.5, height: 34, color: t.hairline);

  Widget _cell(BuildContext context, String label, double value, bool negative,
      {bool emphasis = false}) {
    final t = RT(context);
    final brand = HrColors.brand(context);
    return Column(
      children: [
        Text(
          '${negative && value > 0 ? '− ' : ''}${hrFormatINR(value)}',
          style: emphasis
              ? RunqText.h4.copyWith(color: brand, fontWeight: FontWeight.w800)
              : RunqText.bodyStrong.copyWith(color: t.ink),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        const SizedBox(height: 2),
        Text(label.toUpperCase(), style: RunqText.micro.copyWith(color: t.muted)),
      ],
    );
  }
}
