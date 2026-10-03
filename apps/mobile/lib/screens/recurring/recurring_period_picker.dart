import 'package:flutter/material.dart';
import '../../api/recurring_bill_models.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../utils/format_inr.dart';
import 'recurring_form_kit.dart';

/// Where a payment lands, mirroring the server: the ticked periods (or every
/// open one), oldest first, with anything left over held as an advance.
List<String> paymentPlan(double amount, List<RecurringMonth> openOldestFirst, Set<String> chosen, bool asAdvance) {
  final targets = asAdvance
      ? const <RecurringMonth>[]
      : chosen.isEmpty
          ? openOldestFirst
          : openOldestFirst.where((m) => chosen.contains(m.id)).toList();
  var left = amount;
  final lines = <String>[];
  for (final m in targets) {
    if (left <= 0) break;
    final take = left < m.balance ? left : m.balance;
    lines.add('${formatINR(take)} → ${m.label}');
    left = ((left - take) * 100).roundToDouble() / 100;
  }
  if (left > 0) lines.add('${formatINR(left)} held as advance');
  return lines;
}

/// "Pay for": oldest due first unless specific open periods are ticked.
class RecurringPeriodPicker extends StatelessWidget {
  final List<RecurringMonth> openOldestFirst;
  final Set<String> chosen;
  final ValueChanged<String> onToggle;

  const RecurringPeriodPicker({
    super.key,
    required this.openOldestFirst,
    required this.chosen,
    required this.onToggle,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        FormSectionHeader('Pay for', hint: chosen.isEmpty ? 'Oldest due first' : null),
        FormGroupCard(children: [
          for (final m in openOldestFirst)
            _PeriodRow(m: m, on: chosen.contains(m.id), onTap: () => onToggle(m.id)),
        ]),
      ],
    );
  }
}

class _PeriodRow extends StatelessWidget {
  final RecurringMonth m;
  final bool on;
  final VoidCallback onTap;
  const _PeriodRow({required this.m, required this.on, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
        child: Row(
          children: [
            Icon(on ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded,
                size: 22, color: on ? t.brand : t.muted2),
            const SizedBox(width: 12),
            Expanded(child: Text(m.label, style: RunqText.bodyStrong.copyWith(color: t.ink))),
            Text('${formatINR(m.balance)} due',
                style: RunqText.tabular(size: 13, w: FontWeight.w600, color: t.muted)),
          ],
        ),
      ),
    );
  }
}

/// Where the entered amount will land, one line per period.
class RecurringPlanPreview extends StatelessWidget {
  final List<String> lines;
  const RecurringPlanPreview({super.key, required this.lines});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: t.bgWarm,
        borderRadius: BorderRadius.circular(RunqRadii.card),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('THIS PAYMENT WILL',
              style: RunqText.label.copyWith(color: t.muted2, letterSpacing: 0.6)),
          const SizedBox(height: 8),
          for (final l in lines) _PlanLine(line: l),
        ],
      ),
    );
  }
}

class _PlanLine extends StatelessWidget {
  final String line;
  const _PlanLine({required this.line});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final parts = line.split(' → ');
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Icon(Icons.arrow_forward_rounded, size: 16, color: t.muted),
          const SizedBox(width: 8),
          Expanded(
            child: parts.length == 2
                ? Text.rich(TextSpan(children: [
                    TextSpan(
                        text: parts[0],
                        style: RunqText.tabular(size: 14, w: FontWeight.w700, color: t.ink)),
                    TextSpan(text: '  ${parts[1]}', style: RunqText.body.copyWith(color: t.muted)),
                  ]))
                : Text(line, style: RunqText.body.copyWith(color: t.muted)),
          ),
        ],
      ),
    );
  }
}
