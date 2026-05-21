import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/models.dart';
import '../../providers/data_providers.dart';
import '../../theme/runq_tokens.dart';
import '../../theme/runq_theme.dart';
import '../../utils/format_inr.dart';
import '../../widgets/async_slot.dart';
import '../../widgets/runq_card.dart';
import 'activity_spec.dart';

class ActivityList extends ConsumerWidget {
  /// Cap on the number of activity rows rendered. The dashboard caps at 5
  /// so the section stays scannable; the standalone /activity screen can
  /// pass a larger value (or omit) for the full feed.
  final int maxItems;
  const ActivityList({super.key, this.maxItems = 8});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(activityProvider);

    return AsyncSlot<List<ActivityEntry>>(
      value: value,
      loading: Padding(
        padding: EdgeInsets.symmetric(vertical: 24),
        child: Center(
          child: SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2, color: RT(context).brand)),
        ),
      ),
      onRetry: () => ref.invalidate(activityProvider),
      data: (items) {
        if (items.isEmpty) {
          return const RunqCard(
            child: EmptyState(
              icon: Icons.history_rounded,
              title: 'No activity yet',
              subtitle: 'Create an invoice or scan a bill to see updates here.',
            ),
          );
        }
        final shown = items.take(maxItems).toList();
        return RunqCard(
          padding: EdgeInsets.zero,
          child: Column(
            children: [
              for (var i = 0; i < shown.length; i++) ...[
                _Row(entry: shown[i]),
                if (i < shown.length - 1)
                  Padding(
                    padding: const EdgeInsets.only(left: 60),
                    child: Divider(height: 1, thickness: 0.6, color: RT(context).hairline),
                  ),
              ],
            ],
          ),
        );
      },
    );
  }
}

class _Row extends StatelessWidget {
  final ActivityEntry entry;
  const _Row({required this.entry});

  void _onTap(BuildContext context) {
    switch (entry.entityType) {
      case 'sales_invoice':
        context.push('/invoices/${entry.entityId}');
        break;
      case 'purchase_invoice':
        context.push('/bills/${entry.entityId}');
        break;
      case 'bank_transaction':
        context.push('/banking');
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final spec = activitySpec(entry);
    return InkWell(
      onTap: () => _onTap(context),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Builder(builder: (ctx) {
              final isDark = Theme.of(ctx).brightness == Brightness.dark;
              final accent = isDark ? _liftToward(spec.tint, 0.42) : spec.tint;
              return Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: accent.withValues(alpha: isDark ? 0.22 : 0.12),
                  shape: BoxShape.circle,
                ),
                child: Icon(spec.icon, size: 18, color: accent),
              );
            }),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      Expanded(
                        child: Text(
                          spec.title,
                          style: RunqText.bodyStrong.copyWith(color: t.ink),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (entry.amount != null) ...[
                        const SizedBox(width: 8),
                        Text(
                          formatINR(entry.amount!),
                          style: RunqText.tabular(size: 14, w: FontWeight.w700, color: t.ink),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 4),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      Expanded(
                        child: Text(
                          spec.subtitle(_relTime(entry.createdAt)),
                          style: RunqText.caption.copyWith(color: t.muted2),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (spec.statusLabel != null) ...[
                        const SizedBox(width: 8),
                        _StatusPill(label: spec.statusLabel!, tint: spec.tint),
                      ],
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  final String label;
  final Color tint;
  const _StatusPill({required this.label, required this.tint});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    // Light mode: muted dark ink on pastel bg works fine.
    // Dark mode: lift the tint into a brighter shade for both bg and text so
    // the pill doesn't dissolve into the dark surface.
    final ink = isDark ? _lighten(tint, 0.42) : tint;
    final bgAlpha = isDark ? 0.22 : 0.12;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: ink.withValues(alpha: bgAlpha),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: RunqText.micro.copyWith(color: ink, height: 1.2),
      ),
    );
  }

  Color _lighten(Color c, double t) => _liftToward(c, t);
}

/// Lift [c] toward white by [t] (0..1) while preserving hue. Used to derive
/// a dark-mode-friendly variant of brand / status tints whose default value
/// is tuned for light surfaces.
Color _liftToward(Color c, double t) {
  final hsl = HSLColor.fromColor(c);
  final l = (hsl.lightness + (1 - hsl.lightness) * t).clamp(0.0, 1.0);
  return hsl.withLightness(l).toColor();
}

String _relTime(DateTime t) {
  final diff = DateTime.now().difference(t);
  if (diff.inSeconds < 60) return 'just now';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
  if (diff.inHours < 24) return '${diff.inHours}h ago';
  if (diff.inDays < 7) return '${diff.inDays}d ago';
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return '${t.day} ${m[t.month - 1]}';
}
