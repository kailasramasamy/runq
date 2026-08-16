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
import '../shared/pending_work.dart';
import '../../widgets/quality_badge.dart';
import '../../widgets/date_stepper.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/dhenu_toast.dart';
import '../../widgets/primary_action.dart';
import '../../widgets/dispatch_type_card.dart';
import '../../widgets/shift_toggle.dart';
import '../../widgets/source_row.dart';
import '../../widgets/tank_gauge.dart';
import '../../utils/friendly_error.dart';
import '../dispatch_history.dart';
import '../../widgets/status_glyph.dart';

/// CC Dispatch tab — availability summary + dispatch form + today's outbound.
class CcDispatchTab extends ConsumerStatefulWidget {
  const CcDispatchTab({super.key, required this.node, this.initialDate, this.initialShift});
  final MpNode node;

  /// Opened from the manual-receive hub, dispatch has to land on the same slot
  /// the operator was just entering — not today's — or a backfilled day looks
  /// empty. Null keeps the tab's own default (today / current shift).
  final String? initialDate;
  final Shift? initialShift;

  @override
  ConsumerState<CcDispatchTab> createState() => _CcDispatchTabState();
}

class _CcDispatchTabState extends ConsumerState<CcDispatchTab> {
  // One editable leg per milk type on hand. Cow and buffalo leave as separate
  // consignments, so each needs its own qty, QC and container — and the operator
  // needs to see which is which rather than two unlabelled numbers.
  final Map<MilkType, DispatchTypeEntry> _entries = {};

  /// The untyped remainder, if any — one leg, held apart from [_entries]
  /// because it has no milk type to key on until the operator names one.
  DispatchTypeEntry? _untyped;
  MpNode? _destPp;
  bool _saving = false;
  bool _closingBusy = false;
  String? _error;
  // No-BMC nodes dispatch each shift separately; BMC nodes pool the whole day.
  late Shift _shift = widget.initialShift ?? shiftFrom(currentShift());
  // Dispatch date — defaults to today; back-date to backfill a missed day so PP
  // downstream can receive it.
  late String _date = widget.initialDate ?? todayIso();

  // The node's dispatch mode decides: a pooled node (day / overnight) sends one
  // shift-null tanker per window, so there is nothing for the operator to pick.
  bool get _perShift => !widget.node.isPooledDispatch;
  bool get _overnight => widget.node.isOvernightPool;
  AvailabilityDateArgs get _availArgs =>
      (nodeId: widget.node.id, date: _date, shift: _perShift ? _shift.name : null);
  NodeDateArgs get _dateArgs => (nodeId: widget.node.id, date: _date);

  String get _prevDate =>
      isoDate(DateTime.parse(_date).subtract(const Duration(days: 1)));

  /// The (date, shift) slots this window is made of — mirrors the server's
  /// receive window. An overnight pool is last night's PM plus this morning's
  /// AM; a day pool is both of today's shifts; per-shift is just the one.
  ///
  /// Named so the dispatched card can show what actually went into the
  /// tanker: "627.1 L" alone doesn't tell an operator whether the evening
  /// milk made it in.
  List<({String date, Shift shift})> get _windowSlots {
    if (_perShift) return [(date: _date, shift: _shift)];
    if (_overnight) {
      return [(date: _prevDate, shift: Shift.pm), (date: _date, shift: Shift.am)];
    }
    return [(date: _date, shift: Shift.am), (date: _date, shift: Shift.pm)];
  }

  /// Litres received into this CC for one slot.
  double _slotQty(List<MpConsignment> inbound, String date, Shift shift) => inbound
      .where((c) =>
          c.kind == 'vmcc_to_cc' && !c.isReversed &&
          c.collectionDate == date && c.shift == shift)
      .fold(0.0, (sum, c) => sum + (c.receiptQty ?? 0));

  // Hard gate: collection must be closed before dispatch. BMC pools the whole
  // day (both shifts closed); no-BMC needs just the selected shift.
  bool _slotClosed(MpShiftStatus? st) {
    if (st == null) return false;
    // Pooled → the whole window must be closed; the server reports both window
    // slots' closure in dayClosed.
    return _perShift ? st.closedFor(_shift.name) : st.dayClosed;
  }

