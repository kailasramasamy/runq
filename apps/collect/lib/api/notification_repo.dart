import 'api_client.dart';

/// One inbox row. Mirrors the API's NotificationRow — the same endpoints the
/// runq HR app uses, which are role-agnostic enough to serve a field operator
/// (`field_operator` clears the gate via the `viewer` expansion in rbacHook).
class AppNotification {
  const AppNotification({
    required this.id,
    required this.type,
    required this.source,
    required this.title,
    required this.unread,
    required this.createdAt,
    this.body,
    this.targetUrl,
  });

  final String id;
  /// 'info' | 'ok' | 'warn' — drives the leading glyph colour.
  final String type;
  /// Origin tag, e.g. 'mp_dispatch' | 'mp_receipt' | 'mp_transit'.
  final String source;
  final String title;
  final String? body;
  final String? targetUrl;
  final bool unread;
  final DateTime createdAt;

  factory AppNotification.fromJson(Map<String, dynamic> j) => AppNotification(
        id: (j['id'] ?? '').toString(),
        type: (j['type'] ?? 'info').toString(),
        source: (j['source'] ?? 'system').toString(),
        title: (j['title'] ?? '').toString(),
        body: j['body']?.toString(),
        targetUrl: j['targetUrl']?.toString(),
        unread: j['unread'] == true,
        createdAt: DateTime.tryParse((j['createdAt'] ?? '').toString())?.toLocal() ??
            DateTime.now(),
      );
}

/// The inbox payload: rows plus the unread count, which the bell badges.
class NotificationFeed {
  const NotificationFeed({required this.items, required this.unread});
  final List<AppNotification> items;
  final int unread;

  static const empty = NotificationFeed(items: [], unread: 0);
}

/// Typed wrapper over `/dashboard/notifications`.
///
/// Every call is scoped to the `mp_` source namespace. The notifications table
/// is shared across modules and one person is commonly both a dairy operator and
/// an employee — unscoped, Dhenu showed HR payroll notices, badged them, and
/// "Mark all read" would have cleared the user's HR inbox from inside the dairy
/// app. The scope has to be on the writes as much as the reads.
class NotificationRepo {
  NotificationRepo([ApiClient? client]) : _api = client ?? apiClient;
  final ApiClient _api;

  static const _scope = 'sourcePrefix=mp_';

  Future<NotificationFeed> feed({int limit = 30}) async {
    final res = await _api.get('/dashboard/notifications?limit=$limit&$_scope');
    final data = (res is Map) ? res['data'] : null;
    if (data is! Map) return NotificationFeed.empty;
    final items = data['items'];
    return NotificationFeed(
      items: items is List
          ? items
              .cast<Map<String, dynamic>>()
              .map(AppNotification.fromJson)
              .toList()
          : const [],
      unread: (data['unread'] as num?)?.toInt() ?? 0,
    );
  }

  Future<void> markRead(String id) => _api.put('/dashboard/notifications/$id/read', {});

  Future<void> markAllRead() =>
      _api.put('/dashboard/notifications/mark-all-read?$_scope', {});
}

final notificationRepo = NotificationRepo();
