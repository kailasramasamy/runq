// DN edit — only available for drafts. Lets the user tweak header fields
// (dispatch date, vehicle, e-way bill, notes) and the line items (qty, batch,
// delete; add new lines via barcode lookup, mirroring the new-DN sheet).
// PUT replaces the whole `lines` array on the server, so the local list is
// the source of truth at submit time.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/inventory_models.dart';
import '../../api/inventory_repo.dart';
import '../../providers/inventory_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/inv_colors.dart';
import 'widgets/inv_primitives.dart';

class InventoryDeliveryEditScreen extends ConsumerStatefulWidget {
  const InventoryDeliveryEditScreen({super.key, required this.dnId});
  final String dnId;
  @override
  ConsumerState<InventoryDeliveryEditScreen> createState() => _State();
}

class _EditLine {
  String? id;          // null if added in this session
  String itemId;
  String itemName;
  String? itemSku;
  String? uom;
  bool trackBatches;
  String batchNo;
  String qty;
  _EditLine({
    this.id, required this.itemId, required this.itemName, this.itemSku,
    this.uom, this.trackBatches = false, this.batchNo = '', this.qty = '',
  });
}

class _State extends ConsumerState<InventoryDeliveryEditScreen> {
  final _dateCtrl = TextEditingController();
  final _vehicleCtrl = TextEditingController();
  final _ewayCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();
  final _barcodeCtrl = TextEditingController();
  List<_EditLine> _lines = [];
  bool _hydrated = false;
  bool _submitting = false;

  @override
  void dispose() {
    _dateCtrl.dispose();
    _vehicleCtrl.dispose();
    _ewayCtrl.dispose();
    _notesCtrl.dispose();
    _barcodeCtrl.dispose();
    super.dispose();
  }

  void _hydrate(InvDnDetail dn) {
    _dateCtrl.text = dn.dispatchDate;
    _vehicleCtrl.text = dn.vehicleNo ?? '';
    _ewayCtrl.text = dn.eWayBillNo ?? '';
    _notesCtrl.text = dn.notes ?? '';
    _lines = dn.lines.map((l) => _EditLine(
          id: l.id,
          itemId: l.itemId,
          itemName: l.itemName,
          itemSku: l.itemSku,
          uom: l.uom,
          trackBatches: l.trackBatches,
          batchNo: l.batchNo ?? '',
          qty: l.qty % 1 == 0 ? l.qty.toStringAsFixed(0) : l.qty.toString(),
        )).toList();
    _hydrated = true;
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final initial = DateTime.tryParse(_dateCtrl.text) ?? now;
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(now.year - 2),
      lastDate: DateTime(now.year + 1),
    );
    if (picked != null) {
      setState(() => _dateCtrl.text = picked.toIso8601String().substring(0, 10));
    }
  }

  Future<void> _addByBarcode() async {
    final code = _barcodeCtrl.text.trim();
    if (code.isEmpty) return;
    final item = await inventoryRepo.findByBarcode(code);
    if (!mounted) return;
    if (item == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No item matched that barcode')),
      );
      return;
    }
    setState(() {
      _lines.add(_EditLine(
        itemId: item.id,
        itemName: item.name,
        itemSku: item.sku,
        uom: item.unit,
        trackBatches: item.trackBatches,
      ));
      _barcodeCtrl.clear();
    });
  }

  Future<void> _submit() async {
    final valid = _lines
        .where((l) => l.itemId.isNotEmpty && (double.tryParse(l.qty) ?? 0) > 0)
        .toList();
    if (valid.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Add at least one line with qty > 0')),
      );
      return;
    }
    setState(() => _submitting = true);
    try {
      await inventoryRepo.updateDn(
        id: widget.dnId,
        dispatchDate: _dateCtrl.text,
        vehicleNo: _vehicleCtrl.text.trim(),
        eWayBillNo: _ewayCtrl.text.trim(),
        notes: _notesCtrl.text.trim(),
        lines: valid
            .map((l) => InvDnLineInput(
                  itemId: l.itemId,
                  batchNo: l.batchNo.trim().isEmpty ? null : l.batchNo.trim(),
                  qty: double.parse(l.qty),
                ))
            .toList(),
      );
      if (!mounted) return;
      ref.invalidate(invDnDetailProvider(widget.dnId));
      ref.invalidate(invDnListProvider(null));
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Dispatch updated')),
      );
      context.pop();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed: $e')));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final async = ref.watch(invDnDetailProvider(widget.dnId));

    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: AppBar(title: Text('Edit dispatch', style: RunqText.h3.copyWith(color: t.ink))),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Failed: $e',
            style: RunqText.body.copyWith(color: t.muted))),
        data: (dn) {
          if (dn.status != 'draft') {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text('Only draft dispatches can be edited. This one is ${dn.status}.',
                    style: RunqText.body.copyWith(color: t.muted),
                    textAlign: TextAlign.center),
              ),
            );
          }
          if (!_hydrated) _hydrate(dn);
          return _buildForm();
        },
      ),
    );
  }

  Widget _buildForm() {
    final t = RT(context);
    return Column(
      children: [
        Expanded(
          child: ListView(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
            children: [
              _Card(children: [
                _Lbl('Dispatch date'),
                _DateField(controller: _dateCtrl, onTap: _pickDate),
                const SizedBox(height: 12),
                _Lbl('Vehicle no.'),
                _Field(controller: _vehicleCtrl, hint: 'e.g. MH12 AB 1234'),
                const SizedBox(height: 12),
                _Lbl('e-Way bill'),
                _Field(controller: _ewayCtrl, hint: 'e-Way bill no'),
                const SizedBox(height: 12),
                _Lbl('Notes'),
                _Field(controller: _notesCtrl, hint: 'Optional', maxLines: 2),
              ]),
              const SizedBox(height: 12),
              _Card(children: [
                Row(children: [
                  Text('Lines', style: RunqText.label.copyWith(color: t.muted)),
                  const Spacer(),
                  Text('${_lines.length}',
                      style: RunqText.caption.copyWith(color: t.muted)),
                ]),
                const SizedBox(height: 8),
                if (_lines.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Text('No lines — add one via barcode below.',
                        style: RunqText.caption.copyWith(color: t.muted)),
                  ),
                for (var i = 0; i < _lines.length; i++)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: _LineEditor(
                      line: _lines[i],
                      onChange: () => setState(() {}),
                      onDelete: () => setState(() => _lines.removeAt(i)),
                    ),
                  ),
                const SizedBox(height: 12),
                _Lbl('Add line via barcode'),
                Row(children: [
                  Expanded(
                    child: _Field(
                      controller: _barcodeCtrl,
                      hint: 'Scan or type barcode',
                      onSubmitted: (_) => _addByBarcode(),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Material(
                    color: InvColors.brand(context),
                    borderRadius: BorderRadius.circular(10),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(10),
                      onTap: _addByBarcode,
                      child: const SizedBox(
                        width: 44, height: 44,
                        child: Icon(Icons.qr_code_scanner, color: Colors.white, size: 18),
                      ),
                    ),
                  ),
                ]),
              ]),
            ],
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: InvPrimaryButton(
              label: 'Save changes',
              icon: Icons.check,
              busy: _submitting,
              onTap: _submitting ? null : _submit,
            ),
          ),
        ),
      ],
    );
  }
}

