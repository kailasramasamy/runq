import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/manufacturing_models.dart';
import '../../api/manufacturing_repo.dart';
import '../../providers/manufacturing_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart';
import 'widgets/mfg_colors.dart';
import 'widgets/mfg_item_picker.dart';
import 'widgets/mfg_primitives.dart';

class BomCreateScreen extends ConsumerStatefulWidget {
  const BomCreateScreen({super.key});

  @override
  ConsumerState<BomCreateScreen> createState() => _BomCreateScreenState();
}

class _BomCreateScreenState extends ConsumerState<BomCreateScreen> {
  // Matches the web form's default: one unit of output unless told otherwise.
  final _codeCtl = TextEditingController();
  final _nameCtl = TextEditingController();
  final _outputQtyCtl = TextEditingController(text: '1');
  final _outputUomCtl = TextEditingController();
  final _notesCtl = TextEditingController();
  String? _outputItemId;
  String? _outputItemName;
  DateTime? _effectiveFrom;
  bool _allowAutoRepack = false;
  final List<_BomLineInput> _lines = [];
  bool _busy = false;

  @override
  void dispose() {
    _codeCtl.dispose();
    _nameCtl.dispose();
    _outputQtyCtl.dispose();
    _outputUomCtl.dispose();
    _notesCtl.dispose();
    for (final l in _lines) l.dispose();
    super.dispose();
  }

  bool get _canSave =>
      _codeCtl.text.trim().isNotEmpty &&
      _nameCtl.text.trim().isNotEmpty &&
      _outputItemId != null &&
      (double.tryParse(_outputQtyCtl.text) ?? 0) > 0 &&
      _outputUomCtl.text.trim().isNotEmpty &&
      _lines.isNotEmpty &&
      _lines.every((l) =>
          l.inputItemId != null &&
          (double.tryParse(l.qtyCtl.text) ?? 0) > 0 &&
          l.inputUom.isNotEmpty);


  Future<void> _pickOutputItem() async {
    final picked = await showMfgItemPicker(context, title: 'Pick output item', itemClassGroup: 'finished');
    if (picked != null && mounted) {
      setState(() {
        _outputItemId = picked.id;
        _outputItemName = picked.name;
        // Pre-fill only — never clobber a UoM the user already typed.
        if (_outputUomCtl.text.trim().isEmpty) _outputUomCtl.text = picked.uom;
        if (_nameCtl.text.isEmpty) _nameCtl.text = picked.name;
        if (_codeCtl.text.isEmpty) _codeCtl.text = 'BOM-${picked.sku.isEmpty ? picked.name.substring(0, 3).toUpperCase() : picked.sku.toUpperCase()}';
      });
    }
  }

