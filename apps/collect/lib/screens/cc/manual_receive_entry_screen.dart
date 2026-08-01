import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../api/mp_repo.dart';
import '../../l10n/app_localizations.dart';
import '../../l10n/l10n_helpers.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../utils/friendly_error.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/milk_reading.dart';
import '../../widgets/milk_type_toggle.dart';
import '../../widgets/primary_action.dart';

/// Records the actual qty/FAT/SNF/Water measured at the CC for one VMCC's milk
/// that arrived without a dispatch entry. Date + shift come fixed from the hub.
///
/// A VMCC can send cow and buffalo in the same shift, and each type is priced by
/// its own chart and moves onward as its own consignment — so the type is stated
/// here rather than derived, and readings are held per type. Switching type
/// keeps what was already typed; Save posts every type that has a quantity.
class ManualReceiveEntryScreen extends ConsumerStatefulWidget {
  const ManualReceiveEntryScreen({
    super.key,
    required this.vmcc,
    required this.ccNodeId,
    required this.date,
    required this.shift,
    this.existing = const [],
  });
  final MpNode vmcc;
  final String ccNodeId;
  final DateTime date;
  final Shift shift;

  /// Receipts already in for this VMCC + date + shift, at most one per milk
  /// type. A type with one is edited rather than entered twice.
  final List<MpConsignment> existing;

  @override
  ConsumerState<ManualReceiveEntryScreen> createState() => _ManualReceiveEntryScreenState();
}

class _ManualReceiveEntryScreenState extends ConsumerState<ManualReceiveEntryScreen> {
  final _rows = <MilkType, MilkReading>{};
  late MilkType _type;
  bool _saving = false;
  String? _error;

  /// Types this VMCC can send. A centre with no explicit list can send any.
  List<MilkType> get _types {
    final allowed = widget.vmcc.allowedMilkTypes;
    if (allowed == null || allowed.isEmpty) {
      return const [MilkType.cowA1, MilkType.cowA2, MilkType.buffalo];
    }
    return allowed;
  }

  @override
  void initState() {
    super.initState();
    // Land on the type already received (so a tap from the hub opens what the
    // operator meant to correct), else the centre's usual type.
    final done = widget.existing.map((c) => c.milkType).whereType<MilkType>().toList();
    final preferred = done.isNotEmpty ? done.first : widget.vmcc.effectiveMilkType;
    _type = _types.contains(preferred) ? preferred : _types.first;
    for (final c in widget.existing) {
      final m = c.milkType;
      if (m != null) _rowFor(m).prefill(c);
    }
  }

  @override
  void dispose() {
    for (final r in _rows.values) {
      r.dispose();
    }
    super.dispose();
  }

  MilkReading _rowFor(MilkType m) => _rows.putIfAbsent(m, () {
        final r = MilkReading();
        r.addListener(() => setState(() {}));
        return r;
      });

  MilkReading get _row => _rowFor(_type);

  /// The receipt already in for [m], if any — decides edit vs create on save.
  MpConsignment? _existingFor(MilkType m) =>
      widget.existing.where((c) => c.milkType == m).lastOrNull;

  List<MilkType> get _filled => _types.where((m) => _rowFor(m).complete).toList();

  /// "Next" handler — jump focus to the first field still missing on the type
  /// being entered, so the operator is guided rather than hunting for blanks.
  void _focusNext() => _row.focusFirstMissing();

  Future<void> _save() async {
    final types = _filled;
    if (types.isEmpty) {
      setState(() => _error = AppLocalizations.of(context).ccManualReceiveErrorMissingFields);
      return;
    }
    setState(() { _saving = true; _error = null; });
    var saved = 0;
    try {
      for (final m in types) {
        final row = _rowFor(m);
        final existing = _existingFor(m);
        if (existing != null) {
          await mpRepo.editReceipt(existing.id, {
            'receiptQty': row.qty, 'receiptFat': row.fat,
            'receiptSnf': row.snf, 'receiptWater': row.water,
          });
        } else {
          await mpRepo.directReceive({
            'fromNodeId': widget.vmcc.id,
            'toNodeId': widget.ccNodeId,
            'collectionDate': isoDate(widget.date),
            'shift': widget.shift.name,
            'milkType': milkTypeToApi(m),
            'qty': row.qty, 'fat': row.fat, 'snf': row.snf, 'water': row.water,
          });
        }
        saved++;
      }
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      final l = AppLocalizations.of(context);
      setState(() {
        _saving = false;
        _error = saved == 0
            ? friendlyError(context, e)
            : l.manualReceivePartialError(saved, friendlyError(context, e));
      });
    }
  }

