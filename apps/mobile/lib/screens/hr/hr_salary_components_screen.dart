// Salary components management — every tenant's atomic pay piece (basic,
// HRA, conveyance, PF, etc.). Built first because Structures + Payroll
// runs both reference these by id.
//
// Mirrors the web's components list: code chip + name + type + flags row.
// Seed-defaults action lights up when the list is empty.

library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/hr_models.dart';
import '../../api/hr_repo.dart';
import '../../providers/hr_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart';
import 'widgets/hr_colors.dart';
import 'widgets/hr_form.dart';

class HrSalaryComponentsScreen extends ConsumerWidget {
  const HrSalaryComponentsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final componentsAsync = ref.watch(hrSalaryComponentsProvider);

    Future<void> seed() async {
      try {
        await hrRepo.seedDefaultSalaryComponents();
        ref.invalidate(hrSalaryComponentsProvider);
        if (context.mounted) {
          showRunqSnack(context, 'Default components seeded', kind: SnackKind.success);
        }
      } catch (e) {
        if (context.mounted) {
          showRunqSnack(context, 'Seed failed: $e', kind: SnackKind.error);
        }
      }
    }

    return Scaffold(
      backgroundColor: t.bgWarm,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 12, 16, 4),
              child: Row(
                children: [
                  IconButton(
                    onPressed: () => Navigator.of(context).maybePop(),
                    icon: Icon(Icons.arrow_back_rounded, color: t.ink),
                  ),
                  const SizedBox(width: 4),
                  Text('Salary components', style: RunqText.h1.copyWith(color: t.ink)),
                ],
              ),
            ),
            Expanded(
              child: RefreshIndicator(
                color: HrColors.brand(context),
                onRefresh: () async {
                  ref.invalidate(hrSalaryComponentsProvider);
                  await Future<void>.delayed(const Duration(milliseconds: 250));
                },
                child: componentsAsync.when(
                  loading: () => const Center(child: CircularProgressIndicator(color: HrColors.teal)),
                  error: (e, _) => Center(child: Text('$e', style: RunqText.body.copyWith(color: t.muted))),
                  data: (rows) {
                    if (rows.isEmpty) {
                      return ListView(
                        physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
                        padding: const EdgeInsets.fromLTRB(16, 60, 16, 120),
                        children: [
                          Icon(Icons.tune_outlined, size: 40, color: t.muted2),
                          const SizedBox(height: 10),
                          Center(child: Text('No components yet',
                              style: RunqText.bodyStrong.copyWith(color: t.ink))),
                          const SizedBox(height: 6),
                          Center(child: Text(
                            'Start with the Indian preset (Basic / HRA / PF / ESI) or add your own.',
                            textAlign: TextAlign.center,
                            style: RunqText.caption.copyWith(color: t.muted),
                          )),
                          const SizedBox(height: 16),
                          Center(child: TextButton(onPressed: seed, child: const Text('Seed default components'))),
                        ],
                      );
                    }
                    // Group by type so the list reads as Earnings → Deductions → ...
                    final byType = <String, List<HrSalaryComponent>>{};
                    for (final c in rows) {
                      byType.putIfAbsent(c.type, () => []).add(c);
                    }
                    final keys = [
                      for (final t in hrSalaryComponentTypes) if (byType.containsKey(t)) t,
                    ];
                    return ListView(
                      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
                      padding: const EdgeInsets.fromLTRB(16, 4, 16, 120),
                      children: [
                        for (final k in keys) ...[
                          Padding(
                            padding: const EdgeInsets.fromLTRB(4, 8, 4, 6),
                            child: Text(
                              hrSalaryComponentTypeLabel(k).toUpperCase(),
                              style: RunqText.label.copyWith(color: t.muted2, letterSpacing: 0.5),
                            ),
                          ),
                          Container(
                            decoration: BoxDecoration(
                              color: t.surface,
                              borderRadius: BorderRadius.circular(RunqRadii.smallCard),
                              border: Border.all(color: t.hairline, width: 0.5),
                              boxShadow: RunqShadows.card,
                            ),
                            child: Column(
                              children: [
                                for (var i = 0; i < byType[k]!.length; i++) ...[
                                  _ComponentRow(
                                    c: byType[k]![i],
                                    onTap: () => _openEditor(context, ref, existing: byType[k]![i]),
                                    onDelete: () => _confirmDelete(context, ref, c: byType[k]![i]),
                                  ),
                                  if (i < byType[k]!.length - 1)
                                    Divider(height: 1, thickness: 0.5, color: t.hairlineSoft, indent: 14),
                                ],
                              ],
                            ),
                          ),
                          const SizedBox(height: 4),
                        ],
                      ],
                    );
                  },
                ),
              ),
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        heroTag: 'add-component',
        backgroundColor: HrColors.teal,
        foregroundColor: Colors.white,
        onPressed: () => _openEditor(context, ref),
        icon: const Icon(Icons.add_rounded),
        label: const Text('Add component'),
      ),
    );
  }
}

