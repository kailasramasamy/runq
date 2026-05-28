// Shared form widgets for the PO create + edit mobile screens.
//
// Both screens compose exactly the same UI primitives so they stay in
// visual lockstep — only the state class differs (fresh vs seeded from
// an existing PO, plus the save endpoint and CTA label).
//
// What lives here:
//   • PoLineRow                   — line-item model (controllers + JSON)
//   • PoVendorCard                — hero card with initial avatar
//   • PoScheduleRow / _DateChip   — two-up date chips with native picker
//   • PoPaymentTermsCard          — preset chips (Net 0 / 15 / 30 / 45 / 60)
//   • PoItemsSection              — count badge + summary cards + Add CTA
//   • PoLineEditorSheet           — modal sheet for add / edit one line
//   • PoTotalsCard / PoNotesCard  — totals + notes cards
//   • PoStickyBar                 — total + cancel + primary save
//   • DottedBorderBox             — public dashed-border helper
//
// Catalog-picker UX is centralised in `catalog_picker_screen.dart`. This
// file calls into the host screen via callbacks for the actual pick.

library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../api/purchase_models.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'pur_colors.dart';
import 'pur_primitives.dart';

String _isoDate(DateTime d) => d.toIso8601String().substring(0, 10);

// ── PoLineRow ─────────────────────────────────────────────────────────────

/// One PO line — wraps the per-field text controllers, derived amount, and
/// JSON serialisation. The host state class owns the list of rows and is
/// responsible for calling [dispose].
class PoLineRow {
  String? catalogItemId;
  final TextEditingController description = TextEditingController();
  final TextEditingController qty = TextEditingController();
  final TextEditingController unitRate = TextEditingController();
  final TextEditingController taxRate = TextEditingController(text: '0');
  final TextEditingController hsn = TextEditingController();
  final TextEditingController uom = TextEditingController();

  PoLineRow();

  /// Seed from an existing PO line — used by the edit screen.
  PoLineRow.fromExisting(PurchaseOrderLine l) {
    catalogItemId = l.catalogItemId;
    description.text = l.description;
    qty.text = _trimZeros(l.qtyOrdered);
    unitRate.text = l.unitRate.toStringAsFixed(2);
    taxRate.text = (l.taxRate ?? 0).toStringAsFixed(
      (l.taxRate ?? 0) % 1 == 0 ? 0 : 2,
    );
    hsn.text = l.hsnSacCode ?? '';
    uom.text = l.uom ?? '';
  }

  static String _trimZeros(double v) {
    if (v == v.truncateToDouble()) return v.toStringAsFixed(0);
    return v
        .toStringAsFixed(3)
        .replaceFirst(RegExp(r'0+$'), '')
        .replaceFirst(RegExp(r'\.$'), '');
  }

  double get amount =>
      (double.tryParse(qty.text) ?? 0) * (double.tryParse(unitRate.text) ?? 0);

  Map<String, dynamic> toJson() {
    final amt = amount;
    final tax = double.tryParse(taxRate.text) ?? 0;
    return {
      'description': description.text.trim(),
      if (catalogItemId != null) 'catalogItemId': catalogItemId,
      if (uom.text.trim().isNotEmpty) 'uom': uom.text.trim(),
      'qtyOrdered': double.tryParse(qty.text) ?? 0,
      'unitRate': double.tryParse(unitRate.text) ?? 0,
      'amount': amt,
      if (hsn.text.trim().isNotEmpty) 'hsnSacCode': hsn.text.trim(),
      'taxRate': tax,
      'taxAmount': (amt * tax / 100).toDouble(),
    };
  }

  void dispose() {
    description.dispose();
    qty.dispose();
    unitRate.dispose();
    taxRate.dispose();
    hsn.dispose();
    uom.dispose();
  }
}

// ── PoVendorCard ──────────────────────────────────────────────────────────

