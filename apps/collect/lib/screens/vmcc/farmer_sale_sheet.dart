import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../api/mp_repo.dart';
import '../../l10n/app_localizations.dart';
import '../../l10n/l10n_helpers.dart';
import '../../providers/mp_context_provider.dart';
import '../../providers/mp_payout_providers.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/date_stepper.dart';
import '../../widgets/dhenu_segmented.dart';
import '../../widgets/dhenu_toast.dart';
import '../../widgets/milk_type_toggle.dart';
import '../../widgets/primary_action.dart';
import 'product_picker.dart';
import '../../widgets/sheet_grabber.dart';

/// Bottom sheet: record goods sold TO a farmer — bulk milk a trader resells, or
/// a product (ghee, curd, paneer) off the counter.
///
/// Bulk milk also comes off what this centre can still dispatch; a product does
/// not. Either way the amount is recovered on the farmer's next cycle, before
/// any advance. Resolves true when a sale was saved.
///
/// Pass [existing] to correct a recorded sale instead of adding one — the same
/// form either way, so an operator fixing a typo isn't learning a second screen.
Future<bool?> showFarmerSaleSheet(
  BuildContext context,
  MpFarmer farmer, {
  MpFarmerSale? existing,
}) {
  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _FarmerSaleSheet(farmer: farmer, existing: existing),
  );
}

enum _SaleKind { rawMilk, product }

class _FarmerSaleSheet extends ConsumerStatefulWidget {
  const _FarmerSaleSheet({required this.farmer, this.existing});
  final MpFarmer farmer;
  final MpFarmerSale? existing;
  @override
  ConsumerState<_FarmerSaleSheet> createState() => _FarmerSaleSheetState();
}

class _FarmerSaleSheetState extends ConsumerState<_FarmerSaleSheet> {
  final _qty = TextEditingController();
  final _rate = TextEditingController();
  late _SaleKind _kind =
      (widget.existing?.isMilk ?? true) ? _SaleKind.rawMilk : _SaleKind.product;
  late MilkType _milkType =
      widget.existing?.milkType ?? widget.farmer.defaultMilkType;
  MpSellableItem? _item;
  /// Set when editing a product sale before the catalogue resolves, so the
  /// field shows what was sold rather than an empty picker.
  late String? _itemId = widget.existing?.itemId;
  late String? _itemLabel = widget.existing?.itemName;
  // Sales are often written up after the fact — the operator hands goods over
  // at the gate and reaches for the app later, sometimes days later.
  late String _date = widget.existing?.saleDate ?? todayIso();
  late Shift _shift = widget.existing?.shift == 'pm'
      ? Shift.pm
      : (widget.existing != null
          ? Shift.am
          : (currentShift() == 'am' ? Shift.am : Shift.pm));
  bool _saving = false;
  String? _error;

  bool get _isEdit => widget.existing != null;

  @override
  void initState() {
    super.initState();
    final e = widget.existing;
    if (e != null) {
      _qty.text = e.qty.toStringAsFixed(e.qty % 1 == 0 ? 0 : 2);
      _rate.text = e.ratePerUnit.toStringAsFixed(2);
    }
  }

  @override
  void dispose() {
    _qty.dispose();
    _rate.dispose();
    super.dispose();
  }

  bool get _isMilk => _kind == _SaleKind.rawMilk;
  String get _unit => _isMilk ? 'L' : (_item?.unit ?? widget.existing?.unit ?? '');
  double get _amount =>
      (double.tryParse(_qty.text) ?? 0) * (double.tryParse(_rate.text) ?? 0);

  /// Picking a product prefills its list price; the operator can still override
  /// it for a farmer who is quoted differently. A fresh pick replaces a price
  /// left over from the previous product rather than keeping a stale one.
  void _pickItem(MpSellableItem item) {
    setState(() {
      _item = item;
      _itemId = item.id;
      _itemLabel = (item.unit ?? '').isEmpty ? item.name : '${item.name} · ${item.unit}';
      if (item.defaultSellingPrice != null) {
        _rate.text = item.defaultSellingPrice!.toStringAsFixed(2);
      }
    });
  }

