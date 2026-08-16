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
import '../../widgets/primary_action.dart';
import '../../widgets/sheet_grabber.dart';
import '../../widgets/dispatch_type_card.dart';
import '../../utils/friendly_error.dart';
import '../../widgets/shift_toggle.dart';
import '../../widgets/source_row.dart';
import '../../widgets/tank_gauge.dart';
import '../dispatch_history.dart';
import '../../widgets/status_glyph.dart';

/// VMCC Dispatch tab — today's availability + dispatch-to-CC form + outbound.
/// Mirrors the CC→PP dispatch flow; here the leg is `vmcc_to_cc`.
class VmccDispatchTab extends ConsumerStatefulWidget {
  const VmccDispatchTab({super.key, required this.node, this.initialDate, this.initialShift});
  final MpNode node;

  /// Slot to open on, used when arriving straight from Record Collection so the
  /// screen lands on the shift just closed rather than on today's current one.
  final String? initialDate;
  final Shift? initialShift;

  @override
  ConsumerState<VmccDispatchTab> createState() => _VmccDispatchTabState();
}

class _VmccDispatchTabState extends ConsumerState<VmccDispatchTab> {
  // One editable leg per milk type on hand. Cow and buffalo leave as separate
  // consignments, so each needs its own qty, QC and container — and the operator
  // needs to see which is which rather than two unlabelled numbers.
  final Map<MilkType, DispatchTypeEntry> _entries = {};

  /// The untyped remainder, if any — one leg, held apart from [_entries]
  /// because it has no milk type to key on until the operator names one.
  DispatchTypeEntry? _untyped;
  MpNode? _destCc;
  bool _saving = false;
  String? _error;
  // No-BMC VMCCs dispatch each shift separately; BMC VMCCs pool the whole day.
  late Shift _shift = widget.initialShift ?? shiftFrom(currentShift());
  // Dispatch date — defaults to today; back-date to backfill a missed day so the
  // CC/PP modules downstream can receive it.
  late String _date = widget.initialDate ?? todayIso();

  // A pooled VMCC (day / overnight) sends one shift-null tanker per window; a
  // per-shift VMCC dispatches AM and PM separately.
  bool get _perShift => !widget.node.isPooledDispatch;
  AvailabilityDateArgs get _availArgs =>
      (nodeId: widget.node.id, date: _date, shift: _perShift ? _shift.name : null);

  String get _prevDate =>
      isoDate(DateTime.parse(_date).subtract(const Duration(days: 1)));

  /// The (date, shift) slots this window is made of — same rule the CC tab
  /// uses. Named so the dispatched card can show what actually went into the
  /// load: a total alone doesn't tell an operator whether the evening milk
  /// made it in.
  List<({String date, Shift shift})> get _windowSlots {
    if (_perShift) return [(date: _date, shift: _shift)];
    if (widget.node.isOvernightPool) {
      return [(date: _prevDate, shift: Shift.pm), (date: _date, shift: Shift.am)];
    }
    return [(date: _date, shift: Shift.am), (date: _date, shift: Shift.pm)];
  }
  NodeDateArgs get _dateArgs => (nodeId: widget.node.id, date: _date);

  // Hard gate: collection must be closed before dispatch. Pooled needs the whole
  // window closed; per-shift needs just the selected shift.
  bool _slotClosed(MpShiftStatus? st) {
    if (st == null) return false;
    return _perShift ? st.closedFor(_shift.name) : st.dayClosed;
  }

  void _onShiftChanged(Shift s) {
    // re-prefill qty/fat/snf/water from the newly selected shift's availability
    _clearInputs();
    setState(() => _shift = s);
  }