  String _closeFirstMsg(AppLocalizations l) => _overnight
      ? l.ccDispatchCloseFirstPool
      : _perShift
          ? l.ccDispatchCloseFirstShift
          : l.ccDispatchCloseFirstDay;

  // Whole-day close for BMC nodes (shift: null), else the selected shift.
  String? get _closeArg => _perShift ? _shift.name : null;

  Future<void> _closeReceiving() =>
      _runClose(() => mpRepo.closeShift(widget.node.id, _date, shift: _closeArg));

  Future<void> _reopenReceiving() =>
      _runClose(() => mpRepo.reopenShift(widget.node.id, _date, shift: _closeArg));

  Future<void> _runClose(Future<MpShiftStatus> Function() action) async {
    setState(() => _closingBusy = true);
    try {
      await action();
      if (!mounted) return;
      ref.invalidate(shiftStatusForDateProvider(_dateArgs));
      ref.invalidate(nodeAvailabilityForDateProvider(_availArgs));
      ref.invalidate(shiftStatusProvider(widget.node.id));
    } catch (e) {
      if (mounted) showDhenuToast(context, friendlyError(context, e), type: DhenuToastType.error);
    } finally {
      if (mounted) setState(() => _closingBusy = false);
    }
  }

  void _onShiftChanged(Shift s) {
    // re-prefill qty/fat/snf/water from the newly selected shift's availability
    _clearInputs();
    setState(() => _shift = s);
  }

  void _onDateChanged(String d) {
    _clearInputs();
    setState(() { _date = d; _error = null; });
  }

  void _clearInputs() {
    for (final e in _all) {
      e.clear();
    }
  }

  /// Jump this tab to a slot picked from the pending list. Pops the list rather
  /// than stacking a second dispatch screen on top of the one already open.
  Future<void> _goToSlot(BuildContext listContext, MpPendingDispatch slot) async {
    Navigator.of(listContext).pop();
    if (!mounted) return;
    _clearInputs();
    setState(() {
      _date = slot.collectionDate;
      if (slot.shift != null) _shift = shiftFrom(slot.shift!);
    });
  }

  @override
  void initState() {
    super.initState();
    _applyDefaultDest();
  }

  // A CC's parent is its PP — default the destination to it; the picker stays
  // available for the occasional dispatch to a different plant.
  Future<void> _applyDefaultDest() async {
    final parent = widget.node.parentNodeId;
    if (parent == null) return;
    final pps = await ref.read(nodesByTypeProvider('pp').future);
    if (!mounted || _destPp != null) return;
    for (final n in pps) {
      if (n.id == parent) { setState(() => _destPp = n); return; }
    }
  }

  @override
  void dispose() {
    for (final e in _all) {
      e.dispose();
    }
    super.dispose();
  }

  /// Rebuild the per-type legs from availability, keeping anything already typed.
  /// Types that fall to zero (just dispatched) drop out.
  void _syncEntries(MpAvailability? avail) {
    final rows = avail?.dispatchable ?? const <MpTypeAvailability>[];
    // Legacy milk carries no type. It used to be dropped here, which stranded it
    // for good: the header counted it as available while no card ever offered
    // it, so a mixed pre-split tanker could never be sent onward. It gets its
    // own leg, kept out of the type-keyed map because its type isn't known yet.
    // The service groups availability by milk type, so there is at most one.
    final untyped = rows.where((r) => r.milkType == null).firstOrNull;
    if (untyped == null) {
      _untyped?.dispose();
      _untyped = null;
    } else if (_untyped == null || _untyped!.available != untyped.available) {
      _untyped?.dispose();
      _untyped = DispatchTypeEntry(untyped)..prefill();
    }
    final live = <MilkType>{};
    for (final r in rows) {
      if (r.milkType == null) continue;
      final type = milkTypeFrom(r.milkType);
      live.add(type);
      final existing = _entries[type];
      if (existing == null || existing.available != r.available) {
        existing?.dispose();
        _entries[type] = DispatchTypeEntry(r)..prefill();
      }
    }
    for (final gone in _entries.keys.toList()) {
      if (!live.contains(gone)) _entries.remove(gone)?.dispose();
    }
  }

