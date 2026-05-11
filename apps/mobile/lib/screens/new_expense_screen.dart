import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../api/api_client.dart';
import '../api/repos.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../utils/format_inr.dart';
import '../widgets/runq_snack.dart';
import 'expenses_screen.dart' show expensesProvider;

const _categories = [
  'Travel',
  'Meals',
  'Accommodation',
  'Supplies',
  'Communication',
  'Transport',
  'Other',
];

class _Item {
  DateTime date;
  String category;
  String description;
  double amount;
  _Item({
    required this.date,
    required this.category,
    required this.description,
    required this.amount,
  });
}

/// Form for recording a new expense claim. Items aren't edited inline —
/// each item is captured via a focused bottom sheet so the parent screen
/// stays scannable. Owner-as-claimant flow: tap Record → server creates
/// draft, auto-submits, auto-approves so the entry lands in "Awaiting
/// reimbursement" without further taps.
class NewExpenseScreen extends ConsumerStatefulWidget {
  const NewExpenseScreen({super.key});

  @override
  ConsumerState<NewExpenseScreen> createState() => _NewExpenseScreenState();
}

class _NewExpenseScreenState extends ConsumerState<NewExpenseScreen> {
  final _descCtrl = TextEditingController();
  DateTime _claimDate = DateTime.now();
  final List<_Item> _items = [];
  bool _saving = false;

  @override
  void dispose() {
    _descCtrl.dispose();
    super.dispose();
  }

  double get _total => _items.fold<double>(0, (s, it) => s + it.amount);

  String _isoDate(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  Future<void> _addItem() async {
    final picked = await _showItemSheet(context);
    if (picked != null) setState(() => _items.add(picked));
  }

  Future<void> _editItem(int idx) async {
    final picked = await _showItemSheet(context, existing: _items[idx]);
    if (picked != null) setState(() => _items[idx] = picked);
  }

  void _removeItem(int idx) => setState(() => _items.removeAt(idx));

  Future<void> _save({required bool autoApprove}) async {
    if (_items.isEmpty) {
      showRunqSnack(context, 'Add at least one item.', kind: SnackKind.error);
      return;
    }
    setState(() => _saving = true);
    try {
      final created = await expensesRepo.create(
        claimDate: _claimDate,
        description: _descCtrl.text.trim().isEmpty ? null : _descCtrl.text.trim(),
        items: _items
            .map((it) => <String, dynamic>{
                  'expenseDate': _isoDate(it.date),
                  'category': it.category,
                  'description': it.description.trim(),
                  'amount': it.amount,
                })
            .toList(),
      );
      if (autoApprove) {
        try {
          final submitted = await expensesRepo.submit(created.id);
          await expensesRepo.approve(submitted.id, approved: true);
        } catch (_) {/* keep as draft, user can retry */}
      }
      if (!mounted) return;
      ref.invalidate(expensesProvider);
      showRunqSnack(context,
          autoApprove ? 'Expense ${created.claimNumber} recorded.' : 'Saved as draft.');
      context.pushReplacement('/expenses/${created.id}');
    } on ApiException catch (e) {
      if (mounted) showRunqSnack(context, e.message, kind: SnackKind.error);
    } catch (_) {
      if (mounted) showRunqSnack(context, 'Could not save expense.', kind: SnackKind.error);
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
        title: const Text('New expense'),
        leading: IconButton(
          icon: const Icon(Icons.close_rounded),
          onPressed: () => context.pop(),
        ),
      ),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: ListView(
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
                children: [
                  _SectionCard(
                    title: 'About',
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _DateField(
                          label: 'Claim date',
                          value: _claimDate,
                          onChanged: (d) => setState(() => _claimDate = d),
                        ),
                        const SizedBox(height: 12),
                        _LabeledField(
                          label: 'Description (optional)',
                          child: TextField(
                            controller: _descCtrl,
                            textCapitalization: TextCapitalization.sentences,
                            decoration: fieldDecoration(t, hint: 'e.g. Vrindavan farm visit'),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  _SectionCard(
                    title: 'Items',
                    trailingCount: _items.length,
                    child: _items.isEmpty
                        ? _EmptyItems(onAdd: _addItem)
                        : Column(
                            children: [
                              for (var i = 0; i < _items.length; i++) ...[
                                if (i > 0) Divider(height: 1, thickness: 0.5, color: t.hairline),
                                _ItemRow(
                                  item: _items[i],
                                  onTap: () => _editItem(i),
                                  onRemove: () => _removeItem(i),
                                ),
                              ],
                              const SizedBox(height: 8),
                              _AddItemButton(onTap: _addItem),
                            ],
                          ),
                  ),
                  const SizedBox(height: 12),
                  _SectionCard(
                    title: 'Total',
                    child: Row(
                      children: [
                        Expanded(
                          child: Text('Will reimburse',
                              style: RunqText.bodyStrong.copyWith(color: t.ink)),
                        ),
                        Text(formatINR(_total),
                            style: RunqText.tabular(size: 18, w: FontWeight.w700, color: t.ink)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            _Footer(
              total: _total,
              saving: _saving,
              hasItems: _items.isNotEmpty,
              onRecord: () => _save(autoApprove: true),
              onDraft: () => _save(autoApprove: false),
            ),
          ],
        ),
      ),
    );
  }
}

/// Active form-field decoration for new_expense + the item sheet. White
/// background (light) / surface (dark) gives clear "interactive" affordance
/// against the warm card around it — `inputFill` was reading as disabled.
InputDecoration fieldDecoration(RunqTokens t, {String? hint, String? prefix}) {
  final isDark = WidgetsBinding.instance.platformDispatcher.platformBrightness == Brightness.dark;
  final fill = isDark ? t.surface : Colors.white;
  return InputDecoration(
    isDense: true,
    filled: true,
    fillColor: fill,
    hintText: hint,
    prefixText: prefix,
    hintStyle: RunqText.body.copyWith(color: t.muted2),
    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(10),
      borderSide: BorderSide(color: t.hairline),
    ),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(10),
      borderSide: BorderSide(color: t.hairline),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(10),
      borderSide: const BorderSide(color: RunqColors.indigo, width: 1.5),
    ),
  );
}

class _SectionCard extends StatelessWidget {
  final String title;
  final Widget child;
  final int? trailingCount;
  const _SectionCard({required this.title, required this.child, this.trailingCount});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(title.toUpperCase(),
                  style: RunqText.caption.copyWith(
                    fontSize: 10.5,
                    color: t.muted,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.6,
                  )),
              if (trailingCount != null && trailingCount! > 0) ...[
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                  decoration: BoxDecoration(
                    color: t.hairlineSoft,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text('$trailingCount',
                      style: RunqText.caption.copyWith(
                        fontSize: 10.5,
                        color: t.muted,
                        fontWeight: FontWeight.w700,
                      )),
                ),
              ],
            ],
          ),
          const SizedBox(height: 10),
          child,
        ],
      ),
    );
  }
}

