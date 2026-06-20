import 'package:flutter/material.dart';
import '../../theme/dhenu_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../api/mp_repo.dart';
import '../../providers/transfer_providers.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/primary_action.dart';
import '../../widgets/shift_toggle.dart';
import '../../widgets/source_row.dart';
import '../../widgets/tank_gauge.dart';

/// CC Dispatch tab — availability summary + dispatch form + today's outbound.
class CcDispatchTab extends ConsumerStatefulWidget {
  const CcDispatchTab({super.key, required this.node});
  final MpNode node;

  @override
  ConsumerState<CcDispatchTab> createState() => _CcDispatchTabState();
}

class _CcDispatchTabState extends ConsumerState<CcDispatchTab> {
  final _qtyCtrl = TextEditingController();
  final _fatCtrl = TextEditingController();
  final _snfCtrl = TextEditingController();
  final _containerCtrl = TextEditingController();
  MpNode? _destPp;
  bool _saving = false;
  String? _error;
  // No-BMC nodes dispatch each shift separately; BMC nodes pool the whole day.
  Shift _shift = shiftFrom(currentShift());

  bool get _perShift => !widget.node.hasBmc;
  AvailabilityArgs get _availArgs =>
      (nodeId: widget.node.id, shift: _perShift ? _shift.name : null);

  // Hard gate: collection must be closed before dispatch. BMC pools the whole
  // day (both shifts closed); no-BMC needs just the selected shift.
  bool _slotClosed(MpShiftStatus? st) {
    if (st == null) return false;
    return widget.node.hasBmc ? st.dayClosed : st.closedFor(_shift.name);
  }

  String get _closeFirstMsg => widget.node.hasBmc
      ? "Close today's collection before dispatching."
      : 'Close collection for this shift before dispatching.';

  void _onShiftChanged(Shift s) {
    // re-prefill qty/fat/snf from the newly selected shift's availability
    _qtyCtrl.clear();
    _fatCtrl.clear();
    _snfCtrl.clear();
    setState(() => _shift = s);
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
    _qtyCtrl.dispose();
    _fatCtrl.dispose();
    _snfCtrl.dispose();
    _containerCtrl.dispose();
    super.dispose();
  }

