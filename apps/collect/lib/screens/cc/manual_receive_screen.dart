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
import '../../widgets/primary_action.dart';
import '../../widgets/shift_toggle.dart';

/// Manual receive hub — for milk that arrived WITHOUT a dispatch entry (the VMCC
/// operator forgot to mark dispatch, or works off a notebook). The operator
/// picks the date + shift first, then taps a VMCC straight from the list. Each
/// VMCC is flagged "Received" when milk from it is already in for that exact
/// date + shift, so nothing gets entered twice.
class ManualReceiveScreen extends ConsumerStatefulWidget {
  const ManualReceiveScreen({super.key, required this.vmccs, required this.ccNodeId});
  final List<MpNode> vmccs;
  final String ccNodeId;

  @override
  ConsumerState<ManualReceiveScreen> createState() => _ManualReceiveScreenState();
}

class _ManualReceiveScreenState extends ConsumerState<ManualReceiveScreen> {
  DateTime _date = DateTime.now();
  Shift _shift = DateTime.now().hour < 12 ? Shift.am : Shift.pm;

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

  /// Tapping a VMCC: fresh receive, or — if it's already received — edit the
  /// existing receipt (latest one, prefilled) rather than create a duplicate.
  Future<void> _openEntry(MpNode vmcc, {MpConsignment? existing}) async {
    final saved = await Navigator.of(context).push<bool>(MaterialPageRoute(
      builder: (_) => ManualReceiveEntryScreen(
        vmcc: vmcc, ccNodeId: widget.ccNodeId, date: _date, shift: _shift, existing: existing),
    ));
    if (saved == true) {
      ref.invalidate(nodeInboundByDateProvider((nodeId: widget.ccNodeId, date: isoDate(_date))));
    }
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
    final inboundAsync =
        ref.watch(nodeInboundByDateProvider((nodeId: widget.ccNodeId, date: isoDate(_date))));
    final received = _receivedFor(inboundAsync.asData?.value ?? const []);
    // Only VMCCs that collect in the selected shift can have milk to receive.
    final shiftVmccs = widget.vmccs.where((v) => v.collectsShift(_shift.name)).toList();
    return Scaffold(
      backgroundColor: t.surface,
      appBar: AppBar(title: const Text('Manual receive')),
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
                  'Use this only when milk arrived with no dispatch entry in the app.',
                  style: DhenuText.caption.copyWith(color: t.inkSoft),
                )),
              ]),
            ),
            const SizedBox(height: DhenuSpacing.lg),
            DhenuCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('RECEIVING FOR', style: DhenuText.label.copyWith(color: t.brand)),
              const SizedBox(height: DhenuSpacing.md),
              _dateField(t),
              const SizedBox(height: DhenuSpacing.md),
              Row(children: [
                Text('Shift', style: DhenuText.label.copyWith(color: t.inkSoft)),
                const Spacer(),
                ShiftToggle(value: _shift, onChanged: (s) => setState(() => _shift = s)),
              ]),
            ])),
            const SizedBox(height: DhenuSpacing.lg),
            Text('SELECT VMCC', style: DhenuText.label.copyWith(color: t.inkSoft)),
            const SizedBox(height: DhenuSpacing.sm),
            if (shiftVmccs.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: DhenuSpacing.lg),
                child: Text(
                    widget.vmccs.isEmpty
                        ? 'No VMCCs linked to this CC.'
                        : 'No VMCCs collect in the ${_shift == Shift.am ? 'AM' : 'PM'} shift.',
                    style: DhenuText.body.copyWith(color: t.inkSoft)),
              )
            else
              // Pending VMCCs first, already-received pushed to the bottom;
              // each group sorted alphabetically by name.
              for (final v in [
                ..._byName(shiftVmccs.where((v) => !received.containsKey(v.id))),
                ..._byName(shiftVmccs.where((v) => received.containsKey(v.id))),
              ]) ...[
                _vmccTile(t, v, received[v.id] ?? const []),
                const SizedBox(height: DhenuSpacing.sm),
              ],
          ],
        ),
      ),
    );
  }

  List<MpNode> _byName(Iterable<MpNode> vmccs) =>
      vmccs.toList()..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));

  Widget _vmccTile(DhenuTokens t, MpNode v, List<MpConsignment> receipts) {
    final done = receipts.isNotEmpty;
    final qty = receipts.fold<double>(0, (a, c) => a + (c.receiptQty ?? 0));
    return DhenuCard(
      padding: const EdgeInsets.symmetric(
          horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md),
      // Editing targets the latest receipt for this VMCC; pending → fresh entry.
      onTap: () => _openEntry(v, existing: done ? receipts.last : null),
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
        if (done) _receivedBadge(t, qty)
        else Icon(DhenuIcons.chevronRight, color: t.inkSoft),
      ]),
    );
  }

  Widget _receivedBadge(DhenuTokens t, double qty) => Container(
        padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.sm, vertical: 2),
        decoration: BoxDecoration(
          color: t.gradeA.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(DhenuRadii.pill),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(DhenuIcons.check, size: 13, color: t.gradeA),
          const SizedBox(width: 3),
          Text('${litres(qty)} received', style: DhenuText.caption.copyWith(color: t.gradeA)),
        ]),
      );

  Widget _dateField(DhenuTokens t) => InkWell(
        onTap: _pickDate,
        borderRadius: BorderRadius.circular(DhenuRadii.input),
        child: InputDecorator(
          decoration: const InputDecoration(labelText: 'Collection date'),
          child: Row(children: [
            Expanded(child: Text(prettyDate(isoDate(_date)), style: DhenuText.body.copyWith(color: t.ink))),
            Icon(DhenuIcons.calendar, size: 18, color: t.inkSoft),
          ]),
        ),
      );
}

