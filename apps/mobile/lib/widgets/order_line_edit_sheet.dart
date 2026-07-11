import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../api/api_client.dart';
import '../api/models.dart';
import '../api/repos.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../utils/format_inr.dart';
import 'runq_snack.dart';

/// Bottom sheet for editing a single PO draft line:
///   - Pick a matching item from the masters (or clear the match)
///   - Override quantity and rate
///
/// Returns the updated `CustomerOrderDetail` from the server when the user saves so
/// the parent screen can refresh totals + flags. Returns null on cancel.
Future<CustomerOrderDetail?> showOrderLineEditSheet({
  required BuildContext context,
  required String uploadId,
  required CustomerOrderLine line,
}) {
  return showModalBottomSheet<CustomerOrderDetail>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _LineEditSheet(uploadId: uploadId, line: line),
  );
}

class _LineEditSheet extends StatefulWidget {
  final String uploadId;
  final CustomerOrderLine line;
  const _LineEditSheet({required this.uploadId, required this.line});

  @override
  State<_LineEditSheet> createState() => _LineEditSheetState();
}

class _LineEditSheetState extends State<_LineEditSheet> {
  late final TextEditingController _qty;
  late final TextEditingController _rate;
  String? _itemId;
  String? _itemLabel;
  String? _itemUnit;
  // Tracked so the Rate label can read "Rate (incl. GST X%)" — the rate the
  // parser captures on a PO line is the landing price (inclusive of GST), so
  // we surface that GST% to avoid the user double-adding tax on top.
  double? _gstRate;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final l = widget.line;
    _qty = TextEditingController(text: _fmt(l.rawQty));
    _rate = TextEditingController(text: l.effectiveRate > 0 ? _fmt(l.effectiveRate) : '');
    _itemId = l.matchedItemId;
    _itemLabel = l.matchedItemId != null ? l.displayName : null;
    // Prefer the UoM the parser captured from the PO — that's what the user
    // sees on the printed line ("100ml") and what they're editing. The
    // master's pack size (often the canonical 1L SKU) is available via the
    // variant picker if they want to swap.
    _itemUnit = l.rawUom ?? l.displayUom;
    _gstRate = l.effectiveGstRate;
  }

  @override
  void dispose() {
    _qty.dispose();
    _rate.dispose();
    super.dispose();
  }

  String _fmt(double v) {
    if (v == 0) return '';
    return v == v.toInt() ? v.toInt().toString() : v.toStringAsFixed(2);
  }

  Future<void> _pickItem() async {
    final picked = await Navigator.of(context).push<ItemSummary>(
      MaterialPageRoute(
        builder: (_) => const _ItemPickerScreen(),
        fullscreenDialog: true,
      ),
    );
    if (picked == null || !mounted) return;
    setState(() {
      _itemId = picked.id;
      _itemLabel = picked.name;
      // Prefer the master's UoM once an item is chosen — that's the unit
      // the invoice will actually use after approve. Fall back to the PO's
      // raw UoM only if the master doesn't define one.
      _itemUnit = picked.unit ?? widget.line.rawUom;
      // Snap GST to the master's rate — the master is the source of truth
      // once a user explicitly maps a line, so the sheet should reflect
      // what the invoice will actually post under.
      _gstRate = picked.gstRate ?? widget.line.effectiveGstRate;
      // Prefill from the master selling price ("landing price") so the user
      // sees the canonical rate immediately and can adjust if needed. If
      // the master has no price, leave blank — the server will still resolve
      // a rate via price-lists on save.
      final master = picked.defaultSellingPrice;
      _rate.text = (master != null && master > 0) ? _fmt(master) : '';
    });
  }

  /// Open a sheet listing sibling SKUs (same product, different sizes) and
  /// swap the line's matched item to the picked one. Behaves like a slim
  /// "change UoM" affordance — picking "100ml" replaces 1L on the line.
  Future<void> _pickVariant() async {
    final id = _itemId;
    if (id == null) return;
    final picked = await showModalBottomSheet<ItemSummary>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _VariantPickerSheet(itemId: id, currentUnit: _itemUnit),
    );
    if (picked == null || !mounted) return;
    setState(() {
      _itemId = picked.id;
      _itemLabel = picked.name;
      _itemUnit = picked.unit ?? _itemUnit;
      _gstRate = picked.gstRate ?? _gstRate;
      // Repricing on variant swap is intentional — the 1L and 100ml SKUs
      // have different master rates; users editing a line want the new
      // canonical rate, not the old one stuck on the field.
      final master = picked.defaultSellingPrice;
      if (master != null && master > 0) _rate.text = _fmt(master);
    });
  }

  void _clearItem() {
    setState(() {
      _itemId = null;
      _itemLabel = null;
      _itemUnit = widget.line.rawUom;
      _gstRate = widget.line.effectiveGstRate;
    });
  }

  /// Pretty-print a GST rate, dropping trailing `.0` so "5" reads as "5"
  /// and "1.5" stays as "1.5". Mirrors the formatter on the review screen.
  String _fmtGst(double v) =>
      v == v.toInt() ? v.toInt().toString() : v.toStringAsFixed(2).replaceAll(RegExp(r'0+$'), '').replaceAll(RegExp(r'\.$'), '');

  Future<void> _save() async {
    if (_saving) return;
    final qty = double.tryParse(_qty.text.trim());
    final rateText = _rate.text.trim();
    final rate = rateText.isEmpty ? null : double.tryParse(rateText);
    if (qty == null || qty <= 0) {
      showRunqSnack(context, 'Quantity must be a positive number', kind: SnackKind.error);
      return;
    }
    // Blank rate is OK only when an item is picked — the server then resolves
    // the master/landing price via PriceResolverService. Without an item
    // there's nothing to resolve from, so a positive number is required.
    if (rateText.isEmpty) {
      if (_itemId == null) {
        showRunqSnack(context, 'Rate must be a positive number', kind: SnackKind.error);
        return;
      }
    } else if (rate == null || rate <= 0) {
      showRunqSnack(context, 'Rate must be a positive number', kind: SnackKind.error);
      return;
    }

    setState(() => _saving = true);
    try {
      final updated = await orderRepo.updateLine(
        widget.uploadId,
        widget.line.id,
        matchedItemId: _itemId,
        quantity: qty,
        rate: rate,
      );
      if (!mounted) return;
      Navigator.of(context).pop(updated);
    } on ApiException catch (e) {
      if (mounted) showRunqSnack(context, e.message, kind: SnackKind.error);
    } catch (_) {
      if (mounted) showRunqSnack(context, 'Could not save changes', kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final l = widget.line;
    final inset = MediaQuery.of(context).viewInsets.bottom;
    final amount = (double.tryParse(_qty.text) ?? 0) * (double.tryParse(_rate.text) ?? 0);

    return Container(
      decoration: BoxDecoration(
        color: t.bgWarmer,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        border: Border(top: BorderSide(color: t.hairline, width: 0.5)),
      ),
      // Padding for the keyboard goes INSIDE the colored container so the
      // sheet's background extends all the way to the keyboard top with no
      // visible seam against the dimmed scrim.
      padding: EdgeInsets.fromLTRB(20, 12, 20, 16 + inset),
      child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40, height: 4,
                decoration: BoxDecoration(
                  color: t.hairline,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 12),
            Text('Edit line', style: RunqText.h3.copyWith(color: t.ink)),
            const SizedBox(height: 4),
            Text(l.rawDescription,
                maxLines: 2, overflow: TextOverflow.ellipsis,
                style: RunqText.caption.copyWith(color: t.muted)),
            if (l.customerSku != null) ...[
              const SizedBox(height: 4),
              _SkuChip(sku: l.customerSku!),
            ],
            const SizedBox(height: 18),
            _ItemPickerRow(
              label: _itemLabel,
              gstRate: _gstRate,
              gstFmt: _fmtGst,
              onPick: _pickItem,
              onClear: _itemId != null ? _clearItem : null,
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: _Field(
                    controller: _qty,
                    label: 'Quantity',
                    // Inert text suffix when no item is matched (we can't
                    // look up variants without an itemId). Tappable chip
                    // when matched — opens the variant picker.
                    suffix: _itemId == null ? _itemUnit : null,
                    suffixWidget: _itemId == null
                        ? null
                        : _UomTapSuffix(
                            unit: _itemUnit ?? '—',
                            onTap: _pickVariant,
                          ),
                    onChanged: (_) => setState(() {}),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _Field(
                    controller: _rate,
                    // PO line rate is the landing price (GST-inclusive). When
                    // the line has a known GST rate, surface it in the label
                    // so the user doesn't mistakenly add tax on top.
                    label: (_gstRate != null && _gstRate! > 0)
                        ? 'Rate (incl. GST ${_fmtGst(_gstRate!)}%)'
                        : 'Rate',
                    prefix: '₹',
                    hintText: _itemId != null ? 'Master rate' : null,
                    onChanged: (_) => setState(() {}),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Text('Amount', style: RunqText.caption.copyWith(color: t.muted)),
                const Spacer(),
                Text(formatINR(amount),
                    style: RunqText.tabular(size: 16, w: FontWeight.w700)),
              ],
            ),
            const SizedBox(height: 18),
            FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: RunqColors.indigo,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              onPressed: _saving ? null : _save,
              child: _saving
                  ? const SizedBox(
                      width: 18, height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : Text('Save', style: RunqText.bodyStrong.copyWith(color: Colors.white)),
            ),
          ],
        ),
    );
  }
}