  List<DispatchTypeEntry> get _all =>
      [..._entries.values, ?_untyped];

  List<DispatchTypeEntry> get _selected => _all.where((e) => e.include).toList();

  Future<void> _pickPp(BuildContext context, WidgetRef ref) async {
    final pps = await ref.read(nodesByTypeProvider('pp').future);
    if (!context.mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _PpPicker(
        pps: pps,
        onSelect: (n) => setState(() => _destPp = n),
      ),
    );
  }

  Future<void> _dispatch() async {
    final l = AppLocalizations.of(context);
    if (_destPp == null) {
      setState(() => _error = l.ccDispatchErrorNoDestination);
      return;
    }
    if (!_slotClosed(ref.read(shiftStatusForDateProvider(_dateArgs)).asData?.value)) {
      setState(() => _error = _closeFirstMsg(l));
      return;
    }
    final legs = _selected;
    if (legs.isEmpty) {
      setState(() => _error = l.dispatchErrorNoTypeSelected);
      return;
    }
    // Called out separately from the numeric check: "invalid numbers" would
    // send the operator hunting through the QC fields for a fault that is
    // actually an unpicked milk type.
    if (legs.any((e) => e.needsType && !e.typeChosen)) {
      setState(() => _error = l.dispatchErrorTypeNotChosen);
      return;
    }
    if (legs.any((e) => !e.isValid)) {
      setState(() => _error = l.ccDispatchErrorInvalidNumbers);
      return;
    }
    setState(() { _saving = true; _error = null; });
    try {
      // One consignment per milk type, sent in sequence so each gets its own
      // document number. A failure part-way leaves the earlier legs dispatched —
      // availability refreshes below, so the form reflects what actually went.
      for (final e in legs) {
        await mpRepo.dispatchConsignment({
          'kind': 'cc_to_pp',
          'fromNodeId': widget.node.id,
          'toNodeId': _destPp!.id,
          'collectionDate': _date,
          if (_perShift) 'shift': _shift.name,
          'milkType': milkTypeToApi(e.type),
          'dispatchQty': e.enteredQty,
          'dispatchFat': e.enteredFat,
          'dispatchSnf': e.enteredSnf,
          'dispatchWater': ?e.enteredWater,
          if (e.container.text.isNotEmpty) 'containerNo': e.container.text.trim(),
        });
      }
      setState(() { _saving = false; });
      _clearInputs();
      ref.invalidate(nodeOutboundForDateProvider(_dateArgs));
      ref.invalidate(nodeAvailabilityForDateProvider(_availArgs));
      ref.invalidate(nodeOutboundConsignmentsProvider(widget.node.id));
      ref.invalidate(nodeAvailabilityProvider);
      ref.invalidate(pendingDispatchProvider(widget.node.id));
    } catch (e) {
      setState(() { _saving = false; _error = friendlyError(context, e); });
      ref.invalidate(nodeAvailabilityForDateProvider(_availArgs));
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final availAsync = ref.watch(nodeAvailabilityForDateProvider(_availArgs));
    final outboundAsync = ref.watch(nodeOutboundForDateProvider(_dateArgs));
    final ppNames = {
      for (final n in ref.watch(nodesByTypeProvider('pp')).value ?? const <MpNode>[]) n.id: n.name,
    };

    // Slot breakdown for the dispatched card. An overnight pool straddles two
    // dates, so its previous day has to be fetched as well.
    final inboundHere = ref.watch(nodeInboundByDateProvider(
        (nodeId: widget.node.id, date: _date))).asData?.value ?? const [];
    final inboundPrev = _overnight
        ? ref.watch(nodeInboundByDateProvider(
            (nodeId: widget.node.id, date: _prevDate))).asData?.value ?? const []
        : const <MpConsignment>[];

    availAsync.whenData(_syncEntries);
    final legs = _all;
    final canDispatch = legs.isNotEmpty;
    final closeRequired = !_slotClosed(ref.watch(shiftStatusForDateProvider(_dateArgs)).asData?.value);

    return Scaffold(
      backgroundColor: t.surface,
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: Text(l.dispatchTitle, style: DhenuText.h2.copyWith(color: t.ink)),
      ),
      body: ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(
          DhenuSpacing.screen, DhenuSpacing.lg, DhenuSpacing.screen, DhenuSpacing.x4),
      children: [
        PendingWorkBanner(
          nodeId: widget.node.id,
          kind: PendingWorkKind.toDispatch,
          onOpenSlot: _goToSlot,
        ),
        DateStepper(date: _date, onChanged: _onDateChanged),
        // The shift picker is navigation, not part of availability: it scopes the
        // whole screen. Hiding it inside the availability block stranded a
        // per-shift operator on whichever shift happened to be selected — the
        // other shift's dispatch was screen-less, not missing. Full width so
        // the slot being worked on reads at a glance, next to the date above.
        if (_perShift) ...[
          const SizedBox(height: DhenuSpacing.md),
          ShiftToggle(value: _shift, onChanged: _onShiftChanged, expand: true),
        ],
        const SizedBox(height: DhenuSpacing.lg),
        // Availability only earns its place while there is still something to
        // send. Once the window is out the door it reads "0 / 627.1" — a
        // progress bar for work already finished.
        if (canDispatch) ...[
        Text(l.dispatchAvailability, style: DhenuText.title.copyWith(color: t.ink)),
        const SizedBox(height: DhenuSpacing.sm),
        _availCard(t, l, availAsync, null),
        _closeControl(t, l, availAsync, closeRequired),
        const SizedBox(height: DhenuSpacing.xl),
        Text(l.ccDispatchToPlant, style: DhenuText.title.copyWith(color: t.ink)),
        const SizedBox(height: DhenuSpacing.md),
        _destPicker(context, t, l),
        const SizedBox(height: DhenuSpacing.md),
        // One block per milk type, each naming the milk and its litres, all sent
        // by the single action below.
        for (final e in legs) ...[
          DispatchTypeCard(
            entry: e,
            selectable: legs.length > 1,
            onChanged: () => setState(() {}),
          ),
          const SizedBox(height: DhenuSpacing.md),
        ],
        if (_error != null) ...[
          const SizedBox(height: DhenuSpacing.sm),
          Text(_error!, style: DhenuText.caption.copyWith(color: t.gradeC)),
        ],
        const SizedBox(height: DhenuSpacing.lg),
        PrimaryAction(
          label: legs.length > 1
              ? l.dispatchTankerButtonMulti(_selected.length)
              : l.dispatchTankerButton,
          icon: DhenuIcons.truck,
          onPressed: (_saving || closeRequired) ? null : _dispatch,
          loading: _saving,
        ),
        ] else ...[
          // Everything the removed Outbound list carried — destination, status,
          // consignment no — now lives on this one card, so the screen states
          // the day's dispatch once instead of twice.
          _dispatchedCard(t, l, availAsync, outboundAsync, ppNames,
              inboundHere, inboundPrev),
          // Reopen sits last: correcting a finished slot is the exception, and
          // it used to sit above the very thing it undoes.
          _closeControl(t, l, availAsync, closeRequired),
        ],
        const SizedBox(height: DhenuSpacing.xl),
        _seeDispatchHistoryLink(context, t, l),
      ],
      ),
    );
  }

  /// Status chip for one outbound leg.
  ///
  /// A reversed consignment is neither in transit nor received, so it cannot
  /// be derived from `!inTransit` — doing so painted cancelled dispatches
  /// with a green "received" tick, and operators re-cancelled milk that was
  /// already gone. Same treatment the dispatch-history screen uses.
  Widget _outboundStatus(DhenuTokens t, AppLocalizations l, MpConsignment c) {
    if (c.isReversed) {
      return Text(l.dispatchHistoryReversed,
          style: DhenuText.caption.copyWith(color: t.gradeC));
    }
    return StatusGlyph(
      label: c.inTransit ? l.dispatchStatusTransit : l.dispatchStatusReceived,
      color: c.inTransit ? t.gradeB : t.gradeA,
      received: c.received,
    );
  }

  Widget _seeDispatchHistoryLink(BuildContext context, DhenuTokens t, AppLocalizations l) => Center(
        child: TextButton(
          onPressed: () => Navigator.of(context).push(MaterialPageRoute(
            builder: (_) => Scaffold(
              appBar: AppBar(title: Text(l.ccDispatchHistoryTitle, style: DhenuText.h2.copyWith(color: t.ink))),
              body: DispatchHistory(node: widget.node, kind: 'cc_to_pp'),
            ),
          )),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Text(l.homeSeeFullHistory, style: DhenuText.label.copyWith(color: t.brand)),
            const SizedBox(width: 4),
            Icon(DhenuIcons.chevronRight, size: 16, color: t.brand),
          ]),
        ),
      );

  /// Shown in place of the form once availability is exhausted: how much was
  /// sent out this shift, with the container number for each leg.
  Widget _dispatchedCard(
    DhenuTokens t,
    AppLocalizations l,
    AsyncValue<MpAvailability?> availAsync,
    AsyncValue<List<MpConsignment>> outAsync,
    Map<String, String> ppNames,
    List<MpConsignment> inboundHere,
    List<MpConsignment> inboundPrev,
  ) {
    final dispatched = availAsync.asData?.value?.dispatched ?? 0;
    // The headline figure comes from the availability API, which excludes
    // reversed consignments — so the legs listed beneath it must too, or the
    // parts stop adding up to the total.
    var legs = (outAsync.asData?.value ?? const <MpConsignment>[])
        .where((c) => c.kind == 'cc_to_pp' && !c.isReversed)
        .toList();
    if (_perShift) legs = legs.where((c) => c.shift == _shift).toList();
    return DhenuCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(DhenuIcons.checkCircle, size: 20, color: t.gradeA),
          const SizedBox(width: DhenuSpacing.sm),
          Expanded(
            child: Text(l.dispatchAmountDispatched(litres(dispatched, unit: true)),
                style: DhenuText.title.copyWith(color: t.ink)),
          ),
        ]),
        const SizedBox(height: DhenuSpacing.xs),
        // Name the shape of the dispatch — Pooled / AM / PM — so a pooled
        // tanker is never mistaken for a single shift's load.
        Text(
          _perShift
              ? '${consignmentSlotL10n(l, _shift)} · ${l.dispatchNothingLeftThisShift}'
              : '${l.consignmentSlotPooled} · ${l.dispatchNothingLeft}',
          style: DhenuText.caption.copyWith(color: t.inkSoft),
        ),
        // What went into it, slot by slot. On a pooled window this is the only
        // place the evening and morning halves are shown apart.
        for (final slot in _windowSlots) ...[
          const SizedBox(height: DhenuSpacing.sm),
          Row(children: [
            Icon(slot.shift == Shift.am ? DhenuIcons.sun : DhenuIcons.moon,
                size: 13, color: t.inkSoft),
            const SizedBox(width: DhenuSpacing.xs),
            Expanded(
              child: Text(
                '${prettyDate(slot.date)} · ${consignmentSlotL10n(l, slot.shift)}',
                style: DhenuText.caption.copyWith(color: t.inkSoft),
              ),
            ),
            Text(
              litres(
                  _slotQty(slot.date == _date ? inboundHere : inboundPrev,
                      slot.date, slot.shift),
                  unit: true),
              style: DhenuText.caption.copyWith(color: t.ink),
            ),
          ]),
        ],
        for (final c in legs) ...[
          const SizedBox(height: DhenuSpacing.md),
          Divider(height: 1, color: t.hairline),
          const SizedBox(height: DhenuSpacing.md),
          Row(children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                // Destination first: it is what the removed Outbound list led
                // with, and the operator reads "where did it go" before "which
                // consignment was it".
                Text(ppNames[c.toNodeId] ?? l.dispatchHistoryPlantFallback,
                    style: DhenuText.label.copyWith(color: t.ink)),
                // Each milk type leaves as its own consignment, so the type is
                // what tells two otherwise identical legs apart — and at the
                // far end it decides which raw-milk stock the load lands in.
                if (c.milkType != null) ...[
                  const SizedBox(height: 3),
                  MilkTypePill(milkType: c.milkType!),
                ],
                const SizedBox(height: DhenuSpacing.xs),
                Text(
                  '${c.consignmentNo} · '
                  '${(c.containerNo?.isNotEmpty ?? false) ? l.dispatchContainerLabel(c.containerNo!) : l.dispatchNoContainerNo}',
                  style: DhenuText.caption.copyWith(color: t.inkSoft),
                  maxLines: 1, overflow: TextOverflow.ellipsis,
                ),
              ]),
            ),
            const SizedBox(width: DhenuSpacing.sm),
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text(litres(c.dispatchQty ?? 0, unit: true),
                  style: DhenuText.number(size: 16, color: t.ink)),
              const SizedBox(height: 2),
              _outboundStatus(t, l, c),
            ]),
          ]),
        ],
      ]),
    );
  }

  String _slotLabel(AppLocalizations l) => _overnight
      ? l.ccDispatchSlotPool
      : (_perShift ? (_shift == Shift.am ? l.shiftAm : l.shiftPm) : l.ccDispatchSlotToday);

  /// Receiving-close control gating onward dispatch. Open → an action button
  /// that closes the slot and unlocks dispatch; closed → a confirmation with a
  /// Reopen affordance, which stays available after a dispatch so a missed entry
  /// can still be corrected and the balance sent on.
  Widget _closeControl(
      DhenuTokens t, AppLocalizations l, AsyncValue<MpAvailability?> availAsync, bool closeRequired) {
    if (!closeRequired) return _closedBanner(t, l);
    // Nothing received yet for this slot → nothing to close.
    if ((availAsync.asData?.value?.collected ?? 0) <= 0) return const SizedBox.shrink();
    final label = _overnight
        ? l.ccDispatchCloseReceivingPool
        : (_perShift ? l.ccDispatchCloseReceivingShift(_slotLabel(l)) : l.ccDispatchCloseReceivingToday);
    return Padding(
      padding: const EdgeInsets.only(top: DhenuSpacing.md),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        OutlinedButton.icon(
          onPressed: _closingBusy ? null : _closeReceiving,
          icon: _closingBusy
              ? SizedBox(
                  width: 16, height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2, color: t.brand))
              : Icon(DhenuIcons.lock, size: 18, color: t.brand),
          label: Text(label, style: DhenuText.label.copyWith(color: t.brand, fontWeight: FontWeight.w600)),
          style: OutlinedButton.styleFrom(
            minimumSize: const Size.fromHeight(52),
            side: BorderSide(color: t.brand.withValues(alpha: 0.5)),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(DhenuRadii.input)),
          ),
        ),
        const SizedBox(height: DhenuSpacing.xs),
        Text(l.ccDispatchUnlocksFor(_slotLabel(l)),
            textAlign: TextAlign.center,
            style: DhenuText.caption.copyWith(color: t.inkSoft)),
      ]),
    );
  }

  Widget _closedBanner(DhenuTokens t, AppLocalizations l) {
    return Padding(
      padding: const EdgeInsets.only(top: DhenuSpacing.md),
      child: Container(
        padding: const EdgeInsets.symmetric(
            horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md),
        decoration: BoxDecoration(
          color: t.gradeA.withValues(alpha: 0.10),
          borderRadius: BorderRadius.circular(DhenuRadii.input),
          border: Border.all(color: t.gradeA.withValues(alpha: 0.4)),
        ),
        child: Row(children: [
          Icon(DhenuIcons.checkCircle, size: 18, color: t.gradeA),
          const SizedBox(width: DhenuSpacing.md),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(l.ccDispatchClosedFor(_slotLabel(l)),
                style: DhenuText.label.copyWith(color: t.ink)),
            const SizedBox(height: 2),
            Text(l.ccDispatchReadyForDispatch,
                style: DhenuText.caption.copyWith(color: t.inkSoft)),
          ])),
          TextButton(
            onPressed: _closingBusy ? null : _reopenReceiving,
            child: Text(l.collectReopen, style: DhenuText.label.copyWith(color: t.brand)),
          ),
        ]),
      ),
    );
  }

  /// Gauge for the selected milk type when the node holds more than one, so the
  /// litres on screen are the litres the form will dispatch.
  Widget _availCard(
    DhenuTokens t, AppLocalizations l,
    AsyncValue<MpAvailability?> availAsync, MpTypeAvailability? slice,
  ) {
    return DhenuCard(
      child: availAsync.when(
        loading: () => const DhenuLoadingList(rows: 1),
        error: (e, _) => Text('—', style: DhenuText.body.copyWith(color: t.inkSoft)),
        data: (a) {
          if (a == null) {
            return Text(l.dispatchNoData, style: DhenuText.body.copyWith(color: t.inkSoft));
          }
          final available = slice?.available ?? a.available;
          final collected = slice?.collected ?? a.collected;
          final dispatched = slice?.dispatched ?? a.dispatched;
          return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            TankGauge(current: available, capacity: collected, label: l.dispatchAvailableToDispatch),
            const SizedBox(height: DhenuSpacing.sm),
            Text(
              l.dispatchCollectedDispatched(litres(collected, unit: true), litres(dispatched, unit: true)),
              style: DhenuText.caption.copyWith(color: t.inkSoft),
            ),
          ]);
        },
      ),
    );
  }

  Widget _destPicker(BuildContext context, DhenuTokens t, AppLocalizations l) {
    return GestureDetector(
      onTap: () => _pickPp(context, ref),
      child: Container(
        height: DhenuSpacing.minTap,
        padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.md),
        decoration: BoxDecoration(
          color: t.inputFill,
          borderRadius: BorderRadius.circular(DhenuRadii.input),
          border: Border.all(color: t.hairline),
        ),
        child: Row(children: [
          Expanded(
            child: Text(
              _destPp?.name ?? l.ccDispatchSelectDestinationPlant,
              style: DhenuText.body.copyWith(
                  color: _destPp == null ? t.inkSoft : t.ink),
            ),
          ),
          Icon(DhenuIcons.chevronDown, color: t.inkSoft),
        ]),
      ),
    );
  }

}

