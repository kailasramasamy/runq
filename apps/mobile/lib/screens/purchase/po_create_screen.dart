import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/purchase_repo.dart';
import '../../providers/purchase_providers.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart';
import '../../widgets/vendor_picker_screen.dart';
import 'widgets/catalog_picker_screen.dart';
import 'widgets/po_form_widgets.dart';
import 'widgets/pur_colors.dart';
import 'widgets/pur_primitives.dart';

/// PP Phase 1 — Mobile PO create screen.
///
/// Shares all visual primitives with the edit screen via
/// `widgets/po_form_widgets.dart` so the two stay in lockstep. This file
/// only owns the create-specific state: blank form, POST to
/// `purchaseRepo.create`, navigation to the new PO's detail after save.
class PurchaseOrderCreateScreen extends ConsumerStatefulWidget {
  const PurchaseOrderCreateScreen({super.key});

  @override
  ConsumerState<PurchaseOrderCreateScreen> createState() => _PurchaseOrderCreateScreenState();
}

class _PurchaseOrderCreateScreenState extends ConsumerState<PurchaseOrderCreateScreen> {
  String? _vendorId;
  String? _vendorName;
  DateTime _poDate = DateTime.now();
  DateTime? _expectedDate;
  String? _paymentTerm;
  final _notesCtl = TextEditingController();
  final List<PoLineRow> _lines = [];
  bool _busy = false;

  static const _termPresets = ['Net 0', 'Net 15', 'Net 30', 'Net 45', 'Net 60'];

  @override
  void dispose() {
    _notesCtl.dispose();
    for (final l in _lines) {
      l.dispose();
    }
    super.dispose();
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

  /// Opens the line-editor bottom sheet. For [existing] == null we create
  /// a fresh row; the row is only committed to [_lines] when the user taps
  /// "Add to PO" (sheet pops `true`). For an existing row, edits mutate in
  /// place — closing the sheet keeps changes, "Delete" removes the row.
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
    // Re-entrancy guard — see po_form_widgets/PoStickyBar enable rules.
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
      final po = await purchaseRepo.create(
        vendorId: _vendorId!,
        poDate: _isoDate(_poDate),
        expectedDate: _expectedDate == null ? null : _isoDate(_expectedDate!),
        paymentTerms: _paymentTerm,
        deliveryAddress: null,
        notes: _notesCtl.text.trim().isEmpty ? null : _notesCtl.text.trim(),
        lines: _lines.map((l) => l.toJson()).toList(),
      );
      ref.invalidate(purchaseOrderListProvider);
      if (!mounted) return;
      showRunqSnack(context, 'PO ${po.poNumber} created as draft', kind: SnackKind.success);
      // Reset stack to [list] then push detail so back lands on the list,
      // not on this create form.
      context.go('/purchase/pos');
      context.push('/purchase/pos/${po.id}');
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
            const PurPlainAppBar(title: 'New Purchase Order'),
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
                    presets: _termPresets,
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
              saveLabel: 'Save draft',
            ),
          ],
        ),
      ),
    );
  }
}

String _isoDate(DateTime d) => d.toIso8601String().substring(0, 10);
