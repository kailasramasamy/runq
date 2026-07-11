import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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

/// Mobile equivalent of the web `InvoiceForm` (apps/web/src/components/forms/
/// invoice-form.tsx). Same payload shape (createSalesInvoiceSchema): customer,
/// dates, line items, totals, notes. No HSN/SAC editing, no per-customer
/// price resolver — those stay on the web for now.
class NewInvoiceScreen extends ConsumerStatefulWidget {
  /// When set, the form hydrates from this invoice and PUTs to update on
  /// save. Used by the Amend flow from invoice detail.
  final String? editInvoiceId;
  const NewInvoiceScreen({super.key, this.editInvoiceId});

  @override
  ConsumerState<NewInvoiceScreen> createState() => _NewInvoiceScreenState();
}

class _LineItem {
  String? itemId;
  String description = '';
  String uom = '';
  String quantity = '';
  String unitPrice = '';
  double taxRate = 0;
  _LineItem();

  double get amount =>
      (double.tryParse(quantity) ?? 0) * (double.tryParse(unitPrice) ?? 0);

  double get taxAmount {
    if (taxRate <= 0) return 0;
    return amount * taxRate / 100;
  }
}

class _NewInvoiceScreenState extends ConsumerState<NewInvoiceScreen> {
  CustomerSummary? _customer;
  DateTime _invoiceDate = DateTime.now();
  DateTime _dueDate = DateTime.now().add(const Duration(days: 30));
  bool _dueDirty = false;
  final _poCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();
  final List<_LineItem> _lines = [_LineItem()];
  bool _saving = false;
  bool _hydrating = false;

  bool get _isEdit => widget.editInvoiceId != null;

  @override
  void initState() {
    super.initState();
    if (_isEdit) {
      _hydrate();
    }
  }

  Future<void> _hydrate() async {
    setState(() => _hydrating = true);
    try {
      final inv = await invoicesRepo.detail(widget.editInvoiceId!);
      if (!mounted) return;
      // The detail payload carries customerId + name but the picker
      // expects a CustomerSummary. Build a minimal one — payment-terms
      // isn't needed (the due date is already set on the invoice).
      final customer = CustomerSummary(
        id: inv.customerId,
        name: inv.customerName,
        gstin: null,
        paymentTermsDays: 30,
      );
      setState(() {
        _customer = customer;
        _invoiceDate = inv.invoiceDate;
        _dueDate = inv.dueDate;
        _dueDirty = true; // suppress auto-recompute when editing
        _poCtrl.text = ''; // poNumber not exposed on the mobile model — leave blank
        _notesCtrl.text = '';
        _lines
          ..clear()
          ..addAll(inv.items.map((it) {
            final l = _LineItem();
            l.itemId = null; // mobile InvoiceItem doesn't surface itemId
            l.description = it.description;
            l.uom = it.uom ?? '';
            l.quantity = _trim(it.quantity);
            l.unitPrice = _trim(it.unitPrice);
            l.taxRate = it.taxRate ?? 0;
            return l;
          }));
        if (_lines.isEmpty) _lines.add(_LineItem());
      });
    } on ApiException catch (e) {
      if (mounted) showRunqSnack(context, e.message, kind: SnackKind.error);
    } catch (_) {
      if (mounted) showRunqSnack(context, 'Could not load invoice for editing.', kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _hydrating = false);
    }
  }

  String _trim(double v) {
    if (v == v.roundToDouble()) return v.toInt().toString();
    return v.toString();
  }

  @override
  void dispose() {
    _poCtrl.dispose();
    _notesCtrl.dispose();
    super.dispose();
  }

  void _onCustomerChanged(CustomerSummary c) {
    setState(() {
      _customer = c;
      if (!_dueDirty) {
        _dueDate = _invoiceDate.add(Duration(days: c.paymentTermsDays));
      }
    });
  }

  void _onInvoiceDateChanged(DateTime d) {
    setState(() {
      _invoiceDate = d;
      if (!_dueDirty) {
        final days = _customer?.paymentTermsDays ?? 30;
        _dueDate = d.add(Duration(days: days));
      }
    });
  }

