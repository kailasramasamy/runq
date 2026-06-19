import 'dart:async';
import 'package:flutter/material.dart';
import '../../theme/dhenu_icons.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../api/mp_repo.dart';
import '../../providers/mp_context_provider.dart';
import '../../services/pour_queue.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_toast.dart';
import '../../widgets/pour_detail_sheet.dart';
import '../../widgets/quality_badge.dart';
import '../../widgets/primary_action.dart';
import '../../widgets/shift_grouped_pours.dart';
import '../../widgets/shift_toggle.dart';
import '../../widgets/sheet_grabber.dart';
import 'farmer_picker.dart';

/// The most-used screen: record one farmer's pour fast. Manual entry (v1),
/// live rate preview, offline-tolerant via [PourQueue]. Spec §5.2 / §8.1.
class RecordCollectionScreen extends ConsumerStatefulWidget {
  const RecordCollectionScreen({super.key, required this.node, this.seedPour, this.seedFarmer});
  final MpNode node;
  /// When set, the form opens pre-filled for editing this entry (Modify).
  final MpPour? seedPour;
  final MpFarmer? seedFarmer;
  @override
  ConsumerState<RecordCollectionScreen> createState() => _RecordCollectionScreenState();
}

class _RecordCollectionScreenState extends ConsumerState<RecordCollectionScreen> {
  MpFarmer? _farmer;
  Shift _shift = shiftFrom(currentShift());
  MilkType _milkType = MilkType.cow;
  final _qty = TextEditingController();
  final _fat = TextEditingController();
  final _snf = TextEditingController();
  final _qtyFocus = FocusNode();
  final _fatFocus = FocusNode();
  final _snfFocus = FocusNode();

