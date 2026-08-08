import 'package:flutter/material.dart';
import '../../theme/dhenu_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../api/mp_repo.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/transfer_providers.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../utils/friendly_error.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_toast.dart';
import '../../widgets/primary_action.dart';
import '../../widgets/shift_toggle.dart';
import 'cc_dispatch_tab.dart';
import 'manual_receive_entry_screen.dart';

/// Manual receive hub — for milk that arrived WITHOUT a dispatch entry (the VMCC
/// operator forgot to mark dispatch, or works off a notebook). The operator
/// picks the date + shift first, then taps a VMCC straight from the list. Each
/// VMCC is flagged "Received" when milk from it is already in for that exact
/// date + shift, so nothing gets entered twice.
///
/// The whole slot finishes here: once every VMCC is in, the close control at the
/// foot of the list closes receiving and hands straight to dispatch, so the
/// operator never has to go back and hunt for the Dispatch tab.
class ManualReceiveScreen extends ConsumerStatefulWidget {
  const ManualReceiveScreen({super.key, required this.vmccs, required this.node});
  final List<MpNode> vmccs;
  final MpNode node;

  @override
  ConsumerState<ManualReceiveScreen> createState() => _ManualReceiveScreenState();
}

class _ManualReceiveScreenState extends ConsumerState<ManualReceiveScreen> {
  DateTime _date = DateTime.now();
  Shift _shift = DateTime.now().hour < 12 ? Shift.am : Shift.pm;
  bool _closingBusy = false;

  String get _ccNodeId => widget.node.id;
  String get _iso => isoDate(_date);

  // A pooled node (BMC / overnight) closes and dispatches the whole window, so
  // it has no per-shift slot to name — same rule the Dispatch tab applies.
  bool get _perShift => !widget.node.isPooledDispatch;
  NodeDateArgs get _dateArgs => (nodeId: _ccNodeId, date: _iso);

  /// The dispatch window that OWNS the (date, shift) being entered.
  ///
  /// Under overnight pooling a PM slot belongs to the NEXT day's window —
  /// milk chilled tonight leaves with tomorrow morning's collection. Every
  /// window operation here (status, availability, close, reopen, dispatch)
  /// has to be anchored on that window, not on the date in the picker.
  ///
  /// Using the picked date meant a PM slot was governed by a window that did
  /// not contain it: entering 5 Aug PM asked whether the (4 Aug PM + 5 Aug AM)
  /// pool was closed — so a finished neighbouring window locked a slot that
  /// was still wide open, and Close would have closed that neighbour rather
  /// than the pool the milk had just gone into.
  String get _anchorIso => widget.node.isOvernightPool && _shift == Shift.pm
      ? isoDate(_date.add(const Duration(days: 1)))
      : _iso;
  NodeDateArgs get _anchorArgs => (nodeId: _ccNodeId, date: _anchorIso);
  AvailabilityDateArgs get _availArgs =>
      (nodeId: _ccNodeId, date: _anchorIso, shift: _perShift ? _shift.name : null);
  String? get _closeArg => _perShift ? _shift.name : null;

  /// True on the evening half of an overnight pool whose morning has not been
  /// collected yet.
  ///
  /// Closing is a WHOLE-WINDOW operation server-side: one call shuts both
  /// (PM, next AM). Offering it here before the morning is in freezes a slot
  /// nobody has collected — which is how an empty AM slot ended up closed
  /// alongside a backfilled PM one. Backfill still works: once the morning
  /// has receipts, the control comes back.
  bool get _poolAwaitsMorning {
    if (!widget.node.isOvernightPool || _shift != Shift.pm) return false;
    final morning = ref
        .watch(nodeAvailabilityForDateProvider(
            (nodeId: _ccNodeId, date: _anchorIso, shift: 'am')))
        .asData?.value?.collected ?? 0;
    return morning <= 0;
  }

  /// Is the slot being written closed? Always the slot itself — a pooled
  /// window spans two slots, and closing one must not lock the other.
  /// `_anchorIso` guarantees the status describes the window this slot is in,
  /// so its own shift flag is the answer for pooled and per-shift alike.
  bool _slotClosed(MpShiftStatus? st) => st != null && st.closedFor(_shift.name);