  double get _subtotal => _lines.fold(0.0, (s, l) => s + l.amount);
  double get _tax => _lines.fold(0.0, (s, l) => s + l.taxAmount);
  double get _total => _subtotal + _tax;

  String _isoDate(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  Future<void> _openEditLineSheet(int index) async {
    if (index < 0 || index >= _lines.length) return;
    final changed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _EditLineSheet(line: _lines[index]),
    );
    if (changed == true && mounted) setState(() {});
  }

  Future<void> _save() async {
    if (_customer == null) {
      showRunqSnack(context, 'Pick a customer first.', kind: SnackKind.error);
      return;
    }
    final validLines = _lines.where((l) => l.amount > 0 && l.description.trim().isNotEmpty).toList();
    if (validLines.isEmpty) {
      showRunqSnack(context, 'Add at least one line item with qty and price.',
          kind: SnackKind.error);
      return;
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
      'items': validLines.map((l) => <String, dynamic>{
            'itemId': l.itemId,
            'description': l.description.trim(),
            'uom': l.uom.trim().isEmpty ? null : l.uom.trim(),
            'quantity': double.tryParse(l.quantity) ?? 0,
            'unitPrice': double.tryParse(l.unitPrice) ?? 0,
            'amount': l.amount,
            'taxCategory': l.taxRate > 0 ? 'taxable' : 'exempt',
            'taxRate': l.taxRate,
          }).toList(),
    };

    setState(() => _saving = true);
    try {
      String invoiceId;
      if (_isEdit) {
        await invoicesRepo.update(widget.editInvoiceId!, body);
        invoiceId = widget.editInvoiceId!;
      } else {
        invoiceId = await invoicesRepo.create(body);
      }
      if (!mounted) return;
      ref.invalidate(invoiceSummaryProvider);
      // Invalidate every filter variant so the sales hub, status tabs, and
      // dashboard refresh — not just the empty-filter list the create flow
      // started from.
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
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 120),
          children: [
            _SectionCard(
              title: 'Customer & dates',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _CustomerPickerRow(
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
                        child: _DateField(
                          label: 'Invoice date',
                          value: _invoiceDate,
                          onChanged: _onInvoiceDateChanged,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: _DateField(
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
                  _TextField(
                    controller: _poCtrl,
                    label: 'PO number (optional)',
                    hint: "Buyer's PO/order reference",
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            _SectionCard(
              title: 'Line items',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (int i = 0; i < _lines.length; i++) ...[
                    if (i > 0) const SizedBox(height: 8),
                    if (_isEdit)
                      _LineSummaryRow(
                        line: _lines[i],
                        canRemove: _lines.length > 1,
                        onEdit: () => _openEditLineSheet(i),
                        onRemove: () => setState(() => _lines.removeAt(i)),
                      )
                    else
                      _LineCard(
                        line: _lines[i],
                        canRemove: _lines.length > 1,
                        onRemove: () => setState(() => _lines.removeAt(i)),
                        onChanged: () => setState(() {}),
                      ),
                  ],
                  const SizedBox(height: 12),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton.icon(
                      onPressed: () {
                        final newLine = _LineItem();
                        setState(() => _lines.add(newLine));
                        if (_isEdit) _openEditLineSheet(_lines.length - 1);
                      },
                      icon: const Icon(Icons.add_rounded, size: 18),
                      label: const Text('Add row'),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            _SectionCard(
              title: 'Summary',
              child: Column(
                children: [
                  _SummaryRow(label: 'Subtotal', value: formatINR(_subtotal)),
                  const SizedBox(height: 6),
                  _SummaryRow(label: 'GST (auto)', value: formatINR(_tax)),
                  const Divider(height: 18),
                  _SummaryRow(label: 'Total', value: formatINR(_total), bold: true),
                ],
              ),
            ),
            const SizedBox(height: 12),
            _SectionCard(
              title: 'Notes',
              child: TextField(
                controller: _notesCtrl,
                minLines: 2,
                maxLines: 4,
                textCapitalization: TextCapitalization.sentences,
                decoration: _inputDecoration(t, hint: 'Optional notes for this invoice'),
              ),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _saving ? null : _save,
              style: FilledButton.styleFrom(
                backgroundColor: RunqColors.indigo,
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
              child: _saving
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : Text(_isEdit ? 'Save changes' : 'Save invoice'),
            ),
          ],
        ),
      ),
    );
  }
}

InputDecoration _inputDecoration(RunqTokens t, {String? hint, String? prefix, String? suffix}) {
  return InputDecoration(
    isDense: true,
    filled: true,
    fillColor: t.inputFill,
    hintText: hint,
    prefixText: prefix,
    suffixText: suffix,
    hintStyle: RunqText.body.copyWith(color: t.muted),
    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
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
  );
}

class _SectionCard extends StatelessWidget {
  final String title;
  final Widget child;
  const _SectionCard({required this.title, required this.child});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: RunqText.bodyStrong.copyWith(color: t.ink)),
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }
}

class _CustomerPickerRow extends StatelessWidget {
  final CustomerSummary? customer;
  final VoidCallback onPick;
  const _CustomerPickerRow({required this.customer, required this.onPick});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final has = customer != null;
    return InkWell(
      onTap: onPick,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          color: t.inputFill,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: has ? RunqColors.indigo : t.hairline, width: 0.5),
        ),
        child: Row(
          children: [
            Icon(has ? Icons.business_rounded : Icons.search_rounded,
                size: 18, color: has ? RunqColors.indigo : t.muted),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    has ? customer!.name : 'Pick customer',
                    style: RunqText.body.copyWith(
                      color: has ? t.ink : t.muted,
                      fontWeight: has ? FontWeight.w600 : FontWeight.w400,
                    ),
                  ),
                  if (has && customer!.gstin != null && customer!.gstin!.isNotEmpty)
                    Text(customer!.gstin!,
                        style: RunqText.label.copyWith(color: t.muted)),
                ],
              ),
            ),
            Icon(Icons.chevron_right_rounded, color: t.muted2),
          ],
        ),
      ),
    );
  }
}

