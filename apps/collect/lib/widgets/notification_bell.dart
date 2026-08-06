import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/notification_providers.dart';
import '../screens/notifications_screen.dart';
import '../theme/dhenu_icons.dart';
import '../theme/dhenu_theme.dart';
import '../theme/dhenu_tokens.dart';

/// Inbox bell with an unread badge, for the operator home headers. Sits beside
/// [SyncStatus] in the section header's trailing slot.
///
/// Farmers are deliberately excluded: the notification endpoints gate on
/// `viewer` (which expands to `field_operator`), and the `farmer` role is not
/// in that set — a bell there would only ever render a 403.
class NotificationBell extends ConsumerWidget {
  const NotificationBell({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    // A failed/loading feed shows a plain bell rather than an error — the header
    // must not break because the inbox is unreachable.
    final unread = ref.watch(notificationFeedProvider).asData?.value.unread ?? 0;
    return InkWell(
      onTap: () => Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => const NotificationsScreen(),
      )),
      borderRadius: BorderRadius.circular(DhenuRadii.pill),
      child: Padding(
        padding: const EdgeInsets.all(DhenuSpacing.xs),
        child: Stack(clipBehavior: Clip.none, children: [
          Icon(unread > 0 ? DhenuIcons.bellDot : DhenuIcons.bell,
              size: 22, color: unread > 0 ? t.brand : t.inkSoft),
          if (unread > 0)
            Positioned(
              top: -4, right: -6,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                constraints: const BoxConstraints(minWidth: 16),
                decoration: BoxDecoration(
                  color: t.gradeC,
                  borderRadius: BorderRadius.circular(DhenuRadii.pill),
                ),
                child: Text(
                  unread > 9 ? '9+' : '$unread',
                  textAlign: TextAlign.center,
                  style: DhenuText.caption.copyWith(
                      color: Colors.white, fontWeight: FontWeight.w700),
                ),
              ),
            ),
        ]),
      ),
    );
  }
}
