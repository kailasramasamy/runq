import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../api/api_client.dart';
import '../api/models.dart';
import '../api/repos.dart';
import '../providers/data_providers.dart';
import '../theme/runq_tokens.dart';
import '../theme/runq_theme.dart';
import '../utils/format_inr.dart';
import '../widgets/runq_card.dart';
import '../widgets/runq_snack.dart';

/// Full editor for a draft bill. Lets the user fix anything that survived
/// AI extraction or post-save state — invoice number, dates, line items
/// (incl. HSN/tax), totals, TDS, notes. PUTs all changed fields at once.
class BillEditScreen extends ConsumerStatefulWidget {
  final String billId;
  const BillEditScreen({super.key, required this.billId});

  @override
  ConsumerState<BillEditScreen> createState() => _BillEditScreenState();
}

class _BillEditScreenState extends ConsumerState<BillEditScreen> {
  _EditState? _state;
  bool _saving = false;

  @override
  void dispose() {
    _state?.dispose();
    super.dispose();
  }

  void _ensureState(BillWithDetails bill) {
    _state ??= _EditState.fromBill(bill);
  }

  Future<bool> _confirmDuplicate(DuplicateMatch m) async {
    final result = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        icon: const Icon(Icons.warning_amber_rounded, color: RunqColors.amberInk, size: 32),
        title: const Text('Possible duplicate'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Another bill from this vendor already matches these details.',
              style: RunqText.body.copyWith(fontSize: 14),
            ),
            const SizedBox(height: 10),
            Text(
              'Bill #${m.invoiceNumber} · ${m.invoiceDate} · ${formatINR(m.totalAmount)}',
              style: RunqText.bodyStrong.copyWith(fontSize: 13),
            ),
            const SizedBox(height: 4),
            Text(
              m.reasonLabel,
              style: RunqText.caption.copyWith(color: RunqColors.amberInk, fontSize: 12),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Review')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: RunqColors.amberInk),
            child: const Text('Save anyway'),
          ),
        ],
      ),
    );
    return result == true;
  }

  Future<void> _save() async {
    final s = _state;
    if (s == null) return;
    final issues = s.validate();
    if (issues.isNotEmpty) {
      showRunqSnack(context, issues.first, kind: SnackKind.error);
      return;
    }
    // Duplicate check — covers the case where edits push this bill into
    // matching another existing one. Skip if check fails.
    final bill = ref.read(billDetailProvider(widget.billId)).asData?.value;
    if (bill != null) {
      try {
        final invoiceDate = DateTime.tryParse(s.invoiceDate.text.trim());
        final total = double.tryParse(s.totalAmount.text) ?? 0;
        if (invoiceDate != null && total > 0 && s.invoiceNumber.text.trim().isNotEmpty) {
          final matches = await billsRepo.checkDuplicates(
            vendorId: bill.vendorId,
            invoiceNumber: s.invoiceNumber.text.trim(),
            invoiceDate: invoiceDate,
            totalAmount: total,
          );
          // Exclude self.
          final others = matches.where((m) => m.id != widget.billId).toList();
          if (others.isNotEmpty && mounted) {
            final ok = await _confirmDuplicate(others.first);
            if (!ok) return;
          }
        }
      } catch (_) {/* best-effort */}
    }
    if (!mounted) return;
    setState(() => _saving = true);
    try {
      await billsRepo.update(
        widget.billId,
        invoiceNumber: s.invoiceNumber.text.trim(),
        invoiceDate: DateTime.tryParse(s.invoiceDate.text.trim()),
        dueDate: DateTime.tryParse(s.dueDate.text.trim()),
        items: s.items.map((it) => it.toJson()).toList(),
        subtotal: double.tryParse(s.subtotal.text) ?? 0,
        taxAmount: double.tryParse(s.taxAmount.text) ?? 0,
        totalAmount: double.tryParse(s.totalAmount.text) ?? 0,
        notes: s.notes.text.trim().isEmpty ? null : s.notes.text.trim(),
        tdsSection: s.tdsSection.text.trim().isEmpty ? null : s.tdsSection.text.trim(),
      );
      if (!mounted) return;
      ref.invalidate(billDetailProvider(widget.billId));
      ref.invalidate(billsProvider(const BillFilter()));
      ref.invalidate(billsSummaryProvider);
      ref.invalidate(activityProvider);
      showRunqSnack(context, 'Bill updated', kind: SnackKind.success);
      context.pop();
    } on ApiException catch (e) {
      if (!mounted) return;
      final details = e.body?['details'];
      String msg = e.message;
      if (details is List && details.isNotEmpty) {
        msg = details
            .take(3)
            .map((d) {
              if (d is! Map) return d.toString();
              final field = (d['field'] ?? '').toString().replaceAll('.', ' ');
              return '$field: ${d['message']}';
            })
            .join(' · ');
      }
      showRunqSnack(context, msg, kind: SnackKind.error);
    } catch (_) {
      if (mounted) showRunqSnack(context, 'Could not save the bill.', kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final detail = ref.watch(billDetailProvider(widget.billId));

    return Scaffold(
      backgroundColor: t.bgWarm,
      body: SafeArea(
        child: detail.when(
          data: (bill) {
            _ensureState(bill);
            final s = _state!;
            final issues = s.validate();
            final hasErrors = issues.isNotEmpty;
            return Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(8, 8, 8, 4),
                  child: Row(
                    children: [
                      IconButton(
                        icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
                        onPressed: () => context.pop(),
                      ),
                      Expanded(child: Center(child: Text('Edit bill', style: RunqText.bodyStrong))),
                      const SizedBox(width: 40),
                    ],
                  ),
                ),
                Expanded(
                  child: ListView(
                    physics: const BouncingScrollPhysics(),
                    keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                    children: [
                      if (hasErrors) ...[
                        _IssuesBanner(issues: issues),
                        const SizedBox(height: 12),
                      ],
                      _Section(
                        title: 'INVOICE',
                        children: [
                          _Input(controller: s.invoiceNumber, label: 'Bill #', mono: true, required: true, onChange: () => setState(() {})),
                          _Input(controller: s.invoiceDate, label: 'Bill date (YYYY-MM-DD)', required: true, onChange: () => setState(() {})),
                          _Input(controller: s.dueDate, label: 'Due date (YYYY-MM-DD)', required: true, onChange: () => setState(() {})),
                          _Input(controller: s.tdsSection, label: 'TDS section', onChange: () => setState(() {})),
                        ],
                      ),
                      const SizedBox(height: 12),
                      _ItemsSection(state: s, onChange: () => setState(() {})),
                      const SizedBox(height: 12),
                      _TotalsSection(state: s, onChange: () => setState(() {})),
                      const SizedBox(height: 12),
                      _Section(
                        title: 'NOTES',
                        children: [
                          _Input(controller: s.notes, label: 'Internal notes', onChange: () => setState(() {})),
                        ],
                      ),
                      const SizedBox(height: 80),
                    ],
                  ),
                ),
                _Footer(saving: _saving, disabled: hasErrors, onSave: _save, onCancel: () => context.pop()),
              ],
            );
          },
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(child: Text('Failed to load: $e', style: RunqText.body)),
        ),
      ),
    );
  }
}

