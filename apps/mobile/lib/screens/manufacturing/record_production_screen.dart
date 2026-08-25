// Record Production — unplanned production entry for the shop floor.
//
// A technician picks a BOM + qty + warehouse; the server backflushes the
// BOM's inputs and FEFO-allocates batches. The technician can nudge a line's
// qty/batch, then submits — which creates + closes an unplanned WO in one
// shot. Built for the "plant manager was away" case: no WO exists yet.
//
// Mirrors `wo_create_screen.dart` for form chrome and `wo_run_screen.dart`
// for the preview/submit split, but the preview here is server-computed
// (POST /manufacturing/production/preview) rather than a client-side
// stock-vs-BOM estimate. Form cards, the allocation list and the line-edit
// sheet are split into sibling `_record_production_*` files to keep this one
// under the house 500-line cap.

library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/api_client.dart';
import '../../api/manufacturing_models.dart';
import '../../providers/inventory_providers.dart';
import '../../providers/manufacturing_providers.dart';
import '../../services/wo_run_queue.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart';
import '_record_production_alloc_list.dart';
import '_record_production_form_cards.dart';
import '_record_production_line_sheet.dart';
import '_record_production_wastage.dart';
import '_wo_summary_bom_picker.dart';
import 'widgets/mfg_colors.dart';
import 'widgets/mfg_primitives.dart';

/// Seeds the form when a correction reopens it: the operator got one number
/// wrong, so everything else should already be filled in the way they entered
/// it the first time. Batch number and expiry are left blank — the reversed
/// batch is gone, and the repost gets a fresh one.
class RecordProductionPrefill {
  const RecordProductionPrefill({
    required this.bomId,
    required this.bomCode,
    required this.bomName,
    this.producedQty,
    this.warehouseId,
    this.shift,
  });

  final String bomId;
  final String bomCode;
  final String bomName;
  final double? producedQty;
  final String? warehouseId;
  final String? shift;
}

class RecordProductionScreen extends ConsumerStatefulWidget {
  const RecordProductionScreen({super.key, this.prefill});

  final RecordProductionPrefill? prefill;

  @override
  ConsumerState<RecordProductionScreen> createState() => _RecordProductionScreenState();
}

class _RecordProductionScreenState extends ConsumerState<RecordProductionScreen> {
  String? _bomId;
  String? _bomCode;
  String? _bomName;
  final _producedQtyCtl = TextEditingController();
  String? _warehouseId;
  DateTime? _expiryDate;
  final _batchNoCtl = TextEditingController();
  String? _shift;
  final _notesCtl = TextEditingController();

  /// Wasted qty per input item, plus one shared reason for the write-off.
  /// Held here so the values survive the preview refreshing underneath.
  final _wastageCtls = <String, TextEditingController>{};
  final _wastageNotesCtl = TextEditingController();

  /// Per-input-item batch/qty overrides the technician has made on top of
  /// the server's FEFO default. Rebuilt into the `lines` request param on
  /// every preview/submit call so an edit to one line survives further
  /// qty/warehouse changes that re-trigger the preview.
  final Map<String, ProductionAllocationBatch> _overrides = {};

  ProductionPreview? _preview;
  bool _previewLoading = false;
  Object? _previewError;
  Timer? _debounce;
  bool _busy = false;

  static const _shiftPresets = ['AM', 'PM', 'NIGHT'];

  @override
  void initState() {
    super.initState();
    final pre = widget.prefill;
    if (pre != null) {
      _bomId = pre.bomId;
      _bomCode = pre.bomCode;
      _bomName = pre.bomName;
      _shift = pre.shift;
      _warehouseId = pre.warehouseId;
      if (pre.producedQty != null) {
        _producedQtyCtl.text = _trimQty(pre.producedQty!);
      }
      _schedulePreview();
    }
    _applyDefaultWarehouse();
  }

  /// 120.0 → "120", 120.5 → "120.5" — a prefilled qty should read the way the
  /// operator typed it, not the way the API serialised it.
  static String _trimQty(double v) =>
      v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toString();

  /// Most plants run everything out of one warehouse, so making the technician
  /// pick it each time is a tap that can only be got wrong. Falls back to the
  /// sole warehouse when none is flagged default. Mirrors wo_create_screen.
  Future<void> _applyDefaultWarehouse() async {
    final whs = await ref.read(invWarehousesProvider.future);
    if (!mounted || _warehouseId != null || whs.isEmpty) return;
    final pick = whs.firstWhere((w) => w.isDefault, orElse: () => whs.first);
    setState(() => _warehouseId = pick.id);
    _schedulePreview();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _producedQtyCtl.dispose();
    _batchNoCtl.dispose();
    _notesCtl.dispose();
    _wastageNotesCtl.dispose();
    for (final c in _wastageCtls.values) {
      c.dispose();
    }
    super.dispose();
  }