  void _onDateChanged(String d) {
    // re-prefill from the newly selected date's availability
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

  // A VMCC's parent is its CC — default the destination to it; the picker stays
  // available for the occasional dispatch to a different centre.
  Future<void> _applyDefaultDest() async {
    final parent = widget.node.parentNodeId;
    if (parent == null) return;
    final ccs = await ref.read(nodesByTypeProvider('cc').future);
    if (!mounted || _destCc != null) return;
    for (final n in ccs) {
      if (n.id == parent) { setState(() => _destCc = n); return; }
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

  Future<void> _pickCc() async {
    final ccs = await ref.read(nodesByTypeProvider('cc').future);
    if (!mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _CcPicker(ccs: ccs, onSelect: (n) => setState(() => _destCc = n)),
    );
  }

  Future<void> _dispatch() async {
    final l = AppLocalizations.of(context);
    if (_destCc == null) {
      setState(() => _error = l.dispatchErrorNoDestination);
      return;
    }
    if (!_slotClosed(ref.read(shiftStatusForDateProvider(_dateArgs)).asData?.value)) {
      setState(() => _error = widget.node.hasBmc ? l.dispatchCloseFirstDay : l.dispatchCloseFirst);
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
          'kind': 'vmcc_to_cc',
          'fromNodeId': widget.node.id,
          'toNodeId': _destCc!.id,
          'collectionDate': _date,
          if (_perShift) 'shift': _shift.name,
          'milkType': milkTypeToApi(e.type),
          'dispatchQty': e.enteredQty,
          'dispatchFat': ?e.enteredFat,
          'dispatchSnf': ?e.enteredSnf,
          'dispatchWater': ?e.enteredWater,
          if (e.container.text.isNotEmpty) 'containerNo': e.container.text.trim(),
        });
      }
      _clearInputs();
      setState(() => _saving = false);
      // Refresh this date's outbound + availability, plus the today-scoped
      // families so the Home "To dispatch" card stays in sync when date == today.
      ref.invalidate(nodeOutboundForDateProvider);
      ref.invalidate(nodeAvailabilityForDateProvider);
      ref.invalidate(nodeOutboundConsignmentsProvider(widget.node.id));
      ref.invalidate(nodeAvailabilityProvider);
      ref.invalidate(pendingDispatchProvider(widget.node.id));
    } catch (e) {
      setState(() { _saving = false; _error = friendlyError(context, e); });
      ref.invalidate(nodeAvailabilityForDateProvider);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final availAsync = ref.watch(nodeAvailabilityForDateProvider(_availArgs));
    final outboundAsync = ref.watch(nodeOutboundForDateProvider(_dateArgs));
    final ccNames = {
      for (final n in ref.watch(nodesByTypeProvider('cc')).value ?? const <MpNode>[])
        n.id: n.name,
    };
    // Collected litres per slot, for the dispatched card's breakdown. Asking
    // availability shift by shift is what splits a pooled window into the
    // halves it was built from.
    final slotQty = {
      for (final s in _windowSlots)
        '${s.date}|${s.shift.name}': ref
                .watch(nodeAvailabilityForDateProvider(
                    (nodeId: widget.node.id, date: s.date, shift: s.shift.name)))
                .asData?.value?.collected ??
            0.0,
    };

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
        DateStepper(date: _date, todayLabel: l.commonToday, onChanged: _onDateChanged),
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
        // send. Once the load is gone it reads "0 / N available" with a full
        // bar — a meter for work already finished.
        if (canDispatch) ...[
        Text(l.dispatchAvailability, style: DhenuText.title.copyWith(color: t.ink)),
        const SizedBox(height: DhenuSpacing.sm),
        _availCard(t, l, availAsync, null),
        const SizedBox(height: DhenuSpacing.xl),
        Text(l.dispatchToCollectionCentre, style: DhenuText.title.copyWith(color: t.ink)),
        const SizedBox(height: DhenuSpacing.md),
        _destPicker(t, l),
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
        if (closeRequired) ...[
          const SizedBox(height: DhenuSpacing.md),
          _closeGateBanner(t, l),
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
          // Everything the removed Outbound list carried — destination,
          // consignment no, status — now lives on this card, so the day's
          // dispatch is stated once instead of twice.
          _dispatchedCard(t, l, availAsync, outboundAsync, ccNames, slotQty),
        ],
        const SizedBox(height: DhenuSpacing.xl),
        _seeDispatchHistoryLink(context, t, l),
      ],
      ),
    );
  }

  Widget _seeDispatchHistoryLink(BuildContext context, DhenuTokens t, AppLocalizations l) => Center(
        child: TextButton(
          onPressed: () => Navigator.of(context).push(MaterialPageRoute(
            builder: (_) => Scaffold(
              appBar: AppBar(title: Text(l.dispatchHistoryTitle, style: DhenuText.h2.copyWith(color: t.ink))),
              body: DispatchHistory(node: widget.node, kind: 'vmcc_to_cc'),
            ),
          )),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Text(l.dispatchSeeFullHistory, style: DhenuText.label.copyWith(color: t.brand)),
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
    Map<String, String> ccNames,
    Map<String, double> slotQty,
  ) {
    final dispatched = availAsync.asData?.value?.dispatched ?? 0;
    var legs = (outAsync.asData?.value ?? const <MpConsignment>[])
        .where((c) => c.kind == 'vmcc_to_cc')
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
        // Name the shape of the load — Pooled / AM / PM — so a pooled tanker
        // is never mistaken for a single shift's collection.
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
              litres(slotQty['${slot.date}|${slot.shift.name}'] ?? 0, unit: true),
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
                // Destination first — it is what the removed Outbound list led
                // with, and answers "where did it go" before "which one was it".
                Text(ccNames[c.toNodeId] ?? l.dispatchHistoryCcFallback,
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
                ),
              ]),
            ),
            const SizedBox(width: DhenuSpacing.sm),
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text(litres(c.dispatchQty ?? 0, unit: true),
                  style: DhenuText.number(size: 16, color: t.ink)),
              const SizedBox(height: 2),
              _legStatus(t, l, c),
            ]),
          ]),
        ],
      ]),
    );
  }

  /// Status chip for one dispatched leg.
  ///
  /// Derived from `received`, never from `!inTransit`: a reversed consignment
  /// is neither, and inferring receipt from the negation painted cancelled
  /// loads with a green tick.
  Widget _legStatus(DhenuTokens t, AppLocalizations l, MpConsignment c) {
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

  /// Hard-gate notice: dispatch stays disabled until collection is closed
  /// (done from the Collection screen).
  Widget _closeGateBanner(DhenuTokens t, AppLocalizations l) {
    return Container(
      padding: const EdgeInsets.symmetric(
          horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md),
      decoration: BoxDecoration(
        color: t.am.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(DhenuRadii.input),
        border: Border.all(color: t.am.withValues(alpha: 0.4)),
      ),
      child: Row(children: [
        Icon(DhenuIcons.lock, size: 18, color: t.amText),
        const SizedBox(width: DhenuSpacing.md),
        Expanded(child: Text(
          widget.node.hasBmc ? l.dispatchCloseFirstDay : l.dispatchCloseFirst,
          style: DhenuText.label.copyWith(color: t.ink),
        )),
      ]),
    );
  }

  Widget _availCard(
    DhenuTokens t, AppLocalizations l,
    AsyncValue<MpAvailability?> availAsync, MpTypeAvailability? slice,
  ) {
    return DhenuCard(
      child: availAsync.when(
        loading: () => const DhenuLoadingList(rows: 1),
        error: (e, _) => Text('—', style: DhenuText.body.copyWith(color: t.inkSoft)),
        data: (a) => a == null
            ? Text(l.dispatchNoData, style: DhenuText.body.copyWith(color: t.inkSoft))
            : Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                TankGauge(
                    current: slice?.available ?? a.available,
                    capacity: slice?.collected ?? a.collected,
                    label: l.dispatchAvailableToDispatch),
                const SizedBox(height: DhenuSpacing.sm),
                Text(
                  l.dispatchCollectedDispatched(
                      litres(slice?.collected ?? a.collected, unit: true),
                      litres(slice?.dispatched ?? a.dispatched, unit: true)),
                  style: DhenuText.caption.copyWith(color: t.inkSoft),
                ),
              ]),
      ),
    );
  }

  Widget _destPicker(DhenuTokens t, AppLocalizations l) {
    return GestureDetector(
      onTap: _pickCc,
      child: Container(
        height: DhenuSpacing.minTap,
        padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.md),
        decoration: BoxDecoration(
          color: t.inputFill,
          borderRadius: BorderRadius.circular(DhenuRadii.input),
          border: Border.all(color: t.hairline),
        ),
        child: Row(children: [
          Expanded(child: Text(
            _destCc?.name ?? l.dispatchSelectDestination,
            style: DhenuText.body.copyWith(color: _destCc == null ? t.inkSoft : t.ink),
          )),
          Icon(DhenuIcons.chevronDown, color: t.inkSoft),
        ]),
      ),
    );
  }

}

