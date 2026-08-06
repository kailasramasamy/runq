import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/notification_repo.dart';

/// The operator's notification inbox (rows + unread count). Not autoDispose —
/// the bell badge reads it from the home header on every persona, so it should
/// survive tab switches; refreshed by pull-to-refresh and after a mark-read.
final notificationFeedProvider = FutureProvider<NotificationFeed>((ref) async {
  return notificationRepo.feed();
});

/// Deep-link handoff for a notification tap.
///
/// A tap arrives from outside the widget tree (the FCM handler), so it can't
/// call `RoleShell.goToTab` — there's no shell context to reach. It parks the
/// target here instead; whichever persona shell is mounted consumes it on the
/// next build and switches to its own matching tab. Persona shells disagree on
/// tab order, so the target stays symbolic ('receive' / 'dispatch') rather than
/// an index.
final pendingDeepLinkProvider = StateProvider<String?>((ref) => null);
