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
import '../../utils/friendly_error.dart';
import '../cc/receive_consignment_screen.dart';

/// PP Receive — in-transit cc_to_pp tankers (tap a card to receive) above, with
/// recent receipts below. Mirrors the CC Receive layout: an AppBar title, two
/// counted sections, rich cards leading with the CC name + container id, and the
/// same full-screen receive flow ([ReceiveConsignmentScreen]) with PP labels.
class PpReceiveTab extends ConsumerWidget {
  const PpReceiveTab({super.key, required this.node});
  final MpNode node;

  Future<void> _refresh(WidgetRef ref) async {
    ref.invalidate(nodeInboundConsignmentsProvider(node.id));
    await ref.read(nodeInboundConsignmentsProvider(node.id).future);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    final consAsync = ref.watch(nodeInboundConsignmentsProvider(node.id));
    final allCcs = ref.watch(nodesByTypeProvider('cc')).value ?? const <MpNode>[];
    final names = {for (final n in allCcs) n.id: n.name};
    return Scaffold(
      backgroundColor: t.surface,
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: Text('Receive', style: DhenuText.h2.copyWith(color: t.ink)),
      ),
      body: RefreshIndicator(
        onRefresh: () => _refresh(ref),
        child: consAsync.when(
          loading: () => const DhenuLoadingList(),
          error: (e, _) => DhenuEmptyState(
            icon: DhenuIcons.cloudOff,
            title: 'Could not load tankers',
            subtitle: friendlyError(context, e),
          ),
          data: (all) {
            final inTransit =
                all.where((c) => c.kind == 'cc_to_pp' && c.inTransit).toList();
            final received = all
                .where((c) => c.kind == 'cc_to_pp' && c.received)
                .toList()
                .reversed
                .toList();
            return _list(context, ref, t, inTransit, received, names);
          },
        ),
      ),
    );
  }

  Widget _list(BuildContext context, WidgetRef ref, DhenuTokens t,
      List<MpConsignment> inTransit, List<MpConsignment> received,
      Map<String, String> names) {
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
            subtitle: 'Inbound tankers appear here once dispatched',
          )
        else
          for (final c in inTransit) ...[
            _transitCard(context, ref, t, c, names[c.fromNodeId] ?? 'CC'),
            const SizedBox(height: DhenuSpacing.md),
          ],
        const SizedBox(height: DhenuSpacing.lg),
        _sectionTitle(t, 'Recent receives', received.length),
        const SizedBox(height: DhenuSpacing.sm),
        if (received.isEmpty)
          const DhenuEmptyState(
            icon: DhenuIcons.package,
            title: 'No receipts yet',
            subtitle: 'Tankers you receive from CCs show here',
          )
        else
          for (var i = 0; i < received.length && i < 10; i++) ...[
            _receivedCard(context, ref, t, received[i],
                names[received[i].fromNodeId] ?? 'CC', editable: i == 0),
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
        Text(litres(c.dispatchQty ?? 0, unit: true),
            style: DhenuText.number(size: 26, color: t.ink)),
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
    return DhenuCard(
      padding: const EdgeInsets.symmetric(
          horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md),
      onTap: () => _openReceive(context, ref, c, name, editable: editable),
      child: Row(children: [
        Icon(DhenuIcons.checkCircle, size: 18, color: t.gradeA),
        const SizedBox(width: DhenuSpacing.md),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(name,
              style: DhenuText.body.copyWith(color: t.ink, fontWeight: FontWeight.w600)),
          const SizedBox(height: 2),
          Text('${c.consignmentNo} · ${prettyDate(c.collectionDate)}',
              style: DhenuText.caption.copyWith(color: t.inkSoft),
              maxLines: 1, overflow: TextOverflow.ellipsis),
        ])),
        const SizedBox(width: DhenuSpacing.sm),
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Text(litres(c.receiptQty ?? 0, unit: true),
              style: DhenuText.number(size: 16, color: t.ink)),
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
          child: Icon(DhenuIcons.truck, size: 19, color: t.brand),
        ),
        const SizedBox(width: DhenuSpacing.md),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(c.containerNo ?? c.consignmentNo,
              style: DhenuText.body.copyWith(color: t.ink, fontWeight: FontWeight.w700)),
          const SizedBox(height: 2),
          Text('$name · ${prettyDate(c.collectionDate)}',
              style: DhenuText.caption.copyWith(color: t.inkSoft)),
        ])),
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
      builder: (_) => ReceiveConsignmentScreen(
        consignment: c,
        nodeId: node.id,
        sourceName: name,
        editable: editable,
        sourceLabel: 'DISPATCHED BY CC',
        measuredLabel: 'MEASURED AT PLANT',
        sourceIcon: DhenuIcons.snowflake,
      ),
    ));
    ref.invalidate(nodeInboundConsignmentsProvider(node.id));
  }
}