class _LabeledField extends StatelessWidget {
  final String label;
  final Widget child;
  const _LabeledField({required this.label, required this.child});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: RunqText.caption.copyWith(color: t.muted, fontSize: 11)),
        const SizedBox(height: 4),
        child,
      ],
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
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final fill = isDark ? t.surface : Colors.white;
    final text = '${value.day.toString().padLeft(2, '0')}/${value.month.toString().padLeft(2, '0')}/${value.year}';
    return _LabeledField(
      label: label,
      child: InkWell(
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
            color: fill,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: t.hairline),
          ),
          child: Row(
            children: [
              Icon(Icons.calendar_today_rounded, size: 14, color: t.muted),
              const SizedBox(width: 8),
              Expanded(
                child: FittedBox(
                  alignment: Alignment.centerLeft,
                  fit: BoxFit.scaleDown,
                  child: Text(text, style: RunqText.body.copyWith(color: t.ink)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _EmptyItems extends StatelessWidget {
  final VoidCallback onAdd;
  const _EmptyItems({required this.onAdd});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Text('No items yet',
              style: RunqText.caption.copyWith(color: t.muted, fontSize: 12)),
        ),
        _AddItemButton(onTap: onAdd, primary: true),
      ],
    );
  }
}

class _AddItemButton extends StatelessWidget {
  final VoidCallback onTap;
  final bool primary;
  const _AddItemButton({required this.onTap, this.primary = false});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: primary ? RunqColors.indigo.withValues(alpha: 0.08) : Colors.transparent,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: primary ? RunqColors.indigo.withValues(alpha: 0.30) : t.hairline,
            width: primary ? 1 : 0.8,
            style: primary ? BorderStyle.solid : BorderStyle.solid,
          ),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.add_rounded, size: 16, color: RunqColors.indigo),
            const SizedBox(width: 6),
            Text('Add item',
                style: RunqText.bodyStrong.copyWith(
                  color: RunqColors.indigo,
                  fontSize: 13,
                )),
          ],
        ),
      ),
    );
  }
}

