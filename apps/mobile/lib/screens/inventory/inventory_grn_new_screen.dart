// New GRN — full-screen receive-stock flow that replaces the old modal
// sheet. Two entry paths share one editable line list:
//
//   1. Scan invoice: tap a tile → camera/gallery/PDF → the server's AI
//      extractor pre-fills vendor + lines. Unmatched lines are flagged
//      and tappable to bind to a catalog item via search.
//   2. Manual entry: barcode scan or item search adds one line at a
//      time, with inline qty/rate fields.
//
// Both paths build the same `_DraftLine` list, so the bottom "Receive +
// Post" button works identically either way. AI failure surfaces as a
// snackbar that nudges the user back to manual — no dead end.

library;

import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../api/inventory_models.dart';
import '../../api/inventory_repo.dart';
import '../../providers/inventory_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/inv_class_tabs.dart';
import 'widgets/inv_colors.dart';
import 'widgets/inv_primitives.dart';
import 'widgets/warehouse_picker.dart';

class InventoryGrnNewScreen extends ConsumerStatefulWidget {
  const InventoryGrnNewScreen({super.key});
  @override
  ConsumerState<InventoryGrnNewScreen> createState() => _InventoryGrnNewScreenState();
}

class _InventoryGrnNewScreenState extends ConsumerState<InventoryGrnNewScreen> {
  String? _warehouseId;
  final List<_DraftLine> _lines = [];
  // 'scan' lights up the AI tile + last extraction banner; 'manual' shows
  // the barcode + search affordances. Both share the same line list.
  String _mode = 'scan';
  bool _extracting = false;
  bool _submitting = false;
  String? _vendorName;
  String? _invoiceNumber;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: InvPlainAppBar(
        title: 'New GRN',
        onBack: () => context.pop(),
      ),
      body: SafeArea(
        top: false,
        child: Column(
          children: [
            Expanded(
              child: ListView(
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 100),
                children: [
                  _SectionLabel('Warehouse'),
                  WarehousePicker(
                    value: _warehouseId,
                    onChanged: (id) => setState(() => _warehouseId = id),
                    allowAll: false,
                    dense: true,
                  ),
                  const SizedBox(height: 18),
                  _ModeToggle(
                    mode: _mode,
                    onChange: (m) => setState(() => _mode = m),
                  ),
                  const SizedBox(height: 12),
                  if (_mode == 'scan')
                    _ScanTile(
                      busy: _extracting,
                      onPick: _runExtractor,
                    )
                  else
                    _ManualEntryPanel(onPicked: _addPickedItem),
                  if (_vendorName != null || _invoiceNumber != null) ...[
                    const SizedBox(height: 12),
                    _ExtractedHeader(
                      vendor: _vendorName,
                      invoiceNo: _invoiceNumber,
                    ),
                  ],
                  const SizedBox(height: 18),
                  _SectionLabel(
                    _lines.isEmpty ? 'No lines yet' : 'Lines (${_lines.length})',
                  ),
                  const SizedBox(height: 6),
                  if (_lines.isEmpty)
                    _EmptyLinesHint(mode: _mode)
                  else
                    for (var i = 0; i < _lines.length; i++) ...[
                      _LineCard(
                        line: _lines[i],
                        onQty: (v) => setState(() => _lines[i].qty = v),
                        onRate: (v) => setState(() => _lines[i].rate = v),
                        onMap: () => _openItemPicker(i),
                        onRemove: () => setState(() => _lines.removeAt(i)),
                      ),
                      if (i < _lines.length - 1) const SizedBox(height: 8),
                    ],
                ],
              ),
            ),
            _SubmitBar(
              total: _totalValue,
              busy: _submitting,
              canSubmit: _canSubmit,
              onSubmit: _submit,
            ),
          ],
        ),
      ),
    );
  }

  // ── Computed ────────────────────────────────────────────────────────────

  double get _totalValue =>
      _lines.fold(0.0, (a, l) => a + l.qty * l.rate);

  bool get _canSubmit {
    if (_submitting) return false;
    if (_warehouseId == null) return false;
    if (_lines.isEmpty) return false;
    // Every line needs a bound itemId and positive qty; rate may be 0
    // (e.g. samples) so we only require non-negative.
    for (final l in _lines) {
      if (l.itemId == null) return false;
      if (l.qty <= 0) return false;
      if (l.rate < 0) return false;
    }
    return true;
  }

  // ── AI extract ──────────────────────────────────────────────────────────

  Future<void> _runExtractor() async {
    final file = await _pickInvoiceFile();
    if (file == null) return;
    setState(() => _extracting = true);
    try {
      final result = await inventoryRepo.extractGrnInvoice(file);
      if (!mounted) return;
      setState(() {
        _vendorName = result.vendorName;
        _invoiceNumber = result.invoiceNumber;
        _lines
          ..clear()
          ..addAll(result.lines.map(_DraftLine.fromExtracted));
      });
      final unmatched = _lines.where((l) => l.itemId == null).length;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(unmatched == 0
              ? 'Extracted ${_lines.length} line(s). Review and post.'
              : '$unmatched of ${_lines.length} need an item — tap to map.'),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('AI extract failed: $e\nSwitch to Manual entry.'),
          duration: const Duration(seconds: 4),
        ),
      );
      setState(() => _mode = 'manual');
    } finally {
      if (mounted) setState(() => _extracting = false);
    }
  }

  /// Camera first (most common — godown floor snaps the slip), then a
  /// gallery / PDF fallback in the same sheet so the user picks once.
  Future<File?> _pickInvoiceFile() async {
    final source = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => const _SourceSheet(),
    );
    if (source == null) return null;
    if (source == 'camera' || source == 'gallery') {
      final x = await ImagePicker().pickImage(
        source: source == 'camera' ? ImageSource.camera : ImageSource.gallery,
        imageQuality: 85,
        maxWidth: 2400,
      );
      if (x == null) return null;
      return File(x.path);
    }
    // PDF / image via file picker for the "share a digital invoice" flow.
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['pdf', 'jpg', 'jpeg', 'png'],
    );
    final path = result?.files.firstOrNull?.path;
    return path == null ? null : File(path);
  }

  // ── Manual / picker ─────────────────────────────────────────────────────

  void _addPickedItem(InvItem item) {
    setState(() {
      _lines.add(_DraftLine(
        itemId: item.id,
        itemName: item.name,
        itemSku: item.sku,
        itemUnit: item.unit,
        rawName: item.name,
        qty: 1,
        rate: 0,
        matchType: 'manual',
      ));
    });
  }

  Future<void> _openItemPicker(int index) async {
    final picked = await showModalBottomSheet<InvItem>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _ItemPickerSheet(
        prefill: _lines[index].rawName,
      ),
    );
    if (picked == null) return;
    setState(() {
      _lines[index]
        ..itemId = picked.id
        ..itemName = picked.name
        ..itemSku = picked.sku
        ..itemUnit = picked.unit
        ..matchType = 'manual';
    });
  }

  // ── Submit ──────────────────────────────────────────────────────────────

  Future<void> _submit() async {
    if (!_canSubmit) return;
    setState(() => _submitting = true);
    try {
      final today = DateTime.now().toIso8601String().substring(0, 10);
      final grn = await inventoryRepo.createGrn(
        warehouseId: _warehouseId!,
        receivedDate: today,
        lines: _lines
            .map((l) => InvGrnLineInput(
                  itemId: l.itemId!,
                  qty: l.qty,
                  unitRate: l.rate,
                ))
            .toList(),
      );
      await inventoryRepo.postGrn(grn.id);
      if (!mounted) return;
      // Refresh list + dashboard so the new GRN appears immediately.
      ref.invalidate(invGrnListProvider(null));
      ref.invalidate(invKpisProvider);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('GRN ${grn.grnNo} posted')),
      );
      context.pop();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed: $e')),
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }
}