class _ComponentRow extends StatelessWidget {
  final HrSalaryComponent c;
  final VoidCallback onTap;
  final VoidCallback onDelete;
  const _ComponentRow({required this.c, required this.onTap, required this.onDelete});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: HrColors.tealSubtle,
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(
                c.code,
                style: RunqText.label.copyWith(color: HrColors.brand(context)),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(c.name, style: RunqText.bodyStrong.copyWith(color: t.ink)),
                  const SizedBox(height: 2),
                  Text(
                    [
                      hrSalaryCalcTypeLabel(c.calcType),
                      if (c.calcType == 'fixed')
                        '₹${c.defaultValue.toStringAsFixed(0)}'
                      else if (c.calcType.startsWith('percent'))
                        '${c.defaultValue.toStringAsFixed(c.defaultValue % 1 == 0 ? 0 : 2)}%',
                      if (!c.isTaxable) 'non-tax',
                      if (c.isPfApplicable) 'PF',
                      if (c.isEsiApplicable) 'ESI',
                      if (!c.isActive) 'inactive',
                    ].join(' · '),
                    style: RunqText.caption.copyWith(color: t.muted),
                  ),
                ],
              ),
            ),
            IconButton(
              icon: Icon(Icons.delete_outline_rounded, color: t.muted2, size: 18),
              visualDensity: VisualDensity.compact,
              onPressed: onDelete,
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Editor sheet ─────────────────────────────────────────────────────────

Future<void> _openEditor(
  BuildContext context,
  WidgetRef ref, {
  HrSalaryComponent? existing,
}) async {
  await showModalBottomSheet<void>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (_) => _ComponentEditor(existing: existing),
  );
  ref.invalidate(hrSalaryComponentsProvider);
}

class _ComponentEditor extends StatefulWidget {
  final HrSalaryComponent? existing;
  const _ComponentEditor({this.existing});
  @override
  State<_ComponentEditor> createState() => _ComponentEditorState();
}

