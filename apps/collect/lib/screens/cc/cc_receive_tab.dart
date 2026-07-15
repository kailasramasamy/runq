import 'package:flutter/material.dart';
import '../../theme/dhenu_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../api/mp_repo.dart';
import '../../providers/transfer_providers.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/dhenu_toast.dart';
import '../../widgets/sheet_grabber.dart';
import '../../utils/friendly_error.dart';
import 'cc_receive_history.dart';
import 'manual_receive_screen.dart';
import 'receive_consignment_screen.dart';

/// CC Receive — in-transit consignments (tap a card to receive) above, with
/// recent receipts below. Each card leads with the VMCC name + consignment id,
/// the litres in large type, and a status pill.
class CcReceiveTab extends ConsumerWidget {
  const CcReceiveTab({super.key, required this.node});
  final MpNode node;

  Future<void> _refresh(WidgetRef ref) async {
    ref.invalidate(nodeInboundConsignmentsProvider(node.id));
    if (node.overnightPooling) {
      ref.invalidate(nodeInboundByDateProvider((nodeId: node.id, date: isoDaysAgo(1))));
    }
    await ref.read(nodeInboundConsignmentsProvider(node.id).future);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    final consAsync = ref.watch(nodeInboundConsignmentsProvider(node.id));
    final allVmccs = ref.watch(nodesByTypeProvider('vmcc')).value ?? const <MpNode>[];
    final names = {for (final n in allVmccs) n.id: n.name};
    final children = allVmccs.where((n) => n.parentNodeId == node.id).toList();
    final shiftStatus = ref.watch(shiftStatusProvider(node.id)).asData?.value;
    // Overnight CC pools across yesterday + today, so the lists span both days.
    final yest = node.overnightPooling
        ? (ref.watch(nodeInboundByDateProvider((nodeId: node.id, date: isoDaysAgo(1)))).asData?.value ??
            const <MpConsignment>[])
        : const <MpConsignment>[];
    return Scaffold(
      backgroundColor: t.surface,
      appBar: AppBar(title: const Text('Receive')),
      body: Column(children: [
        Expanded(
          child: RefreshIndicator(
            onRefresh: () => _refresh(ref),
            child: consAsync.when(
              loading: () => const DhenuLoadingList(),
              error: (e, _) => DhenuEmptyState(
                icon: DhenuIcons.cloudOff,
                title: 'Could not load consignments',
                subtitle: friendlyError(context, e),
              ),
              data: (today) {
                final all = [...yest, ...today];
                final inTransit = all.where((c) => c.kind == 'vmcc_to_cc' && c.inTransit).toList();
                // Newest first by consignment no. (monotonic) so a just-added
                // receipt — AM or PM — always surfaces at the top.
                final received = all.where((c) => c.kind == 'vmcc_to_cc' && c.received).toList()
                  ..sort((a, b) => b.consignmentNo.compareTo(a.consignmentNo));
                return _list(context, ref, t, inTransit, received, names, shiftStatus);
              },
            ),
          ),
        ),
        _manualReceiveBar(context, ref, t, children),
      ]),
    );
  }

