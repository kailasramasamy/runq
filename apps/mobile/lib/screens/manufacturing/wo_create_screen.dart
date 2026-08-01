import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/manufacturing_models.dart';
import '../../api/manufacturing_repo.dart';
import '../../providers/manufacturing_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart';
import '../../api/inventory_models.dart';
import '../../providers/inventory_providers.dart';
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
  String? _shift;
  String? _warehouseId;
  bool _busy = false;

  static const _shiftPresets = ['AM', 'PM', 'NIGHT'];

  @override
  void initState() {
    super.initState();
    _applyDefaultWarehouse();
  }

  /// Most plants run every WO out of one warehouse, so making the operator pick
  /// it each time is a tap that can only be got wrong. Falls back to the sole
  /// warehouse when none is flagged default.
  Future<void> _applyDefaultWarehouse() async {
    final whs = await ref.read(invWarehousesProvider.future);
    if (!mounted || _warehouseId != null || whs.isEmpty) return;
    final pick = whs.firstWhere((w) => w.isDefault, orElse: () => whs.first);
    setState(() => _warehouseId = pick.id);
  }

  @override
  void dispose() {
    _plannedQtyCtl.dispose();
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
        shift: _shift,
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
                        const SizedBox(height: 12),
                        // Label and chips share one row — three presets don't
                        // justify two rows of height on a form this short.
                        // Chips are the whole control: the free-text box let the
                        // presets and any arbitrary string disagree, and a typo'd
                        // shift is invisible until a report groups by it. Tapping
                        // the selected chip clears it (shift is optional).
                        Row(children: [
                          Text('Shift', style: RunqText.caption.copyWith(color: t.muted)),
                          const SizedBox(width: 10),
                          for (final preset in _shiftPresets) ...[
                            if (preset != _shiftPresets.first) const SizedBox(width: 6),
                            Expanded(
                              child: _ShiftChip(
                                label: preset,
                                selected: _shift == preset,
                                onTap: () => setState(
                                    () => _shift = _shift == preset ? null : preset),
                              ),
                            ),
                          ],
                        ]),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  // What this run will draw from stock, and whether it can.
                  if (_bomId != null)
                    _MaterialPlan(
                      bomId: _bomId!,
                      plannedQty: double.tryParse(_plannedQtyCtl.text) ?? 0,
                      outputUom: _outputUom,
                      warehouseId: _warehouseId,
                      onUseMax: (qty) => setState(() {
                        _plannedQtyCtl.text = qty.toStringAsFixed(0);
                      }),
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
      // Anchored action bar rather than a thin bottomSheet strip: the button now
      // sits above the home indicator with real padding and a 52px tap target,
      // and a hairline separates it from the scrolling form.
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
                label: 'Create Work Order',
                loading: _busy,
                onPressed: _canSave ? _save : null,
                icon: Icons.check_rounded,
              ),
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
  String? _shift;
  String? _warehouseId;
  DateTime? _scheduledFor;
  bool _busy = false;
  bool _loaded = false;

  static const _shiftPresets = ['AM', 'PM', 'NIGHT'];

  @override
  void dispose() {
    _plannedQtyCtl.dispose();
    super.dispose();
  }

  void _initFrom(WorkOrder wo) {
    if (_loaded) return;
    _plannedQtyCtl.text = wo.plannedQty.toString();
    _shift = wo.shift;
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
        'shift': _shift,
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
                            const SizedBox(height: 12),
                            Row(children: [
                              Text('Shift', style: RunqText.caption.copyWith(color: t.muted)),
                              const SizedBox(width: 10),
                              for (final preset in _shiftPresets) ...[
                                if (preset != _shiftPresets.first) const SizedBox(width: 6),
                                Expanded(
                                  child: _ShiftChip(
                                    label: preset,
                                    selected: _shift == preset,
                                    onTap: () => setState(
                                        () => _shift = _shift == preset ? null : preset),
                                  ),
                                ),
                              ],
                            ]),
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


/// Shift selector segment. The tick is the whole point — a tinted background
/// alone reads as "highlighted" rather than "chosen", which matters when the
/// field is optional and blank is a legitimate state.
class _ShiftChip extends StatelessWidget {
  const _ShiftChip({required this.label, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final accent = MfgColors.brand(context);
    return InkWell(
      borderRadius: BorderRadius.circular(RunqRadii.chip),
      onTap: onTap,
      child: Container(
        constraints: const BoxConstraints(minHeight: 40),
        padding: const EdgeInsets.symmetric(horizontal: 8),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: selected ? accent.withValues(alpha: 0.12) : t.bgWarm,
          border: Border.all(
            color: selected ? accent.withValues(alpha: 0.55) : t.hairline,
            width: selected ? 1.5 : 1,
          ),
          borderRadius: BorderRadius.circular(RunqRadii.chip),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          if (selected) ...[
            Icon(Icons.check_rounded, size: 15, color: accent),
            const SizedBox(width: 5),
          ],
          Flexible(
            child: Text(label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: RunqText.body.copyWith(
                color: selected ? t.ink : t.muted,
                fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
              )),
          ),
        ]),
      ),
    );
  }
}


// ── Material plan ─────────────────────────────────────────────────────────

/// Turns the BOM into the run's actual shopping list: how much of each input
/// this planned quantity consumes, what's on hand, and whether it's enough.
///
/// The plant manager's two questions are "can I run this?" and "what will it
/// eat?" — both were previously unanswerable without leaving the form and doing
/// arithmetic by hand.
class _MaterialPlan extends ConsumerWidget {
  const _MaterialPlan({
    required this.bomId,
    required this.plannedQty,
    required this.outputUom,
    required this.warehouseId,
    required this.onUseMax,
  });

  final String bomId;
  final double plannedQty;
  final String? outputUom;

  /// The run's warehouse. Consumption draws from here, so counting stock parked
  /// at another site would overstate what this run can actually make.
  final String? warehouseId;

  /// Fills the planned-qty field with the capacity figure, so the manager can
  /// act on the suggestion without transcribing it.
  final ValueChanged<double> onUseMax;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final bom = ref.watch(bomDetailProvider(bomId)).asData?.value;
    final stock = ref
            .watch(invOnHandProvider(
                (warehouseId: warehouseId, lowOnly: false, itemClassGroup: 'inputs')))
            .asData
            ?.value ??
        const <InvOnHandRow>[];
    if (bom == null) return const SizedBox.shrink();
    if (bom.lines.isEmpty) {
      return MfgCard(
        child: Row(children: [
          Icon(Icons.info_outline_rounded, size: 16, color: t.muted),
          const SizedBox(width: 8),
          Expanded(
            child: Text('This BOM has no input lines, so nothing will be consumed.',
                style: RunqText.caption.copyWith(color: t.muted)),
          ),
        ]),
      );
    }

    // Litres on hand per input item, summed across that warehouse's batches.
    final available = <String, double>{};
    for (final r in stock) {
      available[r.itemId] = (available[r.itemId] ?? 0) + r.qty;
    }
    // Oldest batch still holding stock. Raw milk has no expiry date yet, so
    // intake age is the only freshness signal — and a capacity figure that leans
    // on yesterday's milk is not a capacity a dairy can actually use.
    DateTime? oldest;
    for (final r in stock) {
      if (r.qty <= 0 || r.receivedAt == null) continue;
      final at = DateTime.tryParse(r.receivedAt!);
      if (at != null && (oldest == null || at.isBefore(oldest))) oldest = at;
    }
    final oldestAgeHrs =
        oldest == null ? null : DateTime.now().difference(oldest).inHours;

    // BOM quantities are per `bom.outputQty` of output, so scale by the run.
    // Scrap is a percentage uplift on the consumed quantity.
    final batches = bom.outputQty > 0 ? plannedQty / bom.outputQty : 0.0;
    final rows = bom.lines.map((l) {
      final need = l.qtyPerOutput * batches * (1 + l.scrapPct / 100);
      final have = available[l.inputItemId] ?? 0;
      return (line: l, need: need, have: have, short: need - have);
    }).toList();

    // How many units of output the tightest input allows. Optional lines don't
    // gate a run, so they're excluded from the ceiling.
    double? ceiling;
    for (final r in rows) {
      if (r.line.isOptional) continue;
      final perUnit = r.line.qtyPerOutput * (1 + r.line.scrapPct / 100) / bom.outputQty;
      if (perUnit <= 0) continue;
      final canMake = r.have / perUnit;
      if (ceiling == null || canMake < ceiling) ceiling = canMake;
    }
    final blocking = rows.where((r) => !r.line.isOptional && r.short > 0.0001).toList();
    final planned = plannedQty > 0;

    return MfgCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Material plan', style: RunqText.label),
        const SizedBox(height: 10),
        // Capacity first: the plant manager's opening question is "how much can
        // I make with what's in the tank", and the answer used to be a small
        // grey number they had to hunt for.
        if (ceiling != null) _CapacityBanner(
          canMake: ceiling.floorToDouble(),
          outputUom: outputUom,
          plannedQty: plannedQty,
          oldestAgeHrs: oldestAgeHrs,
          onUseMax: onUseMax,
        ),
        if (ceiling != null) const SizedBox(height: 10),
        if (planned && blocking.isNotEmpty) ...[
          _ShortfallBanner(rows: blocking, ceiling: ceiling, outputUom: outputUom),
          const SizedBox(height: 10),
        ],
        for (final r in rows) ...[
          _MaterialRow(
            name: r.line.inputItemName,
            uom: r.line.inputUom,
            need: planned ? r.need : null,
            have: r.have,
            short: planned && !r.line.isOptional && r.short > 0.0001,
            optional: r.line.isOptional,
            scrapPct: r.line.scrapPct,
          ),
          const SizedBox(height: 8),
        ],
        if (!planned)
          Text('Enter a planned quantity to see what the run consumes.',
              style: RunqText.caption.copyWith(color: t.muted)),
      ]),
    );
  }

  static String _trim(double v) =>
      v == v.truncateToDouble() ? v.toInt().toString() : v.toStringAsFixed(2);
}