/// Records the actual qty/FAT/SNF/Water measured at the CC for one VMCC's milk
/// that arrived without a dispatch entry. Date + shift come fixed from the hub.
class ManualReceiveEntryScreen extends ConsumerStatefulWidget {
  const ManualReceiveEntryScreen({
    super.key,
    required this.vmcc,
    required this.ccNodeId,
    required this.date,
    required this.shift,
    this.existing,
  });
  final MpNode vmcc;
  final String ccNodeId;
  final DateTime date;
  final Shift shift;
  // When set, edit this already-received consignment instead of creating one.
  final MpConsignment? existing;

  @override
  ConsumerState<ManualReceiveEntryScreen> createState() => _ManualReceiveEntryScreenState();
}

class _ManualReceiveEntryScreenState extends ConsumerState<ManualReceiveEntryScreen> {
  final _qty = TextEditingController();
  final _fat = TextEditingController();
  final _snf = TextEditingController();
  final _water = TextEditingController();
  final _qtyFocus = FocusNode();
  final _fatFocus = FocusNode();
  final _snfFocus = FocusNode();
  final _waterFocus = FocusNode();
  bool _saving = false;
  String? _error;
  // Water is optional, but we route the operator through it before allowing
  // save so it isn't silently skipped — "Mark received" appears only once the
  // water field has been visited (entry or deliberate skip).
  bool _waterVisited = false;

  String _trimNum(double n) =>
      n == n.truncateToDouble() ? n.toInt().toString() : n.toString();

  @override
  void initState() {
    super.initState();
    final e = widget.existing;
    if (e != null) {
      if (e.receiptQty != null) _qty.text = _trimNum(e.receiptQty!);
      if (e.receiptFat != null) _fat.text = _trimNum(e.receiptFat!);
      if (e.receiptSnf != null) _snf.text = _trimNum(e.receiptSnf!);
      if (e.receiptWater != null) _water.text = _trimNum(e.receiptWater!);
      // Editing a saved receipt — values are present, don't re-gate on water.
      _waterVisited = true;
    }
    for (final c in [_qty, _fat, _snf]) {
      c.addListener(() => setState(() {}));
    }
    _waterFocus.addListener(() {
      if (_waterFocus.hasFocus && !_waterVisited) setState(() => _waterVisited = true);
    });
  }

  @override
  void dispose() {
    _qty.dispose();
    _fat.dispose();
    _snf.dispose();
    _water.dispose();
    _qtyFocus.dispose();
    _fatFocus.dispose();
    _snfFocus.dispose();
    _waterFocus.dispose();
    super.dispose();
  }

  double? _positive(TextEditingController c) {
    final v = double.tryParse(c.text);
    return (v != null && v > 0) ? v : null;
  }

  bool get _allEntered =>
      _positive(_qty) != null && _positive(_fat) != null && _positive(_snf) != null;

  // Ready to save once the three required measures are in AND the (optional)
  // water field has been stepped through.
  bool get _ready => _allEntered && _waterVisited;

  /// "Next" handler — jump focus to the first measurement still missing, then to
  /// the water field, so the operator is guided field-by-field (water included)
  /// instead of hunting for what's blank or skipping water by accident.
  void _focusNext() {
    if (_positive(_qty) == null) {
      _qtyFocus.requestFocus();
    } else if (_positive(_fat) == null) {
      _fatFocus.requestFocus();
    } else if (_positive(_snf) == null) {
      _snfFocus.requestFocus();
    } else if (!_waterVisited) {
      _waterFocus.requestFocus();
    }
  }

