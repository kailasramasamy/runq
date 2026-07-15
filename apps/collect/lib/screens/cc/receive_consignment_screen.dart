import 'package:flutter/material.dart';
import '../../theme/dhenu_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../api/mp_repo.dart';
import '../../providers/mp_context_provider.dart';
import '../../providers/transfer_providers.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/primary_action.dart';
import '../../widgets/quality_badge.dart';
import '../../utils/friendly_error.dart';

/// Dedicated screen for receiving an in-transit consignment — the receiving
/// node's most critical task. The source's *dispatched* figures are shown
/// read-only, kept visually separate from what the operator *actually measures*
/// on arrival; variance is computed live so discrepancies are obvious. Shared by
/// CC (receiving from VMCCs) and PP (receiving tankers from CCs) via the
/// [sourceName]/[sourceLabel]/[measuredLabel]/[sourceIcon] overrides.
class ReceiveConsignmentScreen extends ConsumerStatefulWidget {
  const ReceiveConsignmentScreen({
    super.key,
    required this.consignment,
    required this.nodeId,
    this.sourceName,
    this.editable = false,
    this.sourceLabel = 'DISPATCHED BY VMCC',
    this.measuredLabel = 'MEASURED AT CC',
    this.sourceIcon = DhenuIcons.store,
  });
  final MpConsignment consignment;
  final String nodeId;
  final String? sourceName;

  /// For an already-received consignment, allow correcting it (only the most
  /// recent receipt is passed editable). Ignored when still in transit.
  final bool editable;

  /// Section label over the read-only dispatched figures.
  final String sourceLabel;

  /// Section label over the operator-measured figures.
  final String measuredLabel;

  /// Leading avatar icon for the source (storefront for VMCC, factory for CC).
  final IconData sourceIcon;

  @override
  ConsumerState<ReceiveConsignmentScreen> createState() => _ReceiveConsignmentScreenState();
}

class _ReceiveConsignmentScreenState extends ConsumerState<ReceiveConsignmentScreen> {
  final _qty = TextEditingController();
  final _fat = TextEditingController();
  final _snf = TextEditingController();
  final _water = TextEditingController();
  bool _saving = false;
  String? _error;

  MpConsignment get c => widget.consignment;

  /// Correcting an already-received consignment (vs first-time receive).
  bool get _isEdit => c.received && widget.editable;

  /// Read-only when received and not flagged editable (older receipts).
  bool get _readonly => c.received && !widget.editable;

  @override
  void initState() {
    super.initState();
    // Pre-fill with the recorded values when correcting an existing receipt.
    if (_isEdit) {
      _qty.text = (c.receiptQty ?? 0).toStringAsFixed(1);
      if (c.receiptFat != null) _fat.text = c.receiptFat!.toStringAsFixed(1);
      if (c.receiptSnf != null) _snf.text = c.receiptSnf!.toStringAsFixed(1);
      if (c.receiptWater != null) _water.text = c.receiptWater!.toStringAsFixed(1);
    }
  }

  @override
  void dispose() {
    _qty.dispose();
    _fat.dispose();
    _snf.dispose();
    _water.dispose();
    super.dispose();
  }

  void _copyDispatch() {
    setState(() {
      _qty.text = (c.dispatchQty ?? 0).toStringAsFixed(1);
      if (c.dispatchFat != null) _fat.text = c.dispatchFat!.toStringAsFixed(1);
      if (c.dispatchSnf != null) _snf.text = c.dispatchSnf!.toStringAsFixed(1);
      if (c.dispatchWater != null) _water.text = c.dispatchWater!.toStringAsFixed(1);
    });
  }

  double? get _qtyVal => double.tryParse(_qty.text);

