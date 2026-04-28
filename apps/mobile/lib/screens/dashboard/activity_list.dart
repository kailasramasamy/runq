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
  const ActivityList({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(activityProvider);

    return AsyncSlot<List<ActivityEntry>>(
      value: value,
      loading: const Padding(
        padding: EdgeInsets.symmetric(vertical: 24),
        child: Center(
          child: SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2, color: RunqColors.indigo)),
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
        final shown = items.take(8).toList();
        return RunqCard(
          padding: EdgeInsets.zero,
          child: Column(
            children: [
              for (var i = 0; i < shown.length; i++) ...[
                _Row(entry: shown[i]),
                if (i < shown.length - 1)
                  Padding(
                    padding: const EdgeInsets.only(left: 60),
                    child: Divider(height: 1, thickness: 0.5, color: RT(context).hairlineSoft),
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
            Container(
              width: 36, height: 36,
              decoration: BoxDecoration(color: spec.tint.withValues(alpha: 0.12), shape: BoxShape.circle),
              child: Icon(spec.icon, size: 18, color: spec.tint),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          spec.title,
                          style: RunqText.bodyStrong.copyWith(fontSize: 14, color: t.ink),
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
                  const SizedBox(height: 2),
                  Text(
                    spec.subtitle(_relTime(entry.createdAt)),
                    style: RunqText.caption.copyWith(fontSize: 11, color: t.muted2),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
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

String _relTime(DateTime t) {
  final diff = DateTime.now().difference(t);
  if (diff.inSeconds < 60) return 'just now';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
  if (diff.inHours < 24) return '${diff.inHours}h ago';
  if (diff.inDays < 7) return '${diff.inDays}d ago';
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return '${t.day} ${m[t.month - 1]}';
}
