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
          // Clear of the glyph, not on top of it. At caption size a "9+" badge
          // is nearly as wide as the bell and sat right over it, so the icon
          // it was annotating became unreadable. Smaller type, pushed further
          // out, and ringed in the surface colour so the two shapes separate.
          if (unread > 0)
            Positioned(
              top: -5, right: -7,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                constraints: const BoxConstraints(minWidth: 15),
                decoration: BoxDecoration(
                  color: t.gradeC,
                  borderRadius: BorderRadius.circular(DhenuRadii.pill),
                  border: Border.all(color: t.surface, width: 1.5),
                ),
                child: Text(
                  unread > 9 ? '9+' : '$unread',
                  textAlign: TextAlign.center,
                  style: DhenuText.number(size: 9, color: Colors.white)
                      .copyWith(fontWeight: FontWeight.w700, height: 1.2),
                ),
              ),
            ),
        ]),
      ),
    );
  }
}
