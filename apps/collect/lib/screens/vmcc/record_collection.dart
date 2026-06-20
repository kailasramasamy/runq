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
  late MilkType _milkType;
  final _qty = TextEditingController();
  final _fat = TextEditingController();
  final _snf = TextEditingController();
  final _clr = TextEditingController();
  final _qtyFocus = FocusNode();
  final _fatFocus = FocusNode();
  final _snfFocus = FocusNode();
  final _clrFocus = FocusNode();

  Timer? _debounce;
  MpRateResolution? _rate;
  bool _resolving = false;
  bool _saving = false;

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
      }
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _resolveRate();
      });
    } else {
      _milkType = _nodeDefaultMilkType;
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
    _clr.dispose();
    _qtyFocus.dispose();
    _fatFocus.dispose();
    _snfFocus.dispose();
    _clrFocus.dispose();
    super.dispose();
  }

  double get _qtyVal => double.tryParse(_qty.text) ?? 0;
  double? get _fatVal => double.tryParse(_fat.text);
  double? get _snfVal => double.tryParse(_snf.text);
  double? get _clrVal => double.tryParse(_clr.text);
  bool get _isEdit => widget.seedPour != null;
  // edits keep the original collection date; fresh entries are for today
  String get _collectionDate => widget.seedPour?.collectionDate ?? todayIso();
  bool get _canSave => _farmer != null && _qtyVal > 0 && !_saving &&
      (widget.node.isLactometer ? _clrVal != null : _fatVal != null && _snfVal != null);

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

  Future<void> _pickFarmer() async {
    final picked = await showFarmerPicker(context, ref, widget.node.id);
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
    }
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
    // Capture name before any await so context is still synchronously accessible.
    final name = farmerName(context, _farmer!);
    final existing = _existingSlotPour();
    var asNewLot = false;
    if (existing != null) {
      final choice = await _askReplaceOrAdd(existing);
      if (choice == null) return; // cancelled — keep the form as-is
      asNewLot = choice;
    }
    final qtyLabel = litres(_qtyVal, unit: true);
    setState(() => _saving = true);
    final body = <String, dynamic>{
      'nodeId': widget.node.id,
      'farmerId': _farmer!.id,
      'collectionDate': todayIso(),
      'shift': _shift.name,
      'milkType': milkTypeToApi(_milkType),
      'qtyLitres': _qtyVal,
      if (widget.node.isLactometer) 'clr': _clrVal
      else ...{'fat': _fatVal, 'snf': _snfVal},
      'asNewLot': asNewLot,
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
    FocusScope.of(context).unfocus(); // dismiss the keypad between farmers
    _showSavedSnack(name, qtyLabel, sentNow);
    _resetForNext();
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
        else ...{'fat': _fatVal, 'snf': _snfVal},
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
        sentNow ? '$qtyLabel · $name' : AppLocalizations.of(context).collectSavedOnDevice,
        type: sentNow ? DhenuToastType.success : DhenuToastType.info,
        icon: sentNow ? null : DhenuIcons.cloud,
      );

  /// Returns true = add another lot, false = replace prior, null = cancel.
  Future<bool?> _askReplaceOrAdd(MpPour existing) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final shiftLabel = _shift == Shift.am ? 'AM' : 'PM';
    // Capture now: _farmer is cleared on save while the sheet animates out.
    final capturedName = farmerName(context, _farmer!);
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
                Text(l.collectReplaceOrAdd(capturedName),
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
                    child: Text(l.collectReplace),
                  )),
                  const SizedBox(width: DhenuSpacing.md),
                  Expanded(child: FilledButton(
                    onPressed: () => Navigator.pop(ctx, true),
                    child: Text(l.collectAddLot),
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
      _clr.clear();
      _rate = null;
      _saving = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.seedPour != null ? l.editCollectionTitle : l.recordCollectionTitle,
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
              Expanded(child: _numberField(_fat, 'FAT', '%', _fatFocus, _snfFocus)),
              const SizedBox(width: DhenuSpacing.md),
              Expanded(child: _numberField(_snf, 'SNF', '%', _snfFocus, null)),
            ]),
          ],
          const SizedBox(height: DhenuSpacing.lg),
          _ratePreview(t),
          const SizedBox(height: DhenuSpacing.xl),
          _recentToday(t),
        ],
      ),
      bottomSheet: Padding(
        padding: const EdgeInsets.all(DhenuSpacing.screen),
        child: PrimaryAction(
          label: _canSave ? l.collectSaveAndNext : l.commonNext,
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
              ? '${prettyDate(_collectionDate)} · ${AppLocalizations.of(context).commonToday}'
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
      Text(AppLocalizations.of(context).collectTodaysEntries(pours.length),
          style: DhenuText.title.copyWith(color: t.ink)),
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
                _farmer != null ? farmerName(context, _farmer!) : AppLocalizations.of(context).commonSelectFarmer,
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
    return _previewShell(
      t,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          if (widget.node.isLactometer)
            QualityBadge(fat: null, snf: null, grade: r.grade ?? Grade.unknown)
          else
            QualityBadge(fat: _fatVal, snf: _snfVal, grade: r.grade ?? Grade.unknown),
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