class _DateField extends StatelessWidget {
  final String label;
  final DateTime value;
  final ValueChanged<DateTime> onChanged;
  const _DateField({required this.label, required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final text = '${value.day.toString().padLeft(2, '0')}/${value.month.toString().padLeft(2, '0')}/${value.year}';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: RunqText.caption.copyWith(color: t.muted)),
        const SizedBox(height: 4),
        InkWell(
          onTap: () async {
            final picked = await showDatePicker(
              context: context,
              initialDate: value,
              firstDate: DateTime(2020),
              lastDate: DateTime(2100),
            );
            if (picked != null) onChanged(picked);
          },
          borderRadius: BorderRadius.circular(10),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            decoration: BoxDecoration(
              color: t.inputFill,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: t.hairline, width: 0.5),
            ),
            child: Row(
              children: [
                Icon(Icons.calendar_today_rounded, size: 14, color: t.muted),
                const SizedBox(width: 8),
                Text(text, style: RunqText.body.copyWith(color: t.ink)),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _TextField extends StatelessWidget {
  final TextEditingController controller;
  final String label;
  final String? hint;
  const _TextField({required this.controller, required this.label, this.hint});

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
          textCapitalization: TextCapitalization.sentences,
          decoration: _inputDecoration(t, hint: hint),
        ),
      ],
    );
  }
}

class _NumField extends StatelessWidget {
  final String label;
  final String value;
  final ValueChanged<String> onChanged;
  final String? hint;
  const _NumField({required this.label, required this.value, required this.onChanged, this.hint});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: RunqText.caption.copyWith(color: t.muted)),
        const SizedBox(height: 4),
        TextFormField(
          initialValue: value,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
          onChanged: onChanged,
          decoration: _inputDecoration(t, hint: hint),
        ),
      ],
    );
  }
}

