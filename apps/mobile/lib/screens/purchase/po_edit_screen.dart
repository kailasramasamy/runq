import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/purchase_models.dart';
import '../../api/purchase_repo.dart';
import '../../providers/purchase_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart';
import '../../widgets/vendor_picker_screen.dart';
import 'widgets/catalog_picker_screen.dart';
import 'widgets/po_form_widgets.dart';
import 'widgets/pur_colors.dart';
import 'widgets/pur_primitives.dart';

/// PP Phase 1 — Mobile PO edit screen.
///
/// Visually identical to `po_create_screen` — both compose the widgets
/// from `widgets/po_form_widgets.dart`. The only differences are: state
/// is seeded from an existing PO, save calls `purchaseRepo.update`, and
/// the screen is read-only with a "back to PO" empty state when the PO
/// is no longer in draft (the server enforces the same rule).
class PurchaseOrderEditScreen extends ConsumerStatefulWidget {
  final String poId;
  const PurchaseOrderEditScreen({super.key, required this.poId});

  @override
  ConsumerState<PurchaseOrderEditScreen> createState() => _PurchaseOrderEditScreenState();
}

class _PurchaseOrderEditScreenState extends ConsumerState<PurchaseOrderEditScreen> {
  String? _vendorId;
  String? _vendorName;
  DateTime _poDate = DateTime.now();
  DateTime? _expectedDate;
  String? _paymentTerm;
  String? _customPaymentTerm; // value present on the PO but not in presets
  final _notesCtl = TextEditingController();
  final List<PoLineRow> _lines = [];
  bool _busy = false;
  bool _seeded = false;
  String? _statusGuard;
  String _poNumber = '';

  static const _termPresets = ['Net 0', 'Net 15', 'Net 30', 'Net 45', 'Net 60'];

  @override
  void dispose() {
    _notesCtl.dispose();
    for (final l in _lines) {
      l.dispose();
    }
    super.dispose();
  }

  void _seedFrom(PurchaseOrderWithLines po) {
    if (_seeded) return;
    _vendorId = po.vendorId;
    _vendorName = po.vendorName;
    _poDate = DateTime.tryParse(po.poDate) ?? DateTime.now();
    _expectedDate = po.expectedDate == null ? null : DateTime.tryParse(po.expectedDate!);
    final terms = po.paymentTerms?.trim();
    if (terms != null && terms.isNotEmpty) {
      if (_termPresets.contains(terms)) {
        _paymentTerm = terms;
      } else {
        _customPaymentTerm = terms;
        _paymentTerm = terms; // shown as an extra chip
      }
    }
    _notesCtl.text = po.notes ?? '';
    _statusGuard = po.status;
    _poNumber = po.poNumber;
    for (final l in po.lines) {
      _lines.add(PoLineRow.fromExisting(l));
    }
    _seeded = true;
  }

  bool get _canSave =>
      _vendorId != null &&
      _lines.isNotEmpty &&
      _lines.every((l) =>
          l.description.text.trim().isNotEmpty &&
          (double.tryParse(l.qty.text) ?? 0) > 0);

  Future<void> _pickVendor() async {
    final picked = await showVendorPicker(context, currentVendorId: _vendorId);
    if (picked != null) {
      setState(() {
        _vendorId = picked.id;
        _vendorName = picked.name;
      });
    }
  }