  Future<void> _save() async {
    final qty = _qtyVal;
    if (qty == null || qty < 0) {
      setState(() => _error = 'Enter the received quantity');
      return;
    }
    setState(() { _saving = true; _error = null; });
    final body = {
      'receiptQty': qty,
      if (double.tryParse(_fat.text) != null) 'receiptFat': double.parse(_fat.text),
      if (double.tryParse(_snf.text) != null) 'receiptSnf': double.parse(_snf.text),
      if (double.tryParse(_water.text) != null) 'receiptWater': double.parse(_water.text),
    };
    try {
      if (_isEdit) {
        await mpRepo.editReceipt(c.id, body);
      } else {
        await mpRepo.receiveConsignment(c.id, body);
      }
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      setState(() { _saving = false; _error = friendlyError(context, e); });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final bands = ref.watch(qualityBandsProvider(widget.nodeId)).valueOrNull ?? QualityBands.empty;
    final ccNodes = ref.watch(nodesByTypeProvider('cc')).value ?? const <MpNode>[];
    final ppNodes = ref.watch(nodesByTypeProvider('pp')).value ?? const <MpNode>[];
    MilkType? milkType;
    for (final n in [...ccNodes, ...ppNodes]) {
      if (n.id == widget.nodeId) { milkType = n.effectiveMilkType; break; }
    }
    return Scaffold(
      backgroundColor: t.surface,
      appBar: AppBar(title: Text(_readonly ? 'Receipt' : _isEdit ? 'Edit receipt' : 'Receive milk')),
      body: SafeArea(
        child: Column(children: [
          Expanded(child: ListView(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.all(DhenuSpacing.screen),
            children: [
              _headerCard(t),
              const SizedBox(height: DhenuSpacing.lg),
              _dispatchCard(t, bands, milkType),
              const SizedBox(height: DhenuSpacing.lg),
              _receiptCard(t, bands, milkType),
              const SizedBox(height: DhenuSpacing.md),
              _varianceLine(t),
              if (_error != null) ...[
                const SizedBox(height: DhenuSpacing.sm),
                Text(_error!, style: DhenuText.caption.copyWith(color: t.gradeC)),
              ],
            ],
          )),
          if (!_readonly)
            Padding(
              padding: const EdgeInsets.all(DhenuSpacing.screen),
              child: PrimaryAction(
                label: _isEdit ? 'Update receipt' : 'Confirm receipt',
                onPressed: _save, loading: _saving),
            ),
        ]),
      ),
    );
  }

  Widget _headerCard(DhenuTokens t) => Row(children: [
        Container(
          width: 44, height: 44,
          decoration: BoxDecoration(color: t.brand.withValues(alpha: 0.10), shape: BoxShape.circle),
          child: Icon(widget.sourceIcon, color: t.brand),
        ),
        const SizedBox(width: DhenuSpacing.md),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(widget.sourceName ?? 'Source', style: DhenuText.h2.copyWith(color: t.ink)),
          const SizedBox(height: 2),
          Text.rich(
            TextSpan(
              style: DhenuText.caption.copyWith(color: t.inkSoft),
              children: [
                TextSpan(text: '${c.consignmentNo} · '),
                if (c.shift != null)
                  WidgetSpan(
                    alignment: PlaceholderAlignment.middle,
                    child: Padding(
                      padding: const EdgeInsets.only(right: 3),
                      child: Icon(c.shift == Shift.am ? DhenuIcons.sun : DhenuIcons.moon,
                          size: 12, color: t.inkSoft),
                    ),
                  ),
                TextSpan(text:
                    '${c.shift == null ? 'Day' : c.shift == Shift.am ? 'AM' : 'PM'} · ${prettyDate(c.collectionDate)}'),
              ],
            ),
          ),
        ])),
      ]);

  // ── Dispatched by VMCC (read-only reference) ──────────────────────────────
  Widget _dispatchCard(DhenuTokens t, QualityBands bands, MilkType? milkType) => DhenuCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Icon(DhenuIcons.truck, size: 16, color: t.inkSoft),
            const SizedBox(width: DhenuSpacing.xs),
            Text(widget.sourceLabel, style: DhenuText.label.copyWith(color: t.inkSoft)),
          ]),
          const SizedBox(height: DhenuSpacing.md),
          Row(children: [
            _readTile(t, 'Quantity', litres(c.dispatchQty ?? 0, unit: true)),
            _readTile(t, 'FAT', c.dispatchFat?.toStringAsFixed(1) ?? '—',
                valueColor: QualityBadge.bandColor(bands, milkType, 'fat', c.dispatchFat, t)),
            _readTile(t, 'SNF', c.dispatchSnf?.toStringAsFixed(1) ?? '—',
                valueColor: QualityBadge.bandColor(bands, milkType, 'snf', c.dispatchSnf, t)),
            if (c.dispatchWater != null)
              _readTile(t, 'Water %', c.dispatchWater!.toStringAsFixed(1)),
          ]),
        ]),
      );

  Widget _readTile(DhenuTokens t, String label, String value, {Color? valueColor}) => Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: DhenuText.caption.copyWith(color: t.inkSoft)),
          const SizedBox(height: 2),
          Text(value, style: DhenuText.number(size: 17, color: valueColor ?? t.ink)),
        ]),
      );

  // ── Measured at CC (the actual recorded data) ─────────────────────────────
  Widget _receiptCard(DhenuTokens t, QualityBands bands, MilkType? milkType) => DhenuCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Icon(DhenuIcons.scale, size: 16, color: t.brand),
            const SizedBox(width: DhenuSpacing.xs),
            Text(widget.measuredLabel, style: DhenuText.label.copyWith(color: t.brand)),
            const Spacer(),
            if (!_readonly)
              TextButton(
                onPressed: _copyDispatch,
                style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(0, 0)),
                child: Text('Same as dispatched', style: DhenuText.caption.copyWith(color: t.brand)),
              ),
          ]),
          const SizedBox(height: DhenuSpacing.md),
          if (_readonly)
            Row(children: [
              _readTile(t, 'Quantity', litres(c.receiptQty ?? 0, unit: true)),
              _readTile(t, 'FAT', c.receiptFat?.toStringAsFixed(1) ?? '—',
                  valueColor: QualityBadge.bandColor(bands, milkType, 'fat', c.receiptFat, t)),
              _readTile(t, 'SNF', c.receiptSnf?.toStringAsFixed(1) ?? '—',
                  valueColor: QualityBadge.bandColor(bands, milkType, 'snf', c.receiptSnf, t)),
              if (c.receiptWater != null)
                _readTile(t, 'Water %', c.receiptWater!.toStringAsFixed(1)),
            ])
          else ...[
            _field(_qty, 'Received quantity (L)', onChanged: () => setState(() {})),
            const SizedBox(height: DhenuSpacing.md),
            Row(children: [
              Expanded(child: _field(_fat, 'FAT %')),
              const SizedBox(width: DhenuSpacing.md),
              Expanded(child: _field(_snf, 'SNF %')),
            ]),
            const SizedBox(height: DhenuSpacing.md),
            _field(_water, 'Water % (optional)'),
          ],
        ]),
      );

  Widget _field(TextEditingController ctrl, String hint, {VoidCallback? onChanged}) => TextField(
        controller: ctrl,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        textCapitalization: TextCapitalization.none,
        onChanged: onChanged == null ? null : (_) => onChanged(),
        decoration: InputDecoration(labelText: hint),
      );

  Widget _varianceLine(DhenuTokens t) {
    final dispatched = c.dispatchQty ?? 0;
    final qty = _readonly ? c.receiptQty : _qtyVal;
    if (qty == null) {
      return Text('Enter received qty to see variance vs dispatch',
          style: DhenuText.caption.copyWith(color: t.inkSoft));
    }
    final diff = qty - dispatched;
    final v = dispatched > 0 ? (diff / dispatched) * 100 : 0.0;
    final color = v.abs() > 2 ? t.gradeC : t.gradeA;
    return Container(
      padding: const EdgeInsets.all(DhenuSpacing.md),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(DhenuRadii.input),
      ),
      child: Row(children: [
        Icon(v.abs() > 2 ? DhenuIcons.warning : DhenuIcons.checkCircle, size: 18, color: color),
        const SizedBox(width: DhenuSpacing.sm),
        Expanded(child: Text('Variance vs dispatch', style: DhenuText.body.copyWith(color: t.ink))),
        Text('${diff >= 0 ? '+' : ''}${diff.toStringAsFixed(1)} L · ${v >= 0 ? '+' : ''}${v.toStringAsFixed(1)}%',
            style: DhenuText.number(size: 15, color: color)),
      ]),
    );
  }
}
