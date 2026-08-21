import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/inventory_models.dart';
import '../../api/manufacturing_models.dart';
import '../../api/manufacturing_repo.dart';
import '../../providers/inventory_providers.dart';
import '../../services/wo_run_queue.dart' show EnqueueOutcome;
import '../../providers/manufacturing_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart';
import 'widgets/mfg_colors.dart';
import 'widgets/mfg_primitives.dart';

/// Shop-floor run entry. One question — how many did you make — then done.
///
/// Packing technicians and cooks are the users here, so per-line consumption,
/// batch pickers and ad-hoc entries are deliberately absent. The work order
/// already states the recipe and the target, so consumption is *backflushed*:
/// derived from the BOM at the quantity actually produced. Anyone who needs to
/// override a line goes to the advanced view.
class WoRunSimpleScreen extends ConsumerStatefulWidget {
  const WoRunSimpleScreen({super.key, required this.woId});
  final String woId;

  @override
  ConsumerState<WoRunSimpleScreen> createState() => _WoRunSimpleScreenState();
}

class _WoRunSimpleScreenState extends ConsumerState<WoRunSimpleScreen> {
  final _qtyCtl = TextEditingController();
  bool _busy = false;
  bool _seeded = false;

  @override
  void dispose() {
    _qtyCtl.dispose();
    super.dispose();
  }

  double get _qty => double.tryParse(_qtyCtl.text) ?? 0;

  void _bump(double by) {
    final next = (_qty + by).clamp(0, 999999).toDouble();
    setState(() => _qtyCtl.text = _fmt(next));
  }