  Future<void> _save() async {
    if (!_allEntered) {
      setState(() => _error = 'Enter quantity, FAT and SNF');
      return;
    }
    setState(() { _saving = true; _error = null; });
    try {
      final existing = widget.existing;
      if (existing != null) {
        await mpRepo.editReceipt(existing.id, {
          'receiptQty': _positive(_qty),
          'receiptFat': _positive(_fat),
          'receiptSnf': _positive(_snf),
          if (_positive(_water) != null) 'receiptWater': _positive(_water),
        });
      } else {
        await mpRepo.directReceive({
          'fromNodeId': widget.vmcc.id,
          'toNodeId': widget.ccNodeId,
          'collectionDate': isoDate(widget.date),
          'shift': widget.shift.name,
          'qty': _positive(_qty),
          'fat': _positive(_fat),
          'snf': _positive(_snf),
          if (_positive(_water) != null) 'water': _positive(_water),
        });
      }
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      setState(() { _saving = false; _error = '$e'; });
    }
  }

  /// Delete this manually-entered receipt (server rejects unless it's a direct
  /// receive that isn't yet locked for dispatch).
  Future<void> _delete() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (dctx) => AlertDialog(
        title: const Text('Delete receipt?'),
        content: Text('${widget.vmcc.name} · '
            '${prettyDate(isoDate(widget.date))} '
            '${widget.shift == Shift.am ? 'AM' : 'PM'} will be removed.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(dctx).pop(false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.of(dctx).pop(true), child: const Text('Delete')),
        ],
      ),
    );
    if (ok != true) return;
    setState(() { _saving = true; _error = null; });
    try {
      await mpRepo.deleteReceipt(widget.existing!.id);
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      setState(() { _saving = false; _error = '$e'; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final isAm = widget.shift == Shift.am;
    return Scaffold(
      backgroundColor: t.surface,
      appBar: AppBar(title: Text(widget.vmcc.name)),
      body: SafeArea(
        child: Column(children: [
          Expanded(child: ListView(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.all(DhenuSpacing.screen),
            children: [
              DhenuCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Text('MEASURED AT CC', style: DhenuText.label.copyWith(color: t.brand)),
                  const Spacer(),
                  Text('${prettyDate(isoDate(widget.date))} · ',
                      style: DhenuText.caption.copyWith(color: t.inkSoft)),
                  Icon(isAm ? DhenuIcons.sun : DhenuIcons.moon, size: 12, color: t.inkSoft),
                  const SizedBox(width: 4),
                  Text(isAm ? 'AM' : 'PM', style: DhenuText.caption.copyWith(color: t.inkSoft)),
                ]),
                const SizedBox(height: DhenuSpacing.md),
                _field(_qty, 'Quantity (L)', focusNode: _qtyFocus, next: _fatFocus,
                    autofocus: widget.existing == null),
                const SizedBox(height: DhenuSpacing.md),
                Row(children: [
                  Expanded(child: _field(_fat, 'FAT %', focusNode: _fatFocus, next: _snfFocus)),
                  const SizedBox(width: DhenuSpacing.md),
                  Expanded(child: _field(_snf, 'SNF %', focusNode: _snfFocus, next: _waterFocus)),
                ]),
                const SizedBox(height: DhenuSpacing.md),
                _field(_water, 'Water % (optional)', focusNode: _waterFocus),
              ])),
              if (_error != null) ...[
                const SizedBox(height: DhenuSpacing.sm),
                Text(_error!, style: DhenuText.caption.copyWith(color: t.gradeC)),
              ],
            ],
          )),
          Padding(
            padding: const EdgeInsets.all(DhenuSpacing.screen),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              PrimaryAction(
                label: _ready ? (widget.existing != null ? 'Save changes' : 'Mark received') : 'Next',
                icon: _ready ? DhenuIcons.check : DhenuIcons.chevronRight,
                onPressed: _ready ? _save : _focusNext,
                loading: _saving,
              ),
              if (widget.existing?.directReceive ?? false) ...[
                const SizedBox(height: DhenuSpacing.sm),
                TextButton.icon(
                  onPressed: _saving ? null : _delete,
                  icon: Icon(DhenuIcons.trash, size: 18, color: t.gradeC),
                  label: Text('Delete receipt', style: DhenuText.label.copyWith(color: t.gradeC)),
                ),
              ],
            ]),
          ),
        ]),
      ),
    );
  }

  Widget _field(TextEditingController ctrl, String hint,
          {FocusNode? focusNode, FocusNode? next, bool autofocus = false}) =>
      TextField(
        controller: ctrl,
        focusNode: focusNode,
        autofocus: autofocus,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        textCapitalization: TextCapitalization.none,
        textInputAction: next != null ? TextInputAction.next : TextInputAction.done,
        onSubmitted: (_) => next?.requestFocus(),
        decoration: InputDecoration(labelText: hint),
      );
}
