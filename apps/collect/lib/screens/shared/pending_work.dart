import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/transfer_providers.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_states.dart';

/// Which backlog a [PendingWorkScreen] lists.
enum PendingWorkKind {
  /// Past slots still holding milk whose collection was never closed. Dispatch
  /// is hard-gated on the close, so these block everything behind them.
  toClose,

  /// Closed, unblocked, simply never sent onward.
  toDispatch,
}

/// Every slot of stuck milk at a node, oldest first — one row per slot, tapping
/// one opens the screen that clears it, on that slot's own date.
///
/// This exists because the home alert can only name the oldest slot, and a node
/// can be a dozen slots behind. Guessing a single destination from a single tap
/// (as an auto-jump would) is worse than useless when the operator wants the
/// third one down: it silently takes them somewhere they didn't ask for.
class PendingWorkScreen extends ConsumerWidget {
  const PendingWorkScreen({
    super.key,
    required this.nodeId,
    required this.kind,
    required this.onOpenSlot,
  });

  final String nodeId;
  final PendingWorkKind kind;

  /// Opens the slot for action. The destination differs by persona and by kind —
  /// a VMCC closes on Record Collection, a CC on its dispatch screen — so the
  /// caller supplies it rather than this screen knowing every shell's layout.
  final Future<void> Function(BuildContext context, MpPendingDispatch slot) onOpenSlot;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final async = ref.watch(pendingDispatchProvider(nodeId));
    final title = kind == PendingWorkKind.toClose
        ? l.pendingWorkCloseScreenTitle
        : l.pendingWorkDispatchScreenTitle;

    return Scaffold(
      backgroundColor: t.surface,
      appBar: AppBar(title: Text(title, style: DhenuText.h2.copyWith(color: t.ink))),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(pendingDispatchProvider(nodeId));
          await ref.read(pendingDispatchProvider(nodeId).future);
        },
        child: async.when(
          loading: () => const DhenuLoadingList(),
          error: (e, _) => DhenuEmptyState(
            icon: DhenuIcons.cloudOff,
            title: l.pendingWorkEmpty,
            subtitle: '$e',
          ),
          data: (all) {
            final rows = all
                .where((s) => kind == PendingWorkKind.toClose ? !s.closed : s.closed)
                .toList();
            if (rows.isEmpty) {
              return ListView(children: [
                const SizedBox(height: DhenuSpacing.x4),
                DhenuEmptyState(
                  icon: DhenuIcons.checkCircle,
                  title: l.pendingWorkEmpty,
                  subtitle: l.pendingWorkEmptySubtitle,
                ),
              ]);
            }
            return ListView.separated(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: const EdgeInsets.fromLTRB(DhenuSpacing.screen, DhenuSpacing.md,
                  DhenuSpacing.screen, DhenuSpacing.bottomGap),
              itemCount: rows.length,
              separatorBuilder: (_, _) => const SizedBox(height: DhenuSpacing.sm),
              itemBuilder: (_, i) => _row(context, ref, t, l, rows[i]),
            );
          },
        ),
      ),
    );
  }

  Widget _row(BuildContext context, WidgetRef ref, DhenuTokens t, AppLocalizations l,
      MpPendingDispatch s) {
    final stale = _daysAgo(s.collectionDate);
    return DhenuCard(
      onTap: () async {
        await onOpenSlot(context, s);
        // The slot may be gone now; the list has to reflect that on return.
        ref.invalidate(pendingDispatchProvider(nodeId));
      },
      child: Row(children: [
        Icon(kind == PendingWorkKind.toClose ? DhenuIcons.warning : DhenuIcons.truck,
            size: 20, color: t.am),
        const SizedBox(width: DhenuSpacing.md),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(_slotLabel(l, s),
              style: DhenuText.body.copyWith(color: t.ink, fontWeight: FontWeight.w600)),
          const SizedBox(height: 2),
          // Age, not just the date: six weeks stale and two days stale read the
          // same on a calendar but mean very different things at a plant.
          Text(l.pendingWorkDaysAgo(stale), style: DhenuText.caption.copyWith(color: t.inkSoft)),
        ])),
        const SizedBox(width: DhenuSpacing.sm),
        Text(litres(s.available, unit: true), style: DhenuText.number(size: 16, color: t.ink)),
        const SizedBox(width: DhenuSpacing.xs),
        Icon(DhenuIcons.chevronRight, size: 18, color: t.inkSoft),
      ]),
    );
  }

  /// "PM · 4 Aug 2026" at a per-shift node; a pooled node dispatches its whole
  /// window as one tanker, so its slot is the date alone.
  String _slotLabel(AppLocalizations l, MpPendingDispatch s) {
    final date = prettyDate(s.collectionDate);
    if (s.shift == null) return date;
    return '${s.shift == 'am' ? l.shiftAm : l.shiftPm} · $date';
  }

  int _daysAgo(String iso) {
    final d = DateTime.tryParse(iso);
    if (d == null) return 0;
    final now = DateTime.now();
    return DateTime(now.year, now.month, now.day).difference(d).inDays;
  }
}

/// Compact count banner for the dispatch screen — the number the nav dot
/// deliberately withholds, shown where there is room to say what it counts and
/// a list to open. Renders nothing when the backlog is clear.
class PendingWorkBanner extends ConsumerWidget {
  const PendingWorkBanner({
    super.key,
    required this.nodeId,
    required this.kind,
    required this.onOpenSlot,
  });

  final String nodeId;
  final PendingWorkKind kind;
  final Future<void> Function(BuildContext context, MpPendingDispatch slot) onOpenSlot;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final all = ref.watch(pendingDispatchProvider(nodeId)).valueOrNull ?? const <MpPendingDispatch>[];
    final rows = all.where((s) => kind == PendingWorkKind.toClose ? !s.closed : s.closed).toList();
    if (rows.isEmpty) return const SizedBox.shrink();

    final title = kind == PendingWorkKind.toClose
        ? l.dispatchPendingCloseTitle(rows.length)
        : l.dispatchPendingTitle(rows.length);

    return Padding(
      padding: const EdgeInsets.only(bottom: DhenuSpacing.md),
      child: Material(
        color: t.am.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(DhenuRadii.input),
        child: InkWell(
          borderRadius: BorderRadius.circular(DhenuRadii.input),
          onTap: () => Navigator.of(context).push(MaterialPageRoute(
            builder: (_) => PendingWorkScreen(nodeId: nodeId, kind: kind, onOpenSlot: onOpenSlot),
          )),
          child: Padding(
            padding: const EdgeInsets.all(DhenuSpacing.md),
            child: Row(children: [
              Icon(kind == PendingWorkKind.toClose ? DhenuIcons.warning : DhenuIcons.truck,
                  size: 18, color: t.am),
              const SizedBox(width: DhenuSpacing.md),
              Expanded(child: Text(title,
                  style: DhenuText.body.copyWith(color: t.ink, fontWeight: FontWeight.w600))),
              Icon(DhenuIcons.chevronRight, size: 18, color: t.inkSoft),
            ]),
          ),
        ),
      ),
    );
  }
}
