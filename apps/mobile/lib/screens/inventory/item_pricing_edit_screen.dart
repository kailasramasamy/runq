// Edit an item's pricing — the mobile counterpart of the web Cost & Profit
// Analysis page, which is where the web routes pricing edits once an item
// exists (the item form disables the whole chain after create).
//
// Two rules carried over from the web, because breaking either lets the
// stored numbers drift out of agreement with each other:
//   1. Cost price is NOT typed directly — it is the sum of the cost
//      build-up, so `costPrice` and `cogmBreakdown` can never disagree.
//   2. Basic price, GST amount and the landing price are derived, never
//      entered. The user edits MRP, seller margin and GST rate; the rest
//      is solved by the same math the web uses.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/inventory_models.dart';
import '../../api/inventory_repo.dart';
import '../../providers/inventory_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../utils/item_pricing.dart';
import '../../widgets/runq_snack.dart';
import 'widgets/inv_form_fields.dart';
import 'widgets/inv_primitives.dart';
import 'widgets/item_pricing_edit_widgets.dart';

class ItemPricingEditScreen extends ConsumerWidget {
  const ItemPricingEditScreen({super.key, required this.itemId});
  final String itemId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final itemAsync = ref.watch(invItemDetailProvider(itemId));
    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: InvPlainAppBar(title: 'Edit Pricing', onBack: () => context.pop()),
      body: itemAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              'Failed to load: $e',
              style: RunqText.caption.copyWith(color: t.muted),
              textAlign: TextAlign.center,
            ),
          ),
        ),
        data: (item) => _Form(item: item),
      ),
    );
  }
}

class _Form extends ConsumerStatefulWidget {
  const _Form({required this.item});
  final InvItemDetail item;
  @override
  ConsumerState<_Form> createState() => _FormState();
}

class _FormState extends ConsumerState<_Form> {
  late final TextEditingController _mrp;
  late final TextEditingController _margin;
  late final TextEditingController _gstRate;
  late final TextEditingController _selling;
  late final TextEditingController _purchase;
  late final List<CogmRowState> _rows;
  bool _saving = false;

  InvItemDetail get _item => widget.item;
  bool get _isService => _item.type == 'service';

  @override
  void initState() {
    super.initState();
    String s(double? v) => v == null ? '' : trimNum(v);
    _mrp = TextEditingController(text: s(_item.mrp));
    _margin = TextEditingController(text: s(_item.margin));
    _gstRate = TextEditingController(text: s(_item.gstRate));
    _selling = TextEditingController(text: s(_item.defaultSellingPrice));
    _purchase = TextEditingController(text: s(_item.defaultPurchasePrice));
    // Seed the build-up so an item that only ever had a flat cost price can
    // be edited with one number instead of forcing the user to invent a
    // breakdown before they can change anything.
    _rows = _item.cogmBreakdown.isNotEmpty
        ? _item.cogmBreakdown
            .map((c) => CogmRowState(label: c.label, amount: c.amount, note: c.note))
            .toList()
        : [CogmRowState(label: 'Cost', amount: _item.costPrice ?? 0)];
    for (final c in [_mrp, _margin, _gstRate, _selling, _purchase]) {
      c.addListener(_recalc);
    }
    for (final r in _rows) {
      r.attach(_recalc);
    }
  }

  @override
  void dispose() {
    for (final c in [_mrp, _margin, _gstRate, _selling, _purchase]) {
      c.dispose();
    }
    for (final r in _rows) {
      r.dispose();
    }
    super.dispose();
  }

  void _recalc() => setState(() {});

  double _n(TextEditingController c) => double.tryParse(c.text.trim()) ?? 0;
  double get _cost => _rows.fold<double>(0, (a, r) => a + r.amount);

  void _addRow() {
    setState(() {
      final row = CogmRowState(label: '', amount: 0)..attach(_recalc);
      _rows.add(row);
    });
  }

  void _removeRow(int i) {
    setState(() {
      _rows.removeAt(i).dispose();
    });
  }