class _ShortfallBanner extends StatelessWidget {
  const _ShortfallBanner({required this.rows, required this.ceiling, required this.outputUom});
  final List<({BomLine line, double need, double have, double short})> rows;
  final double? ceiling;
  final String? outputUom;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final first = rows.first;
    final more = rows.length - 1;
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: MfgColors.orangeAlertBg,
        border: Border.all(color: MfgColors.orangeAlert.withValues(alpha: 0.4)),
        borderRadius: BorderRadius.circular(RunqRadii.chip),
      ),
      child: Row(children: [
        Icon(Icons.warning_amber_rounded, size: 18, color: MfgColors.orangeAlert),
        const SizedBox(width: 8),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Not enough stock for this quantity',
                style: RunqText.bodyStrong.copyWith(color: t.ink)),
            const SizedBox(height: 2),
            Text(
              'Short ${_MaterialPlan._trim(first.short)} ${first.line.inputUom} of '
              '${first.line.inputItemName}'
              '${more > 0 ? ' and $more other input${more == 1 ? '' : 's'}' : ''}.'
              '${ceiling != null ? ' Stock covers about ${_MaterialPlan._trim(ceiling!)}'
                  '${outputUom != null ? ' $outputUom' : ''}.' : ''}',
              style: RunqText.caption.copyWith(color: t.muted),
            ),
          ]),
        ),
      ]),
    );
  }
}

