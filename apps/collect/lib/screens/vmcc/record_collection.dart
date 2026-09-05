import 'dart:async';
import 'package:flutter/material.dart';
import 'package:dhenu/l10n/app_localizations.dart';
import '../../theme/dhenu_icons.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../api/mp_models.dart';
import '../../l10n/l10n_helpers.dart';
import '../../api/mp_repo.dart';
import '../../providers/mp_context_provider.dart';
import '../../providers/mp_payout_providers.dart';
import '../../providers/transfer_providers.dart';
import '../../services/pour_queue.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../utils/friendly_error.dart';
import '../../widgets/can_list_strip.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_toast.dart';
import '../../widgets/pending_pours_strip.dart';
import '../../widgets/pour_detail_sheet.dart';
import '../../widgets/quality_badge.dart';
import '../../widgets/primary_action.dart';
import 'vmcc_dispatch_entry.dart';
import '../../widgets/shift_grouped_pours.dart';
import '../../widgets/shift_toggle.dart';
import '../../widgets/sheet_grabber.dart';
import '../shared/reject_sheet.dart';
import 'farmer_picker.dart';
import 'pending_duplicate_sheet.dart';

/// The most-used screen: record one farmer's pour fast. Manual entry (v1),
/// live rate preview, offline-tolerant via [PourQueue]. Spec §5.2 / §8.1.
class RecordCollectionScreen extends ConsumerStatefulWidget {
  const RecordCollectionScreen({
    super.key, required this.node, this.seedPour, this.seedFarmer,
    this.initialDate, this.initialShift,
  });
  final MpNode node;
  /// When set, the form opens pre-filled for editing this entry (Modify).
  final MpPour? seedPour;
  final MpFarmer? seedFarmer;
  /// Open on a past slot rather than today — used by the pending-close alert, so
  /// tapping "2 collections to close" lands on the slot it named instead of on a
  /// today the operator has no work on.
  final String? initialDate;
  final Shift? initialShift;
  @override
  ConsumerState<RecordCollectionScreen> createState() => _RecordCollectionScreenState();
}