  Future<void> _addLine() async {
    final picked = await showMfgItemPicker(context,
        title: 'Pick input item',
        itemClassGroup: 'bom_inputs',
        // Seed the search from the output — a mustard-oil BOM almost always
        // consumes mustard something. 'Show all' in the sheet drops the seed.
        suggestFrom: _outputItemName);
    if (picked != null && mounted) {
      setState(() {
        _lines.add(_BomLineInput(
          inputItemId: picked.id,
          inputItemName: picked.name,
          inputUom: picked.uom,
        ));
      });
    }
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _effectiveFrom ?? DateTime.now(),
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: Theme.of(ctx).colorScheme.copyWith(primary: MfgColors.brand(ctx)),
        ),
        child: child!,
      ),
    );
    if (picked != null) setState(() => _effectiveFrom = picked);
  }

  Future<void> _save() async {
    if (!_canSave) return;
    setState(() => _busy = true);
    try {
      final bom = await manufacturingRepo.createBom(
        bomCode: _codeCtl.text.trim(),
        name: _nameCtl.text.trim(),
        outputItemId: _outputItemId!,
        outputQty: double.parse(_outputQtyCtl.text),
        outputUom: _outputUomCtl.text.trim(),
        allowAutoRepack: _allowAutoRepack,
        effectiveFrom: _effectiveFrom?.toIso8601String().substring(0, 10),
        notes: _notesCtl.text.trim().isEmpty ? null : _notesCtl.text.trim(),
        lines: _lines.asMap().entries.map((e) => {
          'lineNo': e.key + 1,
          'inputItemId': e.value.inputItemId!,
          'qtyPerOutput': double.parse(e.value.qtyCtl.text),
          'inputUom': e.value.inputUom,
          'scrapPct': double.tryParse(e.value.scrapCtl.text) ?? 0,
          'substitutes': [for (final sub in e.value.substitutes) sub.itemId],
          'isOptional': e.value.isOptional,
        }).toList(),
      );
      ref.invalidate(bomListProvider);
      if (mounted) {
        showRunqSnack(context, 'BOM ${bom.bomCode} created', kind: SnackKind.success);
        context.go('/manufacturing/boms');
      }
    } catch (e) {
      if (mounted) showRunqSnack(context, e.toString(), kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Scaffold(
      backgroundColor: t.bgWarm,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            MfgPlainAppBar(title: 'New BOM'),
            Expanded(
              child: ListView(
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                // Tall bottom padding leaves room for the sticky Save button
                // plus the keyboard, so the last input-line row can scroll
                // fully above both when focused.
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 240),
                children: [
                  // Output item picker
                  MfgCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Output', style: RunqText.label),
                        const SizedBox(height: 10),
                        _PickerTile(
                          label: 'Output item',
                          value: _outputItemName,
                          icon: Icons.factory_outlined,
                          onTap: _pickOutputItem,
                        ),
                        const SizedBox(height: 10),
                        Row(
                          children: [
                            Expanded(
                              flex: 2,
                              child: _TextField(
                                controller: _outputQtyCtl,
                                label: 'Unit size',
                                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                                capitalization: TextCapitalization.none,
                                onChanged: (_) => setState(() {}),
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: _TextField(
                                controller: _outputUomCtl,
                                label: 'UOM',
                                capitalization: TextCapitalization.none,
                                onChanged: (_) => setState(() {}),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  // Basic info
                  MfgCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Details', style: RunqText.label),
                        const SizedBox(height: 10),
                        _TextField(
                          controller: _codeCtl,
                          label: 'BOM code',
                          capitalization: TextCapitalization.none,
                          onChanged: (_) => setState(() {}),
                        ),
                        const SizedBox(height: 10),
                        _TextField(
                          controller: _nameCtl,
                          label: 'Name',
                          capitalization: TextCapitalization.sentences,
                          onChanged: (_) => setState(() {}),
                        ),
                        const SizedBox(height: 10),
                        _DatePickerTile(
                          label: 'Effective from',
                          value: _effectiveFrom,
                          onTap: _pickDate,
                          onClear: () => setState(() => _effectiveFrom = null),
                        ),
                        const SizedBox(height: 10),
                        _TextField(
                          controller: _notesCtl,
                          label: 'Notes',
                          capitalization: TextCapitalization.sentences,
                          maxLines: 3,
                        ),
                        const SizedBox(height: 4),
                        _AutoRepackToggle(
                          value: _allowAutoRepack,
                          onChanged: (v) => setState(() => _allowAutoRepack = v),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  // Input lines
                  MfgCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Text('Input Lines', style: RunqText.label),
                            const Spacer(),
                            TextButton.icon(
                              onPressed: _addLine,
                              icon: const Icon(Icons.add_rounded, size: 16),
                              label: const Text('Add'),
                              style: TextButton.styleFrom(
                                foregroundColor: MfgColors.brand(context),
                              ),
                            ),
                          ],
                        ),
                        if (_lines.isEmpty) ...[
                          const SizedBox(height: 8),
                          Text(
                            'Add at least one input item.',
                            style: RunqText.caption.copyWith(color: t.muted),
                          ),
                        ] else ...[
                          const SizedBox(height: 8),
                          for (var i = 0; i < _lines.length; i++) ...[
                            _BomLineEditor(
                              index: i,
                              line: _lines[i],
                              onRemove: () => setState(() => _lines.removeAt(i)),
                              onChange: () => setState(() {}),
                            ),
                            if (i < _lines.length - 1)
                              Divider(color: t.hairline, height: 16),
                          ],
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
      // No SafeArea wrap — white surface extends edge-to-edge under the
      // button; flat 32px top/bottom for breathing room, matching detail.
      bottomSheet: Container(
        decoration: BoxDecoration(
          color: RT(context).surface,
          border: Border(top: BorderSide(color: RT(context).hairline)),
        ),
        padding: const EdgeInsets.fromLTRB(16, 32, 16, 32),
        child: SizedBox(
          width: double.infinity,
          child: MfgPrimaryButton(
            label: 'Save BOM',
            loading: _busy,
            onPressed: _canSave ? _save : null,
            icon: Icons.check_rounded,
          ),
        ),
      ),
    );
  }
}

// ── BOM edit screen ────────────────────────────────────────────────────────

class BomEditScreen extends ConsumerStatefulWidget {
  final String bomId;
  const BomEditScreen({super.key, required this.bomId});

  @override
  ConsumerState<BomEditScreen> createState() => _BomEditScreenState();
}

class _BomEditScreenState extends ConsumerState<BomEditScreen> {
  final _codeCtl = TextEditingController();
  final _nameCtl = TextEditingController();
  final _outputQtyCtl = TextEditingController();
  final _outputUomCtl = TextEditingController();
  final _notesCtl = TextEditingController();
  String? _outputItemId;
  String? _outputItemName;
  DateTime? _effectiveFrom;
  bool _allowAutoRepack = false;
  final List<_BomLineInput> _lines = [];
  bool _busy = false;
  bool _loaded = false;
  bool _hasLinkedWos = false;

  @override
  void dispose() {
    _codeCtl.dispose();
    _nameCtl.dispose();
    _outputQtyCtl.dispose();
    _outputUomCtl.dispose();
    _notesCtl.dispose();
    for (final l in _lines) l.dispose();
    super.dispose();
  }

  void _initFrom(Bom bom) {
    if (_loaded) return;
    _codeCtl.text = bom.bomCode;
    _nameCtl.text = bom.name;
    _outputQtyCtl.text = bom.outputQty.toString();
    _outputUomCtl.text = bom.outputUom;
    _notesCtl.text = bom.notes ?? '';
    _outputItemId = bom.outputItemId;
    _outputItemName = bom.outputItemName;
    _hasLinkedWos = bom.linkedWoCount > 0;
    _allowAutoRepack = bom.allowAutoRepack;
    if (bom.effectiveFrom != null) {
      _effectiveFrom = DateTime.tryParse(bom.effectiveFrom!);
    }
    for (final line in bom.lines) {
      _lines.add(_BomLineInput(
        inputItemId: line.inputItemId,
        inputItemName: line.inputItemName,
        inputUom: line.inputUom,
        initialQty: line.qtyPerOutput,
        initialScrap: line.scrapPct,
        isOptional: line.isOptional,
        substitutes: [
          for (final sub in line.substitutes)
            (itemId: sub.itemId, itemName: sub.itemName),
        ],
      ));
    }
    _loaded = true;
  }

  bool get _canSave =>
      _nameCtl.text.trim().isNotEmpty &&
      _outputItemId != null &&
      (double.tryParse(_outputQtyCtl.text) ?? 0) > 0 &&
      _outputUomCtl.text.trim().isNotEmpty &&
      _lines.isNotEmpty &&
      _lines.every((l) =>
          l.inputItemId != null &&
          (double.tryParse(l.qtyCtl.text) ?? 0) > 0 &&
          l.inputUom.isNotEmpty);

  Future<void> _addLine() async {
    final picked = await showMfgItemPicker(context,
        title: 'Pick input item',
        itemClassGroup: 'bom_inputs',
        // Seed the search from the output — a mustard-oil BOM almost always
        // consumes mustard something. 'Show all' in the sheet drops the seed.
        suggestFrom: _outputItemName);
    if (picked != null && mounted) {
      setState(() {
        _lines.add(_BomLineInput(
          inputItemId: picked.id,
          inputItemName: picked.name,
          inputUom: picked.uom,
        ));
      });
    }
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _effectiveFrom ?? DateTime.now(),
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: Theme.of(ctx).colorScheme.copyWith(primary: MfgColors.brand(ctx)),
        ),
        child: child!,
      ),
    );
    if (picked != null) setState(() => _effectiveFrom = picked);
  }

  Future<void> _save() async {
    if (!_canSave) return;
    setState(() => _busy = true);
    try {
      // bomCode is immutable — updateBomSchema types it as `never`, so sending
      // it back fails validation. Mirrors the web edit route, which strips it.
      await manufacturingRepo.updateBom(widget.bomId, {
        'name': _nameCtl.text.trim(),
        'outputItemId': _outputItemId!,
        'outputQty': double.parse(_outputQtyCtl.text),
        'outputUom': _outputUomCtl.text.trim(),
        'allowAutoRepack': _allowAutoRepack,
        'effectiveFrom': _effectiveFrom?.toIso8601String().substring(0, 10),
        'notes': _notesCtl.text.trim().isEmpty ? null : _notesCtl.text.trim(),
        'lines': _lines.asMap().entries.map((e) => {
          'lineNo': e.key + 1,
          'inputItemId': e.value.inputItemId!,
          'qtyPerOutput': double.parse(e.value.qtyCtl.text),
          'inputUom': e.value.inputUom,
          'scrapPct': double.tryParse(e.value.scrapCtl.text) ?? 0,
          'substitutes': [for (final sub in e.value.substitutes) sub.itemId],
          'isOptional': e.value.isOptional,
        }).toList(),
      });
      ref.invalidate(bomDetailProvider(widget.bomId));
      ref.invalidate(bomListProvider);
      if (mounted) {
        showRunqSnack(context, 'BOM updated', kind: SnackKind.success);
        context.pop();
      }
    } catch (e) {
      if (mounted) showRunqSnack(context, e.toString(), kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final bomAsync = ref.watch(bomDetailProvider(widget.bomId));

    return bomAsync.when(
      loading: () => const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (e, _) =>
          Scaffold(body: Center(child: Text('Failed to load: $e', style: RunqText.body))),
      data: (bom) {
        _initFrom(bom);
        return Scaffold(
          backgroundColor: t.bgWarm,
          body: SafeArea(
            bottom: false,
            child: Column(
              children: [
                MfgPlainAppBar(title: 'Edit BOM'),
                if (_hasLinkedWos)
                  Container(
                    margin: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: MfgColors.orangeAlertBg,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: MfgColors.orangeAlert.withValues(alpha: 0.30)),
                    ),
                    child: Row(
                      children: [
                        Icon(Icons.warning_amber_rounded, size: 18, color: MfgColors.orangeAlert),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'This BOM has linked WOs. Saving will create a new version; existing WOs retain their snapshot.',
                            style: RunqText.caption.copyWith(color: MfgColors.orangeAlert),
                          ),
                        ),
                      ],
                    ),
                  ),
                Expanded(
                  child: ListView(
                    keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                    // Match create screen — clear the sticky Save button +
                    // keyboard so the last input line can scroll into view.
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 240),
                    children: [
                      MfgCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Output', style: RunqText.label),
                            const SizedBox(height: 10),
                            _PickerTile(
                              label: 'Output item',
                              value: _outputItemName,
                              icon: Icons.factory_outlined,
                              onTap: () async {
                                final picked = await showMfgItemPicker(context, title: 'Pick output item', itemClassGroup: 'finished');
                                if (picked != null && mounted) {
                                  setState(() {
                                    _outputItemId = picked.id;
                                    _outputItemName = picked.name;
                                    if (_outputUomCtl.text.trim().isEmpty) {
                                      _outputUomCtl.text = picked.uom;
                                    }
                                  });
                                }
                              },
                            ),
                            const SizedBox(height: 10),
                            Row(
                              children: [
                                Expanded(
                                  flex: 2,
                                  child: _TextField(
                                    controller: _outputQtyCtl,
                                    label: 'Unit size',
                                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                                    capitalization: TextCapitalization.none,
                                    onChanged: (_) => setState(() {}),
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: _TextField(
                                    controller: _outputUomCtl,
                                    label: 'UOM',
                                    capitalization: TextCapitalization.none,
                                    onChanged: (_) => setState(() {}),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                      MfgCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Details', style: RunqText.label),
                            const SizedBox(height: 10),
                            _TextField(
                              controller: _codeCtl,
                              label: 'BOM code (fixed)',
                              capitalization: TextCapitalization.none,
                              enabled: false,
                            ),
                            const SizedBox(height: 10),
                            _TextField(
                              controller: _nameCtl,
                              label: 'Name',
                              capitalization: TextCapitalization.sentences,
                              onChanged: (_) => setState(() {}),
                            ),
                            const SizedBox(height: 10),
                            _DatePickerTile(
                              label: 'Effective from',
                              value: _effectiveFrom,
                              onTap: _pickDate,
                              onClear: () => setState(() => _effectiveFrom = null),
                            ),
                            const SizedBox(height: 10),
                            _TextField(
                              controller: _notesCtl,
                              label: 'Notes',
                              capitalization: TextCapitalization.sentences,
                              maxLines: 3,
                            ),
                            const SizedBox(height: 4),
                            _AutoRepackToggle(
                              value: _allowAutoRepack,
                              onChanged: (v) => setState(() => _allowAutoRepack = v),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                      MfgCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Text('Input Lines', style: RunqText.label),
                                const Spacer(),
                                TextButton.icon(
                                  onPressed: _addLine,
                                  icon: const Icon(Icons.add_rounded, size: 16),
                                  label: const Text('Add'),
                                  style: TextButton.styleFrom(
                                    foregroundColor: MfgColors.brand(context),
                                  ),
                                ),
                              ],
                            ),
                            if (_lines.isEmpty)
                              Text('Add at least one input item.',
                                  style: RunqText.caption.copyWith(color: t.muted))
                            else
                              for (var i = 0; i < _lines.length; i++) ...[
                                _BomLineEditor(
                                  index: i,
                                  line: _lines[i],
                                  onRemove: () => setState(() => _lines.removeAt(i)),
                                  onChange: () => setState(() {}),
                                ),
                                if (i < _lines.length - 1)
                                  Divider(color: t.hairline, height: 16),
                              ],
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          bottomSheet: Container(
            decoration: BoxDecoration(
              color: RT(context).surface,
              border: Border(top: BorderSide(color: RT(context).hairline)),
            ),
            padding: const EdgeInsets.fromLTRB(16, 32, 16, 32),
            child: SizedBox(
              width: double.infinity,
              child: MfgPrimaryButton(
                label: 'Update BOM',
                loading: _busy,
                onPressed: _canSave ? _save : null,
                icon: Icons.check_rounded,
              ),
            ),
          ),
        );
      },
    );
  }
}

// ── Shared sub-widgets ────────────────────────────────────────────────────

class _BomLineInput {
  String? inputItemId;
  String inputItemName;
  bool isOptional;

  /// Items this line will accept instead of its own — "7 L of milk, A2 or A1
  /// or buffalo". The qty stays on the line; these carry none of their own.
  List<({String itemId, String itemName})> substitutes;
  final TextEditingController qtyCtl;
  final TextEditingController scrapCtl;
  // UoM is editable per line, like the web form: the item's stocking unit is
  // only a pre-fill (a recipe may be written in mL while the item stocks in L),
  // and items with no unit set would otherwise post an empty string, which the
  // API rejects.
  final TextEditingController uomCtl;

  _BomLineInput({
    this.inputItemId,
    this.inputItemName = '',
    String inputUom = '',
    double initialQty = 1,
    double initialScrap = 0,
    this.isOptional = false,
    List<({String itemId, String itemName})>? substitutes,
  })  : substitutes = substitutes ?? [],
        qtyCtl = TextEditingController(text: initialQty == 1 ? '' : '$initialQty'),
        scrapCtl = TextEditingController(
          text: initialScrap == 0 ? '' : initialScrap.toStringAsFixed(2),
        ),
        uomCtl = TextEditingController(text: inputUom);

  String get inputUom => uomCtl.text.trim();

  void dispose() {
    qtyCtl.dispose();
    scrapCtl.dispose();
    uomCtl.dispose();
  }
}

class _BomLineEditor extends StatefulWidget {
  final int index;
  final _BomLineInput line;
  final VoidCallback onRemove;
  final VoidCallback onChange;
  const _BomLineEditor({
    required this.index,
    required this.line,
    required this.onRemove,
    required this.onChange,
  });

  @override
  State<_BomLineEditor> createState() => _BomLineEditorState();
}

class _BomLineEditorState extends State<_BomLineEditor> {
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                widget.line.inputItemName.isEmpty
                    ? 'Line ${widget.index + 1}'
                    : widget.line.inputItemName,
                style: RunqText.bodyStrong.copyWith(color: t.ink),
                overflow: TextOverflow.ellipsis,
              ),
            ),
            if (widget.line.isOptional)
              Container(
                margin: const EdgeInsets.only(right: 6),
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: t.bgWarm,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text('optional', style: RunqText.micro.copyWith(color: t.muted)),
              ),
            IconButton(
              icon: Icon(Icons.close_rounded, size: 18, color: t.muted),
              visualDensity: VisualDensity.compact,
              onPressed: widget.onRemove,
            ),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              flex: 2,
              child: _TextField(
                controller: widget.line.qtyCtl,
                label: 'Qty per output',
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                capitalization: TextCapitalization.none,
                onChanged: (_) => widget.onChange(),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _TextField(
                controller: widget.line.uomCtl,
                label: 'UOM',
                capitalization: TextCapitalization.none,
                onChanged: (_) => widget.onChange(),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _TextField(
                controller: widget.line.scrapCtl,
                label: 'Scrap %',
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                capitalization: TextCapitalization.none,
                onChanged: (_) => widget.onChange(),
              ),
            ),
          ],
        ),
        const SizedBox(height: 4),
        Row(
          children: [
            Checkbox(
              value: widget.line.isOptional,
              onChanged: (v) {
                setState(() => widget.line.isOptional = v ?? false);
                widget.onChange();
              },
              materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
              activeColor: MfgColors.brand(context),
            ),
            Text('Optional', style: RunqText.caption.copyWith(color: t.muted)),
          ],
        ),
        _SubstituteStrip(line: widget.line, onChange: widget.onChange),
      ],
    );
  }
}

/// The items a line will accept instead of its own.
///
/// The qty is never repeated here — that is the point: "7 L of milk, A2 or A1
/// or buffalo" is one requirement, and listing each type as its own line would
/// read as three times the milk.
class _SubstituteStrip extends StatefulWidget {
  final _BomLineInput line;
  final VoidCallback onChange;
  const _SubstituteStrip({required this.line, required this.onChange});

  @override
  State<_SubstituteStrip> createState() => _SubstituteStripState();
}

class _SubstituteStripState extends State<_SubstituteStrip> {
  Future<void> _add() async {
    final picked = await showMfgItemPicker(context,
        title: 'Accept instead of ${widget.line.inputItemName}',
        itemClassGroup: 'bom_inputs',
        suggestFrom: widget.line.inputItemName);
    if (picked == null || !mounted) return;
    if (picked.id == widget.line.inputItemId) {
      showRunqSnack(context, 'That is the line\'s own item', kind: SnackKind.warning);
      return;
    }
    if (widget.line.substitutes.any((s) => s.itemId == picked.id)) return;
    setState(() =>
        widget.line.substitutes.add((itemId: picked.id, itemName: picked.name)));
    widget.onChange();
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Wrap(
        spacing: 6,
        runSpacing: 6,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          Text('also accepts', style: RunqText.caption.copyWith(color: t.muted)),
          for (final sub in widget.line.substitutes)
            InputChip(
              label: Text(sub.itemName, style: RunqText.caption.copyWith(color: t.ink)),
              onDeleted: () {
                setState(() => widget.line.substitutes
                    .removeWhere((s) => s.itemId == sub.itemId));
                widget.onChange();
              },
              backgroundColor: t.bgWarm,
              side: BorderSide(color: t.hairline),
              visualDensity: VisualDensity.compact,
            ),
          TextButton.icon(
            onPressed: widget.line.inputItemId == null ? null : _add,
            icon: const Icon(Icons.add_rounded, size: 16),
            label: Text('Add', style: RunqText.caption),
            style: TextButton.styleFrom(
              foregroundColor: MfgColors.brand(context),
              visualDensity: VisualDensity.compact,
              padding: const EdgeInsets.symmetric(horizontal: 8),
            ),
          ),
        ],
      ),
    );
  }
}

class _TextField extends StatelessWidget {
  final TextEditingController controller;
  final String label;
  final TextCapitalization capitalization;
  final TextInputType? keyboardType;
  final int maxLines;
  final ValueChanged<String>? onChanged;
  final bool enabled;

  const _TextField({
    required this.controller,
    required this.label,
    required this.capitalization,
    this.keyboardType,
    this.maxLines = 1,
    this.onChanged,
    this.enabled = true,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return TextField(
      controller: controller,
      textCapitalization: capitalization,
      keyboardType: keyboardType,
      maxLines: maxLines,
      onChanged: onChanged,
      enabled: enabled,
      style: RunqText.body.copyWith(color: t.ink),
      // Lift focused fields well above the keyboard + sticky Save button
      // (Scaffold.bottomSheet) so input-line rows aren't hidden under
      // the keypad when the user taps Qty/Scrap.
      scrollPadding: const EdgeInsets.only(bottom: 220),
      decoration: InputDecoration(
        labelText: label,
        labelStyle: RunqText.caption.copyWith(color: t.muted),
        isDense: true,
        filled: true,
        fillColor: t.bgWarm,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: t.hairline),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: t.hairline),
        ),
      ),
    );
  }
}

class _PickerTile extends StatelessWidget {
  final String label;
  final String? value;
  final IconData icon;
  final VoidCallback onTap;

  const _PickerTile({
    required this.label,
    required this.value,
    required this.icon,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          decoration: BoxDecoration(
            color: t.bgWarm,
            border: Border.all(color: t.hairline),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            children: [
              Icon(icon, size: 18, color: t.muted),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(label, style: RunqText.caption.copyWith(color: t.muted, height: 1)),
                    const SizedBox(height: 2),
                    Text(
                      value ?? 'Tap to select',
                      style: RunqText.bodyStrong.copyWith(
                        color: value != null ? t.ink : t.muted2,
                        height: 1.2,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              Icon(Icons.unfold_more_rounded, size: 18, color: t.muted2),
            ],
          ),
        ),
      ),
    );
  }
}

class _DatePickerTile extends StatelessWidget {
  final String label;
  final DateTime? value;
  final VoidCallback onTap;
  final VoidCallback onClear;

  const _DatePickerTile({
    required this.label,
    required this.value,
    required this.onTap,
    required this.onClear,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final formatted = value != null ? mfgPrettyDate(value!.toIso8601String()) : null;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          decoration: BoxDecoration(
            color: t.bgWarm,
            border: Border.all(color: t.hairline),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            children: [
              Icon(Icons.event_outlined, size: 18, color: t.muted),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(label, style: RunqText.caption.copyWith(color: t.muted, height: 1)),
                    const SizedBox(height: 2),
                    Text(
                      formatted ?? 'Optional',
                      style: RunqText.bodyStrong.copyWith(
                        color: formatted != null ? t.ink : t.muted2,
                        height: 1.2,
                      ),
                    ),
                  ],
                ),
              ),
              if (value != null)
                IconButton(
                  icon: Icon(Icons.close_rounded, size: 16, color: t.muted),
                  visualDensity: VisualDensity.compact,
                  onPressed: onClear,
                )
              else
                Icon(Icons.unfold_more_rounded, size: 18, color: t.muted2),
            ],
          ),
        ),
      ),
    );
  }
}

/// Marks a recipe whose output is only branded when it ships.
///
/// Such a SKU deliberately keeps no stock of its own — a delivery note that is
/// short runs the recipe on the spot, draws its components and sends what it
/// just made. Shared by the create and edit forms so the wording (and the
/// warning about when *not* to use it) can only be written once.
class _AutoRepackToggle extends StatelessWidget {
  const _AutoRepackToggle({required this.value, required this.onChanged});

  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return SwitchListTile.adaptive(
      value: value,
      onChanged: onChanged,
      contentPadding: EdgeInsets.zero,
      controlAffinity: ListTileControlAffinity.leading,
      dense: true,
      title: Text('Make on demand at dispatch', style: RunqText.body),
      subtitle: Text(
        'For products branded only when they ship. The output holds no stock '
        'of its own — a short delivery note runs this recipe, then sends what '
        'it made. Leave off unless that decision is really taken at dispatch.',
        style: RunqText.caption.copyWith(color: t.muted),
      ),
    );
  }
}