class _ItemRow extends StatelessWidget {
  final _Item item;
  final VoidCallback onTap;
  final VoidCallback onRemove;
  const _ItemRow({required this.item, required this.onTap, required this.onRemove});

  String _date(DateTime d) {
    const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${d.day} ${m[d.month - 1]}';
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final tint = _categoryTint(item.category);
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 10),
          child: Row(
            children: [
              Container(
                width: 36, height: 36,
                decoration: BoxDecoration(
                  color: tint.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(_categoryIcon(item.category), size: 18, color: tint),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.description.isEmpty ? item.category : item.description,
                      style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 14),
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 2),
                    Text('${item.category} · ${_date(item.date)}',
                        style: RunqText.caption.copyWith(color: t.muted, fontSize: 11)),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Text(formatINR(item.amount),
                  style: RunqText.tabular(size: 14, w: FontWeight.w700, color: t.ink)),
              IconButton(
                onPressed: onRemove,
                icon: Icon(Icons.close_rounded, size: 16, color: t.muted2),
                visualDensity: VisualDensity.compact,
                tooltip: 'Remove',
              ),
            ],
          ),
        ),
      ),
    );
  }
}

Color _categoryTint(String c) {
  switch (c) {
    case 'Travel': return const Color(0xFF06B6D4);
    case 'Meals': return const Color(0xFFF59E0B);
    case 'Accommodation': return const Color(0xFF7C3AED);
    case 'Supplies': return const Color(0xFF10B981);
    case 'Communication': return const Color(0xFF3B82F6);
    case 'Transport': return const Color(0xFF6366F1);
    default: return const Color(0xFF71717A);
  }
}

IconData _categoryIcon(String c) {
  switch (c) {
    case 'Travel': return Icons.flight_takeoff_rounded;
    case 'Meals': return Icons.restaurant_rounded;
    case 'Accommodation': return Icons.hotel_rounded;
    case 'Supplies': return Icons.shopping_bag_outlined;
    case 'Communication': return Icons.phone_in_talk_rounded;
    case 'Transport': return Icons.directions_car_rounded;
    default: return Icons.receipt_outlined;
  }
}