// ── Draft line model ────────────────────────────────────────────────────

/// Mutable in-memory line. Built either from an AI extraction or from a
/// manual item pick. Only `itemId == null` lines block submit.
class _DraftLine {
  String? itemId;
  String itemName;
  String? itemSku;
  String? itemUnit;
  String rawName;
  double qty;
  double rate;
  String? matchType;
  _DraftLine({
    required this.itemId,
    required this.itemName,
    required this.itemSku,
    required this.itemUnit,
    required this.rawName,
    required this.qty,
    required this.rate,
    required this.matchType,
  });
  factory _DraftLine.fromExtracted(InvGrnExtractedLine e) => _DraftLine(
        itemId: e.itemId,
        itemName: e.itemName,
        itemSku: e.itemSku,
        itemUnit: e.itemUnit,
        rawName: e.rawName,
        qty: e.qty,
        rate: e.unitRate,
        matchType: e.matchType,
      );
}

// ── Sub-widgets ─────────────────────────────────────────────────────────

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.label);
  final String label;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Text(
        label.toUpperCase(),
        style: RunqText.label.copyWith(color: t.muted, letterSpacing: 0.5),
      ),
    );
  }
}

class _ModeToggle extends StatelessWidget {
  const _ModeToggle({required this.mode, required this.onChange});
  final String mode;
  final ValueChanged<String> onChange;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    Widget tab(String value, String label, IconData icon) {
      final active = value == mode;
      return Expanded(
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: () => onChange(value),
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 10),
            decoration: BoxDecoration(
              color: active ? InvColors.brand(context) : Colors.transparent,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(icon, size: 16, color: active ? Colors.white : t.muted),
                const SizedBox(width: 6),
                Text(label,
                    style: RunqText.caption.copyWith(
                      color: active ? Colors.white : t.muted,
                      fontWeight: FontWeight.w600,
                    )),
              ],
            ),
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: t.bgWarmer,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(children: [
        tab('scan', 'Scan invoice', Icons.document_scanner_outlined),
        tab('manual', 'Manual entry', Icons.edit_outlined),
      ]),
    );
  }
}

