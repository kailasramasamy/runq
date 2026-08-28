// Writing an invoice, and amending one.
//
// Mobile equivalent of the web `InvoiceForm` (apps/web/src/components/forms/
// invoice-form.tsx): same payload shape (createSalesInvoiceSchema) — customer,
// dates, line items, totals, notes. No HSN/SAC editing and no per-customer
// price resolver; those stay on the web for now.
//
// The screen is deliberately thin. Fields live in invoice_form_fields.dart and
// line editing in invoice_line_editing.dart, because this file used to hold
// both plus a full-screen item picker and had grown past twelve hundred lines
// — at which point the create and amend paths had quietly drifted into two
// different designs without anyone deciding that.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../api/repos.dart';
import '../providers/data_providers.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../utils/format_inr.dart';
import '../widgets/customer_picker_screen.dart';
import '../widgets/runq_snack.dart';
import 'invoice/invoice_form_fields.dart';
import 'invoice/invoice_line_draft.dart';
import 'invoice/invoice_line_editing.dart';

class NewInvoiceScreen extends ConsumerStatefulWidget {
  /// When set, the form hydrates from this invoice and PUTs to update on save.
  /// Used by the Amend flow from invoice detail.
  final String? editInvoiceId;
  const NewInvoiceScreen({super.key, this.editInvoiceId});

  @override
  ConsumerState<NewInvoiceScreen> createState() => _NewInvoiceScreenState();
}

class _NewInvoiceScreenState extends ConsumerState<NewInvoiceScreen> {
  CustomerSummary? _customer;
  DateTime _invoiceDate = DateTime.now();
  DateTime _dueDate = DateTime.now().add(const Duration(days: 30));
  bool _dueDirty = false;
  final _poCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();
  List<InvoiceLineDraft> _lines = const [];
  bool _saving = false;
  bool _hydrating = false;

  bool get _isEdit => widget.editInvoiceId != null;

  @override
  void initState() {
    super.initState();
    if (_isEdit) _hydrate();
  }

  @override
  void dispose() {
    _poCtrl.dispose();
    _notesCtrl.dispose();
    super.dispose();
  }

  Future<void> _hydrate() async {
    setState(() => _hydrating = true);
    try {
      final inv = await invoicesRepo.detail(widget.editInvoiceId!);
      if (!mounted) return;
      setState(() {
        // The detail payload carries customerId + name but the picker wants a
        // CustomerSummary. Payment terms don't matter here — the due date is
        // already set on the invoice being amended.
        _customer = CustomerSummary(
          id: inv.customerId,
          name: inv.customerName,
          gstin: null,
          paymentTermsDays: 30,
        );
        _invoiceDate = inv.invoiceDate;
        _dueDate = inv.dueDate;
        _dueDirty = true; // don't auto-recompute a due date already agreed
        _poCtrl.text = ''; // poNumber isn't on the mobile model yet
        _notesCtrl.text = '';
        _lines = inv.items
            .map((it) => InvoiceLineDraft(
                  // Carried so the server updates these rows rather than
                  // replacing them — delivery notes hold a foreign key to
                  // them, and a replaced row loses that link.
                  id: it.id,
                  itemId: it.itemId,
                  hsnSacCode: it.hsnSacCode,
                  description: it.description,
                  uom: it.uom ?? '',
                  quantity: _trim(it.quantity),
                  unitPrice: _trim(it.unitPrice),
                  taxRate: it.taxRate ?? 0,
                ))
            .toList();
      });
    } on ApiException catch (e) {
      if (mounted) showRunqSnack(context, e.message, kind: SnackKind.error);
    } catch (_) {
      if (mounted) {
        showRunqSnack(context, 'Could not load invoice for editing.',
            kind: SnackKind.error);
      }
    } finally {
      if (mounted) setState(() => _hydrating = false);
    }
  }

  String _trim(double v) =>
      v == v.roundToDouble() ? v.toInt().toString() : v.toString();

  void _onCustomerChanged(CustomerSummary c) {
    setState(() {
      _customer = c;
      if (!_dueDirty) _dueDate = _invoiceDate.add(Duration(days: c.paymentTermsDays));
    });
  }

  void _onInvoiceDateChanged(DateTime d) {
    setState(() {
      _invoiceDate = d;
      if (!_dueDirty) {
        _dueDate = d.add(Duration(days: _customer?.paymentTermsDays ?? 30));
      }
    });
  }