class _LineCard extends StatelessWidget {
  final _LineItem line;
  final bool canRemove;
  final VoidCallback onRemove;
  final VoidCallback onChanged;
  const _LineCard({
    required this.line,
    required this.canRemove,
    required this.onRemove,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: t.bgWarmer,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _ItemPickerRow(
            label: line.description.isEmpty ? null : line.description,
            uom: line.uom.isEmpty ? null : line.uom,
            onPick: () async {
              final picked = await Navigator.of(context).push<ItemSummary>(
                MaterialPageRoute(
                  builder: (_) => const _ItemPickerScreen(),
                ),
              );
              if (picked != null) {
                line.itemId = picked.id;
                line.description = picked.name;
                line.uom = picked.unit ?? line.uom;
                if (picked.defaultSellingPrice != null) {
                  line.unitPrice = picked.defaultSellingPrice!.toString();
                }
                if (picked.gstRate != null) line.taxRate = picked.gstRate!;
                onChanged();
              }
            },
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _NumField(
                  label: 'Qty',
                  value: line.quantity,
                  hint: '0',
                  onChanged: (v) {
                    line.quantity = v;
                    onChanged();
                  },
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _NumField(
                  label: 'Unit price',
                  value: line.unitPrice,
                  hint: '0.00',
                  onChanged: (v) {
                    line.unitPrice = v;
                    onChanged();
                  },
                ),
              ),
              const SizedBox(width: 8),
              SizedBox(
                width: 72,
                child: _UomDisplay(uom: line.uom),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _GstSelector(
                  rate: line.taxRate,
                  onChanged: (r) {
                    line.taxRate = r;
                    onChanged();
                  },
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text('Amount', style: RunqText.caption.copyWith(color: t.muted)),
                    const SizedBox(height: 4),
                    Text(formatINR(line.amount + line.taxAmount),
                        style: RunqText.bodyStrong.copyWith(color: t.ink)),
                  ],
                ),
              ),
            ],
          ),
          if (canRemove) ...[
            const SizedBox(height: 6),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                onPressed: onRemove,
                icon: const Icon(Icons.delete_outline_rounded, size: 16),
                label: const Text('Remove'),
                style: TextButton.styleFrom(foregroundColor: RunqColors.redInk),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _UomDisplay extends StatelessWidget {
  final String uom;
  const _UomDisplay({required this.uom});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('UOM', style: RunqText.caption.copyWith(color: t.muted)),
        const SizedBox(height: 4),
        Container(
          height: 44,
          alignment: Alignment.centerLeft,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(
            color: t.inputFill,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: t.hairline, width: 0.5),
          ),
          child: Text(uom.isEmpty ? '—' : uom,
              style: RunqText.body.copyWith(color: uom.isEmpty ? t.muted : t.ink)),
        ),
      ],
    );
  }
}

class _GstSelector extends StatelessWidget {
  final double rate;
  final ValueChanged<double> onChanged;
  const _GstSelector({required this.rate, required this.onChanged});

  static const _options = [0.0, 5.0, 12.0, 18.0, 28.0];

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('GST', style: RunqText.caption.copyWith(color: t.muted)),
        const SizedBox(height: 4),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          decoration: BoxDecoration(
            color: t.inputFill,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: t.hairline, width: 0.5),
          ),
          child: DropdownButtonHideUnderline(
            child: DropdownButton<double>(
              value: _options.contains(rate) ? rate : 0,
              isExpanded: true,
              icon: Icon(Icons.expand_more_rounded, color: t.muted, size: 18),
              style: RunqText.body.copyWith(color: t.ink),
              items: _options
                  .map((r) => DropdownMenuItem<double>(
                        value: r,
                        child: Text('${r.toStringAsFixed(0)}%'),
                      ))
                  .toList(),
              onChanged: (v) {
                if (v != null) onChanged(v);
              },
            ),
          ),
        ),
      ],
    );
  }
}