  Timer? _debounce;
  MpRateResolution? _rate;
  bool _resolving = false;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final seed = widget.seedPour;
    if (seed != null) {
      _farmer = widget.seedFarmer;
      _shift = seed.shift;
      _milkType = seed.milkType;
      _qty.text = _trimNum(seed.qtyLitres);
      if (seed.fat != null) _fat.text = _trimNum(seed.fat!);
      if (seed.snf != null) _snf.text = _trimNum(seed.snf!);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _resolveRate();
      });
    }
  }

  String _trimNum(double n) =>
      n == n.truncateToDouble() ? n.toInt().toString() : n.toString();

  @override
  void dispose() {
    _debounce?.cancel();
    _qty.dispose();
    _fat.dispose();
    _snf.dispose();
    _qtyFocus.dispose();
    _fatFocus.dispose();
    _snfFocus.dispose();
    super.dispose();
  }

  double get _qtyVal => double.tryParse(_qty.text) ?? 0;
  double? get _fatVal => double.tryParse(_fat.text);
  double? get _snfVal => double.tryParse(_snf.text);
  bool get _isEdit => widget.seedPour != null;
  // edits keep the original collection date; fresh entries are for today
  String get _collectionDate => widget.seedPour?.collectionDate ?? todayIso();
  bool get _canSave => _farmer != null && _qtyVal > 0 && _fatVal != null && _snfVal != null && !_saving;

  void _onFieldChanged() {
    setState(() {});
    _debounce?.cancel();
    if (_fatVal == null || _snfVal == null) {
      setState(() => _rate = null);
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 450), _resolveRate);
  }

  Future<void> _resolveRate() async {
    final fat = _fatVal, snf = _snfVal;
    if (fat == null || snf == null) return;
    setState(() => _resolving = true);
    try {
      final r = await mpRepo.resolveRate(
        milkType: _milkType,
        fat: fat,
        snf: snf,
        cycleQtyLitres: _qtyVal > 0 ? _qtyVal : null,
        scopeNodeId: widget.node.id,
        onDate: _collectionDate,
      );
      if (mounted) setState(() => _rate = r);
    } catch (_) {
      // Offline / no chart — preview is best-effort; the server computes the
      // authoritative rate at record time.
      if (mounted) setState(() => _rate = null);
    } finally {
      if (mounted) setState(() => _resolving = false);
    }
  }

  Future<void> _pickFarmer() async {
    final picked = await showFarmerPicker(context, ref, widget.node.id);
    if (picked != null) {
      setState(() {
        _farmer = picked;
        _milkType = picked.defaultMilkType;
      });
      _onFieldChanged();
      _qtyFocus.requestFocus(); // jump straight into entry
    }
  }

  /// The bottom button doubles as a "next field" stepper: when something's
  /// missing it focuses the first empty field; once all three are in, it saves.
  void _onPrimary() {
    if (_farmer == null) { _pickFarmer(); return; }
    if (_qtyVal <= 0) { _qtyFocus.requestFocus(); return; }
    if (_fatVal == null) { _fatFocus.requestFocus(); return; }
    if (_snfVal == null) { _snfFocus.requestFocus(); return; }
    _save();
  }

  /// The farmer's existing recorded pour for this exact slot (shift + milk
  /// type), if any — drives the replace-or-add prompt. Today's list is already
  /// recorded-only, so a hit means a real prior reading.
  MpPour? _existingSlotPour() {
    final pours = ref.read(nodeTodayPoursProvider(widget.node.id)).asData?.value ?? const <MpPour>[];
    for (final p in pours) {
      if (p.farmerId == _farmer!.id && p.shift == _shift && p.milkType == _milkType) return p;
    }
    return null;
  }

  Future<void> _save() async {
    if (!_canSave) return;
    // Drop the keypad up front: closing the prompt sheet would otherwise restore
    // focus to the last field and flash the keyboard back on.
    FocusScope.of(context).unfocus();
    if (_isEdit) return _saveEdit();
    // A repeat for the same slot is a correction by default; adding a lot is
    // deliberate. Ask, so an operator never silently double-pays a farmer.
    final existing = _existingSlotPour();
    var asNewLot = false;
    if (existing != null) {
      final choice = await _askReplaceOrAdd(existing);
      if (choice == null) return; // cancelled — keep the form as-is
      asNewLot = choice;
    }
    final name = _farmer!.name;
    final qtyLabel = litres(_qtyVal, unit: true);
    setState(() => _saving = true);
    final body = <String, dynamic>{
      'nodeId': widget.node.id,
      'farmerId': _farmer!.id,
      'collectionDate': todayIso(),
      'shift': _shift.name,
      'milkType': _milkType.name,
      'qtyLitres': _qtyVal,
      'fat': _fatVal,
      'snf': _snfVal,
      'asNewLot': asNewLot,
    };
    final sentNow = await PourQueue.instance.record(body);
    if (!mounted) return;
    ref.invalidate(nodeTodaySummaryProvider(widget.node.id));
    ref.invalidate(nodeTodayPoursProvider(widget.node.id));
    FocusScope.of(context).unfocus(); // dismiss the keypad between farmers
    _showSavedSnack(name, qtyLabel, sentNow);
    _resetForNext();
  }

  /// Edit an existing entry: reverse the original (targeted, by id) and re-record
  /// the correction on its ORIGINAL date as a lot, so siblings are untouched and
  /// past-day edits don't migrate to today. Online-only (edits are infrequent).
  Future<void> _saveEdit() async {
    final seed = widget.seedPour!;
    final name = _farmer!.name;
    final qtyLabel = litres(_qtyVal, unit: true);
    setState(() => _saving = true);
    try {
      await mpRepo.reversePour(seed.id);
      await mpRepo.recordPour({
        'nodeId': widget.node.id,
        'farmerId': _farmer!.id,
        'collectionDate': seed.collectionDate,
        'shift': _shift.name,
        'milkType': _milkType.name,
        'qtyLitres': _qtyVal,
        'fat': _fatVal,
        'snf': _snfVal,
        'asNewLot': true,
      });
      if (!mounted) return;
      ref.invalidate(nodeTodayPoursProvider(widget.node.id));
      ref.invalidate(nodeTodaySummaryProvider(widget.node.id));
      ref.invalidate(nodeHistoryPoursProvider(widget.node.id));
      _showSavedSnack(name, qtyLabel, true);
      Navigator.of(context).pop();
    } catch (e) {
      if (mounted) {
        setState(() => _saving = false);
        showDhenuToast(context, '$e', type: DhenuToastType.error);
      }
    }
  }

  void _showSavedSnack(String name, String qtyLabel, bool sentNow) => showDhenuToast(
        context,
        sentNow ? '$qtyLabel · $name' : 'Saved on device · will sync',
        type: sentNow ? DhenuToastType.success : DhenuToastType.info,
        icon: sentNow ? null : DhenuIcons.cloud,
      );

  /// Returns true = add another lot, false = replace prior, null = cancel.
  Future<bool?> _askReplaceOrAdd(MpPour existing) {
    final t = DT(context);
    final shiftLabel = _shift == Shift.am ? 'AM' : 'PM';
    // Capture now: _farmer is cleared on save while the sheet animates out.
    final farmerName = _farmer!.name;
    return showModalBottomSheet<bool>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(DhenuRadii.sheet)),
        ),
        child: SafeArea(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const SheetGrabber(),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                  DhenuSpacing.lg, 0, DhenuSpacing.lg, DhenuSpacing.lg),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Already recorded this $shiftLabel shift',
                    style: DhenuText.title.copyWith(color: t.ink)),
                const SizedBox(height: DhenuSpacing.xs),
                Text('Replace it (correction) or add another lot for $farmerName?',
                    style: DhenuText.caption.copyWith(color: t.inkSoft)),
                const SizedBox(height: DhenuSpacing.md),
                DhenuCard(
                  child: Row(children: [
                    Expanded(
                      child: Text(
                        '${_milkLabel(existing.milkType)} · ${litres(existing.qtyLitres, unit: true)}',
                        style: DhenuText.body.copyWith(color: t.ink),
                      ),
                    ),
                    if (existing.fat != null)
                      QualityBadge(
                        fat: existing.fat, snf: existing.snf, grade: existing.qualityGrade,
                        format: QualityFormat.valueLabel),
                  ]),
                ),
                const SizedBox(height: DhenuSpacing.lg),
                Row(children: [
                  Expanded(child: OutlinedButton(
                    onPressed: () => Navigator.pop(ctx, false),
                    child: const Text('Replace'),
                  )),
                  const SizedBox(width: DhenuSpacing.md),
                  Expanded(child: FilledButton(
                    onPressed: () => Navigator.pop(ctx, true),
                    child: const Text('Add lot'),
                  )),
                ]),
                Center(child: TextButton(
                  onPressed: () => Navigator.pop(ctx, null),
                  child: Text('Cancel', style: DhenuText.label.copyWith(color: t.inkSoft)),
                )),
              ]),
            ),
          ]),
        ),
      ),
    );
  }

  void _resetForNext() {
    setState(() {
      _farmer = null;
      _qty.clear();
      _fat.clear();
      _snf.clear();
      _rate = null;
      _saving = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.seedPour != null ? 'Edit Collection' : 'Record Collection',
            style: DhenuText.h2.copyWith(color: t.ink)),
      ),
      body: ListView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.fromLTRB(
            DhenuSpacing.screen, DhenuSpacing.lg, DhenuSpacing.screen, 120),
        children: [
          _dateBar(t),
          const SizedBox(height: DhenuSpacing.md),
          _farmerField(t),
          const SizedBox(height: DhenuSpacing.lg),
          ShiftToggle(value: _shift, onChanged: (s) => setState(() => _shift = s)),
          const SizedBox(height: DhenuSpacing.lg),
          _milkTypePicker(t),
          const SizedBox(height: DhenuSpacing.lg),
          Row(children: [
            Expanded(child: _numberField(_qty, 'Litres', 'L', _qtyFocus, _fatFocus)),
            const SizedBox(width: DhenuSpacing.md),
            Expanded(child: _numberField(_fat, 'FAT', '%', _fatFocus, _snfFocus)),
            const SizedBox(width: DhenuSpacing.md),
            Expanded(child: _numberField(_snf, 'SNF', '%', _snfFocus, null)),
          ]),
          const SizedBox(height: DhenuSpacing.lg),
          _ratePreview(t),
          const SizedBox(height: DhenuSpacing.xl),
          _recentToday(t),
        ],
      ),
      bottomSheet: Padding(
        padding: const EdgeInsets.all(DhenuSpacing.screen),
        child: PrimaryAction(
          label: _canSave ? 'Save & next' : 'Next',
          icon: _canSave ? DhenuIcons.check : DhenuIcons.arrowRight,
          loading: _saving,
          onPressed: _saving ? null : _onPrimary,
        ),
      ),
    );
  }

  Widget _dateBar(DhenuTokens t) => Row(children: [
        Icon(DhenuIcons.calendar, size: 18, color: t.brand),
        const SizedBox(width: DhenuSpacing.sm),
        Text(
          _collectionDate == todayIso()
              ? '${prettyDate(_collectionDate)} · Today'
              : prettyDate(_collectionDate),
          style: DhenuText.label.copyWith(color: t.inkSoft),
        ),
      ]);

  /// Today's recorded pours at this node, live (invalidated on each save),
  /// grouped into AM and PM shifts so morning and evening entries don't mix.
  Widget _recentToday(DhenuTokens t) {
    final pours = ref.watch(nodeTodayPoursProvider(widget.node.id)).asData?.value ?? const <MpPour>[];
    if (pours.isEmpty) return const SizedBox.shrink();
    final farmers = ref.watch(nodeFarmersProvider(widget.node.id)).asData?.value ?? const <MpFarmer>[];
    final byId = {for (final f in farmers) f.id: f};
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text('Today\'s entries (${pours.length})', style: DhenuText.title.copyWith(color: t.ink)),
      const SizedBox(height: DhenuSpacing.sm),
      ShiftGroupedPours(
        pours: pours,
        farmersById: byId,
        maxRowsPerShift: 8,
        onTapPour: (p, farmer) => showPourDetailSheet(
          context,
          pour: p,
          node: widget.node,
          farmer: farmer,
          onModify: () => Navigator.of(context).push(MaterialPageRoute(
            builder: (_) => RecordCollectionScreen(
                node: widget.node, seedPour: p, seedFarmer: farmer),
          )),
        ),
      ),
    ]);
  }

  Widget _farmerField(DhenuTokens t) => InkWell(
        onTap: _pickFarmer,
        borderRadius: BorderRadius.circular(DhenuRadii.input),
        child: Container(
          height: DhenuSpacing.minTap + 4,
          padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.lg),
          decoration: BoxDecoration(
            color: t.inputFill,
            borderRadius: BorderRadius.circular(DhenuRadii.input),
            border: Border.all(color: t.hairline),
          ),
          child: Row(children: [
            Icon(DhenuIcons.userSearch, color: t.brand),
            const SizedBox(width: DhenuSpacing.md),
            Expanded(
              child: Text(
                _farmer?.name ?? 'Select farmer',
                style: DhenuText.title.copyWith(
                  color: _farmer == null ? t.inkSoft : t.ink,
                  fontWeight: _farmer == null ? FontWeight.w400 : FontWeight.w600,
                ),
              ),
            ),
            if (_farmer != null) Text(_farmer!.code, style: DhenuText.caption.copyWith(color: t.inkSoft)),
            const SizedBox(width: DhenuSpacing.sm),
            Icon(DhenuIcons.chevronRight, color: t.inkSoft),
          ]),
        ),
      );

  Widget _milkTypePicker(DhenuTokens t) => Row(
        children: MilkType.values.map((m) {
          final selected = _milkType == m;
          return Expanded(
            child: Padding(
              padding: const EdgeInsets.only(right: DhenuSpacing.sm),
              child: InkWell(
                onTap: () {
                  setState(() => _milkType = m);
                  _onFieldChanged();
                },
                borderRadius: BorderRadius.circular(DhenuRadii.pill),
                child: Container(
                  height: 44,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: selected ? t.brandSubtle : Colors.transparent,
                    borderRadius: BorderRadius.circular(DhenuRadii.pill),
                    border: Border.all(color: selected ? t.brand : t.hairline),
                  ),
                  child: Text(
                    _milkLabel(m),
                    style: DhenuText.label.copyWith(color: selected ? t.brand : t.inkSoft),
                  ),
                ),
              ),
            ),
          );
        }).toList(),
      );

  String _milkLabel(MilkType m) => switch (m) {
        MilkType.cow => 'Cow',
        MilkType.buffalo => 'Buffalo',
        MilkType.mixed => 'Mixed',
      };

  Widget _numberField(
    TextEditingController c, String label, String suffix, FocusNode focus, FocusNode? next,
  ) =>
      TextField(
        controller: c,
        focusNode: focus,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        textInputAction: next == null ? TextInputAction.done : TextInputAction.next,
        textAlign: TextAlign.center,
        style: DhenuText.number(size: 22),
        inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d*'))],
        decoration: InputDecoration(labelText: label, suffixText: suffix),
        onChanged: (_) => _onFieldChanged(),
        onSubmitted: (_) => next == null ? _onPrimary() : next.requestFocus(),
      );

  Widget _ratePreview(DhenuTokens t) {
    if (_resolving) {
      return _previewShell(t, child: Text('Computing rate…', style: DhenuText.body.copyWith(color: t.inkSoft)));
    }
    final r = _rate;
    if (r == null) {
      return _previewShell(t,
          child: Text(
            _fatVal == null || _snfVal == null
                ? 'Enter FAT & SNF to preview the rate'
                : 'Rate computed on sync',
            style: DhenuText.body.copyWith(color: t.inkSoft),
          ));
    }
    final line = _qtyVal * r.ratePerLitre;
    return _previewShell(
      t,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          QualityBadge(fat: _fatVal, snf: _snfVal, grade: r.grade),
          const Spacer(),
          Text(rupees(r.ratePerLitre, paise: true), style: DhenuText.number(size: 22, color: t.brand)),
          Text(' /L', style: DhenuText.caption.copyWith(color: t.inkSoft)),
        ]),
        if (_qtyVal > 0) ...[
          const SizedBox(height: DhenuSpacing.sm),
          Row(children: [
            Text('${litres(_qtyVal)} × ${rupees(r.ratePerLitre, paise: true)}',
                style: DhenuText.caption.copyWith(color: t.inkSoft)),
            const Spacer(),
            Text(rupees(line), style: DhenuText.number(size: 24, color: t.gradeA)),
          ]),
        ],
      ]),
    );
  }

  Widget _previewShell(DhenuTokens t, {required Widget child}) => SizedBox(
        width: double.infinity,
        child: DhenuCard(
          child: child,
        ),
      );
}