class _ScanTile extends StatelessWidget {
  const _ScanTile({required this.busy, required this.onPick});
  final bool busy;
  final VoidCallback onPick;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InvCard(
      onTap: busy ? null : onPick,
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          Container(
            width: 44, height: 44,
            decoration: BoxDecoration(
              color: InvColors.amberSubtle,
              borderRadius: BorderRadius.circular(10),
            ),
            child: busy
                ? const Padding(
                    padding: EdgeInsets.all(10),
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Icon(Icons.auto_awesome,
                    color: InvColors.amberDeep, size: 22),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(busy ? 'Reading invoice…' : 'Scan invoice with AI',
                    style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 14)),
                const SizedBox(height: 2),
                Text(
                  busy
                      ? 'Extracting items, qty, and prices'
                      : 'Snap a photo or pick a PDF — AI fills the lines',
                  style: RunqText.caption.copyWith(color: t.muted),
                ),
              ],
            ),
          ),
          if (!busy)
            Icon(Icons.chevron_right, color: t.muted2),
        ],
      ),
    );
  }
}

class _ExtractedHeader extends StatelessWidget {
  const _ExtractedHeader({required this.vendor, required this.invoiceNo});
  final String? vendor;
  final String? invoiceNo;
  @override
  Widget build(BuildContext context) {
    final bits = [
      if (vendor != null && vendor!.isNotEmpty) vendor!,
      if (invoiceNo != null && invoiceNo!.isNotEmpty) 'Invoice $invoiceNo',
    ];
    if (bits.isEmpty) return const SizedBox.shrink();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: InvColors.amberSubtle,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          Icon(Icons.receipt_long_outlined,
              size: 16, color: InvColors.amberDeep),
          const SizedBox(width: 8),
          Expanded(
            child: Text(bits.join(' · '),
                style: RunqText.caption.copyWith(color: InvColors.amberDeep),
                maxLines: 1, overflow: TextOverflow.ellipsis),
          ),
          Text('AI extracted',
              style: RunqText.micro.copyWith(
                color: InvColors.amberDeep, letterSpacing: 0.3,
              )),
          Icon(Icons.auto_awesome, size: 12, color: InvColors.amberDeep),
        ],
      ),
    );
  }
}

