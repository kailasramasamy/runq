import 'dart:async';
import 'package:flutter/material.dart';
import 'package:dhenu/l10n/app_localizations.dart';
import '../../theme/dhenu_icons.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../l10n/l10n_helpers.dart';
import '../../api/mp_repo.dart';
import '../../providers/mp_context_provider.dart';
import '../../providers/transfer_providers.dart';
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
  // Collection date — defaults to today, operator may back-date (never future).
  late String _date;
  late MilkType _milkType;
  final _qty = TextEditingController();
  final _fat = TextEditingController();
  final _snf = TextEditingController();
  final _water = TextEditingController();
  final _clr = TextEditingController();
  final _qtyFocus = FocusNode();
  final _fatFocus = FocusNode();
  final _snfFocus = FocusNode();
  final _waterFocus = FocusNode();
  final _clrFocus = FocusNode();

  Timer? _debounce;
  MpRateResolution? _rate;
  bool _resolving = false;
  bool _saving = false;
  bool _closingBusy = false;
  // Water (analyzer) is optional, but the operator is routed through it before
  // save so it isn't silently skipped — gates "Save & next" in analyzer mode.
  bool _waterVisited = false;

  /// Types the operator may select at this node. Falls back to the four
  /// non-legacy defaults when the node has no restriction.
  List<MilkType> get _effectiveAllowed {
    final allowed = widget.node.allowedMilkTypes;
    if (allowed != null && allowed.isNotEmpty) return allowed;
    return _defaultSelectableMilkTypes;
  }

  /// The node's preferred default, clamped to allowed — or the first allowed
  /// type when the node has no preference.
  MilkType get _nodeDefaultMilkType {
    final preferred = widget.node.defaultMilkType;
    final allowed = _effectiveAllowed;
    if (preferred != null && allowed.contains(preferred)) return preferred;
    return allowed.first;
  }

  @override
  void initState() {
    super.initState();
    _date = widget.seedPour?.collectionDate ?? todayIso();
    final seed = widget.seedPour;
    if (seed != null) {
      _farmer = widget.seedFarmer;
      _shift = seed.shift;
      // Edit: preserve the pour's actual milk type even if it's outside the
      // node's current allowed set (e.g. legacy cow data).
      _milkType = seed.milkType;
      _qty.text = _trimNum(seed.qtyLitres);
      if (widget.node.isLactometer) {
        if (seed.clr != null) _clr.text = _trimNum(seed.clr!);
      } else {
        if (seed.fat != null) _fat.text = _trimNum(seed.fat!);
        if (seed.snf != null) _snf.text = _trimNum(seed.snf!);
        if (seed.water != null) _water.text = _trimNum(seed.water!);
      }
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _resolveRate();
      });
    } else {
      _milkType = _nodeDefaultMilkType;
    }
    _waterFocus.addListener(() {
      if (_waterFocus.hasFocus && !_waterVisited) setState(() => _waterVisited = true);
    });
  }

  String _trimNum(double n) =>
      n == n.truncateToDouble() ? n.toInt().toString() : n.toString();

  @override
  void dispose() {
    _debounce?.cancel();
    _qty.dispose();
    _fat.dispose();
    _snf.dispose();
    _water.dispose();
    _clr.dispose();
    _qtyFocus.dispose();
    _fatFocus.dispose();
    _snfFocus.dispose();
    _waterFocus.dispose();
    _clrFocus.dispose();
    super.dispose();
  }

  double get _qtyVal => double.tryParse(_qty.text) ?? 0;
  double? get _fatVal => double.tryParse(_fat.text);
  double? get _snfVal => double.tryParse(_snf.text);
  double? get _waterVal => double.tryParse(_water.text);
  double? get _clrVal => double.tryParse(_clr.text);
  bool get _isEdit => widget.seedPour != null;
  // edits keep the original collection date; fresh entries default to today
  // but can be back-dated via the date picker.
  String get _collectionDate => _date;
  // Water is optional, but the operator must reach it once (or actually fill it)
  // before the flow lets them save — so it's never silently skipped. "Visited"
  // is set when the field gains focus; editing FAT/SNF re-arms it (so going back
  // to a quality field routes through water again instead of jumping to save).
  bool get _waterReady => _waterVal != null || _waterVisited;
  bool get _canSave => _farmer != null && _qtyVal > 0 && !_saving &&
      (widget.node.isLactometer
          ? _clrVal != null
          : _fatVal != null && _snfVal != null && _waterReady);

  void _onFieldChanged() {
    setState(() {});
    _debounce?.cancel();
    final ready = widget.node.isLactometer
        ? _clrVal != null
        : _fatVal != null && _snfVal != null;
    if (!ready) {
      setState(() => _rate = null);
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 450), _resolveRate);
  }

  Future<void> _resolveRate() async {
    final isLactometer = widget.node.isLactometer;
    final clr = _clrVal;
    final fat = _fatVal;
    final snf = _snfVal;
    if (isLactometer && clr == null) return;
    if (!isLactometer && (fat == null || snf == null)) return;
    setState(() => _resolving = true);
    try {
      final r = await mpRepo.resolveRate(
        milkType: _milkType,
        fat: isLactometer ? null : fat,
        snf: isLactometer ? null : snf,
        clr: isLactometer ? clr : null,
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

  /// Farmers already collected for the active (date, shift) slot — passed to the
  /// picker so their rows read "Recorded". The entries list watches the same
  /// date-scoped provider, so it's loaded by the time the picker opens.
  Set<String> _recordedFarmerIdsForSlot() => {
        for (final p in _poursForActiveDate())
          if (p.shift == _shift) p.farmerId,
      };

  Future<void> _pickFarmer() async {
    final picked = await showFarmerPicker(context, ref, widget.node.id,
        recordedFarmerIds: _recordedFarmerIdsForSlot());
    if (picked != null) {
      setState(() {
        _farmer = picked;
        // Use farmer's default only when it's within the node's allowed set;
        // otherwise fall back to the node's own default.
        final farmerDefault = picked.defaultMilkType;
        _milkType = _effectiveAllowed.contains(farmerDefault)
            ? farmerDefault
            : _nodeDefaultMilkType;
      });
      _onFieldChanged();
      _qtyFocus.requestFocus(); // jump straight into entry
    }
  }

  /// The bottom button doubles as a "next field" stepper: when something's
  /// missing it focuses the first empty field; once all are in, it saves.
  void _onPrimary() {
    if (_farmer == null) { _pickFarmer(); return; }
    if (_qtyVal <= 0) { _qtyFocus.requestFocus(); return; }
    if (widget.node.isLactometer) {
      if (_clrVal == null) { _clrFocus.requestFocus(); return; }
    } else {
      if (_fatVal == null) { _fatFocus.requestFocus(); return; }
      if (_snfVal == null) { _snfFocus.requestFocus(); return; }
      if (!_waterReady) { _waterFocus.requestFocus(); return; }
    }
    _save();
  }

  /// Recorded pours at this node for the active entry date — today's list (kept
  /// invalidated) or the date-scoped list for a back-dated entry.
  List<MpPour> _poursForActiveDate() {
    final async = _date == todayIso()
        ? ref.read(nodeTodayPoursProvider(widget.node.id))
        : ref.read(nodePoursForDateProvider((nodeId: widget.node.id, date: _date)));
    return async.asData?.value ?? const <MpPour>[];
  }

  /// The farmer's existing recorded pour(s) for this exact slot (date + shift +
  /// milk type). Drives the replace-or-combine prompt. The list is recorded-only,
  /// so a hit means a real prior reading. Usually one, but legacy data may hold
  /// several separate lots — combine merges them all.
  List<MpPour> _existingSlotPours() => [
        for (final p in _poursForActiveDate())
          if (p.farmerId == _farmer!.id && p.shift == _shift && p.milkType == _milkType) p,
      ];

  /// Qty-weighted average of one quality field across readings, ignoring any that
  /// lack the value (e.g. an optional water reading on one container only).
  /// Rounded to one decimal to match how the field is measured/entered.
  double? _weightedAvg(List<MpPour> existing, double newQty, double? newVal,
      double? Function(MpPour) field) {
    var weighted = 0.0, qty = 0.0;
    if (newVal != null) { weighted += newVal * newQty; qty += newQty; }
    for (final p in existing) {
      final v = field(p);
      if (v != null) { weighted += v * p.qtyLitres; qty += p.qtyLitres; }
    }
    if (qty == 0) return null;
    return (weighted / qty * 10).roundToDouble() / 10;
  }

  Future<void> _save() async {
    if (!_canSave) return;
    // Drop the keypad up front: closing the prompt sheet would otherwise restore
    // focus to the last field and flash the keyboard back on.
    FocusScope.of(context).unfocus();
    if (_isEdit) return _saveEdit();
    // A repeat for the same slot is a correction by default; combining a second
    // container is deliberate. Ask, so an operator never silently double-pays a
    // farmer. Capture name before any await so context stays synchronously usable.
    final name = farmerName(context, _farmer!);
    final existing = _existingSlotPours();
    if (existing.isNotEmpty) {
      final choice = await _askReplaceOrCombine(existing);
      if (choice == null) return; // cancelled — keep the form as-is
      if (choice) return _saveCombined(existing, name); // merge containers
      // else: replace prior reading (correction) — falls through as a fresh record
    }
    final qtyLabel = litres(_qtyVal, unit: true);
    setState(() => _saving = true);
    final body = <String, dynamic>{
      'nodeId': widget.node.id,
      'farmerId': _farmer!.id,
      'collectionDate': _date,
      'shift': _shift.name,
      'milkType': milkTypeToApi(_milkType),
      'qtyLitres': _qtyVal,
      if (widget.node.isLactometer) 'clr': _clrVal
      else ...{'fat': _fatVal, 'snf': _snfVal, if (_waterVal != null) 'water': _waterVal},
      'asNewLot': false,
    };
    final bool sentNow;
    try {
      sentNow = await PourQueue.instance.record(body);
    } catch (e) {
      // A server rejection (e.g. no active rate chart for this milk type) is not
      // queued — surface it so the operator can fix it instead of losing the pour.
      if (mounted) {
        setState(() => _saving = false);
        showDhenuToast(context, '$e', type: DhenuToastType.error);
      }
      return;
    }
    if (!mounted) return;
    ref.invalidate(nodeTodaySummaryProvider(widget.node.id));
    ref.invalidate(nodeTodayPoursProvider(widget.node.id));
    // Back-dated entry: refresh the date-scoped list that the entries section
    // and the picker's "Recorded" marks read from.
    if (_date != todayIso()) {
      ref.invalidate(nodePoursForDateProvider((nodeId: widget.node.id, date: _date)));
    }
    FocusScope.of(context).unfocus(); // dismiss the keypad between farmers
    _showSavedSnack(name, qtyLabel, sentNow);
    _resetForNext();
  }

  /// Combine this container with the farmer's existing reading(s) for the slot:
  /// quantities add up and FAT/SNF/Water/CLR are qty-weighted into one pour, then
  /// the prior lots are reversed and the merged reading recorded. Online-only —
  /// it depends on reversing server-side rows (mirrors [_saveEdit]).
  Future<void> _saveCombined(List<MpPour> existing, String name) async {
    final totalQty = _qtyVal + existing.fold<double>(0, (s, p) => s + p.qtyLitres);
    final fat = _weightedAvg(existing, _qtyVal, _fatVal, (p) => p.fat);
    final snf = _weightedAvg(existing, _qtyVal, _snfVal, (p) => p.snf);
    final water = _weightedAvg(existing, _qtyVal, _waterVal, (p) => p.water);
    final clr = _weightedAvg(existing, _qtyVal, _clrVal, (p) => p.clr);
    final qtyLabel = litres(totalQty, unit: true);
    setState(() => _saving = true);
    try {
      for (final p in existing) {
        await mpRepo.reversePour(p.id);
      }
      await mpRepo.recordPour({
        'nodeId': widget.node.id,
        'farmerId': _farmer!.id,
        'collectionDate': _date,
        'shift': _shift.name,
        'milkType': milkTypeToApi(_milkType),
        'qtyLitres': totalQty,
        if (widget.node.isLactometer) 'clr': clr
        else ...{'fat': fat, 'snf': snf, 'water': ?water},
        'asNewLot': false,
      });
      if (!mounted) return;
      ref.invalidate(nodeTodaySummaryProvider(widget.node.id));
      ref.invalidate(nodeTodayPoursProvider(widget.node.id));
      if (_date != todayIso()) {
        ref.invalidate(nodePoursForDateProvider((nodeId: widget.node.id, date: _date)));
      }
      FocusScope.of(context).unfocus();
      _showSavedSnack(name, qtyLabel, true);
      _resetForNext();
    } catch (e) {
      if (mounted) {
        setState(() => _saving = false);
        showDhenuToast(context, '$e', type: DhenuToastType.error);
      }
    }
  }

  /// Edit an existing entry: reverse the original (targeted, by id) and re-record
  /// the correction on its ORIGINAL date as a lot, so siblings are untouched and
  /// past-day edits don't migrate to today. Online-only (edits are infrequent).
  Future<void> _saveEdit() async {
    final seed = widget.seedPour!;
    final name = farmerName(context, _farmer!);
    final qtyLabel = litres(_qtyVal, unit: true);
    setState(() => _saving = true);
    try {
      await mpRepo.reversePour(seed.id);
      await mpRepo.recordPour({
        'nodeId': widget.node.id,
        'farmerId': _farmer!.id,
        'collectionDate': seed.collectionDate,
        'shift': _shift.name,
        'milkType': milkTypeToApi(_milkType),
        'qtyLitres': _qtyVal,
        if (widget.node.isLactometer) 'clr': _clrVal
        else ...{'fat': _fatVal, 'snf': _snfVal, if (_waterVal != null) 'water': _waterVal},
        'asNewLot': true,
      });
      if (!mounted) return;
      ref.invalidate(nodeTodayPoursProvider(widget.node.id));
      ref.invalidate(nodeTodaySummaryProvider(widget.node.id));
      ref.invalidate(nodeHistoryPoursProvider(widget.node.id));
      ref.invalidate(nodePoursForDateProvider((nodeId: widget.node.id, date: seed.collectionDate)));
      ref.invalidate(farmerHistoryPoursProvider);
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
        sentNow ? '$qtyLabel · $name' : AppLocalizations.of(context).collectSavedOnDevice,
        type: sentNow ? DhenuToastType.success : DhenuToastType.info,
        icon: sentNow ? null : DhenuIcons.cloud,
      );

  /// Returns true = combine containers, false = replace prior, null = cancel.
  Future<bool?> _askReplaceOrCombine(List<MpPour> existing) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final shiftLabel = _shift == Shift.am ? 'AM' : 'PM';
    // Capture now: _farmer is cleared on save while the sheet animates out.
    final capturedName = farmerName(context, _farmer!);
    final priorQty = existing.fold<double>(0, (s, p) => s + p.qtyLitres);
    final combinedQty = priorQty + _qtyVal;
    final first = existing.first;
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
                Text(l.collectAlreadyRecorded(shiftLabel),
                    style: DhenuText.title.copyWith(color: t.ink)),
                const SizedBox(height: DhenuSpacing.xs),
                Text(l.collectReplaceOrCombine(capturedName),
                    style: DhenuText.caption.copyWith(color: t.inkSoft)),
                const SizedBox(height: DhenuSpacing.md),
                DhenuCard(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(
                      '${_milkLabel(first.milkType)} · ${litres(priorQty, unit: true)}',
                      style: DhenuText.body.copyWith(color: t.ink),
                    ),
                    if (existing.length == 1 && first.fat != null) ...[
                      const SizedBox(height: DhenuSpacing.sm),
                      QualityBadge(
                        fat: first.fat, snf: first.snf, water: first.water,
                        grade: first.qualityGrade, format: QualityFormat.valueLabel),
                    ],
                  ]),
                ),
                const SizedBox(height: DhenuSpacing.sm),
                // What "Combine" will produce, so the operator confirms the total.
                Text(l.collectCombineResult(litres(combinedQty, unit: true)),
                    style: DhenuText.caption.copyWith(color: t.brand)),
                const SizedBox(height: DhenuSpacing.lg),
                Row(children: [
                  Expanded(child: OutlinedButton(
                    onPressed: () => Navigator.pop(ctx, false),
                    child: Text(l.collectReplace),
                  )),
                  const SizedBox(width: DhenuSpacing.md),
                  Expanded(child: FilledButton(
                    onPressed: () => Navigator.pop(ctx, true),
                    child: Text(l.collectCombine),
                  )),
                ]),
                Center(child: TextButton(
                  onPressed: () => Navigator.pop(ctx, null),
                  child: Text(l.commonCancel, style: DhenuText.label.copyWith(color: t.inkSoft)),
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
      _water.clear();
      _clr.clear();
      _rate = null;
      _saving = false;
    });
  }

  // ── shift close ─────────────────────────────────────────────────────────────
  // BMC nodes pool the whole day → close both shifts; no-BMC closes the selected
  // shift. A closed slot freezes recording here and gates dispatch downstream.
  bool _slotClosed(MpShiftStatus? st) {
    if (st == null) return false;
    return widget.node.hasBmc ? st.dayClosed : st.closedFor(_shift.name);
  }

  /// Don't close while unsynced pours for this slot sit in the offline queue —
  /// they'd otherwise land after the close and slip past the guard on sync.
  bool _hasPendingForClose() {
    final pending = PourQueue.instance.pendingFor(widget.node.id);
    if (widget.node.hasBmc) return pending.isNotEmpty;
    return pending.any((p) => p.shift == _shift.name);
  }

  String? get _closeShiftArg => widget.node.hasBmc ? null : _shift.name;

  Future<void> _closeShift() async {
    if (_hasPendingForClose()) {
      showDhenuToast(context, AppLocalizations.of(context).collectCloseBlockedPending,
          type: DhenuToastType.error);
      return;
    }
    await _runClose(() => mpRepo.closeShift(widget.node.id, _date, shift: _closeShiftArg));
  }

  Future<void> _reopenShift() async =>
      _runClose(() => mpRepo.reopenShift(widget.node.id, _date, shift: _closeShiftArg));

  Future<void> _runClose(Future<MpShiftStatus> Function() action) async {
    setState(() => _closingBusy = true);
    try {
      await action();
      if (!mounted) return;
      // Date-scoped so the dispatch screen's gate (which reads the same date)
      // and this screen's banner refresh; the today-scoped families keep Home in
      // sync when the entry is for today.
      ref.invalidate(shiftStatusForDateProvider((nodeId: widget.node.id, date: _date)));
      ref.invalidate(shiftStatusProvider(widget.node.id));
      ref.invalidate(nodeTodayPoursProvider(widget.node.id));
      ref.invalidate(nodeTodaySummaryProvider(widget.node.id));
      ref.invalidate(nodeAvailabilityForDateProvider((nodeId: widget.node.id, date: _date, shift: _shift.name)));
      ref.invalidate(nodeAvailabilityForDateProvider((nodeId: widget.node.id, date: _date, shift: null)));
      ref.invalidate(nodeAvailabilityProvider((nodeId: widget.node.id, shift: _shift.name)));
      ref.invalidate(nodeAvailabilityProvider((nodeId: widget.node.id, shift: null)));
    } catch (e) {
      if (mounted) showDhenuToast(context, '$e', type: DhenuToastType.error);
    } finally {
      if (mounted) setState(() => _closingBusy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final shiftStatus =
        ref.watch(shiftStatusForDateProvider((nodeId: widget.node.id, date: _date))).asData?.value;
    final closed = _slotClosed(shiftStatus);
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.seedPour != null ? l.editCollectionTitle : l.recordCollectionTitle,
            style: DhenuText.h2.copyWith(color: t.ink)),
      ),
      // Column (not a floating bottomSheet) so the action button never overlaps
      // the fields: the ListView viewport ends at the button, so the focused
      // field always auto-scrolls to sit above it and above the keypad.
      body: Column(children: [
        Expanded(
          child: ListView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.fromLTRB(
            DhenuSpacing.screen, DhenuSpacing.lg, DhenuSpacing.screen, DhenuSpacing.lg),
        children: [
          _datePicker(t),
          if (closed) ...[
            const SizedBox(height: DhenuSpacing.md),
            _closedBanner(t),
          ],
          const SizedBox(height: DhenuSpacing.lg),
          ShiftToggle(value: _shift, onChanged: (s) => setState(() => _shift = s), expand: true),
          const SizedBox(height: DhenuSpacing.lg),
          _farmerField(t),
          const SizedBox(height: DhenuSpacing.lg),
          _milkTypePicker(t),
          const SizedBox(height: DhenuSpacing.lg),
          if (widget.node.isLactometer) ...[
            Row(children: [
              Expanded(child: _numberField(_qty, l.commonLitres, 'L', _qtyFocus, _clrFocus)),
              const SizedBox(width: DhenuSpacing.md),
              Expanded(child: _numberField(_clr, 'CLR', '', _clrFocus, null)),
            ]),
          ] else ...[
            Row(children: [
              Expanded(child: _numberField(_qty, l.commonLitres, 'L', _qtyFocus, _fatFocus)),
              const SizedBox(width: DhenuSpacing.md),
              Expanded(child: _numberField(_fat, 'FAT', '%', _fatFocus, _snfFocus, resetsWater: true)),
              const SizedBox(width: DhenuSpacing.md),
              Expanded(child: _numberField(_snf, 'SNF', '%', _snfFocus, _waterFocus, resetsWater: true)),
            ]),
            const SizedBox(height: DhenuSpacing.md),
            // Same one-third width as the trio above (optional → left-aligned,
            // two empty slots fill the row).
            Row(children: [
              Expanded(child: _numberField(_water, 'Water', '%', _waterFocus, null)),
              const SizedBox(width: DhenuSpacing.md),
              const Expanded(child: SizedBox.shrink()),
              const SizedBox(width: DhenuSpacing.md),
              const Expanded(child: SizedBox.shrink()),
            ]),
          ],
          const SizedBox(height: DhenuSpacing.lg),
          _ratePreview(t),
          const SizedBox(height: DhenuSpacing.xl),
          _recentToday(t),
          if (!_isEdit && !closed) ...[
            const SizedBox(height: DhenuSpacing.lg),
            _closeButton(t),
          ],
        ],
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.all(DhenuSpacing.screen),
            child: PrimaryAction(
              label: _canSave ? l.collectSaveAndNext : l.commonNext,
              icon: _canSave ? DhenuIcons.check : DhenuIcons.arrowRight,
              loading: _saving,
              onPressed: (_saving || closed) ? null : _onPrimary,
            ),
          ),
        ),
      ]),
    );
  }

  String get _shiftLabel => _shift == Shift.am ? 'AM' : 'PM';

  /// Amber banner shown when the slot is closed: collection is frozen, with a
  /// Reopen affordance (server rejects reopen once anything has been dispatched).
  Widget _closedBanner(DhenuTokens t) {
    final l = AppLocalizations.of(context);
    final msg = widget.node.hasBmc ? l.collectDayClosedBanner : l.collectClosedBanner(_shiftLabel);
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
        Expanded(child: Text(msg, style: DhenuText.label.copyWith(color: t.ink))),
        TextButton(
          onPressed: _closingBusy ? null : _reopenShift,
          child: Text(l.collectReopen, style: DhenuText.label.copyWith(color: t.brand)),
        ),
      ]),
    );
  }

  /// "Close collection" once the operator is done — freezes the slot and unlocks
  /// dispatch. Disabled while unsynced pours for the slot are still queued.
  Widget _closeButton(DhenuTokens t) {
    final l = AppLocalizations.of(context);
    final label = widget.node.hasBmc ? l.collectCloseDay : l.collectCloseShift(_shiftLabel);
    return SizedBox(
      width: double.infinity,
      child: OutlinedButton.icon(
        onPressed: _closingBusy ? null : _closeShift,
        icon: Icon(DhenuIcons.lock, size: 18, color: t.brand),
        label: Text(label, style: DhenuText.label.copyWith(color: t.brand)),
      ),
    );
  }

  /// Lets the operator back-date an entry (e.g. catching up on a missed slot).
  /// Future dates are blocked — `lastDate` is today.
  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime.tryParse(_date) ?? now,
      firstDate: DateTime(now.year - 1),
      lastDate: now,
    );
    if (picked == null) return;
    setState(() => _date = isoDate(picked));
    _onFieldChanged(); // re-resolve the rate against the new date's chart
  }

  /// Date row, styled like the farmer field. Read-only while editing — an edit
  /// keeps the original entry's collection date.
  Widget _datePicker(DhenuTokens t) {
    final l = AppLocalizations.of(context);
    final label = _date == todayIso()
        ? '${prettyDate(_date)} · ${l.commonToday}'
        : prettyDate(_date);
    return InkWell(
      onTap: _isEdit ? null : _pickDate,
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
          Icon(DhenuIcons.calendar, color: t.brand),
          const SizedBox(width: DhenuSpacing.md),
          Expanded(
            child: Text(label,
                style: DhenuText.title.copyWith(color: t.ink, fontWeight: FontWeight.w600)),
          ),
          if (!_isEdit) Icon(DhenuIcons.chevronRight, color: t.inkSoft),
        ]),
      ),
    );
  }

  /// Recorded pours at this node for the selected date and shift, live
  /// (invalidated on each save). Filtered to the active shift so the list mirrors
  /// exactly the slot being entered.
  Widget _recentToday(DhenuTokens t) {
    final l = AppLocalizations.of(context);
    final isToday = _date == todayIso();
    final all = (isToday
                ? ref.watch(nodeTodayPoursProvider(widget.node.id))
                : ref.watch(nodePoursForDateProvider((nodeId: widget.node.id, date: _date))))
            .asData?.value ??
        const <MpPour>[];
    final pours = [for (final p in all) if (p.shift == _shift) p];
    if (pours.isEmpty) return const SizedBox.shrink();
    final farmers = ref.watch(nodeFarmersProvider(widget.node.id)).asData?.value ?? const <MpFarmer>[];
    final byId = {for (final f in farmers) f.id: f};
    final bands = ref.watch(qualityBandsProvider(widget.node.id)).asData?.value;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(isToday ? l.collectTodaysEntries(pours.length) : l.collectEntries(pours.length),
          style: DhenuText.title.copyWith(color: t.ink)),
      const SizedBox(height: DhenuSpacing.sm),
      ShiftGroupedPours(
        pours: pours,
        farmersById: byId,
        maxRowsPerShift: 8,
        showAvatar: false,
        showDate: !isToday,
        bands: bands,
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
              child: _farmer == null
                  ? Text(
                      AppLocalizations.of(context).commonSelectFarmer,
                      style: DhenuText.title.copyWith(color: t.inkSoft, fontWeight: FontWeight.w400),
                    )
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        // Name leads, id sits beneath in small caption text.
                        Text(farmerName(context, _farmer!),
                            style: DhenuText.title.copyWith(color: t.ink, fontWeight: FontWeight.w600),
                            maxLines: 1, overflow: TextOverflow.ellipsis),
                        Text(_farmer!.code, style: DhenuText.caption.copyWith(color: t.inkSoft)),
                      ],
                    ),
            ),
            const SizedBox(width: DhenuSpacing.sm),
            Icon(DhenuIcons.chevronRight, color: t.inkSoft),
          ]),
        ),
      );

  static const _defaultSelectableMilkTypes = [
    MilkType.cowA1, MilkType.cowA2, MilkType.buffalo, MilkType.mixed,
  ];

  Widget _milkTypePicker(DhenuTokens t) {
    final allowed = _effectiveAllowed;

    // Single-type node: show a read-only label instead of a picker.
    if (allowed.length == 1) {
      return Row(children: [
        Icon(DhenuIcons.milk, size: 16, color: t.brand),
        const SizedBox(width: DhenuSpacing.sm),
        Text('${AppLocalizations.of(context).commonMilkType} · ', style: DhenuText.label.copyWith(color: t.inkSoft)),
        Text(_milkLabel(allowed.first), style: DhenuText.label.copyWith(color: t.ink)),
      ]);
    }

    // IntrinsicHeight + stretch keeps pills uniform when a longer label wraps.
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: allowed.map((m) {
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
                  constraints: const BoxConstraints(minHeight: 44),
                  alignment: Alignment.center,
                  padding: const EdgeInsets.symmetric(
                      horizontal: DhenuSpacing.xs, vertical: DhenuSpacing.sm),
                  decoration: BoxDecoration(
                    color: selected ? t.brandSubtle : Colors.transparent,
                    borderRadius: BorderRadius.circular(DhenuRadii.pill),
                    border: Border.all(color: selected ? t.brand : t.hairline),
                  ),
                  child: Text(
                    _milkLabel(m),
                    textAlign: TextAlign.center,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: DhenuText.label.copyWith(color: selected ? t.brand : t.inkSoft),
                  ),
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  String _milkLabel(MilkType m) => milkTypeL10n(AppLocalizations.of(context), m);

  Widget _numberField(
    TextEditingController c, String label, String suffix, FocusNode focus, FocusNode? next, {
    bool resetsWater = false,
  }) =>
      TextField(
        controller: c,
        focusNode: focus,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        textInputAction: next == null ? TextInputAction.done : TextInputAction.next,
        textAlign: TextAlign.center,
        style: DhenuText.number(size: 22),
        inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d*'))],
        // Tighter horizontal padding than the themed default (lg) — the 3-up
        // FAT/SNF/Litres row is narrow on small phones and the centred 22px
        // value clips against the suffix. Vertical kept at the theme value.
        decoration: InputDecoration(
          labelText: label,
          suffixText: suffix,
          contentPadding: const EdgeInsets.symmetric(
              horizontal: DhenuSpacing.sm, vertical: DhenuSpacing.md + 2),
        ),
        onChanged: (_) {
          // Editing FAT/SNF re-arms the (empty) water step so it isn't skipped.
          if (resetsWater && _waterVisited && _waterVal == null) _waterVisited = false;
          _onFieldChanged();
        },
        onSubmitted: (_) => next == null ? _onPrimary() : next.requestFocus(),
      );

  Widget _ratePreview(DhenuTokens t) {
    final l = AppLocalizations.of(context);
    if (_resolving) {
      return _previewShell(t, child: Text(l.collectComputingRate, style: DhenuText.body.copyWith(color: t.inkSoft)));
    }
    final r = _rate;
    if (r == null) {
      final isLactometer = widget.node.isLactometer;
      final missingInput = isLactometer ? _clrVal == null : (_fatVal == null || _snfVal == null);
      return _previewShell(t,
          child: Text(
            missingInput
                ? (isLactometer ? l.collectEnterClrPreview : l.collectEnterFatSnfPreview)
                : l.collectRateOnSync,
            style: DhenuText.body.copyWith(color: t.inkSoft),
          ));
    }
    final line = _qtyVal * r.ratePerLitre;
    final bands = ref.watch(qualityBandsProvider(widget.node.id)).asData?.value;
    final lowLabels = _lowMetricLabels(bands);
    return _previewShell(
      t,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Flexible(
              child: Padding(
                padding: const EdgeInsets.only(right: DhenuSpacing.md),
                child: widget.node.isLactometer
                    ? QualityBadge(fat: null, snf: null, grade: r.grade ?? Grade.unknown)
                    : QualityBadge(fat: _fatVal, snf: _snfVal, water: _waterVal, grade: r.grade ?? Grade.unknown),
              ),
            ),
            Row(mainAxisSize: MainAxisSize.min, children: [
              Text(rupees(r.ratePerLitre, paise: true), style: DhenuText.number(size: 22, color: t.brand)),
              Text(' /L', style: DhenuText.caption.copyWith(color: t.inkSoft)),
            ]),
          ],
        ),
        if (lowLabels.isNotEmpty) ...[
          const SizedBox(height: DhenuSpacing.sm),
          _lowQualityChip(lowLabels, t),
        ],
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

  /// Returns labels (e.g. ['FAT', 'SNF']) for metrics that are LOW per bands.
  List<String> _lowMetricLabels(QualityBands? bands) {
    if (bands == null) return const [];
    final low = <String>[];
    if (widget.node.isLactometer) {
      final clr = _clrVal;
      if (clr != null && bands.levelFor(_milkType, 'clr', clr) == QualityLevel.low) low.add('CLR');
    } else {
      final fat = _fatVal;
      if (fat != null && bands.levelFor(_milkType, 'fat', fat) == QualityLevel.low) low.add('FAT');
      final snf = _snfVal;
      if (snf != null && bands.levelFor(_milkType, 'snf', snf) == QualityLevel.low) low.add('SNF');
    }
    return low;
  }

  Widget _lowQualityChip(List<String> labels, DhenuTokens t) => Container(
        padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.sm, vertical: DhenuSpacing.xs),
        decoration: BoxDecoration(
          color: t.gradeC.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(DhenuRadii.pill),
          border: Border.all(color: t.gradeC.withValues(alpha: 0.35)),
        ),
        child: Text(
          '⚠ Low ${labels.join(' · Low ')}',
          style: DhenuText.caption.copyWith(color: t.gradeC),
        ),
      );

  Widget _previewShell(DhenuTokens t, {required Widget child}) => SizedBox(
        width: double.infinity,
        child: DhenuCard(
          child: child,
        ),
      );
}
