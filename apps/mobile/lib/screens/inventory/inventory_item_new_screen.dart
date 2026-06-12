// New item — create a catalog item in the masters module. Mobile-focused
// subset of the web /inventory/items/new form: identity, class, tax +
// pricing, classification, and the batch/expiry/serial tracking flags
// (first-class for this module). POSTs to /masters/items and pops `true`
// so the Items list refreshes.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/inventory_models.dart';
import '../../api/inventory_repo.dart';
import '../../providers/inventory_providers.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart';
import 'widgets/inv_form_fields.dart';
import 'widgets/inv_primitives.dart';

const _itemClasses = <({String key, String label})>[
  (key: 'trading_good', label: 'Trading good'),
  (key: 'raw_material', label: 'Raw material'),
  (key: 'packaging', label: 'Packaging'),
  (key: 'finished_good', label: 'Finished good'),
  (key: 'semi_finished', label: 'Semi-finished'),
  (key: 'consumable', label: 'Consumable'),
  (key: 'spare_part', label: 'Spare part'),
];

const _typeOptions = <({String key, String label})>[
  (key: 'product', label: 'Product'),
  (key: 'service', label: 'Service'),
];

// Classes that default to batch + expiry tracking (perishable / produced
// goods). Mirrors the web's CLASS_TRACKING_DEFAULTS.
const _batchDefaultClasses = {'raw_material', 'finished_good', 'semi_finished'};

// Purchased "input" classes — bought, never sold. Their pricing focuses on
// the purchase rate; MRP / selling price don't apply.
const _inputClasses = {'raw_material', 'packaging', 'consumable', 'spare_part'};

class InventoryItemNewScreen extends ConsumerStatefulWidget {
  const InventoryItemNewScreen({super.key});
  @override
  ConsumerState<InventoryItemNewScreen> createState() => _State();
}

class _State extends ConsumerState<InventoryItemNewScreen> {
  final _name = TextEditingController();
  final _sku = TextEditingController();
  final _unit = TextEditingController();
  final _hsn = TextEditingController();
  final _gstRate = TextEditingController();
  final _mrp = TextEditingController();
  final _selling = TextEditingController();
  final _purchase = TextEditingController();
  final _cost = TextEditingController();
  final _category = TextEditingController();
  final _subcategory = TextEditingController();
  final _ean = TextEditingController();
  final _description = TextEditingController();
  final _batchTemplate = TextEditingController();

