// Stock take — list + start sheet + picker-driven count loop.
//
// Mirrors the Adjustment redesign:
//   • Summary KPI strip at the top of the list (active sessions + counted
//     progress across in-progress sessions).
//   • Count screen uses a searchable item picker as the only entry point
//     (barcode scan disabled for now — re-enable once we ship the camera
//     scanner). The matched-item block is a line card with name + sku/unit
//     + qty input + system/prev hint + clear button.
//   • All counts render via _fmtQty — trailing zeros stripped so "5.000"
//     reads as "5" and "5.500" as "5.5".
//   • Start sheet uses the shared _SheetHeader chrome.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/inventory_models.dart';
import '../../api/inventory_repo.dart';
import '../../providers/inventory_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/inv_class_tabs.dart';
import 'widgets/inv_colors.dart';
import 'widgets/inv_primitives.dart';
import 'widgets/warehouse_picker.dart';
import '../../widgets/runq_snack.dart';

class InventoryStockTakeScreen extends ConsumerWidget {
  const InventoryStockTakeScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final rows = ref.watch(invStockTakeListProvider(null));
    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: InvPlainAppBar(
        title: 'Stock Take',
        onBack: Navigator.of(context).canPop() ? () => context.pop() : null,
        trailing: _AddBtn(onTap: () => _openStart(context, ref)),
      ),
      body: RefreshIndicator(
        color: InvColors.brand(context),
        onRefresh: () async {
          ref.invalidate(invStockTakeListProvider(null));
          await Future<void>.delayed(const Duration(milliseconds: 200));
        },
        child: rows.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text('Failed to load: $e',
                  style: RunqText.caption.copyWith(color: t.muted),
                  textAlign: TextAlign.center),
            ),
          ),
          data: (list) {
            if (list.isEmpty) {
              return InvEmptyState(
                icon: Icons.checklist_outlined,
                title: 'No sessions yet',
                subtitle: 'Snapshot a warehouse and count via barcode scan',
                actionLabel: '+ Start Session',
                onAction: () => _openStart(context, ref),
              );
            }
            return ListView.builder(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 120),
              // +1 leading summary row, then tiles with 8px gap separators.
              itemCount: list.length + 1,
              itemBuilder: (_, idx) {
                if (idx == 0) {
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: _SummaryStrip(list: list),
                  );
                }
                final i = idx - 1;
                return Padding(
                  padding: EdgeInsets.only(top: i == 0 ? 0 : 8),
                  child: _StTile(
                    st: list[i],
                    onTap: list[i].status == 'in_progress'
                        ? () => _openCount(context, ref, list[i].id)
                        : () => _openPostedDetail(context, list[i]),
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }

  void _openStart(BuildContext context, WidgetRef ref) async {
    final created = await showModalBottomSheet<String?>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const _StartSheet(),
    );
    if (created != null) {
      ref.invalidate(invStockTakeListProvider(null));
      if (context.mounted) _openCount(context, ref, created);
    }
  }

  void _openCount(BuildContext context, WidgetRef ref, String stockTakeId) async {
    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => _CountScreen(stockTakeId: stockTakeId)),
    );
    ref.invalidate(invStockTakeListProvider(null));
  }

  void _openPostedDetail(BuildContext context, InvStockTake st) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _PostedDetailSheet(st: st),
    );
  }
}

