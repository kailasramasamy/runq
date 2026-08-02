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
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/hero_number_card.dart';
import '../../services/pour_queue.dart';
import '../../widgets/pending_pours_strip.dart';
import '../../widgets/pour_detail_sheet.dart';
import '../../widgets/sync_queue_sheet.dart';
import '../../widgets/primary_action.dart';
import '../../widgets/shift_grouped_pours.dart';
import '../../widgets/quality_badge.dart';
import '../../widgets/sync_status.dart';
import '../../widgets/tank_gauge.dart';
import '../../utils/friendly_error.dart';
import 'record_collection.dart';
import 'vmcc_dispatch_tab.dart';
import 'vmcc_collection_history.dart';
import 'vmcc_farmers_tab.dart';
import 'vmcc_reports_tab.dart';

/// VMCC operator home tab — the capture-centric dashboard (spec §5.2). Rendered
/// as the Home tab inside [VmccShell]; the capture action is the bottom-nav ➕.
class VmccHome extends ConsumerWidget {
  const VmccHome({super.key, required this.node});
  final MpNode node;

  Future<void> _refresh(WidgetRef ref) async {
    ref.invalidate(nodeTodaySummaryProvider(node.id));
    ref.invalidate(nodeTodayPoursProvider(node.id));
    ref.invalidate(nodeSummaryForDateProvider(_yesterdayKey));
    ref.invalidate(nodePoursForDateProvider(_yesterdayKey));
    ref.invalidate(nodeAvailabilityProvider);
    ref.invalidate(shiftStatusProvider(node.id));
    await Future.wait([
      ref.read(nodeTodaySummaryProvider(node.id).future),
      ref.read(nodeTodayPoursProvider(node.id).future),
    ]);
  }

