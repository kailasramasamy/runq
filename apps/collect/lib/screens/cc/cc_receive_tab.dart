import 'package:flutter/material.dart';
import '../../theme/dhenu_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../providers/transfer_providers.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/dhenu_toast.dart';
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
    await ref.read(nodeInboundConsignmentsProvider(node.id).future);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    final consAsync = ref.watch(nodeInboundConsignmentsProvider(node.id));
    final allVmccs = ref.watch(nodesByTypeProvider('vmcc')).value ?? const <MpNode>[];
    final names = {for (final n in allVmccs) n.id: n.name};
    final children = allVmccs.where((n) => n.parentNodeId == node.id).toList();
    return Scaffold(
      backgroundColor: t.surface,
      appBar: AppBar(title: const Text('Receive'), actions: [
        IconButton(
          tooltip: 'Manual receive',
          icon: const Icon(DhenuIcons.add),
          onPressed: () => _openManualReceive(context, ref, children),
        ),
      ]),
      body: RefreshIndicator(
        onRefresh: () => _refresh(ref),
        child: consAsync.when(
          loading: () => const DhenuLoadingList(),
          error: (e, _) => DhenuEmptyState(
            icon: DhenuIcons.cloudOff,
            title: 'Could not load consignments',
            subtitle: '$e',
          ),
          data: (all) {
            final inTransit = all.where((c) => c.kind == 'vmcc_to_cc' && c.inTransit).toList();
            final received =
                all.where((c) => c.kind == 'vmcc_to_cc' && c.received).toList().reversed.toList();
            return _list(context, ref, t, inTransit, received, names, children);
          },
        ),
      ),
    );
  }

  Widget _list(BuildContext context, WidgetRef ref, DhenuTokens t,
      List<MpConsignment> inTransit, List<MpConsignment> received,
      Map<String, String> names, List<MpNode> children) {
    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(
          DhenuSpacing.screen, DhenuSpacing.md, DhenuSpacing.screen, DhenuSpacing.bottomGap),
      children: [
        OutlinedButton.icon(
          onPressed: () => _openManualReceive(context, ref, children),
          icon: const Icon(DhenuIcons.listAdd, size: 18),
          label: const Text('Receive without dispatch entry'),
          style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(46)),
        ),
        const SizedBox(height: DhenuSpacing.lg),
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
        else
          for (var i = 0; i < received.length && i < 10; i++) ...[
            _receivedCard(context, ref, t, received[i],
                names[received[i].fromNodeId] ?? 'VMCC', editable: i == 0),
            const SizedBox(height: DhenuSpacing.sm),
          ],
      ],
    );
  }

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
      MpConsignment c, String name, {bool editable = false}) {
    final v = c.variancePct ?? 0;
    final vColor = v.abs() > 2 ? t.gradeC : t.gradeA;
    final shift = c.shift == null ? '' : '${c.shift == Shift.am ? '☀️' : '🌙'} · ';
    return DhenuCard(
      padding: const EdgeInsets.symmetric(
          horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md),
      onTap: () => _openReceive(context, ref, c, name, editable: editable),
      child: Row(children: [
        Icon(DhenuIcons.checkCircle, size: 18, color: t.gradeA),
        const SizedBox(width: DhenuSpacing.md),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(name, style: DhenuText.body.copyWith(color: t.ink, fontWeight: FontWeight.w600)),
          const SizedBox(height: 2),
          Text('$shift${c.consignmentNo} · ${prettyDate(c.collectionDate)}',
              style: DhenuText.caption.copyWith(color: t.inkSoft),
              maxLines: 1, overflow: TextOverflow.ellipsis),
        ])),
        const SizedBox(width: DhenuSpacing.sm),
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Text(litres(c.receiptQty ?? 0, unit: true), style: DhenuText.number(size: 16, color: t.ink)),
          const SizedBox(height: 2),
          Text('${v >= 0 ? '+' : ''}${v.toStringAsFixed(1)}% var',
              style: DhenuText.caption.copyWith(color: vColor)),
        ]),
        if (editable) ...[
          const SizedBox(width: DhenuSpacing.sm),
          Icon(DhenuIcons.edit, size: 16, color: t.brand),
        ],
      ]),
    );
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
        if (c.shift != null)
          Text(c.shift == Shift.am ? '☀️ AM' : '🌙 PM',
              style: DhenuText.caption.copyWith(color: t.inkSoft)),
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
