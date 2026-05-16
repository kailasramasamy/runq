// Salary structures — named combinations of components with per-line
// values. List + create/edit form (header + dynamic lines).
//
// Each line picks a salary component (from the components master), then
// overrides value + calc type for this structure. Live total preview at
// the bottom of the form.

library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/hr_models.dart';
import '../../api/hr_repo.dart';
import '../../providers/hr_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart';
import 'widgets/hr_colors.dart';
import 'widgets/hr_form.dart';
import 'widgets/hr_widgets.dart';

// ─── List ─────────────────────────────────────────────────────────────────

class HrSalaryStructuresScreen extends ConsumerWidget {
  const HrSalaryStructuresScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final structuresAsync = ref.watch(hrSalaryStructuresProvider);

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
                  Text('Salary structures', style: RunqText.h1.copyWith(color: t.ink)),
                ],
              ),
            ),
            Expanded(
              child: RefreshIndicator(
                color: HrColors.brand(context),
                onRefresh: () async {
                  ref.invalidate(hrSalaryStructuresProvider);
                  await Future<void>.delayed(const Duration(milliseconds: 250));
                },
                child: structuresAsync.when(
                  loading: () => const Center(child: CircularProgressIndicator(color: HrColors.teal)),
                  error: (e, _) => Center(child: Text('$e', style: RunqText.body.copyWith(color: t.muted))),
                  data: (rows) {
                    if (rows.isEmpty) {
                      return ListView(
                        physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
                        padding: const EdgeInsets.fromLTRB(16, 60, 16, 120),
                        children: [
                          Icon(Icons.layers_outlined, size: 40, color: t.muted2),
                          const SizedBox(height: 10),
                          Center(child: Text('No structures yet',
                              style: RunqText.bodyStrong.copyWith(color: t.ink))),
                          const SizedBox(height: 4),
                          Center(child: Text('A structure bundles components into a single pay package.',
                              textAlign: TextAlign.center,
                              style: RunqText.caption.copyWith(color: t.muted))),
                        ],
                      );
                    }
                    return ListView.builder(
                      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
                      padding: const EdgeInsets.fromLTRB(16, 4, 16, 120),
                      itemCount: rows.length,
                      itemBuilder: (_, i) => _StructureRow(s: rows[i]),
                    );
                  },
                ),
              ),
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        heroTag: 'add-structure',
        backgroundColor: HrColors.teal,
        foregroundColor: Colors.white,
        onPressed: () => context.push('/hr/salary-structures/new'),
        icon: const Icon(Icons.add_rounded),
        label: const Text('Add structure'),
      ),
    );
  }
}