  NodeDateKey get _yesterdayKey => (nodeId: node.id, date: isoDaysAgo(1));

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
          _hero(context, t, l, summary, bands),
          const SizedBox(height: DhenuSpacing.md),
          _statsRow(ref, t, l, summary),
          const SizedBox(height: DhenuSpacing.lg),
          _primaryAction(context, ref, t, l),
          const SizedBox(height: DhenuSpacing.lg),
          _quickLinks(context, t, l),
          const SizedBox(height: DhenuSpacing.xl),
          Text(l.homeRecentEntries, style: DhenuText.title.copyWith(color: t.ink)),
          const SizedBox(height: DhenuSpacing.sm),
          _recent(context, t, l, ref),
          const SizedBox(height: DhenuSpacing.xl),
          Text(l.homeYesterday, style: DhenuText.title.copyWith(color: t.ink)),
          const SizedBox(height: DhenuSpacing.sm),
          _YesterdayCollection(node: node),
          const SizedBox(height: DhenuSpacing.md),
          _historyLink(context, t, l),
        ],
      ),
    );
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

  Widget _header(BuildContext context, WidgetRef ref, DhenuTokens t, AppLocalizations l, SyncSnapshot sync) => Row(
        children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(node.name, style: DhenuText.h2.copyWith(color: t.ink)),
              Text(
                shiftFrom(currentShift()) == Shift.am ? l.homeAmShiftInProgress : l.homePmShiftInProgress,
                style: DhenuText.caption.copyWith(color: t.inkSoft),
              ),
            ]),
          ),
          SyncStatus(
            state: sync.state,
            pendingCount: sync.pendingCount,
            failedCount: sync.failedCount,
            agoLabel: l.homeJustNow,
            onTap: () => showSyncQueueSheet(context, ref, node.id),
          ),
        ],
      );

  /// Recording is the headline action only while the slot is open. Once it's
  /// closed, offering "Record collection" leads to a screen with no form on it,
  /// so the slot's next step — dispatch — takes the button instead. Recording
  /// stays reachable underneath for back-dating or reopening.
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

  Widget _hero(BuildContext context, DhenuTokens t, AppLocalizations l, AsyncValue<MpCollectionSummary?> summary, QualityBands? bands) {
    return summary.when(
      loading: () => const DhenuLoadingList(rows: 2),
      error: (e, _) => HeroNumberCard(label: l.homeHeroToday, primaryValue: '—', footer: Text(friendlyError(context, e), style: DhenuText.caption.copyWith(color: t.gradeC))),
      data: (s) {
        final isAm = shiftFrom(currentShift()) == Shift.am;
        final qty = s == null ? 0.0 : (isAm ? s.amQty : s.pmQty);
        return HeroNumberCard(
          label: isAm ? l.homeHeroTodayAm : l.homeHeroTodayPm,
          primaryValue: litres(qty, unit: true),
          gradient: const LinearGradient(
            colors: [DhenuColors.brand, DhenuColors.brandDark],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          footer: _heroFooter(l, s, isAm, bands),
        );
      },
    );
  }

  /// Footer for the shift-scoped hero. The headline is the *current* shift, so
  /// the footer carries cross-shift context: once the other shift has milk it
  /// reads "AM done · 147.8 L collected". Farmer count + quality show only while
  /// the other shift is empty — there the whole day's data is this shift, so the
  /// day-level figures match the headline. Hidden before any collection today.
  Widget? _heroFooter(AppLocalizations l, MpCollectionSummary? s, bool isAm, QualityBands? bands) {
    if (s == null) return null;
    final otherQty = isAm ? s.pmQty : s.amQty;
    if (otherQty > 0.05) {
      return Text(
        l.homeShiftDone(isAm ? l.shiftPm : l.shiftAm, litres(otherQty, unit: true)),
        style: DhenuText.body.copyWith(color: Colors.white.withValues(alpha: 0.82)),
      );
    }
    if (s.totalQty <= 0.05) return null;
    final milkType = node.effectiveMilkType;
    return Row(children: [
      Text(l.homeFarmerCount(s.farmerCount),
          style: DhenuText.body.copyWith(color: Colors.white.withValues(alpha: 0.82))),
      const Spacer(),
      _qualityText(s, bands, milkType),
    ]);
  }

  Widget _qualityText(MpCollectionSummary s, QualityBands? bands, MilkType milkType) {
    // Build inline color tokens here — this widget lives on the dark hero.
    final base = DhenuText.caption.copyWith(color: Colors.white);
    // Retrieve a single DhenuTokens via a Builder is expensive; instead use the
    // static bandColor helper which returns null when no band matches and we fall
    // back to white. We resolve colors at build time using a Builder.
    return Builder(builder: (ctx) {
      final tk = DT(ctx);
      final fatColor = QualityBadge.bandColor(bands, milkType, 'fat', s.avgFat, tk) ?? Colors.white;
      final snfColor = QualityBadge.bandColor(bands, milkType, 'snf', s.avgSnf, tk) ?? Colors.white;
      return RichText(
        text: TextSpan(style: base, children: [
          const TextSpan(text: 'FAT '),
          TextSpan(text: s.avgFat.toStringAsFixed(1), style: TextStyle(color: fatColor)),
          const TextSpan(text: ' · SNF '),
          TextSpan(text: s.avgSnf.toStringAsFixed(1), style: TextStyle(color: snfColor)),
          if (s.avgWater > 0)
            TextSpan(text: ' · W ${s.avgWater.toStringAsFixed(1)}'),
        ]),
      );
    });
  }

  Widget _statsRow(WidgetRef ref, DhenuTokens t, AppLocalizations l, AsyncValue<MpCollectionSummary?> summary) {
    final total = summary.asData?.value?.totalQty ?? 0;
    // Milk still at the VMCC awaiting dispatch = today's collected − dispatched,
    // across both shifts (decrements as each shift's consignment goes out).
    final pending = ref.watch(nodeAvailabilityProvider((nodeId: node.id, shift: null)))
        .asData?.value?.available ?? 0;
    final allSent = pending <= 0.05;
    return Row(children: [
      Expanded(child: _miniCard(t, l.homeToDispatch,
          allSent ? (total > 0 ? l.homeAllDispatched : l.homeNothingYet) : litres(pending, unit: true),
          color: allSent ? t.gradeA : t.am)),
      const SizedBox(width: DhenuSpacing.md),
      Expanded(
        child: node.capacityLitres == null
            ? _miniCard(t, l.homeCollected, litres(total, unit: true))
            : DhenuCard(
                child: TankGauge(current: total, capacity: node.capacityLitres!, label: l.homeBmcTank),
              ),
      ),
    ]);
  }

  Widget _miniCard(DhenuTokens t, String label, String value, {Color? color}) => DhenuCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label.toUpperCase(), style: DhenuText.label.copyWith(color: t.inkSoft)),
          const SizedBox(height: DhenuSpacing.xs),
          Text(value, style: DhenuText.title.copyWith(color: color ?? t.ink)),
        ]),
      );


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

