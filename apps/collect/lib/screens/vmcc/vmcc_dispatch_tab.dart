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
import '../../widgets/date_stepper.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/primary_action.dart';
import '../../widgets/sheet_grabber.dart';
import '../../widgets/shift_toggle.dart';
import '../../widgets/source_row.dart';
import '../../widgets/tank_gauge.dart';
import '../dispatch_history.dart';

/// VMCC Dispatch tab — today's availability + dispatch-to-CC form + outbound.
/// Mirrors the CC→PP dispatch flow; here the leg is `vmcc_to_cc`.
class VmccDispatchTab extends ConsumerStatefulWidget {
  const VmccDispatchTab({super.key, required this.node});
  final MpNode node;

  @override
  ConsumerState<VmccDispatchTab> createState() => _VmccDispatchTabState();
}

class _VmccDispatchTabState extends ConsumerState<VmccDispatchTab> {
  final _qtyCtrl = TextEditingController();
  final _fatCtrl = TextEditingController();
  final _snfCtrl = TextEditingController();
  final _waterCtrl = TextEditingController();
  final _containerCtrl = TextEditingController();
  MpNode? _destCc;
  bool _saving = false;
  String? _error;
  // No-BMC VMCCs dispatch each shift separately; BMC VMCCs pool the whole day.
  Shift _shift = shiftFrom(currentShift());
  // Dispatch date — defaults to today; back-date to backfill a missed day so the
  // CC/PP modules downstream can receive it.
  String _date = todayIso();

  bool get _perShift => !widget.node.hasBmc;
  AvailabilityDateArgs get _availArgs =>
      (nodeId: widget.node.id, date: _date, shift: _perShift ? _shift.name : null);
  NodeDateArgs get _dateArgs => (nodeId: widget.node.id, date: _date);

  // Hard gate: collection must be closed before dispatch. BMC pools the whole
  // day (both shifts closed); no-BMC needs just the selected shift.
  bool _slotClosed(MpShiftStatus? st) {
    if (st == null) return false;
    return widget.node.hasBmc ? st.dayClosed : st.closedFor(_shift.name);
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
    _qtyCtrl.clear();
    _fatCtrl.clear();
    _snfCtrl.clear();
    _waterCtrl.clear();
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
    _qtyCtrl.dispose();
    _fatCtrl.dispose();
    _snfCtrl.dispose();
    _waterCtrl.dispose();
    _containerCtrl.dispose();
    super.dispose();
  }