  /// Bottom-anchored entry to the manual (no-dispatch) receive flow.
  Widget _manualReceiveBar(
      BuildContext context, WidgetRef ref, DhenuTokens t, List<MpNode> children) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
            DhenuSpacing.screen, DhenuSpacing.sm, DhenuSpacing.screen, DhenuSpacing.sm),
        child: OutlinedButton.icon(
          onPressed: () => _openManualReceive(context, ref, children),
          icon: const Icon(DhenuIcons.listAdd, size: 18),
          label: const Text('Manual receive'),
          style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
        ),
      ),
    );
  }

  Widget _list(BuildContext context, WidgetRef ref, DhenuTokens t,
      List<MpConsignment> inTransit, List<MpConsignment> received,
      Map<String, String> names, MpShiftStatus? shiftStatus) {
    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(
          DhenuSpacing.screen, DhenuSpacing.md, DhenuSpacing.screen, DhenuSpacing.bottomGap),
      children: [
        _sectionTitle(t, 'In transit', inTransit.length),
        const SizedBox(height: DhenuSpacing.sm),
        if (inTransit.isEmpty)
          const DhenuEmptyState(
            icon: DhenuIcons.checkCircle,
            title: 'Nothing in transit',
            subtitle: 'Incoming consignments appear here',
          )
        else
          for (final c in inTransit) ...[
            _transitCard(context, ref, t, c, names[c.fromNodeId] ?? 'VMCC'),
            const SizedBox(height: DhenuSpacing.md),
          ],
        const SizedBox(height: DhenuSpacing.lg),
        _sectionTitle(t, 'Recent receives', received.length),
        const SizedBox(height: DhenuSpacing.sm),
        if (received.isEmpty)
          const DhenuEmptyState(
            icon: DhenuIcons.package,
            title: 'No receipts yet',
            subtitle: 'Milk you receive from VMCCs shows here',
          )
        else ...[
          for (var i = 0; i < received.length && i < 15; i++) ...[
            _receivedCard(context, ref, t, received[i],
                names[received[i].fromNodeId] ?? 'VMCC', shiftStatus),
            const SizedBox(height: DhenuSpacing.sm),
          ],
          _seeHistoryLink(context, t),
        ],
      ],
    );
  }

  Widget _seeHistoryLink(BuildContext context, DhenuTokens t) => Center(
        child: TextButton(
          onPressed: () => Navigator.of(context).push(MaterialPageRoute(
            builder: (_) => Scaffold(
              appBar: AppBar(title: Text('Receive history', style: DhenuText.h2.copyWith(color: t.ink))),
              body: CcReceiveHistory(node: node),
            ),
          )),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Text('See full history', style: DhenuText.label.copyWith(color: t.brand)),
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

  Widget _transitCard(BuildContext context, WidgetRef ref, DhenuTokens t,
      MpConsignment c, String name) {
    return DhenuCard(
      onTap: () => _openReceive(context, ref, c, name),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        _cardHeader(t, c, name),
        const SizedBox(height: DhenuSpacing.md),
        Text(litres(c.dispatchQty ?? 0, unit: true), style: DhenuText.number(size: 26, color: t.ink)),
        const SizedBox(height: DhenuSpacing.sm),
        Row(children: [
          _pill(t, '⏳ In transit', t.gradeB),
          const Spacer(),
          Text('Tap to receive', style: DhenuText.caption.copyWith(color: t.brand)),
          Icon(DhenuIcons.chevronRight, size: 16, color: t.brand),
        ]),
      ]),
    );
  }

  Widget _receivedCard(BuildContext context, WidgetRef ref, DhenuTokens t,
      MpConsignment c, String name, MpShiftStatus? shiftStatus) {
    final v = c.variancePct ?? 0;
    final vColor = v.abs() > 2 ? t.gradeC : t.gradeA;
    final canDelete = c.directReceive && !_lockedForDispatch(shiftStatus, c);
    return DhenuCard(
      padding: const EdgeInsets.symmetric(
          horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md),
      onTap: () => _openActions(context, ref, t, c, name, canDelete),
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
                '${c.shift == null ? '' : '${c.shift == Shift.am ? 'AM' : 'PM'} · '}${prettyDate(c.collectionDate)}',
                style: DhenuText.caption.copyWith(color: t.inkSoft),
                maxLines: 1, overflow: TextOverflow.ellipsis)),
          ]),
        ])),
        const SizedBox(width: DhenuSpacing.sm),
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Text(litres(c.receiptQty ?? 0, unit: true), style: DhenuText.number(size: 16, color: t.ink)),
          const SizedBox(height: 2),
          Text('${v >= 0 ? '+' : ''}${v.toStringAsFixed(1)}% var',
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
    if (node.hasBmc) return st.dayClosed;
    return c.shift != null && st.closedFor(c.shift!.name);
  }

  /// Edit / Delete sheet for a receipt. Delete shows only for an unlocked manual
  /// receipt; a locked manual receipt shows why it can't be removed.
  Future<void> _openActions(BuildContext context, WidgetRef ref, DhenuTokens t,
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
                      '${c.shift == null ? '' : '${c.shift == Shift.am ? 'AM' : 'PM'} · '}'
                      '${litres(c.receiptQty ?? 0, unit: true)} · ${prettyDate(c.collectionDate)}',
                      style: DhenuText.caption.copyWith(color: t.inkSoft)),
                ]),
                const SizedBox(height: 2),
                Text(c.consignmentNo, style: DhenuText.caption.copyWith(color: t.inkSoft)),
                const SizedBox(height: DhenuSpacing.lg),
                _actionRow(t, DhenuIcons.edit, 'Edit receipt', t.brand, () {
                  Navigator.pop(ctx);
                  _openReceive(context, ref, c, name, editable: true);
                }),
                if (canDelete) ...[
                  const SizedBox(height: DhenuSpacing.sm),
                  _actionRow(t, DhenuIcons.trash, 'Delete receipt', t.gradeC, () {
                    Navigator.pop(ctx);
                    _confirmDelete(context, ref, c, name);
                  }),
                ] else if (c.directReceive) ...[
                  const SizedBox(height: DhenuSpacing.md),
                  Row(children: [
                    Icon(DhenuIcons.lock, size: 15, color: t.inkSoft),
                    const SizedBox(width: DhenuSpacing.sm),
                    Expanded(child: Text('Locked — receiving closed for dispatch',
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
      BuildContext context, WidgetRef ref, MpConsignment c, String name) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (dctx) => AlertDialog(
        title: const Text('Delete receipt?'),
        content: Text('$name · ${litres(c.receiptQty ?? 0, unit: true)} will be removed.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(dctx).pop(false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.of(dctx).pop(true), child: const Text('Delete')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await mpRepo.deleteReceipt(c.id);
      ref.invalidate(nodeInboundConsignmentsProvider(node.id));
      if (context.mounted) showDhenuToast(context, 'Receipt deleted', type: DhenuToastType.success);
    } catch (e) {
      if (context.mounted) showDhenuToast(context, friendlyError(context, e), type: DhenuToastType.error);
    }
  }

  Widget _cardHeader(DhenuTokens t, MpConsignment c, String name) => Row(children: [
        Container(
          width: 36, height: 36,
          decoration: BoxDecoration(color: t.brand.withValues(alpha: 0.10), shape: BoxShape.circle),
          child: Icon(DhenuIcons.store, size: 19, color: t.brand),
        ),
        const SizedBox(width: DhenuSpacing.md),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(name, style: DhenuText.body.copyWith(color: t.ink, fontWeight: FontWeight.w700)),
          const SizedBox(height: 2),
          Text('${c.consignmentNo} · ${prettyDate(c.collectionDate)}',
              style: DhenuText.caption.copyWith(color: t.inkSoft)),
        ])),
        if (c.shift != null) ...[
          Icon(c.shift == Shift.am ? DhenuIcons.sun : DhenuIcons.moon, size: 12, color: t.inkSoft),
          const SizedBox(width: 4),
          Text(c.shift == Shift.am ? 'AM' : 'PM',
              style: DhenuText.caption.copyWith(color: t.inkSoft)),
        ],
      ]);

  Widget _pill(DhenuTokens t, String label, Color color) => Container(
        padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.md, vertical: DhenuSpacing.xs),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(DhenuRadii.pill),
        ),
        child: Text(label, style: DhenuText.label.copyWith(color: color)),
      );

  Future<void> _openReceive(
      BuildContext context, WidgetRef ref, MpConsignment c, String name,
      {bool editable = false}) async {
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) =>
          ReceiveConsignmentScreen(consignment: c, nodeId: node.id, sourceName: name, editable: editable),
    ));
    ref.invalidate(nodeInboundConsignmentsProvider(node.id));
  }

  Future<void> _openManualReceive(
      BuildContext context, WidgetRef ref, List<MpNode> vmccs) async {
    if (vmccs.isEmpty) {
      showDhenuToast(context, 'No VMCCs linked to this CC', type: DhenuToastType.error);
      return;
    }
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => ManualReceiveScreen(vmccs: vmccs, ccNodeId: node.id),
    ));
    ref.invalidate(nodeInboundConsignmentsProvider(node.id));
  }
}
