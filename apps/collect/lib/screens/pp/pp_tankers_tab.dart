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

/// PP Tankers tab — all cc_to_pp consignments to this plant today (any status).
class PpTankersTab extends ConsumerWidget {
  const PpTankersTab({super.key, required this.node});
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
        title: Text('Tankers', style: DhenuText.h2.copyWith(color: t.ink)),
      ),
      body: RefreshIndicator(
        onRefresh: () => _refresh(ref),
        child: consAsync.when(
          loading: () => const DhenuLoadingList(),
          error: (e, _) => DhenuEmptyState(
            icon: DhenuIcons.cloudOff,
            title: 'Could not load tankers',
            subtitle: '$e',
          ),
          data: (all) {
            final tankers = all.where((c) => c.kind == 'cc_to_pp').toList();
            if (tankers.isEmpty) {
              return ListView(
                keyboardDismissBehavior:
                    ScrollViewKeyboardDismissBehavior.onDrag,
                children: const [
                  SizedBox(height: DhenuSpacing.bottomGap),
                  DhenuEmptyState(
                    icon: DhenuIcons.truck,
                    title: 'No tankers today',
                    subtitle: 'Tankers dispatched to this plant appear here',
                  ),
                ],
              );
            }
            return _list(t, tankers, names);
          },
        ),
      ),
    );
  }

  Widget _list(DhenuTokens t, List<MpConsignment> tankers, Map<String, String> names) {
    return ListView.separated(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(
          DhenuSpacing.screen, DhenuSpacing.md, DhenuSpacing.screen, DhenuSpacing.x4),
      itemCount: tankers.length,
      separatorBuilder: (_, _) => const SizedBox(height: DhenuSpacing.sm),
      itemBuilder: (_, i) => _tankerCard(t, tankers[i], names),
    );
  }

  Widget _tankerCard(DhenuTokens t, MpConsignment c, Map<String, String> names) {
    final qty = c.receiptQty ?? c.dispatchQty ?? 0;
    return DhenuCard(
      padding: const EdgeInsets.symmetric(
          horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md),
      child: Row(children: [
        Container(
          width: 38, height: 38,
          decoration: BoxDecoration(
              color: t.brand.withValues(alpha: 0.10), shape: BoxShape.circle),
          child: Icon(DhenuIcons.truck, size: 20, color: t.brand),
        ),
        const SizedBox(width: DhenuSpacing.md),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(c.containerNo ?? c.consignmentNo,
              style: DhenuText.body.copyWith(color: t.ink, fontWeight: FontWeight.w600),
              maxLines: 1, overflow: TextOverflow.ellipsis),
          const SizedBox(height: 2),
          Text(names[c.fromNodeId] ?? 'CC',
              style: DhenuText.caption.copyWith(color: t.inkSoft),
              maxLines: 1, overflow: TextOverflow.ellipsis),
        ])),
        const SizedBox(width: DhenuSpacing.sm),
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Text(litres(qty, unit: true), style: DhenuText.number(size: 16, color: t.ink)),
          const SizedBox(height: 4),
          _statusBadge(t, c),
        ]),
      ]),
    );
  }

  Widget _statusBadge(DhenuTokens t, MpConsignment c) {
    final isReceived = c.received;
    return Container(
      padding: const EdgeInsets.symmetric(
          horizontal: DhenuSpacing.sm, vertical: DhenuSpacing.xs),
      decoration: BoxDecoration(
        color: (isReceived ? t.gradeA : t.gradeB).withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(DhenuRadii.pill),
      ),
      child: Text(
        isReceived ? '✓ received' : '⏳ transit',
        style: DhenuText.caption.copyWith(color: isReceived ? t.gradeA : t.gradeB),
      ),
    );
  }
}
