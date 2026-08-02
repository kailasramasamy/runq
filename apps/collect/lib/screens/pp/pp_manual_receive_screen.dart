import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../api/mp_repo.dart';
import '../../l10n/app_localizations.dart';
import '../../l10n/l10n_helpers.dart';
import '../../providers/transfer_providers.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../utils/friendly_error.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/milk_reading.dart';
import '../../widgets/milk_type_toggle.dart';
import '../../widgets/primary_action.dart';
import '../../widgets/shift_toggle.dart';

/// PP manual receive — milk arrived at the plant without a dispatch record,
/// because the CC hasn't entered its VMCC collections yet. The plant records it
/// anyway so manufacturing can plan against real stock; the CC's own entry
/// catches up later (the Receive tab flags the overlap).
///
/// Entry is per milk type: the plant's raw-milk stock is tracked per type, and
/// with no CC data behind the load there is nothing to derive the type from —
/// so the operator states it. Types left blank are simply not received.
class PpManualReceiveScreen extends ConsumerStatefulWidget {
  const PpManualReceiveScreen({super.key, required this.ppNodeId});
  final String ppNodeId;

  @override
  ConsumerState<PpManualReceiveScreen> createState() => _PpManualReceiveScreenState();
}

class _PpManualReceiveScreenState extends ConsumerState<PpManualReceiveScreen> {
  DateTime _date = DateTime.now();
  Shift _shift = DateTime.now().hour < 12 ? Shift.am : Shift.pm;
  MpNode? _cc;
  MilkType? _type;
  final _rows = <MilkType, MilkReading>{};
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    for (final r in _rows.values) {
      r.dispose();
    }
    super.dispose();
  }

  /// The types this CC can send. A centre with no explicit list can send any,
  /// so fall back to the full set rather than showing an empty form.
  List<MilkType> get _types {
    final allowed = _cc?.allowedMilkTypes;
    if (allowed == null || allowed.isEmpty) {
      return const [MilkType.cowA1, MilkType.cowA2, MilkType.buffalo];
    }
    return allowed;
  }

  MilkReading _rowFor(MilkType m) => _rows.putIfAbsent(m, () {
        final row = MilkReading();
        row.addListener(() => setState(() {}));
        return row;
      });

  /// Types ready to post — a type is received only once all four readings are
  /// in, so a half-filled form never becomes a receipt.
  List<MilkType> get _filled => _types.where((m) => _rowFor(m).complete).toList();

  // Backfill only — a plant records what already arrived, never a future load.
  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime.now().subtract(const Duration(days: 365)),
      lastDate: DateTime.now(),
    );
    if (picked != null) setState(() => _date = picked);
  }

  /// One consignment per type — the plant's stock, and the manufacturing that
  /// draws on it, are per type. A partial failure leaves the types that already
  /// saved in place and names the one that stopped, so a retry doesn't
  /// double-post what went through.
  Future<void> _save() async {
    final cc = _cc;
    final types = _filled;
    if (cc == null || types.isEmpty) return;
    setState(() { _saving = true; _error = null; });
    var saved = 0;
    try {
      for (final m in types) {
        final row = _rowFor(m);
        await mpRepo.directReceive({
          'fromNodeId': cc.id,
          'toNodeId': widget.ppNodeId,
          'collectionDate': isoDate(_date),
          if (!cc.isPooledDispatch) 'shift': _shift.name,
          'milkType': milkTypeToApi(m),
          'qty': row.qty,
          'fat': row.fat,
          'snf': row.snf,
          'water': row.water,
        });
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

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final ccs = ref.watch(nodesByTypeProvider('cc')).value ?? const <MpNode>[];
    final filled = _filled;
    // Switching CC can change which types are on offer, so never hold a
    // selection the chosen centre can't send.
    final type = _types.contains(_type) ? _type! : _types.first;
    return Scaffold(
      backgroundColor: t.surface,
      appBar: AppBar(title: Text(l.ppManualReceiveTitle)),
      body: SafeArea(
        child: Column(children: [
          Expanded(
            child: ListView(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: const EdgeInsets.all(DhenuSpacing.screen),
              children: [
                _banner(t, l),
                const SizedBox(height: DhenuSpacing.lg),
                DhenuCard(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(l.ppManualReceiveArrivedFrom,
                        style: DhenuText.label.copyWith(color: t.brand)),
                    const SizedBox(height: DhenuSpacing.md),
                    _dateField(t, l),
                    const SizedBox(height: DhenuSpacing.md),
                    _ccField(t, l, ccs),
                    // A CC with a BMC pools the whole day, exactly as its
                    // dispatches do; only a no-BMC centre sends per shift.
                    if (_cc != null && !_cc!.isPooledDispatch) ...[
                      const SizedBox(height: DhenuSpacing.md),
                      Row(children: [
                        Text(l.ccManualReceiveShiftLabel,
                            style: DhenuText.label.copyWith(color: t.inkSoft)),
                        const Spacer(),
                        ShiftToggle(value: _shift, onChanged: (s) => setState(() => _shift = s)),
                      ]),
                    ],
                  ]),
                ),
                if (_cc != null) ...[
                  const SizedBox(height: DhenuSpacing.lg),
                  Text(l.ppManualReceivePerTypeLabel,
                      style: DhenuText.label.copyWith(color: t.inkSoft)),
                  const SizedBox(height: DhenuSpacing.sm),
                  if (_types.length > 1) ...[
                    MilkTypeToggle(
                      types: _types,
                      value: type,
                      onChanged: (m) => setState(() => _type = m),
                    ),
                    const SizedBox(height: DhenuSpacing.md),
                  ],
                  _typeCard(t, l, type),
                  // What else this Save carries, so a type entered under the
                  // pill isn't invisible from the one on screen.
                  if (filled.length > 1) ...[
                    const SizedBox(height: DhenuSpacing.sm),
                    Text(
                      filled
                          .map((m) =>
                              '${milkTypeL10n(l, m)} ${litres(_rowFor(m).qty!, unit: true)}')
                          .join(' · '),
                      style: DhenuText.caption.copyWith(color: t.inkSoft),
                    ),
                  ],
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
            child: _action(l, type, filled),
          ),
        ]),
      ),
    );
  }

  /// Guided entry: the button walks the operator to the next blank field and
  /// only turns into Save once the type on screen is fully measured. Types
  /// already completed under the pill still ride along in the count.
  Widget _action(AppLocalizations l, MilkType type, List<MilkType> filled) {
    final row = _rowFor(type);
    if (_cc == null) {
      return PrimaryAction(
        label: l.ppManualReceiveSaveEmpty, icon: DhenuIcons.check, onPressed: null);
    }
    // An untouched type is not "being entered" — tapping the pill just to look,
    // with another type already measured, must not strand the operator on Next.
    if (!row.complete && !(row.isEmpty && filled.isNotEmpty)) {
      return PrimaryAction(
        label: l.commonNext,
        icon: DhenuIcons.chevronRight,
        onPressed: _saving ? null : row.focusFirstMissing,
        loading: _saving,
      );
    }
    return PrimaryAction(
      label: l.manualReceiveSaveCount(filled.length),
      icon: DhenuIcons.check,
      onPressed: _saving ? null : _save,
      loading: _saving,
    );
  }

  Widget _banner(DhenuTokens t, AppLocalizations l) => Container(
        padding: const EdgeInsets.all(DhenuSpacing.md),
        decoration: BoxDecoration(
          color: t.brand.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(DhenuRadii.input),
        ),
        child: Row(children: [
          Icon(DhenuIcons.info, size: 18, color: t.brand),
          const SizedBox(width: DhenuSpacing.sm),
          Expanded(
            child: Text(l.ppManualReceiveInfoBanner,
                style: DhenuText.caption.copyWith(color: t.inkSoft)),
          ),
        ]),
      );

  Widget _dateField(DhenuTokens t, AppLocalizations l) => InkWell(
        onTap: _pickDate,
        borderRadius: BorderRadius.circular(DhenuRadii.input),
        child: InputDecorator(
          decoration: InputDecoration(labelText: l.ccManualReceiveCollectionDate),
          child: Row(children: [
            Expanded(
                child: Text(prettyDate(isoDate(_date)),
                    style: DhenuText.body.copyWith(color: t.ink))),
            Icon(DhenuIcons.calendar, size: 18, color: t.inkSoft),
          ]),
        ),
      );

  Widget _ccField(DhenuTokens t, AppLocalizations l, List<MpNode> ccs) =>
      DropdownButtonFormField<String>(
        initialValue: _cc?.id,
        isExpanded: true,
        decoration: InputDecoration(labelText: l.ppManualReceiveSourceCc),
        items: [
          for (final c in ccs)
            DropdownMenuItem(
              value: c.id,
              child: Text(c.name, overflow: TextOverflow.ellipsis),
            ),
        ],
        onChanged: (id) => setState(() {
          _cc = ccs.where((c) => c.id == id).firstOrNull;
        }),
      );

  Widget _typeCard(DhenuTokens t, AppLocalizations l, MilkType m) {
    final row = _rowFor(m);
    return DhenuCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          // The pill above already names the type; with only one on offer there
          // is no pill, so the card carries the name instead.
          Text(_types.length > 1 ? l.ppReceiveMeasuredAtPlant : milkTypeL10n(l, m),
              style: DhenuText.label.copyWith(color: t.brand)),
          const Spacer(),
          if (row.complete)
            Icon(DhenuIcons.checkCircle, size: 16, color: t.gradeA)
          else
            Text(l.ppManualReceiveNotReceived,
                style: DhenuText.caption.copyWith(color: t.inkSoft)),
        ]),
        const SizedBox(height: DhenuSpacing.md),
        Row(children: [
          Expanded(child: MilkReadingField(
              controller: row.qty$, label: l.ccManualReceiveQtyHint,
              focusNode: row.qtyFocus, next: row.fatFocus)),
          const SizedBox(width: DhenuSpacing.md),
          Expanded(child: MilkReadingField(
              controller: row.fat$, label: 'FAT %',
              focusNode: row.fatFocus, next: row.snfFocus)),
        ]),
        const SizedBox(height: DhenuSpacing.md),
        Row(children: [
          Expanded(child: MilkReadingField(
              controller: row.snf$, label: 'SNF %',
              focusNode: row.snfFocus, next: row.waterFocus)),
          const SizedBox(width: DhenuSpacing.md),
          Expanded(child: MilkReadingField(
              controller: row.water$, label: 'Water %', focusNode: row.waterFocus)),
        ]),
      ]),
    );
  }
}
