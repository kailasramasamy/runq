// Notifications inbox — list of items from the per-user notifications table.
// Tap marks read + navigates to targetUrl. Pull to refresh. Mark-all-read
// action in the app bar. Uses the HR theme tokens.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../api/notifications_repo.dart';
import '../router.dart' show openNotificationTarget;
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../screens/hr/widgets/hr_colors.dart';
import '../widgets/runq_snack.dart';

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final brand = HrColors.brand(context);
    final async = ref.watch(notificationsProvider);
    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          async.maybeWhen(
            data: (d) => d.items.where((n) => n.unread).isEmpty
                ? const SizedBox.shrink()
                : TextButton(
                    style: TextButton.styleFrom(foregroundColor: brand),
                    onPressed: () async {
                      try {
                        await notificationsRepo.markAllRead();
                        ref.invalidate(notificationsProvider);
                      } catch (e) {
                        if (context.mounted) showRunqSnack(context, 'Failed: $e', kind: SnackKind.error);
                      }
                    },
                    child: const Text('Mark all read'),
                  ),
            orElse: () => const SizedBox.shrink(),
          ),
        ],
      ),
      body: RefreshIndicator(
        color: brand,
        onRefresh: () async {
          ref.invalidate(notificationsProvider);
          await ref.read(notificationsProvider.future);
        },
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(child: Text('$e')),
          data: (d) {
            if (d.items.isEmpty) {
              return ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(32, 100, 32, 32),
                    child: Column(children: [
                      Icon(Icons.notifications_none, size: 56, color: t.muted),
                      const SizedBox(height: 12),
                      Text('No notifications yet',
                          textAlign: TextAlign.center,
                          style: RunqText.bodyStrong.copyWith(color: t.ink)),
                      const SizedBox(height: 4),
                      Text('You\'ll see HR updates here — new goals, leave approvals, payslips.',
                          textAlign: TextAlign.center,
                          style: RunqText.body.copyWith(color: t.muted)),
                    ]),
                  ),
                ],
              );
            }
            return ListView.builder(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 24),
              itemCount: d.items.length,
              itemBuilder: (_, i) => _NotificationCard(
                notif: d.items[i],
                onTap: () => _open(context, ref, d.items[i]),
              ),
            );
          },
        ),
      ),
    );
  }

  Future<void> _open(BuildContext context, WidgetRef ref, RunqNotification n) async {
    if (n.unread) {
      try {
        await notificationsRepo.markRead(n.id);
        ref.invalidate(notificationsProvider);
      } catch (_) {/* ignore */}
    }
    final target = n.targetUrl;
    if (target == null || target.isEmpty || target.startsWith('http')) return;
    if (!context.mounted) return;
    openNotificationTarget(context, target);
  }
}

class _NotificationCard extends StatelessWidget {
  const _NotificationCard({required this.notif, required this.onTap});
  final RunqNotification notif;
  final VoidCallback onTap;

  Color _accent(BuildContext ctx) => switch (notif.type) {
        'ok' => Colors.green.shade600,
        'warn' => Colors.amber.shade700,
        _ => HrColors.brand(ctx),
      };

  IconData _icon() => switch (notif.source) {
        'hr_performance'   => Icons.flag_outlined,
        'hr_leave'         => Icons.beach_access_outlined,
        'hr_payroll'       => Icons.payments_outlined,
        'hr_helpdesk'      => Icons.support_agent,
        'hr_expense'       => Icons.receipt_long_outlined,
        'hr_loan'          => Icons.account_balance_outlined,
        'hr_tax'           => Icons.request_quote_outlined,
        'hr_attendance'    => Icons.fingerprint,
        'hr_announcement'  => Icons.campaign_outlined,
        'hr_onboarding'    => Icons.how_to_reg_outlined,
        'hr_lifecycle'     => Icons.exit_to_app,
        _                  => Icons.notifications_outlined,
      };

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final accent = _accent(context);
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: notif.unread ? accent.withValues(alpha: 0.35) : t.hairline,
          width: notif.unread ? 1 : 0.5,
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 13, 14, 13),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
              width: 38, height: 38,
              decoration: BoxDecoration(color: accent.withValues(alpha: 0.16), shape: BoxShape.circle),
              child: Icon(_icon(), color: accent, size: 19),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Expanded(
                    child: Text(notif.title, style: RunqText.bodyStrong.copyWith(
                      fontWeight: notif.unread ? FontWeight.w700 : FontWeight.w600,
                      color: t.ink,
                    )),
                  ),
                  if (notif.unread) ...[
                    const SizedBox(width: 8),
                    Container(
                      margin: const EdgeInsets.only(top: 4),
                      width: 8, height: 8,
                      decoration: BoxDecoration(color: accent, shape: BoxShape.circle),
                    ),
                  ],
                ]),
                if (notif.body != null && notif.body!.isNotEmpty) ...[
                  const SizedBox(height: 3),
                  Text(notif.body!, style: RunqText.body.copyWith(color: t.muted, height: 1.35)),
                ],
                const SizedBox(height: 5),
                Text(_relativeTime(notif.createdAt), style: RunqText.caption.copyWith(color: t.muted)),
              ]),
            ),
          ]),
        ),
      ),
    );
  }
}

String _relativeTime(DateTime when) {
  final d = DateTime.now().difference(when.toLocal());
  if (d.inMinutes < 1) return 'just now';
  if (d.inMinutes < 60) return '${d.inMinutes}m ago';
  if (d.inHours < 24) return '${d.inHours}h ago';
  if (d.inDays < 7) return '${d.inDays}d ago';
  return DateFormat('d MMM').format(when.toLocal());
}
