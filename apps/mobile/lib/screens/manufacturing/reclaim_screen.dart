// Reclaim — put unsold finished goods back into the raw-material pool.
//
// The floor cuts open packets that did not sell and tips the milk back into
// the tank for paneer or curd. This screen captures what was opened and how
// much actually came back; the server values the recovered material at
// raw-material cost and writes off the packaging and processing spent on it.
//
// Recovered qty is entered, never derived — 100 x 500ml packets rarely give
// back a clean 50 L, and only the operator knows what made it into the tank.
//
// Draft then post, mirroring the adjustment flow: build the lines, review the
// totals, then commit stock in one go.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/manufacturing_repo.dart';
import '../../providers/inventory_providers.dart';
import '../../providers/manufacturing_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart';
import '../inventory/widgets/warehouse_picker.dart';
import '_reclaim_line_sheet.dart';
import 'widgets/mfg_colors.dart';
import 'widgets/mfg_primitives.dart';

class ReclaimScreen extends ConsumerStatefulWidget {
  const ReclaimScreen({super.key});

  @override
  ConsumerState<ReclaimScreen> createState() => _ReclaimScreenState();
}

class _ReclaimScreenState extends ConsumerState<ReclaimScreen> {
  String? _warehouseId;
  final _notesCtl = TextEditingController();
  final List<ReclaimDraftLine> _lines = [];
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _applyDefaultWarehouse();
  }

  /// Same reasoning as Record Production: most plants run one warehouse, so
  /// pre-select it rather than making the floor pick it every time.
  Future<void> _applyDefaultWarehouse() async {
    final whs = await ref.read(invWarehousesProvider.future);
    if (!mounted || _warehouseId != null || whs.isEmpty) return;
    final pick = whs.firstWhere((w) => w.isDefault, orElse: () => whs.first);
    setState(() => _warehouseId = pick.id);
  }

  @override
  void dispose() {
    _notesCtl.dispose();
    super.dispose();
  }

  bool get _canSubmit => _warehouseId != null && _lines.isNotEmpty && !_busy;

  Future<void> _addLine() async {
    final line = await showModalBottomSheet<ReclaimDraftLine>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const ReclaimLineSheet(),
    );
    if (line != null) setState(() => _lines.add(line));
  }

  Future<void> _editLine(int index) async {
    final line = await showModalBottomSheet<ReclaimDraftLine>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => ReclaimLineSheet(existing: _lines[index]),
    );
    if (line != null) setState(() => _lines[index] = line);
  }

  Future<void> _submit() async {
    if (!_canSubmit) return;
    setState(() => _busy = true);
    try {
      final today = DateTime.now().toIso8601String().substring(0, 10);
      final draft = await manufacturingRepo.createReclaim(
        warehouseId: _warehouseId!,
        reclaimDate: today,
        notes: _notesCtl.text.trim(),
        lines: [for (final l in _lines) l.toJson()],
      );
      final posted = await manufacturingRepo.postReclaim(draft.id);
      if (!mounted) return;
      // A reclaim moves stock on both legs, so every stock-derived view is
      // stale — including the Mfg dashboard's raw-material figures.
      invalidateStockViews(ref);
      ref.invalidate(mfgDashboardProvider);
      final msg = posted.warnings.isEmpty
          ? '${posted.data.reclaimNo} posted'
          : '${posted.data.reclaimNo} posted — ${posted.warnings.join(' · ')}';
      showRunqSnack(context, msg, kind: SnackKind.success);
      Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) showRunqSnack(context, '$e', kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: const MfgPlainAppBar(title: 'Reclaim stock'),
      body: ListView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 120),
        children: [
          MfgCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                WarehousePicker(
                  value: _warehouseId,
                  onChanged: (v) => setState(() => _warehouseId = v),
                  label: 'Warehouse',
                  allowAll: false,
                  dense: true,
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _notesCtl,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: InputDecoration(
                    labelText: 'Notes (optional)',
                    filled: true,
                    fillColor: t.bgWarm,
                    isDense: true,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: BorderSide(color: t.hairline),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          MfgSectionHeader(
            label: 'What was opened',
            trailing: TextButton.icon(
              onPressed: _addLine,
              icon: const Icon(Icons.add_rounded, size: 18),
              label: const Text('Add'),
            ),
          ),
          if (_lines.isEmpty)
            const MfgEmptyState(
              icon: Icons.recycling_rounded,
              title: 'Nothing added yet',
              description: 'Add the product you opened and how much material came back.',
            )
          else
            for (var i = 0; i < _lines.length; i++)
              _LineTile(
                line: _lines[i],
                onTap: () => _editLine(i),
                onRemove: () => setState(() => _lines.removeAt(i)),
              ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        minimum: const EdgeInsets.fromLTRB(14, 0, 14, 12),
        child: MfgPrimaryButton(
          label: 'Post reclaim',
          onPressed: _canSubmit ? _submit : null,
          loading: _busy,
        ),
      ),
    );
  }
}

class _LineTile extends StatelessWidget {
  const _LineTile({required this.line, required this.onTap, required this.onRemove});
  final ReclaimDraftLine line;
  final VoidCallback onTap;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: MfgCard(
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      '${reclaimFmtQty(line.fgQty)} ${line.fgItemName}',
                      style: RunqText.bodyStrong.copyWith(color: t.ink),
                    ),
                    const SizedBox(height: 3),
                    Row(
                      children: [
                        Icon(Icons.arrow_downward_rounded, size: 13, color: MfgColors.brand(context)),
                        const SizedBox(width: 4),
                        Expanded(
                          child: Text(
                            '${reclaimFmtQty(line.recoveredQty)} ${line.recoveredUom} ${line.recoveredItemName}'
                            '${line.expiryDate == null ? '' : ' · exp ${line.expiryDate}'}',
                            style: RunqText.caption.copyWith(color: t.muted),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              IconButton(
                icon: const Icon(Icons.close_rounded, size: 18),
                onPressed: onRemove,
                visualDensity: VisualDensity.compact,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