  String _type = 'product';
  String? _itemClass = 'trading_good';
  bool _trackInventory = true;
  bool _trackBatches = false;
  bool _trackExpiry = false;
  bool _trackSerials = false;
  bool _trackingTouched = false;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _name.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    for (final c in [
      _name, _sku, _unit, _hsn, _gstRate, _mrp, _selling, _purchase, _cost,
      _category, _subcategory, _ean, _description, _batchTemplate,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  bool get _isProduct => _type == 'product';
  bool get _isInput => _isProduct && _inputClasses.contains(_itemClass);
  bool get _canSubmit => !_submitting && _name.text.trim().isNotEmpty;

  void _setType(String type) {
    setState(() {
      _type = type;
      if (type == 'service') {
        _itemClass = null;
      } else {
        _itemClass ??= 'trading_good';
      }
    });
  }

  void _setClass(String? cls) {
    setState(() {
      _itemClass = cls;
      if (!_trackingTouched && cls != null) {
        final on = _batchDefaultClasses.contains(cls);
        _trackBatches = on;
        _trackExpiry = on;
      }
      // Purchased inputs aren't sold — drop any sell-side prices entered.
      if (_inputClasses.contains(cls)) {
        _mrp.clear();
        _selling.clear();
      }
    });
  }

  // Parse a numeric field. Returns null for empty; throws [_FieldError] when
  // the text isn't a valid non-negative number (or exceeds [max]).
  double? _num(String label, TextEditingController c, {double? max}) {
    final raw = c.text.trim();
    if (raw.isEmpty) return null;
    final v = double.tryParse(raw);
    if (v == null || v < 0) throw _FieldError('Enter a valid number for $label');
    if (max != null && v > max) throw _FieldError('$label cannot exceed $max');
    return v;
  }

  String? _trimmed(TextEditingController c) =>
      c.text.trim().isEmpty ? null : c.text.trim();

  Map<String, dynamic> _buildBody() {
    final name = _name.text.trim();
    if (name.isEmpty) throw _FieldError('Name is required');
    final body = <String, dynamic>{'name': name, 'type': _type};
    if (_trimmed(_sku) != null) body['sku'] = _trimmed(_sku);
    if (_isProduct && _itemClass != null) body['itemClass'] = _itemClass;
    if (_trimmed(_unit) != null) body['unit'] = _trimmed(_unit);
    if (_trimmed(_hsn) != null) body['hsnSacCode'] = _trimmed(_hsn);
    final gst = _num('GST rate', _gstRate, max: 100);
    if (gst != null) body['gstRate'] = gst;
    if (_isProduct) {
      final mrp = _num('MRP', _mrp);
      if (mrp != null) body['mrp'] = mrp;
      final pur = _num('Purchase price', _purchase);
      if (pur != null) body['defaultPurchasePrice'] = pur;
    }
    final sell = _num('Selling price', _selling);
    if (sell != null) body['defaultSellingPrice'] = sell;
    final cost = _num('Cost price', _cost);
    if (cost != null) body['costPrice'] = cost;
    if (_trimmed(_category) != null) body['category'] = _trimmed(_category);
    if (_trimmed(_subcategory) != null) body['subcategory'] = _trimmed(_subcategory);
    if (_trimmed(_ean) != null) body['ean'] = _trimmed(_ean);
    if (_trimmed(_description) != null) body['description'] = _trimmed(_description);
    if (_isProduct) {
      body['trackInventory'] = _trackInventory;
      body['trackBatches'] = _trackInventory && _trackBatches;
      body['trackExpiry'] = _trackInventory && _trackExpiry;
      body['trackSerials'] = _trackInventory && _trackSerials;
      if (_trackInventory && _trackBatches && _trimmed(_batchTemplate) != null) {
        body['batchCodeTemplate'] = _trimmed(_batchTemplate);
      }
    }
    return body;
  }

  Future<void> _submit() async {
    if (!_canSubmit) return;
    Map<String, dynamic> body;
    try {
      body = _buildBody();
    } on _FieldError catch (e) {
      showRunqSnack(context, e.message, kind: SnackKind.error);
      return;
    }
    setState(() => _submitting = true);
    try {
      final item = await inventoryRepo.createItem(body);
      if (!mounted) return;
      showRunqSnack(context, 'Item "${item.name}" created',
          kind: SnackKind.success);
      context.pop(true);
    } catch (e) {
      if (!mounted) return;
      showRunqSnack(context, 'Could not create item: $e',
          kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: InvPlainAppBar(title: 'New item', onBack: () => context.pop()),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
              children: [
                _basics(),
                const SizedBox(height: 16),
                _pricing(),
                const SizedBox(height: 16),
                _classification(),
                if (_isProduct) ...[
                  const SizedBox(height: 16),
                  _tracking(),
                ],
              ],
            ),
          ),
          _SubmitBar(busy: _submitting, enabled: _canSubmit, onSubmit: _submit),
        ],
      ),
    );
  }

  Widget _basics() {
    return InvFormSection(
      title: 'Basics',
      children: [
        InvFormField(
            label: 'Name', controller: _name, required: true,
            hint: 'e.g. Toned Milk 500ml',
            capitalization: TextCapitalization.sentences),
        InvFormField(label: 'SKU', controller: _sku, hint: 'Optional code'),
        const SizedBox(height: 14),
        const InvFieldLabel('Type'),
        const SizedBox(height: 6),
        InvSegmented(value: _type, options: _typeOptions, onChanged: _setType),
        if (_isProduct) ...[
          const SizedBox(height: 14),
          const InvFieldLabel('Item class'),
          const SizedBox(height: 6),
          InvDropdownField(
              value: _itemClass, options: _itemClasses, onChanged: _setClass),
        ],
        const SizedBox(height: 14),
        InvFormField(label: 'Unit', controller: _unit, hint: 'e.g. nos, kg, ltr'),
      ],
    );
  }

  Widget _pricing() {
    final children = <Widget>[
      InvFormField(label: 'HSN / SAC code', controller: _hsn, hint: 'Optional'),
      InvNumField(label: 'GST rate (%)', controller: _gstRate),
    ];
    if (!_isProduct) {
      // Service — what you charge per unit.
      children.add(InvNumField(label: 'Selling price / rate (₹)', controller: _selling));
      children.add(InvNumField(label: 'Cost price (₹)', controller: _cost));
    } else if (_isInput) {
      // Purchased input (raw material etc.) — bought, not sold. Focus on the
      // purchase rate; skip MRP / selling price.
      children.add(InvNumField(label: 'Purchase rate (₹)', controller: _purchase));
      children.add(InvNumField(label: 'Cost price (₹)', controller: _cost));
    } else {
      // Sold goods (trading / finished / semi-finished).
      children.add(InvNumField(label: 'MRP (₹)', controller: _mrp));
      children.add(InvNumField(label: 'Selling price (₹)', controller: _selling));
      children.add(InvNumField(label: 'Purchase rate (₹)', controller: _purchase));
      children.add(InvNumField(label: 'Cost price (₹)', controller: _cost));
    }
    return InvFormSection(title: 'Tax & pricing', children: children);
  }

  Widget _classification() {
    // Pick from the existing category tree when one is configured; fall back
    // to free text only when the tenant has no categories yet.
    final cats = ref.watch(invCategoryTreeProvider).valueOrNull ?? const [];
    return InvFormSection(
      title: 'Classification',
      children: [
        ..._categoryFields(cats),
        InvFormField(label: 'EAN / barcode', controller: _ean, hint: 'Optional'),
        InvFormField(label: 'Description', controller: _description, maxLines: 3,
            hint: 'Optional', capitalization: TextCapitalization.sentences),
      ],
    );
  }

  List<Widget> _categoryFields(List<InvCategory> cats) {
    if (cats.isEmpty) {
      return [
        InvFormField(label: 'Category', controller: _category, hint: 'Optional',
            capitalization: TextCapitalization.words),
        InvFormField(label: 'Subcategory', controller: _subcategory,
            hint: 'Optional', capitalization: TextCapitalization.words),
      ];
    }
    final selected = cats.where((c) => c.name == _category.text).firstOrNull;
    final subs = selected?.subcategories ?? const <InvCategory>[];
    final catVal = cats.any((c) => c.name == _category.text) ? _category.text : '';
    return [
      const InvFieldLabel('Category'),
      const SizedBox(height: 6),
      InvDropdownField(
        value: catVal,
        options: [
          (key: '', label: '— None —'),
          for (final c in cats) (key: c.name, label: c.name),
        ],
        onChanged: (v) => setState(() {
          _category.text = v ?? '';
          _subcategory.text = '';
        }),
      ),
      const SizedBox(height: 12),
      if (subs.isNotEmpty) ...[
        const InvFieldLabel('Subcategory'),
        const SizedBox(height: 6),
        InvDropdownField(
          // Keyed by category so it resets to None when the category changes
          // (the dropdown is uncontrolled — initialValue only).
          key: ValueKey('subcat-${_category.text}'),
          value: subs.any((s) => s.name == _subcategory.text) ? _subcategory.text : '',
          options: [
            (key: '', label: '— None —'),
            for (final s in subs) (key: s.name, label: s.name),
          ],
          onChanged: (v) => setState(() => _subcategory.text = v ?? ''),
        ),
        const SizedBox(height: 12),
      ],
    ];
  }

  Widget _tracking() {
    final disabled = !_trackInventory;
    void touch(VoidCallback fn) => setState(() {
          _trackingTouched = true;
          fn();
        });
    return InvFormSection(
      title: 'Tracking',
      children: [
        InvSwitchRow(
          label: 'Track inventory',
          subtitle: 'Off for items that never enter a warehouse',
          value: _trackInventory,
          onChanged: (v) => setState(() => _trackInventory = v),
        ),
        InvSwitchRow(
          label: 'Track batches',
          subtitle: 'Each receipt gets a batch number (drives FEFO)',
          value: _trackBatches && !disabled,
          enabled: !disabled,
          onChanged: (v) => touch(() => _trackBatches = v),
        ),
        InvSwitchRow(
          label: 'Track expiry',
          subtitle: 'Capture an expiry date per batch',
          value: _trackExpiry && !disabled,
          enabled: !disabled,
          onChanged: (v) => touch(() => _trackExpiry = v),
        ),
        InvSwitchRow(
          label: 'Track serials',
          subtitle: 'Per-unit serial numbers',
          value: _trackSerials && !disabled,
          enabled: !disabled,
          onChanged: (v) => touch(() => _trackSerials = v),
        ),
        if (_trackInventory && _trackBatches) ...[
          const SizedBox(height: 14),
          InvFormField(label: 'Auto batch code', controller: _batchTemplate,
              hint: 'e.g. {SKU}-{YYYYMMDD}'),
        ],
      ],
    );
  }
}

class _FieldError implements Exception {
  final String message;
  _FieldError(this.message);
}

class _SubmitBar extends StatelessWidget {
  const _SubmitBar({
    required this.busy,
    required this.enabled,
    required this.onSubmit,
  });
  final bool busy;
  final bool enabled;
  final VoidCallback onSubmit;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: EdgeInsets.fromLTRB(
          16, 10, 16, 10 + MediaQuery.of(context).padding.bottom),
      decoration: BoxDecoration(
        color: t.surface,
        border: Border(top: BorderSide(color: t.hairline, width: 0.5)),
      ),
      child: InvPrimaryButton(
        label: 'Create item',
        icon: Icons.check_rounded,
        busy: busy,
        onTap: enabled ? onSubmit : null,
      ),
    );
  }
}