class _MaterialRow extends StatelessWidget {
  const _MaterialRow({
    required this.name,
    required this.uom,
    required this.need,
    required this.have,
    required this.short,
    required this.optional,
    required this.scrapPct,
  });
  final String name;
  final String uom;
  final double? need;
  final double have;
  final bool short;
  final bool optional;
  final double scrapPct;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final ratio = (need != null && need! > 0) ? (have / need!).clamp(0.0, 1.0) : 1.0;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Expanded(
          child: Text(
            optional ? '$name · optional' : name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: RunqText.body.copyWith(color: t.ink),
          ),
        ),
        const SizedBox(width: 8),
        if (need != null)
          Text('${_MaterialPlan._trim(need!)} $uom',
              style: RunqText.body.copyWith(
                  color: short ? MfgColors.orangeAlert : t.ink, fontWeight: FontWeight.w700)),
      ]),
      const SizedBox(height: 3),
      Row(children: [
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(3),
            child: LinearProgressIndicator(
              value: ratio,
              minHeight: 4,
              backgroundColor: t.hairline,
              valueColor: AlwaysStoppedAnimation(
                  short ? MfgColors.orangeAlert : MfgColors.brand(context)),
            ),
          ),
        ),
        const SizedBox(width: 8),
        Text(
          'have ${_MaterialPlan._trim(have)} $uom'
          '${scrapPct > 0 ? ' · +${_MaterialPlan._trim(scrapPct)}% scrap' : ''}',
          style: RunqText.micro.copyWith(color: t.muted),
        ),
      ]),
    ]);
  }
}