class _ManualEntryPanel extends StatefulWidget {
  const _ManualEntryPanel({required this.onPicked});
  final ValueChanged<InvItem> onPicked;
  @override
  State<_ManualEntryPanel> createState() => _ManualEntryPanelState();
}

class _ManualEntryPanelState extends State<_ManualEntryPanel> {
  final _barcodeCtrl = TextEditingController();
  bool _looking = false;

  @override
  void dispose() {
    _barcodeCtrl.dispose();
    super.dispose();
  }

  Future<void> _lookup() async {
    final code = _barcodeCtrl.text.trim();
    if (code.isEmpty) return;
    setState(() => _looking = true);
    try {
      final item = await inventoryRepo.findByBarcode(code);
      if (!mounted) return;
      if (item == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No item matched that barcode')),
        );
      } else {
        widget.onPicked(item);
        _barcodeCtrl.clear();
      }
    } finally {
      if (mounted) setState(() => _looking = false);
    }
  }

  Future<void> _search() async {
    final picked = await showModalBottomSheet<InvItem>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const _ItemPickerSheet(prefill: ''),
    );
    if (picked != null) widget.onPicked(picked);
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InvCard(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TextField(
            controller: _barcodeCtrl,
            textInputAction: TextInputAction.search,
            onSubmitted: (_) => _lookup(),
            style: RunqText.body.copyWith(color: t.ink, fontSize: 14),
            decoration: InputDecoration(
              hintText: 'Scan or type barcode',
              hintStyle: RunqText.body.copyWith(color: t.muted2, fontSize: 14),
              filled: true,
              fillColor: t.surface,
              isDense: true,
              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              suffixIcon: _looking
                  ? const Padding(
                      padding: EdgeInsets.all(10),
                      child: SizedBox(
                        width: 14, height: 14,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                    )
                  : IconButton(
                      icon: Icon(Icons.qr_code_scanner,
                          color: InvColors.brand(context)),
                      onPressed: _lookup,
                    ),
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
          ),
          const SizedBox(height: 8),
          InkWell(
            onTap: _search,
            borderRadius: BorderRadius.circular(8),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
              child: Row(
                children: [
                  Icon(Icons.search, size: 16, color: InvColors.brand(context)),
                  const SizedBox(width: 6),
                  Text('Search catalog by name / SKU',
                      style: RunqText.caption.copyWith(
                        color: InvColors.brand(context),
                        fontWeight: FontWeight.w600,
                      )),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyLinesHint extends StatelessWidget {
  const _EmptyLinesHint({required this.mode});
  final String mode;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: t.bgWarmer,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        mode == 'scan'
            ? 'Tap "Scan invoice with AI" above to extract items from a photo or PDF.'
            : 'Scan a barcode or search the catalog to add items.',
        style: RunqText.caption.copyWith(color: t.muted),
      ),
    );
  }
}

class _LineCard extends StatelessWidget {
  const _LineCard({
    required this.line,
    required this.onQty,
    required this.onRate,
    required this.onMap,
    required this.onRemove,
  });
  final _DraftLine line;
  final ValueChanged<double> onQty;
  final ValueChanged<double> onRate;
  final VoidCallback onMap;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final unmatched = line.itemId == null;
    final fuzzy = line.matchType == 'fuzzy';
    return InvCard(
      padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      line.itemName.isEmpty ? line.rawName : line.itemName,
                      style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 14),
                      maxLines: 2, overflow: TextOverflow.ellipsis,
                    ),
                    if (line.rawName.isNotEmpty &&
                        line.rawName != line.itemName) ...[
                      const SizedBox(height: 1),
                      Text('on invoice: ${line.rawName}',
                          style: RunqText.micro.copyWith(color: t.muted2)),
                    ],
                    if (unmatched || fuzzy) ...[
                      const SizedBox(height: 4),
                      _MatchBadge(unmatched: unmatched, onMap: onMap),
                    ],
                  ],
                ),
              ),
              IconButton(
                icon: Icon(Icons.close, size: 18, color: t.muted),
                onPressed: onRemove,
                splashRadius: 18,
                visualDensity: VisualDensity.compact,
              ),
            ],
          ),
          const SizedBox(height: 6),
          Row(children: [
            Expanded(
              child: _MiniNumberField(
                label: 'Qty${line.itemUnit == null ? '' : ' (${line.itemUnit})'}',
                value: line.qty,
                onChanged: onQty,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _MiniNumberField(
                label: 'Rate (₹)',
                value: line.rate,
                onChanged: onRate,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text('LINE TOTAL',
                      style: RunqText.micro.copyWith(
                        color: t.muted2, letterSpacing: 0.3,
                      )),
                  const SizedBox(height: 4),
                  Text(compactINR(line.qty * line.rate),
                      style: RunqText.bodyStrong.copyWith(
                        color: t.ink, fontSize: 14,
                      )),
                ],
              ),
            ),
          ]),
        ],
      ),
    );
  }
}