// Solid amber pill — used as the count-screen AppBar action so POST reads
// as a primary CTA against the warm background instead of a faded text
// link. Shows a spinner while [busy] is true.
class _PostBtn extends StatelessWidget {
  const _PostBtn({required this.busy, required this.onTap});
  final bool busy;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) {
    final disabled = onTap == null || busy;
    return Material(
      color: disabled ? const Color(0xFFA8A29E) : InvColors.brand(context),
      borderRadius: BorderRadius.circular(8),
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: disabled ? null : onTap,
        child: SizedBox(
          height: 32,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (busy) ...[
                  const SizedBox(
                    width: 12, height: 12,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  ),
                  const SizedBox(width: 8),
                ],
                Text(
                  busy ? 'Posting…' : 'POST',
                  style: RunqText.caption.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.4,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _AddBtn extends StatelessWidget {
  const _AddBtn({required this.onTap});
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: Material(
        color: InvColors.brand(context),
        borderRadius: BorderRadius.circular(8),
        child: InkWell(
          borderRadius: BorderRadius.circular(8),
          onTap: onTap,
          child: const SizedBox(
            width: 32, height: 32,
            child: Icon(Icons.add, color: Colors.white, size: 18),
          ),
        ),
      ),
    );
  }
}

// ── Summary KPIs ─────────────────────────────────────────────────────────

// Two-card strip above the list. Counts in-progress vs total sessions on
// the left, and rolls up counted/total items across in-progress sessions
// on the right so users can see how much godown-floor work is left without
// tapping into each session.
class _SummaryStrip extends StatelessWidget {
  const _SummaryStrip({required this.list});
  final List<InvStockTake> list;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final inProgress = list.where((s) => s.status == 'in_progress').toList();
    final posted = list.where((s) => s.status == 'posted').length;
    final totalLines = inProgress.fold<int>(0, (s, x) => s + x.totalLines);
    final countedLines = inProgress.fold<int>(0, (s, x) => s + x.countedLines);
    final pct = totalLines > 0 ? (countedLines / totalLines * 100).round() : 0;

    final progressText = totalLines == 0
        ? (inProgress.isEmpty ? '—' : '0')
        : '$countedLines / $totalLines';
    final progressTint = inProgress.isEmpty
        ? null
        : (pct >= 100
            ? InvColors.success.withValues(alpha: 0.08)
            : InvColors.amberSubtle);
    final progressBorder = inProgress.isEmpty
        ? null
        : (pct >= 100
            ? InvColors.success.withValues(alpha: 0.30)
            : InvColors.amber.withValues(alpha: 0.30));
    final progressColor = inProgress.isEmpty
        ? t.muted
        : (pct >= 100 ? InvColors.success : InvColors.amberDeep);

    return Row(
      children: [
        Expanded(
          child: InvKpiCard(
            label: 'Sessions',
            value: list.length.toString(),
            sub: '${inProgress.length} active · $posted posted',
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: _ValueKpiCard(
            label: 'Counted',
            value: progressText,
            sub: inProgress.isEmpty
                ? 'no active sessions'
                : (totalLines == 0
                    ? 'snapshot pending'
                    : '$pct% across active'),
            tint: progressTint,
            borderTint: progressBorder,
            valueColor: progressColor,
          ),
        ),
      ],
    );
  }
}

// `InvKpiCard` always renders its value in ink — we need amber/green for
// the counted card, so this tiny variant mirrors the layout but lets the
// caller pass a value colour. Same pattern as the adjustment summary.
class _ValueKpiCard extends StatelessWidget {
  const _ValueKpiCard({
    required this.label,
    required this.value,
    required this.sub,
    required this.valueColor,
    this.tint,
    this.borderTint,
  });
  final String label;
  final String value;
  final String sub;
  final Color valueColor;
  final Color? tint;
  final Color? borderTint;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: tint ?? t.surface,
        border: Border.all(color: borderTint ?? t.hairline),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label.toUpperCase(),
              style: RunqText.label.copyWith(color: t.muted)),
          const SizedBox(height: 4),
          Text(
            value,
            style: RunqText.numberLg
                .copyWith(color: valueColor, fontSize: 20, height: 1.15),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 2),
          Text(sub, style: RunqText.caption.copyWith(color: t.muted)),
        ],
      ),
    );
  }
}

// ── Tile ─────────────────────────────────────────────────────────────────

class _StTile extends StatelessWidget {
  const _StTile({required this.st, this.onTap});
  final InvStockTake st;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final total = st.totalLines;
    final counted = st.countedLines;
    final pct = total > 0 ? (counted / total).clamp(0.0, 1.0) : 0.0;
    final isDone = pct >= 1.0 || st.status == 'posted';
    final fill = isDone ? InvColors.success : InvColors.brand(context);
    final startDate = st.startedAt.isNotEmpty ? st.startedAt.substring(0, 10) : '';