  Future<void> _pickDate({required bool expected}) async {
    final initial = expected ? (_expectedDate ?? _poDate) : _poDate;
    final first = expected ? _poDate : DateTime(2020);
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
      if (expected) {
        _expectedDate = picked;
      } else {
        _poDate = picked;
        if (_expectedDate != null && _expectedDate!.isBefore(picked)) {
          _expectedDate = null;
        }
      }
    });
  }

  Future<void> _pickCatalogFor(PoLineRow row, {String? initialQuery}) async {
    if (_vendorId == null) {
      showRunqSnack(context, 'Pick a vendor first', kind: SnackKind.error);
      return;
    }
    final result = await Navigator.of(context).push<CatalogPickResult>(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => CatalogPickerScreen(
          vendorId: _vendorId!,
          initialQuery: initialQuery,
        ),
      ),
    );
    if (result == null) return;
    if (result.isEntry) {
      final e = result.entry!;
      row.catalogItemId = e.id;
      row.description.text = e.description;
      if (e.defaultUom != null) row.uom.text = e.defaultUom!;
      if (e.hsnSacCode != null) row.hsn.text = e.hsnSacCode!;
    } else {
      row.catalogItemId = null;
      row.description.text = result.customDescription ?? '';
    }
    if (mounted) setState(() {});
  }

  Future<void> _openLineEditor({PoLineRow? existing}) async {
    final isNew = existing == null;
    final row = existing ?? PoLineRow();
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => PoLineEditorSheet(
        row: row,
        vendorId: _vendorId,
        isNew: isNew,
        onPickCatalog: () => _pickCatalogFor(row),
      ),
    );
    if (!mounted) return;
    if (isNew) {
      if (saved == true) {
        setState(() => _lines.add(row));
      } else {
        row.dispose();
      }
    } else {
      if (saved == false) {
        setState(() {
          _lines.remove(row);
          row.dispose();
        });
      } else {
        setState(() {});
      }
    }
  }

  Future<void> _save() async {
    if (_busy) return;
    if (!_canSave) {
      if (_vendorId == null) {
        showRunqSnack(context, 'Pick a vendor', kind: SnackKind.error);
      } else {
        showRunqSnack(context, 'Each line needs a description and qty > 0', kind: SnackKind.error);
      }
      return;
    }
    setState(() => _busy = true);
    try {
      await purchaseRepo.update(widget.poId, {
        'vendorId': _vendorId,
        'poDate': _isoDate(_poDate),
        if (_expectedDate != null) 'expectedDate': _isoDate(_expectedDate!),
        if (_paymentTerm != null && _paymentTerm!.trim().isNotEmpty)
          'paymentTerms': _paymentTerm,
        if (_notesCtl.text.trim().isNotEmpty) 'notes': _notesCtl.text.trim(),
        'lines': _lines.map((l) => l.toJson()).toList(),
      });
      ref.invalidate(purchaseOrderDetailProvider(widget.poId));
      ref.invalidate(purchaseOrderListProvider);
      if (!mounted) return;
      showRunqSnack(context, 'PO updated', kind: SnackKind.success);
      context.pop();
    } catch (e) {
      if (mounted) showRunqSnack(context, e.toString(), kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final detail = ref.watch(purchaseOrderDetailProvider(widget.poId));
    return Scaffold(
      backgroundColor: t.bgWarm,
      body: SafeArea(
        bottom: false,
        child: detail.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(child: Text('Failed to load: $e', style: RunqText.body)),
          data: (po) {
            _seedFrom(po);
            final readOnly = _statusGuard != 'draft';
            if (readOnly) {
              return Column(
                children: [
                  PurPlainAppBar(title: 'Edit ${po.poNumber}'),
                  Expanded(
                    child: PurEmptyState(
                      icon: Icons.lock_outline_rounded,
                      title: 'Cannot edit ${po.poNumber}',
                      description:
                          'This PO is ${po.status}. Cancel and recreate if changes are needed.',
                      action: PurPrimaryButton(
                        label: 'Back to PO',
                        onPressed: () => context.pop(),
                      ),
                    ),
                  ),
                ],
              );
            }
            return _buildForm();
          },
        ),
      ),
    );
  }

  Widget _buildForm() {
    // Build the term-preset list — include the PO's existing custom term
    // (if any) so the user can keep it selected without it disappearing.
    final presets = <String>[
      ..._termPresets,
      if (_customPaymentTerm != null && !_termPresets.contains(_customPaymentTerm))
        _customPaymentTerm!,
    ];
    return Column(
      children: [
        PurPlainAppBar(title: 'Edit $_poNumber'),
        Expanded(
          child: ListView(
            physics: const BouncingScrollPhysics(),
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
            children: [
              PoVendorCard(name: _vendorName, onTap: _pickVendor),
              const SizedBox(height: 12),
              PoScheduleRow(
                poDate: _poDate,
                expectedDate: _expectedDate,
                onPickPo: () => _pickDate(expected: false),
                onPickExpected: () => _pickDate(expected: true),
                onClearExpected: () => setState(() => _expectedDate = null),
              ),
              const SizedBox(height: 12),
              PoPaymentTermsCard(
                presets: presets,
                selected: _paymentTerm,
                onSelect: (v) => setState(() => _paymentTerm = v),
              ),
              const SizedBox(height: 16),
              PoItemsSection(
                lines: _lines,
                onAdd: () => _openLineEditor(),
                onEdit: (row) => _openLineEditor(existing: row),
              ),
              const SizedBox(height: 16),
              PoNotesCard(controller: _notesCtl),
              const SizedBox(height: 16),
            ],
          ),
        ),
        PoStickyBar(
          busy: _busy,
          enabled: _canSave && !_busy,
          onCancel: _busy ? null : () => context.pop(),
          onSave: _save,
          saveLabel: 'Save changes',
        ),
      ],
    );
  }
}

String _isoDate(DateTime d) => d.toIso8601String().substring(0, 10);