class PoVendorCard extends StatelessWidget {
  final String? name;
  final VoidCallback onTap;
  const PoVendorCard({super.key, required this.name, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final picked = name != null;
    final initial = picked ? name!.trim().substring(0, 1).toUpperCase() : '?';
    return Material(
      color: t.surface,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: t.hairline),
          ),
          child: Row(
            children: [
              Container(
                width: 44, height: 44,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  gradient: picked ? PurColors.heroGradient : null,
                  color: picked ? null : PurColors.violetSubtle,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: picked
                    ? Text(initial,
                        style: RunqText.h3.copyWith(color: Colors.white, fontWeight: FontWeight.w700))
                    : Icon(Icons.storefront_outlined, color: PurColors.brand(context), size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      picked ? 'VENDOR' : 'CHOOSE VENDOR',
                      style: RunqText.micro.copyWith(color: t.muted, letterSpacing: 0.6),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      picked ? name! : 'Required to start',
                      style: RunqText.bodyStrong.copyWith(color: picked ? t.ink : t.muted),
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              Icon(picked ? Icons.swap_horiz_rounded : Icons.chevron_right_rounded,
                  color: t.muted2),
            ],
          ),
        ),
      ),
    );
  }
}

// ── PoScheduleRow ─────────────────────────────────────────────────────────

class PoScheduleRow extends StatelessWidget {
  final DateTime poDate;
  final DateTime? expectedDate;
  final VoidCallback onPickPo;
  final VoidCallback onPickExpected;
  final VoidCallback onClearExpected;
  const PoScheduleRow({
    super.key,
    required this.poDate,
    required this.expectedDate,
    required this.onPickPo,
    required this.onPickExpected,
    required this.onClearExpected,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: PoDateChip(
            label: 'PO date',
            icon: Icons.event_rounded,
            value: prettyShortDate(_isoDate(poDate)),
            onTap: onPickPo,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: PoDateChip(
            label: 'Expected',
            icon: Icons.local_shipping_outlined,
            value: expectedDate == null ? null : prettyShortDate(_isoDate(expectedDate!)),
            placeholder: 'Optional',
            onTap: onPickExpected,
            onClear: expectedDate == null ? null : onClearExpected,
          ),
        ),
      ],
    );
  }
}