  /// Delete the manual receipt for the selected type (server rejects unless it's
  /// a direct receive that isn't yet locked for dispatch).
  Future<void> _delete() async {
    final l = AppLocalizations.of(context);
    final existing = _existingFor(_type);
    if (existing == null) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (dctx) => AlertDialog(
        title: Text(l.ccReceiveDeleteConfirmTitle),
        content: Text(l.ccManualReceiveDeleteConfirmBody(widget.vmcc.name,
            prettyDate(isoDate(widget.date)), widget.shift == Shift.am ? l.shiftAm : l.shiftPm)),
        actions: [
          TextButton(onPressed: () => Navigator.of(dctx).pop(false), child: Text(l.commonCancel)),
          TextButton(onPressed: () => Navigator.of(dctx).pop(true), child: Text(l.syncDelete)),
        ],
      ),
    );
    if (ok != true) return;
    setState(() { _saving = true; _error = null; });
    try {
      await mpRepo.deleteReceipt(existing.id);
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      setState(() { _saving = false; _error = friendlyError(context, e); });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final isAm = widget.shift == Shift.am;
    final filled = _filled;
    final editingType = _existingFor(_type) != null;
    return Scaffold(
      backgroundColor: t.surface,
      appBar: AppBar(title: Text(widget.vmcc.name)),
      body: SafeArea(
        child: Column(children: [
          Expanded(
            child: ListView(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: const EdgeInsets.all(DhenuSpacing.screen),
              children: [
                if (_types.length > 1) ...[
                  MilkTypeToggle(
                    types: _types,
                    value: _type,
                    onChanged: (m) => setState(() => _type = m),
                  ),
                  const SizedBox(height: DhenuSpacing.md),
                ],
                DhenuCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Text(l.ccMeasuredAtCc, style: DhenuText.label.copyWith(color: t.brand)),
                    const Spacer(),
                    Text('${prettyDate(isoDate(widget.date))} · ',
                        style: DhenuText.caption.copyWith(color: t.inkSoft)),
                    Icon(isAm ? DhenuIcons.sun : DhenuIcons.moon, size: 12, color: t.inkSoft),
                    const SizedBox(width: 4),
                    Text(isAm ? l.shiftAm : l.shiftPm,
                        style: DhenuText.caption.copyWith(color: t.inkSoft)),
                  ]),
                  const SizedBox(height: DhenuSpacing.md),
                  // Qty / FAT / SNF on one line, Water at the same field width on
                  // the next — consistent with the VMCC record-collection layout.
                  Row(children: [
                    Expanded(child: MilkReadingField(
                        controller: _row.qty$, label: l.ccManualReceiveQtyHint,
                        focusNode: _row.qtyFocus, next: _row.fatFocus,
                        autofocus: !editingType)),
                    const SizedBox(width: DhenuSpacing.md),
                    Expanded(child: MilkReadingField(
                        controller: _row.fat$, label: 'FAT %',
                        focusNode: _row.fatFocus, next: _row.snfFocus)),
                    const SizedBox(width: DhenuSpacing.md),
                    Expanded(child: MilkReadingField(
                        controller: _row.snf$, label: 'SNF %',
                        focusNode: _row.snfFocus, next: _row.waterFocus)),
                  ]),
                  const SizedBox(height: DhenuSpacing.md),
                  Row(children: [
                    Expanded(child: MilkReadingField(
                        controller: _row.water$, label: 'Water %', focusNode: _row.waterFocus)),
                    const SizedBox(width: DhenuSpacing.md),
                    const Expanded(child: SizedBox.shrink()),
                    const SizedBox(width: DhenuSpacing.md),
                    const Expanded(child: SizedBox.shrink()),
                  ]),
                ])),
                // What else is going in on this Save, so a second type entered
                // under the toggle isn't invisible from the type on screen.
                if (filled.length > 1) ...[
                  const SizedBox(height: DhenuSpacing.sm),
                  Text(
                    filled.map((m) =>
                        '${milkTypeL10n(l, m)} ${litres(_rowFor(m).qty!, unit: true)}').join(' · '),
                    style: DhenuText.caption.copyWith(color: t.inkSoft),
                  ),
                ],
                if (_error != null) ...[
                  const SizedBox(height: DhenuSpacing.sm),
                  Text(_error!, style: DhenuText.caption.copyWith(color: t.gradeC)),
                ],
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(DhenuSpacing.screen),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              PrimaryAction(
                label: _label(l, filled, editingType),
                icon: _guiding ? DhenuIcons.chevronRight : DhenuIcons.check,
                onPressed: _guiding ? _focusNext : _save,
                loading: _saving,
              ),
              if (_existingFor(_type)?.directReceive ?? false) ...[
                const SizedBox(height: DhenuSpacing.sm),
                TextButton.icon(
                  onPressed: _saving ? null : _delete,
                  icon: Icon(DhenuIcons.trash, size: 18, color: t.gradeC),
                  label: Text(l.ccReceiveDeleteReceipt,
                      style: DhenuText.label.copyWith(color: t.gradeC)),
                ),
              ],
            ]),
          ),
        ]),
      ),
    );
  }

  /// Guide to the next blank field while the type on screen is being entered.
  /// An untouched type is not "being entered" — switching to it just to look,
  /// with another type already measured, must not strand the operator on Next.
  bool get _guiding => !_row.complete && !(_row.isEmpty && _filled.isNotEmpty);

  /// Save appears only once the type on screen is fully measured; until then the
  /// button walks the operator to the next blank field.
  String _label(AppLocalizations l, List<MilkType> filled, bool editingType) {
    if (_guiding) return l.commonNext;
    if (filled.length > 1) return l.manualReceiveSaveCount(filled.length);
    return editingType ? l.ccManualReceiveSaveChanges : l.ccManualReceiveMarkReceived;
  }
}

