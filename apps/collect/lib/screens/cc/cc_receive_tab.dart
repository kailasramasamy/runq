import 'package:flutter/material.dart';
import '../../theme/dhenu_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../api/mp_repo.dart';
import '../../l10n/app_localizations.dart';
import '../../l10n/l10n_helpers.dart';
import '../../providers/transfer_providers.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/dhenu_toast.dart';
import '../../widgets/sheet_grabber.dart';
import '../../utils/friendly_error.dart';
import '../shared/receive_history.dart';
import '../shared/receive_leg.dart';
import 'manual_receive_screen.dart';
import 'receive_consignment_screen.dart';
import 'cc_dispatch_tab.dart';
import '../../widgets/primary_action.dart';

/// CC Receive — in-transit consignments (tap a card to receive) above, with
/// recent receipts below. Each card leads with the VMCC name + consignment id,
/// the litres in large type, and a status pill.
class CcReceiveTab extends ConsumerWidget {
  const CcReceiveTab({super.key, required this.node});
  final MpNode node;

  /// Receiving milk changes what's on hand, so the Dispatch tab's availability
  /// is stale the moment a receipt lands. Those providers aren't autoDispose and
  /// the dispatch screen has no pull-to-refresh, so without this it keeps serving
  /// the figure it cached before the receipt — 0 for the first receipt of the day
  /// — until the app restarts. Invalidating the families clears every date/shift
  /// key at once, since this tab can't know which one dispatch is showing.
  void _invalidateAfterReceipt(WidgetRef ref) {
    ref.invalidate(nodeInboundConsignmentsProvider(node.id));
    ref.invalidate(nodePendingInboundProvider(node.id));
    ref.invalidate(nodeInboundByDateProvider);
    ref.invalidate(nodeAvailabilityProvider);
    ref.invalidate(nodeAvailabilityForDateProvider);
  }

  Future<void> _refresh(WidgetRef ref) async {
    _invalidateAfterReceipt(ref);
    if (node.isOvernightPool) {
      ref.invalidate(nodeInboundByDateProvider((nodeId: node.id, date: isoDaysAgo(1))));
    }
    await ref.read(nodeInboundConsignmentsProvider(node.id).future);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final consAsync = ref.watch(nodeInboundConsignmentsProvider(node.id));
    // In transit is date-agnostic — a VMCC feeding a notebook in three days late
    // dispatches against the original collection date, and that load still has to
    // reach this queue.
    final pending = ref.watch(nodePendingInboundProvider(node.id));
    final allVmccs = ref.watch(nodesByTypeProvider('vmcc')).value ?? const <MpNode>[];
    final names = {for (final n in allVmccs) n.id: n.name};
    final children = allVmccs.where((n) => n.parentNodeId == node.id).toList();
    // Overnight CC pools across yesterday + today, so the lists span both days.
    final yest = node.isOvernightPool
        ? (ref.watch(nodeInboundByDateProvider((nodeId: node.id, date: isoDaysAgo(1)))).asData?.value ??
            const <MpConsignment>[])
        : const <MpConsignment>[];
    return Scaffold(
      backgroundColor: t.surface,
      appBar: AppBar(title: Text(l.ccReceiveTitle)),
      body: Column(children: [
        Expanded(
          child: RefreshIndicator(
            onRefresh: () => _refresh(ref),
            child: consAsync.when(
              loading: () => const DhenuLoadingList(),
              error: (e, _) => DhenuEmptyState(
                icon: DhenuIcons.cloudOff,
                title: l.ccReceiveLoadError,
                subtitle: friendlyError(context, e),
              ),
              data: (today) {
                final inTransit = (pending.asData?.value ?? const <MpConsignment>[])
                    .where((c) => c.kind == 'vmcc_to_cc' && c.inTransit)
                    .toList()
                  ..sort((a, b) => a.collectionDate.compareTo(b.collectionDate));
                // Newest first by consignment no. (monotonic) so a just-added
                // receipt — AM or PM — always surfaces at the top.
                final received = [...yest, ...today]
                    .where((c) => c.kind == 'vmcc_to_cc' && c.received)
                    .toList()
                  ..sort((a, b) => b.consignmentNo.compareTo(a.consignmentNo));
                return _list(context, ref, t, l, inTransit, received, names);
              },
            ),
          ),
        ),
        _manualReceiveBar(context, ref, t, l, children, _nothingInTransit(pending)),
      ]),
    );
  }