class _CcPicker extends StatefulWidget {
  const _CcPicker({required this.ccs, required this.onSelect});
  final List<MpNode> ccs;
  final ValueChanged<MpNode> onSelect;

  @override
  State<_CcPicker> createState() => _CcPickerState();
}

class _CcPickerState extends State<_CcPicker> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final filtered = _query.isEmpty
        ? widget.ccs
        : widget.ccs.where((n) => n.name.toLowerCase().contains(_query.toLowerCase())).toList();

    return DraggableScrollableSheet(
      initialChildSize: 0.6,
      maxChildSize: 0.9,
      minChildSize: 0.4,
      expand: false,
      builder: (context, ctrl) => Container(
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(DhenuRadii.sheet)),
        ),
        child: Column(children: [
          const SheetGrabber(),
          Padding(
            padding: const EdgeInsets.fromLTRB(DhenuSpacing.lg, 0, DhenuSpacing.lg, DhenuSpacing.md),
            child: TextField(
              autofocus: true,
              onChanged: (v) => setState(() => _query = v),
              decoration: InputDecoration(
                  hintText: l.dispatchSearchCentre, prefixIcon: const Icon(DhenuIcons.search)),
            ),
          ),
          Expanded(
            child: filtered.isEmpty
                ? DhenuEmptyState(icon: DhenuIcons.plant, title: l.dispatchNoCentresFound)
                : ListView.separated(
                    controller: ctrl,
                    keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                    itemCount: filtered.length,
                    separatorBuilder: (_, _) => Divider(height: 1, color: t.hairline),
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