  Future<void> _save() async {
    final gst = _n(_gstRate);
    if (gst > 100) {
      showRunqSnack(context, 'GST rate cannot exceed 100%', kind: SnackKind.error);
      return;
    }
    if (!_isService && _n(_margin) >= 100) {
      showRunqSnack(context, 'Seller margin must be below 100%', kind: SnackKind.error);
      return;
    }
    // Drop half-filled rows the same way the web does before persisting.
    final clean = _rows
        .where((r) => r.labelText.isNotEmpty && r.amount > 0)
        .map((r) => {
              'label': r.labelText,
              'amount': r.amount,
              if (r.noteText.isNotEmpty) 'note': r.noteText,
            })
        .toList();
    final cost = clean.fold<double>(0, (a, r) => a + (r['amount']! as double));

    final body = <String, dynamic>{
      'costPrice': cost > 0 ? cost : null,
      'gstRate': _gstRate.text.trim().isEmpty ? null : gst,
      'cogmBreakdown': clean.isEmpty ? null : clean,
      'defaultPurchasePrice':
          _purchase.text.trim().isEmpty ? null : _n(_purchase),
    };
    if (_isService) {
      final r = calcServicePricing(
        sellingPrice: _n(_selling),
        gstRatePct: gst,
        cost: cost,
      );
      body.addAll({
        'defaultSellingPrice': _selling.text.trim().isEmpty ? null : _n(_selling),
        'basicPrice': r.basicPrice > 0 ? r.basicPrice : null,
        'gstValue': r.gstValue > 0 ? r.gstValue : null,
        // Flipped-from-product leftovers would keep showing on the detail
        // page, so clear them explicitly.
        'mrp': null,
        'margin': null,
      });
    } else {
      final r = calcProductPricing(
        mrp: _n(_mrp),
        sellerMarginPct: _n(_margin),
        gstRatePct: gst,
        cost: cost,
      );
      body.addAll({
        'mrp': _mrp.text.trim().isEmpty ? null : _n(_mrp),
        'margin': _margin.text.trim().isEmpty ? null : _n(_margin),
        'basicPrice': r.basicPrice > 0 ? r.basicPrice : null,
        'gstValue': r.gstValue > 0 ? r.gstValue : null,
        'defaultSellingPrice': r.landingPrice > 0 ? r.landingPrice : null,
      });
    }

    setState(() => _saving = true);
    try {
      await inventoryRepo.updateItem(_item.id, body);
      ref.invalidate(invItemDetailProvider(_item.id));
      if (!mounted) return;
      showRunqSnack(context, 'Pricing updated', kind: SnackKind.success);
      context.pop(true);
    } catch (e) {
      if (!mounted) return;
      showRunqSnack(context, 'Could not save pricing: $e', kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final gst = _n(_gstRate);
    final preview = _isService
        ? calcServicePricing(sellingPrice: _n(_selling), gstRatePct: gst, cost: _cost)
        : null;
    final productPreview = _isService
        ? null
        : calcProductPricing(
            mrp: _n(_mrp),
            sellerMarginPct: _n(_margin),
            gstRatePct: gst,
            cost: _cost,
          );

    return Column(
      children: [
        Expanded(
          child: ListView(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            children: [
              CogmEditor(
                rows: _rows,
                total: _cost,
                onAdd: _addRow,
                onRemove: _removeRow,
              ),
              const SizedBox(height: 8),
              InvFormSection(
                title: _isService ? 'Service Price' : 'Selling',
                children: [
                  if (_isService)
                    InvNumField(label: 'Selling price (incl GST)', controller: _selling)
                  else ...[
                    InvNumField(label: 'MRP (consumer)', controller: _mrp),
                    InvNumField(label: 'Seller margin (% off MRP)', controller: _margin),
                  ],
                  InvNumField(label: 'GST rate (%)', controller: _gstRate),
                ],
              ),
              InvFormSection(
                title: 'Buying',
                children: [
                  InvNumField(label: 'Default purchase rate', controller: _purchase),
                ],
              ),
              PricingPreview(
                basicPrice: productPreview?.basicPrice ?? preview!.basicPrice,
                gstValue: productPreview?.gstValue ?? preview!.gstValue,
                landingPrice: productPreview?.landingPrice,
                landingLabel: _isService ? 'Selling price' : 'Landing price',
                sellingPrice: _isService ? _n(_selling) : null,
                profitPerUnit:
                    productPreview?.profitPerUnit ?? preview!.profitPerUnit,
                netMarginPct: productPreview?.netMarginPct ?? preview!.netMarginPct,
                unit: _item.unit,
              ),
            ],
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: InvPrimaryButton(
              label: 'Save Pricing',
              busy: _saving,
              onTap: _saving ? null : _save,
            ),
          ),
        ),
      ],
    );
  }
}
