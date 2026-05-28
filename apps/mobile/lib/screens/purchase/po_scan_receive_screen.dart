import 'dart:io';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import '../../api/api_client.dart';
import '../../api/purchase_models.dart';
import '../../api/purchase_repo.dart';
import '../../providers/purchase_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart';
import '../inventory/widgets/warehouse_picker.dart' as inv_picker;
import 'widgets/po_form_widgets.dart';
import 'widgets/pur_colors.dart';
import 'widgets/pur_primitives.dart';

/// PP Phase 5 — scan vendor invoice and post a combined GRN + Bill + JE.
/// Vendor numbers are authoritative; PO numbers are kept only for variance
/// reporting (snapshot saved per GRN line).
///
/// Shares form primitives (`PoLabelledField`, `PoDateChip`, `PoStickyBar`,
/// `PoNotesCard`, …) with the create / edit / receive screens so the four
/// feel like one continuous flow.
class PoScanReceiveScreen extends ConsumerStatefulWidget {
  final String poId;
  /// File handed in from share-intake or another caller. When set, the
  /// screen skips the source-picker sheet and runs the scan against this
  /// file immediately on first frame.
  final File? initialFile;
  const PoScanReceiveScreen({super.key, required this.poId, this.initialFile});

  @override
  ConsumerState<PoScanReceiveScreen> createState() => _PoScanReceiveScreenState();
}

class _PoScanReceiveScreenState extends ConsumerState<PoScanReceiveScreen> {
  ScanPreviewResult? _preview;
  bool _scanning = false;
  bool _submitting = false;

  // Receipt
  String? _warehouseId;
  DateTime _receivedDate = DateTime.now();
  final _vehicleCtl = TextEditingController();
  final _lrCtl = TextEditingController();
  final _notesCtl = TextEditingController();

  // Vendor invoice header (editable post-scan)
  final _invNumCtl = TextEditingController();
  DateTime? _invDate;
  DateTime? _dueDate;
  final _subtotalCtl = TextEditingController();
  final _taxAmountCtl = TextEditingController();
  final _totalAmountCtl = TextEditingController();
  bool _isInterState = false;
  bool _reverseCharge = false;

  final List<_LineState> _lines = [];

