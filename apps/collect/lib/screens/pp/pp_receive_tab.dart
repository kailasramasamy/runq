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
import '../../api/mp_repo.dart';
import '../../utils/friendly_error.dart';
import '../../widgets/dhenu_toast.dart';
import '../cc/receive_consignment_screen.dart';
import 'pp_manual_receive_screen.dart';

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
    final l = AppLocalizations.of(context);
    final consAsync = ref.watch(nodeInboundConsignmentsProvider(node.id));
    final allCcs = ref.watch(nodesByTypeProvider('cc')).value ?? const <MpNode>[];
    final names = {for (final n in allCcs) n.id: n.name};
    return Scaffold(
      backgroundColor: t.surface,
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: Text(l.ccReceiveTitle, style: DhenuText.h2.copyWith(color: t.ink)),
      ),
      body: Column(children: [
        Expanded(
          child: RefreshIndicator(
            onRefresh: () => _refresh(ref),
            child: consAsync.when(
              loading: () => const DhenuLoadingList(),
              error: (e, _) => DhenuEmptyState(
                icon: DhenuIcons.cloudOff,
                title: l.ppReceiveLoadError,
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
                return _list(context, ref, l, t, inTransit, received, names);
              },
            ),
          ),
        ),
        // A backup path, not the main one — muted and pinned below the list,
        // exactly as the CC offers its own manual receive.
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(
                DhenuSpacing.screen, DhenuSpacing.sm, DhenuSpacing.screen, DhenuSpacing.sm),
            child: OutlinedButton.icon(
              onPressed: () => _openManualReceive(context, ref),
              icon: const Icon(DhenuIcons.listAdd, size: 18),
              label: Text(l.ppManualReceiveButton),
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
            ),
          ),
        ),
      ]),
    );
  }

  Future<void> _openManualReceive(BuildContext context, WidgetRef ref) async {
    final saved = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => PpManualReceiveScreen(ppNodeId: node.id)),
    );
    if (saved == true) await _refresh(ref);
  }

  Widget _list(BuildContext context, WidgetRef ref, AppLocalizations l, DhenuTokens t,
      List<MpConsignment> inTransit, List<MpConsignment> received,
      Map<String, String> names) {
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
            subtitle: l.ppReceiveNothingInTransitSubtitle,
          )
        else
          for (final c in inTransit) ...[
            _transitCard(context, ref, l, t, c, names[c.fromNodeId] ?? 'CC',
                duplicate: _manualAlreadyIn(received, c)),
            const SizedBox(height: DhenuSpacing.md),
          ],
        const SizedBox(height: DhenuSpacing.lg),
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
    return DhenuCard(
      onTap: () => _openReceive(context, ref, l, c, name),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        _cardHeader(t, c, name),
        const SizedBox(height: DhenuSpacing.md),
        Text(litres(c.dispatchQty ?? 0, unit: true),
            style: DhenuText.number(size: 26, color: t.ink)),
        if (duplicate) ...[
          const SizedBox(height: DhenuSpacing.sm),
          _duplicateNotice(t, l),
        ],
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
      onTap: () => _openReceive(context, ref, l, c, name, editable: editable),
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
          Text(l.ccVarianceSuffix('${v >= 0 ? '+' : ''}${v.toStringAsFixed(1)}'),
              style: DhenuText.caption.copyWith(color: vColor)),
        ]),
        // Only a manual receipt can be withdrawn — it's the entry with no
        // dispatch behind it, and the one to drop when the CC's own data
        // arrives. The server still refuses once production has drawn on it.
        if (c.directReceive) ...[
          const SizedBox(width: DhenuSpacing.xs),
          IconButton(
            icon: Icon(DhenuIcons.trash, size: 18, color: t.gradeC),
            tooltip: l.ccReceiveDeleteReceipt,
            onPressed: () => _deleteManual(context, ref, l, c, name),
          ),
        ] else if (editable) ...[
          const SizedBox(width: DhenuSpacing.sm),
          Icon(DhenuIcons.edit, size: 16, color: t.brand),
        ],
      ]),
    );
  }

  Future<void> _deleteManual(BuildContext context, WidgetRef ref, AppLocalizations l,
      MpConsignment c, String name) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (dctx) => AlertDialog(
        title: Text(l.ccReceiveDeleteConfirmTitle),
        content: Text(l.ppReceiveDeleteManualConfirm(
            litres(c.receiptQty ?? 0, unit: true), name, prettyDate(c.collectionDate))),
        actions: [
          TextButton(onPressed: () => Navigator.of(dctx).pop(false), child: Text(l.commonCancel)),
          TextButton(onPressed: () => Navigator.of(dctx).pop(true), child: Text(l.syncDelete)),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await mpRepo.deleteReceipt(c.id);
      await _refresh(ref);
    } catch (e) {
      if (context.mounted) {
        showDhenuToast(context, friendlyError(context, e), type: DhenuToastType.error);
      }
    }
  }

  Widget _cardHeader(DhenuTokens t, MpConsignment c, String name) => Row(children: [
        Container(
          width: 36, height: 36,
          decoration: BoxDecoration(color: t.brand.withValues(alpha: 0.10), shape: BoxShape.circle),
          child: Icon(DhenuIcons.truck, size: 19, color: t.brand),
        ),
        const SizedBox(width: DhenuSpacing.md),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(name, style: DhenuText.body.copyWith(color: t.ink, fontWeight: FontWeight.w700)),
          if (c.milkType != null) ...[
            const SizedBox(height: 3),
            MilkTypePill(milkType: c.milkType!),
          ],
          const SizedBox(height: 2),
          Text('${c.containerNo ?? c.consignmentNo} · ${prettyDate(c.collectionDate)}',
              style: DhenuText.caption.copyWith(color: t.inkSoft),
              maxLines: 1, overflow: TextOverflow.ellipsis),
        ])),
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
    ref.invalidate(nodeInboundConsignmentsProvider(node.id));
  }
}
