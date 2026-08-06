import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/mp_models.dart';
import '../l10n/app_localizations.dart';
import '../providers/transfer_providers.dart';
import '../screens/shared/pending_work.dart';
import '../theme/dhenu_icons.dart';
import '../theme/dhenu_theme.dart';
import '../theme/dhenu_tokens.dart';
import '../utils/format.dart';

/// Home banner for milk that is stuck — at a VMCC or a CC alike.
///
/// Two distinct backlogs, because they need two different actions:
///  * **to close** — a past slot still holding milk whose collection was never
///    closed. Dispatch is hard-gated until it is, so this is the blocking one.
///  * **to dispatch** — closed, unblocked, and simply never sent onward.
///
/// Renders nothing when both are clear, so it can sit unconditionally at the top
/// of a home page. That silence is the point: the TO DISPATCH / READY stat next
/// to it counts today's milk and says nothing about a shift left open last week.
class PendingDispatchAlert extends ConsumerWidget {
  const PendingDispatchAlert({super.key, required this.nodeId, required this.onOpenSlot});

  final String nodeId;

  /// Opens one slot for action. The destination differs by persona and kind — a
  /// VMCC closes on Record Collection, a CC on its dispatch screen — so the
  /// caller supplies it rather than this widget knowing every shell's layout.
  final Future<void> Function(BuildContext context, MpPendingDispatch slot, PendingWorkKind kind)
      onOpenSlot;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final owed = ref.watch(pendingDispatchProvider(nodeId)).valueOrNull ?? const <MpPendingDispatch>[];
    if (owed.isEmpty) return const SizedBox.shrink();

    final toClose = owed.where((s) => !s.closed).toList();
    final toDispatch = owed.where((s) => s.closed).toList();

    return Padding(
      padding: const EdgeInsets.only(bottom: DhenuSpacing.md),
      child: Column(children: [
        // Closes first: nothing behind them can move until they're done.
        if (toClose.isNotEmpty)
          _row(context, t, l,
              icon: DhenuIcons.warning,
              title: l.dispatchPendingCloseTitle(toClose.length),
              oldest: toClose.first,
              onTap: () => _openList(context, PendingWorkKind.toClose)),
        if (toClose.isNotEmpty && toDispatch.isNotEmpty)
          const SizedBox(height: DhenuSpacing.sm),
        if (toDispatch.isNotEmpty)
          _row(context, t, l,
              icon: DhenuIcons.truck,
              title: l.dispatchPendingTitle(toDispatch.length),
              oldest: toDispatch.first,
              onTap: () => _openList(context, PendingWorkKind.toDispatch)),
      ]),
    );
  }

  /// The row names the oldest slot but a node can be a dozen behind, so the tap
  /// opens the full list rather than guessing which one the operator meant.
  void _openList(BuildContext context, PendingWorkKind kind) {
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => PendingWorkScreen(
        nodeId: nodeId,
        kind: kind,
        onOpenSlot: (ctx, slot) => onOpenSlot(ctx, slot, kind),
      ),
    ));
  }

  Widget _row(
    BuildContext context,
    DhenuTokens t,
    AppLocalizations l, {
    required IconData icon,
    required String title,
    required MpPendingDispatch oldest,
    required VoidCallback onTap,
  }) {
    return Material(
      color: t.am.withValues(alpha: 0.12),
      borderRadius: BorderRadius.circular(DhenuRadii.input),
      child: InkWell(
        borderRadius: BorderRadius.circular(DhenuRadii.input),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(DhenuSpacing.md),
          child: Row(children: [
            Icon(icon, size: 20, color: t.am),
            const SizedBox(width: DhenuSpacing.md),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: DhenuText.body.copyWith(color: t.ink, fontWeight: FontWeight.w700)),
              const SizedBox(height: 2),
              Text(
                l.dispatchPendingOldest(_slotLabel(l, oldest), litres(oldest.available, unit: true)),
                style: DhenuText.caption.copyWith(color: t.inkSoft),
              ),
            ])),
            Icon(DhenuIcons.chevronRight, size: 18, color: t.inkSoft),
          ]),
        ),
      ),
    );
  }

  /// "PM · 4 Aug" at a per-shift node; a pooled node dispatches its whole window
  /// as one tanker, so its slot is the date alone.
  String _slotLabel(AppLocalizations l, MpPendingDispatch s) {
    final date = shortDate(s.collectionDate);
    if (s.shift == null) return date;
    return '${s.shift == 'am' ? l.shiftAm : l.shiftPm} · $date';
  }
}