  /// VMCC id → litres already received at this CC for the selected date + shift.
  /// A whole-day (BMC) consignment carries a null shift and counts for either.
  Map<String, List<MpConsignment>> _receivedFor(List<MpConsignment> inbound) {
    final m = <String, List<MpConsignment>>{};
    for (final c in inbound.where((c) =>
        c.kind == 'vmcc_to_cc' && c.received && (c.shift == null || c.shift == _shift))) {
      (m[c.fromNodeId] ??= []).add(c);
    }
    return m;
  }

  /// Tapping a VMCC opens entry for this date + shift, carrying whatever is
  /// already in for it. The entry screen prefills the types already received
  /// and takes a fresh one for any type still missing, so a VMCC that sent both
  /// cow and buffalo can be completed without a duplicate.
  Future<void> _openEntry(MpNode vmcc, {List<MpConsignment> existing = const []}) async {
    final saved = await Navigator.of(context).push<bool>(MaterialPageRoute(
      builder: (_) => ManualReceiveEntryScreen(
        vmcc: vmcc, ccNodeId: _ccNodeId, date: _date, shift: _shift, existing: existing),
    ));
    if (saved == true) _invalidateSlot();
  }

  void _invalidateSlot() {
    ref.invalidate(nodeInboundByDateProvider(_dateArgs));
    ref.invalidate(nodeAvailabilityForDateProvider(_availArgs));
    ref.invalidate(shiftStatusForDateProvider(_dateArgs));
    ref.invalidate(shiftStatusForDateProvider(_anchorArgs));
    ref.invalidate(shiftStatusProvider(_ccNodeId));
    ref.invalidate(nodeAvailabilityProvider);
  }

  Future<void> _runClose(Future<MpShiftStatus> Function() action) async {
    setState(() => _closingBusy = true);
    try {
      await action();
      if (mounted) _invalidateSlot();
    } catch (e) {
      if (mounted) showDhenuToast(context, friendlyError(context, e), type: DhenuToastType.error);
    } finally {
      if (mounted) setState(() => _closingBusy = false);
    }
  }