// ─── Editable state ────────────────────────────────────────────────────

class _EditableItem {
  final TextEditingController itemName;
  final TextEditingController hsnSacCode;
  final TextEditingController quantity;
  final TextEditingController unitPrice;
  final TextEditingController amount;
  final TextEditingController taxRate;

  _EditableItem.fromBillItem(BillItem item)
      : itemName = TextEditingController(text: item.itemName),
        hsnSacCode = TextEditingController(text: item.hsnSacCode ?? ''),
        quantity = TextEditingController(text: item.quantity.toString()),
        unitPrice = TextEditingController(text: item.unitPrice.toString()),
        amount = TextEditingController(text: item.amount.toString()),
        taxRate = TextEditingController(text: item.taxRate?.toString() ?? '');

  _EditableItem.empty()
      : itemName = TextEditingController(),
        hsnSacCode = TextEditingController(),
        quantity = TextEditingController(text: '1'),
        unitPrice = TextEditingController(text: '0'),
        amount = TextEditingController(text: '0'),
        taxRate = TextEditingController();

  void dispose() {
    itemName.dispose();
    hsnSacCode.dispose();
    quantity.dispose();
    unitPrice.dispose();
    amount.dispose();
    taxRate.dispose();
  }

  Map<String, dynamic> toJson() => {
        'itemName': itemName.text.trim(),
        if (hsnSacCode.text.trim().isNotEmpty) 'hsnSacCode': hsnSacCode.text.trim(),
        'quantity': double.tryParse(quantity.text) ?? 0,
        'unitPrice': double.tryParse(unitPrice.text) ?? 0,
        'amount': double.tryParse(amount.text) ?? 0,
        if (taxRate.text.trim().isNotEmpty) 'taxRate': double.tryParse(taxRate.text),
      };
}