  /// Records the run in one action: consumption for every BOM line at the
  /// produced quantity, the output itself, then completes the WO.
  ///
  /// Raw milk is batch-tracked, so consumption must name a batch — the server
  /// rejects a batch-less line outright. The technician shouldn't be choosing
  /// batches, so allocation happens here: oldest stock first, split across
  /// batches when one can't cover the requirement. That also means the oldest
  /// milk leaves first, which is what a dairy wants anyway.
  Future<void> _finish(WorkOrder wo, List<InvOnHandRow> stock) async {
    if (_qty <= 0) return;
    setState(() => _busy = true);
    try {
      final plan = _allocate(wo, stock);
      if (plan == null) return; // _allocate has already explained why
      // Consumption first: output recorded against no inputs is worse than
      // nothing recorded at all.
      for (final a in plan) {
        final outcome = await manufacturingRepo.addConsumption(
          wo.id,
          bomLineId: a.bomLineId,
          inputItemId: a.itemId,
          batchNo: a.batchNo,
          warehouseId: wo.warehouseId,
          qty: a.qty,
          uom: a.uom,
          notes: 'Backflushed from output',
        );
        // The queue swallows server errors and reports `queued`, so a rejected
        // line looks like success. Stop rather than complete a WO whose inputs
        // never posted.
        if (outcome != EnqueueOutcome.sent) {
          if (mounted) {
            showRunqSnack(context,
                'Could not record ${a.itemName} — saved to retry. Run left in progress.',
                kind: SnackKind.error);
          }
          return;
        }
      }
      final outputOutcome = await manufacturingRepo.addOutput(
        wo.id,
        outputItemId: wo.outputItemId,
        warehouseId: wo.warehouseId,
        qty: _qty,
        uom: wo.outputUom,
      );
      if (outputOutcome != EnqueueOutcome.sent) {
        if (mounted) {
          showRunqSnack(context, 'Output saved to retry. Run left in progress.',
              kind: SnackKind.error);
        }
        return;
      }
      await manufacturingRepo.completeWo(wo.id);
      if (!mounted) return;
      _refresh();
      showRunqSnack(context, 'Run completed', kind: SnackKind.success);
      Navigator.of(context).pop();
    } catch (e) {
      if (mounted) showRunqSnack(context, e.toString(), kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _refresh() {
    ref.invalidate(workOrderDetailProvider(widget.woId));
    ref.invalidate(woConsumptionProvider(widget.woId));
    ref.invalidate(woOutputProvider(widget.woId));
    ref.invalidate(workOrderListProvider);
    ref.invalidate(mfgDashboardProvider);
    // On-hand isn't the only stale view after a run — perishables and the
    // stock highlights move with it.
    invalidateStockViews(ref);
  }

  /// Oldest-first batch allocation for every BOM line. Returns null and explains
  /// itself when stock can't cover the run, so nothing is posted at all.
  List<_Alloc>? _allocate(WorkOrder wo, List<InvOnHandRow> stock) {
    final plan = <_Alloc>[];
    for (final line in wo.expectedLines) {
      var need = line.expectedQty(_qty);
      if (need <= 0) continue;
      final batches = stock.where((r) => r.itemId == line.inputItemId && r.qty > 0).toList()
        ..sort((a, b) => (a.receivedAt ?? '').compareTo(b.receivedAt ?? ''));
      for (final b in batches) {
        if (need <= 0.0001) break;
        final take = need < b.qty ? need : b.qty;
        plan.add(_Alloc(
          bomLineId: line.bomLineId,
          itemId: line.inputItemId,
          itemName: line.inputItemName,
          batchNo: b.batchNo,
          qty: double.parse(take.toStringAsFixed(3)),
          uom: line.inputUom,
        ));
        need -= take;
      }
      if (need > 0.0001 && !line.isOptional) {
        if (mounted) {
          showRunqSnack(
            context,
            'Not enough ${line.inputItemName} in stock — short '
            '${_fmt(need)} ${line.inputUom}. Nothing was recorded.',
            kind: SnackKind.error,
          );
        }
        return null;
      }
    }
    return plan;
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final async = ref.watch(workOrderDetailProvider(widget.woId));
    final wh = async.asData?.value.warehouseId;
    final stock = wh == null
        ? const <InvOnHandRow>[]
        : ref
                .watch(invOnHandProvider(
                    (warehouseId: wh, lowOnly: false, itemClassGroup: 'inputs')))
                .asData
                ?.value ??
            const <InvOnHandRow>[];
    return Scaffold(
      backgroundColor: t.bgWarm,
      body: SafeArea(
        bottom: false,
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => MfgEmptyState(
            icon: Icons.cloud_off_rounded,
            title: 'Could not load work order',
            description: '$e',
          ),
          data: (wo) {
            // Start from the target: on a good run the technician confirms it
            // rather than typing it.
            if (!_seeded) {
              _seeded = true;
              _qtyCtl.text = _fmt(wo.plannedQty);
            }
            return _body(t, wo);
          },
        ),
      ),
      bottomNavigationBar: async.asData?.value == null
          ? null
          : _actionBar(t, async.asData!.value, stock),
    );
  }

  Widget _body(RunqTokens t, WorkOrder wo) {
    final short = _qty < wo.plannedQty;
    final over = _qty > wo.plannedQty;
    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
      children: [
        MfgPlainAppBar(title: wo.woNumber),
        const SizedBox(height: 4),
        // What's being made, and the target — the only context needed.
        Text(wo.outputItemName,
            style: RunqText.h2.copyWith(color: t.ink, fontWeight: FontWeight.w700)),
        const SizedBox(height: 4),
        Text('Target ${_fmt(wo.plannedQty)} ${wo.outputUom} · ${wo.warehouseName}',
            style: RunqText.body.copyWith(color: t.muted)),
        const SizedBox(height: 20),
        MfgCard(
          child: Column(children: [
            Text('How many did you make?',
                style: RunqText.bodyStrong.copyWith(color: t.ink)),
            const SizedBox(height: 14),
            Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
              Expanded(
                child: TextField(
                  controller: _qtyCtl,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  textCapitalization: TextCapitalization.none,
                  textAlign: TextAlign.center,
                  onChanged: (_) => setState(() {}),
                  style: RunqText.h1.copyWith(color: t.ink, fontWeight: FontWeight.w700),
                  decoration: InputDecoration(
                    filled: true,
                    fillColor: t.bgWarm,
                    contentPadding: const EdgeInsets.symmetric(vertical: 14),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(RunqRadii.input),
                      borderSide: BorderSide(color: t.hairline),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(RunqRadii.input),
                      borderSide: BorderSide(color: t.hairline),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Text(wo.outputUom, style: RunqText.body.copyWith(color: t.muted)),
            ]),
            const SizedBox(height: 12),
            // Steppers so a near-target count needs no keyboard at all.
            Row(children: [
              for (final step in [-10.0, -1.0, 1.0, 10.0]) ...[
                if (step != -10.0) const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => _bump(step),
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size(0, 44),
                      side: BorderSide(color: t.hairline),
                      foregroundColor: t.ink,
                    ),
                    child: Text(step > 0 ? '+${_fmt(step)}' : _fmt(step),
                        style: RunqText.body.copyWith(color: t.ink)),
                  ),
                ),
              ],
            ]),
            if (_qty > 0 && (short || over)) ...[
              const SizedBox(height: 10),
              Text(
                over
                    ? '${_fmt(_qty - wo.plannedQty)} ${wo.outputUom} over target'
                    : '${_fmt(wo.plannedQty - _qty)} ${wo.outputUom} short of target',
                style: RunqText.caption.copyWith(
                    color: over ? MfgColors.info : MfgColors.orangeAlert),
              ),
            ],
          ]),
        ),
        const SizedBox(height: 12),
        // Derived, not entered: the technician sees what the run will draw from
        // stock but never has to compute or type it.
        if (wo.expectedLines.isNotEmpty)
          MfgCard(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Will use', style: RunqText.caption.copyWith(color: t.muted)),
              const SizedBox(height: 8),
              for (final line in wo.expectedLines)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 3),
                  child: Row(children: [
                    Expanded(
                      child: Text(line.inputItemName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: RunqText.body.copyWith(color: t.ink)),
                    ),
                    Text('${_fmt(line.expectedQty(_qty))} ${line.inputUom}',
                        style: RunqText.body
                            .copyWith(color: t.ink, fontWeight: FontWeight.w700)),
                  ]),
                ),
            ]),
          ),
        const SizedBox(height: 12),
        Center(
          child: TextButton(
            onPressed: () => context.push('/manufacturing/wos/${wo.id}/run/advanced'),
            child: Text('Record inputs manually',
                style: RunqText.caption.copyWith(color: t.muted)),
          ),
        ),
      ],
    );
  }

  /// Only an in-progress run can be recorded. A completed one would otherwise
  /// post a second set of consumption and output on top of the first.
  Widget _actionBar(RunqTokens t, WorkOrder wo, List<InvOnHandRow> stock) {
    if (!wo.isInProgress) {
      return Container(
        decoration: BoxDecoration(
          color: t.surface,
          border: Border(top: BorderSide(color: t.hairline, width: 0.5)),
        ),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
            child: Row(children: [
              Icon(Icons.check_circle_outline, size: 18, color: MfgColors.success),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'This run is already recorded. Closing it happens on the work order.',
                  style: RunqText.caption.copyWith(color: t.muted),
                ),
              ),
            ]),
          ),
        ),
      );
    }
    return _recordBar(t, wo, stock);
  }

  Widget _recordBar(RunqTokens t, WorkOrder wo, List<InvOnHandRow> stock) => Container(
        decoration: BoxDecoration(
          color: t.surface,
          border: Border(top: BorderSide(color: t.hairline, width: 0.5)),
        ),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
            child: SizedBox(
              height: 52,
              child: MfgPrimaryButton(
                label: 'Done — complete run',
                loading: _busy,
                onPressed: _busy || _qty <= 0 ? null : () => _finish(wo, stock),
                icon: Icons.check_rounded,
              ),
            ),
          ),
        ),
      );

  static String _fmt(double v) {
    if (v == v.truncateToDouble()) return v.toStringAsFixed(0);
    return v.toStringAsFixed(3).replaceFirst(RegExp(r'0+$'), '').replaceFirst(RegExp(r'\.$'), '');
  }
}


/// One batch's slice of a BOM line's requirement.
class _Alloc {
  const _Alloc({
    required this.bomLineId,
    required this.itemId,
    required this.itemName,
    required this.batchNo,
    required this.qty,
    required this.uom,
  });
  final String bomLineId;
  final String itemId;
  final String itemName;
  final String batchNo;
  final double qty;
  final String uom;
}
