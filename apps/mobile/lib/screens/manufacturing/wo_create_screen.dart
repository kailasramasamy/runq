import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/manufacturing_models.dart';
import '../../api/manufacturing_repo.dart';
import '../../providers/manufacturing_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart';
import '../inventory/widgets/warehouse_picker.dart';
import 'widgets/mfg_colors.dart';
import 'widgets/mfg_primitives.dart';

class WoCreateScreen extends ConsumerStatefulWidget {
  const WoCreateScreen({super.key});

  @override
  ConsumerState<WoCreateScreen> createState() => _WoCreateScreenState();
}

class _WoCreateScreenState extends ConsumerState<WoCreateScreen> {
  String? _bomId;
  String? _bomCode;
  String? _bomName;
  String? _outputItemName;
  String? _outputUom;
  DateTime _scheduledFor = DateTime.now();
  final _plannedQtyCtl = TextEditingController();
  final _shiftCtl = TextEditingController();
  String? _warehouseId;
  bool _busy = false;

  static const _shiftPresets = ['AM', 'PM', 'NIGHT'];

  @override
  void dispose() {
    _plannedQtyCtl.dispose();
    _shiftCtl.dispose();
    super.dispose();
  }

  bool get _canSave =>
      _bomId != null &&
      (double.tryParse(_plannedQtyCtl.text) ?? 0) > 0 &&
      _warehouseId != null;