  void _prefillFromAvailability(MpAvailability? avail) {
    if (avail == null) return;
    if (_qtyCtrl.text.isEmpty) {
      _qtyCtrl.text = avail.available.toStringAsFixed(1);
    }
    if (_fatCtrl.text.isEmpty && avail.avgFat != null) {
      _fatCtrl.text = avail.avgFat!.toStringAsFixed(1);
    }
    if (_snfCtrl.text.isEmpty && avail.avgSnf != null) {
      _snfCtrl.text = avail.avgSnf!.toStringAsFixed(1);
    }
  }

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
    if (_destPp == null) {
      setState(() => _error = 'Select a destination plant');
      return;
    }
    if (!_slotClosed(ref.read(shiftStatusProvider(widget.node.id)).asData?.value)) {
      setState(() => _error = _closeFirstMsg);
      return;
    }
    final qty = double.tryParse(_qtyCtrl.text);
    final fat = double.tryParse(_fatCtrl.text);
    final snf = double.tryParse(_snfCtrl.text);
    if (qty == null || fat == null || snf == null) {
      setState(() => _error = 'Enter valid numbers');
      return;
    }
    final available = ref.read(nodeAvailabilityProvider(_availArgs)).asData?.value?.available ?? 0;
    if (qty - available > 0.001) {
      setState(() => _error = 'Only ${available.toStringAsFixed(1)} L available to dispatch');
      return;
    }
    setState(() { _saving = true; _error = null; });
    try {
      await mpRepo.dispatchConsignment({
        'kind': 'cc_to_pp',
        'fromNodeId': widget.node.id,
        'toNodeId': _destPp!.id,
        'collectionDate': todayIso(),
        if (_perShift) 'shift': _shift.name,
        'dispatchQty': qty,
        'dispatchFat': fat,
        'dispatchSnf': snf,
        if (_containerCtrl.text.isNotEmpty) 'containerNo': _containerCtrl.text.trim(),
      });
      setState(() { _saving = false; });
      _qtyCtrl.clear();
      _fatCtrl.clear();
      _snfCtrl.clear();
      _containerCtrl.clear();
      ref.invalidate(nodeOutboundConsignmentsProvider(widget.node.id));
      ref.invalidate(nodeAvailabilityProvider(_availArgs));
    } catch (e) {
      setState(() { _saving = false; _error = '$e'; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final availAsync = ref.watch(nodeAvailabilityProvider(_availArgs));
    final outboundAsync = ref.watch(nodeOutboundConsignmentsProvider(widget.node.id));
    final ppNames = {
      for (final n in ref.watch(nodesByTypeProvider('pp')).value ?? const <MpNode>[]) n.id: n.name,
    };

    availAsync.whenData(_prefillFromAvailability);
    final canDispatch = (availAsync.asData?.value?.available ?? 0) > 0;
    final closeRequired = !_slotClosed(ref.watch(shiftStatusProvider(widget.node.id)).asData?.value);

    return Scaffold(
      backgroundColor: t.surface,
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: Text('Dispatch', style: DhenuText.h2.copyWith(color: t.ink)),
      ),
      body: ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(
          DhenuSpacing.screen, DhenuSpacing.lg, DhenuSpacing.screen, DhenuSpacing.x4),
      children: [
        Row(children: [
          Expanded(child: Text('Availability', style: DhenuText.title.copyWith(color: t.ink))),
          if (_perShift) ShiftToggle(value: _shift, onChanged: _onShiftChanged),
        ]),
        const SizedBox(height: DhenuSpacing.sm),
        _availCard(t, availAsync),
        const SizedBox(height: DhenuSpacing.xl),
        if (canDispatch) ...[
        Text('Dispatch to Plant', style: DhenuText.title.copyWith(color: t.ink)),
        const SizedBox(height: DhenuSpacing.md),
        _destPicker(context, t),
        const SizedBox(height: DhenuSpacing.md),
        TextField(
          controller: _qtyCtrl,
          keyboardType: TextInputType.number,
          textCapitalization: TextCapitalization.none,
          decoration: const InputDecoration(hintText: 'Dispatch Qty (L)'),
        ),
        const SizedBox(height: DhenuSpacing.md),
        Row(children: [
          Expanded(
            child: TextField(
              controller: _fatCtrl,
              keyboardType: TextInputType.number,
              textCapitalization: TextCapitalization.none,
              decoration: const InputDecoration(hintText: 'FAT %'),
            ),
          ),
          const SizedBox(width: DhenuSpacing.md),
          Expanded(
            child: TextField(
              controller: _snfCtrl,
              keyboardType: TextInputType.number,
              textCapitalization: TextCapitalization.none,
              decoration: const InputDecoration(hintText: 'SNF %'),
            ),
          ),
        ]),
        const SizedBox(height: DhenuSpacing.md),
        TextField(
          controller: _containerCtrl,
          textCapitalization: TextCapitalization.characters,
          decoration: const InputDecoration(hintText: 'Container No. (optional)'),
        ),
        if (closeRequired) ...[
          const SizedBox(height: DhenuSpacing.md),
          _closeGateBanner(t),
        ],
        if (_error != null) ...[
          const SizedBox(height: DhenuSpacing.sm),
          Text(_error!, style: DhenuText.caption.copyWith(color: t.gradeC)),
        ],
        const SizedBox(height: DhenuSpacing.lg),
        PrimaryAction(
          label: 'Dispatch Tanker',
          icon: DhenuIcons.truck,
          onPressed: (_saving || closeRequired) ? null : _dispatch,
          loading: _saving,
        ),
        ] else ...[
          _dispatchedCard(t, availAsync, outboundAsync),
        ],
        const SizedBox(height: DhenuSpacing.xl),
        Text('Today\'s Outbound', style: DhenuText.title.copyWith(color: t.ink)),
        const SizedBox(height: DhenuSpacing.sm),
        _outboundList(t, outboundAsync, ppNames),
      ],
      ),
    );
  }

