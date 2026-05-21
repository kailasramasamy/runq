import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/models.dart';
import '../../providers/data_providers.dart';
import '../../theme/runq_tokens.dart';
import '../../theme/runq_theme.dart';

class GstSection extends ConsumerWidget {
  const GstSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final gst = ref.watch(gstReadinessProvider).maybeWhen(
          data: (g) => g,
          orElse: () => null,
        );
    if (gst == null || gst.filedExternally) return const SizedBox.shrink();

    final t = RT(context);
    final score = gst.score;
    final failing = gst.firstFailingSignal;
    final isPreparing = gst.preparing;
    final bothFiled = gst.gstr1Status.isFiled && gst.gstr3bStatus.isFiled;
    final targetIsNext = gst.target == ReadinessTarget.nextGstr1;

    final pillLabel = bothFiled
        ? 'Filed'
        : isPreparing
            ? 'Preparing'
            : score >= 80
                ? 'Ready'
                : 'Sent';
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final pillColors = bothFiled
        ? (
            bg: isDark ? const Color(0xFF0D2620) : RunqColors.greenBg,
            ink: isDark ? const Color(0xFF34D399) : RunqColors.greenInk,
          )
        : score >= 80
            ? (
                bg: isDark ? const Color(0xFF0D2620) : RunqColors.greenBg,
                ink: isDark ? const Color(0xFF34D399) : RunqColors.greenInk,
              )
            : isPreparing
                ? (
                    bg: isDark ? const Color(0xFF3A2410) : RunqColors.amberBg,
                    ink: isDark ? const Color(0xFFFBBF24) : RunqColors.amberInk,
                  )
                : (
                    bg: RunqColors.indigo.withValues(alpha: isDark ? 0.22 : 0.10),
                    ink: RunqColors.indigo,
                  );

    final headline =
        targetIsNext ? '$score% ready for next cycle' : '$score% ready to file';
    final days = gst.daysToTarget;
    final dueText = days == null
        ? null
        : days < 0
            ? 'Overdue'
            : days == 0
                ? 'Due today'
                : 'Due in $days ${days == 1 ? 'day' : 'days'}';
    final subParts = <String>[
      if (dueText != null) dueText,
      if (failing != null) failing.detail ?? failing.label,
    ];

    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.card),
        border: Border.all(color: t.hairline, width: 0.5),
        boxShadow: RunqShadows.card,
      ),
      padding: const EdgeInsets.fromLTRB(16, 14, 12, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Text(
                '${gst.targetLabel.toUpperCase()} · ${gst.periodLabel.toUpperCase()}',
                style: RunqText.label.copyWith(
                  color: t.muted2,
                  letterSpacing: 0.5,
                ),
              ),
              const SizedBox(width: 8),
              _Pill(label: pillLabel, bg: pillColors.bg, ink: pillColors.ink),
              const Spacer(),
              _ReviewButton(failing: failing != null),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            headline,
            style: RunqText.h3.copyWith(color: t.ink),
          ),
          if (subParts.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              subParts.join(' · '),
              style: RunqText.caption.copyWith(color: t.muted),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ],
          const SizedBox(height: 14),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: (score / 100).clamp(0.0, 1.0),
              minHeight: 6,
              backgroundColor: t.hairlineSoft,
              valueColor: const AlwaysStoppedAnimation(RunqColors.indigo),
            ),
          ),
        ],
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  final String label;
  final Color bg, ink;
  const _Pill({required this.label, required this.bg, required this.ink});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        label,
        style: RunqText.micro.copyWith(color: ink),
      ),
    );
  }
}

class _ReviewButton extends StatelessWidget {
  final bool failing;
  const _ReviewButton({required this.failing});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: RunqColors.indigo,
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: () => context.push('/gst'),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          child: Text(
            failing ? 'Fix & review' : 'Review',
            style: RunqText.body.copyWith(
              color: Colors.white,
            ),
          ),
        ),
      ),
    );
  }
}