class _EditState {
  final TextEditingController invoiceNumber;
  final TextEditingController invoiceDate;
  final TextEditingController dueDate;
  final TextEditingController subtotal;
  final TextEditingController taxAmount;
  final TextEditingController totalAmount;
  final TextEditingController tdsSection;
  final TextEditingController notes;
  final List<_EditableItem> items;

  _EditState.fromBill(BillWithDetails b)
      : invoiceNumber = TextEditingController(text: b.invoiceNumber),
        invoiceDate = TextEditingController(text: b.invoiceDate.toIso8601String().substring(0, 10)),
        dueDate = TextEditingController(text: b.dueDate.toIso8601String().substring(0, 10)),
        subtotal = TextEditingController(text: b.subtotal.toString()),
        taxAmount = TextEditingController(text: b.taxAmount.toString()),
        totalAmount = TextEditingController(text: b.totalAmount.toString()),
        tdsSection = TextEditingController(),
        notes = TextEditingController(),
        items = b.items.map(_EditableItem.fromBillItem).toList();

  void addItem() => items.add(_EditableItem.empty());
  void removeItem(int idx) {
    if (idx >= 0 && idx < items.length) items.removeAt(idx).dispose();
  }

  void recomputeAmount(int idx) {
    if (idx < 0 || idx >= items.length) return;
    final it = items[idx];
    final qty = double.tryParse(it.quantity.text) ?? 0;
    final rate = double.tryParse(it.unitPrice.text) ?? 0;
    it.amount.text = (qty * rate).toStringAsFixed(2);
  }

  void recomputeSubtotal() {
    final sum = items.fold<double>(0, (s, it) => s + (double.tryParse(it.amount.text) ?? 0));
    subtotal.text = sum.toStringAsFixed(2);
  }

  List<String> validate() {
    final issues = <String>[];
    if (invoiceNumber.text.trim().isEmpty) issues.add('Bill number is required');
    if (DateTime.tryParse(invoiceDate.text.trim()) == null) issues.add('Bill date must be YYYY-MM-DD');
    if (DateTime.tryParse(dueDate.text.trim()) == null) issues.add('Due date must be YYYY-MM-DD');
    final total = double.tryParse(totalAmount.text) ?? 0;
    if (total <= 0) issues.add('Total must be greater than 0');
    if (items.isEmpty) issues.add('Add at least one line item');
    for (var i = 0; i < items.length; i++) {
      final it = items[i];
      if (it.itemName.text.trim().isEmpty) issues.add('Line ${i + 1}: item name is required');
      if ((double.tryParse(it.quantity.text) ?? 0) <= 0) issues.add('Line item ${i + 1}: quantity must be > 0');
      // Negative amounts are valid (discount lines, credit adjustments).
      // Only zero is meaningless on a bill line.
      if ((double.tryParse(it.amount.text) ?? 0) == 0) issues.add('Line item ${i + 1}: amount cannot be zero');
    }
    return issues;
  }

  void dispose() {
    invoiceNumber.dispose();
    invoiceDate.dispose();
    dueDate.dispose();
    subtotal.dispose();
    taxAmount.dispose();
    totalAmount.dispose();
    tdsSection.dispose();
    notes.dispose();
    for (final it in items) {
      it.dispose();
    }
  }
}

// ─── Widgets ───────────────────────────────────────────────────────────

class _Section extends StatelessWidget {
  final String title;
  final List<Widget> children;
  const _Section({required this.title, required this.children});