  @override
  void initState() {
    super.initState();
    final f = widget.initialFile;
    if (f != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _runScan(f);
      });
    }
  }

  @override
  void dispose() {
    _vehicleCtl.dispose();
    _lrCtl.dispose();
    _notesCtl.dispose();
    _invNumCtl.dispose();
    _subtotalCtl.dispose();
    _taxAmountCtl.dispose();
    _totalAmountCtl.dispose();
    for (final l in _lines) {
      l.dispose();
    }
    super.dispose();
  }

  Future<void> _pickDate({required _DateField field}) async {
    DateTime? initial;
    DateTime first = DateTime(2020);
    switch (field) {
      case _DateField.received:
        initial = _receivedDate;
        break;
      case _DateField.invoice:
        initial = _invDate ?? DateTime.now();
        break;
      case _DateField.due:
        initial = _dueDate ?? _invDate ?? DateTime.now();
        first = _invDate ?? first;
        break;
    }
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: first,
      lastDate: DateTime(2100),
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: Theme.of(ctx).colorScheme.copyWith(primary: PurColors.brand(ctx)),
        ),
        child: child!,
      ),
    );
    if (picked == null) return;
    setState(() {
      switch (field) {
        case _DateField.received:
          _receivedDate = picked;
          break;
        case _DateField.invoice:
          _invDate = picked;
          if (_dueDate != null && _dueDate!.isBefore(picked)) _dueDate = null;
          break;
        case _DateField.due:
          _dueDate = picked;
          break;
      }
    });
  }

  Future<void> _pickAndScan() async {
    final source = await showModalBottomSheet<_PickSource>(
      context: context,
      backgroundColor: RT(context).surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (_) => SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 8),
            ListTile(
              leading: const Icon(Icons.camera_alt_outlined),
              title: const Text('Camera'),
              onTap: () => Navigator.pop(context, _PickSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Photos'),
              onTap: () => Navigator.pop(context, _PickSource.gallery),
            ),
            ListTile(
              leading: const Icon(Icons.attach_file_outlined),
              title: const Text('Files (PDF / image)'),
              onTap: () => Navigator.pop(context, _PickSource.files),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (source == null || !mounted) return;
    final file = await _pickFile(source);
    if (file == null || !mounted) return;
    await _runScan(file);
  }

  Future<File?> _pickFile(_PickSource src) async {
    try {
      if (src == _PickSource.files) {
        final result = await FilePicker.platform.pickFiles(
          type: FileType.custom,
          allowedExtensions: const ['pdf', 'png', 'jpg', 'jpeg'],
          allowMultiple: false,
        );
        final path = result?.files.firstOrNull?.path;
        return path == null ? null : File(path);
      }
      final picker = ImagePicker();
      final x = await picker.pickImage(
        source: src == _PickSource.camera ? ImageSource.camera : ImageSource.gallery,
        imageQuality: 85,
      );
      return x == null ? null : File(x.path);
    } catch (e) {
      if (mounted) showRunqSnack(context, 'Could not pick file: $e', kind: SnackKind.error);
      return null;
    }
  }

  Future<void> _runScan(File file) async {
    setState(() => _scanning = true);
    try {
      final preview = await purchaseRepo.scanPreview(widget.poId, file);
      if (!mounted) return;
      setState(() {
        _preview = preview;
        _invNumCtl.text = preview.extracted.invoiceNumber;
        _invDate = DateTime.tryParse(preview.extracted.invoiceDate);
        _dueDate = preview.extracted.dueDate == null
            ? null
            : DateTime.tryParse(preview.extracted.dueDate!);
        _subtotalCtl.text = _fmtNum(preview.extracted.subtotal);
        _taxAmountCtl.text = _fmtNum(preview.extracted.taxAmount);
        _totalAmountCtl.text = _fmtNum(preview.extracted.totalAmount);
        _lines
          ..clear()
          ..addAll(preview.suggestedLines.map(_LineState.fromSuggestion));
      });
    } on ApiException catch (e) {
      if (mounted) showRunqSnack(context, e.message, kind: SnackKind.error);
    } catch (e) {
      if (mounted) showRunqSnack(context, 'Scan failed: $e', kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _scanning = false);
    }
  }

  double get _invoiceTotal => double.tryParse(_totalAmountCtl.text) ?? 0;

  bool get _canSubmit {
    if (_submitting) return false;
    if (_warehouseId == null) return false;
    if (_invNumCtl.text.trim().isEmpty || _invDate == null) return false;
    final hasLine = _lines.any((l) {
      final qty = double.tryParse(l.qty.text) ?? 0;
      return qty > 0 && (l.poLineId != null || l.description.trim().isNotEmpty);
    });
    return hasLine;
  }

  Future<void> _submit() async {
    if (_submitting) return;
    if (_warehouseId == null) {
      showRunqSnack(context, 'Pick a warehouse', kind: SnackKind.error);
      return;
    }
    if (_invNumCtl.text.trim().isEmpty || _invDate == null) {
      showRunqSnack(context, 'Invoice number and date are required', kind: SnackKind.error);
      return;
    }
    final lines = <Map<String, dynamic>>[];
    for (final l in _lines) {
      final qty = double.tryParse(l.qty.text) ?? 0;
      final hasDescription = l.description.trim().isNotEmpty;
      if (qty <= 0 || (!hasDescription && (l.catalogItemId ?? '').isEmpty)) continue;
      final serials = l.serials.text
          .split(RegExp(r'\r?\n')).map((s) => s.trim()).where((s) => s.isNotEmpty).toList();
      lines.add({
        'poLineId': l.poLineId,
        'catalogItemId': l.catalogItemId,
        'qty': qty,
        'unitRate': double.tryParse(l.rate.text) ?? 0,
        if (l.taxRate.text.isNotEmpty) 'taxRate': double.tryParse(l.taxRate.text),
        if (l.hsn.text.trim().isNotEmpty) 'hsnSacCode': l.hsn.text.trim(),
        'description': l.description,
        if (l.batch.text.trim().isNotEmpty) 'batchNo': l.batch.text.trim(),
        if (l.expiry.text.trim().isNotEmpty) 'expiryDate': l.expiry.text.trim(),
        if (serials.isNotEmpty) 'serialNos': serials,
      });
    }
    if (lines.isEmpty) {
      showRunqSnack(context, 'Every row needs qty > 0 and a catalog item', kind: SnackKind.error);
      return;
    }
    if (!lines.any((l) => l['poLineId'] != null)) {
      showRunqSnack(context, 'At least one line must match a PO line', kind: SnackKind.error);
      return;
    }
    final payload = {
      'warehouseId': _warehouseId,
      'receivedDate': _isoDate(_receivedDate),
      if (_vehicleCtl.text.trim().isNotEmpty) 'vehicleNo': _vehicleCtl.text.trim(),
      if (_lrCtl.text.trim().isNotEmpty) 'lrNo': _lrCtl.text.trim(),
      if (_notesCtl.text.trim().isNotEmpty) 'notes': _notesCtl.text.trim(),
      'vendorInvoice': {
        'invoiceNumber': _invNumCtl.text.trim(),
        'invoiceDate': _isoDate(_invDate!),
        if (_dueDate != null) 'dueDate': _isoDate(_dueDate!),
        'subtotal': double.tryParse(_subtotalCtl.text) ?? 0,
        'taxAmount': double.tryParse(_taxAmountCtl.text) ?? 0,
        'totalAmount': double.tryParse(_totalAmountCtl.text) ?? 0,
        'isInterState': _isInterState,
        'reverseCharge': _reverseCharge,
      },
      'lines': lines,
      if (_preview?.extractionId != null) 'extractionId': _preview!.extractionId,
    };
    setState(() => _submitting = true);
    try {
      final result = await purchaseRepo.scanCommit(widget.poId, payload);
      ref.invalidate(purchaseOrderDetailProvider(widget.poId));
      ref.invalidate(purchaseOrderListProvider);
      if (!mounted) return;
      final offNote = result.offPoLineCount > 0 ? ' (${result.offPoLineCount} off-PO)' : '';
      showRunqSnack(context, 'GRN ${result.grnNo} + Bill ${result.billNumber} posted$offNote',
          kind: SnackKind.success);
      context.go('/purchase/pos/${widget.poId}');
    } on ApiException catch (e) {
      if (mounted) showRunqSnack(context, e.message, kind: SnackKind.error);
    } catch (e) {
      if (mounted) showRunqSnack(context, 'Failed to post: $e', kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final hasPreview = _preview != null;
    return Scaffold(
      backgroundColor: t.bgWarm,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            const PurPlainAppBar(title: 'Scan vendor invoice'),
            Expanded(child: hasPreview ? _buildPreviewView(t) : _buildUploadView(t)),
            if (hasPreview)
              PoStickyBar(
                total: _invoiceTotal,
                busy: _submitting,
                enabled: _canSubmit,
                onCancel: _submitting ? null : () => setState(() {
                  _preview = null;
                  _lines
                    ..forEach((l) => l.dispose())
                    ..clear();
                }),
                onSave: _submit,
                saveLabel: 'Post GRN + Bill',
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildUploadView(RunqTokens t) {
    final brand = PurColors.brand(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 64, height: 64,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: PurColors.violetSubtle,
                borderRadius: BorderRadius.circular(18),
              ),
              child: Icon(Icons.document_scanner_outlined, size: 30, color: brand),
            ),
            const SizedBox(height: 14),
            Text(
              _scanning ? 'Processing invoice…' : 'Scan the vendor invoice',
              style: RunqText.bodyStrong.copyWith(color: t.ink),
            ),
            const SizedBox(height: 6),
            Text(
              _scanning
                  ? 'Reading the invoice and matching items to your PO. This can take a few seconds.'
                  : 'Vendor qty + rate are authoritative for inventory and JE. PO numbers are kept for variance reports.',
              style: RunqText.caption.copyWith(color: t.muted),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 20),
            PurPrimaryButton(
              label: _scanning ? 'Processing invoice…' : 'Upload invoice',
              icon: _scanning ? null : Icons.upload_outlined,
              loading: _scanning,
              onPressed: _scanning ? null : _pickAndScan,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPreviewView(RunqTokens t) {
    final p = _preview!;
    final confidencePct = (p.extracted.confidence * 100).round();
    return ListView(
      physics: const BouncingScrollPhysics(),
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
      children: [
        if (p.vendorMismatch) _VendorMismatchBanner(),
        if (p.vendorMismatch) const SizedBox(height: 12),
        _VendorInvoiceCard(
          confidencePct: confidencePct,
          invNumCtl: _invNumCtl,
          invDate: _invDate,
          dueDate: _dueDate,
          subtotalCtl: _subtotalCtl,
          taxAmountCtl: _taxAmountCtl,
          totalAmountCtl: _totalAmountCtl,
          isInterState: _isInterState,
          reverseCharge: _reverseCharge,
          onPickInvDate: () => _pickDate(field: _DateField.invoice),
          onPickDueDate: () => _pickDate(field: _DateField.due),
          onInterState: (v) => setState(() => _isInterState = v),
          onReverseCharge: (v) => setState(() => _reverseCharge = v),
          onChange: () => setState(() {}),
        ),
        const SizedBox(height: 12),
        _ReceiptInfoCard(
          warehouseId: _warehouseId,
          onWarehouse: (v) => setState(() => _warehouseId = v),
          receivedDate: _receivedDate,
          onPickDate: () => _pickDate(field: _DateField.received),
          vehicleCtl: _vehicleCtl,
          lrCtl: _lrCtl,
          onChange: () => setState(() {}),
        ),
        const SizedBox(height: 16),
        _ItemsHeader(count: _lines.length),
        const SizedBox(height: 8),
        for (var i = 0; i < _lines.length; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: _ScanLineCard(
              index: i + 1,
              state: _lines[i],
              onChange: () => setState(() {}),
            ),
          ),
        const SizedBox(height: 4),
        PoNotesCard(controller: _notesCtl),
        const SizedBox(height: 16),
      ],
    );
  }
}

String _isoDate(DateTime d) => d.toIso8601String().substring(0, 10);

/// Format a double for an editable text field — drop the trailing `.0`
/// when the value is whole, keep two decimals otherwise. Avoids the
/// confusing `4280000.0`-style strings the default `.toString()` emits.
String _fmtNum(double v) {
  if (v == v.truncateToDouble()) return v.toStringAsFixed(0);
  return v.toStringAsFixed(2);
}

enum _PickSource { camera, gallery, files }
enum _DateField { received, invoice, due }

// ── Vendor-mismatch banner ────────────────────────────────────────────────

class _VendorMismatchBanner extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: PurColors.orangeAlertBg,
        border: Border.all(color: PurColors.orangeAlert.withValues(alpha: 0.5)),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.warning_amber_rounded, size: 18, color: PurColors.orangeAlert),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'Vendor on the invoice differs from the PO vendor. Verify before posting.',
              style: RunqText.caption.copyWith(color: t.ink),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Vendor invoice card ───────────────────────────────────────────────────

class _VendorInvoiceCard extends StatelessWidget {
  final int confidencePct;
  final TextEditingController invNumCtl;
  final DateTime? invDate;
  final DateTime? dueDate;
  final TextEditingController subtotalCtl;
  final TextEditingController taxAmountCtl;
  final TextEditingController totalAmountCtl;
  final bool isInterState;
  final bool reverseCharge;
  final VoidCallback onPickInvDate;
  final VoidCallback onPickDueDate;
  final ValueChanged<bool> onInterState;
  final ValueChanged<bool> onReverseCharge;
  final VoidCallback onChange;
  const _VendorInvoiceCard({
    required this.confidencePct,
    required this.invNumCtl,
    required this.invDate,
    required this.dueDate,
    required this.subtotalCtl,
    required this.taxAmountCtl,
    required this.totalAmountCtl,
    required this.isInterState,
    required this.reverseCharge,
    required this.onPickInvDate,
    required this.onPickDueDate,
    required this.onInterState,
    required this.onReverseCharge,
    required this.onChange,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return PurCard(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('VENDOR INVOICE',
                  style: RunqText.micro.copyWith(color: t.muted, letterSpacing: 0.6)),
              const Spacer(),
              _AiBadge(pct: confidencePct),
            ],
          ),
          const SizedBox(height: 10),
          PoLabelledField(
            label: 'Invoice #',
            controller: invNumCtl,
            hint: 'Vendor-issued number',
            onChanged: onChange,
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: PoDateChip(
                  label: 'Invoice date',
                  icon: Icons.event_rounded,
                  value: invDate == null ? null : prettyShortDate(_isoDate(invDate!)),
                  placeholder: 'Required',
                  onTap: onPickInvDate,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: PoDateChip(
                  label: 'Due date',
                  icon: Icons.event_available_outlined,
                  value: dueDate == null ? null : prettyShortDate(_isoDate(dueDate!)),
                  placeholder: 'Optional',
                  onTap: onPickDueDate,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          _AmountField(label: 'Subtotal', controller: subtotalCtl, onChanged: onChange),
          const SizedBox(height: 8),
          _AmountField(label: 'Tax', controller: taxAmountCtl, onChanged: onChange),
          const SizedBox(height: 8),
          _AmountField(label: 'Total', controller: totalAmountCtl, onChanged: onChange, emphasised: true),
          const SizedBox(height: 12),
          _ToggleRow(
            label: 'Inter-state supply (IGST)',
            value: isInterState,
            onChanged: onInterState,
          ),
          const SizedBox(height: 4),
          _ToggleRow(
            label: 'Reverse charge',
            value: reverseCharge,
            onChanged: onReverseCharge,
          ),
        ],
      ),
    );
  }
}

/// One-row amount input — label on the left, numeric field on the right
/// taking full available width, and a muted `₹X,XX,XXX.XX` preview underneath
/// so the operator can sanity-check what AI extracted at a glance.
class _AmountField extends StatelessWidget {
  final String label;
  final TextEditingController controller;
  final VoidCallback onChanged;
  final bool emphasised;
  const _AmountField({
    required this.label,
    required this.controller,
    required this.onChanged,
    this.emphasised = false,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final raw = double.tryParse(controller.text) ?? 0;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            SizedBox(
              width: 92,
              child: Text(
                label.toUpperCase(),
                style: RunqText.micro.copyWith(color: t.muted, letterSpacing: 0.6),
              ),
            ),
            Expanded(
              child: TextField(
                controller: controller,
                onChanged: (_) => onChanged(),
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                textAlign: TextAlign.right,
                style: (emphasised ? RunqText.bodyStrong : RunqText.body)
                    .copyWith(color: t.ink),
                decoration: InputDecoration(
                  isDense: true,
                  filled: true,
                  fillColor: t.bgWarm,
                  hintText: '0',
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
            ),
          ],
        ),
        Padding(
          padding: const EdgeInsets.only(left: 92, top: 3),
          child: Text(
            indianINR(raw, decimals: 2),
            style: RunqText.caption.copyWith(
              color: emphasised ? PurColors.violetDeep : t.muted,
              fontWeight: emphasised ? FontWeight.w700 : FontWeight.w500,
            ),
          ),
        ),
      ],
    );
  }
}

class _AiBadge extends StatelessWidget {
  final int pct;
  const _AiBadge({required this.pct});

  @override
  Widget build(BuildContext context) {
    final brand = PurColors.brand(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: PurColors.violetSubtle,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.auto_awesome_rounded, size: 11, color: brand),
          const SizedBox(width: 4),
          Text('AI · $pct%',
              style: RunqText.micro.copyWith(
                  color: brand, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}

class _ToggleRow extends StatelessWidget {
  final String label;
  final bool value;
  final ValueChanged<bool> onChanged;
  const _ToggleRow({required this.label, required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InkWell(
      onTap: () => onChanged(!value),
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(
          children: [
            Expanded(
              child: Text(label,
                  style: RunqText.body.copyWith(color: t.ink)),
            ),
            Transform.scale(
              scale: 0.85,
              child: Switch(
                value: value,
                onChanged: onChanged,
                activeThumbColor: PurColors.brand(context),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Receipt info card ─────────────────────────────────────────────────────

class _ReceiptInfoCard extends StatelessWidget {
  final String? warehouseId;
  final ValueChanged<String?> onWarehouse;
  final DateTime receivedDate;
  final VoidCallback onPickDate;
  final TextEditingController vehicleCtl;
  final TextEditingController lrCtl;
  final VoidCallback onChange;
  const _ReceiptInfoCard({
    required this.warehouseId,
    required this.onWarehouse,
    required this.receivedDate,
    required this.onPickDate,
    required this.vehicleCtl,
    required this.lrCtl,
    required this.onChange,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return PurCard(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('RECEIPT INFO',
              style: RunqText.micro.copyWith(color: t.muted, letterSpacing: 0.6)),
          const SizedBox(height: 10),
          inv_picker.WarehousePicker(
            value: warehouseId,
            allowAll: false,
            label: 'Warehouse',
            onChanged: onWarehouse,
          ),
          const SizedBox(height: 10),
          PoDateChip(
            label: 'Received date',
            icon: Icons.event_rounded,
            value: prettyShortDate(_isoDate(receivedDate)),
            onTap: onPickDate,
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: PoLabelledField(
                  label: 'Vehicle no',
                  controller: vehicleCtl,
                  hint: 'Optional',
                  onChanged: onChange,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: PoLabelledField(
                  label: 'LR / docket',
                  controller: lrCtl,
                  hint: 'Optional',
                  onChanged: onChange,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ── Items header ──────────────────────────────────────────────────────────

class _ItemsHeader extends StatelessWidget {
  final int count;
  const _ItemsHeader({required this.count});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(2, 0, 2, 0),
      child: Row(
        children: [
          Text('LINE ITEMS', style: RunqText.label.copyWith(color: t.muted)),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1),
            decoration: BoxDecoration(
              color: PurColors.violetSubtle,
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text('$count',
                style: RunqText.micro.copyWith(
                    color: PurColors.brand(context), fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
  }
}

// ── Scan line card ────────────────────────────────────────────────────────

class _ScanLineCard extends StatefulWidget {
  final int index;
  final _LineState state;
  final VoidCallback onChange;
  const _ScanLineCard({
    required this.index,
    required this.state,
    required this.onChange,
  });

  @override
  State<_ScanLineCard> createState() => _ScanLineCardState();
}

class _ScanLineCardState extends State<_ScanLineCard> {
  bool _trackingOpen = false;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = PurColors.brand(context);
    final s = widget.state;
    final qty = double.tryParse(s.qty.text) ?? 0;
    final rate = double.tryParse(s.rate.text) ?? 0;
    final qtyDelta = s.poQty != null && qty != s.poQty;
    final rateDelta = s.poRate != null && rate != s.poRate;
    final hasVariance = qtyDelta || rateDelta;

    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: t.hairline),
        boxShadow: [
          BoxShadow(color: Colors.black.withValues(alpha: 0.03),
              blurRadius: 6, offset: const Offset(0, 1)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 24, height: 24,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: PurColors.violetSubtle,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text('${widget.index}',
                    style: RunqText.micro.copyWith(
                        color: brand, fontWeight: FontWeight.w700)),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  s.description.isEmpty ? 'Untitled line' : s.description,
                  style: RunqText.bodyStrong.copyWith(color: t.ink),
                  maxLines: 2, overflow: TextOverflow.ellipsis,
                ),
              ),
              if (s.isOffPo) ...[
                const SizedBox(width: 6),
                _MetaPill(
                  label: 'Off-PO',
                  color: PurColors.orangeAlert,
                  bg: PurColors.orangeAlertBg,
                ),
              ],
            ],
          ),
          if (!s.isOffPo && hasVariance) ...[
            const SizedBox(height: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
              decoration: BoxDecoration(
                color: PurColors.orangeAlertBg,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  Icon(Icons.swap_vert_rounded, size: 13, color: PurColors.orangeAlert),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Text(
                      [
                        if (qtyDelta) 'PO qty ${_qtyText(s.poQty!)}',
                        if (rateDelta) 'PO rate ${indianINR(s.poRate!, decimals: 2)}',
                      ].join('  ·  '),
                      style: RunqText.caption.copyWith(color: PurColors.orangeAlert),
                    ),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: PoLabelledField(
                  label: 'Qty',
                  controller: s.qty,
                  isNumber: true,
                  hint: '0',
                  onChanged: () { widget.onChange(); setState(() {}); },
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: PoLabelledField(
                  label: 'Rate',
                  controller: s.rate,
                  isNumber: true,
                  hint: '0.00',
                  onChanged: () { widget.onChange(); setState(() {}); },
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: PoLabelledField(
                  label: 'Tax %',
                  controller: s.taxRate,
                  isNumber: true,
                  hint: '0',
                  onChanged: widget.onChange,
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
                  indianINR(qty * rate, decimals: 2),
                  style: RunqText.bodyStrong.copyWith(
                      color: PurColors.violetDeep, fontWeight: FontWeight.w700),
                ),
              ],
            ),
          ),
          const SizedBox(height: 4),
          InkWell(
            onTap: () => setState(() => _trackingOpen = !_trackingOpen),
            borderRadius: BorderRadius.circular(6),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Row(
                children: [
                  Icon(
                    _trackingOpen
                        ? Icons.keyboard_arrow_up_rounded
                        : Icons.keyboard_arrow_down_rounded,
                    size: 18, color: brand,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    _trackingOpen
                        ? 'Hide HSN / batch / expiry / serials'
                        : 'HSN, batch, expiry, serials',
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
            child: _trackingOpen
                ? Column(
                    children: [
                      const SizedBox(height: 2),
                      Row(
                        children: [
                          Expanded(
                            child: PoLabelledField(
                              label: 'HSN / SAC',
                              controller: s.hsn,
                              hint: 'Optional',
                              onChanged: widget.onChange,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: PoLabelledField(
                              label: 'Batch',
                              controller: s.batch,
                              hint: 'Optional',
                              onChanged: widget.onChange,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      PoLabelledField(
                        label: 'Expiry (YYYY-MM-DD)',
                        controller: s.expiry,
                        hint: 'Optional',
                        onChanged: widget.onChange,
                      ),
                      const SizedBox(height: 8),
                      PoLabelledField(
                        label: 'Serials (one per line)',
                        controller: s.serials,
                        hint: 'Optional',
                        maxLines: 3,
                        onChanged: widget.onChange,
                      ),
                    ],
                  )
                : const SizedBox.shrink(),
          ),
        ],
      ),
    );
  }
}

class _MetaPill extends StatelessWidget {
  final String label;
  final Color color;
  final Color bg;
  const _MetaPill({required this.label, required this.color, required this.bg});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(label,
          style: RunqText.micro.copyWith(color: color, fontWeight: FontWeight.w700)),
    );
  }
}

String _qtyText(num v) {
  final d = v.toDouble();
  if (d == d.truncateToDouble()) return d.toStringAsFixed(0);
  return d.toStringAsFixed(3).replaceFirst(RegExp(r'0+$'), '').replaceFirst(RegExp(r'\.$'), '');
}

// ── Line model ────────────────────────────────────────────────────────────

class _LineState {
  final String? poLineId;
  final String? catalogItemId;
  final String description;
  final bool isOffPo;
  final double? poQty;
  final double? poRate;
  final TextEditingController qty;
  final TextEditingController rate;
  final TextEditingController taxRate;
  final TextEditingController hsn;
  final TextEditingController batch;
  final TextEditingController expiry;
  final TextEditingController serials;

  _LineState({
    required this.poLineId, required this.catalogItemId,
    required this.description, required this.isOffPo,
    required this.poQty, required this.poRate,
    required this.qty, required this.rate, required this.taxRate,
    required this.hsn, required this.batch, required this.expiry, required this.serials,
  });

  factory _LineState.fromSuggestion(ScanSuggestedLine s) => _LineState(
        poLineId: s.poLineId,
        catalogItemId: s.catalogItemId,
        description: s.catalogDescription,
        isOffPo: s.isOffPo,
        poQty: s.poQty?.toDouble(),
        poRate: s.poRate?.toDouble(),
        qty: TextEditingController(text: s.vendorQty.toString()),
        rate: TextEditingController(text: s.vendorRate.toString()),
        taxRate: TextEditingController(text: s.vendorTaxRate?.toString() ?? ''),
        hsn: TextEditingController(text: s.vendorHsnSacCode ?? ''),
        batch: TextEditingController(),
        expiry: TextEditingController(),
        serials: TextEditingController(),
      );

  void dispose() {
    qty.dispose();
    rate.dispose();
    taxRate.dispose();
    hsn.dispose();
    batch.dispose();
    expiry.dispose();
    serials.dispose();
  }
}