/// Yesterday's collection: a rollup card (litres, farmer count, AM/PM split,
/// qty-weighted FAT/SNF) that expands into every farmer's pours, PM then AM.
/// Its own widget so Home stays a [ConsumerWidget] and only this card rebuilds
/// on expand; the pour list is watched lazily, so an operator who never opens it
/// still costs Home a single summary call.
class _YesterdayCollection extends ConsumerStatefulWidget {
  const _YesterdayCollection({required this.node});

  final MpNode node;

  @override
  ConsumerState<_YesterdayCollection> createState() => _YesterdayCollectionState();
}

class _YesterdayCollectionState extends ConsumerState<_YesterdayCollection> {
  bool _expanded = false;

  NodeDateKey get _key => (nodeId: widget.node.id, date: isoDaysAgo(1));

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    return ref.watch(nodeSummaryForDateProvider(_key)).when(
          loading: () => const DhenuLoadingList(rows: 1),
          error: (e, _) =>
              Text(friendlyError(context, e), style: DhenuText.caption.copyWith(color: t.gradeC)),
          data: (s) {
            // Nothing to expand into on a dry day — stay a plain caption.
            if (s == null || s.totalQty <= 0.05) {
              return Text(l.homeNoCollectionYesterday,
                  style: DhenuText.body.copyWith(color: t.inkSoft));
            }
            return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              _summaryCard(t, l, s),
              if (_expanded) ...[
                const SizedBox(height: DhenuSpacing.sm),
                _pours(context, t, l),
              ],
            ]);
          },
        );
  }

  Widget _summaryCard(DhenuTokens t, AppLocalizations l, MpCollectionSummary s) => DhenuCard(
        selected: _expanded,
        onTap: () => setState(() => _expanded = !_expanded),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Text(litres(s.totalQty, unit: true), style: DhenuText.title.copyWith(color: t.ink)),
            const Spacer(),
            Text(l.homeFarmerCount(s.farmerCount),
                style: DhenuText.body.copyWith(color: t.inkSoft)),
            const SizedBox(width: DhenuSpacing.sm),
            Icon(_expanded ? DhenuIcons.chevronUp : DhenuIcons.chevronDown,
                color: t.inkSoft, size: 20),
          ]),
          const SizedBox(height: DhenuSpacing.sm),
          Row(children: [
            Text('${l.shiftAm} ${litres(s.amQty, unit: true)} · ${l.shiftPm} ${litres(s.pmQty, unit: true)}',
                style: DhenuText.caption.copyWith(color: t.inkSoft)),
            const Spacer(),
            if (s.avgFat > 0)
              Text('FAT ${s.avgFat.toStringAsFixed(1)} · SNF ${s.avgSnf.toStringAsFixed(1)}',
                  style: DhenuText.caption.copyWith(color: t.inkSoft)),
          ]),
        ]),
      );

  /// The expanded body: the same shift-grouped farmer rows Home shows for today,
  /// tapping through to the pour detail sheet (and on to an edit).
  Widget _pours(BuildContext context, DhenuTokens t, AppLocalizations l) {
    final farmers = ref.watch(nodeFarmersProvider(widget.node.id)).asData?.value ?? const <MpFarmer>[];
    final byId = {for (final f in farmers) f.id: f};
    return ref.watch(nodePoursForDateProvider(_key)).when(
          loading: () => const DhenuLoadingList(),
          error: (e, _) =>
              Text(friendlyError(context, e), style: DhenuText.caption.copyWith(color: t.gradeC)),
          data: (pours) => pours.isEmpty
              ? Text(l.homeNoCollectionYesterday, style: DhenuText.body.copyWith(color: t.inkSoft))
              : ShiftGroupedPours(
                  pours: pours,
                  farmersById: byId,
                  bands: ref.watch(qualityBandsProvider(widget.node.id)).valueOrNull,
                  showAvatar: false,
                  onTapPour: (p, farmer) => showPourDetailSheet(
                    context,
                    pour: p,
                    node: widget.node,
                    farmer: farmer,
                    onModify: () => Navigator.of(context).push(MaterialPageRoute(
                      builder: (_) =>
                          RecordCollectionScreen(node: widget.node, seedPour: p, seedFarmer: farmer),
                    )),
                  ),
                ),
        );
  }
}
