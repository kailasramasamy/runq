import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/pour_queue.dart';
import '../widgets/sync_status.dart';

class SyncSnapshot {
  final SyncState state;
  final int pendingCount;
  final int failedCount;
  const SyncSnapshot(this.state, this.pendingCount, [this.failedCount = 0]);
}

/// Live view of the pour queue for the header SyncStatus chip. Recomputes on
/// every queue mutation (enqueue / send / drain).
class SyncController extends StateNotifier<SyncSnapshot> {
  SyncController() : super(_read()) {
    _sub = PourQueue.instance.changes.listen((_) => state = _read());
  }
  late final StreamSubscription<int> _sub;

  static SyncSnapshot _read() {
    final q = PourQueue.instance;
    final pending = q.pendingCount;
    final failed = q.failedCount;
    if (!q.isOnline) return SyncSnapshot(SyncState.offline, pending, failed);
    if (failed > 0) return SyncSnapshot(SyncState.failed, pending, failed);
    if (pending > 0) return SyncSnapshot(SyncState.pending, pending, failed);
    return const SyncSnapshot(SyncState.synced, 0);
  }

  Future<void> forceSync() => PourQueue.instance.drain();

  @override
  void dispose() {
    _sub.cancel();
    super.dispose();
  }
}

final syncProvider = StateNotifierProvider<SyncController, SyncSnapshot>((ref) => SyncController());
