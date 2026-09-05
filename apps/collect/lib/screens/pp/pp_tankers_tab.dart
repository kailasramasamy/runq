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
import '../../widgets/dhenu_states.dart';
import '../../utils/friendly_error.dart';
import '../../widgets/status_glyph.dart';
import '../../widgets/slot_pill.dart';
import '../../widgets/quality_badge.dart';

/// PP Tankers tab — cc_to_pp loads to this plant today, plus anything still on
/// the road from an earlier date. Cancelled legs are filtered out upstream by
/// [nodeInboundConsignmentsProvider]; the badge below still asks for
/// `inTransit` by name rather than inferring it, so one is never painted as a
/// tanker on its way.
class PpTankersTab extends ConsumerWidget {
  const PpTankersTab({super.key, required this.node});
  final MpNode node;

  Future<void> _refresh(WidgetRef ref) async {
    ref.invalidate(nodeInboundConsignmentsProvider(node.id));
    ref.invalidate(nodePendingInboundProvider(node.id));
    await ref.read(nodeInboundConsignmentsProvider(node.id).future);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final consAsync = ref.watch(nodeInboundConsignmentsProvider(node.id));
    final pendingRows =
        ref.watch(nodePendingInboundProvider(node.id)).asData?.value ?? const <MpConsignment>[];
    final allCcs = ref.watch(nodesByTypeProvider('cc')).value ?? const <MpNode>[];
    final names = {for (final n in allCcs) n.id: n.name};
    return Scaffold(
      backgroundColor: t.surface,
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: Text(l.navTankers, style: DhenuText.h2.copyWith(color: t.ink)),
      ),
      body: RefreshIndicator(
        onRefresh: () => _refresh(ref),
        child: consAsync.when(
          loading: () => const DhenuLoadingList(),
          error: (e, _) => DhenuEmptyState(
            icon: DhenuIcons.cloudOff,
            title: l.ppReceiveLoadError,
            subtitle: friendlyError(context, e),
          ),
          data: (all) {
            // Today's tankers, plus anything still in transit from an earlier
            // collection date — a late-fed CC dispatches against the original
            // date, and that tanker is still on the road.
            final byId = {
              for (final c in [...pendingRows, ...all])
                if (c.kind == 'cc_to_pp') c.id: c,
            };
            final tankers = byId.values.toList()
              ..sort((a, b) => b.collectionDate.compareTo(a.collectionDate));
            if (tankers.isEmpty) {
              return ListView(
                keyboardDismissBehavior:
                    ScrollViewKeyboardDismissBehavior.onDrag,
                children: [
                  const SizedBox(height: DhenuSpacing.bottomGap),
                  DhenuEmptyState(
                    icon: DhenuIcons.truck,
                    title: l.ppTankersEmptyTitle,
                    subtitle: l.ppTankersEmptySubtitle,
                  ),
                ],
              );
            }
            return _list(l, t, tankers, names);
          },
        ),
      ),
    );
  }

  Widget _list(AppLocalizations l, DhenuTokens t, List<MpConsignment> tankers, Map<String, String> names) {
    return ListView.separated(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(
          DhenuSpacing.screen, DhenuSpacing.md, DhenuSpacing.screen, DhenuSpacing.x4),
      itemCount: tankers.length,
      separatorBuilder: (_, _) => const SizedBox(height: DhenuSpacing.sm),
      itemBuilder: (_, i) => _tankerCard(l, t, tankers[i], names),
    );
  }

  Widget _tankerCard(AppLocalizations l, DhenuTokens t, MpConsignment c, Map<String, String> names) {
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
          // Which milking this load is, and which day. The list carries loads
          // still on the road from earlier dates alongside today's, so two
          // tankers from the same CC for the same litres are otherwise
          // indistinguishable — and the slot is what the plant matches a
          // physical can against.
          const SizedBox(height: DhenuSpacing.xs),
          // Wrapped, not a Row: slot + date + a long type name ("Cow A1
          // (regular)") overflows the column left by the litres and status,
          // so the type drops to its own line instead of being clipped.
          Wrap(
            spacing: DhenuSpacing.sm, runSpacing: 3,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              SlotPill(shift: c.shift),
              Text(slotDateLabel(c.collectionDate),
                  style: DhenuText.label.copyWith(color: t.ink, fontWeight: FontWeight.w600)),
              // The type decides which raw-milk stock this load lands in, so it
              // is what tells two same-size tankers from one CC apart.
              if (c.milkType != null) MilkTypePill(milkType: c.milkType!),
            ],
          ),
        ])),
        const SizedBox(width: DhenuSpacing.sm),
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Text(litres(qty, unit: true), style: DhenuText.number(size: 16, color: t.ink)),
          const SizedBox(height: 4),
          _statusBadge(l, t, c),
        ]),
      ]),
    );
  }

  Widget _statusBadge(AppLocalizations l, DhenuTokens t, MpConsignment c) {
    if (c.isReversed) {
      return Text(l.dispatchHistoryReversed,
          style: DhenuText.caption.copyWith(color: t.gradeC));
    }
    final isReceived = c.received;
    return Container(
      padding: const EdgeInsets.symmetric(
          horizontal: DhenuSpacing.sm, vertical: DhenuSpacing.xs),
      decoration: BoxDecoration(
        color: (isReceived ? t.gradeA : t.gradeB).withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(DhenuRadii.pill),
      ),
      child: StatusGlyph(
        label: isReceived ? l.dispatchStatusReceived : l.dispatchStatusTransit,
        color: isReceived ? t.gradeA : t.gradeB,
        received: isReceived,
      ),
    );
  }
}
