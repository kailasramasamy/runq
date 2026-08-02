import 'dart:async';
import 'dart:convert';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/widgets.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:uuid/uuid.dart';

import '../api/api_client.dart';

/// Manufacturing Phase 2.5 — offline-tolerant write queue for the WO Run view.
///
/// **Why this exists**
/// Plant-floor wifi flakes. Operators can't lose a consumption or output
/// entry because the network blinked. Every write goes through this queue:
/// if online, it's posted immediately; if offline, it's persisted to a Hive
/// box and drained on the next online transition or app foreground.
///
/// **Scope**
/// Phase 2.5 covers only the two POST endpoints the operator hits during a
/// Run — `POST /wos/:id/consumption` and `POST /wos/:id/output`. Start /
/// complete / close / cancel are supervisor actions; they require live
/// network and surface a snackbar on failure.
///
/// **Replay semantics**
/// Each enqueued entry carries a client-generated `idempotencyKey` (UUIDv4)
/// shipped to the server in the request body. The API has matching unique
/// indexes on `(tenant_id, idempotency_key)` for `wo_consumption` +
/// `wo_output`: a replay after partial success returns the existing row
/// instead of inserting a duplicate. This is the safety net behind
/// "queue-and-replay" — operators can never accidentally double-post.
///
/// **Storage**
/// One Hive box per app install (not per tenant — the entries carry
/// `woId`, which scopes them). Survives app kill / reinstall is not
/// supported (Hive lives in app sandbox); a reinstall loses the queue.
///
/// **Lifecycle**
/// - [init] opens the Hive box and registers the foreground + connectivity
///   listeners. Called from `main.dart` after `Hive.initFlutter()`.
/// - [recordConsumption] / [recordOutput] are the public write APIs.
/// - [pendingFor] returns optimistic-display rows for a given WO so the
///   Run screen can render "Pending sync" placeholders.
/// - [drain] is exposed for manual triggers; auto-fires on transitions.

class WoRunQueue {
  WoRunQueue._();
  static final WoRunQueue instance = WoRunQueue._();

  static const String _boxName = 'mfg_wo_run_queue_v1';
  static const _uuid = Uuid();

  Box<Map<dynamic, dynamic>>? _box;
  final _connectivity = Connectivity();
  StreamSubscription<List<ConnectivityResult>>? _connSub;
  bool _online = true;
  bool _draining = false;

  /// Stream of (woId, version) tuples to let UI rebuild when queue changes.
  /// Bump the version on every mutation; provider listens and re-emits.
  final _changes = StreamController<int>.broadcast();
  int _version = 0;
  Stream<int> get changes => _changes.stream;

  Future<void> init() async {
    if (_box != null) return;
    await Hive.initFlutter();
    _box = await Hive.openBox<Map<dynamic, dynamic>>(_boxName);

    final initial = await _connectivity.checkConnectivity();
    _online = _isOnline(initial);
    _connSub = _connectivity.onConnectivityChanged.listen((results) async {
      final wasOnline = _online;
      _online = _isOnline(results);
      if (!wasOnline && _online) {
        // Transitioned offline → online. Drain in the background.
        unawaited(drain());
      }
    });

    WidgetsBinding.instance.addObserver(_LifecycleObserver(this));

    // Cold-start drain if there's pending work and we're online.
    if (_online && _box!.isNotEmpty) unawaited(drain());
  }

  Future<void> dispose() async {
    await _connSub?.cancel();
    await _box?.close();
    await _changes.close();
  }

  // ── Public write API ────────────────────────────────────────────────────

  Future<EnqueueOutcome> recordConsumption({
    required String woId,
    required Map<String, dynamic> body,
  }) =>
      _enqueueOrSend(woId: woId, kind: PendingKind.consumption, body: body);

  Future<EnqueueOutcome> recordOutput({
    required String woId,
    required Map<String, dynamic> body,
  }) =>
      _enqueueOrSend(woId: woId, kind: PendingKind.output, body: body);