class _Footer extends StatelessWidget {
  final double total;
  final bool saving;
  final bool hasItems;
  final VoidCallback onRecord;
  final VoidCallback onDraft;
  const _Footer({
    required this.total,
    required this.saving,
    required this.hasItems,
    required this.onRecord,
    required this.onDraft,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final blocked = !hasItems;
    return Container(
      padding: EdgeInsets.fromLTRB(16, 10, 16, 10 + MediaQuery.of(context).viewPadding.bottom),
      decoration: BoxDecoration(
        color: t.bgWarm,
        border: Border(top: BorderSide(color: t.hairline, width: 0.5)),
      ),
      child: Row(
        children: [
          Expanded(
            flex: 1,
            child: OutlinedButton(
              onPressed: saving || blocked ? null : onDraft,
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
                side: BorderSide(color: t.hairline),
                foregroundColor: t.ink,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: const Text('Save draft'),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            flex: 2,
            child: FilledButton.icon(
              onPressed: saving || blocked ? null : onRecord,
              style: FilledButton.styleFrom(
                backgroundColor: blocked ? t.muted2 : RunqColors.indigo,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              icon: saving
                  ? const SizedBox(
                      width: 16, height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Icon(Icons.check_rounded, size: 18),
              label: Text(saving ? 'Saving…' : 'Record · ${formatINR(total)}'),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Item entry sheet ──────────────────────────────────────────────────────

Future<_Item?> _showItemSheet(BuildContext context, {_Item? existing}) {
  return showModalBottomSheet<_Item>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _ItemSheet(existing: existing),
  );
}

class _ItemSheet extends StatefulWidget {
  final _Item? existing;
  const _ItemSheet({this.existing});

  @override
  State<_ItemSheet> createState() => _ItemSheetState();
}

class _ItemSheetState extends State<_ItemSheet> {
  late DateTime _date;
  late String _category;
  late TextEditingController _descCtrl;
  late TextEditingController _amountCtrl;

  @override
  void initState() {
    super.initState();
    final e = widget.existing;
    _date = e?.date ?? DateTime.now();
    _category = e?.category ?? 'Travel';
    _descCtrl = TextEditingController(text: e?.description ?? '');
    _amountCtrl = TextEditingController(text: e == null ? '' : (e.amount == 0 ? '' : e.amount.toString()));
  }

  @override
  void dispose() {
    _descCtrl.dispose();
    _amountCtrl.dispose();
    super.dispose();
  }

  void _save() {
    final amount = double.tryParse(_amountCtrl.text.trim()) ?? 0;
    if (amount <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter an amount greater than zero')),
      );
      return;
    }
    final desc = _descCtrl.text.trim();
    if (desc.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Add a short description so you can recognise this later')),
      );
      return;
    }
    Navigator.of(context).pop(_Item(
      date: _date,
      category: _category,
      description: desc,
      amount: amount,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final inset = MediaQuery.of(context).viewInsets.bottom;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final fieldFill = isDark ? t.surface : Colors.white;
    return Container(
      decoration: BoxDecoration(
        color: t.bgWarmer,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        border: Border(top: BorderSide(color: t.hairline, width: 0.5)),
      ),
      padding: EdgeInsets.fromLTRB(20, 12, 20, 16 + inset),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 40, height: 4,
              decoration: BoxDecoration(color: t.hairline, borderRadius: BorderRadius.circular(2)),
            ),
          ),
          const SizedBox(height: 14),
          Text(widget.existing == null ? 'Add expense item' : 'Edit item',
              style: RunqText.h3.copyWith(color: t.ink, fontSize: 18)),
          const SizedBox(height: 14),
          // Category chips — faster than a dropdown for short list, lets the
          // user see all options at once.
          Align(
            alignment: Alignment.centerLeft,
            child: Text('Category', style: RunqText.caption.copyWith(color: t.muted, fontSize: 11)),
          ),
          const SizedBox(height: 6),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final c in _categories)
                _CategoryChip(
                  label: c,
                  selected: _category == c,
                  onTap: () => setState(() => _category = c),
                ),
            ],
          ),
          const SizedBox(height: 14),
          _LabeledField(
            label: 'Description',
            child: TextField(
              controller: _descCtrl,
              textCapitalization: TextCapitalization.sentences,
              decoration: fieldDecoration(t, hint: 'What was it for?'),
              autofocus: widget.existing == null,
              textInputAction: TextInputAction.next,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                flex: 2,
                child: _LabeledField(
                  label: 'Amount',
                  child: TextField(
                    controller: _amountCtrl,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
                    decoration: fieldDecoration(t, hint: '0.00', prefix: '₹ '),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                flex: 3,
                child: _LabeledField(
                  label: 'Date',
                  child: InkWell(
                    onTap: () async {
                      final picked = await showDatePicker(
                        context: context,
                        initialDate: _date,
                        firstDate: DateTime(2020),
                        lastDate: DateTime(2100),
                      );
                      if (picked != null) setState(() => _date = picked);
                    },
                    borderRadius: BorderRadius.circular(10),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                      decoration: BoxDecoration(
                        color: fieldFill,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: t.hairline),
                      ),
                      child: Row(
                        children: [
                          Icon(Icons.calendar_today_rounded, size: 14, color: t.muted),
                          const SizedBox(width: 8),
                          Expanded(
                            child: FittedBox(
                              alignment: Alignment.centerLeft,
                              fit: BoxFit.scaleDown,
                              child: Text(
                                '${_date.day.toString().padLeft(2, '0')}/${_date.month.toString().padLeft(2, '0')}/${_date.year}',
                                style: RunqText.body.copyWith(color: t.ink),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () => Navigator.pop(context),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 13),
                    side: BorderSide(color: t.hairline),
                    foregroundColor: t.ink,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  child: const Text('Cancel'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                flex: 2,
                child: FilledButton(
                  onPressed: _save,
                  style: FilledButton.styleFrom(
                    backgroundColor: RunqColors.indigo,
                    padding: const EdgeInsets.symmetric(vertical: 13),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  child: Text(widget.existing == null ? 'Add item' : 'Save changes'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _CategoryChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _CategoryChip({required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final tint = _categoryTint(label);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(999),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
        decoration: BoxDecoration(
          color: selected ? tint.withValues(alpha: 0.14) : (Theme.of(context).brightness == Brightness.dark ? t.surface : Colors.white),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: selected ? tint : t.hairline, width: selected ? 1.2 : 0.5),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(_categoryIcon(label), size: 13, color: selected ? tint : t.muted),
            const SizedBox(width: 6),
            Text(label,
                style: RunqText.caption.copyWith(
                  fontSize: 12,
                  color: selected ? tint : t.ink,
                  fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                )),
          ],
        ),
      ),
    );
  }
}