  void _prefillFromAvailability(MpAvailability? avail) {
    if (avail == null) return;
    if (_qtyCtrl.text.isEmpty) _qtyCtrl.text = avail.available.toStringAsFixed(1);
    if (_fatCtrl.text.isEmpty && avail.avgFat != null) _fatCtrl.text = avail.avgFat!.toStringAsFixed(1);
    if (_snfCtrl.text.isEmpty && avail.avgSnf != null) _snfCtrl.text = avail.avgSnf!.toStringAsFixed(1);
    if (_waterCtrl.text.isEmpty && avail.avgWater != null) _waterCtrl.text = avail.avgWater!.toStringAsFixed(1);
  }

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
    final qty = double.tryParse(_qtyCtrl.text);
    final fat = double.tryParse(_fatCtrl.text);
    final snf = double.tryParse(_snfCtrl.text);
    final water = double.tryParse(_waterCtrl.text);
    if (qty == null || qty <= 0) {
      setState(() => _error = l.dispatchErrorInvalidQty);
      return;
    }
    final available = ref.read(nodeAvailabilityForDateProvider(_availArgs)).asData?.value?.available ?? 0;
    if (qty - available > 0.001) {
      setState(() => _error = l.dispatchErrorOverQty(available.toStringAsFixed(1)));
      return;
    }
    setState(() { _saving = true; _error = null; });
    try {
      await mpRepo.dispatchConsignment({
        'kind': 'vmcc_to_cc',
        'fromNodeId': widget.node.id,
        'toNodeId': _destCc!.id,
        'collectionDate': _date,
        if (_perShift) 'shift': _shift.name,
        'dispatchQty': qty,
        'dispatchFat': ?fat,
        'dispatchSnf': ?snf,
        'dispatchWater': ?water,
        if (_containerCtrl.text.isNotEmpty) 'containerNo': _containerCtrl.text.trim(),
      });
      _clearInputs();
      _containerCtrl.clear();
      setState(() => _saving = false);
      // Refresh this date's outbound + availability, plus the today-scoped
      // families so the Home "To dispatch" card stays in sync when date == today.
      ref.invalidate(nodeOutboundForDateProvider);
      ref.invalidate(nodeAvailabilityForDateProvider);
      ref.invalidate(nodeOutboundConsignmentsProvider(widget.node.id));
      ref.invalidate(nodeAvailabilityProvider);
    } catch (e) {
      setState(() { _saving = false; _error = '$e'; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final availAsync = ref.watch(nodeAvailabilityForDateProvider(_availArgs));
    final outboundAsync = ref.watch(nodeOutboundForDateProvider(_dateArgs));
    availAsync.whenData(_prefillFromAvailability);
    final canDispatch = (availAsync.asData?.value?.available ?? 0) > 0;
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
        DateStepper(date: _date, todayLabel: l.commonToday, onChanged: _onDateChanged),
        const SizedBox(height: DhenuSpacing.lg),
        Row(children: [
          Expanded(child: Text(l.dispatchAvailability, style: DhenuText.title.copyWith(color: t.ink))),
          if (_perShift) ShiftToggle(value: _shift, onChanged: _onShiftChanged),
        ]),
        const SizedBox(height: DhenuSpacing.sm),
        _availCard(t, l, availAsync),
        const SizedBox(height: DhenuSpacing.xl),
        if (canDispatch) ...[
        Text(l.dispatchToCollectionCentre, style: DhenuText.title.copyWith(color: t.ink)),
        const SizedBox(height: DhenuSpacing.md),
        _destPicker(t, l),
        const SizedBox(height: DhenuSpacing.md),
        TextField(
          controller: _qtyCtrl,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          textCapitalization: TextCapitalization.none,
          decoration: InputDecoration(hintText: l.dispatchQtyHint),
        ),
        const SizedBox(height: DhenuSpacing.md),
        Row(children: [
          Expanded(child: TextField(
            controller: _fatCtrl,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            textCapitalization: TextCapitalization.none,
            decoration: const InputDecoration(hintText: 'FAT %'),
          )),
          const SizedBox(width: DhenuSpacing.md),
          Expanded(child: TextField(
            controller: _snfCtrl,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            textCapitalization: TextCapitalization.none,
            decoration: const InputDecoration(hintText: 'SNF %'),
          )),
        ]),
        const SizedBox(height: DhenuSpacing.md),
        TextField(
          controller: _waterCtrl,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          textCapitalization: TextCapitalization.none,
          decoration: const InputDecoration(hintText: 'Water % (optional)'),
        ),
        const SizedBox(height: DhenuSpacing.md),
        TextField(
          controller: _containerCtrl,
          textCapitalization: TextCapitalization.characters,
          decoration: InputDecoration(hintText: l.dispatchContainerHint),
        ),
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
          label: l.dispatchTankerButton,
          icon: DhenuIcons.truck,
          onPressed: (_saving || closeRequired) ? null : _dispatch,
          loading: _saving,
        ),
        ] else ...[
          _dispatchedCard(t, l, availAsync, outboundAsync),
        ],
        const SizedBox(height: DhenuSpacing.xl),
        Text(l.dispatchTodaysOutbound, style: DhenuText.title.copyWith(color: t.ink)),
        const SizedBox(height: DhenuSpacing.sm),
        _outboundList(t, l, outboundAsync),
        _seeDispatchHistoryLink(context, t),
      ],
      ),
    );
  }

  Widget _seeDispatchHistoryLink(BuildContext context, DhenuTokens t) => Center(
        child: TextButton(
          onPressed: () => Navigator.of(context).push(MaterialPageRoute(
            builder: (_) => Scaffold(
              appBar: AppBar(title: Text('Dispatch history', style: DhenuText.h2.copyWith(color: t.ink))),
              body: DispatchHistory(node: widget.node, kind: 'vmcc_to_cc'),
            ),
          )),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Text('See full history', style: DhenuText.label.copyWith(color: t.brand)),
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
        Text(_perShift ? l.dispatchNothingLeftThisShift : l.dispatchNothingLeft,
            style: DhenuText.caption.copyWith(color: t.inkSoft)),
        for (final c in legs) ...[
          const SizedBox(height: DhenuSpacing.md),
          Divider(height: 1, color: t.hairline),
          const SizedBox(height: DhenuSpacing.md),
          Row(children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(c.consignmentNo, style: DhenuText.label.copyWith(color: t.ink)),
                const SizedBox(height: DhenuSpacing.xs),
                Text(
                  (c.containerNo?.isNotEmpty ?? false)
                      ? l.dispatchContainerLabel(c.containerNo!)
                      : l.dispatchNoContainerNo,
                  style: DhenuText.caption.copyWith(color: t.inkSoft),
                ),
              ]),
            ),
            Text(litres(c.dispatchQty ?? 0, unit: true),
                style: DhenuText.number(size: 16, color: t.ink)),
          ]),
        ],
      ]),
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

  Widget _availCard(DhenuTokens t, AppLocalizations l, AsyncValue<MpAvailability?> availAsync) {
    return DhenuCard(
      child: availAsync.when(
        loading: () => const DhenuLoadingList(rows: 1),
        error: (e, _) => Text('—', style: DhenuText.body.copyWith(color: t.inkSoft)),
        data: (a) => a == null
            ? Text(l.dispatchNoData, style: DhenuText.body.copyWith(color: t.inkSoft))
            : Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                TankGauge(current: a.available, capacity: a.collected, label: l.dispatchAvailableToDispatch),
                const SizedBox(height: DhenuSpacing.sm),
                Text(
                  l.dispatchCollectedDispatched(litres(a.collected, unit: true), litres(a.dispatched, unit: true)),
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

  String _outboundTitle(AppLocalizations l, MpConsignment c) {
    if (c.shift == null) return c.consignmentNo;
    return c.shift == Shift.am ? l.dispatchShiftAm : l.dispatchShiftPm;
  }

  /// Full consignment id shown below the shift label so it never truncates.
  String? _outboundSubtitle(MpConsignment c) =>
      c.shift == null ? null : c.consignmentNo;

  Widget _outboundList(DhenuTokens t, AppLocalizations l, AsyncValue<List<MpConsignment>> outAsync) {
    return outAsync.when(
      loading: () => const DhenuLoadingList(rows: 2),
      error: (_, _) => const SizedBox.shrink(),
      data: (all) {
        final outbound = all.where((c) => c.kind == 'vmcc_to_cc').toList();
        if (outbound.isEmpty) {
          return DhenuEmptyState(
            icon: DhenuIcons.truck,
            title: l.dispatchNoDispatchesToday,
            subtitle: l.dispatchNoDispatchesSubtitle,
          );
        }
        return DhenuCard(
          padding: EdgeInsets.zero,
          child: Column(children: [
            for (var i = 0; i < outbound.length; i++) ...[
              if (i > 0) Divider(height: 1, color: t.hairline),
              SourceRow(
                title: _outboundTitle(l, outbound[i]),
                subtitle: _outboundSubtitle(outbound[i]),
                litres: litres(outbound[i].dispatchQty ?? 0, unit: true),
                trailingStatus: Text(
                  outbound[i].inTransit ? l.dispatchStatusTransit : l.dispatchStatusReceived,
                  style: DhenuText.caption.copyWith(
                    color: outbound[i].inTransit ? t.gradeB : t.gradeA,
                  ),
                ),
              ),
            ],
          ]),
        );
      },
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