  /// Unplanned production entry — no `woId` exists yet (the server creates
  /// one on post), so entries are keyed on the sentinel [_productionWoId]
  /// and surfaced separately via [pendingProduction].
  ///
  /// Unlike [recordConsumption] / [recordOutput], the caller needs the
  /// server's response (the created WO number + output batch) to confirm
  /// the run to the operator — so this mirrors `_enqueueOrSend`'s
  /// online/offline + idempotency-key handling but returns the decoded
  /// response body on an immediate send instead of discarding it.
  Future<ProductionPostResult> recordProduction({
    required Map<String, dynamic> body,
  }) async {
    if (_box == null) {
      throw StateError('WoRunQueue.init() not called');
    }
    final bodyWithKey = Map<String, dynamic>.from(body);
    bodyWithKey['idempotencyKey'] ??= _uuid.v4();

    final entry = PendingEntry(
      key: _uuid.v4(),
      woId: _productionWoId,
      kind: PendingKind.production,
      bodyJson: jsonEncode(bodyWithKey),
      createdAt: DateTime.now().toIso8601String(),
      attempts: 0,
      lastError: null,
    );

    if (!_online) {
      await _box!.put(entry.key, entry.toBox());
      _bump();
      return ProductionPostResult(outcome: EnqueueOutcome.queued);
    }

    try {
      final res = await apiClient.post('/manufacturing/production', bodyWithKey);
      return ProductionPostResult(
        outcome: EnqueueOutcome.sent,
        response: (res as Map).cast<String, dynamic>(),
      );
    } catch (_) {
      await _box!.put(entry.key, entry.toBox());
      _bump();
      return ProductionPostResult(outcome: EnqueueOutcome.queued);
    }
  }

  /// Read-only view of pending entries for a WO. Drives optimistic display.
  List<PendingEntry> pendingFor(String woId) {
    if (_box == null) return const [];
    return _box!.values
        .map(PendingEntry.fromBox)
        .where((e) => e.woId == woId)
        .toList();
  }

  /// Read-only view of pending Record Production posts (not tied to a WO).
  List<PendingEntry> pendingProduction() {
    if (_box == null) return const [];
    return _box!.values
        .map(PendingEntry.fromBox)
        .where((e) => e.kind == PendingKind.production)
        .toList();
  }

  /// Manual drain trigger (exposed for "tap to retry" affordances).
  Future<void> drain() async {
    if (_box == null || _box!.isEmpty || _draining) return;
    if (!_online) return;
    _draining = true;
    try {
      // FIFO order. Snapshot keys up-front so the iteration is stable
      // even as we delete successful entries.
      final keys = _box!.keys.toList();
      for (final key in keys) {
        final raw = _box!.get(key);
        if (raw == null) continue;
        final entry = PendingEntry.fromBox(Map<String, dynamic>.from(raw));
        try {
          await _send(entry);
          await _box!.delete(key);
          _bump();
        } catch (e) {
          // Persistent failure (server 4xx/5xx, etc) — bump attempt count
          // and stop draining. Operator will see the "failed" badge and can
          // tap to retry. We don't auto-backoff in v1.
          final updated = entry.copyIncrementAttempts(error: e.toString());
          await _box!.put(key, updated.toBox());
          _bump();
          break;
        }
      }
    } finally {
      _draining = false;
    }
  }

  // ── Internals ───────────────────────────────────────────────────────────

  Future<EnqueueOutcome> _enqueueOrSend({
    required String woId,
    required PendingKind kind,
    required Map<String, dynamic> body,
  }) async {
    if (_box == null) {
      throw StateError('WoRunQueue.init() not called');
    }
    // Stamp an idempotency key if the caller didn't supply one. Same key is
    // reused on every retry — server dedupes.
    final bodyWithKey = Map<String, dynamic>.from(body);
    bodyWithKey['idempotencyKey'] ??= _uuid.v4();

    final entry = PendingEntry(
      key: _uuid.v4(),
      woId: woId,
      kind: kind,
      bodyJson: jsonEncode(bodyWithKey),
      createdAt: DateTime.now().toIso8601String(),
      attempts: 0,
      lastError: null,
    );

    if (!_online) {
      await _box!.put(entry.key, entry.toBox());
      _bump();
      return EnqueueOutcome.queued;
    }

    // Online: try immediate send. On failure, fall back to queue.
    try {
      await _send(entry);
      return EnqueueOutcome.sent;
    } catch (_) {
      await _box!.put(entry.key, entry.toBox());
      _bump();
      // Caller still surfaces a soft warning; row is recoverable.
      return EnqueueOutcome.queued;
    }
  }