class _ItemPickerRow extends StatelessWidget {
  final String? label;
  final double? gstRate;
  final String Function(double) gstFmt;
  final VoidCallback onPick;
  final VoidCallback? onClear;
  const _ItemPickerRow({
    required this.label,
    required this.gstRate,
    required this.gstFmt,
    required this.onPick,
    required this.onClear,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final hasMatch = label != null;
    final showGst = gstRate != null && gstRate! > 0;
    return InkWell(
      onTap: onPick,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: hasMatch ? RunqColors.indigo : t.hairline, width: 0.5),
        ),
        child: Row(
          children: [
            Icon(
              hasMatch ? Icons.inventory_2_rounded : Icons.search_rounded,
              size: 18,
              color: hasMatch ? RunqColors.indigo : t.muted,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                label ?? 'Pick an item from masters',
                maxLines: 1, overflow: TextOverflow.ellipsis,
                style: RunqText.body.copyWith(
                  color: hasMatch ? t.ink : t.muted,
                  fontWeight: hasMatch ? FontWeight.w600 : FontWeight.w400,
                ),
              ),
            ),
            if (showGst) ...[
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: t.hairlineSoft,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  'GST ${gstFmt(gstRate!)}%',
                  style: RunqText.caption.copyWith(
                    color: t.muted,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
            if (onClear != null)
              IconButton(
                onPressed: onClear,
                icon: Icon(Icons.close_rounded, size: 16, color: t.muted),
                visualDensity: VisualDensity.compact,
              ),
          ],
        ),
      ),
    );
  }
}

