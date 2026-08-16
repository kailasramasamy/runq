import 'package:flutter/material.dart';
import '../../theme/dhenu_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/mp_context_provider.dart';
import '../../providers/sync_provider.dart';
import '../../providers/transfer_providers.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/notification_bell.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_states.dart';
import '../../services/pour_queue.dart';
import '../../widgets/pending_pours_strip.dart';
import '../../widgets/pour_detail_sheet.dart';
import '../../widgets/sync_queue_sheet.dart';
import '../../widgets/primary_action.dart';
import '../../widgets/shift_grouped_pours.dart';
import '../../widgets/sync_status.dart';
import '../../widgets/pending_dispatch_alert.dart';
import '../shared/pending_work.dart';
import '../../utils/friendly_error.dart';
import 'record_collection.dart';
import 'vmcc_dispatch_tab.dart';
import 'vmcc_collection_history.dart';
import 'vmcc_farmers_tab.dart';
import 'vmcc_reports_tab.dart';
import 'vmcc_shift_hero.dart';

/// VMCC operator home tab — the capture-centric dashboard (spec §5.2). Rendered
/// as the Home tab inside [VmccShell]; the capture action is the bottom-nav ➕.
class VmccHome extends ConsumerWidget {
  const VmccHome({super.key, required this.node});
  final MpNode node;

