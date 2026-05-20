import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'api_client.dart';
import '../providers/auth_provider.dart';

class RunqNotification {
  final String id, type, source, title;
  final String? body, targetUrl;
  final bool unread;
  final DateTime createdAt;
  RunqNotification({
    required this.id,
    required this.type,
    required this.source,
    required this.title,
    this.body,
    this.targetUrl,
    required this.unread,
    required this.createdAt,
  });
  factory RunqNotification.fromJson(Map<String, dynamic> j) => RunqNotification(
    id: (j['id'] as String?) ?? '',
    type: (j['type'] as String?) ?? 'info',
    source: (j['source'] as String?) ?? 'system',
    title: (j['title'] as String?) ?? '',
    body: j['body'] as String?,
    targetUrl: j['targetUrl'] as String?,
    unread: j['unread'] == true,
    createdAt: DateTime.tryParse((j['createdAt'] as String?) ?? '') ?? DateTime.now(),
  );
}

class NotificationsList {
  final List<RunqNotification> items;
  final int unread;
  NotificationsList({required this.items, required this.unread});
}

class NotificationsRepo {
  Future<NotificationsList> list({int limit = 50}) async {
    final res = await apiClient.get('/dashboard/notifications?limit=$limit');
    final d = (res['data'] as Map<String, dynamic>?) ?? const {};
    final raw = (d['items'] as List?) ?? const [];
    return NotificationsList(
      items: raw.cast<Map<String, dynamic>>().map(RunqNotification.fromJson).toList(),
      unread: (d['unread'] as int?) ?? 0,
    );
  }

  Future<void> markRead(String id) async {
    await apiClient.put('/dashboard/notifications/$id/read', {});
  }

  Future<void> markAllRead() async {
    await apiClient.put('/dashboard/notifications/mark-all-read', {});
  }
}

final notificationsRepo = NotificationsRepo();

final notificationsProvider = FutureProvider<NotificationsList>((ref) async {
  ref.watch(authProvider);
  return notificationsRepo.list();
});

final unreadCountProvider = Provider<int>((ref) {
  final async = ref.watch(notificationsProvider);
  return async.asData?.value.unread ?? 0;
});