class _SkuChip extends StatelessWidget {
  final String sku;
  const _SkuChip({required this.sku});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        decoration: BoxDecoration(
          color: t.hairlineSoft,
          borderRadius: BorderRadius.circular(4),
        ),
        child: Text('SKU $sku',
            style: RunqText.micro.copyWith(color: t.muted)),
      ),
    );
  }
}

class _Field extends StatelessWidget {
  final TextEditingController controller;
  final String label;
  final String? prefix, suffix, hintText;
  final Widget? suffixWidget;
  final ValueChanged<String>? onChanged;
  const _Field({required this.controller, required this.label, this.prefix, this.suffix, this.suffixWidget, this.hintText, this.onChanged});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: RunqText.caption.copyWith(color: t.muted)),
        const SizedBox(height: 4),
        TextField(
          controller: controller,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
          onChanged: onChanged,
          decoration: InputDecoration(
            isDense: true,
            filled: true,
            fillColor: t.inputFill,
            prefixText: prefix,
            suffixText: suffixWidget == null ? suffix : null,
            suffixIcon: suffixWidget,
            suffixIconConstraints: const BoxConstraints(minWidth: 0, minHeight: 0),
            hintText: hintText,
            hintStyle: RunqText.body.copyWith(color: t.muted),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide(color: t.hairline, width: 0.5),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide(color: t.hairline, width: 0.5),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: const BorderSide(color: RunqColors.indigo, width: 1),
            ),
            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          ),
        ),
      ],
    );
  }
}

// ─── Item picker screen ──────────────────────────────────────────────────

class _ItemPickerScreen extends StatefulWidget {
  const _ItemPickerScreen();

  @override
  State<_ItemPickerScreen> createState() => _ItemPickerScreenState();
}