  Future<void> _pickBom() async {
    final picked = await _showBomPicker(context);
    if (picked != null && mounted) {
      setState(() {
        _bomId = picked.id;
        _bomCode = picked.bomCode;
        _bomName = picked.name;
        _outputItemName = picked.outputItemName;
        _outputUom = picked.outputUom;
      });
    }
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _scheduledFor,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: Theme.of(ctx).colorScheme.copyWith(primary: MfgColors.brand(ctx)),
        ),
        child: child!,
      ),
    );
    if (picked != null) setState(() => _scheduledFor = picked);
  }

  Future<void> _save() async {
    if (!_canSave) return;
    setState(() => _busy = true);
    try {
      final wo = await manufacturingRepo.createWo(
        bomId: _bomId!,
        plannedQty: double.parse(_plannedQtyCtl.text),
        scheduledFor: _scheduledFor.toIso8601String().substring(0, 10),
        warehouseId: _warehouseId!,
        shift: _shiftCtl.text.trim().isEmpty ? null : _shiftCtl.text.trim(),
      );
      ref.invalidate(workOrderListProvider);
      if (mounted) context.pushReplacement('/manufacturing/wos/${wo.id}');
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
            MfgPlainAppBar(title: 'New Work Order'),
            Expanded(
              child: ListView(
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 120),
                children: [
                  // BOM picker
                  MfgCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('BOM', style: RunqText.label),
                        const SizedBox(height: 10),
                        _PickerTile(
                          label: 'Bill of Materials',
                          value: _bomCode,
                          icon: Icons.add_chart_outlined,
                          onTap: _pickBom,
                        ),
                        if (_bomId != null) ...[
                          const SizedBox(height: 8),
                          Container(
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(
                              color: MfgColors.roseSubtle,
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  _bomName ?? '',
                                  style: RunqText.bodyStrong.copyWith(
                                      color: MfgColors.brand(context)),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  'Output: $_outputItemName · $_outputUom',
                                  style: RunqText.caption.copyWith(color: t.muted),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  // Run details
                  MfgCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Run Details', style: RunqText.label),
                        const SizedBox(height: 10),
                        Row(
                          children: [
                            Expanded(
                              flex: 2,
                              child: _TextField(
                                controller: _plannedQtyCtl,
                                label: 'Planned qty${_outputUom != null ? ' (${_outputUom!})' : ''}',
                                keyboardType:
                                    const TextInputType.numberWithOptions(decimal: true),
                                capitalization: TextCapitalization.none,
                                onChanged: (_) => setState(() {}),
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: GestureDetector(
                                onTap: _pickDate,
                                child: Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 12, vertical: 14),
                                  decoration: BoxDecoration(
                                    color: t.bgWarm,
                                    border: Border.all(color: t.hairline),
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Text('Schedule',
                                          style: RunqText.caption.copyWith(
                                              color: t.muted, height: 1)),
                                      const SizedBox(height: 2),
                                      Text(
                                        mfgPrettyDate(_scheduledFor.toIso8601String()),
                                        style: RunqText.bodyStrong.copyWith(
                                            color: t.ink, height: 1.2),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        _TextField(
                          controller: _shiftCtl,
                          label: 'Shift (AM / PM / NIGHT or custom)',
                          capitalization: TextCapitalization.none,
                        ),
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 6,
                          children: _shiftPresets.map((s) => ActionChip(
                            label: Text(s),
                            labelStyle: RunqText.caption,
                            onPressed: () {
                              setState(() => _shiftCtl.text = s);
                            },
                            backgroundColor: _shiftCtl.text == s
                                ? MfgColors.roseSubtle
                                : null,
                          )).toList(),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  // Warehouse
                  MfgCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Warehouse', style: RunqText.label),
                        const SizedBox(height: 10),
                        WarehousePicker(
                          value: _warehouseId,
                          onChanged: (id) => setState(() => _warehouseId = id),
                          label: 'Production warehouse',
                          allowAll: false,
                          dense: true,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
      bottomSheet: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
          child: SizedBox(
            width: double.infinity,
            child: MfgPrimaryButton(
              label: 'Create Work Order',
              loading: _busy,
              onPressed: _canSave ? _save : null,
              icon: Icons.check_rounded,
            ),
          ),
        ),
      ),
    );
  }
}

// ── WO edit screen ────────────────────────────────────────────────────────

class WoEditScreen extends ConsumerStatefulWidget {
  final String woId;
  const WoEditScreen({super.key, required this.woId});

  @override
  ConsumerState<WoEditScreen> createState() => _WoEditScreenState();
}

class _WoEditScreenState extends ConsumerState<WoEditScreen> {
  final _plannedQtyCtl = TextEditingController();
  final _shiftCtl = TextEditingController();
  String? _warehouseId;
  DateTime? _scheduledFor;
  bool _busy = false;
  bool _loaded = false;

  static const _shiftPresets = ['AM', 'PM', 'NIGHT'];

  @override
  void dispose() {
    _plannedQtyCtl.dispose();
    _shiftCtl.dispose();
    super.dispose();
  }

  void _initFrom(WorkOrder wo) {
    if (_loaded) return;
    _plannedQtyCtl.text = wo.plannedQty.toString();
    _shiftCtl.text = wo.shift ?? '';
    _warehouseId = wo.warehouseId;
    _scheduledFor = DateTime.tryParse(wo.scheduledFor);
    _loaded = true;
  }

  bool get _canSave =>
      (double.tryParse(_plannedQtyCtl.text) ?? 0) > 0 && _warehouseId != null;

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _scheduledFor ?? DateTime.now(),
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: Theme.of(ctx).colorScheme.copyWith(primary: MfgColors.brand(ctx)),
        ),
        child: child!,
      ),
    );
    if (picked != null) setState(() => _scheduledFor = picked);
  }

  Future<void> _save() async {
    if (!_canSave) return;
    setState(() => _busy = true);
    try {
      await manufacturingRepo.updateWo(widget.woId, {
        'plannedQty': double.parse(_plannedQtyCtl.text),
        'scheduledFor': _scheduledFor!.toIso8601String().substring(0, 10),
        'warehouseId': _warehouseId!,
        'shift': _shiftCtl.text.trim().isEmpty ? null : _shiftCtl.text.trim(),
      });
      ref.invalidate(workOrderDetailProvider(widget.woId));
      ref.invalidate(workOrderListProvider);
      if (mounted) {
        showRunqSnack(context, 'Work order updated', kind: SnackKind.success);
        context.pop();
      }
    } catch (e) {
      if (mounted) showRunqSnack(context, e.toString(), kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final woAsync = ref.watch(workOrderDetailProvider(widget.woId));

    return woAsync.when(
      loading: () => const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (e, _) =>
          Scaffold(body: Center(child: Text('Failed to load: $e', style: RunqText.body))),
      data: (wo) {
        if (!wo.isDraft) {
          return Scaffold(
            body: Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  'Only draft work orders can be edited.',
                  style: RunqText.body.copyWith(color: t.muted),
                  textAlign: TextAlign.center,
                ),
              ),
            ),
          );
        }
        _initFrom(wo);
        return Scaffold(
          backgroundColor: t.bgWarm,
          body: SafeArea(
            bottom: false,
            child: Column(
              children: [
                MfgPlainAppBar(title: 'Edit WO · ${wo.woNumber}'),
                Expanded(
                  child: ListView(
                    keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 120),
                    children: [
                      MfgCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('BOM', style: RunqText.label),
                            const SizedBox(height: 8),
                            Container(
                              padding: const EdgeInsets.all(10),
                              decoration: BoxDecoration(
                                color: MfgColors.roseSubtle,
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Row(
                                children: [
                                  Icon(Icons.add_chart_outlined,
                                      size: 16, color: MfgColors.brand(context)),
                                  const SizedBox(width: 8),
                                  Text(
                                    '${wo.bomCode} v${wo.bomVersion}',
                                    style: RunqText.bodyStrong.copyWith(
                                        color: MfgColors.brand(context)),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                      MfgCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Run Details', style: RunqText.label),
                            const SizedBox(height: 10),
                            Row(
                              children: [
                                Expanded(
                                  flex: 2,
                                  child: _TextField(
                                    controller: _plannedQtyCtl,
                                    label: 'Planned qty (${wo.outputUom})',
                                    keyboardType: const TextInputType.numberWithOptions(
                                        decimal: true),
                                    capitalization: TextCapitalization.none,
                                    onChanged: (_) => setState(() {}),
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: GestureDetector(
                                    onTap: _pickDate,
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 12, vertical: 14),
                                      decoration: BoxDecoration(
                                        color: t.bgWarm,
                                        border: Border.all(color: t.hairline),
                                        borderRadius: BorderRadius.circular(10),
                                      ),
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          Text('Schedule',
                                              style: RunqText.caption.copyWith(
                                                  color: t.muted, height: 1)),
                                          const SizedBox(height: 2),
                                          Text(
                                            _scheduledFor != null
                                                ? mfgPrettyDate(
                                                    _scheduledFor!.toIso8601String())
                                                : '—',
                                            style: RunqText.bodyStrong.copyWith(
                                                color: t.ink, height: 1.2),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 10),
                            _TextField(
                              controller: _shiftCtl,
                              label: 'Shift',
                              capitalization: TextCapitalization.none,
                            ),
                            const SizedBox(height: 8),
                            Wrap(
                              spacing: 6,
                              children: _shiftPresets.map((s) => ActionChip(
                                label: Text(s),
                                labelStyle: RunqText.caption,
                                onPressed: () => setState(() => _shiftCtl.text = s),
                                backgroundColor: _shiftCtl.text == s
                                    ? MfgColors.roseSubtle
                                    : null,
                              )).toList(),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                      MfgCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Warehouse', style: RunqText.label),
                            const SizedBox(height: 10),
                            WarehousePicker(
                              value: _warehouseId,
                              onChanged: (id) => setState(() => _warehouseId = id),
                              label: 'Production warehouse',
                              allowAll: false,
                              dense: true,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          bottomSheet: SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
              child: SizedBox(
                width: double.infinity,
                child: MfgPrimaryButton(
                  label: 'Update Work Order',
                  loading: _busy,
                  onPressed: _canSave ? _save : null,
                  icon: Icons.check_rounded,
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

// ── BOM picker bottom sheet ───────────────────────────────────────────────

Future<BomListRow?> _showBomPicker(BuildContext context) {
  return showModalBottomSheet<BomListRow>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => const _BomPickerSheet(),
  );
}

class _BomPickerSheet extends StatefulWidget {
  const _BomPickerSheet();

  @override
  State<_BomPickerSheet> createState() => _BomPickerSheetState();
}

class _BomPickerSheetState extends State<_BomPickerSheet> {
  final _ctrl = TextEditingController();
  List<BomListRow> _results = const [];
  bool _loading = false;
  String _lastQuery = '';

  @override
  void initState() {
    super.initState();
    _runSearch('');
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _runSearch(String q) async {
    _lastQuery = q;
    setState(() => _loading = true);
    try {
      final res = await manufacturingRepo.listBoms(
        isActive: true, // only show active BOMs
        search: q.isEmpty ? null : q,
        limit: 30,
      );
      if (!mounted || q != _lastQuery) return;
      setState(() => _results = res.data);
    } finally {
      if (mounted && q == _lastQuery) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return DraggableScrollableSheet(
      initialChildSize: 0.85,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      expand: false,
      builder: (_, scrollCtrl) => Container(
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: Column(
          children: [
            Container(
              margin: const EdgeInsets.only(top: 8),
              width: 36, height: 4,
              decoration: BoxDecoration(
                color: t.hairline,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
              child: Row(
                children: [
                  Text('Pick BOM (active only)',
                      style: RunqText.h3.copyWith(color: t.ink)),
                  const Spacer(),
                  IconButton(
                    icon: const Icon(Icons.close_rounded),
                    onPressed: () => Navigator.of(context).pop(),
                    visualDensity: VisualDensity.compact,
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: TextField(
                controller: _ctrl,
                autofocus: false,
                textCapitalization: TextCapitalization.none,
                onChanged: _runSearch,
                decoration: InputDecoration(
                  hintText: 'Search BOM code or output item',
                  prefixIcon: const Icon(Icons.search_rounded),
                  filled: true,
                  fillColor: t.bgWarmer,
                  isDense: true,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: BorderSide(color: t.hairline),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: BorderSide(color: t.hairline),
                  ),
                  suffixIcon: _ctrl.text.isEmpty
                      ? null
                      : IconButton(
                          icon: const Icon(Icons.clear, size: 18),
                          onPressed: () {
                            _ctrl.clear();
                            _runSearch('');
                          },
                        ),
                ),
              ),
            ),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _results.isEmpty
                      ? Center(
                          child: Text('No active BOMs found.',
                              style: RunqText.body.copyWith(color: t.muted)))
                      : ListView.builder(
                          controller: scrollCtrl,
                          keyboardDismissBehavior:
                              ScrollViewKeyboardDismissBehavior.onDrag,
                          padding: const EdgeInsets.fromLTRB(8, 0, 8, 24),
                          itemCount: _results.length,
                          itemBuilder: (_, i) {
                            final bom = _results[i];
                            return Material(
                              color: Colors.transparent,
                              child: InkWell(
                                onTap: () => Navigator.of(context).pop(bom),
                                borderRadius: BorderRadius.circular(10),
                                child: Container(
                                  margin: const EdgeInsets.symmetric(
                                      horizontal: 4, vertical: 2),
                                  padding:
                                      const EdgeInsets.fromLTRB(10, 10, 12, 10),
                                  child: Row(
                                    children: [
                                      Container(
                                        width: 36, height: 36,
                                        decoration: BoxDecoration(
                                          color: MfgColors.roseSubtle,
                                          borderRadius: BorderRadius.circular(8),
                                        ),
                                        child: Icon(Icons.add_chart_outlined,
                                            size: 18,
                                            color: MfgColors.brand(context)),
                                      ),
                                      const SizedBox(width: 12),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            Text(bom.bomCode,
                                                style: RunqText.bodyStrong
                                                    .copyWith(color: t.ink)),
                                            const SizedBox(height: 2),
                                            Text(
                                              '${bom.outputItemName} · ${bom.outputQty.toStringAsFixed(bom.outputQty == bom.outputQty.truncateToDouble() ? 0 : 3)} ${bom.outputUom}',
                                              style: RunqText.caption
                                                  .copyWith(color: t.muted),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            );
                          },
                        ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Shared sub-widgets ────────────────────────────────────────────────────

class _TextField extends StatelessWidget {
  final TextEditingController controller;
  final String label;
  final TextCapitalization capitalization;
  final TextInputType? keyboardType;
  final ValueChanged<String>? onChanged;

  const _TextField({
    required this.controller,
    required this.label,
    required this.capitalization,
    this.keyboardType,
    this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return TextField(
      controller: controller,
      textCapitalization: capitalization,
      keyboardType: keyboardType,
      onChanged: onChanged,
      style: RunqText.body.copyWith(color: t.ink),
      decoration: InputDecoration(
        labelText: label,
        labelStyle: RunqText.caption.copyWith(color: t.muted),
        isDense: true,
        filled: true,
        fillColor: t.bgWarm,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: t.hairline),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: t.hairline),
        ),
      ),
    );
  }
}

class _PickerTile extends StatelessWidget {
  final String label;
  final String? value;
  final IconData icon;
  final VoidCallback onTap;

  const _PickerTile({
    required this.label,
    required this.value,
    required this.icon,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          decoration: BoxDecoration(
            color: t.bgWarm,
            border: Border.all(color: t.hairline),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            children: [
              Icon(icon, size: 18, color: t.muted),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(label, style: RunqText.caption.copyWith(color: t.muted, height: 1)),
                    const SizedBox(height: 2),
                    Text(
                      value ?? 'Tap to select',
                      style: RunqText.bodyStrong.copyWith(
                        color: value != null ? t.ink : t.muted2,
                        height: 1.2,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              Icon(Icons.unfold_more_rounded, size: 18, color: t.muted2),
            ],
          ),
        ),
      ),
    );
  }
}