  @override
  Widget build(BuildContext context) {
    return RunqCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: RunqText.label.copyWith(fontSize: 11)),
          const SizedBox(height: 8),
          ...children,
        ],
      ),
    );
  }
}

class _ItemsSection extends StatelessWidget {
  final _EditState state;
  final VoidCallback onChange;
  const _ItemsSection({required this.state, required this.onChange});

  @override
  Widget build(BuildContext context) {
    return RunqCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('LINE ITEMS (${state.items.length})', style: RunqText.label.copyWith(fontSize: 11)),
              const Spacer(),
              TextButton.icon(
                onPressed: () {
                  state.addItem();
                  onChange();
                },
                icon: const Icon(Icons.add, size: 16),
                label: const Text('Add'),
                style: TextButton.styleFrom(foregroundColor: RunqColors.indigo),
              ),
            ],
          ),
          for (var i = 0; i < state.items.length; i++) ...[
            const SizedBox(height: 4),
            _ItemEditor(
              item: state.items[i],
              index: i,
              onRemove: state.items.length > 1
                  ? () {
                      state.removeItem(i);
                      state.recomputeSubtotal();
                      onChange();
                    }
                  : null,
              onAmountChange: () {
                state.recomputeSubtotal();
                onChange();
              },
              onQtyOrPriceChange: () {
                state.recomputeAmount(i);
                state.recomputeSubtotal();
                onChange();
              },
            ),
          ],
        ],
      ),
    );
  }
}

class _ItemEditor extends StatelessWidget {
  final _EditableItem item;
  final int index;
  final VoidCallback? onRemove;
  final VoidCallback onAmountChange, onQtyOrPriceChange;
  const _ItemEditor({
    required this.item,
    required this.index,
    required this.onRemove,
    required this.onAmountChange,
    required this.onQtyOrPriceChange,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(top: 6),
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: BoxDecoration(
        color: RT(context).bgWarm,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: RT(context).hairline, width: 0.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('Item ${index + 1}', style: RunqText.label.copyWith(fontSize: 10)),
              const Spacer(),
              if (onRemove != null)
                IconButton(
                  onPressed: onRemove,
                  icon: const Icon(Icons.close, size: 16),
                  visualDensity: VisualDensity.compact,
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                  color: RT(context).muted,
                ),
            ],
          ),
          _Input(controller: item.itemName, label: 'Item name', required: true, onChange: onAmountChange),
          _Input(controller: item.hsnSacCode, label: 'HSN / SAC', mono: true, onChange: onAmountChange),
          Row(
            children: [
              Expanded(child: _Input(controller: item.quantity, label: 'Qty', keyboard: const TextInputType.numberWithOptions(decimal: true), onChange: onQtyOrPriceChange)),
              const SizedBox(width: 8),
              Expanded(child: _Input(controller: item.unitPrice, label: 'Unit ₹', keyboard: const TextInputType.numberWithOptions(decimal: true), onChange: onQtyOrPriceChange)),
            ],
          ),
          Row(
            children: [
              Expanded(child: _Input(controller: item.amount, label: 'Amount ₹', keyboard: const TextInputType.numberWithOptions(decimal: true), onChange: onAmountChange)),
              const SizedBox(width: 8),
              Expanded(child: _Input(controller: item.taxRate, label: 'Tax %', keyboard: const TextInputType.numberWithOptions(decimal: true), onChange: onAmountChange)),
            ],
          ),
        ],
      ),
    );
  }
}

class _TotalsSection extends StatelessWidget {
  final _EditState state;
  final VoidCallback onChange;
  const _TotalsSection({required this.state, required this.onChange});