class _ItemPickerScreenState extends State<_ItemPickerScreen> {
  final _ctrl = TextEditingController();
  Timer? _debounce;
  List<ItemSummary> _results = const [];
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _runQuery('');
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _ctrl.dispose();
    super.dispose();
  }

  void _onChanged(String q) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 250), () => _runQuery(q));
  }

  Future<void> _runQuery(String q) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await orderRepo.searchItems(q);
      if (!mounted) return;
      setState(() {
        _results = res;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Could not load items';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);

    return Scaffold(
      backgroundColor: t.bgWarmer,
      appBar: AppBar(
        title: const Text('Map to product'),
        leading: IconButton(
          icon: const Icon(Icons.close_rounded),
          onPressed: () => Navigator.of(context).pop(),
        ),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
          child: Column(
            children: [
              TextField(
                controller: _ctrl,
                autofocus: true,
                onChanged: _onChanged,
                style: RunqText.body.copyWith(color: t.ink),
                decoration: InputDecoration(
                  hintText: 'Search by name or SKU',
                  hintStyle: RunqText.body.copyWith(color: t.muted2),
                  prefixIcon: Icon(Icons.search_rounded, size: 18, color: t.muted),
                  prefixIconConstraints: const BoxConstraints(minWidth: 36, minHeight: 36),
                  suffixIcon: _ctrl.text.isEmpty
                      ? null
                      : IconButton(
                          visualDensity: VisualDensity.compact,
                          padding: EdgeInsets.zero,
                          constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
                          icon: Icon(Icons.close_rounded, size: 16, color: t.muted),
                          onPressed: () {
                            _ctrl.clear();
                            _onChanged('');
                            setState(() {});
                          },
                        ),
                  isDense: true,
                  filled: true,
                  fillColor: t.inputFill,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: BorderSide(color: t.hairline, width: 0.5),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: BorderSide(color: t.hairline, width: 0.5),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: const BorderSide(color: RunqColors.indigo, width: 1),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Expanded(child: _resultsBody(t)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _resultsBody(RunqTokens t) {
    if (_loading && _results.isEmpty) {
      return Center(child: CircularProgressIndicator(color: RT(context).brand));
    }
    if (_error != null) {
      return Center(child: Text(_error!, style: RunqText.body.copyWith(color: t.muted)));
    }
    if (_results.isEmpty) {
      final isQuery = _ctrl.text.trim().isNotEmpty;
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 32),
            Icon(Icons.inventory_2_outlined, size: 36, color: t.muted2),
            const SizedBox(height: 10),
            Text(
              isQuery ? 'No matching items' : 'No items in your masters yet',
              textAlign: TextAlign.center,
              style: RunqText.bodyStrong.copyWith(color: t.ink),
            ),
            if (isQuery) ...[
              const SizedBox(height: 4),
              Text(
                'Try fewer words, the SKU code, or a partial name.',
                textAlign: TextAlign.center,
                style: RunqText.caption.copyWith(color: t.muted),
              ),
              const SizedBox(height: 12),
              TextButton(
                onPressed: () {
                  _ctrl.clear();
                  _runQuery('');
                  setState(() {});
                },
                style: TextButton.styleFrom(visualDensity: VisualDensity.compact),
                child: const Text('Clear search & browse all'),
              ),
            ],
          ],
        ),
      );
    }
    return ListView.separated(
      // Drag-to-dismiss the search keyboard so the user can see more
      // results without losing the typed query — matches the rest of the
      // app's input ergonomics on long lists.
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      itemCount: _results.length,
      separatorBuilder: (_, __) => Divider(height: 1, thickness: 0.5, color: t.hairlineSoft),
      itemBuilder: (_, i) {
        final it = _results[i];
        final meta = [
          if (it.sku.isNotEmpty) it.sku,
          if (it.unit != null && it.unit!.isNotEmpty) 'per ${it.unit}',
        ].join(' · ');
        return InkWell(
          onTap: () => Navigator.of(context).pop(it),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(it.name,
                          maxLines: 1, overflow: TextOverflow.ellipsis,
                          style: RunqText.body.copyWith(color: t.ink, fontWeight: FontWeight.w600)),
                      if (meta.isNotEmpty) ...[
                        const SizedBox(height: 2),
                        Text(meta,
                            style: RunqText.caption.copyWith(color: t.muted)),
                      ],
                    ],
                  ),
                ),
                Icon(Icons.chevron_right_rounded, size: 18, color: t.muted2),
              ],
            ),
          ),
        );
      },
    );
  }
}