class _MatchBadge extends StatelessWidget {
  const _MatchBadge({required this.unmatched, required this.onMap});
  final bool unmatched;
  final VoidCallback onMap;
  @override
  Widget build(BuildContext context) {
    final bg = unmatched ? InvColors.errorBg : InvColors.amberSubtle;
    final fg = unmatched ? InvColors.error : InvColors.amberDeep;
    final label = unmatched ? 'Map item →' : 'Verify match →';
    return InkWell(
      onTap: onMap,
      borderRadius: BorderRadius.circular(6),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: bg, borderRadius: BorderRadius.circular(6),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              unmatched ? Icons.error_outline : Icons.help_outline,
              size: 12, color: fg,
            ),
            const SizedBox(width: 4),
            Text(label,
                style: RunqText.micro.copyWith(
                  color: fg, letterSpacing: 0.3, fontWeight: FontWeight.w600,
                )),
          ],
        ),
      ),
    );
  }
}

class _MiniNumberField extends StatefulWidget {
  const _MiniNumberField({
    required this.label,
    required this.value,
    required this.onChanged,
  });
  final String label;
  final double value;
  final ValueChanged<double> onChanged;
  @override
  State<_MiniNumberField> createState() => _MiniNumberFieldState();
}

class _MiniNumberFieldState extends State<_MiniNumberField> {
  late final TextEditingController _ctrl;
  @override
  void initState() {
    super.initState();
    _ctrl = TextEditingController(text: _format(widget.value));
  }

  @override
  void didUpdateWidget(_MiniNumberField old) {
    super.didUpdateWidget(old);
    // Re-sync only when the external value diverges from what the user
    // typed (e.g. after a remap or fresh extract). Avoids cursor jumps.
    final parsed = double.tryParse(_ctrl.text) ?? 0;
    if ((parsed - widget.value).abs() > 0.0001) {
      _ctrl.text = _format(widget.value);
    }
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  static String _format(double v) =>
      v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(2);

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(widget.label.toUpperCase(),
            style: RunqText.micro.copyWith(color: t.muted2, letterSpacing: 0.3)),
        const SizedBox(height: 4),
        TextField(
          controller: _ctrl,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          style: RunqText.body.copyWith(color: t.ink, fontSize: 14),
          onChanged: (v) => widget.onChanged(double.tryParse(v) ?? 0),
          decoration: InputDecoration(
            isDense: true,
            contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
            filled: true,
            fillColor: t.bgWarmer,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: BorderSide(color: t.hairline),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: BorderSide(color: t.hairline),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: BorderSide(color: InvColors.brand(context), width: 1.2),
            ),
          ),
        ),
      ],
    );
  }
}