/// "You can make N" headline, with a one-tap fill. Shows how much of capacity
/// the current plan uses once a quantity is entered, so over- and under-running
/// the tank are both visible.
class _CapacityBanner extends StatelessWidget {
  const _CapacityBanner({
    required this.canMake,
    required this.outputUom,
    required this.plannedQty,
    required this.oldestAgeHrs,
    required this.onUseMax,
  });

  final double canMake;
  final String? outputUom;
  final double plannedQty;

  /// Age of the oldest batch counted in [canMake], in hours. Null when no batch
  /// records an intake time.
  final int? oldestAgeHrs;
  final ValueChanged<double> onUseMax;

  /// Beyond this, the figure is leaning on stock a fresh-milk line shouldn't use.
  static const _staleAfterHrs = 24;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final accent = MfgColors.brand(context);
    final over = plannedQty > canMake + 0.0001;
    final uom = outputUom != null ? ' $outputUom' : '';
    final used = canMake > 0 ? (plannedQty / canMake).clamp(0.0, 1.0) : 0.0;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: over ? MfgColors.orangeAlertBg : accent.withValues(alpha: 0.08),
        border: Border.all(
            color: (over ? MfgColors.orangeAlert : accent).withValues(alpha: 0.35)),
        borderRadius: BorderRadius.circular(RunqRadii.chip),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(over ? Icons.warning_amber_rounded : Icons.factory_outlined,
              size: 18, color: over ? MfgColors.orangeAlert : accent),
          const SizedBox(width: 8),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Stock supports ${_MaterialPlan._trim(canMake)}$uom',
                  style: RunqText.bodyStrong.copyWith(color: t.ink)),
              const SizedBox(height: 2),
              Text(
                plannedQty <= 0
                    ? 'Based on the tightest input on hand.'
                    : over
                        ? 'Planned ${_MaterialPlan._trim(plannedQty)}$uom — '
                            '${_MaterialPlan._trim(plannedQty - canMake)}$uom beyond stock.'
                        : 'Planned ${_MaterialPlan._trim(plannedQty)}$uom — '
                            '${(used * 100).round()}% of what stock allows.',
                style: RunqText.caption.copyWith(color: t.muted),
              ),
              if (oldestAgeHrs != null && oldestAgeHrs! >= _staleAfterHrs) ...[
                const SizedBox(height: 3),
                Text(
                  'Includes stock received ${oldestAgeHrs! ~/ 24}d '
                  '${oldestAgeHrs! % 24}h ago — check it is still usable.',
                  style: RunqText.micro.copyWith(color: MfgColors.orangeAlert),
                ),
              ],
            ]),
          ),
          if (canMake > 0 && plannedQty != canMake) ...[
            const SizedBox(width: 8),
            TextButton(
              onPressed: () => onUseMax(canMake),
              style: TextButton.styleFrom(
                minimumSize: const Size(44, 36),
                padding: const EdgeInsets.symmetric(horizontal: 10),
              ),
              child: Text('Use max',
                  style: RunqText.label.copyWith(color: accent, fontWeight: FontWeight.w700)),
            ),
          ],
        ]),
      ]),
    );
  }
}