/// Tappable suffix shown inside the Quantity field when an item is matched.
/// Displays the current UoM and opens the variant picker — visually mimics
/// the plain `suffixText` look so the field doesn't grow taller.
class _UomTapSuffix extends StatelessWidget {
  final String unit;
  final VoidCallback onTap;
  const _UomTapSuffix({required this.unit, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(6),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                unit,
                style: RunqText.bodyStrong.copyWith(
                  color: RunqColors.indigo,
                ),
              ),
              const SizedBox(width: 2),
              Icon(Icons.expand_more_rounded, size: 16, color: RunqColors.indigo),
            ],
          ),
        ),
      ),
    );
  }
}

/// Bottom sheet listing sibling SKUs of `itemId` (same product, different
/// sizes). Tapping a row pops with the picked ItemSummary so the parent
/// can swap the matched item on the line. Renders an empty state when the
/// product has no other variants.
class _VariantPickerSheet extends StatefulWidget {
  final String itemId;
  final String? currentUnit;
  const _VariantPickerSheet({required this.itemId, required this.currentUnit});

  @override
  State<_VariantPickerSheet> createState() => _VariantPickerSheetState();
}

class _VariantPickerSheetState extends State<_VariantPickerSheet> {
  List<ItemSummary> _variants = const [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final res = await orderRepo.itemVariants(widget.itemId);
      if (!mounted) return;
      setState(() {
        _variants = res;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Could not load variants';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final maxH = MediaQuery.of(context).size.height * 0.65;
    return Container(
      constraints: BoxConstraints(maxHeight: maxH),
      decoration: BoxDecoration(
        color: t.bgWarmer,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        border: Border(top: BorderSide(color: t.hairline, width: 0.5)),
      ),
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 40, height: 4,
              decoration: BoxDecoration(
                color: t.hairline,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 12),
          Text('Change size', style: RunqText.h3.copyWith(color: t.ink)),
          const SizedBox(height: 4),
          Text(
            widget.currentUnit != null ? 'Current: ${widget.currentUnit}' : 'Pick another size',
            style: RunqText.caption.copyWith(color: t.muted),
          ),
          const SizedBox(height: 14),
          Flexible(child: _body(t)),
        ],
      ),
    );
  }

  Widget _body(RunqTokens t) {
    if (_loading) {
      return Padding(
        padding: const EdgeInsets.all(24),
        child: Center(child: CircularProgressIndicator(color: RT(context).brand)),
      );
    }
    if (_error != null) {
      return Padding(
        padding: const EdgeInsets.all(24),
        child: Center(child: Text(_error!, style: RunqText.body.copyWith(color: t.muted))),
      );
    }
    if (_variants.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 24, horizontal: 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.inventory_2_outlined, size: 32, color: t.muted2),
            const SizedBox(height: 8),
            Text(
              'No other sizes for this product',
              textAlign: TextAlign.center,
              style: RunqText.body.copyWith(color: t.ink, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 4),
            Text(
              'Add more variants in the items master, or use "Pick an item" to switch products.',
              textAlign: TextAlign.center,
              style: RunqText.caption.copyWith(color: t.muted),
            ),
          ],
        ),
      );
    }
    return ListView.separated(
      shrinkWrap: true,
      itemCount: _variants.length,
      separatorBuilder: (_, __) => Divider(height: 1, thickness: 0.5, color: t.hairlineSoft),
      itemBuilder: (_, i) {
        final v = _variants[i];
        final unitLabel = (v.unit != null && v.unit!.isNotEmpty) ? v.unit! : '—';
        final priceLabel = (v.defaultSellingPrice != null && v.defaultSellingPrice! > 0)
            ? formatINR(v.defaultSellingPrice!)
            : null;
        return InkWell(
          onTap: () => Navigator.of(context).pop(v),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: RunqColors.indigo.withValues(alpha: 0.10),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    unitLabel,
                    style: RunqText.bodyStrong.copyWith(
                      color: RunqColors.indigo,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    v.name,
                    maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: RunqText.body.copyWith(color: t.ink, fontWeight: FontWeight.w600),
                  ),
                ),
                if (priceLabel != null) ...[
                  const SizedBox(width: 8),
                  Text(priceLabel, style: RunqText.tabular(size: 13, w: FontWeight.w600)),
                ],
                const SizedBox(width: 6),
                Icon(Icons.chevron_right_rounded, size: 18, color: t.muted2),
              ],
            ),
          ),
        );
      },
    );
  }
}
