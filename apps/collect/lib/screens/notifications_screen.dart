import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/notification_repo.dart';
import '../l10n/app_localizations.dart';
import '../providers/notification_providers.dart';
import '../router.dart' show openNotificationTarget;
import '../theme/dhenu_icons.dart';
import '../theme/dhenu_theme.dart';
import '../theme/dhenu_tokens.dart';
import '../widgets/dhenu_card.dart';
import '../widgets/dhenu_states.dart';

/// The operator's notification inbox. Rows are the same records that were
/// pushed to the device, so a notification missed on the lock screen is still
/// recoverable here — which is the whole point of writing the inbox row as well
/// as firing the push.
class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final feed = ref.watch(notificationFeedProvider);
    final unread = feed.asData?.value.unread ?? 0;

    return Scaffold(
      backgroundColor: t.surface,
      appBar: AppBar(
        title: Text(l.notificationsTitle, style: DhenuText.h2.copyWith(color: t.ink)),
        actions: [
          if (unread > 0)
            TextButton(
              onPressed: () async {
                await notificationRepo.markAllRead();
                ref.invalidate(notificationFeedProvider);
              },
              child: Text(l.notificationsMarkAllRead,
                  style: DhenuText.label.copyWith(color: t.brand)),
            ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(notificationFeedProvider);
          await ref.read(notificationFeedProvider.future);
        },
        child: feed.when(
          loading: () => const DhenuLoadingList(),
          error: (_, _) => DhenuEmptyState(
            icon: DhenuIcons.cloudOff,
            title: l.notificationsLoadError,
          ),
          data: (f) {
            if (f.items.isEmpty) {
              return ListView(
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                children: [
                  const SizedBox(height: DhenuSpacing.bottomGap),
                  DhenuEmptyState(
                    icon: DhenuIcons.bell,
                    title: l.notificationsEmptyTitle,
                    subtitle: l.notificationsEmptySubtitle,
                  ),
                ],
              );
            }
            return ListView.separated(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: const EdgeInsets.fromLTRB(DhenuSpacing.screen, DhenuSpacing.md,
                  DhenuSpacing.screen, DhenuSpacing.x4),
              itemCount: f.items.length,
              separatorBuilder: (_, _) => const SizedBox(height: DhenuSpacing.sm),
              itemBuilder: (_, i) => _row(context, ref, t, l, f.items[i]),
            );
          },
        ),
      ),
    );
  }

  Widget _row(BuildContext context, WidgetRef ref, DhenuTokens t, AppLocalizations l,
      AppNotification n) {
    final colour = switch (n.type) {
      'warn' => t.gradeC,
      'ok' => t.gradeA,
      _ => t.brand,
    };
    return DhenuCard(
      padding: const EdgeInsets.symmetric(
          horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md),
      onTap: () => _open(context, ref, n),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          width: 34, height: 34,
          decoration: BoxDecoration(
              color: colour.withValues(alpha: 0.12), shape: BoxShape.circle),
          child: Icon(_glyph(n.source), size: 17, color: colour),
        ),
        const SizedBox(width: DhenuSpacing.md),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(n.title,
              style: DhenuText.body.copyWith(
                  color: t.ink,
                  fontWeight: n.unread ? FontWeight.w700 : FontWeight.w500)),
          if (n.body != null && n.body!.isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(n.body!, style: DhenuText.caption.copyWith(color: t.inkSoft)),
          ],
          const SizedBox(height: 4),
          Text(_ago(l, n.createdAt), style: DhenuText.caption.copyWith(color: t.inkSoft)),
        ])),
        if (n.unread) ...[
          const SizedBox(width: DhenuSpacing.sm),
          Container(
            width: 8, height: 8,
            decoration: BoxDecoration(color: t.brand, shape: BoxShape.circle),
          ),
        ],
      ]),
    );
  }

  /// Mark read, then follow the deep link if the notice carries one.
  Future<void> _open(BuildContext context, WidgetRef ref, AppNotification n) async {
    if (n.unread) {
      await notificationRepo.markRead(n.id);
      ref.invalidate(notificationFeedProvider);
    }
    final target = n.targetUrl;
    if (target == null || target.isEmpty) return;
    if (!context.mounted) return;
    // Pop the inbox first — the target is a tab on the shell underneath it.
    Navigator.of(context).pop();
    openNotificationTarget(target);
  }

  IconData _glyph(String source) => switch (source) {
        'mp_dispatch' => DhenuIcons.truck,
        'mp_receive' || 'mp_receipt' => DhenuIcons.receive,
        'mp_transit' => DhenuIcons.clock,
        _ => DhenuIcons.bell,
      };

  String _ago(AppLocalizations l, DateTime at) {
    final d = DateTime.now().difference(at);
    if (d.inMinutes < 1) return l.notificationsJustNow;
    if (d.inMinutes < 60) return l.notificationsMinutesAgo(d.inMinutes);
    if (d.inHours < 24) return l.notificationsHoursAgo(d.inHours);
    return l.notificationsDaysAgo(d.inDays);
  }
}
