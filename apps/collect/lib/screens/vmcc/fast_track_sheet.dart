import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/mp_models.dart';
import '../../api/mp_repo.dart';
import '../../l10n/app_localizations.dart';
import '../../l10n/l10n_helpers.dart';
import '../../providers/mp_refresh.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../utils/friendly_error.dart';
import '../../widgets/dhenu_toast.dart';
import '../../widgets/primary_action.dart';
import '../../widgets/quality_badge.dart';
import '../../widgets/sheet_grabber.dart';

/// Confirm sheet for the single-site chain — VMCC → CC → plant in one action.
///
/// The tap is cheap; what it commits is not. Six documents and a raw-milk stock
/// batch land at once, so the operator sees the real figures and the real steps
/// before any of it is written. The plan is fetched fresh when the sheet opens
/// and re-derived server-side on Send, so what runs is what's on hand now.
Future<void> showFastTrackSheet(
  BuildContext context, {
  required MpNode node,
  String? date,
  Shift? shift,
  bool allClosedShifts = false,
}) =>
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      // Without a ceiling the sheet grows to the full screen and puts its title
      // under the status bar. Capped, the content scrolls inside instead.
      constraints: BoxConstraints(
          maxHeight: MediaQuery.of(context).size.height * 0.82),
      builder: (_) => _FastTrackSheet(
          node: node, date: date, shift: shift, allClosedShifts: allClosedShifts),
    );

class _FastTrackSheet extends ConsumerStatefulWidget {
  const _FastTrackSheet({
    required this.node, this.date, this.shift, this.allClosedShifts = false,
  });
  final MpNode node;

  /// Send every shift the operator has already closed, not just one. Set when
  /// both of the day's slots are waiting — the server plans one chain per
  /// closed slot, so AM and PM go in the same confirmed action.
  final bool allClosedShifts;

  /// The slot the operator is standing on. Both fall back to now, but a caller
  /// that knows better must say so: Record Collection can be open on last
  /// night's PM at six in the morning, and planning "today, current shift"
  /// there asked about a slot that had already gone out hours ago.
  final String? date;
  final Shift? shift;

  @override
  ConsumerState<_FastTrackSheet> createState() => _FastTrackSheetState();
}

class _FastTrackSheetState extends ConsumerState<_FastTrackSheet> {
  MpFastTrackPlan? _plan;
  Object? _error;
  bool _sending = false;

  String get _date => widget.date ?? todayIso();

