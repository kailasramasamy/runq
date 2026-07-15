import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/mp_models.dart';
import '../l10n/app_localizations.dart';
import '../l10n/l10n_helpers.dart';
import '../providers/mp_context_provider.dart';
import '../providers/sync_provider.dart';
import '../services/pour_queue.dart';
import '../theme/dhenu_theme.dart';
import '../theme/dhenu_tokens.dart';
import '../utils/format.dart';
import 'sheet_grabber.dart';

/// Inspection sheet for the on-device pour queue (opened from the sync chip):
/// what's waiting, what failed and why, with per-entry retry/delete and a
/// sync-now action. Failed entries never auto-retry — this is their only exit.
Future<void> showSyncQueueSheet(BuildContext context, WidgetRef ref, String nodeId) {
  final t = DT(context);
  final farmers = ref.read(nodeFarmersProvider(nodeId)).asData?.value ?? const <MpFarmer>[];
  final byId = {for (final f in farmers) f.id: f};
  return showModalBottomSheet<void>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (ctx) => Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(DhenuRadii.sheet)),
      ),
      child: SafeArea(
        child: StreamBuilder<int>(
          stream: PourQueue.instance.changes,
          builder: (ctx, _) => _SheetBody(
            nodeId: nodeId,
            farmersById: byId,
            onSyncNow: () => ref.read(syncProvider.notifier).forceSync(),
          ),
        ),
      ),
    ),
  );
}

class _SheetBody extends StatelessWidget {
  const _SheetBody({required this.nodeId, required this.farmersById, required this.onSyncNow});
  final String nodeId;
  final Map<String, MpFarmer> farmersById;
  final VoidCallback onSyncNow;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final all = PourQueue.instance.pendingFor(nodeId);
    final pending = all.where((p) => !p.hasFailed).toList();
    final failed = all.where((p) => p.hasFailed).toList();
    return Column(mainAxisSize: MainAxisSize.min, children: [
      const SheetGrabber(),
      Padding(
        padding: const EdgeInsets.fromLTRB(
            DhenuSpacing.lg, 0, DhenuSpacing.lg, DhenuSpacing.lg),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(l.syncSheetTitle, style: DhenuText.title.copyWith(color: t.ink)),
          const SizedBox(height: DhenuSpacing.xs),
          Text(
            all.isEmpty
                ? l.syncSheetAllClear
                : l.syncSheetCounts(pending.length, failed.length),
            style: DhenuText.caption.copyWith(color: t.inkSoft),
          ),
          if (all.isNotEmpty) ...[
            const SizedBox(height: DhenuSpacing.md),
            ConstrainedBox(
              constraints: BoxConstraints(
                  maxHeight: MediaQuery.of(context).size.height * 0.5),
              child: ListView(
                shrinkWrap: true,
                children: [
                  for (final p in [...pending, ...failed]) _entry(context, t, l, p),
                ],
              ),
            ),
          ],
          const SizedBox(height: DhenuSpacing.lg),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: pending.isEmpty ? null : onSyncNow,
              child: Text(l.syncSyncNow),
            ),
          ),
        ]),
      ),
    ]);
  }

  Widget _entry(BuildContext context, DhenuTokens t, AppLocalizations l, PendingPour p) {
    final farmer = farmersById[p.farmerId];
    final name = farmer != null ? farmerName(context, farmer) : '—';
    final color = p.hasFailed ? t.gradeC : t.gradeB;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: DhenuSpacing.sm),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(name, style: DhenuText.body.copyWith(color: t.ink)),
              Text(
                '${prettyDate(p.collectionDate)} · ${p.shift.toUpperCase()} · ${litres(p.qtyLitres, unit: true)}',
                style: DhenuText.caption.copyWith(color: t.inkSoft),
              ),
            ]),
          ),
          Text(
            p.hasFailed ? l.pendingFailedPill : l.pendingSavingPill,
            style: DhenuText.caption.copyWith(color: color, fontWeight: FontWeight.w700),
          ),
        ]),
        if (p.hasFailed) ...[
          if (p.lastError != null)
            Padding(
              padding: const EdgeInsets.only(top: DhenuSpacing.xs),
              child: Text(p.lastError!,
                  style: DhenuText.caption.copyWith(color: t.gradeC)),
            ),
          Row(children: [
            TextButton(
              onPressed: () => PourQueue.instance.retryFailed(p.key),
              child: Text(l.syncRetry, style: DhenuText.label.copyWith(color: t.brand)),
            ),
            TextButton(
              onPressed: () => _confirmDelete(context, l, p),
              child: Text(l.syncDelete, style: DhenuText.label.copyWith(color: t.gradeC)),
            ),
          ]),
        ],
        Divider(height: 1, thickness: 1, color: t.hairline),
      ]),
    );
  }

  Future<void> _confirmDelete(BuildContext context, AppLocalizations l, PendingPour p) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l.syncDeleteConfirmTitle),
        content: Text(l.syncDeleteConfirmBody),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(l.commonCancel)),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(l.syncDelete)),
        ],
      ),
    );
    if (ok == true) await PourQueue.instance.removePending(p.key);
  }
}