  Future<void> _refresh(WidgetRef ref) async {
    ref.invalidate(nodeTodaySummaryProvider(node.id));
    ref.invalidate(nodeTodayPoursProvider(node.id));
    ref.invalidate(nodeOutboundConsignmentsProvider(node.id));
    ref.invalidate(shiftStatusProvider(node.id));
    ref.invalidate(pendingDispatchProvider(node.id));
    await Future.wait([
      ref.read(nodeTodaySummaryProvider(node.id).future),
      ref.read(nodeTodayPoursProvider(node.id).future),
    ]);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final sync = ref.watch(syncProvider);
    final summary = ref.watch(nodeTodaySummaryProvider(node.id));
    final bands = ref.watch(qualityBandsProvider(node.id)).valueOrNull;
    return RefreshIndicator(
      onRefresh: () => _refresh(ref),
      child: ListView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.fromLTRB(
            DhenuSpacing.screen, DhenuSpacing.md, DhenuSpacing.screen, DhenuSpacing.x4),
        children: [
          _header(context, ref, t, l, sync),
          ..._unclosedShiftNudge(context, ref, t, l, summary.asData?.value),
          const SizedBox(height: DhenuSpacing.lg),
          PendingDispatchAlert(nodeId: node.id, onOpenSlot: _openSlot),
          summary.when(
            loading: () => const DhenuLoadingList(rows: 2),
            error: (e, _) => DhenuCard(
                child: Text(friendlyError(context, e),
                    style: DhenuText.caption.copyWith(color: t.gradeC))),
            data: (s) => VmccShiftHero(node: node, summary: s, bands: bands),
          ),
          const SizedBox(height: DhenuSpacing.lg),
          _primaryAction(context, ref, t, l),
          const SizedBox(height: DhenuSpacing.lg),
          _quickLinks(context, t, l),
          const SizedBox(height: DhenuSpacing.xl),
          Text(l.homeRecentEntries, style: DhenuText.title.copyWith(color: t.ink)),
          const SizedBox(height: DhenuSpacing.sm),
          _recent(context, t, l, ref),
          const SizedBox(height: DhenuSpacing.xl),
          _historyLink(context, t, l),
        ],
      ),
    );
  }

  /// Open the screen that clears one stuck slot, on that slot's own date. A
  /// VMCC closes on Record Collection but dispatches on the dispatch screen, so
  /// the two kinds land in different places.
  Future<void> _openSlot(BuildContext context, MpPendingDispatch slot, PendingWorkKind kind) async {
    final l = AppLocalizations.of(context);
    final shift = slot.shift == null ? null : shiftFrom(slot.shift!);
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (ctx) => kind == PendingWorkKind.toClose
          ? RecordCollectionScreen(node: node, initialDate: slot.collectionDate, initialShift: shift)
          : Scaffold(
              appBar: AppBar(
                  title: Text(l.dispatchTitle, style: DhenuText.h2.copyWith(color: DT(ctx).ink))),
              body: VmccDispatchTab(
                node: node,
                initialDate: slot.collectionDate,
                // A pooled VMCC sends its whole window as one tanker; a shift
                // would name a slot it can't draw against.
                initialShift: node.isPooledDispatch ? null : shift,
              ),
            ),
    ));
  }

  Widget _quickLinks(BuildContext context, DhenuTokens t, AppLocalizations l) => Row(children: [
        Expanded(child: _linkCard(context, t, DhenuIcons.users, l.homeFarmers,
            VmccFarmersTab(node: node))),
        const SizedBox(width: DhenuSpacing.md),
        Expanded(child: _linkCard(context, t, DhenuIcons.history, l.homeHistory,
            VmccCollectionHistory(node: node))),
        const SizedBox(width: DhenuSpacing.md),
        Expanded(child: _linkCard(context, t, DhenuIcons.barChart, l.homeReports,
            VmccReportsTab(node: node))),
      ]);

  Widget _linkCard(BuildContext context, DhenuTokens t, IconData icon, String label, Widget page) =>
      DhenuCard(
        padding: const EdgeInsets.symmetric(
            horizontal: DhenuSpacing.sm, vertical: DhenuSpacing.lg),
        onTap: () => Navigator.of(context).push(MaterialPageRoute(
          builder: (_) => Scaffold(
            appBar: AppBar(title: Text(label, style: DhenuText.h2.copyWith(color: t.ink))),
            body: page,
          ),
        )),
        child: Column(children: [
          Icon(icon, color: t.brand),
          const SizedBox(height: DhenuSpacing.sm),
          Text(label, style: DhenuText.label.copyWith(color: t.ink)),
        ]),
      );

  /// Two lines rather than one: the sync pill is as wide as a centre's name, so
  /// sharing a row squeezed the title into a wrap that read as two centres. The
  /// name now gets the width it needs, and the pill drops to the status line
  /// where it belongs — both rows are then one idea each.
  Widget _header(BuildContext context, WidgetRef ref, DhenuTokens t, AppLocalizations l, SyncSnapshot sync) =>
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(
            child: Text(node.name,
                style: DhenuText.h2.copyWith(color: t.ink),
                maxLines: 1, overflow: TextOverflow.ellipsis),
          ),
          const SizedBox(width: DhenuSpacing.sm),
          const NotificationBell(),
        ]),
        const SizedBox(height: DhenuSpacing.xs),
        Row(children: [
          Expanded(
            child: Text(
              shiftFrom(currentShift()) == Shift.am ? l.homeAmShiftInProgress : l.homePmShiftInProgress,
              style: DhenuText.caption.copyWith(color: t.inkSoft),
              maxLines: 1, overflow: TextOverflow.ellipsis,
            ),
          ),
          const SizedBox(width: DhenuSpacing.sm),
          SyncStatus(
            state: sync.state,
            pendingCount: sync.pendingCount,
            failedCount: sync.failedCount,
            agoLabel: l.homeJustNow,
            onTap: () => showSyncQueueSheet(context, ref, node.id),
          ),
        ]),
      ]);

  /// Recording is the headline action only while the slot is open. Once it's
  /// closed, offering "Record collection" leads to a screen with no form on it,
  /// so the slot's next step — dispatch — takes the button instead. Recording
  /// stays reachable underneath for back-dating or reopening.
  ///
  /// With the slot closed AND nothing left undispatched, dispatch would open a
  /// screen with no milk to send, so recording takes the button back — it is
  /// the only thing still worth doing (a back-date, or reopening the slot).
  Widget _primaryAction(BuildContext context, WidgetRef ref, DhenuTokens t, AppLocalizations l) {
    final status = ref.watch(shiftStatusProvider(node.id)).asData?.value;
    final shift = shiftFrom(currentShift());
    final closed = status != null &&
        (node.isPooledDispatch ? status.dayClosed : status.closedFor(shift.name));
    void openRecord() => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => RecordCollectionScreen(node: node)),
        );
    if (!closed) {
      return PrimaryAction(label: l.recordCollectionTitle, onPressed: openRecord);
    }
    // Null while the slots are still loading — treat that as "maybe", so the
    // button doesn't flash in and out on every home-screen open.
    final pending = ref.watch(pendingDispatchProvider(node.id)).valueOrNull;
    final dispatchable = pending == null ||
        pending.any((s) => s.closed && s.available > 0);
    if (!dispatchable) {
      return PrimaryAction(label: l.recordCollectionTitle, onPressed: openRecord);
    }
    return Column(children: [
      PrimaryAction(
        label: l.collectDispatchNow,
        icon: DhenuIcons.transit,
        onPressed: () => Navigator.of(context).push(MaterialPageRoute(
          builder: (_) => Scaffold(
            appBar: AppBar(title: Text(l.dispatchTitle, style: DhenuText.h2.copyWith(color: t.ink))),
            body: VmccDispatchTab(
              node: node,
              initialShift: node.isPooledDispatch ? null : shift,
            ),
          ),
        )),
      ),
      TextButton(
        onPressed: openRecord,
        child: Text(l.recordCollectionTitle, style: DhenuText.label.copyWith(color: t.brand)),
      ),
    ]);
  }

  /// End-of-shift reminder (audit E8): closing is what unlocks dispatch, but
  /// nothing used to nag an operator who walked away with an open shift. Shows
  /// once the shift has milk and its window has passed: AM stays nudged all
  /// afternoon; PM nudges in the evening (20:00+).
  List<Widget> _unclosedShiftNudge(BuildContext context, WidgetRef ref, DhenuTokens t,
      AppLocalizations l, MpCollectionSummary? s) {
    if (s == null) return const [];
    final status = ref.watch(shiftStatusProvider(node.id)).asData?.value;
    if (status == null) return const [];
    final now = DateTime.now();
    final isPmWindow = shiftFrom(currentShift()) == Shift.pm;
    final String? shiftLabel;
    if (isPmWindow && !status.am && s.amQty > 0.05) {
      shiftLabel = l.shiftAm;
    } else if (now.hour >= 20 && !status.pm && s.pmQty > 0.05) {
      shiftLabel = l.shiftPm;
    } else {
      return const [];
    }
    return [
      const SizedBox(height: DhenuSpacing.md),
      DhenuCard(
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => RecordCollectionScreen(node: node)),
        ),
        child: Row(children: [
          Icon(DhenuIcons.warning, size: 18, color: t.gradeB),
          const SizedBox(width: DhenuSpacing.md),
          Expanded(
            child: Text(
              l.homeCloseShiftNudge(shiftLabel),
              style: DhenuText.body.copyWith(color: t.ink),
            ),
          ),
          Icon(DhenuIcons.chevronRight, size: 18, color: t.inkSoft),
        ]),
      ),
    ];
  }

  /// Full-width tappable row into the collection history screen.
  Widget _historyLink(BuildContext context, DhenuTokens t, AppLocalizations l) => DhenuCard(
        onTap: () => Navigator.of(context).push(MaterialPageRoute(
          builder: (_) => Scaffold(
            appBar: AppBar(title: Text(l.homeHistory, style: DhenuText.h2.copyWith(color: t.ink))),
            body: VmccCollectionHistory(node: node),
          ),
        )),
        child: Row(children: [
          Icon(DhenuIcons.history, color: t.brand, size: 20),
          const SizedBox(width: DhenuSpacing.md),
          Expanded(
            child: Text(l.homeSeeFullHistory, style: DhenuText.label.copyWith(color: t.ink)),
          ),
          Icon(DhenuIcons.chevronRight, color: t.inkSoft, size: 20),
        ]),
      );

  Widget _recent(BuildContext context, DhenuTokens t, AppLocalizations l, WidgetRef ref) {
    final poursAsync = ref.watch(nodeTodayPoursProvider(node.id));
    final farmers = ref.watch(nodeFarmersProvider(node.id)).asData?.value ?? const <MpFarmer>[];
    final byId = {for (final f in farmers) f.id: f};
    // StreamBuilder (not a stateful conversion): queue mutations re-read the
    // pending list so offline saves appear here the moment they're captured.
    return StreamBuilder<int>(
      stream: PourQueue.instance.changes,
      builder: (context, _) {
        final today = todayIso();
        final pending = PourQueue.instance
            .pendingFor(node.id)
            .where((p) => p.collectionDate == today)
            .toList();
        return poursAsync.when(
          loading: () => const DhenuLoadingList(),
          error: (e, _) => DhenuEmptyState(
              icon: DhenuIcons.cloudOff, title: l.homeLoadError, subtitle: friendlyError(context, e)),
          data: (pours) {
            if (pours.isEmpty && pending.isEmpty) {
              return DhenuEmptyState(
                icon: DhenuIcons.drop,
                title: l.homeNoCollectionToday,
                subtitle: l.homeNoCollectionSubtitle,
              );
            }
            return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              PendingPoursStrip(pending: pending, farmersById: byId),
              if (pours.isNotEmpty)
                ShiftGroupedPours(
                  pours: pours,
                  farmersById: byId,
                  bands: ref.watch(qualityBandsProvider(node.id)).valueOrNull,
                  showDate: true,
                  showAvatar: false,
                  onTapPour: (p, farmer) => showPourDetailSheet(
                    context,
                    pour: p,
                    node: node,
                    farmer: farmer,
                    onModify: () => Navigator.of(context).push(MaterialPageRoute(
                      builder: (_) => RecordCollectionScreen(node: node, seedPour: p, seedFarmer: farmer),
                    )),
                  ),
                ),
            ]);
          },
        );
      },
    );
  }
}