class _PpPicker extends StatefulWidget {
  const _PpPicker({required this.pps, required this.onSelect});
  final List<MpNode> pps;
  final ValueChanged<MpNode> onSelect;

  @override
  State<_PpPicker> createState() => _PpPickerState();
}

class _PpPickerState extends State<_PpPicker> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final filtered = _query.isEmpty
        ? widget.pps
        : widget.pps
            .where((n) => n.name.toLowerCase().contains(_query.toLowerCase()))
            .toList();

    return DraggableScrollableSheet(
      initialChildSize: 0.6,
      maxChildSize: 0.9,
      minChildSize: 0.4,
      expand: false,
      builder: (context, ctrl) => Container(
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius:
              const BorderRadius.vertical(top: Radius.circular(DhenuRadii.sheet)),
        ),
        child: Column(children: [
          Container(
            margin: const EdgeInsets.symmetric(vertical: DhenuSpacing.md),
            width: 40, height: 4,
            decoration: BoxDecoration(
                color: t.hairline,
                borderRadius: BorderRadius.circular(DhenuRadii.pill)),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(
                DhenuSpacing.lg, 0, DhenuSpacing.lg, DhenuSpacing.md),
            child: TextField(
              autofocus: true,
              onChanged: (v) => setState(() => _query = v),
              decoration:
                  InputDecoration(hintText: l.ccDispatchSearchPlant, prefixIcon: const Icon(DhenuIcons.search)),
            ),
          ),
          Expanded(
            child: filtered.isEmpty
                ? DhenuEmptyState(
                    icon: DhenuIcons.plant, title: l.ccDispatchNoPlantsFound)
                : ListView.separated(
                    controller: ctrl,
                    keyboardDismissBehavior:
                        ScrollViewKeyboardDismissBehavior.onDrag,
                    itemCount: filtered.length,
                    separatorBuilder: (_, _) =>
                        Divider(height: 1, color: t.hairline),
                    itemBuilder: (_, i) {
                      final n = filtered[i];
                      return SourceRow(
                        title: n.name,
                        litres: n.code,
                        onTap: () {
                          widget.onSelect(n);
                          Navigator.of(context).pop();
                        },
                      );
                    },
                  ),
          ),
        ]),
      ),
    );
  }
}
