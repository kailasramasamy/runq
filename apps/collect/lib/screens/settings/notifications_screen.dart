import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/notification_prefs_provider.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../widgets/dhenu_card.dart';

/// Notification preference screen — single toggle to enable/disable push.
/// Drives FCM registration via [NotificationPrefsController].
class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    final pushEnabled = ref.watch(notificationPrefsProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text('Notifications', style: DhenuText.h2.copyWith(color: t.ink)),
      ),
      body: ListView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.fromLTRB(
          DhenuSpacing.screen, DhenuSpacing.lg, DhenuSpacing.screen, DhenuSpacing.x4,
        ),
        children: [
          DhenuCard(
            padding: EdgeInsets.zero,
            child: SwitchListTile.adaptive(
              secondary: Container(
                width: 36,
                height: 36,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: t.brandSubtle,
                  borderRadius: BorderRadius.circular(DhenuRadii.input),
                ),
                child: Icon(DhenuIcons.bell, size: 18, color: t.brand),
              ),
              title: Text(
                'Push notifications',
                style: DhenuText.body.copyWith(color: t.ink),
              ),
              subtitle: Text(
                'Get alerts for collections, dispatch and payouts',
                style: DhenuText.caption.copyWith(color: t.inkSoft),
              ),
              value: pushEnabled,
              onChanged: (v) => ref.read(notificationPrefsProvider.notifier).set(v),
              activeThumbColor: t.brand,
              activeTrackColor: t.brandSubtle,
            ),
          ),
          const SizedBox(height: DhenuSpacing.md),
          Text(
            'When off, this device won\'t receive any push notifications. '
            'You can turn it back on anytime.',
            style: DhenuText.caption.copyWith(color: t.inkSoft),
          ),
        ],
      ),
    );
  }
}
