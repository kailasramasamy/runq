import 'package:flutter/material.dart';
import '../../theme/dhenu_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/transfer_providers.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/quality_badge.dart';
import '../../widgets/dhenu_states.dart';
import '../../utils/friendly_error.dart';
import '../shared/receive_history.dart';
import '../shared/receive_leg.dart';
import '../cc/receive_consignment_screen.dart';
import 'pp_manual_receive_screen.dart';
import '../shared/cancel_leg.dart';
import '../../widgets/slot_pill.dart';
import '../shared/reject_sheet.dart';
import '../../l10n/l10n_helpers.dart';
import '../../widgets/sheet_grabber.dart';
import '../shared/rejection_report.dart';
import '../shared/unwind_sheet.dart';

/// PP Receive — in-transit cc_to_pp tankers (tap a card to receive) above, with
/// recent receipts below. Two counted sections of one-line cards — source,
/// milk type and quantity on a single row so a full queue fits on a screen —
/// feeding the same full-screen receive flow ([ReceiveConsignmentScreen]) the
/// CC uses, with PP labels.
class PpReceiveTab extends ConsumerWidget {
  const PpReceiveTab({super.key, required this.node});
  final MpNode node;

  /// Receipts are shown over a 3-day window, not just today: a load collected
  /// yesterday but received this morning carries YESTERDAY's collection date,
  /// so a today-scoped list drops it the instant it's taken in.
  static const _recentDays = 3;
  ReceivedRangeArgs get _recentArgs =>
      (nodeId: node.id, kind: 'cc_to_pp', days: _recentDays);

  /// The one way this screen reloads. Every path that changes a receipt goes
  /// through here — pull-to-refresh, receiving a tanker, manual receive,
  /// delete — so none of them can miss a provider.
  ///
  /// `nodePendingInboundProvider` is the load-bearing one: it feeds the
  /// in-transit list. Receiving used to invalidate only the other two, so a
  /// tanker stayed in the queue after it had been taken in and the operator
  /// had to pull down to make it disappear.
  Future<void> _refresh(WidgetRef ref) async {
    ref.invalidate(nodeInboundConsignmentsProvider(node.id));
    refreshPendingWork(ref);
    ref.invalidate(nodeReceivedRangeProvider(_recentArgs));
    await ref.read(nodeReceivedRangeProvider(_recentArgs).future);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final consAsync = ref.watch(nodeReceivedRangeProvider(_recentArgs));
    // In transit is a work queue, not a day view — a CC that dispatches a
    // back-dated load must still land in this list.
    final pending = ref.watch(nodePendingInboundProvider(node.id));
    final allCcs = ref.watch(nodesByTypeProvider('cc')).value ?? const <MpNode>[];
    final names = {for (final n in allCcs) n.id: n.name};
    return Scaffold(
      backgroundColor: t.surface,
      // The shell already applies the top SafeArea for every tab.
      body: RefreshIndicator(
        onRefresh: () => _refresh(ref),
        child: consAsync.when(
          loading: () => const DhenuLoadingList(),
          error: (e, _) => DhenuEmptyState(
            icon: DhenuIcons.cloudOff,
            title: l.ppReceiveLoadError,
            subtitle: friendlyError(context, e),
          ),
          // Already scoped to cc_to_pp receipts and ordered newest-first by
          // the API — no client-side filter or reversal needed.
          data: (received) {
            final inTransit = (pending.asData?.value ?? const <MpConsignment>[])
                .where((c) => c.kind == 'cc_to_pp' && c.inTransit)
                .toList()
              ..sort((a, b) => a.collectionDate.compareTo(b.collectionDate));
            return _list(context, ref, l, t, inTransit, received, names);
          },
        ),
      ),
    );
  }