  Future<void> _send(PendingEntry entry) async {
    final path = switch (entry.kind) {
      PendingKind.consumption => '/manufacturing/wos/${entry.woId}/consumption',
      PendingKind.output => '/manufacturing/wos/${entry.woId}/output',
      PendingKind.production => '/manufacturing/production',
    };
    final body = jsonDecode(entry.bodyJson) as Map<String, dynamic>;
    await apiClient.post(path, body);
  }

  bool _isOnline(List<ConnectivityResult> r) =>
      r.any((x) => x != ConnectivityResult.none);

  void _bump() {
    _version++;
    if (!_changes.isClosed) _changes.add(_version);
  }
}

/// The write endpoints the queue handles: the two per-WO Run posts, plus
/// unplanned production (which has no WO yet — the server creates one).
enum PendingKind { consumption, output, production }

/// Sentinel `woId` for queued production entries — there's no WO until the
/// post lands, so [pendingFor] (which is WO-scoped) never picks these up;
/// [pendingProduction] does.
const _productionWoId = '__production__';

enum EnqueueOutcome { sent, queued }

/// Result of [WoRunQueue.recordProduction] — carries the decoded response
/// body (`{ data, warnings }`) when the post landed live so the caller can
/// confirm the created WO to the operator.
class ProductionPostResult {
  final EnqueueOutcome outcome;
  final Map<String, dynamic>? response;
  ProductionPostResult({required this.outcome, this.response});
}

class PendingEntry {
  final String key;
  final String woId;
  final PendingKind kind;
  final String bodyJson;
  final String createdAt;
  final int attempts;
  final String? lastError;

  PendingEntry({
    required this.key,
    required this.woId,
    required this.kind,
    required this.bodyJson,
    required this.createdAt,
    required this.attempts,
    required this.lastError,
  });

  bool get isConsumption => kind == PendingKind.consumption;
  bool get isOutput => kind == PendingKind.output;
  bool get isProduction => kind == PendingKind.production;
  bool get hasFailed => attempts > 0 && lastError != null;

  Map<String, dynamic> get body =>
      jsonDecode(bodyJson) as Map<String, dynamic>;

  factory PendingEntry.fromBox(Map<dynamic, dynamic> m) => PendingEntry(
        key: m['key'] as String,
        woId: m['woId'] as String,
        kind: switch (m['kind'] as String) {
          'output' => PendingKind.output,
          'production' => PendingKind.production,
          _ => PendingKind.consumption,
        },
        bodyJson: m['bodyJson'] as String,
        createdAt: m['createdAt'] as String,
        attempts: (m['attempts'] as int?) ?? 0,
        lastError: m['lastError'] as String?,
      );

  Map<String, dynamic> toBox() => {
        'key': key,
        'woId': woId,
        'kind': switch (kind) {
          PendingKind.consumption => 'consumption',
          PendingKind.output => 'output',
          PendingKind.production => 'production',
        },
        'bodyJson': bodyJson,
        'createdAt': createdAt,
        'attempts': attempts,
        if (lastError != null) 'lastError': lastError,
      };

  PendingEntry copyIncrementAttempts({required String error}) => PendingEntry(
        key: key,
        woId: woId,
        kind: kind,
        bodyJson: bodyJson,
        createdAt: createdAt,
        attempts: attempts + 1,
        lastError: error,
      );
}

class _LifecycleObserver extends WidgetsBindingObserver {
  final WoRunQueue queue;
  _LifecycleObserver(this.queue);

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      unawaited(queue.drain());
    }
  }
}