class _ComponentEditorState extends State<_ComponentEditor> {
  late final TextEditingController _code, _name, _value, _order;
  late String _type, _calcType;
  late bool _isTaxable, _isPfApplicable, _isEsiApplicable, _isActive;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final e = widget.existing;
    _code = TextEditingController(text: e?.code ?? '');
    _name = TextEditingController(text: e?.name ?? '');
    _value = TextEditingController(
      text: e == null ? '' : (e.defaultValue == e.defaultValue.toInt()
          ? e.defaultValue.toInt().toString()
          : e.defaultValue.toStringAsFixed(2)),
    );
    _order = TextEditingController(text: e == null ? '0' : e.displayOrder.toString());
    _type = e?.type ?? 'earning';
    _calcType = e?.calcType ?? 'fixed';
    _isTaxable = e?.isTaxable ?? true;
    _isPfApplicable = e?.isPfApplicable ?? false;
    _isEsiApplicable = e?.isEsiApplicable ?? false;
    _isActive = e?.isActive ?? true;
  }

  @override
  void dispose() {
    _code.dispose();
    _name.dispose();
    _value.dispose();
    _order.dispose();
    super.dispose();
  }

  bool get _canSave =>
      _code.text.trim().isNotEmpty &&
      _name.text.trim().isNotEmpty &&
      double.tryParse(_value.text.trim()) != null;

  Future<void> _save() async {
    if (!_canSave || _saving) return;
    setState(() => _saving = true);
    final body = <String, dynamic>{
      'code': _code.text.trim().toUpperCase(),
      'name': _name.text.trim(),
      'type': _type,
      'calcType': _calcType,
      'defaultValue': double.parse(_value.text.trim()),
      'isTaxable': _isTaxable,
      'isPfApplicable': _isPfApplicable,
      'isEsiApplicable': _isEsiApplicable,
      'displayOrder': int.tryParse(_order.text.trim()) ?? 0,
      'isActive': _isActive,
    };
    try {
      if (widget.existing == null) {
        await hrRepo.createSalaryComponent(body);
      } else {
        await hrRepo.updateSalaryComponent(widget.existing!.id, body);
      }
      if (mounted) {
        Navigator.of(context).pop();
        showRunqSnack(context, widget.existing == null ? 'Component added' : 'Component updated',
            kind: SnackKind.success);
      }
    } catch (e) {
      if (mounted) {
        setState(() => _saving = false);
        showRunqSnack(context, 'Save failed: $e', kind: SnackKind.error);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final inset = MediaQuery.of(context).viewInsets.bottom;
    final valueLabel = _calcType == 'fixed' ? 'Default amount (₹)' : 'Default %';
    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.9,
      ),
      decoration: BoxDecoration(
        color: t.bgWarmer,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: EdgeInsets.fromLTRB(0, 12, 0, 16 + inset),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Center(
            child: Container(
              width: 36, height: 4,
              decoration: BoxDecoration(color: t.hairline, borderRadius: BorderRadius.circular(999)),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 14, 20, 6),
            child: Row(
              children: [
                Text(
                  widget.existing == null ? 'Add component' : 'Edit component',
                  style: RunqText.h3.copyWith(color: t.ink),
                ),
              ],
            ),
          ),
          Flexible(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
              child: Column(
                children: [
                  HrFormSection(children: [
                    HrTextField(
                      label: 'Code',
                      hint: 'BASIC · HRA · PF',
                      controller: _code,
                      required: true,
                      maxLength: 20,
                      textCapitalization: TextCapitalization.characters,
                      formatters: [FilteringTextInputFormatter.allow(RegExp(r'[A-Za-z0-9_]'))],
                      onChanged: (_) => setState(() {}),
                    ),
                    HrTextField(
                      label: 'Name',
                      hint: 'Basic Salary · House Rent Allowance',
                      controller: _name,
                      required: true,
                      textCapitalization: TextCapitalization.words,
                      onChanged: (_) => setState(() {}),
                    ),
                    HrSelectField<String>(
                      label: 'Type',
                      value: _type,
                      required: true,
                      options: hrSalaryComponentTypes,
                      display: hrSalaryComponentTypeLabel,
                      onChanged: (v) => setState(() => _type = v ?? 'earning'),
                    ),
                  ]),
                  const SizedBox(height: 12),
                  HrFormSection(title: 'Calculation', children: [
                    HrSelectField<String>(
                      label: 'Calc type',
                      value: _calcType,
                      required: true,
                      options: hrSalaryCalcTypes,
                      display: hrSalaryCalcTypeLabel,
                      onChanged: (v) => setState(() => _calcType = v ?? 'fixed'),
                    ),
                    HrTextField(
                      label: valueLabel,
                      controller: _value,
                      required: true,
                      keyboard: const TextInputType.numberWithOptions(decimal: true),
                      formatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
                      textCapitalization: TextCapitalization.none,
                      onChanged: (_) => setState(() {}),
                    ),
                    HrTextField(
                      label: 'Display order',
                      hint: '0 = first',
                      controller: _order,
                      keyboard: TextInputType.number,
                      formatters: [FilteringTextInputFormatter.digitsOnly],
                      textCapitalization: TextCapitalization.none,
                    ),
                  ]),
                  const SizedBox(height: 12),
                  HrFormSection(title: 'Statutory flags', children: [
                    HrToggleField(
                      label: 'Taxable',
                      sub: 'Counts toward TDS calculation when on.',
                      value: _isTaxable,
                      onChanged: (v) => setState(() => _isTaxable = v),
                    ),
                    HrToggleField(
                      label: 'PF applicable',
                      sub: 'Included in PF wages.',
                      value: _isPfApplicable,
                      onChanged: (v) => setState(() => _isPfApplicable = v),
                    ),
                    HrToggleField(
                      label: 'ESI applicable',
                      sub: 'Included in ESI wages.',
                      value: _isEsiApplicable,
                      onChanged: (v) => setState(() => _isEsiApplicable = v),
                    ),
                    if (widget.existing != null)
                      HrToggleField(
                        label: 'Active',
                        sub: 'When off, stays for historical structures but can\'t be added to new ones.',
                        value: _isActive,
                        onChanged: (v) => setState(() => _isActive = v),
                      ),
                  ]),
                ],
              ),
            ),
          ),
          const SizedBox(height: 14),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: SizedBox(
              width: double.infinity,
              child: HrSubmitButton(
                label: widget.existing == null ? 'Add component' : 'Save changes',
                loading: _saving,
                enabled: _canSave,
                onPressed: _save,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

Future<void> _confirmDelete(
  BuildContext context,
  WidgetRef ref, {
  required HrSalaryComponent c,
}) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (_) => AlertDialog(
      title: Text('Delete ${c.name}?'),
      content: const Text(
          'Server will refuse the delete if this component is in use on any salary structure.'),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
        TextButton(
          onPressed: () => Navigator.of(context).pop(true),
          style: TextButton.styleFrom(foregroundColor: const Color(0xFFDC2626)),
          child: const Text('Delete'),
        ),
      ],
    ),
  );
  if (ok != true) return;
  try {
    await hrRepo.deleteSalaryComponent(c.id);
    ref.invalidate(hrSalaryComponentsProvider);
    if (context.mounted) showRunqSnack(context, 'Component deleted', kind: SnackKind.success);
  } catch (e) {
    if (context.mounted) showRunqSnack(context, 'Delete failed: $e', kind: SnackKind.error);
  }
}