  /// Bottom-anchored entry to the manual (no-dispatch) receive flow.
  Widget _manualReceiveBar(
      BuildContext context, WidgetRef ref, DhenuTokens t, AppLocalizations l,
      List<MpNode> children, bool allReceived) {
    // Everything in has been taken in and there's milk on hand: sending it on is
    // the next step, so offer it here rather than making the operator go back to
    // Home and find the Dispatch tab.
    final onHand = ref.watch(nodeAvailabilityProvider(_availArgs)).asData?.value?.available ?? 0;
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
            DhenuSpacing.screen, DhenuSpacing.sm, DhenuSpacing.screen, DhenuSpacing.sm),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          if (allReceived && onHand > 0) ...[
            PrimaryAction(
              label: l.ccDispatchToPlant,
              icon: DhenuIcons.truck,
              onPressed: () => _openDispatch(context, ref, l, t),
            ),
            const SizedBox(height: DhenuSpacing.sm),
          ],
          OutlinedButton.icon(
            onPressed: () => _openManualReceive(context, ref, l, children),
            icon: const Icon(DhenuIcons.listAdd, size: 18),
            label: Text(l.ccReceiveManualButton),
            style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
          ),
        ]),
      ),
    );
  }

  /// True once every inbound consignment has been taken in — the trigger for
  /// offering onward dispatch. Unresolved/error states count as "not yet".
  bool _nothingInTransit(AsyncValue<List<MpConsignment>> pending) {
    final rows = pending.asData?.value;
    if (rows == null) return false;
    return rows.every((c) => c.kind != 'vmcc_to_cc' || !c.inTransit);
  }

  /// A BMC or overnight CC pools the whole day, so it has no per-shift figure —
  /// same key the dispatch screen uses, so the two can't disagree.
  AvailabilityArgs get _availArgs => (
        nodeId: node.id,
        shift: node.isPooledDispatch ? null : currentShift(),
      );

  Future<void> _openDispatch(
      BuildContext context, WidgetRef ref, AppLocalizations l, DhenuTokens t) async {
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => Scaffold(
        appBar: AppBar(title: Text(l.dispatchTitle, style: DhenuText.h2.copyWith(color: t.ink))),
        body: CcDispatchTab(node: node),
      ),
    ));
    if (!context.mounted) return;
    // Dispatching consumes what was received; these providers aren't autoDispose.
    _invalidateAfterReceipt(ref);
  }

  Widget _list(BuildContext context, WidgetRef ref, DhenuTokens t, AppLocalizations l,
      List<MpConsignment> inTransit, List<MpConsignment> received,
      Map<String, String> names) {
    // Per-type consignments mean a VMCC can send cow and buffalo the same shift,
    // so name the type whenever this list holds more than one — otherwise two
    // cards from the same centre read identically.
    final mixed = hasMixedMilkTypes([...inTransit, ...received].map((c) => c.milkType));
    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(
          DhenuSpacing.screen, DhenuSpacing.md, DhenuSpacing.screen, DhenuSpacing.bottomGap),
      children: [
        _sectionTitle(t, l.ccInTransitLabel, inTransit.length),
        const SizedBox(height: DhenuSpacing.sm),
        if (inTransit.isEmpty)
          DhenuEmptyState(
            icon: DhenuIcons.checkCircle,
            title: l.ccReceiveNothingInTransit,
            subtitle: l.ccReceiveNothingInTransitSubtitle,
          )
        else
          for (final c in inTransit) ...[
            _transitCard(context, ref, t, l, c, names[c.fromNodeId] ?? 'VMCC', mixed),
            const SizedBox(height: DhenuSpacing.md),
          ],
        const SizedBox(height: DhenuSpacing.lg),
        _sectionTitle(t, l.ccReceiveRecentReceives, received.length),
        const SizedBox(height: DhenuSpacing.sm),
        if (received.isEmpty)
          DhenuEmptyState(
            icon: DhenuIcons.package,
            title: l.ccReceiveNoReceiptsYet,
            subtitle: l.ccReceiveNoReceiptsSubtitle,
          )
        else ...[
          for (var i = 0; i < received.length && i < 15; i++) ...[
            _receivedCard(context, ref, t, l, received[i],
                names[received[i].fromNodeId] ?? 'VMCC', mixed),
            const SizedBox(height: DhenuSpacing.sm),
          ],
          _seeHistoryLink(context, t, l),
        ],
      ],
    );
  }

  Widget _seeHistoryLink(BuildContext context, DhenuTokens t, AppLocalizations l) => Center(
        child: TextButton(
          onPressed: () => Navigator.of(context).push(MaterialPageRoute(
            builder: (_) => Scaffold(
              appBar: AppBar(title: Text(l.ccReceiveHistoryTitle, style: DhenuText.h2.copyWith(color: t.ink))),
              body: ReceiveHistory(node: node, leg: ReceiveLeg.vmccToCc(l)),
            ),
          )),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Text(l.homeSeeFullHistory, style: DhenuText.label.copyWith(color: t.brand)),
            const SizedBox(width: 4),
            Icon(DhenuIcons.chevronRight, size: 16, color: t.brand),
          ]),
        ),
      );

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

  Widget _transitCard(BuildContext context, WidgetRef ref, DhenuTokens t, AppLocalizations l,
      MpConsignment c, String name, bool mixed) {
    return DhenuCard(
      onTap: () => _openReceive(context, ref, c, name),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        _cardHeader(t, l, c, name, mixed),
        const SizedBox(height: DhenuSpacing.md),
        Text(litres(c.dispatchQty ?? 0, unit: true), style: DhenuText.number(size: 26, color: t.ink)),
        const SizedBox(height: DhenuSpacing.sm),
        Row(children: [
          _pill(t, l.ccReceivePillInTransit, t.gradeB, icon: DhenuIcons.transit),
          const Spacer(),
          Text(l.ccReceiveTapToReceive, style: DhenuText.caption.copyWith(color: t.brand)),
          Icon(DhenuIcons.chevronRight, size: 16, color: t.brand),
        ]),
      ]),
    );
  }

  Widget _receivedCard(BuildContext context, WidgetRef ref, DhenuTokens t, AppLocalizations l,
      MpConsignment c, String name, bool mixed) {
    final v = c.variancePct ?? 0;
    final vColor = v.abs() > 2 ? t.gradeC : t.gradeA;
    // The lock follows the receipt's OWN collection date. A back-dated receipt
    // checked against today's closure was the wrong row entirely — it offered
    // Delete on a locked slot and hid it on an open one.
    final st = ref
        .watch(shiftStatusForDateProvider((nodeId: node.id, date: c.collectionDate)))
        .asData?.value;
    final canDelete = c.directReceive && !_lockedForDispatch(st, c);
    return DhenuCard(
      padding: const EdgeInsets.symmetric(
          horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md),
      onTap: () => _openActions(context, ref, t, l, c, name, canDelete),
      child: Row(children: [
        Icon(DhenuIcons.checkCircle, size: 18, color: t.gradeA),
        const SizedBox(width: DhenuSpacing.md),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(name, style: DhenuText.body.copyWith(color: t.ink, fontWeight: FontWeight.w600)),
          const SizedBox(height: 2),
          Row(children: [
            if (c.shift != null) ...[
              Icon(c.shift == Shift.am ? DhenuIcons.sun : DhenuIcons.moon, size: 12, color: t.inkSoft),
              const SizedBox(width: 4),
            ],
            Flexible(child: Text(
                '${c.shift == null ? '' : '${c.shift == Shift.am ? l.shiftAm : l.shiftPm} · '}${prettyDate(c.collectionDate)}',
                style: DhenuText.caption.copyWith(color: t.inkSoft),
                maxLines: 1, overflow: TextOverflow.ellipsis)),
          ]),
        ])),
        const SizedBox(width: DhenuSpacing.sm),
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Text(litres(c.receiptQty ?? 0, unit: true), style: DhenuText.number(size: 16, color: t.ink)),
          const SizedBox(height: 2),
          Text(l.ccVarianceSuffix('${v >= 0 ? '+' : ''}${v.toStringAsFixed(1)}'),
              style: DhenuText.caption.copyWith(color: vColor)),
        ]),
        const SizedBox(width: DhenuSpacing.sm),
        Icon(DhenuIcons.chevronRight, size: 18, color: t.inkSoft),
      ]),
    );
  }

  /// A manual receipt's CC slot is locked once receiving is closed for dispatch
  /// (BMC pools the whole day; no-BMC locks per shift). Status not yet resolved →
  /// not locked; the server re-checks and rejects a genuinely-locked delete.
  bool _lockedForDispatch(MpShiftStatus? st, MpConsignment c) {
    if (st == null) return false;
    if (node.isPooledDispatch) return st.dayClosed;
    return c.shift != null && st.closedFor(c.shift!.name);
  }

  /// Edit / Delete sheet for a receipt. Delete shows only for an unlocked manual
  /// receipt; a locked manual receipt shows why it can't be removed.
  Future<void> _openActions(BuildContext context, WidgetRef ref, DhenuTokens t, AppLocalizations l,
      MpConsignment c, String name, bool canDelete) {
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
                Row(children: [
                  if (c.shift != null) ...[
                    Icon(c.shift == Shift.am ? DhenuIcons.sun : DhenuIcons.moon,
                        size: 12, color: t.inkSoft),
                    const SizedBox(width: 4),
                  ],
                  Text(
                      '${c.shift == null ? '' : '${c.shift == Shift.am ? l.shiftAm : l.shiftPm} · '}'
                      '${litres(c.receiptQty ?? 0, unit: true)} · ${prettyDate(c.collectionDate)}',
                      style: DhenuText.caption.copyWith(color: t.inkSoft)),
                ]),
                const SizedBox(height: 2),
                Text(c.consignmentNo, style: DhenuText.caption.copyWith(color: t.inkSoft)),
                const SizedBox(height: DhenuSpacing.lg),
                _actionRow(t, DhenuIcons.edit, l.ccReceiveEditReceipt, t.brand, () {
                  Navigator.pop(ctx);
                  _openReceive(context, ref, c, name, editable: true);
                }),
                if (canDelete) ...[
                  const SizedBox(height: DhenuSpacing.sm),
                  _actionRow(t, DhenuIcons.trash, l.ccReceiveDeleteReceipt, t.gradeC, () {
                    Navigator.pop(ctx);
                    _confirmDelete(context, ref, l, c, name);
                  }),
                ] else if (c.directReceive) ...[
                  const SizedBox(height: DhenuSpacing.md),
                  Row(children: [
                    Icon(DhenuIcons.lock, size: 15, color: t.inkSoft),
                    const SizedBox(width: DhenuSpacing.sm),
                    Expanded(child: Text(l.ccReceiveLockedForDispatch,
                        style: DhenuText.caption.copyWith(color: t.inkSoft))),
                  ]),
                ],
              ],
            ),
          ),
        ),
      ),
    );
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

  Future<void> _confirmDelete(
      BuildContext context, WidgetRef ref, AppLocalizations l, MpConsignment c, String name) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (dctx) => AlertDialog(
        title: Text(l.ccReceiveDeleteConfirmTitle),
        content: Text(l.ccReceiveDeleteConfirmBody(name, litres(c.receiptQty ?? 0, unit: true))),
        actions: [
          TextButton(onPressed: () => Navigator.of(dctx).pop(false), child: Text(l.commonCancel)),
          TextButton(onPressed: () => Navigator.of(dctx).pop(true), child: Text(l.syncDelete)),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await mpRepo.deleteReceipt(c.id);
      _invalidateAfterReceipt(ref);
      if (context.mounted) {
        showDhenuToast(context, l.ccReceiveReceiptDeletedToast, type: DhenuToastType.success);
      }
    } catch (e) {
      if (context.mounted) showDhenuToast(context, friendlyError(context, e), type: DhenuToastType.error);
    }
  }

  Widget _cardHeader(
          DhenuTokens t, AppLocalizations l, MpConsignment c, String name, bool mixed) =>
      Row(children: [
        Container(
          width: 36, height: 36,
          decoration: BoxDecoration(color: t.brand.withValues(alpha: 0.10), shape: BoxShape.circle),
          child: Icon(DhenuIcons.store, size: 19, color: t.brand),
        ),
        const SizedBox(width: DhenuSpacing.md),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(name, style: DhenuText.body.copyWith(color: t.ink, fontWeight: FontWeight.w700)),
          const SizedBox(height: 2),
          Text(
              '${mixed && c.milkType != null ? '${milkTypeL10n(l, c.milkType!)} · ' : ''}'
              '${c.consignmentNo} · ${prettyDate(c.collectionDate)}',
              style: DhenuText.caption.copyWith(color: t.inkSoft)),
        ])),
        if (c.shift != null) ...[
          Icon(c.shift == Shift.am ? DhenuIcons.sun : DhenuIcons.moon, size: 12, color: t.inkSoft),
          const SizedBox(width: 4),
          Text(c.shift == Shift.am ? l.shiftAm : l.shiftPm,
              style: DhenuText.caption.copyWith(color: t.inkSoft)),
        ],
      ]);

  Widget _pill(DhenuTokens t, String label, Color color, {IconData? icon}) => Container(
        padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.md, vertical: DhenuSpacing.xs),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(DhenuRadii.pill),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          if (icon != null) ...[
            Icon(icon, size: 13, color: color),
            const SizedBox(width: 4),
          ],
          Text(label, style: DhenuText.label.copyWith(color: color)),
        ]),
      );

  Future<void> _openReceive(
      BuildContext context, WidgetRef ref, MpConsignment c, String name,
      {bool editable = false}) async {
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) =>
          ReceiveConsignmentScreen(consignment: c, nodeId: node.id, sourceName: name, editable: editable),
    ));
    _invalidateAfterReceipt(ref);
  }

  Future<void> _openManualReceive(
      BuildContext context, WidgetRef ref, AppLocalizations l, List<MpNode> vmccs) async {
    if (vmccs.isEmpty) {
      showDhenuToast(context, l.ccReceiveNoVmccsLinkedToast, type: DhenuToastType.error);
      return;
    }
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => ManualReceiveScreen(vmccs: vmccs, node: node),
    ));
    _invalidateAfterReceipt(ref);
  }
}