  Future<void> _save(MpNode node) async {
    final l = AppLocalizations.of(context);
    final qty = double.tryParse(_qty.text);
    final rate = double.tryParse(_rate.text);
    if (qty == null || qty <= 0 || rate == null || rate <= 0 ||
        (!_isMilk && _itemId == null)) {
      setState(() => _error = l.farmerSaleInvalidEntry);
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final body = {
        'saleDate': _date,
        'kind': _isMilk ? 'raw_milk' : 'product',
        // A shift scopes a bulk-milk slot; a pooled centre and every product
        // belong to no shift at all.
        if (_isMilk && node.dispatchMode == 'per_shift') 'shift': _shift.name,
        if (_isMilk) 'milkType': milkTypeToApi(_milkType) else 'itemId': _itemId,
        'qty': qty,
        'ratePerUnit': rate,
      };
      if (_isEdit) {
        await mpRepo.updateFarmerSale(widget.existing!.id, body);
      } else {
        await mpRepo.createFarmerSale({
          ...body, 'farmerId': widget.farmer.id, 'nodeId': node.id,
        });
      }
      ref.invalidate(farmerLedgerProvider(widget.farmer.id));
      if (!mounted) return;
      Navigator.of(context).pop(true);
      showDhenuToast(context, _isEdit ? l.farmerSaleUpdated : l.farmerSaleSaved);
    } catch (e) {
      if (mounted) {
        setState(() {
          _saving = false;
          _error = '$e';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final node = ref.watch(mpActiveNodeProvider);
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius:
              const BorderRadius.vertical(top: Radius.circular(DhenuRadii.sheet)),
        ),
        child: ListView(
          shrinkWrap: true,
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: const EdgeInsets.fromLTRB(
              DhenuSpacing.lg, 0, DhenuSpacing.lg, DhenuSpacing.x4),
          children: [
            const SheetGrabber(),
            Text(_isEdit ? l.farmerSaleEditTitle : l.farmerSaleTitle,
                style: DhenuText.h2.copyWith(color: t.ink)),
            const SizedBox(height: DhenuSpacing.xs),
            Text(
              '${farmerName(context, widget.farmer)} · ${widget.farmer.code}',
              style: DhenuText.caption.copyWith(color: t.inkSoft),
            ),
            const SizedBox(height: DhenuSpacing.lg),
            DhenuSegmented<_SaleKind>(
              current: _kind,
              options: [
                (_SaleKind.rawMilk, l.farmerSaleKindMilk, DhenuIcons.milk),
                (_SaleKind.product, l.farmerSaleKindProduct, DhenuIcons.package),
              ],
              onSelect: (v) => setState(() => _kind = v),
            ),
            const SizedBox(height: DhenuSpacing.md),
            DateStepper(
              date: _date,
              todayLabel: l.commonToday,
              onChanged: (d) => setState(() => _date = d),
            ),
            const SizedBox(height: DhenuSpacing.md),
            if (_isMilk) ...[
              MilkTypeToggle(
                types: node?.allowedMilkTypes ?? MilkType.values,
                value: _milkType,
                onChanged: (v) => setState(() => _milkType = v),
              ),
              if (node?.dispatchMode == 'per_shift') ...[
                const SizedBox(height: DhenuSpacing.md),
                DhenuSegmented<Shift>(
                  current: _shift,
                  options: [
                    (Shift.am, l.shiftAm, DhenuIcons.sun),
                    (Shift.pm, l.shiftPm, DhenuIcons.moon),
                  ],
                  onSelect: (v) => setState(() => _shift = v),
                ),
              ],
            ] else
              _productField(t, l),
            const SizedBox(height: DhenuSpacing.md),
            Row(children: [
              Expanded(child: _numberField(_qty, l.farmerSaleQtyHint,
                  _unit.isEmpty ? '' : '$_unit ')),
              const SizedBox(width: DhenuSpacing.sm),
              Expanded(child: _numberField(_rate, l.farmerSaleRateHint, '₹ ')),
            ]),
            const SizedBox(height: DhenuSpacing.md),
            Text(
              l.farmerSaleAmountNote(rupees(_amount)),
              style: DhenuText.caption.copyWith(color: t.inkSoft),
            ),
            if (_error != null) ...[
              const SizedBox(height: DhenuSpacing.sm),
              Text(_error!, style: DhenuText.caption.copyWith(color: t.gradeC)),
            ],
            const SizedBox(height: DhenuSpacing.lg),
            PrimaryAction(
              label: _isEdit ? l.commonSave : l.farmerSaleRecord,
              icon: DhenuIcons.check,
              onPressed: node == null ? null : () => _save(node),
              loading: _saving,
            ),
          ],
        ),
      ),
    );
  }

  /// Tap-to-search rather than a visible list: a dairy's catalogue runs to
  /// dozens of SKUs whose names repeat across pack sizes, so chips were both
  /// unscrollably long and ambiguous. Shows the pack under the name once picked.
  Widget _productField(DhenuTokens t, AppLocalizations l) {
    final label = _item != null
        ? ((_item!.unit ?? '').isEmpty
            ? _item!.name
            : '${_item!.name} · ${_item!.unit}')
        : _itemLabel;
    return InkWell(
      onTap: () async {
        final picked = await showProductPicker(context);
        if (picked != null) _pickItem(picked);
      },
      borderRadius: BorderRadius.circular(DhenuRadii.input),
      child: Container(
        height: DhenuSpacing.minTap,
        padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.md),
        decoration: BoxDecoration(
          color: t.inputFill,
          borderRadius: BorderRadius.circular(DhenuRadii.input),
          border: Border.all(color: label == null ? t.hairline : t.brand),
        ),
        child: Row(children: [
          Icon(DhenuIcons.package, size: 18, color: t.inkSoft),
          const SizedBox(width: DhenuSpacing.sm),
          Expanded(
            child: label == null
                ? Text(l.farmerSaleProductHint,
                    style: DhenuText.body.copyWith(color: t.inkSoft))
                : Text(label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: DhenuText.body.copyWith(color: t.ink)),
          ),
          Icon(DhenuIcons.chevronRight, size: 18, color: t.inkSoft),
        ]),
      ),
    );
  }

  Widget _numberField(
          TextEditingController c, String hint, String prefix) =>
      TextField(
        controller: c,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        textCapitalization: TextCapitalization.none,
        onChanged: (_) => setState(() {}),
        inputFormatters: [
          FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d*')),
        ],
        decoration: InputDecoration(hintText: hint, prefixText: prefix),
      );
}