  /// Dispatch opens on the slot just entered rather than today's, so a
  /// backfilled day doesn't land the operator on an empty form.
  Future<void> _openDispatch() async {
    final l = AppLocalizations.of(context);
    final t = DT(context);
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => Scaffold(
        appBar: AppBar(title: Text(l.dispatchTitle, style: DhenuText.h2.copyWith(color: t.ink))),
        body: CcDispatchTab(
            node: widget.node, initialDate: _anchorIso, initialShift: _perShift ? _shift : null),
      ),
    ));
    if (mounted) _invalidateSlot();
  }

  // Backfill only: today is the latest selectable date, no future entries.
  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime.now().subtract(const Duration(days: 365)),
      lastDate: DateTime.now(),
    );
    if (picked != null) setState(() => _date = picked);
  }

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final inboundAsync = ref.watch(nodeInboundByDateProvider(_dateArgs));
    final received = _receivedFor(inboundAsync.asData?.value ?? const []);
    final closed = _slotClosed(ref.watch(shiftStatusForDateProvider(_anchorArgs)).asData?.value);
    // Only VMCCs that collect in the selected shift can have milk to receive.
    final shiftVmccs = widget.vmccs.where((v) => v.collectsShift(_shift.name)).toList();
    return Scaffold(
      backgroundColor: t.surface,
      appBar: AppBar(title: Text(l.ccManualReceiveTitle)),
      body: SafeArea(
        child: ListView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: const EdgeInsets.all(DhenuSpacing.screen),
          children: [
            Container(
              padding: const EdgeInsets.all(DhenuSpacing.md),
              decoration: BoxDecoration(
                color: t.brand.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(DhenuRadii.input),
              ),
              child: Row(children: [
                Icon(DhenuIcons.info, size: 18, color: t.brand),
                const SizedBox(width: DhenuSpacing.sm),
                Expanded(child: Text(
                  l.ccManualReceiveInfoBanner,
                  style: DhenuText.caption.copyWith(color: t.inkSoft),
                )),
              ]),
            ),
            const SizedBox(height: DhenuSpacing.lg),
            DhenuCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(l.ccManualReceiveReceivingFor, style: DhenuText.label.copyWith(color: t.brand)),
              const SizedBox(height: DhenuSpacing.md),
              _dateField(t, l),
              const SizedBox(height: DhenuSpacing.md),
              Row(children: [
                Text(l.ccManualReceiveShiftLabel, style: DhenuText.label.copyWith(color: t.inkSoft)),
                const Spacer(),
                ShiftToggle(value: _shift, onChanged: (s) => setState(() => _shift = s)),
              ]),
            ])),
            const SizedBox(height: DhenuSpacing.lg),
            Text(l.ccManualReceiveSelectVmcc, style: DhenuText.label.copyWith(color: t.inkSoft)),
            const SizedBox(height: DhenuSpacing.sm),
            if (shiftVmccs.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: DhenuSpacing.lg),
                child: Text(
                    widget.vmccs.isEmpty
                        ? l.ccManualReceiveNoVmccsLinked
                        : l.ccManualReceiveNoVmccsShift(_shift == Shift.am ? l.shiftAm : l.shiftPm),
                    style: DhenuText.body.copyWith(color: t.inkSoft)),
              )
            else
              // Pending VMCCs first, already-received pushed to the bottom;
              // each group sorted alphabetically by name.
              for (final v in [
                ..._byName(shiftVmccs.where((v) => !received.containsKey(v.id))),
                ..._byName(shiftVmccs.where((v) => received.containsKey(v.id))),
              ]) ...[
                _vmccTile(t, l, v, received[v.id] ?? const [], closed),
                const SizedBox(height: DhenuSpacing.sm),
              ],
            const SizedBox(height: DhenuSpacing.xl),
            _closeSection(t, l, closed),
          ],
        ),
      ),
    );
  }

  /// Foot of the list: close receiving for the slot, then dispatch it onward.
  /// Once closed the operator can still Reopen — that's how a VMCC missed on the
  /// first pass gets added and the balance dispatched as a second load.
  Widget _closeSection(DhenuTokens t, AppLocalizations l, bool closed) {
    if (closed) return _closedSection(t, l);
    final collected =
        ref.watch(nodeAvailabilityForDateProvider(_availArgs)).asData?.value?.collected ?? 0;
    // Nothing in for this slot yet — nothing to close.
    if (collected <= 0) return const SizedBox.shrink();
    // The pool is only half collected: closing now would take the morning
    // with it. Say what happens next instead of offering the action.
    if (_poolAwaitsMorning) {
      return Container(
        padding: const EdgeInsets.symmetric(
            horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md),
        decoration: BoxDecoration(
          color: t.inkSoft.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(DhenuRadii.input),
        ),
        child: Row(children: [
          Icon(DhenuIcons.moon, size: 18, color: t.inkSoft),
          const SizedBox(width: DhenuSpacing.md),
          Expanded(
            child: Text(l.ccReceivePoolWaitsForMorning,
                style: DhenuText.caption.copyWith(color: t.inkSoft)),
          ),
        ]),
      );
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      OutlinedButton.icon(
        onPressed: _closingBusy ? null : () => _runClose(
            () => mpRepo.closeShift(_ccNodeId, _anchorIso, shift: _closeArg)),
        icon: _closingBusy
            ? SizedBox(
                width: 16, height: 16,
                child: CircularProgressIndicator(strokeWidth: 2, color: t.brand))
            : Icon(DhenuIcons.lock, size: 18, color: t.brand),
        label: Text(_closeLabel(l),
            style: DhenuText.label.copyWith(color: t.brand, fontWeight: FontWeight.w600)),
        style: OutlinedButton.styleFrom(
          minimumSize: const Size.fromHeight(52),
          side: BorderSide(color: t.brand.withValues(alpha: 0.5)),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(DhenuRadii.input)),
        ),
      ),
      const SizedBox(height: DhenuSpacing.xs),
      Text(l.ccDispatchUnlocksFor(_slotLabel(l)),
          textAlign: TextAlign.center, style: DhenuText.caption.copyWith(color: t.inkSoft)),
    ]);
  }

  Widget _closedSection(DhenuTokens t, AppLocalizations l) {
    // Closed is not the same as sent. A pool that has already left still reads
    // as closed here, and the screen used to offer Dispatch anyway — pointing
    // the operator at a tanker that is already in transit.
    final avail = ref.watch(nodeAvailabilityForDateProvider(_availArgs)).asData?.value;
    final left = avail?.available ?? 0;
    final gone = avail?.dispatched ?? 0;
    final stillToSend = left > 0;
    return Column(children: [
        Container(
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
              Text(
                  stillToSend
                      ? l.ccDispatchReadyForDispatch
                      : l.dispatchAmountDispatched(litres(gone, unit: true)),
                  style: DhenuText.caption.copyWith(color: t.inkSoft)),
            ])),
            TextButton(
              onPressed: _closingBusy ? null : () => _runClose(
                  () => mpRepo.reopenShift(_ccNodeId, _anchorIso, shift: _closeArg)),
              child: Text(l.collectReopen, style: DhenuText.label.copyWith(color: t.brand)),
            ),
          ]),
        ),
        // Only offer the onward hand-off while something is still owed to the
        // plant. Reopen stays either way — that is how a late VMCC gets added
        // and the balance sent as a second load.
        if (stillToSend) ...[
          const SizedBox(height: DhenuSpacing.md),
          PrimaryAction(
            label: l.ccDispatchToPlant,
            icon: DhenuIcons.truck,
            onPressed: _closingBusy ? null : _openDispatch,
          ),
        ],
      ]);
  }

  String _closeLabel(AppLocalizations l) => widget.node.isOvernightPool
      ? l.ccDispatchCloseReceivingPool
      : (_perShift
          ? l.ccDispatchCloseReceivingShift(_slotLabel(l))
          : l.ccDispatchCloseReceivingToday);

  String _slotLabel(AppLocalizations l) => widget.node.isOvernightPool
      ? l.ccDispatchSlotPool
      : (_perShift ? (_shift == Shift.am ? l.shiftAm : l.shiftPm) : l.ccDispatchSlotToday);

  List<MpNode> _byName(Iterable<MpNode> vmccs) =>
      vmccs.toList()..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));

  Widget _vmccTile(
      DhenuTokens t, AppLocalizations l, MpNode v, List<MpConsignment> receipts, bool closed) {
    final done = receipts.isNotEmpty;
    final qty = receipts.fold<double>(0, (a, c) => a + (c.receiptQty ?? 0));
    return DhenuCard(
      padding: const EdgeInsets.symmetric(
          horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md),
      // A closed slot locks its receipts server-side — say so here rather than
      // letting the operator fill the form and hit a rejection on Save.
      onTap: closed
          ? () => showDhenuToast(context, l.ccReceiveLockedForDispatch)
          : () => _openEntry(v, existing: receipts),
      child: Row(children: [
        Container(
          width: 40, height: 40,
          decoration: BoxDecoration(
              color: t.brand.withValues(alpha: 0.10), shape: BoxShape.circle),
          child: Icon(DhenuIcons.store, size: 20, color: t.brand),
        ),
        const SizedBox(width: DhenuSpacing.md),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(v.name, style: DhenuText.body.copyWith(color: t.ink, fontWeight: FontWeight.w700)),
          const SizedBox(height: 2),
          Text(v.code, style: DhenuText.caption.copyWith(color: t.inkSoft)),
        ])),
        if (done) _receivedBadge(t, l, qty)
        else Icon(DhenuIcons.chevronRight, color: t.inkSoft),
      ]),
    );
  }

  Widget _receivedBadge(DhenuTokens t, AppLocalizations l, double qty) => Container(
        padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.sm, vertical: 2),
        decoration: BoxDecoration(
          color: t.gradeA.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(DhenuRadii.pill),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(DhenuIcons.check, size: 13, color: t.gradeA),
          const SizedBox(width: 3),
          Text(l.ccManualReceiveReceivedBadge(litres(qty)), style: DhenuText.caption.copyWith(color: t.gradeA)),
        ]),
      );

  Widget _dateField(DhenuTokens t, AppLocalizations l) => InkWell(
        onTap: _pickDate,
        borderRadius: BorderRadius.circular(DhenuRadii.input),
        child: InputDecorator(
          decoration: InputDecoration(labelText: l.ccManualReceiveCollectionDate),
          child: Row(children: [
            Expanded(child: Text(prettyDate(isoDate(_date)), style: DhenuText.body.copyWith(color: t.ink))),
            Icon(DhenuIcons.calendar, size: 18, color: t.inkSoft),
          ]),
        ),
      );
}
