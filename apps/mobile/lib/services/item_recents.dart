// The last few items opened from the Items screen, kept on the device.
//
// Item access is heavily lopsided: a store or a floor works the same handful
// of SKUs all day and reaches for the rest once a month. Search is fast now,
// but the fastest lookup is the one you don't have to type, so the screen
// leads with what you opened last.
//
// A name and SKU are stored alongside the id so the strip can draw itself
// before — or without — the catalogue in memory. The live row wins whenever
// the screen has one; the snapshot is only a stand-in for a rename we have
// not seen yet.

library;

import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../api/inventory_models.dart';

class RecentItem {
  const RecentItem({required this.id, required this.name, this.sku});
  final String id;
  final String name;
  final String? sku;

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'sku': sku};

  static RecentItem? fromJson(Map<String, dynamic> j) {
    final id = j['id'], name = j['name'];
    if (id is! String || name is! String) return null;
    return RecentItem(id: id, name: name, sku: j['sku'] as String?);
  }
}

class ItemRecentsStore {
  /// [userId] scopes the list to the signed-in user, so switching account or
  /// tenant on a shared handset does not surface someone else's catalogue.
  const ItemRecentsStore(this.userId);
  final String? userId;

  static const maxEntries = 8;

  String get _key => 'inv_recent_items_${userId ?? 'anon'}';

  Future<List<RecentItem>> load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getStringList(_key) ?? const [];
    final out = <RecentItem>[];
    for (final line in raw) {
      // One unreadable entry must not cost the whole strip — a half-written
      // list is still a useful list.
      final decoded = _decode(line);
      if (decoded != null) out.add(decoded);
    }
    return out;
  }

  /// Move [item] to the front and persist. Returns the new list so the caller
  /// can paint without a second read.
  Future<List<RecentItem>> remember(RecentItem item) async {
    final current = await load();
    final next = [
      item,
      for (final r in current)
        if (r.id != item.id) r,
    ].take(maxEntries).toList();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(_key, [
      for (final r in next) jsonEncode(r.toJson()),
    ]);
    return next;
  }

  Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_key);
  }

  static RecentItem? _decode(String line) {
    try {
      final j = jsonDecode(line);
      return j is Map<String, dynamic> ? RecentItem.fromJson(j) : null;
    } on FormatException {
      return null;
    }
  }
}

/// [recents] re-read against a live catalogue, so a rename shows through and
/// an item deleted since is dropped rather than offered as a dead end. With
/// no catalogue in memory the stored snapshots are all we have, so they
/// stand as written.
List<RecentItem> reconcileRecents(
  List<RecentItem> recents,
  List<InvItemListRow>? catalogue,
) {
  if (catalogue == null) return recents;
  final byId = {for (final r in catalogue) r.id: r};
  return [
    for (final r in recents)
      if (byId[r.id] case final live?)
        RecentItem(id: live.id, name: live.name, sku: live.sku),
  ];
}