/// Single tappable date chip — used by [PoScheduleRow] and by the
/// PO receive screen (which has its own received-date field).
class PoDateChip extends StatelessWidget {
  final String label;
  final IconData icon;
  final String? value;
  final String? placeholder;
  final VoidCallback onTap;
  final VoidCallback? onClear;
  const PoDateChip({
    super.key,
    required this.label,
    required this.icon,
    required this.value,
    required this.onTap,
    this.placeholder,
    this.onClear,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final filled = value != null;
    return Material(
      color: t.surface,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: t.hairline),
          ),
          child: Row(
            children: [
              Icon(icon, size: 18, color: PurColors.brand(context)),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(label.toUpperCase(),
                        style: RunqText.micro.copyWith(color: t.muted, letterSpacing: 0.6)),
                    const SizedBox(height: 1),
                    Text(
                      filled ? value! : (placeholder ?? '—'),
                      style: RunqText.bodyStrong.copyWith(color: filled ? t.ink : t.muted2),
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              if (onClear != null)
                IconButton(
                  onPressed: onClear,
                  icon: Icon(Icons.close_rounded, size: 16, color: t.muted2),
                  visualDensity: VisualDensity.compact,
                  constraints: const BoxConstraints.tightFor(width: 28, height: 28),
                  padding: EdgeInsets.zero,
                ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── PoPaymentTermsCard ────────────────────────────────────────────────────

class PoPaymentTermsCard extends StatelessWidget {
  final List<String> presets;
  final String? selected;
  final ValueChanged<String?> onSelect;
  const PoPaymentTermsCard({
    super.key,
    required this.presets,
    required this.selected,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return PurCard(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('PAYMENT TERMS',
              style: RunqText.micro.copyWith(color: t.muted, letterSpacing: 0.6)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final p in presets)
                PurFilterPill(
                  label: p,
                  active: selected == p,
                  onTap: () => onSelect(selected == p ? null : p),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

// ── PoItemsSection ────────────────────────────────────────────────────────

class PoItemsSection extends StatelessWidget {
  final List<PoLineRow> lines;
  final VoidCallback onAdd;
  final ValueChanged<PoLineRow> onEdit;
  const PoItemsSection({
    super.key,
    required this.lines,
    required this.onAdd,
    required this.onEdit,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(2, 0, 2, 8),
          child: Row(
            children: [
              Text('ITEMS', style: RunqText.label.copyWith(color: t.muted)),
              if (lines.isNotEmpty) ...[
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1),
                  decoration: BoxDecoration(
                    color: PurColors.violetSubtle,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text('${lines.length}',
                      style: RunqText.micro.copyWith(
                          color: PurColors.brand(context), fontWeight: FontWeight.w700)),
                ),
              ],
            ],
          ),
        ),
        if (lines.isEmpty)
          _AddItemsCta(onTap: onAdd, big: true)
        else ...[
          for (var i = 0; i < lines.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _LineSummaryCard(
                index: i + 1,
                row: lines[i],
                onTap: () => onEdit(lines[i]),
              ),
            ),
          const SizedBox(height: 2),
          _AddItemsCta(onTap: onAdd, big: false),
        ],
      ],
    );
  }
}

class _LineSummaryCard extends StatelessWidget {
  final int index;
  final PoLineRow row;
  final VoidCallback onTap;
  const _LineSummaryCard({
    required this.index,
    required this.row,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = PurColors.brand(context);
    final qty = double.tryParse(row.qty.text) ?? 0;
    final rate = double.tryParse(row.unitRate.text) ?? 0;
    final tax = double.tryParse(row.taxRate.text) ?? 0;
    final desc = row.description.text.trim();
    final hasDetails = qty > 0 && rate > 0;
    return Material(
      color: t.surface,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: t.hairline),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Container(
                width: 24, height: 24,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: PurColors.violetSubtle,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text('$index',
                    style: RunqText.micro.copyWith(
                        color: brand, fontWeight: FontWeight.w700)),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      desc.isEmpty ? 'Untitled item' : desc,
                      style: RunqText.bodyStrong.copyWith(
                          color: desc.isEmpty ? t.muted2 : t.ink),
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                    ),
                    if (hasDetails) ...[
                      const SizedBox(height: 2),
                      Text(
                        '${_qty(qty)}'
                        '${row.uom.text.trim().isEmpty ? '' : ' ${row.uom.text.trim()}'}'
                        ' × ${indianINR(rate, decimals: 2)}'
                        '${tax > 0 ? '  ·  ${tax.toStringAsFixed(tax % 1 == 0 ? 0 : 1)}% tax' : ''}',
                        style: RunqText.caption.copyWith(color: t.muted),
                        maxLines: 1, overflow: TextOverflow.ellipsis,
                      ),
                    ] else ...[
                      const SizedBox(height: 2),
                      Text('Tap to set qty + rate',
                          style: RunqText.caption.copyWith(color: PurColors.orangeAlert)),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    indianINR(row.amount, decimals: 2),
                    style: RunqText.bodyStrong.copyWith(color: t.ink),
                  ),
                  if (row.catalogItemId != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.check_circle_rounded,
                              size: 11, color: PurColors.success),
                          const SizedBox(width: 3),
                          Text('Catalog',
                              style: RunqText.micro.copyWith(
                                  color: PurColors.success,
                                  fontWeight: FontWeight.w600)),
                        ],
                      ),
                    ),
                ],
              ),
              Icon(Icons.chevron_right_rounded, size: 18, color: t.muted2),
            ],
          ),
        ),
      ),
    );
  }

  static String _qty(double v) {
    if (v == v.truncateToDouble()) return v.toStringAsFixed(0);
    return v.toStringAsFixed(3).replaceFirst(RegExp(r'0+$'), '').replaceFirst(RegExp(r'\.$'), '');
  }
}