  /// A pooled VMCC sends its whole window as one tanker, so naming a shift
  /// would scope the plan to a slot it can't draw against.
  String? get _shift => widget.node.isPooledDispatch || widget.allClosedShifts
      ? null
      : (widget.shift?.name ?? currentShift());

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final plan = await mpRepo.fastTrackPlan(_date,
          shift: _shift, vmccNodeIds: [widget.node.id]);
      if (mounted) setState(() => _plan = plan);
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _send() async {
    setState(() => _sending = true);
    try {
      final res = await mpRepo.fastTrackRun(_date,
          shift: _shift, vmccNodeIds: [widget.node.id]);
      // Every tier's figures moved, so drop the whole node-scoped cache rather
      // than guessing which providers this operator's other modes are watching.
      refreshMpNodeData(ref);
      if (!mounted) return;
      final l = AppLocalizations.of(context);
      Navigator.of(context).pop();
      final failure = res.failure;
      showDhenuToast(
        context,
        failure == null
            ? l.fastTrackSuccess(
                litres(res.receivedQty, unit: true), res.plan.plantName ?? '')
            : l.fastTrackPartial(failure.vmccName),
        type: failure == null ? DhenuToastType.success : DhenuToastType.error,
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _sending = false);
      showDhenuToast(context, friendlyError(context, e), type: DhenuToastType.error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(DhenuRadii.sheet)),
      ),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
              DhenuSpacing.lg, 0, DhenuSpacing.lg, DhenuSpacing.lg),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Center(child: SheetGrabber()),
            Flexible(child: _body(t, l)),
          ]),
        ),
      ),
    );
  }

  Widget _body(DhenuTokens t, AppLocalizations l) {
    if (_error != null) return _message(t, DhenuIcons.cloudOff, friendlyError(context, _error!), null);
    final plan = _plan;
    if (plan == null) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: DhenuSpacing.xl),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const CircularProgressIndicator(),
          const SizedBox(height: DhenuSpacing.md),
          Text(l.fastTrackChecking, style: DhenuText.caption.copyWith(color: t.inkSoft)),
        ]),
      );
    }
    if (plan.isEmpty) {
      return _message(t, DhenuIcons.checkCircle, l.fastTrackNothingTitle,
          plan.skipped.isEmpty ? l.fastTrackNothingSubtitle : plan.skipped.first.reason);
    }
    // Header and actions are pinned; only the figures and steps scroll. The
    // Send button is the one thing that must never be below the fold.
    final v = plan.vmccs.first;
    return Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(l.fastTrackTitle(plan.plantName ?? ''),
            style: DhenuText.h2.copyWith(color: t.ink)),
        const SizedBox(height: 2),
        Text('${v.vmccName} · ${prettyDate(plan.collectionDate)}',
            style: DhenuText.caption.copyWith(color: t.inkSoft)),
        const SizedBox(height: DhenuSpacing.lg),
        Flexible(
          child: SingleChildScrollView(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              // One block per slot: a centre that closed both AM and PM sends
              // both here, as separate consignments carrying their own shift.
              for (final each in plan.vmccs) ...[
                if (each != plan.vmccs.first) const SizedBox(height: DhenuSpacing.lg),
                _slotHeading(t, l, each),
                const SizedBox(height: DhenuSpacing.sm),
                _vmccBlock(t, l, each),
              ],
              if (plan.vmccs.length > 1) ...[
                const SizedBox(height: DhenuSpacing.md),
                Row(children: [
                  Expanded(
                    child: Text(l.collectCansTotal,
                        style: DhenuText.label.copyWith(
                            color: t.ink, fontWeight: FontWeight.w700)),
                  ),
                  Text(litres(plan.totalQty, unit: true),
                      style: DhenuText.number(size: 18, color: t.brand)),
                ]),
              ],
              // The route is the same for every slot in this sheet, so it is
              // stated once at the end rather than repeated under each block.
              const SizedBox(height: DhenuSpacing.lg),
              _route(t, [v.vmccName, v.ccName, v.ppName]),
              const SizedBox(height: DhenuSpacing.xs),
              Text(l.fastTrackChainSummary,
                  style: DhenuText.caption.copyWith(color: t.inkSoft)),
              // A pooled centre closes its whole window, not the shift on
              // screen — say so, because the operator is about to lose the
              // ability to record this evening's milk without reopening.
              if (v.vmccSlots.length > 1) ...[
                const SizedBox(height: DhenuSpacing.md),
                Container(
                  padding: const EdgeInsets.all(DhenuSpacing.sm),
                  decoration: BoxDecoration(
                    color: t.gradeB.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(DhenuRadii.input),
                  ),
                  child: Row(children: [
                    Icon(DhenuIcons.warning, size: 16, color: t.gradeB),
                    const SizedBox(width: DhenuSpacing.sm),
                    Expanded(
                      child: Text(l.fastTrackClosesWholeDay,
                          style: DhenuText.caption.copyWith(color: t.inkSoft)),
                    ),
                  ]),
                ),
              ],
            ]),
          ),
        ),
        const SizedBox(height: DhenuSpacing.lg),
        // Cancel takes only the width of its own word — including a longer one
        // in Kannada or Tamil — and Send gets everything left. Sharing the row
        // evenly starved the figure that matters: a four-digit total reads
        // "9,999.5 L", and it must never be the thing that gets ellipsised.
        Row(children: [
          OutlinedButton(
            onPressed: _sending ? null : () => Navigator.of(context).pop(),
            style: OutlinedButton.styleFrom(
              minimumSize: const Size(0, 48),
              padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.lg),
            ),
            child: Text(l.commonCancel),
          ),
          const SizedBox(width: DhenuSpacing.md),
          Expanded(
            child: PrimaryAction(
              label: '${l.fastTrackSend} · ${litres(plan.totalQty, unit: true)}',
              icon: DhenuIcons.truck,
              loading: _sending,
              onPressed: _sending ? null : _send,
            ),
          ),
        ]),
      ]);
  }

  /// The slot a block covers — sun/moon and the shift name, so two blocks in
  /// one sheet can't be mistaken for one another.
  Widget _slotHeading(DhenuTokens t, AppLocalizations l, MpFastTrackVmcc v) {
    final am = v.shift == Shift.am;
    return Row(children: [
      Icon(v.shift == null ? DhenuIcons.calendar : (am ? DhenuIcons.sun : DhenuIcons.moon),
          size: 14, color: v.shift == null ? t.inkSoft : (am ? t.amText : t.pm)),
      const SizedBox(width: DhenuSpacing.xs),
      Expanded(
        child: Text(consignmentSlotL10n(l, v.shift),
            style: DhenuText.label.copyWith(
                color: v.shift == null ? t.inkSoft : (am ? t.amText : t.pm),
                fontWeight: FontWeight.w700)),
      ),
      Text(litres(v.totalQty, unit: true),
          style: DhenuText.number(size: 15, color: t.ink)),
    ]);
  }

  /// What leaves this centre, and where it ends up.
  Widget _vmccBlock(DhenuTokens t, AppLocalizations l, MpFastTrackVmcc v) =>
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // A bordered table, not a loose list: the quantities are the figures the
        // operator is signing off, and right-aligning them in a fixed column is
        // the only way two rows line up when one type pill is twice as wide as
        // the other.
        Container(
          decoration: BoxDecoration(
            color: t.card,
            borderRadius: BorderRadius.circular(DhenuRadii.card),
            border: Border.all(color: t.hairline),
          ),
          padding: const EdgeInsets.symmetric(
              horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md),
          child: Column(children: [
            for (final leg in v.legs) ...[
              if (leg != v.legs.first)
                Divider(color: t.hairline, height: DhenuSpacing.lg),
              _legRow(t, leg),
            ],
          ]),
        ),
      ]);

  /// One milk type: name and reading on the left, litres right-aligned.
  Widget _legRow(DhenuTokens t, MpFastTrackLeg leg) => Row(children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            if (leg.milkType != null) MilkTypePill(milkType: leg.milkType!),
            // FAT / SNF stay in the Latin abbreviations the meters print, as
            // every other reading screen shows them.
            if (leg.fat != null && leg.snf != null) ...[
              const SizedBox(height: 3),
              Text('FAT ${leg.fat!.toStringAsFixed(1)} · SNF ${leg.snf!.toStringAsFixed(1)}',
                  style: DhenuText.caption.copyWith(color: t.inkSoft)),
            ],
          ]),
        ),
        const SizedBox(width: DhenuSpacing.md),
        Text(litres(leg.qty, unit: true),
            style: DhenuText.number(size: 20, color: t.ink)),
      ]);

  /// VMCC → CC → plant, wrapped so long centre names don't run off the edge.
  Widget _route(DhenuTokens t, List<String> stops) => Wrap(
        spacing: DhenuSpacing.xs,
        runSpacing: DhenuSpacing.xs,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          for (var i = 0; i < stops.length; i++) ...[
            if (i > 0) Icon(DhenuIcons.arrowRight, size: 14, color: t.inkSoft),
            Text(stops[i],
                style: DhenuText.label.copyWith(
                    color: i == stops.length - 1 ? t.brand : t.ink,
                    fontWeight: FontWeight.w600)),
          ],
        ],
      );

  Widget _message(DhenuTokens t, IconData icon, String title, String? subtitle) => Padding(
        padding: const EdgeInsets.only(bottom: DhenuSpacing.lg),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 34, color: t.inkSoft),
          const SizedBox(height: DhenuSpacing.md),
          Text(title, style: DhenuText.title.copyWith(color: t.ink), textAlign: TextAlign.center),
          if (subtitle != null) ...[
            const SizedBox(height: DhenuSpacing.xs),
            Text(subtitle,
                style: DhenuText.caption.copyWith(color: t.inkSoft), textAlign: TextAlign.center),
          ],
        ]),
      );
}