class _SubmitBar extends StatelessWidget {
  const _SubmitBar({
    required this.total,
    required this.busy,
    required this.canSubmit,
    required this.onSubmit,
  });
  final double total;
  final bool busy;
  final bool canSubmit;
  final VoidCallback onSubmit;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 14),
      decoration: BoxDecoration(
        color: t.surface,
        border: Border(top: BorderSide(color: t.hairline)),
      ),
      child: Row(
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('TOTAL',
                  style: RunqText.micro.copyWith(
                    color: t.muted2, letterSpacing: 0.3,
                  )),
              const SizedBox(height: 2),
              Text(compactINR(total),
                  style: RunqText.h3.copyWith(color: t.ink)),
            ],
          ),
          const Spacer(),
          SizedBox(
            width: 200,
            child: InvPrimaryButton(
              label: 'Receive + Post',
              icon: Icons.check_circle_outline,
              busy: busy,
              onTap: canSubmit ? onSubmit : null,
            ),
          ),
        ],
      ),
    );
  }
}

// ── Source picker (camera / gallery / PDF) ──────────────────────────────

class _SourceSheet extends StatelessWidget {
  const _SourceSheet();
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    Widget tile(IconData i, String label, String sub, VoidCallback onTap) =>
        ListTile(
          leading: Icon(i, color: InvColors.brand(context)),
          title: Text(label, style: RunqText.bodyStrong.copyWith(color: t.ink)),
          subtitle: Text(sub, style: RunqText.caption.copyWith(color: t.muted)),
          onTap: onTap,
        );
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 10),
            Container(
              width: 36, height: 4,
              decoration: BoxDecoration(
                color: t.hairline, borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 8),
            tile(Icons.camera_alt_outlined, 'Take photo',
                'Snap the invoice with the camera',
                () => Navigator.of(context).pop('camera')),
            tile(Icons.photo_outlined, 'Pick from gallery',
                'Use an existing photo',
                () => Navigator.of(context).pop('gallery')),
            tile(Icons.picture_as_pdf_outlined, 'Choose PDF or image',
                'For digital invoices shared by the vendor',
                () => Navigator.of(context).pop('file')),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }
}

// ── Item picker sheet ────────────────────────────────────────────────────

class _ItemPickerSheet extends StatefulWidget {
  const _ItemPickerSheet({required this.prefill});
  final String prefill;
  @override
  State<_ItemPickerSheet> createState() => _ItemPickerSheetState();
}

class _ItemPickerSheetState extends State<_ItemPickerSheet> {
  late final TextEditingController _ctrl;
  List<InvItem> _results = [];
  bool _loading = false;
  String _lastQuery = '';
  // GRN receives supplier deliveries, almost always raw materials or
  // packaging — default the bucket strip to Inputs.
  static const _preferredGroup = classGroupInputs;
  String? _classGroup;
  bool _userPickedGroup = false;

