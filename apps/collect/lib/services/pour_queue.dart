import 'dart:async';
import 'dart:convert';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/widgets.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:uuid/uuid.dart';

import '../api/api_client.dart';
import '../api/mp_repo.dart';

/// Offline-first write queue for milk-collection pours — the critical capture
/// path (design spec §7: "Offline is a first-class state, not an error").
///
/// **Why:** village collection runs on flaky 2G. The operator must never lose a
/// pour because the network blinked. Every `+ Record Collection` goes through
/// here: online → POST immediately; offline → persist to Hive and drain on the
/// next reconnect or app foreground.
///
/// **Replay safety:** each entry carries a `deviceLocalId` (UUIDv4) sent in the
/// body. The API dedupes on it (last-write-wins per farmer/shift/date), so a
/// replay after partial success is a no-op — operators can't double-post.
class PourQueue {
  PourQueue._();
  static final PourQueue instance = PourQueue._();

  static const _boxName = 'dhenu_pour_queue_v1';
  static const _uuid = Uuid();
  // A 5xx that persists this many drains is treated as permanent (failed).
  static const _maxAttempts = 8;

  Box<Map<dynamic, dynamic>>? _box;
  final _connectivity = Connectivity();
  StreamSubscription<List<ConnectivityResult>>? _connSub;
  bool _online = true;
  bool _draining = false;

  final _changes = StreamController<int>.broadcast();
  int _version = 0;

  /// Emits on every queue mutation so the sync chip + recent list rebuild.
  Stream<int> get changes => _changes.stream;
  bool get isOnline => _online;

  Future<void> init() async {
    if (_box != null) return;
    await Hive.initFlutter();
    _box = await Hive.openBox<Map<dynamic, dynamic>>(_boxName);

    _online = _isOnline(await _connectivity.checkConnectivity());
    _connSub = _connectivity.onConnectivityChanged.listen((results) {
      final wasOnline = _online;
      _online = _isOnline(results);
      if (!wasOnline && _online) unawaited(drain());
    });

    WidgetsBinding.instance.addObserver(_LifecycleObserver(this));
    if (_online && pendingCount > 0) unawaited(drain());
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /// Enqueue (or immediately send) a pour. [body] is a RecordPourInput map
  /// WITHOUT deviceLocalId — we stamp it. Returns whether it went out now.
  Future<bool> record(Map<String, dynamic> body) async {
    final box = _box;
    if (box == null) throw StateError('PourQueue.init() not called');

    final withKey = Map<String, dynamic>.from(body)
      ..putIfAbsent('captureSource', () => 'manual')
      ..putIfAbsent('deviceLocalId', () => _uuid.v4());

    final entry = _PendingPour(
      key: _uuid.v4(),
      nodeId: (withKey['nodeId'] ?? '').toString(),
      bodyJson: jsonEncode(withKey),
      attempts: 0,
      lastError: null,
    );

    if (!_online) {
      await box.put(entry.key, entry.toBox());
      _bump();
      return false;
    }
    try {
      await mpRepo.recordPour(jsonDecode(entry.bodyJson) as Map<String, dynamic>);
      return true;
    } on ApiException catch (e) {
      // A 4xx (bad data / no rate chart / not permitted) will never succeed on
      // retry — surface it so the operator can fix it, instead of silently
      // parking the pour in the queue where it never appears or syncs.
      if (e.statusCode >= 400 && e.statusCode < 500) rethrow;
      await box.put(entry.key, entry.toBox()); // 5xx: transient — queue + retry
      _bump();
      return false;
    } catch (_) {
      // Genuine offline / network failure — queue and retry later.
      await box.put(entry.key, entry.toBox());
      _bump();
      return false;
    }
  }

  /// Queued pours for a node (including failed ones — they still block shift
  /// close and stay visible) — drives optimistic "recent entries".
  List<PendingPour> pendingFor(String nodeId) {
    final box = _box;
    if (box == null) return const [];
    return box.values
        .map((m) => _PendingPour.fromBox(Map<String, dynamic>.from(m)))
        .where((e) => e.nodeId == nodeId)
        .map((e) => e.toPublic())
        .toList();
  }

  /// Entries still eligible to sync (excludes permanently-failed ones).
  int get pendingCount =>
      _box?.values.where((m) => m['failed'] != true).length ?? 0;

  /// Entries the server rejected (4xx) or that exhausted retries — kept for
  /// visibility and shift-close blocking, never retried automatically.
  int get failedCount =>
      _box?.values.where((m) => m['failed'] == true).length ?? 0;

  /// Remove a queued pour (operator chose "replace" on a pending duplicate).
  Future<void> removePending(String key) async {
    await _box?.delete(key);
    _bump();
  }

  /// Drain the queue FIFO. A poison entry (4xx / retries exhausted) is marked
  /// failed and skipped so it can never block entries behind it; a connectivity
  /// error stops the whole drain (the link is down for everyone).
  Future<void> drain() async {
    final box = _box;
    if (box == null || box.isEmpty || _draining || !_online) return;
    _draining = true;
    try {
      for (final key in box.keys.toList()) {
        final raw = box.get(key);
        if (raw == null) continue;
        final entry = _PendingPour.fromBox(Map<String, dynamic>.from(raw));
        if (entry.failed) continue;
        try {
          await mpRepo.recordPour(jsonDecode(entry.bodyJson) as Map<String, dynamic>);
          await box.delete(key);
          _bump();
        } on ApiException catch (e) {
          // Server responded: 4xx never succeeds on retry; a 5xx gets
          // _maxAttempts tries. Either way the next entry still gets its turn.
          final next = entry.withError(e.message);
          final poison =
              (e.statusCode >= 400 && e.statusCode < 500) || next.attempts >= _maxAttempts;
          await box.put(key, poison ? entry.markFailed(e.message).toBox() : next.toBox());
          _bump();
        } catch (e) {
          // Connectivity failure — nothing behind this will succeed either.
          await box.put(key, entry.withError(e.toString()).toBox());
          _bump();
          break;
        }
      }
    } finally {
      _draining = false;
    }
  }

  Future<void> dispose() async {
    await _connSub?.cancel();
    await _box?.close();
    await _changes.close();
  }

  // ── Internals ─────────────────────────────────────────────────────────────
  bool _isOnline(List<ConnectivityResult> r) => r.any((x) => x != ConnectivityResult.none);

  void _bump() {
    _version++;
    if (!_changes.isClosed) _changes.add(_version);
  }
}

/// Public read-only view of a queued pour for optimistic display.
class PendingPour {
  final String key, nodeId, farmerId, shift, milkType, collectionDate;
  final double qtyLitres;
  final bool hasFailed;
  PendingPour({
    required this.key,
    required this.nodeId,
    required this.farmerId,
    required this.shift,
    required this.milkType,
    required this.collectionDate,
    required this.qtyLitres,
    required this.hasFailed,
  });
}

class _PendingPour {
  final String key, nodeId, bodyJson;
  final int attempts;
  final String? lastError;
  // Permanently rejected (4xx) or retries exhausted — skipped by drain().
  final bool failed;
  _PendingPour({
    required this.key,
    required this.nodeId,
    required this.bodyJson,
    required this.attempts,
    required this.lastError,
    this.failed = false,
  });

