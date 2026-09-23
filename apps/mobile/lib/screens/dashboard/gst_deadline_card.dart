import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/models.dart';
import '../../providers/data_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/gst_deadline_gate.dart';

/// Persistent deadline banner on the dashboard. Carries every tier, including
/// the quiet `strip` days the dialog stays out of — so the deadline is visible
/// from T-5 without a prompt interrupting anyone.
class GstDeadlineCard extends ConsumerWidget {
  const GstDeadlineCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final alert = ref.watch(gstDeadlineAlertProvider).maybeWhen(
          data: (a) => a,
          orElse: () => null,
        );
    if (alert == null) return const SizedBox.shrink();

    final tone = gstAlertColors(context, alert);

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Material(
        color: tone.bg,
        borderRadius: BorderRadius.circular(RunqRadii.card),
        child: InkWell(
          borderRadius: BorderRadius.circular(RunqRadii.card),
          onTap: () => context.push(gstAlertRoute(alert)),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
            child: Row(
              children: [
                Icon(alert.isOverdue ? Icons.error_outline : Icons.event_busy,
                    size: 20, color: tone.ink),
                const SizedBox(width: 12),
                Expanded(child: _Copy(alert: alert, tone: tone)),
                Icon(Icons.chevron_right, size: 20, color: tone.ink),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Copy extends StatelessWidget {
  final GstDeadlineAlert alert;
  final ({Color bg, Color ink}) tone;
  const _Copy({required this.alert, required this.tone});

  @override
  Widget build(BuildContext context) {
    final sub = alert.isOverdue && alert.lateFeeEstimate > 0
        ? 'About ₹${alert.lateFeeEstimate} in late fees so far'
        : 'Tap to review and file';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '${alert.returnLabel} for ${alert.periodLabel} ${alert.urgencyPhrase}',
          style: RunqText.bodyStrong.copyWith(color: tone.ink),
        ),
        const SizedBox(height: 2),
        Text(sub, style: RunqText.caption.copyWith(color: tone.ink.withValues(alpha: 0.8))),
      ],
    );
  }
}