class _ItemPickerRow extends StatelessWidget {
  final String? label;
  final String? uom;
  final VoidCallback onPick;
  const _ItemPickerRow({required this.label, required this.uom, required this.onPick});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final has = label != null;
    final display = has && uom != null && uom!.isNotEmpty ? '$label · $uom' : (label ?? 'Pick item');
    return InkWell(
      onTap: onPick,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: has ? RunqColors.indigo : t.hairline, width: 0.5),
        ),
        child: Row(
          children: [
            Icon(has ? Icons.inventory_2_rounded : Icons.search_rounded,
                size: 18, color: has ? RunqColors.indigo : t.muted),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                display,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: RunqText.body.copyWith(
                  color: has ? t.ink : t.muted,
                  fontWeight: has ? FontWeight.w600 : FontWeight.w400,
                ),
              ),
            ),
            Icon(Icons.chevron_right_rounded, color: t.muted2),
          ],
        ),
      ),
    );
  }
}

class _ItemPickerScreen extends StatefulWidget {
  const _ItemPickerScreen();

  @override
  State<_ItemPickerScreen> createState() => _ItemPickerScreenState();
}

class _ItemPickerScreenState extends State<_ItemPickerScreen> {
  final _ctrl = TextEditingController();
  Timer? _debounce;
  List<ItemSummary> _results = const [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _runQuery('');
  }

  @override
  void dispose() {
    _ctrl.dispose();
    _debounce?.cancel();
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
        title: const Text('Pick item'),
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
                decoration: _inputDecoration(t, hint: 'Search by name or SKU'),
              ),
              const SizedBox(height: 12),
              Expanded(child: _buildList(t)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildList(RunqTokens t) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(child: Text(_error!, style: RunqText.body.copyWith(color: RunqColors.redInk)));
    }
    if (_results.isEmpty) {
      return Center(child: Text('No items found', style: RunqText.body.copyWith(color: t.muted)));
    }
    return ListView.separated(
      itemCount: _results.length,
      separatorBuilder: (_, __) => Divider(height: 1, color: t.hairlineSoft),
      itemBuilder: (_, i) {
        final item = _results[i];
        return ListTile(
          title: Text(item.name, style: RunqText.bodyStrong.copyWith(color: t.ink)),
          subtitle: Text(
            [
              if (item.sku.isNotEmpty) 'SKU ${item.sku}',
              if (item.unit != null && item.unit!.isNotEmpty) item.unit!,
              if (item.defaultSellingPrice != null) formatINR(item.defaultSellingPrice!),
            ].join(' · '),
            style: RunqText.caption.copyWith(color: t.muted),
          ),
          trailing: Icon(Icons.chevron_right_rounded, color: t.muted2),
          onTap: () => Navigator.of(context).pop(item),
        );
      },
    );
  }
}

class _LineSummaryRow extends StatelessWidget {
  final _LineItem line;
  final bool canRemove;
  final VoidCallback onEdit;
  final VoidCallback onRemove;
  const _LineSummaryRow({
    required this.line,
    required this.canRemove,
    required this.onEdit,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final desc = line.description.isEmpty ? 'Untitled item' : line.description;
    final qty = line.quantity.isEmpty ? '0' : line.quantity;
    final price = line.unitPrice.isEmpty ? '0' : line.unitPrice;
    final metaParts = <String>[
      if (line.uom.isNotEmpty) line.uom,
      '$qty × ₹$price',
      if (line.taxRate > 0) 'GST ${line.taxRate.toStringAsFixed(0)}%',
    ];
    return InkWell(
      onTap: onEdit,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: t.hairline, width: 0.5),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    desc,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: RunqText.bodyStrong.copyWith(color: t.ink),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    metaParts.join(' · '),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: RunqText.caption.copyWith(color: t.muted),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Text(
              formatINR(line.amount + line.taxAmount),
              style: RunqText.tabular(size: 14, w: FontWeight.w600, color: t.ink),
            ),
            IconButton(
              icon: Icon(Icons.edit_outlined, size: 18, color: t.muted),
              onPressed: onEdit,
              visualDensity: VisualDensity.compact,
              tooltip: 'Edit',
            ),
            if (canRemove)
              IconButton(
                icon: const Icon(Icons.delete_outline_rounded, size: 18, color: RunqColors.redInk),
                onPressed: onRemove,
                visualDensity: VisualDensity.compact,
                tooltip: 'Remove',
              ),
          ],
        ),
      ),
    );
  }
}