  @override
  Widget build(BuildContext context) {
    final subtotal = double.tryParse(state.subtotal.text) ?? 0;
    final tax = double.tryParse(state.taxAmount.text) ?? 0;
    final total = double.tryParse(state.totalAmount.text) ?? 0;
    final mismatch = total > 0 && (subtotal + tax - total).abs() > 2;
    return RunqCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('TOTALS', style: RunqText.label.copyWith(fontSize: 11)),
          const SizedBox(height: 8),
          _Input(controller: state.subtotal, label: 'Subtotal ₹', keyboard: const TextInputType.numberWithOptions(decimal: true), onChange: onChange),
          _Input(controller: state.taxAmount, label: 'Tax ₹', keyboard: const TextInputType.numberWithOptions(decimal: true), onChange: onChange),
          _Input(controller: state.totalAmount, label: 'Total ₹', keyboard: const TextInputType.numberWithOptions(decimal: true), onChange: onChange),
          if (mismatch) ...[
            const SizedBox(height: 6),
            Text(
              'Subtotal + Tax (${formatINR(subtotal + tax)}) ≠ Total (${formatINR(total)})',
              style: RunqText.caption.copyWith(color: RunqColors.amberInk, fontSize: 11),
            ),
          ],
        ],
      ),
    );
  }
}

class _Input extends StatelessWidget {
  final TextEditingController controller;
  final String label;
  final bool required, mono;
  final TextInputType? keyboard;
  final VoidCallback? onChange;

  const _Input({
    required this.controller,
    required this.label,
    this.required = false,
    this.mono = false,
    this.keyboard,
    this.onChange,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Text(label.toUpperCase(), style: RunqText.label.copyWith(fontSize: 10)),
            if (required) const Text(' *', style: TextStyle(color: RunqColors.redInk, fontSize: 10)),
          ]),
          const SizedBox(height: 2),
          TextField(
            controller: controller,
            keyboardType: keyboard,
            textCapitalization: keyboard?.toString().contains('numberWithOptions') == true
                ? TextCapitalization.none
                : TextCapitalization.sentences,
            inputFormatters: keyboard?.toString().contains('numberWithOptions') == true
                ? [FilteringTextInputFormatter.allow(RegExp(r'[0-9.\-]'))]
                : null,
            onChanged: (_) => onChange?.call(),
            style: RunqText.body.copyWith(
              fontSize: 14,
              fontFamily: mono ? 'monospace' : null,
            ),
            decoration: InputDecoration(
              isDense: true,
              contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(6),
                borderSide: BorderSide(color: RT(context).hairline),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(6),
                borderSide: BorderSide(color: RT(context).hairline),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(6),
                borderSide: const BorderSide(color: RunqColors.indigo, width: 1.5),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _IssuesBanner extends StatelessWidget {
  final List<String> issues;
  const _IssuesBanner({required this.issues});

  @override
  Widget build(BuildContext context) {
    final ink = RunqColors.redInk;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: RunqColors.redBg.withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: ink.withValues(alpha: 0.18), width: 0.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Icon(Icons.error_outline_rounded, size: 16, color: ink),
            const SizedBox(width: 8),
            Text('Fix before saving:', style: RunqText.bodyStrong.copyWith(color: ink, fontSize: 13)),
          ]),
          const SizedBox(height: 6),
          ...issues.take(6).map((msg) => Padding(
                padding: const EdgeInsets.only(left: 24, top: 2),
                child: Text('• $msg', style: RunqText.caption.copyWith(color: ink, fontSize: 12)),
              )),
          if (issues.length > 6)
            Padding(
              padding: const EdgeInsets.only(left: 24, top: 2),
              child: Text('… and ${issues.length - 6} more', style: RunqText.caption.copyWith(color: ink, fontSize: 12)),
            ),
        ],
      ),
    );
  }
}

class _Footer extends StatelessWidget {
  final bool saving, disabled;
  final VoidCallback onSave, onCancel;
  const _Footer({required this.saving, required this.disabled, required this.onSave, required this.onCancel});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        border: Border(top: BorderSide(color: t.hairline, width: 0.5)),
      ),
      padding: EdgeInsets.fromLTRB(16, 12, 16, 12 + MediaQuery.of(context).padding.bottom),
      child: Row(
        children: [
          Expanded(
            child: SizedBox(
              height: 48,
              child: OutlinedButton(
                onPressed: saving ? null : onCancel,
                style: OutlinedButton.styleFrom(
                  side: BorderSide(color: t.hairline, width: 0.5),
                  foregroundColor: t.ink,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                child: const Text('Cancel'),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: SizedBox(
              height: 48,
              child: FilledButton(
                onPressed: saving || disabled ? null : onSave,
                child: saving
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Text('Save'),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