class _RecordCollectionScreenState extends ConsumerState<RecordCollectionScreen> {
  MpFarmer? _farmer;
  late Shift _shift = widget.initialShift ?? shiftFrom(currentShift());
  // Collection date — defaults to today, operator may back-date (never future).
  late String _date;
  late MilkType _milkType;
  final _qty = TextEditingController();
  /// Litres of each container banked via "Add more milk", before the one still in
  /// the qty field. A farmer arriving with several cans is ONE pour: banking the
  /// cans here and saving once means a single insert, so the farmer gets a single
  /// receipt for the true total instead of one per can (audit: combine confusion).
  /// Quality is measured once for the farmer's milk, so only litres are per-can.
  final List<double> _cans = [];
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
  StreamSubscription<int>? _queueSub;
  MpRateResolution? _rate;
  bool _resolving = false;
  bool _saving = false;
  bool _closingBusy = false;

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
    _date = widget.seedPour?.collectionDate ?? widget.initialDate ?? todayIso();
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
    // Queue mutations (offline saves, drains) shift the pending duplicate sets
    // and the picker's "Recorded" tags — rebuild so they stay truthful.
    _queueSub = PourQueue.instance.changes.listen((_) {
      if (mounted) setState(() {});
    });
  }

  String _trimNum(double n) =>
      n == n.truncateToDouble() ? n.toInt().toString() : n.toString();

  @override
  void dispose() {
    _debounce?.cancel();
    _queueSub?.cancel();
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
  /// What actually gets recorded: banked cans plus whatever is in the qty field.
  /// Every qty decision — save gating, rate preview, the typo guard, the amount
  /// shown — reads this, never [_qtyVal] alone.
  double get _totalQty => _cans.fold<double>(0, (s, c) => s + c) + _qtyVal;
  double? get _fatVal => double.tryParse(_fat.text);
  double? get _snfVal => double.tryParse(_snf.text);
  double? get _waterVal => double.tryParse(_water.text);
  double? get _clrVal => double.tryParse(_clr.text);
  bool get _isEdit => widget.seedPour != null;
  // edits keep the original collection date; fresh entries default to today
  // but can be back-dated via the date picker.
  String get _collectionDate => _date;
  // Water is required wherever it is captured: it is the adulteration signal, so
  // a blank reading is a gap in the farmer's quality record, not a neutral skip.
  // Lactometer nodes have no water field at all — they stay gated on CLR alone.
  bool get _canSave => _farmer != null && _totalQty > 0 && !_saving &&
      (widget.node.isLactometer
          ? _clrVal != null
          : _fatVal != null && _snfVal != null && _waterVal != null);

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
        cycleQtyLitres: _totalQty > 0 ? _totalQty : null,
        scopeNodeId: widget.node.id,
        // The farmer's assigned override chart must price the PREVIEW too,
        // not just the recorded pour — otherwise the operator quotes one rate
        // and the server pays another.
        farmerId: _farmer?.id,
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
  /// picker so their rows read "Recorded". Includes queue-pending (offline)
  /// entries so a farmer saved on-device also shows as recorded.
  Set<String> _recordedFarmerIdsForSlot() => {
        for (final p in _poursForActiveDate())
          if (p.shift == _shift) p.farmerId,
        for (final p in _pendingForSlot()) p.farmerId,
      };

  /// Queue-pending pours for the active (date, shift) slot. Failed entries are
  /// excluded — they'll never sync, so they shouldn't gate fresh entry.
  List<PendingPour> _pendingForSlot({bool matchMilkType = false}) =>
      PourQueue.instance
          .pendingFor(widget.node.id)
          .where((p) =>
              !p.hasFailed &&
              p.collectionDate == _date &&
              p.shift == _shift.name &&
              (!matchMilkType || p.milkType == milkTypeToApi(_milkType)))
          .toList();

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
    if (_totalQty <= 0) { _qtyFocus.requestFocus(); return; }
    if (widget.node.isLactometer) {
      if (_clrVal == null) { _clrFocus.requestFocus(); return; }
    } else {
      if (_fatVal == null) { _fatFocus.requestFocus(); return; }
      if (_snfVal == null) { _snfFocus.requestFocus(); return; }
      if (_waterVal == null) { _waterFocus.requestFocus(); return; }
    }
    _save();
  }

  /// Bank the litres on screen as one container and clear the field for the next
  /// can. Quality readings stay as entered — they describe the farmer's milk, not
  /// the can. The pour isn't saved until the operator hits Save, so this never
  /// sends a receipt on its own.
  void _addCan() {
    if (_qtyVal <= 0) { _qtyFocus.requestFocus(); return; }
    setState(() {
      _cans.add(_qtyVal);
      _qty.clear();
    });
    // Same eyes-on-the-milk confirmation the save path gives (audit C1).
    HapticFeedback.selectionClick();
    _qtyFocus.requestFocus();
    _onFieldChanged(); // re-price: the rate can be slabbed on total quantity
  }

  void _removeCan(int index) {
    setState(() => _cans.removeAt(index));
    _onFieldChanged();
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

  /// Readings past any realistic value (fat-finger guard, audit C9). Server
  /// validators cap at 15/40 — these are the "surely a typo" thresholds.
  List<String> _implausibleLabels() {
    final out = <String>[];
    if (widget.node.isLactometer) {
      if ((_clrVal ?? 0) > 35) out.add('CLR ${_clr.text}');
    } else {
      if ((_fatVal ?? 0) > 12) out.add('FAT ${_fat.text}');
      if ((_snfVal ?? 0) > 12) out.add('SNF ${_snf.text}');
    }
    // Societies legitimately pour bulk; individual farmers above 100 L is a typo
    // more often than a herd.
    // Guards the TOTAL, not the can on screen — six plausible 20 L cans are still
    // an implausible 120 L pour, and that's the number the farmer gets paid on.
    if (_totalQty > 100 && !(_farmer?.isSociety ?? false)) out.add(litres(_totalQty, unit: true));
    return out;
  }

  Future<bool> _confirmImplausible() async {
    final flagged = _implausibleLabels();
    if (flagged.isEmpty) return true;
    final l = AppLocalizations.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l.collectImplausibleTitle),
        content: Text(l.collectImplausibleBody(flagged.join(' · '))),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(l.commonCancel)),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(l.collectSaveAnyway)),
        ],
      ),
    );
    return ok == true;
  }

  Future<void> _save() async {
    if (!_canSave) return;
    // Drop the keypad up front: closing the prompt sheet would otherwise restore
    // focus to the last field and flash the keyboard back on.
    FocusScope.of(context).unfocus();
    if (!await _confirmImplausible()) return;
    if (!mounted) return;
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
    // Same guard for pours saved on-device but not yet synced (offline repeat).
    // Combine isn't possible here — nothing exists server-side to reverse.
    var asNewLot = false;
    final pendingDup = _pendingForSlot(matchMilkType: true)
        .where((p) => p.farmerId == _farmer!.id)
        .toList();
    if (pendingDup.isNotEmpty) {
      if (!mounted) return;
      final action = await showPendingDuplicateSheet(context, name, pendingDup);
      if (action == null) return; // cancelled — keep the form as-is
      if (action == PendingDupAction.replace) {
        // Safe: the queued entry's deviceLocalId never reached the server, and
        // even if a drain races us, the server's last-write-wins slot reversal
        // makes replace-after-sync equivalent.
        for (final p in pendingDup) {
          await PourQueue.instance.removePending(p.key);
        }
      } else {
        asNewLot = true;
      }
    }
    final qtyLabel = litres(_totalQty, unit: true);
    setState(() => _saving = true);
    final body = <String, dynamic>{
      'nodeId': widget.node.id,
      'farmerId': _farmer!.id,
      'collectionDate': _date,
      'shift': _shift.name,
      'milkType': milkTypeToApi(_milkType),
      'qtyLitres': _totalQty,
      if (widget.node.isLactometer) 'clr': _clrVal
      else ...{'fat': _fatVal, 'snf': _snfVal, 'water': _waterVal},
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
        showDhenuToast(context, friendlyError(context, e), type: DhenuToastType.error);
      }
      return;
    }
    if (!mounted) return;
    // Only refetch server-backed providers when the pour actually reached the
    // server — offline, the refetch itself fails and bounces the entries list
    // into an error state; the pending strip covers visibility until sync.
    if (sentNow) {
      ref.invalidate(nodeTodaySummaryProvider(widget.node.id));
      ref.invalidate(nodeTodayPoursProvider(widget.node.id));
      // Back-dated entry: refresh the date-scoped list that the entries section
      // and the picker's "Recorded" marks read from.
      if (_date != todayIso()) {
        ref.invalidate(nodePoursForDateProvider((nodeId: widget.node.id, date: _date)));
      }
    }
    FocusScope.of(context).unfocus(); // dismiss the keypad between farmers
    _showSavedSnack(name, qtyLabel, sentNow);
    _resetForNext();
  }

  /// Combine this container with the farmer's existing reading(s) for the slot:
  /// quantities add up and FAT/SNF/Water/CLR are qty-weighted into one pour, then
  /// the prior lots are reversed and the merged reading recorded. Online-only —
  /// it depends on reversing server-side rows (mirrors [_saveEdit]).
  ///
  /// The priors are reversed by the server's own last-write-wins slot rule
  /// (`asNewLot: false`) rather than by reversing each here first: one atomic
  /// transaction instead of N+1 calls, and it leaves `reversalOf` set on the new
  /// pour — which is what marks the farmer's second receipt as an update to the
  /// first rather than a second collection.
  Future<void> _saveCombined(List<MpPour> existing, String name) async {
    if (_gateCorrectionOffline()) return;
    final totalQty = _totalQty + existing.fold<double>(0, (s, p) => s + p.qtyLitres);
    final fat = _weightedAvg(existing, _totalQty, _fatVal, (p) => p.fat);
    final snf = _weightedAvg(existing, _totalQty, _snfVal, (p) => p.snf);
    final water = _weightedAvg(existing, _totalQty, _waterVal, (p) => p.water);
    final clr = _weightedAvg(existing, _totalQty, _clrVal, (p) => p.clr);
    final qtyLabel = litres(totalQty, unit: true);
    setState(() => _saving = true);
    try {
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
        showDhenuToast(context, friendlyError(context, e), type: DhenuToastType.error);
      }
    }
  }

  /// Edit an existing entry: reverse the original (targeted, by id) and re-record
  /// the correction on its ORIGINAL date as a lot, so siblings are untouched and
  /// past-day edits don't migrate to today. Online-only (edits are infrequent).
  /// Corrections reverse server rows — impossible offline (deliberately not
  /// queued; see audit B6). True = gated, caller must bail.
  bool _gateCorrectionOffline() {
    if (PourQueue.instance.isOnline) return false;
    showDhenuToast(context, AppLocalizations.of(context).collectCorrectionNeedsConnection,
        type: DhenuToastType.info);
    return true;
  }

  Future<void> _saveEdit() async {
    if (_gateCorrectionOffline()) return;
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
        'qtyLitres': _totalQty,
        if (widget.node.isLactometer) 'clr': _clrVal
        else ...{'fat': _fatVal, 'snf': _snfVal, 'water': _waterVal},
        'asNewLot': true,
        // Reversed by id above, so the slot rule finds no prior to link. Name it
        // explicitly, or the farmer's corrected receipt reads as a fresh pour.
        'supersedesPourId': seed.id,
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
        showDhenuToast(context, friendlyError(context, e), type: DhenuToastType.error);
      }
    }
  }

  void _showSavedSnack(String name, String qtyLabel, bool sentNow) {
    // Non-visual confirmation: the operator's eyes are on the milk queue, not
    // the phone — a buzz + click says "saved" without looking (audit C1).
    HapticFeedback.mediumImpact();
    SystemSound.play(SystemSoundType.click);
    showDhenuToast(
      context,
      sentNow ? '$qtyLabel · $name' : AppLocalizations.of(context).collectSavedOnDevice,
      type: sentNow ? DhenuToastType.success : DhenuToastType.info,
      icon: sentNow ? null : DhenuIcons.cloud,
    );
  }

  /// Returns true = combine containers, false = replace prior, null = cancel.
  Future<bool?> _askReplaceOrCombine(List<MpPour> existing) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final shiftLabel = _shift == Shift.am ? 'AM' : 'PM';
    // Capture now: _farmer is cleared on save while the sheet animates out.
    final capturedName = farmerName(context, _farmer!);
    final priorQty = existing.fold<double>(0, (s, p) => s + p.qtyLitres);
    final combinedQty = priorQty + _totalQty;
    final first = existing.first;
    final bands = ref.read(qualityBandsProvider(widget.node.id)).valueOrNull;
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
                        grade: first.qualityGrade, format: QualityFormat.valueLabel,
                        bands: bands, milkType: first.milkType),
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
      _cans.clear();
      _fat.clear();
      _snf.clear();
      _water.clear();
      _clr.clear();
      _rate = null;
      _saving = false;
    });
    // Rapid-fire queue mode: go straight to the next farmer once the toast has
    // registered. Only for fresh same-day entry — back-dating and edits are
    // deliberate, slower flows.
    if (!_isEdit && _date == todayIso()) {
      Future.delayed(const Duration(milliseconds: 350), () {
        if (mounted && _farmer == null && !_saving) _pickFarmer();
      });
    }
  }

  // ── shift close ─────────────────────────────────────────────────────────────
  // BMC nodes pool the whole day → close both shifts; no-BMC closes the selected
  // shift. A closed slot freezes recording here and gates dispatch downstream.
  bool _slotClosed(MpShiftStatus? st) {
    if (st == null) return false;
    return widget.node.isPooledDispatch ? st.dayClosed : st.closedFor(_shift.name);
  }

  /// Don't close while unsynced pours for this slot sit in the offline queue —
  /// they'd otherwise land after the close and slip past the guard on sync.
  bool _hasPendingForClose() {
    final pending = PourQueue.instance.pendingFor(widget.node.id);
    if (widget.node.isPooledDispatch) return pending.isNotEmpty;
    return pending.any((p) => p.shift == _shift.name);
  }

  String? get _closeShiftArg => widget.node.isPooledDispatch ? null : _shift.name;

  /// Availability for the slot on screen — a BMC VMCC pools the whole day, so it
  /// has no per-shift figure. Same key the dispatch screen uses, so the two agree.
  AvailabilityDateArgs get _availArgs =>
      (nodeId: widget.node.id, date: _date, shift: widget.node.isPooledDispatch ? null : _shift.name);

  /// Record milk refused at the can. Deliberately not a pour with a flag: a
  /// pour is a promise to pay, and this milk is going home with the farmer.
  Future<void> _rejectAtGate() async {
    final farmer = _farmer;
    if (farmer == null) return;
    final l = AppLocalizations.of(context);
    var refused = 0.0;
    final done = await showRejectSheet(context, onSubmit: (d) async {
      await mpRepo.rejectAtGate({
        ...d.toBody(),
        'nodeId': widget.node.id,
        'farmerId': farmer.id,
        'collectionDate': _date,
        'shift': _shift.name,
        'milkType': milkTypeToApi(_milkType),
      });
      refused = d.qtyLitres;
    });
    if (!done || !mounted) return;
    ref.invalidate(nodeRejectionsProvider(widget.node.id));
    showDhenuToast(context, l.rejectDoneToast(litres(refused, unit: true)),
        type: DhenuToastType.success);
  }

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
      refreshPendingWork(ref);
      ref.invalidate(nodeTodaySummaryProvider(widget.node.id));
      ref.invalidate(nodeAvailabilityForDateProvider((nodeId: widget.node.id, date: _date, shift: _shift.name)));
      ref.invalidate(nodeAvailabilityForDateProvider((nodeId: widget.node.id, date: _date, shift: null)));
      ref.invalidate(nodeAvailabilityProvider((nodeId: widget.node.id, shift: _shift.name)));
      ref.invalidate(nodeAvailabilityProvider((nodeId: widget.node.id, shift: null)));
    } catch (e) {
      if (mounted) showDhenuToast(context, friendlyError(context, e), type: DhenuToastType.error);
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
    // Only meaningful once closed, and that's the only state that reads it.
    final leftToDispatch =
        ref.watch(nodeAvailabilityForDateProvider(_availArgs)).asData?.value?.available ?? 0;
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
          // Recording is over once the slot is closed — a form that's visible but
          // dead just invites taps. The banner above says why, and the pours
          // already recorded stay listed below.
          if (!closed) ...[
            _farmerField(t),
            ..._advanceChip(t, l),
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
                Expanded(child: _numberField(_snf, 'SNF', '%', _snfFocus, _waterFocus)),
              ]),
              const SizedBox(height: DhenuSpacing.md),
              // Same one-third width as the trio above (left-aligned, two empty
              // slots fill the row).
              Row(children: [
                Expanded(child: _numberField(_water, 'Water', '%', _waterFocus, null)),
                const SizedBox(width: DhenuSpacing.md),
                const Expanded(child: SizedBox.shrink()),
                const SizedBox(width: DhenuSpacing.md),
                const Expanded(child: SizedBox.shrink()),
              ]),
            ],
            // Multi-can pours are entered as ONE record: bank each container
            // here, save once. Editing an existing entry is single-valued, so
            // the affordance stays out of that flow.
            if (!_isEdit) ...[
              if (_cans.isNotEmpty) ...[
                const SizedBox(height: DhenuSpacing.lg),
                CanListStrip(cans: _cans, pending: _qtyVal, onRemove: _removeCan),
              ],
              const SizedBox(height: DhenuSpacing.md),
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  onPressed: _qtyVal > 0 ? _addCan : null,
                  icon: Icon(DhenuIcons.add, size: 18, color: t.brand),
                  label: Text(l.collectAddMoreMilk,
                      style: DhenuText.label.copyWith(color: t.brand)),
                ),
              ),
            ],
            const SizedBox(height: DhenuSpacing.lg),
            _ratePreview(t),
            const SizedBox(height: DhenuSpacing.xl),
          ],
          _recentToday(t),
          if (!_isEdit && !closed) ...[
            const SizedBox(height: DhenuSpacing.lg),
            _closeButton(t),
          ],
        ],
          ),
        ),
        // Refusing milk at the gate is the cheapest place in the network to
        // catch it, and the only point where the refusal traces to one farmer
        // beyond argument. No pour is written for these litres, so nothing
        // accrues and there is nothing to claw back later.
        if (!closed && _farmer != null)
          SafeArea(
            top: false,
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.screen),
              child: Align(
                alignment: Alignment.centerRight,
                child: TextButton.icon(
                  onPressed: _saving ? null : _rejectAtGate,
                  icon: Icon(DhenuIcons.warning, size: 16, color: t.gradeC),
                  label: Text(l.rejectAction,
                      style: DhenuText.label.copyWith(color: t.gradeC)),
                ),
              ),
            ),
          ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.all(DhenuSpacing.screen),
            child: PrimaryAction(
              // Once closed, recording is over and dispatch is the next step — so
              // this becomes the way there rather than a dead "Closed" button.
              // Close sits at the bottom of the list, so a CTA anywhere else would
              // appear off-screen under the operator's thumb. The banner up top
              // still explains the closed state and offers Reopen. Once the slot's
              // milk is all on its way, the button retires rather than inviting a
              // second dispatch the server would reject as over-quantity.
              label: !closed
                  ? (_canSave ? l.collectSaveAndNext : l.commonNext)
                  : (leftToDispatch > 0 ? l.collectDispatchNow : l.homeAllDispatched),
              icon: !closed
                  ? (_canSave ? DhenuIcons.check : DhenuIcons.arrowRight)
                  : (leftToDispatch > 0 ? DhenuIcons.transit : DhenuIcons.checkCircle),
              loading: _saving,
              onPressed: _saving || (closed && leftToDispatch <= 0)
                  ? null
                  : (closed ? _openDispatch : _onPrimary),
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
    final msg = widget.node.isPooledDispatch ? l.collectDayClosedBanner : l.collectClosedBanner(_shiftLabel);
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
        IconButton(
          onPressed: _shareShiftSummary,
          tooltip: l.collectShareSummary,
          icon: Icon(DhenuIcons.share, size: 18, color: t.brand),
        ),
        TextButton(
          onPressed: _closingBusy ? null : _reopenShift,
          child: Text(l.collectReopen, style: DhenuText.label.copyWith(color: t.brand)),
        ),
      ]),
    );
  }

  /// Closing is what unlocks dispatch, so go straight there instead of making the
  /// operator back out to home → Dispatch and re-pick the same date and shift.
  /// Opens on the slot just closed, and pops back to this screen when done. At a
  /// single-site VMCC this asks first whether the milk goes the usual leg to the
  /// chilling centre or runs the whole chain to the plant.
  Future<void> _openDispatch() async {
    await openVmccDispatch(context, node: widget.node, date: _date, shift: _shift);
    if (!mounted) return;
    // Dispatching consumes the slot's milk. These providers aren't autoDispose, so
    // without this the button keeps offering a dispatch that's already gone out.
    ref.invalidate(shiftStatusForDateProvider((nodeId: widget.node.id, date: _date)));
    ref.invalidate(nodeAvailabilityForDateProvider(_availArgs));
    ref.invalidate(nodeAvailabilityProvider);
  }

  /// The WhatsApp shift roundup operators used to type by hand (audit E5):
  /// one tap composes the slot's totals into a share-ready message. Uses the
  /// wa.me text share (no recipient — WhatsApp shows its own picker), so no
  /// extra share dependency is needed.
  Future<void> _shareShiftSummary() async {
    final l = AppLocalizations.of(context);
    final pours = [for (final p in _poursForActiveDate()) if (p.shift == _shift) p];
    final qty = pours.fold<double>(0, (s, p) => s + p.qtyLitres);
    final farmers = pours.map((p) => p.farmerId).toSet().length;
    double wsum(double? Function(MpPour) f) {
      var w = 0.0, q = 0.0;
      for (final p in pours) {
        final v = f(p);
        if (v != null) { w += v * p.qtyLitres; q += p.qtyLitres; }
      }
      return q == 0 ? 0 : w / q;
    }
    final msg = l.collectSummaryMessage(
      widget.node.name, prettyDate(_date), _shiftLabel,
      litres(qty, unit: true), farmers,
      wsum((p) => p.fat).toStringAsFixed(1), wsum((p) => p.snf).toStringAsFixed(1),
    );
    final uri = Uri.parse('https://wa.me/?text=${Uri.encodeComponent(msg)}');
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && mounted) {
      showDhenuToast(context, AppLocalizations.of(context).helpCouldNotOpen,
          type: DhenuToastType.error);
    }
  }

  /// "Close collection" once the operator is done — freezes the slot and unlocks
  /// dispatch. Disabled while unsynced pours for the slot are still queued.
  Widget _closeButton(DhenuTokens t) {
    final l = AppLocalizations.of(context);
    final label = widget.node.isPooledDispatch ? l.collectCloseDay : l.collectCloseShift(_shiftLabel);
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
    // Queue-saved (incl. failed) entries for this slot — shown even when
    // nothing has synced yet, so an offline save is never invisible.
    final pending = PourQueue.instance
        .pendingFor(widget.node.id)
        .where((p) => p.collectionDate == _date && p.shift == _shift.name)
        .toList();
    if (pours.isEmpty && pending.isEmpty) return const SizedBox.shrink();
    final farmers = ref.watch(nodeFarmersProvider(widget.node.id)).asData?.value ?? const <MpFarmer>[];
    final byId = {for (final f in farmers) f.id: f};
    final bands = ref.watch(qualityBandsProvider(widget.node.id)).asData?.value;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(isToday ? l.collectTodaysEntries(pours.length + pending.length) : l.collectEntries(pours.length + pending.length),
          style: DhenuText.title.copyWith(color: t.ink)),
      const SizedBox(height: DhenuSpacing.sm),
      PendingPoursStrip(pending: pending, farmersById: byId),
      if (pours.isNotEmpty)
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

  /// Outstanding advance/feed-loan for the picked farmer (audit E4) — the
  /// paper ledger operators keep in their head, surfaced at entry time.
  /// Best-effort: silent while loading/offline, hidden when nothing is owed.
  List<Widget> _advanceChip(DhenuTokens t, AppLocalizations l) {
    final farmer = _farmer;
    if (farmer == null) return const [];
    final balance = ref.watch(farmerLedgerProvider(farmer.id)).asData?.value.balance ?? 0;
    if (balance <= 0.5) return const [];
    return [
      const SizedBox(height: DhenuSpacing.sm),
      Row(children: [
        Icon(DhenuIcons.payments, size: 14, color: t.gradeB),
        const SizedBox(width: DhenuSpacing.xs),
        Text(
          l.collectAdvanceChip(rupees(balance)),
          style: DhenuText.caption.copyWith(color: t.gradeB, fontWeight: FontWeight.w600),
        ),
      ]),
    ];
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
        // Tighter horizontal padding than the themed default (lg) — the 3-up
        // FAT/SNF/Litres row is narrow on small phones and the centred 22px
        // value clips against the suffix. Vertical kept at the theme value.
        decoration: InputDecoration(
          labelText: label,
          suffixText: suffix,
          contentPadding: const EdgeInsets.symmetric(
              horizontal: DhenuSpacing.sm, vertical: DhenuSpacing.md + 2),
        ),
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
    final line = _totalQty * r.ratePerLitre;
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
          _lowQualityChip(lowLabels, t, l),
        ],
        if (_totalQty > 0) ...[
          const SizedBox(height: DhenuSpacing.sm),
          Row(children: [
            Text('${litres(_totalQty)} × ${rupees(r.ratePerLitre, paise: true)}',
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

  Widget _lowQualityChip(List<String> labels, DhenuTokens t, AppLocalizations l) => Container(
        padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.sm, vertical: DhenuSpacing.xs),
        decoration: BoxDecoration(
          color: t.gradeC.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(DhenuRadii.pill),
          border: Border.all(color: t.gradeC.withValues(alpha: 0.35)),
        ),
        child: Text(
          '⚠ ${labels.map((m) => '${l.collectLowWord} $m').join(' · ')}',
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