    return InvCard(
      // Whole card is tappable when the session is in_progress so users
      // don't have to aim for the "Continue Counting" pill — the pill is
      // kept as a clear affordance.
      onTap: onTap,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(st.stNo,
                        style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 14)),
                    const SizedBox(height: 2),
                    Text(
                      startDate.isEmpty
                          ? st.warehouseName
                          : '${st.warehouseName} · $startDate',
                      style: RunqText.caption.copyWith(color: t.muted),
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              InvStatusPill(status: st.status),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: Text(
                  total > 0
                      ? '$counted of $total items counted'
                      : 'Snapshot pending',
                  style: RunqText.caption.copyWith(color: t.muted),
                ),
              ),
              Text(
                '${(pct * 100).toStringAsFixed(0)}%',
                style: RunqText.caption.copyWith(
                  color: fill, fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          LayoutBuilder(
            builder: (_, c) => Container(
              height: 4,
              decoration: BoxDecoration(
                color: t.bgWarmer,
                borderRadius: BorderRadius.circular(99),
              ),
              clipBehavior: Clip.antiAlias,
              child: Align(
                alignment: Alignment.centerLeft,
                child: Container(
                  width: c.maxWidth * pct,
                  decoration: BoxDecoration(
                    color: fill,
                    borderRadius: BorderRadius.circular(99),
                  ),
                ),
              ),
            ),
          ),
          if (st.status == 'in_progress' && onTap != null) ...[
            const SizedBox(height: 10),
            Material(
              color: InvColors.amberSubtle,
              borderRadius: BorderRadius.circular(10),
              child: InkWell(
                onTap: onTap,
                borderRadius: BorderRadius.circular(10),
                child: Container(
                  width: double.infinity,
                  height: 36,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    border: Border.all(
                      color: InvColors.brand(context).withValues(alpha: 0.20),
                    ),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    'Continue Counting →',
                    style: RunqText.caption.copyWith(
                      color: InvColors.amberDeep,
                      fontWeight: FontWeight.w700,
                      fontSize: 13,
                    ),
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

// ─── Start session sheet ───────────────────────────────────────────────

class _StartSheet extends ConsumerStatefulWidget {
  const _StartSheet();
  @override
  ConsumerState<_StartSheet> createState() => _StartSheetState();
}

class _StartSheetState extends ConsumerState<_StartSheet> {
  String? warehouseId;
  bool submitting = false;

  Future<void> _submit() async {
    if (warehouseId == null) {
      RunqSnack.warning(context, 'Pick a warehouse');
      return;
    }
    setState(() => submitting = true);
    try {
      final st = await inventoryRepo.startStockTake(warehouseId: warehouseId!);
      if (!mounted) return;
      Navigator.of(context).pop(st.id);
    } catch (e) {
      if (!mounted) return;
      RunqSnack.error(context, "Couldn't start the stock take",
          description: snackErrorText(e));
    } finally {
      if (mounted) setState(() => submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final insets = MediaQuery.of(context).viewInsets;
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: EdgeInsets.only(bottom: insets.bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _SheetHeader(title: 'Start Stock Take', onClose: () => Navigator.of(context).pop()),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                _Lbl('Warehouse'),
                WarehousePicker(
                  value: warehouseId,
                  onChanged: (id) => setState(() => warehouseId = id),
                  allowAll: false,
                  dense: true,
                ),
                const SizedBox(height: 16),
                Text(
                  'Snapshots the current on-hand. You can scan or pick items to count them after starting.',
                  style: RunqText.caption.copyWith(color: t.muted),
                ),
                const SizedBox(height: 20),
                InvPrimaryButton(
                  label: 'Start Session',
                  icon: Icons.play_circle_outline,
                  busy: submitting,
                  onTap: (warehouseId != null && !submitting) ? _submit : null,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Scan + count screen ───────────────────────────────────────────────

class _CountScreen extends ConsumerStatefulWidget {
  const _CountScreen({required this.stockTakeId});
  final String stockTakeId;
  @override
  ConsumerState<_CountScreen> createState() => _CountScreenState();
}

class _CountScreenState extends ConsumerState<_CountScreen> {
  bool posting = false;

  // Resolves an item (from picker) into the snapshotted line and opens the
  // count sheet. When no snapshot row exists (picker returned a surplus
  // item) we synthesize an empty line so the sheet still has display data.
  Future<void> _openCountForItem(InvItem item) async {
    final detail = ref.read(invStockTakeDetailProvider(widget.stockTakeId)).valueOrNull;
    final line = detail?.lines.firstWhere(
      (l) => l.itemId == item.id,
      orElse: () => InvStockTakeLine(
        id: '', itemId: item.id, itemName: item.name,
        itemSku: item.sku, itemUnit: item.unit, batchNo: null,
        systemQty: 0, countedQty: null, unitCost: 0, variance: null,
      ),
    );
    await _openCountForLine(line!);
  }

  Future<void> _openCountForLine(InvStockTakeLine line) async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _CountSheet(
        stockTakeId: widget.stockTakeId,
        line: line,
      ),
    );
    if (saved == true) {
      ref.invalidate(invStockTakeDetailProvider(widget.stockTakeId));
    }
  }

  Future<void> _openItemPicker() async {
    final item = await showModalBottomSheet<InvItem>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const _StItemPickerSheet(),
    );
    if (item != null && mounted) await _openCountForItem(item);
  }

  Future<void> _post() async {
    final t = RT(context);
    final brand = InvColors.brand(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: t.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text('Post stock take?', style: RunqText.h3.copyWith(color: t.ink)),
        content: Text(
          'Variance vs system qty will be posted as one adjustment + JE. '
          'Uncounted lines are assumed zero variance.',
          style: RunqText.body.copyWith(color: t.muted, fontSize: 14),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            style: TextButton.styleFrom(foregroundColor: t.muted),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(
              backgroundColor: brand,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
            child: const Text('Post'),
          ),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    setState(() => posting = true);
    try {
      await inventoryRepo.postStockTake(widget.stockTakeId);
      if (!mounted) return;
      RunqSnack.success(context, 'Stock take posted',
          description: 'Adjustment and journal entry created.');
      Navigator.of(context).pop();
    } catch (e) {
      if (!mounted) return;
      RunqSnack.error(context, "Couldn't post the stock take",
          description: snackErrorText(e));
    } finally {
      if (mounted) setState(() => posting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final detail = ref.watch(invStockTakeDetailProvider(widget.stockTakeId));
    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: AppBar(
        title: Text(
          detail.maybeWhen(data: (d) => d.stNo, orElse: () => 'Counting'),
          style: RunqText.h3.copyWith(color: t.ink),
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12, top: 10, bottom: 10),
            child: _PostBtn(busy: posting, onTap: posting ? null : _post),
          ),
        ],
      ),
      body: detail.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e', style: RunqText.body.copyWith(color: t.muted))),
        data: (d) {
          final counted = d.lines.where((l) => l.countedQty != null).length;
          final variant = d.lines.where((l) => (l.variance ?? 0) != 0).length;
          return Column(
            children: [
              Container(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                color: t.surface,
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(d.warehouseName, style: RunqText.bodyStrong.copyWith(color: t.ink)),
                          Text('$counted of ${d.lines.length} counted · $variant with variance',
                              style: RunqText.caption.copyWith(color: t.muted)),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                color: t.bgWarmer,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _Lbl('Add an item not in this list'),
                    _PickItemCta(onTap: _openItemPicker),
                  ],
                ),
              ),
              Expanded(
                child: ListView.separated(
                  keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  itemCount: d.lines.length,
                  separatorBuilder: (_, __) => Divider(height: 1, color: t.hairlineSoft),
                  itemBuilder: (_, i) {
                    final l = d.lines[i];
                    final v = l.variance;
                    final counted = l.countedQty != null;
                    final subParts = <String>[
                      if ((l.itemUnit ?? '').isNotEmpty) l.itemUnit!,
                      if ((l.itemSku ?? '').isNotEmpty) l.itemSku!,
                      if (l.batchNo != null && l.batchNo!.isNotEmpty) l.batchNo!,
                      if (!counted) 'Not counted',
                    ];
                    return ListTile(
                      dense: true,
                      onTap: () => _openCountForLine(l),
                      title: Text(l.itemName, style: RunqText.body.copyWith(color: t.ink)),
                      subtitle: subParts.isEmpty
                          ? null
                          : Text(
                              subParts.join(' · '),
                              style: RunqText.caption.copyWith(color: t.muted),
                            ),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          _QtyPill(text: _fmtQty(l.systemQty)),
                          const SizedBox(width: 6),
                          if (v == null || v == 0)
                            Icon(
                              counted ? Icons.check_circle : Icons.chevron_right,
                              size: counted ? 18 : 20,
                              color: counted ? InvColors.success : t.muted2,
                            )
                          else
                            Text(
                              v > 0 ? '+${_fmtQty(v)}' : '-${_fmtQty(v.abs())}',
                              style: RunqText.bodyStrong.copyWith(
                                color: v < 0 ? InvColors.error : InvColors.success,
                              ),
                            ),
                        ],
                      ),
                    );
                  },
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

// ── Count sheet — owns its own qty controller + save lifecycle ───────────

// Opened from either a list-tile tap (already-snapshotted line) or the
// "Pick item" CTA (resolved into a synth line). Pops with `true` on
// successful save so the count screen can invalidate the detail provider.
class _CountSheet extends StatefulWidget {
  const _CountSheet({required this.stockTakeId, required this.line});
  final String stockTakeId;
  final InvStockTakeLine line;
  @override
  State<_CountSheet> createState() => _CountSheetState();
}

class _CountSheetState extends State<_CountSheet> {
  final _ctrl = TextEditingController();
  final _focus = FocusNode();
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    // Pre-fill with prev count if any, else leave blank so the user types
    // the real count rather than overwriting "0".
    if (widget.line.countedQty != null) {
      _ctrl.text = _fmtQty(widget.line.countedQty!);
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _focus.requestFocus();
    });
  }

  @override
  void dispose() {
    _ctrl.dispose();
    _focus.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final qty = double.tryParse(_ctrl.text) ?? -1;
    if (qty < 0) {
      RunqSnack.warning(context, 'Enter a non-negative qty');
      return;
    }
    setState(() => _saving = true);
    try {
      await inventoryRepo.upsertCountLines(widget.stockTakeId, [
        InvCountLineInput(
          itemId: widget.line.itemId,
          batchNo: widget.line.batchNo,
          countedQty: qty,
        ),
      ]);
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      RunqSnack.error(context, "Couldn't save the count",
          description: snackErrorText(e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final l = widget.line;
    final hasSnapshot = l.id.isNotEmpty;
    final insets = MediaQuery.of(context).viewInsets;
    final sub = [
      if ((l.itemSku ?? '').isNotEmpty) l.itemSku!,
      if ((l.itemUnit ?? '').isNotEmpty) l.itemUnit!,
      if ((l.batchNo ?? '').isNotEmpty) 'Batch ${l.batchNo!}',
    ].join(' · ');
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: EdgeInsets.only(bottom: insets.bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _SheetHeader(title: 'Enter count', onClose: () => Navigator.of(context).pop()),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.inventory_2_outlined, size: 18, color: t.muted),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(l.itemName,
                              style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 15),
                              maxLines: 2, overflow: TextOverflow.ellipsis),
                          if (sub.isNotEmpty) ...[
                            const SizedBox(height: 2),
                            Text(sub, style: RunqText.caption.copyWith(color: t.muted)),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                _Lbl('Counted Qty'),
                TextField(
                  controller: _ctrl,
                  focusNode: _focus,
                  style: RunqText.body.copyWith(color: t.ink, fontSize: 16),
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: _dec(context, hint: '0'),
                  onSubmitted: (_) => _save(),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Icon(
                      hasSnapshot ? Icons.inventory_outlined : Icons.add_circle_outline,
                      size: 13,
                      color: hasSnapshot ? t.muted : InvColors.amberDeep,
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        hasSnapshot
                            ? 'System: ${_fmtQty(l.systemQty)}'
                              '${l.countedQty != null ? ' · prev count ${_fmtQty(l.countedQty!)}' : ''}'
                            : 'No on-hand snapshot — will count as surplus',
                        style: RunqText.caption.copyWith(
                          color: hasSnapshot ? t.muted : InvColors.amberDeep,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 18),
                InvPrimaryButton(
                  label: 'Save Count',
                  icon: Icons.check_circle_outline,
                  busy: _saving,
                  onTap: _saving ? null : _save,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// Full-width tappable card that replaces the (disabled) barcode field as
// the primary entry point — taps open the searchable item-picker sheet.
class _PickItemCta extends StatelessWidget {
  const _PickItemCta({required this.onTap});
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = InvColors.brand(context);
    return Material(
      color: t.surface,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          decoration: BoxDecoration(
            border: Border.all(color: t.hairline),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            children: [
              Icon(Icons.search, size: 18, color: brand),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Search by name or SKU',
                  style: RunqText.body.copyWith(color: t.muted2, fontSize: 14),
                ),
              ),
              Icon(Icons.chevron_right, size: 18, color: t.muted2),
            ],
          ),
        ),
      ),
    );
  }
}

// Drop trailing zeros so quantities read naturally: `5.000` → `5`,
// `5.500` → `5.5`, `5.123` → `5.12`. Two-decimal cap keeps long
// floats (`5.123456`) from blowing out line subtitles.
String _fmtQty(num q) {
  if (q == q.truncateToDouble()) return q.toInt().toString();
  return q
      .toStringAsFixed(2)
      .replaceFirst(RegExp(r'0+$'), '')
      .replaceFirst(RegExp(r'\.$'), '');
}

// ── Posted detail sheet — read-only view of a posted session ─────────────

// Fetches the full detail (lines + status) for a posted stock take and
// renders it as a scrollable sheet: header chip row (warehouse · date ·
// status), summary strip (counted / variance lines / net value impact),
// then each line with system → counted → variance pill.
class _PostedDetailSheet extends ConsumerStatefulWidget {
  const _PostedDetailSheet({required this.st});
  final InvStockTake st;
  @override
  ConsumerState<_PostedDetailSheet> createState() => _PostedDetailSheetState();
}

class _PostedDetailSheetState extends ConsumerState<_PostedDetailSheet> {
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final detail = ref.watch(invStockTakeDetailProvider(widget.st.id));
    return DraggableScrollableSheet(
      initialChildSize: 0.75,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      expand: false,
      builder: (_, scrollCtrl) => Container(
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: Column(
          children: [
            _SheetHeader(title: widget.st.stNo, onClose: () => Navigator.of(context).pop()),
            Expanded(
              child: detail.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => Center(
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: Text('Failed to load: $e',
                        textAlign: TextAlign.center,
                        style: RunqText.caption.copyWith(color: t.muted)),
                  ),
                ),
                data: (d) => _buildBody(scrollCtrl, d),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBody(ScrollController scrollCtrl, InvStockTakeDetail d) {
    final t = RT(context);
    final counted = d.lines.where((l) => l.countedQty != null).length;
    final variantLines = d.lines.where((l) => (l.variance ?? 0) != 0).toList();
    final netValue = variantLines.fold<double>(
      0, (s, l) => s + (l.variance ?? 0) * l.unitCost);
    final startDate = widget.st.startedAt.isNotEmpty
        ? widget.st.startedAt.substring(0, 10)
        : '';
    return ListView(
      controller: scrollCtrl,
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: t.bgWarmer,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            children: [
              Icon(Icons.store_outlined, size: 14, color: t.muted),
              const SizedBox(width: 6),
              Expanded(
                child: Text(d.warehouseName,
                    style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 14),
                    maxLines: 1, overflow: TextOverflow.ellipsis),
              ),
              if (startDate.isNotEmpty) ...[
                Text(startDate, style: RunqText.caption.copyWith(color: t.muted)),
                const SizedBox(width: 8),
              ],
              InvStatusPill(status: d.status),
            ],
          ),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: InvKpiCard(
                label: 'Counted',
                value: '$counted / ${d.lines.length}',
                sub: 'lines',
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _PostedValueCard(
                label: 'Variance',
                value: variantLines.isEmpty
                    ? '—'
                    : '${netValue >= 0 ? '+' : '−'}${compactINR(netValue.abs())}',
                sub: '${variantLines.length} line${variantLines.length == 1 ? '' : 's'}',
                netValue: netValue,
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            Text('Lines',
                style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 14)),
            const SizedBox(width: 6),
            Text('(${d.lines.length})',
                style: RunqText.caption.copyWith(color: t.muted)),
          ],
        ),
        const SizedBox(height: 8),
        for (var i = 0; i < d.lines.length; i++) ...[
          if (i > 0) const SizedBox(height: 8),
          _PostedLineCard(line: d.lines[i]),
        ],
      ],
    );
  }
}

// Variance KPI variant — red when stock written down, green when added,
// muted when zero. Matches the adjustment summary's _ValueKpiCard tone.
class _PostedValueCard extends StatelessWidget {
  const _PostedValueCard({
    required this.label,
    required this.value,
    required this.sub,
    required this.netValue,
  });
  final String label;
  final String value;
  final String sub;
  final double netValue;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final tint = netValue == 0
        ? null
        : (netValue < 0
            ? InvColors.error.withValues(alpha: 0.08)
            : InvColors.success.withValues(alpha: 0.08));
    final border = netValue == 0
        ? null
        : (netValue < 0
            ? InvColors.error.withValues(alpha: 0.30)
            : InvColors.success.withValues(alpha: 0.30));
    final valueColor = netValue == 0
        ? t.muted
        : (netValue < 0 ? InvColors.error : InvColors.success);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: tint ?? t.surface,
        border: Border.all(color: border ?? t.hairline),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label.toUpperCase(), style: RunqText.label.copyWith(color: t.muted)),
          const SizedBox(height: 4),
          Text(value,
              style: RunqText.numberLg
                  .copyWith(color: valueColor, fontSize: 20, height: 1.15),
              maxLines: 1, overflow: TextOverflow.ellipsis),
          const SizedBox(height: 2),
          Text(sub, style: RunqText.caption.copyWith(color: t.muted)),
        ],
      ),
    );
  }
}

// Single line row in the posted-detail body. Shows item + sku/batch on
// the left, system → counted on the right, and a coloured variance pill
// underneath when non-zero.
class _PostedLineCard extends StatelessWidget {
  const _PostedLineCard({required this.line});
  final InvStockTakeLine line;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final v = line.variance ?? 0;
    final counted = line.countedQty != null;
    final hasVariance = v != 0;
    final varianceColor = v < 0 ? InvColors.error : InvColors.success;
    final sub = [
      if ((line.itemSku ?? '').isNotEmpty) line.itemSku!,
      if ((line.batchNo ?? '').isNotEmpty) 'Batch ${line.batchNo!}',
    ].join(' · ');
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: t.surface,
        border: Border.all(color: t.hairline),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.inventory_2_outlined, size: 16, color: t.muted),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(line.itemName,
                        style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 14),
                        maxLines: 2, overflow: TextOverflow.ellipsis),
                    if (sub.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(sub, style: RunqText.caption.copyWith(color: t.muted)),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    counted
                        ? '${_fmtQty(line.systemQty)} → ${_fmtQty(line.countedQty!)}'
                        : 'Not counted',
                    style: RunqText.caption.copyWith(
                      color: counted ? t.ink : t.muted,
                      fontWeight: counted ? FontWeight.w600 : FontWeight.w400,
                    ),
                  ),
                  if (hasVariance) ...[
                    const SizedBox(height: 4),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                      decoration: BoxDecoration(
                        color: varianceColor.withValues(alpha: 0.10),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        v > 0 ? '+${_fmtQty(v)}' : '-${_fmtQty(v.abs())}',
                        style: RunqText.micro.copyWith(
                          color: varianceColor,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ── Searchable item picker sheet — non-barcoded path ─────────────────────

class _StItemPickerSheet extends StatefulWidget {
  const _StItemPickerSheet();
  @override
  State<_StItemPickerSheet> createState() => _StItemPickerSheetState();
}

class _StItemPickerSheetState extends State<_StItemPickerSheet> {
  final _ctrl = TextEditingController();
  List<InvItem> _results = const [];
  bool _loading = false;
  String _lastQuery = '';
  // Stock-take counts everything in the warehouse — no single class makes
  // sense as the floor's intent. Default to All; users tap a bucket to
  // focus on one class at a time.
  static const _preferredGroup = classGroupAll;
  String? _classGroup;
  bool _userPickedGroup = false;

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
      final hits = await inventoryRepo.searchItems(q);
      if (!mounted || q != _lastQuery) return;
      setState(() => _results = hits);
    } finally {
      if (mounted && q == _lastQuery) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return DraggableScrollableSheet(
      initialChildSize: 0.7,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      expand: false,
      builder: (_, scrollCtrl) => Container(
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: Column(
          children: [
            _SheetHeader(title: 'Pick item', onClose: () => Navigator.of(context).pop()),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: TextField(
                controller: _ctrl,
                autofocus: true,
                onChanged: _runSearch,
                style: RunqText.body.copyWith(color: t.ink, fontSize: 14),
                decoration: InputDecoration(
                  hintText: 'Search by name or SKU',
                  hintStyle: RunqText.body.copyWith(color: t.muted2, fontSize: 14),
                  prefixIcon: Icon(Icons.search, color: t.muted),
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
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: BorderSide(color: InvColors.brand(context), width: 1.2),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 8),
            if (_results.isNotEmpty) ...[
              Builder(builder: (_) {
                final counts = bucketCountsFor(_results.map((r) => r.itemClass));
                if (!_userPickedGroup) {
                  final resolved = resolveDefaultClassGroup(_preferredGroup, counts);
                  if (_classGroup != resolved) {
                    WidgetsBinding.instance.addPostFrameCallback((_) {
                      if (mounted) setState(() => _classGroup = resolved);
                    });
                  }
                }
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: InvClassTabs(
                    selected: _classGroup ?? classGroupAll,
                    counts: counts,
                    onChanged: (g) => setState(() {
                      _classGroup = g;
                      _userPickedGroup = true;
                    }),
                  ),
                );
              }),
            ],
            Expanded(
              child: _loading && _results.isEmpty
                  ? const Center(child: CircularProgressIndicator())
                  : Builder(builder: (_) {
                      final active = _classGroup ?? classGroupAll;
                      final shown = active == classGroupAll
                          ? _results
                          : _results
                              .where((r) => classGroupForItemClass(r.itemClass) == active)
                              .toList();
                      if (shown.isEmpty) {
                        return Center(
                          child: Padding(
                            padding: const EdgeInsets.all(20),
                            child: Text(
                              _results.isEmpty
                                  ? 'No items match. Tweak the search or add this item in Masters.'
                                  : 'No items in this group. Try another tab.',
                              textAlign: TextAlign.center,
                              style: RunqText.caption.copyWith(color: t.muted),
                            ),
                          ),
                        );
                      }
                      return ListView.separated(
                        controller: scrollCtrl,
                        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                        padding: EdgeInsets.only(
                            bottom: MediaQuery.of(context).viewInsets.bottom),
                        itemCount: shown.length,
                        separatorBuilder: (_, __) => Divider(
                            height: 1, color: t.hairlineSoft, thickness: 0.5),
                        itemBuilder: (_, i) {
                          final r = shown[i];
                          return ListTile(
                            title: Text(r.name,
                                style: RunqText.bodyStrong
                                    .copyWith(color: t.ink, fontSize: 14)),
                            subtitle: Text(
                              [
                                if ((r.sku ?? '').isNotEmpty) r.sku!,
                                if ((r.unit ?? '').isNotEmpty) r.unit!,
                              ].join(' · '),
                              style: RunqText.caption.copyWith(color: t.muted),
                              ),
                              onTap: () => Navigator.of(context).pop(r),
                            );
                          },
                      );
                    }),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Local sheet chrome ───────────────────────────────────────────────────

class _SheetHeader extends StatelessWidget {
  const _SheetHeader({required this.title, required this.onClose});
  final String title;
  final VoidCallback onClose;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const SizedBox(height: 10),
        Container(
          width: 36, height: 4,
          decoration: BoxDecoration(color: t.hairline, borderRadius: BorderRadius.circular(2)),
        ),
        const SizedBox(height: 8),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 12, 8),
          child: Row(children: [
            Expanded(child: Text(title, style: RunqText.h3.copyWith(color: t.ink))),
            Material(
              color: t.bgWarmer,
              shape: const CircleBorder(),
              child: InkWell(
                customBorder: const CircleBorder(),
                onTap: onClose,
                child: SizedBox(
                  width: 28, height: 28,
                  child: Icon(Icons.close, size: 14, color: t.muted),
                ),
              ),
            ),
          ]),
        ),
      ],
    );
  }
}

class _Lbl extends StatelessWidget {
  const _Lbl(this.label);
  final String label;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 5),
    child: Text(label.toUpperCase(),
        style: RunqText.label.copyWith(color: RT(context).muted, letterSpacing: 0.5)),
  );
}

InputDecoration _dec(BuildContext context, {String? hint, Widget? suffix}) {
  final t = RT(context);
  return InputDecoration(
    hintText: hint,
    hintStyle: RunqText.body.copyWith(color: t.muted2, fontSize: 14),
    filled: true,
    fillColor: t.surface,
    isDense: true,
    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
    suffixIcon: suffix,
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
      borderSide: BorderSide(color: InvColors.brand(context), width: 1.2),
    ),
  );
}

// ── Qty pill — subtle bordered chip surfacing system on-hand on rows ────

class _QtyPill extends StatelessWidget {
  const _QtyPill({required this.text});
  final String text;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: t.bgWarmer,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: t.hairlineSoft),
      ),
      child: Text(
        text,
        style: RunqText.caption.copyWith(
          color: t.ink,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