  factory _PendingPour.fromBox(Map<String, dynamic> m) => _PendingPour(
        key: m['key'] as String,
        nodeId: m['nodeId'] as String,
        bodyJson: m['bodyJson'] as String,
        attempts: (m['attempts'] as int?) ?? 0,
        lastError: m['lastError'] as String?,
        failed: m['failed'] == true, // absent on pre-upgrade rows → false
      );

  Map<String, dynamic> toBox() => {
        'key': key,
        'nodeId': nodeId,
        'bodyJson': bodyJson,
        'attempts': attempts,
        if (lastError != null) 'lastError': lastError,
        if (failed) 'failed': true,
      };

  _PendingPour withError(String e) => _PendingPour(
      key: key, nodeId: nodeId, bodyJson: bodyJson, attempts: attempts + 1, lastError: e);

  _PendingPour markFailed(String e) => _PendingPour(
      key: key, nodeId: nodeId, bodyJson: bodyJson, attempts: attempts + 1,
      lastError: e, failed: true);

  PendingPour toPublic() {
    final body = jsonDecode(bodyJson) as Map<String, dynamic>;
    return PendingPour(
      key: key,
      nodeId: nodeId,
      farmerId: (body['farmerId'] ?? '').toString(),
      shift: (body['shift'] ?? 'am').toString(),
      milkType: (body['milkType'] ?? '').toString(),
      collectionDate: (body['collectionDate'] ?? '').toString(),
      qtyLitres: (body['qtyLitres'] is num) ? (body['qtyLitres'] as num).toDouble() : 0,
      hasFailed: failed,
    );
  }
}

class _LifecycleObserver extends WidgetsBindingObserver {
  _LifecycleObserver(this.queue);
  final PourQueue queue;
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) unawaited(queue.drain());
  }
}