class _StructureRow extends ConsumerWidget {
  final HrSalaryStructure s;
  const _StructureRow({required this.s});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final compCount = s.components.length;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
        boxShadow: RunqShadows.card,
      ),
      child: InkWell(
        onTap: () => context.push('/hr/salary-structures/${s.id}/edit'),
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          child: Row(
            children: [
              Container(
                width: 40, height: 40,
                decoration: BoxDecoration(
                  color: HrColors.tealSubtle,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(Icons.layers_outlined, color: HrColors.brand(context), size: 20),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(s.name,
                        maxLines: 1, overflow: TextOverflow.ellipsis,
                        style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 14)),
                    if (s.description != null && s.description!.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(s.description!,
                          maxLines: 1, overflow: TextOverflow.ellipsis,
                          style: RunqText.caption.copyWith(color: t.muted, fontSize: 11.5)),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 8),
              HrStatusBadge(
                status: 'draft', // neutral slate styling
                label: '$compCount component${compCount == 1 ? '' : 's'}',
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Create / Edit form ──────────────────────────────────────────────────

class HrSalaryStructureFormScreen extends ConsumerStatefulWidget {
  /// If non-null, fetches + prefills (edit mode); else create.
  final String? id;
  const HrSalaryStructureFormScreen({super.key, this.id});

  @override
  ConsumerState<HrSalaryStructureFormScreen> createState() => _HrSalaryStructureFormScreenState();
}

class _HrSalaryStructureFormScreenState extends ConsumerState<HrSalaryStructureFormScreen> {
  final _name = TextEditingController();
  final _description = TextEditingController();
  final List<_StructureLineState> _lines = [];
  bool _loading = false;
  bool _saving = false;

  bool get _isEdit => widget.id != null;

  @override
  void initState() {
    super.initState();
    if (_isEdit) {
      _loadExisting();
    }
  }

  Future<void> _loadExisting() async {
    setState(() => _loading = true);
    try {
      final s = await hrRepo.salaryStructure(widget.id!);
      if (!mounted) return;
      _name.text = s.name;
      _description.text = s.description ?? '';
      _lines.addAll(s.components.map(_StructureLineState.fromLine));
      setState(() => _loading = false);
    } catch (e) {
      if (mounted) {
        setState(() => _loading = false);
        showRunqSnack(context, 'Could not load: $e', kind: SnackKind.error);
      }
    }
  }

  @override
  void dispose() {
    _name.dispose();
    _description.dispose();
    for (final l in _lines) {
      l.dispose();
    }
    super.dispose();
  }

  bool get _canSave {
    if (_name.text.trim().isEmpty) return false;
    if (_lines.isEmpty) return false;
    for (final l in _lines) {
      if (!l.isValid) return false;
    }
    // Same component picked twice would silently double — block at the
    // form level so users see the issue before the server complains.
    final ids = _lines.map((l) => l.componentId).whereType<String>().toList();
    if (ids.toSet().length != ids.length) return false;
    return true;
  }

  Future<void> _save() async {
    if (!_canSave || _saving) return;
    setState(() => _saving = true);
    final components = _lines.map((l) => l.toPayload()).toList();
    try {
      if (_isEdit) {
        await hrRepo.updateSalaryStructure(
          widget.id!,
          name: _name.text.trim(),
          description: _description.text.trim(),
          components: components,
        );
      } else {
        await hrRepo.createSalaryStructure(
          name: _name.text.trim(),
          description: _description.text.trim(),
          components: components,
        );
      }
      ref.invalidate(hrSalaryStructuresProvider);
      if (_isEdit) ref.invalidate(hrSalaryStructureProvider(widget.id!));
      if (mounted) {
        Navigator.of(context).pop();
        showRunqSnack(context, _isEdit ? 'Structure updated' : 'Structure created',
            kind: SnackKind.success);
      }
    } catch (e) {
      if (mounted) {
        setState(() => _saving = false);
        showRunqSnack(context, 'Save failed: $e', kind: SnackKind.error);
      }
    }
  }

  void _addLine() {
    setState(() => _lines.add(_StructureLineState.blank()));
  }

  void _removeLine(int i) {
    setState(() {
      _lines[i].dispose();
      _lines.removeAt(i);
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    if (_loading) {
      return Scaffold(
        backgroundColor: t.bgWarm,
        body: const Center(child: CircularProgressIndicator(color: HrColors.teal)),
      );
    }
    final componentsAsync = ref.watch(hrSalaryComponentsProvider);
    final allComponents = componentsAsync.asData?.value ?? const [];
    // Sum of fixed-amount lines only — percentages need a base, which
    // we can't compute until structure is applied to an employee CTC.
    final fixedTotal = _lines
        .where((l) => l.calcType == 'fixed')
        .fold<double>(0, (s, l) => s + (l.value ?? 0));

    return HrFormScreen(
      title: _isEdit ? 'Edit structure' : 'New structure',
      bottomAction: HrSubmitButton(
        label: _isEdit ? 'Save changes' : 'Create structure',
        loading: _saving,
        enabled: _canSave,
        onPressed: _save,
      ),
      body: Column(
        children: [
          HrFormSection(title: 'Structure', children: [
            HrTextField(
              label: 'Name',
              hint: 'Junior Engineer · Manager Plus',
              controller: _name,
              required: true,
              textCapitalization: TextCapitalization.words,
              onChanged: (_) => setState(() {}),
            ),
            HrTextField(
              label: 'Description',
              controller: _description,
              maxLines: 2,
              textCapitalization: TextCapitalization.sentences,
            ),
          ]),
          const SizedBox(height: 14),
          Row(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(4, 0, 4, 6),
                child: Text(
                  'COMPONENTS',
                  style: TextStyle(
                    color: t.muted2, fontSize: 11, fontWeight: FontWeight.w600, letterSpacing: 0.5,
                  ),
                ),
              ),
              const Spacer(),
              if (fixedTotal > 0)
                Text(
                  'Fixed ${hrFormatINR(fixedTotal)}',
                  style: RunqText.bodyStrong.copyWith(color: HrColors.brand(context), fontSize: 13),
                ),
            ],
          ),
          for (var i = 0; i < _lines.length; i++) ...[
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: _StructureLineCard(
                line: _lines[i],
                available: allComponents,
                takenIds: {
                  for (final l in _lines)
                    if (l != _lines[i] && l.componentId != null) l.componentId!,
                },
                onChanged: () => setState(() {}),
                onRemove: _lines.length > 1 ? () => _removeLine(i) : null,
              ),
            ),
          ],
          if (allComponents.isEmpty)
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: t.surface,
                borderRadius: BorderRadius.circular(RunqRadii.smallCard),
                border: Border.all(color: t.hairline, width: 0.5),
              ),
              child: Column(
                children: [
                  Text('No components defined yet',
                      style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 13)),
                  const SizedBox(height: 4),
                  Text('Add salary components before building structures.',
                      style: RunqText.caption.copyWith(color: t.muted, fontSize: 11.5)),
                  const SizedBox(height: 8),
                  TextButton(
                    onPressed: () => context.push('/hr/salary-components'),
                    child: const Text('Open components'),
                  ),
                ],
              ),
            )
          else
            OutlinedButton.icon(
              onPressed: _addLine,
              icon: const Icon(Icons.add_rounded, size: 18),
              style: OutlinedButton.styleFrom(
                foregroundColor: HrColors.brand(context),
                side: BorderSide(color: HrColors.brand(context).withValues(alpha: 0.4)),
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              label: const Text('Add component'),
            ),
          if (_isEdit) ...[
            const SizedBox(height: 18),
            TextButton.icon(
              onPressed: () => _confirmDelete(context, ref),
              style: TextButton.styleFrom(foregroundColor: const Color(0xFFDC2626)),
              icon: const Icon(Icons.delete_outline_rounded, size: 18),
              label: const Text('Delete this structure'),
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _confirmDelete(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete structure?'),
        content: const Text(
            'Server will refuse the delete if this structure is assigned to any employee.'),
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
      await hrRepo.deleteSalaryStructure(widget.id!);
      ref.invalidate(hrSalaryStructuresProvider);
      if (context.mounted) {
        Navigator.of(context).pop();
        showRunqSnack(context, 'Structure deleted', kind: SnackKind.success);
      }
    } catch (e) {
      if (context.mounted) showRunqSnack(context, 'Delete failed: $e', kind: SnackKind.error);
    }
  }
}

class _StructureLineState {
  String? componentId;
  HrSalaryComponent? component;
  String calcType;
  final TextEditingController valueCtrl;

  _StructureLineState({
    this.componentId,
    this.component,
    required this.calcType,
    required this.valueCtrl,
  });

  factory _StructureLineState.blank() => _StructureLineState(
        calcType: 'fixed',
        valueCtrl: TextEditingController(),
      );

  factory _StructureLineState.fromLine(HrSalaryStructureLine l) => _StructureLineState(
        componentId: l.salaryComponentId,
        component: null, // resolved on first build when components load
        calcType: l.calcType,
        valueCtrl: TextEditingController(
          text: l.value == l.value.toInt()
              ? l.value.toInt().toString()
              : l.value.toStringAsFixed(2),
        ),
      );

  double? get value => double.tryParse(valueCtrl.text.trim());
  bool get isValid => componentId != null && value != null && value! >= 0;

  Map<String, dynamic> toPayload() => {
        'salaryComponentId': componentId,
        'value': value ?? 0,
        'calcType': calcType,
      };

  void dispose() {
    valueCtrl.dispose();
  }
}

class _StructureLineCard extends StatelessWidget {
  final _StructureLineState line;
  final List<HrSalaryComponent> available;
  final Set<String> takenIds;
  final VoidCallback onChanged;
  final VoidCallback? onRemove;
  const _StructureLineCard({
    required this.line,
    required this.available,
    required this.takenIds,
    required this.onChanged,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    // Resolve the current component object for display (so the picker
    // shows the right name + the disabled-when-taken filter works).
    HrSalaryComponent? selected;
    for (final c in available) {
      if (c.id == line.componentId) { selected = c; line.component = c; break; }
    }
    final pickable =
        available.where((c) => c.isActive && !takenIds.contains(c.id)).toList();
    final valueLabel = line.calcType == 'fixed' ? 'Amount (₹)' : 'Percentage';
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
        boxShadow: RunqShadows.card,
      ),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 10, 6, 0),
            child: Row(
              children: [
                if (selected != null)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                    decoration: BoxDecoration(
                      color: HrColors.tealSubtle,
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      hrSalaryComponentTypeLabel(selected.type),
                      style: TextStyle(
                        color: HrColors.brand(context),
                        fontSize: 10.5, fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                const Spacer(),
                if (onRemove != null)
                  IconButton(
                    icon: Icon(Icons.delete_outline_rounded, color: t.muted2, size: 18),
                    visualDensity: VisualDensity.compact,
                    onPressed: onRemove,
                  ),
              ],
            ),
          ),
          HrSelectField<HrSalaryComponent>(
            label: 'Component',
            value: selected,
            required: true,
            options: pickable,
            display: (c) => '${c.code} · ${c.name}',
            onChanged: (c) {
              line.componentId = c?.id;
              line.component = c;
              if (c != null) {
                // Snap calc type + default value to the component's defaults
                // so the user typically doesn't need to touch them.
                line.calcType = c.calcType;
                if (line.valueCtrl.text.trim().isEmpty) {
                  line.valueCtrl.text = c.defaultValue == c.defaultValue.toInt()
                      ? c.defaultValue.toInt().toString()
                      : c.defaultValue.toStringAsFixed(2);
                }
              }
              onChanged();
            },
          ),
          Divider(height: 1, thickness: 0.5, color: t.hairlineSoft, indent: 14),
          HrSelectField<String>(
            label: 'Calc type',
            value: line.calcType,
            required: true,
            options: hrSalaryCalcTypes,
            display: hrSalaryCalcTypeLabel,
            onChanged: (v) {
              line.calcType = v ?? 'fixed';
              onChanged();
            },
          ),
          Divider(height: 1, thickness: 0.5, color: t.hairlineSoft, indent: 14),
          HrTextField(
            label: valueLabel,
            controller: line.valueCtrl,
            required: true,
            keyboard: const TextInputType.numberWithOptions(decimal: true),
            formatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
            textCapitalization: TextCapitalization.none,
            onChanged: (_) => onChanged(),
          ),
        ],
      ),
    );
  }
}