class _EditLineSheet extends StatefulWidget {
  final _LineItem line;
  const _EditLineSheet({required this.line});

  @override
  State<_EditLineSheet> createState() => _EditLineSheetState();
}

class _EditLineSheetState extends State<_EditLineSheet> {
  late _LineItem _draft;

  @override
  void initState() {
    super.initState();
    _draft = _LineItem()
      ..itemId = widget.line.itemId
      ..description = widget.line.description
      ..uom = widget.line.uom
      ..quantity = widget.line.quantity
      ..unitPrice = widget.line.unitPrice
      ..taxRate = widget.line.taxRate;
  }

  void _save() {
    widget.line
      ..itemId = _draft.itemId
      ..description = _draft.description
      ..uom = _draft.uom
      ..quantity = _draft.quantity
      ..unitPrice = _draft.unitPrice
      ..taxRate = _draft.taxRate;
    Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final inset = MediaQuery.of(context).viewInsets.bottom;
    return Padding(
      padding: EdgeInsets.only(bottom: inset),
      child: Container(
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
        ),
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
        child: SingleChildScrollView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 36,
                  height: 4,
                  decoration: BoxDecoration(
                    color: t.hairline,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Text('Edit line item', style: RunqText.bodyStrong.copyWith(color: t.ink)),
              const SizedBox(height: 12),
              _ItemPickerRow(
                label: _draft.description.isEmpty ? null : _draft.description,
                uom: _draft.uom.isEmpty ? null : _draft.uom,
                onPick: () async {
                  final picked = await Navigator.of(context).push<ItemSummary>(
                    MaterialPageRoute(builder: (_) => const _ItemPickerScreen()),
                  );
                  if (picked != null) {
                    setState(() {
                      _draft.itemId = picked.id;
                      _draft.description = picked.name;
                      _draft.uom = picked.unit ?? _draft.uom;
                      if (picked.defaultSellingPrice != null) {
                        _draft.unitPrice = picked.defaultSellingPrice!.toString();
                      }
                      if (picked.gstRate != null) _draft.taxRate = picked.gstRate!;
                    });
                  }
                },
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: _NumField(
                      label: 'Qty',
                      value: _draft.quantity,
                      hint: '0',
                      onChanged: (v) => setState(() => _draft.quantity = v),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _NumField(
                      label: 'Unit price',
                      value: _draft.unitPrice,
                      hint: '0.00',
                      onChanged: (v) => setState(() => _draft.unitPrice = v),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: _GstSelector(
                      rate: _draft.taxRate,
                      onChanged: (r) => setState(() => _draft.taxRate = r),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text('Amount', style: RunqText.caption.copyWith(color: t.muted)),
                        const SizedBox(height: 4),
                        Text(formatINR(_draft.amount + _draft.taxAmount),
                            style: RunqText.bodyStrong.copyWith(color: t.ink)),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.of(context).pop(false),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                      child: const Text('Cancel'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: FilledButton(
                      onPressed: _save,
                      style: FilledButton.styleFrom(
                        backgroundColor: RunqColors.indigo,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                      child: const Text('Save'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SummaryRow extends StatelessWidget {
  final String label, value;
  final bool bold;
  const _SummaryRow({required this.label, required this.value, this.bold = false});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final style = bold
        ? RunqText.bodyStrong.copyWith(color: t.ink)
        : RunqText.body.copyWith(color: t.muted);
    final valStyle = bold
        ? RunqText.tabular(size: 16, w: FontWeight.w700, color: t.ink)
        : RunqText.tabular(size: 14, w: FontWeight.w500, color: t.ink);
    return Row(
      children: [
        Expanded(child: Text(label, style: style)),
        Text(value, style: valStyle),
      ],
    );
  }
}