  double get _subtotal => _lines.fold(0.0, (s, l) => s + l.amount);
  double get _tax => _lines.fold(0.0, (s, l) => s + l.taxAmount);
  double get _total => _subtotal + _tax;

  String _isoDate(DateTime d) => '${d.year.toString().padLeft(4, '0')}'
      '-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  /// Add a line by opening the editor straight away. An empty row sitting in
  /// the list is a placeholder nobody asked for; the operator pressed "Add
  /// item" because they have an item in mind.
  Future<void> _addLine() async {
    final seed = InvoiceLineDraft(
      // Carry the last line's rate forward so a multi-line invoice picks GST
      // once. Still unset on the first line, which must be chosen.
      taxRate: _lines.isNotEmpty ? _lines.last.taxRate : null,
    );
    final added = await showInvoiceLineSheet(context, seed);
    if (added != null && mounted) setState(() => _lines = [..._lines, added]);
  }

  Future<void> _editLine(int index) async {
    final edited = await showInvoiceLineSheet(context, _lines[index]);
    if (edited == null || !mounted) return;
    setState(() {
      final next = [..._lines];
      next[index] = edited;
      _lines = next;
    });
  }

  void _removeLine(int index) {
    setState(() => _lines = [..._lines]..removeAt(index));
  }

  Future<void> _save() async {
    if (_customer == null) {
      return showRunqSnack(context, 'Pick a customer first.', kind: SnackKind.error);
    }
    final valid = _lines.where((l) => l.isComplete).toList();
    if (valid.isEmpty) {
      return showRunqSnack(context, 'Add at least one line item with qty and price.',
          kind: SnackKind.error);
    }
    if (valid.any((l) => l.taxRate == null)) {
      return showRunqSnack(context,
          'Choose a GST rate for every line — use 0% for exempt items.',
          kind: SnackKind.error);
    }

    final body = <String, dynamic>{
      'customerId': _customer!.id,
      'invoiceDate': _isoDate(_invoiceDate),
      'dueDate': _isoDate(_dueDate),
      'subtotal': _subtotal,
      'taxAmount': _tax,
      'totalAmount': _total,
      'notes': _notesCtrl.text.trim().isEmpty ? null : _notesCtrl.text.trim(),
      'poNumber': _poCtrl.text.trim().isEmpty ? null : _poCtrl.text.trim(),
      'reverseCharge': false,
      'items': valid
          .map((l) => <String, dynamic>{
                if (l.id != null) 'id': l.id,
                'itemId': l.itemId,
                // Carried so the stored line can be compared on tax treatment
                // later — a substitution is refused if HSN or rate differ.
                if (l.hsnSacCode != null) 'hsnSacCode': l.hsnSacCode,
                'description': l.description.trim(),
                'uom': l.uom.trim().isEmpty ? null : l.uom.trim(),
                'quantity': double.tryParse(l.quantity) ?? 0,
                'unitPrice': double.tryParse(l.unitPrice) ?? 0,
                'amount': l.amount,
                'taxCategory': (l.taxRate ?? 0) > 0 ? 'taxable' : 'exempt',
                'taxRate': l.taxRate ?? 0,
              })
          .toList(),
    };

    setState(() => _saving = true);
    try {
      final String invoiceId;
      if (_isEdit) {
        await invoicesRepo.update(widget.editInvoiceId!, body);
        invoiceId = widget.editInvoiceId!;
      } else {
        invoiceId = await invoicesRepo.create(body);
      }
      if (!mounted) return;
      ref.invalidate(invoiceSummaryProvider);
      // Every filter variant, so the sales hub, status tabs and dashboard all
      // refresh — not just the empty-filter list this flow started from.
      ref.invalidate(invoicesProvider);
      if (_isEdit) ref.invalidate(invoiceDetailProvider(invoiceId));
      showRunqSnack(context, _isEdit ? 'Invoice updated.' : 'Invoice created.');
      if (invoiceId.isNotEmpty) {
        context.pushReplacement('/invoices/$invoiceId');
      } else {
        context.pop();
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      showRunqSnack(context, e.message, kind: SnackKind.error);
    } catch (_) {
      if (!mounted) return;
      showRunqSnack(context,
          _isEdit ? 'Could not update invoice.' : 'Could not create invoice.',
          kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Scaffold(
      backgroundColor: t.bgWarmer,
      appBar: AppBar(
        title: Text(_isEdit ? 'Amend invoice' : 'New invoice'),
        leading: IconButton(
          icon: const Icon(Icons.close_rounded),
          onPressed: () => context.pop(),
        ),
      ),
      body: SafeArea(
        child: _hydrating
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                children: [
                  _customerSection(),
                  const SizedBox(height: 12),
                  _linesSection(t),
                  const SizedBox(height: 12),
                  _summarySection(),
                  const SizedBox(height: 12),
                  _notesSection(t),
                ],
              ),
      ),
      // Saving is pinned rather than scrolled to: on a long invoice the button
      // would otherwise sit below several screens of line items.
      bottomNavigationBar: _hydrating ? null : _saveBar(t),
    );
  }

  Widget _customerSection() => InvoiceSectionCard(
        title: 'Customer & dates',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            CustomerPickerRow(
              customer: _customer,
              onPick: () async {
                final picked = await showCustomerPicker(
                  context,
                  currentCustomerId: _customer?.id,
                );
                if (picked != null) _onCustomerChanged(picked);
              },
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: InvoiceDateField(
                    label: 'Invoice date',
                    value: _invoiceDate,
                    onChanged: _onInvoiceDateChanged,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: InvoiceDateField(
                    label: 'Due date',
                    value: _dueDate,
                    onChanged: (d) => setState(() {
                      _dueDate = d;
                      _dueDirty = true;
                    }),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            InvoiceTextField(
              controller: _poCtrl,
              label: 'PO number (optional)',
              hint: "Buyer's PO/order reference",
            ),
          ],
        ),
      );

  Widget _linesSection(RunqTokens t) => InvoiceSectionCard(
        title: 'Line items',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (_lines.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Text('Nothing on this invoice yet.',
                    style: RunqText.caption.copyWith(color: t.muted)),
              )
            else
              for (int i = 0; i < _lines.length; i++) ...[
                if (i > 0) const SizedBox(height: 8),
                InvoiceLineRow(
                  line: _lines[i],
                  canRemove: true,
                  onEdit: () => _editLine(i),
                  onRemove: () => _removeLine(i),
                ),
              ],
            const SizedBox(height: 12),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: _addLine,
                icon: const Icon(Icons.add_rounded, size: 18),
                label: const Text('Add item'),
              ),
            ),
          ],
        ),
      );

  Widget _summarySection() => InvoiceSectionCard(
        title: 'Summary',
        child: Column(
          children: [
            InvoiceSummaryRow(label: 'Subtotal', value: formatINR(_subtotal)),
            const SizedBox(height: 6),
            InvoiceSummaryRow(label: 'GST (auto)', value: formatINR(_tax)),
            const Divider(height: 18),
            InvoiceSummaryRow(label: 'Total', value: formatINR(_total), bold: true),
          ],
        ),
      );

  Widget _notesSection(RunqTokens t) => InvoiceSectionCard(
        title: 'Notes',
        child: TextField(
          controller: _notesCtrl,
          minLines: 2,
          maxLines: 4,
          textCapitalization: TextCapitalization.sentences,
          decoration: invoiceInputDecoration(t, hint: 'Optional notes for this invoice'),
        ),
      );

  /// Shows the total next to the action, so the number being committed to is
  /// on screen at the moment of committing rather than scrolled away.
  Widget _saveBar(RunqTokens t) => Container(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
        decoration: BoxDecoration(
          color: t.surface,
          border: Border(top: BorderSide(color: t.hairline, width: 0.5)),
        ),
        child: SafeArea(
          top: false,
          child: Row(
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('Total', style: RunqText.caption.copyWith(color: t.muted)),
                  Text(formatINR(_total),
                      style: RunqText.tabular(size: 18, w: FontWeight.w700, color: t.ink)),
                ],
              ),
              const SizedBox(width: 16),
              Expanded(
                child: FilledButton(
                  onPressed: _saving ? null : _save,
                  style: FilledButton.styleFrom(
                    backgroundColor: RunqColors.indigo,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  child: _saving
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white),
                        )
                      : Text(_isEdit ? 'Save changes' : 'Save invoice'),
                ),
              ),
            ],
          ),
        ),
      );
}