  /// Way through to the full receive record. Mirrors the CC receive tab's
  /// own history link, and lands on the same screen the PP home page links to.
  Widget _seeAllReceivesLink(BuildContext context, DhenuTokens t, AppLocalizations l) => Center(
        child: TextButton(
          onPressed: () => Navigator.of(context).push(MaterialPageRoute(
            builder: (_) => Scaffold(
              appBar: AppBar(
                  title: Text(l.ccReceiveHistoryTitle,
                      style: DhenuText.h2.copyWith(color: t.ink))),
              body: ReceiveHistory(node: node, leg: ReceiveLeg.ccToPp(l)),
            ),
          )),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Text(l.homeSeeFullHistory, style: DhenuText.label.copyWith(color: t.brand)),
            const SizedBox(width: 4),
            Icon(DhenuIcons.chevronRight, size: 16, color: t.brand),
          ]),
        ),
      );

  Future<void> _openManualReceive(BuildContext context, WidgetRef ref) async {
    final saved = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => PpManualReceiveScreen(ppNodeId: node.id)),
    );
    if (saved == true) await _refresh(ref);
  }

  Widget _list(BuildContext context, WidgetRef ref, AppLocalizations l, DhenuTokens t,
      List<MpConsignment> inTransit, List<MpConsignment> received,
      Map<String, String> names) {
    final awaiting = inTransit.fold<double>(0, (sum, c) => sum + (c.dispatchQty ?? 0));
    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(
          DhenuSpacing.screen, DhenuSpacing.md, DhenuSpacing.screen, DhenuSpacing.bottomGap),
      children: [
        // Title + the one number the plant actually wants on arrival: how much
        // milk is still on the road. The tab bar already says "Receive", so the
        // old AppBar row was a second copy of the same word for 56px.
        Row(children: [
          Expanded(
            child: Text(l.ccReceiveTitle, style: DhenuText.h2.copyWith(color: t.ink)),
          ),
          if (inTransit.isNotEmpty)
            Text(litres(awaiting, unit: true),
                style: DhenuText.number(size: 18, color: t.brand)),
        ]),
        const SizedBox(height: DhenuSpacing.lg),
        _sectionTitle(t, l.ccInTransitLabel, inTransit.length),
        const SizedBox(height: DhenuSpacing.sm),
        if (inTransit.isEmpty)
          DhenuEmptyState(
            icon: DhenuIcons.checkCircle,
            title: l.ccReceiveNothingInTransit,
            subtitle: l.ppReceiveNothingInTransitSubtitle,
          )
        else
          for (final c in inTransit) ...[
            _transitCard(context, ref, l, t, c, names[c.fromNodeId] ?? 'CC',
                duplicate: _manualAlreadyIn(received, c)),
            const SizedBox(height: DhenuSpacing.sm),
          ],
        // A backup path, not the main one: it sits with the queue it belongs to
        // instead of holding a pinned bar over every screenful of cards.
        const SizedBox(height: DhenuSpacing.md),
        OutlinedButton.icon(
          onPressed: () => _openManualReceive(context, ref),
          icon: const Icon(DhenuIcons.listAdd, size: 18),
          label: Text(l.ppManualReceiveButton),
          style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(44)),
        ),
        const SizedBox(height: DhenuSpacing.xl),
        _sectionTitle(t, l.ccReceiveRecentReceives, received.length),
        const SizedBox(height: DhenuSpacing.sm),
        if (received.isEmpty)
          DhenuEmptyState(
            icon: DhenuIcons.package,
            title: l.ccReceiveNoReceiptsYet,
            subtitle: l.ppReceiveNoReceiptsSubtitle,
          )
        else
          // Grouped by collection date: the plant takes several tankers a day
          // from different CCs, and an undated run of cards gives no sense of
          // which day's intake you're looking at.
          ..._receivedByDay(context, ref, l, t, received, names),
        // This list is capped at a few days and a few cards; the full record
        // lives in the history screen the home page also links to.
        if (received.isNotEmpty) _seeAllReceivesLink(context, t, l),
      ],
    );
  }

  /// Day-grouped receipts, newest day first, capped at [_receivedCap] cards so a
  /// long history doesn't build the whole list. Only the newest card stays
  /// editable, as before — a correction belongs on the load just taken in.
  static const _receivedCap = 10;

  List<Widget> _receivedByDay(BuildContext context, WidgetRef ref, AppLocalizations l,
      DhenuTokens t, List<MpConsignment> received, Map<String, String> names) {
    final shown = received.take(_receivedCap).toList();
    final byDay = <String, List<MpConsignment>>{};
    for (final c in shown) {
      byDay.putIfAbsent(c.collectionDate, () => []).add(c);
    }
    final out = <Widget>[];
    for (final entry in byDay.entries) {
      final dayQty = entry.value.fold<double>(0, (sum, c) => sum + (c.receiptQty ?? 0));
      out.addAll([
        _dayHeader(t, entry.key, entry.value.length, dayQty),
        const SizedBox(height: DhenuSpacing.sm),
        for (final c in entry.value) ...[
          _receivedCard(context, ref, l, t, c, names[c.fromNodeId] ?? 'CC',
              editable: identical(c, shown.first)),
          const SizedBox(height: DhenuSpacing.sm),
        ],
        const SizedBox(height: DhenuSpacing.md),
      ]);
    }
    return out;
  }

  Widget _dayHeader(DhenuTokens t, String date, int count, double qty) => Row(children: [
        Text(prettyDate(date), style: DhenuText.label.copyWith(color: t.ink, fontWeight: FontWeight.w700)),
        const SizedBox(width: DhenuSpacing.sm),
        Expanded(child: Divider(color: t.hairline, height: 1)),
        const SizedBox(width: DhenuSpacing.sm),
        Text('$count · ${litres(qty, unit: true)}',
            style: DhenuText.caption.copyWith(color: t.inkSoft)),
      ]);

  Widget _sectionTitle(DhenuTokens t, String label, int count) => Row(children: [
        Text(label, style: DhenuText.title.copyWith(color: t.ink)),
        const SizedBox(width: DhenuSpacing.sm),
        if (count > 0)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.sm, vertical: 1),
            decoration: BoxDecoration(
              color: t.inkSoft.withValues(alpha: 0.10),
              borderRadius: BorderRadius.circular(DhenuRadii.pill),
            ),
            child: Text('$count', style: DhenuText.caption.copyWith(color: t.inkSoft)),
          ),
      ]);

  /// True when a manual receipt already covers this exact load — same CC, date
  /// and milk type. The CC catching up on its data hours later is the normal
  /// case, and receiving the tanker too would double-count the intake into
  /// raw-milk stock. Flag it and let the operator delete one; blocking the real
  /// receipt would strand the milk that actually has a dispatch behind it.
  static bool _manualAlreadyIn(List<MpConsignment> received, MpConsignment c) =>
      received.any((r) =>
          r.directReceive &&
          r.fromNodeId == c.fromNodeId &&
          r.collectionDate == c.collectionDate &&
          r.milkType == c.milkType);

  Widget _transitCard(BuildContext context, WidgetRef ref, AppLocalizations l, DhenuTokens t,
      MpConsignment c, String name, {bool duplicate = false}) {
    // One row, same shape as a received card: source and quantity on the same
    // line so five waiting tankers fit on a screen instead of two. "In transit"
    // is the whole section, so the per-card status pill went with it — the
    // amber truck mark carries it.
    return DhenuCard(
      padding: const EdgeInsets.symmetric(
          horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md),
      onTap: () => _openReceive(context, ref, l, c, name),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(DhenuIcons.transit, size: 18, color: t.gradeB),
          const SizedBox(width: DhenuSpacing.md),
          Expanded(child: _cardHeader(t, l, c, name)),
          const SizedBox(width: DhenuSpacing.sm),
          Text(litres(c.dispatchQty ?? 0, unit: true),
              style: DhenuText.number(size: 18, color: t.ink)),
          Icon(DhenuIcons.chevronRight, size: 16, color: t.brand),
        ]),
        if (duplicate) ...[
          const SizedBox(height: DhenuSpacing.sm),
          _duplicateNotice(t, l),
        ],
      ]),
    );
  }

  Widget _duplicateNotice(DhenuTokens t, AppLocalizations l) => Container(
        padding: const EdgeInsets.all(DhenuSpacing.sm),
        decoration: BoxDecoration(
          color: t.gradeB.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(DhenuRadii.input),
        ),
        child: Row(children: [
          Icon(DhenuIcons.warning, size: 16, color: t.gradeB),
          const SizedBox(width: DhenuSpacing.sm),
          Expanded(
            child: Text(l.ppReceiveManualDuplicateWarning,
                style: DhenuText.caption.copyWith(color: t.inkSoft)),
          ),
        ]),
      );

  Widget _receivedCard(BuildContext context, WidgetRef ref, AppLocalizations l, DhenuTokens t,
      MpConsignment c, String name, {bool editable = false}) {
    final v = c.variancePct ?? 0;
    final vColor = v.abs() > 2 ? t.gradeC : t.gradeA;
    return DhenuCard(
      padding: const EdgeInsets.symmetric(
          horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md),
      onTap: () => _openActions(context, ref, l, t, c, name, editable: editable),
      child: Row(children: [
        Icon(DhenuIcons.checkCircle, size: 18, color: t.gradeA),
        const SizedBox(width: DhenuSpacing.md),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(name,
              style: DhenuText.body.copyWith(color: t.ink, fontWeight: FontWeight.w600)),
          // The milk type decides which raw-milk stock this load lands in, so
          // name it on its own line rather than burying it in the subtitle.
          if (c.milkType != null) ...[
            const SizedBox(height: 3),
            // Wrapped, not a Row: a long type name ("Cow A1 (regular)") plus the
            // MANUAL tag overflows the narrow column left by the qty and delete
            // affordances, so the tag drops to its own line instead.
            Wrap(spacing: DhenuSpacing.xs, runSpacing: 3, children: [
              MilkTypePill(milkType: c.milkType!),
              // A manual receipt has no dispatch behind it — say so, since it's
              // the row to delete if the CC's own entry lands later.
              if (c.directReceive) _pill(t, l.ppReceiveManualTag, t.gradeB),
            ]),
          ],
          const SizedBox(height: DhenuSpacing.xs),
          _whenLine(t, l, c),
          RejectedChip(consignment: c),
          RefusedLaterChip(consignment: c),
        ])),
        const SizedBox(width: DhenuSpacing.sm),
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Text(litres(c.receiptQty ?? 0, unit: true),
              style: DhenuText.number(size: 16, color: t.ink)),
          const SizedBox(height: 2),
          Text(l.ccVarianceSuffix('${v >= 0 ? '+' : ''}${v.toStringAsFixed(1)}'),
              style: DhenuText.caption.copyWith(color: vColor)),
        ]),
        const SizedBox(width: DhenuSpacing.sm),
        // Not a chevron: that promises a detail screen, and tapping here opens
        // a sheet of actions instead. An ellipsis says "there are things you
        // can do to this", which is what actually happens.
        Icon(DhenuIcons.more, size: 18, color: t.inkSoft),
      ]),
    );
  }

  /// Everything you can do to a receipt, in a sheet.
  ///
  /// Two icons crammed beside the litres left the name-and-slot column 96 px
  /// wide and overflowed it — but the row was the symptom, not the problem.
  /// These three actions differ in kind and need naming: editing says the
  /// figures were wrong, rejecting says the load arrived and some of it failed,
  /// cancelling says it never arrived at all. Anonymous glyphs made the
  /// operator guess which was which. Same sheet the CC receive tab uses, so a
  /// receipt behaves identically at both tiers.
  Future<void> _openActions(BuildContext context, WidgetRef ref, AppLocalizations l,
      DhenuTokens t, MpConsignment c, String name, {bool editable = false}) {
    return showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(DhenuRadii.sheet)),
        ),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(
                DhenuSpacing.lg, 0, DhenuSpacing.lg, DhenuSpacing.lg),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Center(child: SheetGrabber()),
                Text(name, style: DhenuText.title.copyWith(color: t.ink)),
                const SizedBox(height: 2),
                Text(
                  '${consignmentSlotL10n(l, c.shift)} · '
                  '${litres(c.receiptQty ?? 0, unit: true)} · ${prettyDate(c.collectionDate)}',
                  style: DhenuText.caption.copyWith(color: t.inkSoft),
                ),
                const SizedBox(height: 2),
                // The full number, which the card itself no longer has room to
                // show without eliding it to "CON/202…" — useless, since every
                // one of them begins the same way.
                Text(c.consignmentNo, style: DhenuText.caption.copyWith(color: t.inkSoft)),
                const SizedBox(height: DhenuSpacing.lg),
                ..._receiptActions(context, ref, l, t, c, name, editable: editable, ctx: ctx),
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// The actions this particular load can actually take.
  ///
  /// Offering all three on everything was wrong: a fully-refused tanker has
  /// nothing left to reject, and the server refuses to un-receive a load while
  /// a rejection stands on it. Both were dead entries that could only earn a
  /// error message. What was missing is the one an operator looking at a
  /// rejected load actually wants — putting it back.
  List<Widget> _receiptActions(BuildContext context, WidgetRef ref, AppLocalizations l,
      DhenuTokens t, MpConsignment c, String name,
      {required bool editable, required BuildContext ctx}) {
    final rejected = c.rejectedQty > 0;
    final kept = c.receiptQty ?? 0;
    return [
      if (editable) ...[
        _actionRow(t, DhenuIcons.edit, l.ccReceiveEditReceipt, t.brand, () {
          Navigator.pop(ctx);
          _openReceive(context, ref, l, c, name, editable: true);
        }),
        const SizedBox(height: DhenuSpacing.sm),
      ],
      // Nothing left to refuse once it is all refused.
      if (kept > 0) ...[
        _actionRow(t, DhenuIcons.warning, l.rejectAction, t.gradeC, () {
          Navigator.pop(ctx);
          rejectConsignment(context, consignment: c, onDone: () => _refresh(ref));
        }),
        const SizedBox(height: DhenuSpacing.sm),
      ],
      _actionRow(t, DhenuIcons.undo, l.unwindOpen, t.gradeC, () {
        Navigator.pop(ctx);
        showUnwindSheet(context,
            consignmentId: c.id, title: '${c.consignmentNo} · $name', onDone: () => _refresh(ref));
      }),
      const SizedBox(height: DhenuSpacing.sm),
      if (rejected)
        _actionRow(t, DhenuIcons.undo, l.rejectUndo, t.brand, () {
          Navigator.pop(ctx);
          undoRejection(context, consignment: c, onDone: () => _refresh(ref));
        })
      else
        _actionRow(
          t,
          c.directReceive ? DhenuIcons.trash : DhenuIcons.undo,
          c.directReceive ? l.ccReceiveDeleteReceipt : l.cancelReceiptAction,
          t.gradeC,
          () {
            Navigator.pop(ctx);
            confirmCancelReceipt(context, c, name, () => _refresh(ref));
          },
        ),
    ];
  }

  Widget _actionRow(DhenuTokens t, IconData icon, String label, Color color, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(DhenuRadii.card),
      child: Container(
        padding: const EdgeInsets.symmetric(
            horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md),
        decoration: BoxDecoration(
          color: t.inputFill,
          borderRadius: BorderRadius.circular(DhenuRadii.card),
          border: Border.all(color: t.hairline),
        ),
        child: Row(children: [
          Container(
            width: 38, height: 38, alignment: Alignment.center,
            decoration: BoxDecoration(color: color.withValues(alpha: 0.12), shape: BoxShape.circle),
            child: Icon(icon, color: color, size: 20),
          ),
          const SizedBox(width: DhenuSpacing.md),
          Text(label, style: DhenuText.body.copyWith(color: t.ink, fontWeight: FontWeight.w600)),
        ]),
      ),
    );
  }

  Widget _cardHeader(DhenuTokens t, AppLocalizations l, MpConsignment c, String name) =>
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // Name and milk type share a line: the type is a short pill and the CC
        // names are short, and keeping them together saves a whole row per card.
        Wrap(spacing: DhenuSpacing.sm, runSpacing: 3, crossAxisAlignment: WrapCrossAlignment.center, children: [
          Text(name, style: DhenuText.body.copyWith(color: t.ink, fontWeight: FontWeight.w600)),
          if (c.milkType != null) MilkTypePill(milkType: c.milkType!),
        ]),
        const SizedBox(height: DhenuSpacing.xs),
        _whenLine(t, l, c, id: c.containerNo),
      ]);

  /// Slot and date, the two facts the plant matches a tanker on. They used to
  /// sit inside one soft caption with the container id — the id is the longest
  /// part, so it took the eye first and pushed the date to the ellipsis. Now
  /// the slot is a coloured pill, the date reads in full ink, and the id
  /// trails behind them in caption grey.
  Widget _whenLine(DhenuTokens t, AppLocalizations l, MpConsignment c, {String? id}) =>
      Row(children: [
        SlotPill(shift: c.shift),
        const SizedBox(width: DhenuSpacing.sm),
        Flexible(
          child: Text(slotDateLabel(c.collectionDate),
              style: DhenuText.label.copyWith(color: t.ink, fontWeight: FontWeight.w600),
              maxLines: 1, overflow: TextOverflow.ellipsis),
        ),
        if (id != null && id.isNotEmpty) ...[
          const SizedBox(width: DhenuSpacing.sm),
          Expanded(
            child: Text(id,
                style: DhenuText.caption.copyWith(color: t.inkSoft),
                maxLines: 1, overflow: TextOverflow.ellipsis),
          ),
        ],
      ]);

  /// AM / PM / Pooled, in that slot's own colour — same pill the CC receive
  /// tab uses, so a slot reads identically on both legs of the journey.


  Widget _pill(DhenuTokens t, String label, Color color) => Container(
        padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.md, vertical: DhenuSpacing.xs),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(DhenuRadii.pill),
        ),
        child: Text(label, style: DhenuText.label.copyWith(color: color)),
      );

  Future<void> _openReceive(
      BuildContext context, WidgetRef ref, AppLocalizations l, MpConsignment c, String name,
      {bool editable = false}) async {
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => ReceiveConsignmentScreen(
        consignment: c,
        nodeId: node.id,
        sourceName: name,
        editable: editable,
        sourceLabel: l.ppReceiveDispatchedByCc,
        measuredLabel: l.ppReceiveMeasuredAtPlant,
        sourceIcon: DhenuIcons.snowflake,
      ),
    ));
    await _refresh(ref);
  }
}