  /// Shown in place of the form once availability is exhausted: how much was
  /// sent out this shift, with the container number for each leg.
  Widget _dispatchedCard(
    DhenuTokens t,
    AsyncValue<MpAvailability?> availAsync,
    AsyncValue<List<MpConsignment>> outAsync,
  ) {
    final dispatched = availAsync.asData?.value?.dispatched ?? 0;
    var legs = (outAsync.asData?.value ?? const <MpConsignment>[])
        .where((c) => c.kind == 'cc_to_pp')
        .toList();
    if (_perShift) legs = legs.where((c) => c.shift == _shift).toList();
    return DhenuCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(DhenuIcons.checkCircle, size: 20, color: t.gradeA),
          const SizedBox(width: DhenuSpacing.sm),
          Expanded(
            child: Text('${litres(dispatched, unit: true)} dispatched',
                style: DhenuText.title.copyWith(color: t.ink)),
          ),
        ]),
        const SizedBox(height: DhenuSpacing.xs),
        Text('Nothing left to dispatch${_perShift ? ' this shift' : ''}.',
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
                      ? 'Container ${c.containerNo}'
                      : 'No container no.',
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
  Widget _closeGateBanner(DhenuTokens t) {
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
        Expanded(child: Text(_closeFirstMsg, style: DhenuText.label.copyWith(color: t.ink))),
      ]),
    );
  }

  Widget _availCard(DhenuTokens t, AsyncValue<MpAvailability?> availAsync) {
    return DhenuCard(
      child: availAsync.when(
        loading: () => const DhenuLoadingList(rows: 1),
        error: (e, _) => Text('—', style: DhenuText.body.copyWith(color: t.inkSoft)),
        data: (a) => a == null
            ? Text('No data', style: DhenuText.body.copyWith(color: t.inkSoft))
            : Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                TankGauge(current: a.available, capacity: a.collected, label: 'Available to dispatch'),
                const SizedBox(height: DhenuSpacing.sm),
                Text(
                  'Collected ${litres(a.collected, unit: true)} · Dispatched ${litres(a.dispatched, unit: true)}',
                  style: DhenuText.caption.copyWith(color: t.inkSoft),
                ),
              ]),
      ),
    );
  }

  Widget _destPicker(BuildContext context, DhenuTokens t) {
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
              _destPp?.name ?? 'Select destination plant…',
              style: DhenuText.body.copyWith(
                  color: _destPp == null ? t.inkSoft : t.ink),
            ),
          ),
          Icon(DhenuIcons.chevronDown, color: t.inkSoft),
        ]),
      ),
    );
  }

  /// Consignment id + shift, shown small under the plant name.
  String _outboundSubtitle(MpConsignment c) {
    final shift = c.shift == null ? '' : '${c.shift == Shift.am ? '☀️ AM' : '🌙 PM'} · ';
    return '$shift${c.consignmentNo}';
  }

  Widget _outboundList(
      DhenuTokens t, AsyncValue<List<MpConsignment>> outAsync, Map<String, String> ppNames) {
    return outAsync.when(
      loading: () => const DhenuLoadingList(rows: 2),
      error: (_, _) => const SizedBox.shrink(),
      data: (all) {
        final outbound = all.where((c) => c.kind == 'cc_to_pp').toList();
        if (outbound.isEmpty) {
          return DhenuEmptyState(
            icon: DhenuIcons.truck,
            title: 'No dispatches today',
            subtitle: 'Use the form above to dispatch a tanker',
          );
        }
        return DhenuCard(
          padding: EdgeInsets.zero,
          child: Column(children: [
            for (var i = 0; i < outbound.length; i++) ...[
              if (i > 0) Divider(height: 1, color: t.hairline),
              SourceRow(
                title: ppNames[outbound[i].toNodeId] ?? 'Plant',
                subtitle: _outboundSubtitle(outbound[i]),
                litres: litres(outbound[i].dispatchQty ?? 0, unit: true),
                trailingStatus: Text(
                  outbound[i].inTransit ? '⏳ transit' : '✓ received',
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
                  const InputDecoration(hintText: 'Search plant', prefixIcon: Icon(DhenuIcons.search)),
            ),
          ),
          Expanded(
            child: filtered.isEmpty
                ? const DhenuEmptyState(
                    icon: DhenuIcons.plant, title: 'No plants found')
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