  double get _producedQty => double.tryParse(_producedQtyCtl.text.trim()) ?? 0;

  bool get _canSubmit =>
      _bomId != null &&
      _producedQty > 0 &&
      _warehouseId != null &&
      _preview != null &&
      _preview!.shortages.isEmpty &&
      (!_preview!.outputTracksBatches || _expiryDate != null);

  void _schedulePreview() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), _runPreview);
  }

  List<Map<String, dynamic>>? _overrideLines() {
    if (_overrides.isEmpty) return null;
    return [
      for (final e in _overrides.entries)
        {
          'inputItemId': e.key,
          if (e.value.batchNo != null && e.value.batchNo!.isNotEmpty) 'batchNo': e.value.batchNo,
          'qty': e.value.qty,
        },
    ];
  }

  Future<void> _runPreview() async {
    if (_bomId == null || _producedQty <= 0 || _warehouseId == null) {
      setState(() => _preview = null);
      return;
    }
    setState(() {
      _previewLoading = true;
      _previewError = null;
    });
    try {
      final preview = await manufacturingRepo.previewProduction(
        bomId: _bomId,
        producedQty: _producedQty,
        warehouseId: _warehouseId!,
        lines: _overrideLines(),
      );
      if (!mounted) return;
      setState(() => _preview = preview);
    } catch (e) {
      if (!mounted) return;
      setState(() => _previewError = e);
    } finally {
      if (mounted) setState(() => _previewLoading = false);
    }
  }

  Future<void> _pickBom() async {
    final picked = await showWoSummaryBomPicker(context);
    if (picked != null && mounted) {
      setState(() {
        _bomId = picked.id;
        _bomCode = picked.bomCode;
        _bomName = picked.name;
        _overrides.clear();
      });
      _schedulePreview();
    }
  }

  Future<void> _pickExpiry() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _expiryDate ?? DateTime.now().add(const Duration(days: 90)),
      firstDate: DateTime.now(),
      lastDate: DateTime(2100),
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: Theme.of(ctx).colorScheme.copyWith(primary: MfgColors.brand(ctx)),
        ),
        child: child!,
      ),
    );
    if (picked != null && mounted) setState(() => _expiryDate = picked);
  }

  Future<void> _editLine(ProductionAllocation alloc) async {
    final result = await showRecordProductionLineSheet(context, allocation: alloc);
    if (result == null || !mounted) return;
    setState(() => _overrides[alloc.inputItemId] = result);
    _schedulePreview();
  }

  /// No batch is sent: the server FEFO-allocates the write-off across what the
  /// run actually left behind. Naming a batch here gets it wrong — the run
  /// usually drains the oldest batch outright, so the leftover sits in whichever
  /// batch the allocation stopped part-way through.
  Map<String, dynamic>? _wastagePayload() {
    final preview = _preview;
    if (preview == null) return null;
    final lines = <Map<String, dynamic>>[];
    for (final a in preview.allocations) {
      final qty = double.tryParse(_wastageCtls[a.inputItemId]?.text.trim() ?? '') ?? 0;
      if (qty <= 0) continue;
      lines.add({'itemId': a.inputItemId, 'qty': qty});
    }
    if (lines.isEmpty) return null;
    final notes = _wastageNotesCtl.text.trim();
    return {
      'warehouseId': _warehouseId,
      if (notes.isNotEmpty) 'notes': notes,
      'lines': lines,
    };
  }

  Future<void> _submit() async {
    if (!_canSubmit) return;
    setState(() => _busy = true);
    try {
      final result = await manufacturingRepo.recordProduction(
        bomId: _bomId,
        producedQty: _producedQty,
        warehouseId: _warehouseId!,
        lines: _overrideLines(),
        batchNo: _batchNoCtl.text.trim().isEmpty ? null : _batchNoCtl.text.trim(),
        expiryDate: _expiryDate == null ? null : _isoDate(_expiryDate!),
        shift: _shift,
        notes: _notesCtl.text.trim().isEmpty ? null : _notesCtl.text.trim(),
        wastage: _wastagePayload(),
      );
      if (!mounted) return;
      if (result.outcome == EnqueueOutcome.queued) {
        showRunqSnack(context, 'Saved offline — will post when online', kind: SnackKind.info);
        Navigator.pop(context);
        return;
      }
      _showResult(result.response);
    } on ApiException catch (e) {
      if (!mounted) return;
      _handleSubmitError(e);
    } catch (e) {
      if (mounted) showRunqSnack(context, e.toString(), kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// 422 with `details.shortages` means stock moved between preview and
  /// submit — surface it through the same shortage UI. Any other error
  /// (including the batchless-output 422) just gets a snack.
  void _handleSubmitError(ApiException e) {
    final shortages = _shortagesFromError(e);
    final p = _preview;
    if (shortages != null && p != null) {
      setState(() => _preview = ProductionPreview(
            bomId: p.bomId,
            bomVersion: p.bomVersion,
            bomCode: p.bomCode,
            bomName: p.bomName,
            outputItemId: p.outputItemId,
            outputItemName: p.outputItemName,
            outputUom: p.outputUom,
            runs: p.runs,
            producedQty: p.producedQty,
            warehouseId: p.warehouseId,
            warehouseName: p.warehouseName,
            outputTracksBatches: p.outputTracksBatches,
            allocations: p.allocations,
            shortages: shortages,
            estimatedInputValue: p.estimatedInputValue,
          ));
      showRunqSnack(context, 'Stock changed — check shortages below', kind: SnackKind.error);
    } else {
      showRunqSnack(context, e.message, kind: SnackKind.error);
    }
  }

  List<ProductionShortage>? _shortagesFromError(ApiException e) {
    if (e.statusCode != 422) return null;
    final details = e.body?['details'];
    if (details is! Map) return null;
    final list = details['shortages'];
    if (list is! List) return null;
    return list.cast<Map<String, dynamic>>().map(ProductionShortage.fromJson).toList();
  }

  /// Confirm and get out of the way. The WO number is the one thing worth
  /// carrying back; the output batch no longer costs a `listOutput` round
  /// trip to display, since it's on the work order itself.
  void _showResult(Map<String, dynamic>? response) {
    final data = (response?['data'] as Map?)?.cast<String, dynamic>();
    final warnings = (response?['warnings'] as List? ?? const []).cast<String>();
    final woNumber = (data?['woNumber'] as String?) ?? '';
    ref.invalidate(workOrderListProvider);
    ref.invalidate(mfgDashboardProvider);
    // A run consumes inputs and posts an output batch, so every stock view
    // behind us (raw materials on hand, perishables) is stale.
    invalidateStockViews(ref);
    final posted = woNumber.isEmpty ? 'Production posted' : 'Posted as $woNumber';
    showRunqSnack(
      context,
      warnings.isEmpty ? posted : '$posted — ${warnings.first}',
      kind: warnings.isEmpty ? SnackKind.success : SnackKind.info,
      duration: Duration(seconds: warnings.isEmpty ? 3 : 5),
    );
    Navigator.pop(context);
  }

  static String _isoDate(DateTime d) => d.toIso8601String().substring(0, 10);

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Scaffold(
      backgroundColor: t.bgWarm,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            const MfgPlainAppBar(title: 'Record Production'),
            Expanded(
              child: ListView(
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 120),
                children: [
                  RecordProductionBomQtyCard(
                    bomCode: _bomCode,
                    bomName: _bomName,
                    outputUom: _preview?.outputUom,
                    producedQtyCtl: _producedQtyCtl,
                    warehouseId: _warehouseId,
                    onPickBom: _pickBom,
                    onQtyChanged: () {
                      setState(() {});
                      _schedulePreview();
                    },
                    onWarehouseChanged: (id) {
                      setState(() => _warehouseId = id);
                      _schedulePreview();
                    },
                  ),
                  const SizedBox(height: 12),
                  RecordProductionDetailsCard(
                    outputTracksBatches: _preview?.outputTracksBatches ?? false,
                    expiryDate: _expiryDate,
                    onPickExpiry: _pickExpiry,
                    batchNoCtl: _batchNoCtl,
                    shift: _shift,
                    shiftPresets: _shiftPresets,
                    // Tapping a shift chip means the qty keypad is done with;
                    // leaving it up hides the rest of the form.
                    onShiftTap: (v) {
                      FocusScope.of(context).unfocus();
                      setState(() => _shift = _shift == v ? null : v);
                    },
                    notesCtl: _notesCtl,
                  ),
                  const SizedBox(height: 12),
                  if (_previewLoading)
                    const LinearProgressIndicator()
                  else if (_previewError != null)
                    _previewErrorCard(t)
                  else if (_preview != null) ...[
                    RecordProductionAllocList(preview: _preview!, onEditLine: _editLine),
                    const SizedBox(height: 12),
                    RecordProductionWastage(
                      preview: _preview!,
                      qtyControllers: _wastageCtls,
                      notesCtl: _wastageNotesCtl,
                      onChanged: () => setState(() {}),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: t.surface,
          border: Border(top: BorderSide(color: t.hairline, width: 0.5)),
        ),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
            child: SizedBox(
              width: double.infinity,
              height: 52,
              child: MfgPrimaryButton(
                label: 'Submit & Post',
                loading: _busy,
                onPressed: _canSubmit ? _submit : null,
                icon: Icons.check_rounded,
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _previewErrorCard(RunqTokens t) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: MfgCard(
          child: Row(children: [
            Icon(Icons.error_outline_rounded, size: 18, color: MfgColors.error),
            const SizedBox(width: 8),
            Expanded(
              child: Text('Failed to preview: $_previewError',
                  style: RunqText.caption.copyWith(color: t.muted)),
            ),
          ]),
        ),
      );
}