class _AddItemsCta extends StatelessWidget {
  final VoidCallback onTap;
  final bool big;
  const _AddItemsCta({required this.onTap, required this.big});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = PurColors.brand(context);
    if (big) {
      return SizedBox(
        width: double.infinity,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(14),
          child: DottedBorderBox(
            color: brand.withValues(alpha: 0.55),
            radius: 14,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 28, horizontal: 16),
              child: Column(
                children: [
                  Container(
                    width: 44, height: 44,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: PurColors.violetSubtle,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(Icons.add_shopping_cart_outlined,
                        color: brand, size: 22),
                  ),
                  const SizedBox(height: 10),
                  Text('Add items',
                      style: RunqText.bodyStrong.copyWith(color: t.ink)),
                  const SizedBox(height: 2),
                  Text(
                    'Add items one-by-one from the vendor catalog',
                    textAlign: TextAlign.center,
                    style: RunqText.caption.copyWith(color: t.muted),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }
    return SizedBox(
      width: double.infinity,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: DottedBorderBox(
          color: brand.withValues(alpha: 0.55),
          radius: 12,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.add_rounded, color: brand, size: 18),
                const SizedBox(width: 6),
                Text('Add another item',
                    style: RunqText.bodyStrong.copyWith(color: brand)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Lightweight dashed border — kept inline so we don't pull a new package.
class DottedBorderBox extends StatelessWidget {
  final Widget child;
  final Color color;
  final double radius;
  const DottedBorderBox({
    super.key,
    required this.child,
    required this.color,
    this.radius = 12,
  });

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _DashedRectPainter(color: color, radius: radius),
      child: ClipRRect(borderRadius: BorderRadius.circular(radius), child: child),
    );
  }
}

class _DashedRectPainter extends CustomPainter {
  final Color color;
  final double radius;
  _DashedRectPainter({required this.color, required this.radius});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 1.2
      ..style = PaintingStyle.stroke;
    final rrect = RRect.fromRectAndRadius(
      Offset.zero & size,
      Radius.circular(radius),
    );
    final path = Path()..addRRect(rrect);
    const dashLen = 5.0, gap = 4.0;
    for (final m in path.computeMetrics()) {
      var d = 0.0;
      while (d < m.length) {
        canvas.drawPath(m.extractPath(d, d + dashLen), paint);
        d += dashLen + gap;
      }
    }
  }

  @override
  bool shouldRepaint(covariant _DashedRectPainter old) =>
      old.color != color || old.radius != radius;
}

// ── PoLineEditorSheet ─────────────────────────────────────────────────────

/// Modal sheet for adding / editing a single PO line. Returning `true`
/// from this sheet means "commit"; `false` means "delete this line"
/// (edit mode only); `null` means dismiss (edit-mode keeps mutations,
/// add-mode discards).
class PoLineEditorSheet extends StatefulWidget {
  final PoLineRow row;
  final String? vendorId;
  final bool isNew;
  final Future<void> Function() onPickCatalog;
  const PoLineEditorSheet({
    super.key,
    required this.row,
    required this.vendorId,
    required this.isNew,
    required this.onPickCatalog,
  });

  @override
  State<PoLineEditorSheet> createState() => _PoLineEditorSheetState();
}

class _PoLineEditorSheetState extends State<PoLineEditorSheet> {
  bool _advancedOpen = false;

  bool get _canCommit =>
      widget.row.description.text.trim().isNotEmpty &&
      (double.tryParse(widget.row.qty.text) ?? 0) > 0;

  Future<void> _pickCatalog() async {
    await widget.onPickCatalog();
    if (mounted) setState(() {});
  }

  Future<void> _confirmDelete() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Remove item?'),
        content: const Text('This line will be removed from the PO.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Keep')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: PurColors.error),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    if (ok == true && mounted) Navigator.of(context).pop(false);
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = PurColors.brand(context);
    final r = widget.row;
    final linked = r.catalogItemId != null;
    final vendorPicked = widget.vendorId != null;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 40, height: 4,
                margin: const EdgeInsets.symmetric(vertical: 10),
                decoration: BoxDecoration(
                  color: t.hairline,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 2, 8, 8),
                child: Row(
                  children: [
                    Text(widget.isNew ? 'Add item' : 'Edit item',
                        style: RunqText.h3.copyWith(
                            color: t.ink, fontWeight: FontWeight.w700)),
                    const Spacer(),
                    if (!widget.isNew)
                      IconButton(
                        onPressed: _confirmDelete,
                        icon: Icon(Icons.delete_outline_rounded,
                            color: PurColors.error, size: 20),
                        tooltip: 'Remove item',
                      ),
                    IconButton(
                      onPressed: () => Navigator.of(context).pop(),
                      icon: Icon(Icons.close_rounded, color: t.muted, size: 20),
                    ),
                  ],
                ),
              ),
              Flexible(
                child: SingleChildScrollView(
                  keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Align(
                        alignment: Alignment.centerRight,
                        child: _CatalogChip(
                          linked: linked,
                          enabled: vendorPicked,
                          onTap: vendorPicked ? _pickCatalog : null,
                        ),
                      ),
                      const SizedBox(height: 8),
                      _DescriptionLauncher(
                        text: r.description.text,
                        vendorPicked: vendorPicked,
                        linked: linked,
                        onTap: _pickCatalog,
                      ),
                      const SizedBox(height: 10),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Expanded(
                            child: PoLabelledField(
                              label: 'Qty',
                              controller: r.qty,
                              hint: '0',
                              isNumber: true,
                              onChanged: () => setState(() {}),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: Icon(Icons.close_rounded, size: 14, color: t.muted2),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: PoLabelledField(
                              label: 'Rate',
                              controller: r.unitRate,
                              hint: '0.00',
                              isNumber: true,
                              onChanged: () => setState(() {}),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                        decoration: BoxDecoration(
                          color: PurColors.violetSubtle,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Row(
                          children: [
                            Text('Line total',
                                style: RunqText.caption.copyWith(color: t.muted)),
                            const Spacer(),
                            Text(
                              indianINR(r.amount, decimals: 2),
                              style: RunqText.bodyStrong.copyWith(
                                  color: PurColors.violetDeep,
                                  fontWeight: FontWeight.w700),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 4),
                      InkWell(
                        onTap: () => setState(() => _advancedOpen = !_advancedOpen),
                        borderRadius: BorderRadius.circular(6),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          child: Row(
                            children: [
                              Icon(
                                _advancedOpen
                                    ? Icons.keyboard_arrow_up_rounded
                                    : Icons.keyboard_arrow_down_rounded,
                                size: 18, color: brand,
                              ),
                              const SizedBox(width: 4),
                              Text(
                                _advancedOpen ? 'Hide UOM / Tax / HSN' : 'UOM, Tax %, HSN',
                                style: RunqText.caption.copyWith(
                                    color: brand, fontWeight: FontWeight.w600),
                              ),
                            ],
                          ),
                        ),
                      ),
                      AnimatedSize(
                        duration: const Duration(milliseconds: 180),
                        curve: Curves.easeOut,
                        alignment: Alignment.topCenter,
                        child: _advancedOpen
                            ? Column(
                                children: [
                                  const SizedBox(height: 2),
                                  Row(
                                    children: [
                                      Expanded(
                                        child: PoLabelledField(
                                          label: 'UOM',
                                          controller: r.uom,
                                          hint: 'pcs / kg',
                                          onChanged: () => setState(() {}),
                                        ),
                                      ),
                                      const SizedBox(width: 8),
                                      Expanded(
                                        child: PoLabelledField(
                                          label: 'Tax %',
                                          controller: r.taxRate,
                                          hint: '0',
                                          isNumber: true,
                                          onChanged: () => setState(() {}),
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 8),
                                  PoLabelledField(
                                    label: 'HSN / SAC',
                                    controller: r.hsn,
                                    hint: 'Optional',
                                    onChanged: () => setState(() {}),
                                  ),
                                ],
                              )
                            : const SizedBox.shrink(),
                      ),
                    ],
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                decoration: BoxDecoration(
                  border: Border(top: BorderSide(color: t.hairline)),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: PurPrimaryButton(
                        label: widget.isNew ? 'Add to PO' : 'Save',
                        icon: widget.isNew ? Icons.add_rounded : Icons.check_rounded,
                        onPressed: _canCommit
                            ? () => Navigator.of(context).pop(true)
                            : null,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CatalogChip extends StatelessWidget {
  final bool linked;
  final bool enabled;
  final VoidCallback? onTap;
  const _CatalogChip({required this.linked, required this.enabled, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = PurColors.brand(context);
    final bg = !enabled
        ? t.bgWarm
        : (linked ? PurColors.successBg : PurColors.violetSubtle);
    final fg = !enabled ? t.muted2 : (linked ? PurColors.success : brand);
    return Material(
      color: bg,
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(linked ? Icons.check_circle_rounded : Icons.menu_book_outlined,
                  size: 13, color: fg),
              const SizedBox(width: 4),
              Text(linked ? 'Linked' : 'Catalog',
                  style: RunqText.micro.copyWith(color: fg, fontWeight: FontWeight.w600)),
            ],
          ),
        ),
      ),
    );
  }
}

/// Labelled filled text input used across all PO forms.
class PoLabelledField extends StatelessWidget {
  final String label;
  final TextEditingController controller;
  final String? hint;
  final bool isNumber;
  final bool enabled;
  final int? maxLines;
  final VoidCallback onChanged;
  const PoLabelledField({
    super.key,
    required this.label,
    required this.controller,
    required this.onChanged,
    this.hint,
    this.isNumber = false,
    this.enabled = true,
    this.maxLines = 1,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(label.toUpperCase(),
            style: RunqText.micro.copyWith(color: t.muted, letterSpacing: 0.6)),
        const SizedBox(height: 4),
        TextField(
          controller: controller,
          enabled: enabled,
          maxLines: maxLines,
          onChanged: (_) => onChanged(),
          keyboardType: isNumber
              ? const TextInputType.numberWithOptions(decimal: true)
              : TextInputType.text,
          inputFormatters: isNumber
              ? [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))]
              : null,
          textCapitalization: TextCapitalization.none,
          style: RunqText.body.copyWith(color: t.ink),
          decoration: InputDecoration(
            isDense: true,
            hintText: hint,
            hintStyle: RunqText.body.copyWith(color: t.muted2),
            filled: true,
            fillColor: t.bgWarm,
            contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
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
              borderSide: BorderSide(color: PurColors.brand(context), width: 1.4),
            ),
          ),
        ),
      ],
    );
  }
}

class _DescriptionLauncher extends StatelessWidget {
  final String text;
  final bool vendorPicked;
  final bool linked;
  final VoidCallback onTap;
  const _DescriptionLauncher({
    required this.text,
    required this.vendorPicked,
    required this.linked,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final filled = text.trim().isNotEmpty;
    final brand = PurColors.brand(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text('DESCRIPTION',
            style: RunqText.micro.copyWith(color: t.muted, letterSpacing: 0.6)),
        const SizedBox(height: 4),
        Material(
          color: t.bgWarm,
          borderRadius: BorderRadius.circular(8),
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(8),
            child: Container(
              padding: const EdgeInsets.fromLTRB(10, 12, 10, 12),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: t.hairline),
              ),
              child: Row(
                children: [
                  Icon(
                    linked ? Icons.check_circle_rounded : Icons.menu_book_outlined,
                    size: 16,
                    color: linked ? PurColors.success : brand,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      filled
                          ? text
                          : (vendorPicked
                              ? 'Tap to pick from catalog'
                              : 'Pick vendor first'),
                      style: RunqText.body.copyWith(
                        color: filled ? t.ink : t.muted2,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  Icon(Icons.chevron_right_rounded,
                      size: 18, color: t.muted2),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

// ── PoTotalsCard / PoNotesCard ────────────────────────────────────────────

class PoTotalsCard extends StatelessWidget {
  final double subtotal, tax, total;
  const PoTotalsCard({
    super.key,
    required this.subtotal,
    required this.tax,
    required this.total,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return PurCard(
      child: Column(
        children: [
          _row(t, 'Subtotal', subtotal),
          const SizedBox(height: 4),
          _row(t, 'Tax', tax),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 10),
            child: Container(height: 1, color: t.hairline),
          ),
          Row(
            children: [
              Text('Total', style: RunqText.bodyStrong.copyWith(color: t.ink)),
              const Spacer(),
              Text(
                indianINR(total, decimals: 2),
                style: RunqText.h3.copyWith(
                    color: PurColors.violetDeep, fontWeight: FontWeight.w800),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _row(RunqTokens t, String label, double v) => Row(
        children: [
          Text(label, style: RunqText.body.copyWith(color: t.muted)),
          const Spacer(),
          Text(indianINR(v, decimals: 2),
              style: RunqText.body.copyWith(color: t.ink)),
        ],
      );
}

class PoNotesCard extends StatelessWidget {
  final TextEditingController controller;
  const PoNotesCard({super.key, required this.controller});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return PurCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('NOTES',
              style: RunqText.micro.copyWith(color: t.muted, letterSpacing: 0.6)),
          const SizedBox(height: 8),
          TextField(
            controller: controller,
            textCapitalization: TextCapitalization.sentences,
            maxLines: 3,
            style: RunqText.body.copyWith(color: t.ink),
            decoration: InputDecoration(
              isDense: true,
              hintText: 'Internal notes — not sent to vendor',
              hintStyle: RunqText.body.copyWith(color: t.muted2),
              filled: true,
              fillColor: t.bgWarm,
              contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
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
                borderSide: BorderSide(color: PurColors.brand(context), width: 1.4),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── PoStickyBar ───────────────────────────────────────────────────────────

class PoStickyBar extends StatelessWidget {
  final double total;
  final bool busy;
  final bool enabled;
  final String saveLabel;
  final VoidCallback? onCancel;
  final VoidCallback onSave;
  const PoStickyBar({
    super.key,
    required this.total,
    required this.busy,
    required this.enabled,
    required this.onCancel,
    required this.onSave,
    this.saveLabel = 'Save draft',
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        border: Border(top: BorderSide(color: t.hairline)),
        boxShadow: [
          BoxShadow(color: Colors.black.withValues(alpha: 0.05),
              blurRadius: 12, offset: const Offset(0, -2)),
        ],
      ),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Top row: TOTAL label + amount, both right-aligned and tight.
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              Text('TOTAL',
                  style: RunqText.micro.copyWith(
                      color: t.muted, letterSpacing: 0.6)),
              const SizedBox(width: 8),
              Flexible(
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerRight,
                  child: Text(
                    indianINR(total, decimals: 2),
                    style: RunqText.h3.copyWith(
                        color: t.ink, fontWeight: FontWeight.w800),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          // Bottom row: Cancel + Save side-by-side, equal-weight buttons.
          Row(
            children: [
              if (onCancel != null) ...[
                Expanded(
                  child: OutlinedButton(
                    onPressed: onCancel,
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      side: BorderSide(color: t.hairline),
                      foregroundColor: t.ink,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: Text('Cancel',
                        style: RunqText.bodyStrong.copyWith(color: t.ink)),
                  ),
                ),
                const SizedBox(width: 10),
              ],
              Expanded(
                flex: onCancel == null ? 1 : 2,
                child: PurPrimaryButton(
                  label: saveLabel,
                  icon: Icons.check_rounded,
                  loading: busy,
                  onPressed: enabled ? onSave : null,
                ),
              ),
            ],
          ),
          SizedBox(height: MediaQuery.of(context).padding.bottom),
        ],
      ),
    );
  }
}