// ── Pieces ────────────────────────────────────────────────────────────────

class _Card extends StatelessWidget {
  const _Card({required this.children});
  final List<Widget> children;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: t.surface,
        border: Border.all(color: t.hairline),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: children),
    );
  }
}

class _LineEditor extends StatefulWidget {
  const _LineEditor({required this.line, required this.onChange, required this.onDelete});
  final _EditLine line;
  final VoidCallback onChange;
  final VoidCallback onDelete;
  @override
  State<_LineEditor> createState() => _LineEditorState();
}

class _LineEditorState extends State<_LineEditor> {
  late final TextEditingController _qty;
  late final TextEditingController _batch;

  @override
  void initState() {
    super.initState();
    _qty = TextEditingController(text: widget.line.qty);
    _batch = TextEditingController(text: widget.line.batchNo);
    _qty.addListener(() {
      widget.line.qty = _qty.text;
      widget.onChange();
    });
    _batch.addListener(() {
      widget.line.batchNo = _batch.text;
    });
  }

  @override
  void dispose() {
    _qty.dispose();
    _batch.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final l = widget.line;
    final meta = <String>[
      if ((l.itemSku ?? '').isNotEmpty) l.itemSku!,
      if ((l.uom ?? '').isNotEmpty) l.uom!,
    ].join(' · ');
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 10, 10, 10),
      decoration: BoxDecoration(
        color: t.bgWarm,
        border: Border.all(color: t.hairlineSoft),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Expanded(child: Text(l.itemName,
                style: RunqText.bodyStrong.copyWith(color: t.ink),
                maxLines: 2, overflow: TextOverflow.ellipsis)),
            IconButton(
              tooltip: 'Remove',
              onPressed: widget.onDelete,
              icon: Icon(Icons.delete_outline, color: t.muted, size: 18),
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
            ),
          ]),
          if (meta.isNotEmpty)
            Text(meta, style: RunqText.caption.copyWith(color: t.muted)),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(
              child: _Field(
                controller: _qty,
                hint: 'Qty',
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              flex: 2,
              child: _Field(
                controller: _batch,
                hint: l.trackBatches ? 'Batch (blank = FEFO)' : 'Batch',
                enabled: l.trackBatches,
              ),
            ),
          ]),
        ],
      ),
    );
  }
}

class _Lbl extends StatelessWidget {
  const _Lbl(this.label);
  final String label;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 5),
      child: Text(label.toUpperCase(),
          style: RunqText.label.copyWith(color: RT(context).muted, letterSpacing: 0.5)),
    );
  }
}

class _Field extends StatelessWidget {
  const _Field({
    required this.controller, this.hint, this.maxLines = 1,
    this.keyboardType, this.onSubmitted, this.enabled = true,
  });
  final TextEditingController controller;
  final String? hint;
  final int maxLines;
  final TextInputType? keyboardType;
  final ValueChanged<String>? onSubmitted;
  final bool enabled;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return TextField(
      controller: controller,
      enabled: enabled,
      maxLines: maxLines,
      keyboardType: keyboardType,
      onSubmitted: onSubmitted,
      style: RunqText.body.copyWith(color: t.ink, fontSize: 14),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: RunqText.body.copyWith(color: t.muted2, fontSize: 14),
        filled: true,
        fillColor: enabled ? t.surface : t.bgWarmer,
        isDense: true,
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: t.hairline),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: t.hairline),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: InvColors.brand(context), width: 1.2),
        ),
      ),
    );
  }
}

class _DateField extends StatelessWidget {
  const _DateField({required this.controller, required this.onTap});
  final TextEditingController controller;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return GestureDetector(
      onTap: onTap,
      child: AbsorbPointer(
        child: TextField(
          controller: controller,
          style: RunqText.body.copyWith(color: t.ink, fontSize: 14),
          decoration: InputDecoration(
            hintText: 'YYYY-MM-DD',
            filled: true,
            fillColor: t.surface,
            isDense: true,
            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            suffixIcon: Icon(Icons.calendar_today_outlined, size: 16, color: t.muted),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide(color: t.hairline),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide(color: t.hairline),
            ),
          ),
        ),
      ),
    );
  }
}