  @override
  void initState() {
    super.initState();
    _ctrl = TextEditingController(text: widget.prefill);
    _runSearch(widget.prefill);
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _runSearch(String q) async {
    _lastQuery = q;
    setState(() => _loading = true);
    try {
      final hits = await inventoryRepo.searchItems(q);
      // Drop stale responses if the user kept typing.
      if (!mounted || q != _lastQuery) return;
      setState(() => _results = hits);
    } finally {
      if (mounted && q == _lastQuery) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final insets = MediaQuery.of(context).viewInsets;
    return DraggableScrollableSheet(
      initialChildSize: 0.7,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      expand: false,
      builder: (_, scrollCtrl) => Container(
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        ),
        padding: EdgeInsets.only(bottom: insets.bottom),
        child: Column(
          children: [
            const SizedBox(height: 10),
            Container(
              width: 36, height: 4,
              decoration: BoxDecoration(
                color: t.hairline, borderRadius: BorderRadius.circular(2),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: Row(children: [
                Expanded(
                  child: Text('Pick item',
                      style: RunqText.h3.copyWith(color: t.ink)),
                ),
                IconButton(
                  icon: Icon(Icons.close, size: 18, color: t.muted),
                  onPressed: () => Navigator.of(context).pop(),
                  splashRadius: 18,
                ),
              ]),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: TextField(
                controller: _ctrl,
                autofocus: widget.prefill.isEmpty,
                onChanged: _runSearch,
                style: RunqText.body.copyWith(color: t.ink, fontSize: 14),
                decoration: InputDecoration(
                  hintText: 'Search by name or SKU',
                  hintStyle: RunqText.body.copyWith(color: t.muted2, fontSize: 14),
                  prefixIcon: Icon(Icons.search, color: t.muted),
                  filled: true,
                  fillColor: t.bgWarmer,
                  isDense: true,
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
              ),
            ),
            const SizedBox(height: 8),
            // Bucket strip — Inputs by default for GRN. Counts come off the
            // current search hits; user can override via tap. Hidden until
            // search results land so the strip doesn't flicker through an
            // empty state on initial open.
            if (_results.isNotEmpty) ...[
              Builder(builder: (_) {
                final counts = bucketCountsFor(_results.map((r) => r.itemClass));
                if (!_userPickedGroup) {
                  final resolved = resolveDefaultClassGroup(_preferredGroup, counts);
                  if (_classGroup != resolved) {
                    WidgetsBinding.instance.addPostFrameCallback((_) {
                      if (mounted) setState(() => _classGroup = resolved);
                    });
                  }
                }
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: InvClassTabs(
                    selected: _classGroup ?? classGroupAll,
                    counts: counts,
                    onChanged: (g) => setState(() {
                      _classGroup = g;
                      _userPickedGroup = true;
                    }),
                  ),
                );
              }),
            ],
            Expanded(
              child: _loading && _results.isEmpty
                  ? const Center(child: CircularProgressIndicator())
                  : Builder(builder: (_) {
                      final active = _classGroup ?? classGroupAll;
                      final shown = active == classGroupAll
                          ? _results
                          : _results
                              .where((r) => classGroupForItemClass(r.itemClass) == active)
                              .toList();
                      if (shown.isEmpty) {
                        return Center(
                          child: Padding(
                            padding: const EdgeInsets.all(20),
                            child: Text(
                              _results.isEmpty
                                  ? 'No items match. Tweak the search or add this item in Masters.'
                                  : 'No items in this group. Try another tab.',
                              textAlign: TextAlign.center,
                              style: RunqText.caption.copyWith(color: t.muted),
                            ),
                          ),
                        );
                      }
                      return ListView.separated(
                        controller: scrollCtrl,
                        itemCount: shown.length,
                        separatorBuilder: (_, __) => Divider(
                          height: 1, color: t.hairlineSoft, thickness: 0.5,
                        ),
                        itemBuilder: (_, i) {
                          final r = shown[i];
                          return ListTile(
                            title: Text(r.name,
                                style: RunqText.bodyStrong
                                    .copyWith(color: t.ink, fontSize: 14)),
                            subtitle: Text(
                              [
                                if ((r.sku ?? '').isNotEmpty) r.sku!,
                                if ((r.unit ?? '').isNotEmpty) r.unit!,
                              ].join(' · '),
                              style: RunqText.caption.copyWith(color: t.muted),
                            ),
                            onTap: () => Navigator.of(context).pop(r),
                          );
                        },
                      );
                    }),
            ),
          ],
        ),
      ),
    );
  }
}
