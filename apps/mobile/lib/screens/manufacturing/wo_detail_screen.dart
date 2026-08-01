import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/inventory_models.dart';
import '_wo_run_close_dialog.dart';
import '../../api/manufacturing_models.dart';
import '../../api/manufacturing_repo.dart';
import '../../providers/inventory_providers.dart';
import '../../providers/manufacturing_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart';
import 'widgets/mfg_colors.dart';
import 'widgets/mfg_primitives.dart';

// ── Phase 2 actuals card ──────────────────────────────────────────────────────

class _ActualsCard extends ConsumerWidget {
  final WorkOrder wo;
  const _ActualsCard({required this.wo});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final consumptionAsync = ref.watch(woConsumptionProvider(wo.id));
    final outputAsync = ref.watch(woOutputProvider(wo.id));

    return MfgCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Actuals', style: RunqText.label),
          const SizedBox(height: 10),
          consumptionAsync.when(
            loading: () => const LinearProgressIndicator(),
            error: (_, __) => Text('—', style: RunqText.body.copyWith(color: t.muted)),
            data: (rows) {
              if (rows.isEmpty) {
                return Text('No consumption recorded.',
                    style: RunqText.caption.copyWith(color: t.muted));
              }
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Consumption', style: RunqText.label.copyWith(color: t.muted)),
                  const SizedBox(height: 6),
                  for (final row in rows)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 3),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              '${row.inputItemName}'
                              '${row.batchNo != null ? '  ·  ${row.batchNo}' : ''}',
                              style: RunqText.caption.copyWith(color: t.muted),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          Text(
                            '${_qty(row.qty)} ${row.uom}',
                            style: RunqText.caption.copyWith(color: t.ink),
                          ),
                        ],
                      ),
                    ),
                ],
              );
            },
          ),
          Divider(height: 16, color: t.hairline),
          outputAsync.when(
            loading: () => const LinearProgressIndicator(),
            error: (_, __) => Text('—', style: RunqText.body.copyWith(color: t.muted)),
            data: (rows) {
              if (rows.isEmpty) {
                return Text('No output recorded.',
                    style: RunqText.caption.copyWith(color: t.muted));
              }
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Output', style: RunqText.label.copyWith(color: t.muted)),
                  const SizedBox(height: 6),
                  for (final row in rows)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 3),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              'Batch ${row.batchNo}'
                              '${row.expiryDate != null ? '  exp ${mfgPrettyDate(row.expiryDate!)}' : ''}',
                              style: RunqText.caption.copyWith(color: t.muted),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          Text(
                            '${_qty(row.qty)} ${row.uom}',
                            style: RunqText.caption.copyWith(color: t.ink),
                          ),
                        ],
                      ),
                    ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }

  /// Trims trailing zeros: 600 stays "600", 309.06 reads "309.06" rather than
  /// "309.060", and 0.5 stays "0.5".
  static String _qty(double v) {
    if (v == v.truncateToDouble()) return v.toStringAsFixed(0);
    return v.toStringAsFixed(3).replaceFirst(RegExp(r'0+$'), '').replaceFirst(RegExp(r'\.$'), '');
  }
}

class WoDetailScreen extends ConsumerStatefulWidget {
  final String woId;
  const WoDetailScreen({super.key, required this.woId});

  @override
  ConsumerState<WoDetailScreen> createState() => _WoDetailScreenState();
}

class _WoDetailScreenState extends ConsumerState<WoDetailScreen> {
  bool _busy = false;

  /// Draft → in_progress, then straight into the run view where consumption and
  /// output are recorded. Previously a draft could only be edited or cancelled
  /// from here, so there was no way to advance it without knowing the run URL.
  Future<void> _start(WorkOrder wo) async {
    setState(() => _busy = true);
    try {
      await manufacturingRepo.startWo(wo.id);
      if (!mounted) return;
      ref.invalidate(workOrderDetailProvider(widget.woId));
      ref.invalidate(workOrderListProvider);
      ref.invalidate(mfgDashboardProvider);
      context.push('/manufacturing/wos/${wo.id}/run');
    } catch (e) {
      // Same surface the run screen uses for lifecycle failures.
      if (mounted) showRunqSnack(context, e.toString(), kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Completed → closed. This is where finished goods enter stock, costing is
  /// computed and the GL entry posts, so it's a supervisor action rather than
  /// something the shop floor does — but it has to be reachable, and the run
  /// screen the technician sees deliberately stops at "completed".
  Future<void> _close(WorkOrder wo) async {
    WoCostingPreview? preview;
    try {
      preview = await manufacturingRepo.getCostingPreview(wo.id);
    } catch (_) {
      // Preview is a nicety; fall back to the header figures below.
    }
    if (!mounted) return;
    final fallback = WoCostingPreview(
      woId: wo.id,
      consumedValue: wo.consumedValue,
      actualOutputQty: wo.outputQty,
      expectedOutputQty: wo.plannedQty,
      perUnitOutputCost: 0,
      varianceQty: wo.outputQty - wo.plannedQty,
      varianceValue: 0,
    );
    final confirmed = await showWoCloseDialog(
      context,
      preview: preview ?? fallback,
      outputUom: wo.outputUom,
    );
    if (confirmed != true || !mounted) return;

    setState(() => _busy = true);
    try {
      final result = await manufacturingRepo.closeWo(wo.id);
      // A high yield variance comes back as warnings rather than a hard failure;
      // the server only books it once someone acknowledges the number.
      if (result.warnings.isNotEmpty && mounted) {
        final ack = await showWoCloseDialog(
          context,
          preview: preview ?? fallback,
          outputUom: wo.outputUom,
          warnings: result.warnings,
        );
        if (ack != true || !mounted) return;
        await manufacturingRepo.closeWo(wo.id, varianceAcknowledged: true);
      }
      if (!mounted) return;
      ref.invalidate(workOrderDetailProvider(widget.woId));
      ref.invalidate(workOrderListProvider);
      ref.invalidate(mfgDashboardProvider);
      ref.invalidate(invOnHandProvider);
      showRunqSnack(context, 'Work order closed — GL posted', kind: SnackKind.success);
    } catch (e) {
      if (mounted) showRunqSnack(context, e.toString(), kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _cancel(WorkOrder wo) async {
    String? reason;
    reason = await showDialog<String>(
      context: context,
      builder: (ctx) {
        final ctrl = TextEditingController();
        return AlertDialog(
          title: const Text('Cancel Work Order'),
          content: TextField(
            controller: ctrl,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(
              labelText: 'Reason (optional)',
              hintText: 'Enter cancellation reason',
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Back')),
            TextButton(
              onPressed: () => Navigator.pop(ctx, ctrl.text.trim()),
              child: Text('Cancel WO',
                  style: TextStyle(color: MfgColors.error)),
            ),
          ],
        );
      },
    );
    if (!mounted) return;
    setState(() => _busy = true);
    try {
      await manufacturingRepo.cancelWo(
        widget.woId,
        reason: reason?.isEmpty == true ? null : reason,
      );
      ref.invalidate(workOrderDetailProvider(widget.woId));
      ref.invalidate(workOrderListProvider);
      if (mounted) showRunqSnack(context, 'Work order cancelled', kind: SnackKind.success);
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

    return Scaffold(
      backgroundColor: t.bgWarm,
      body: woAsync.when(
        loading: () => const Scaffold(body: Center(child: CircularProgressIndicator())),
        error: (e, _) =>
            Scaffold(body: Center(child: Text('Failed to load: $e', style: RunqText.body))),
        data: (wo) => Column(
          children: [
            SafeArea(
              bottom: false,
              child: MfgPlainAppBar(
                title: wo.woNumber,
                actions: [
                  if (wo.isDraft)
                    IconButton(
                      icon: const Icon(Icons.edit_outlined, size: 20),
                      onPressed: _busy
                          ? null
                          : () => context.push('/manufacturing/wos/${wo.id}/edit'),
                    ),
                ],
              ),
            ),
            Expanded(
              child: RefreshIndicator(
                onRefresh: () async =>
                    ref.invalidate(workOrderDetailProvider(widget.woId)),
                child: ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 120),
                  children: [
                    const SizedBox(height: 8),
                    // Lead with the run itself: what's being made, how much, and
                    // where it stands. The old screen opened with a label/value
                    // list where the WO number — already in the app bar — was the
                    // first row and the quantity was the fifth.
                    _RunHeroCard(wo: wo),
                    const SizedBox(height: 12),
                    // Date / shift / warehouse as chips: three one-word facts
                    // don't each need a labelled row.
                    _RunMetaRow(wo: wo),
                    const SizedBox(height: 12),
                    _MaterialsCard(wo: wo),
                    const SizedBox(height: 12),
                    if (!wo.isDraft && !wo.isCancelled) ...[
                      _ActualsCard(wo: wo),
                      const SizedBox(height: 12),
                    ],
                    _CostingCard(wo: wo),
                    const SizedBox(height: 12),
                    _RunTimeline(wo: wo),
                  ],
                ),
              ),
            ),
            // Bottom action bar
            if (!wo.isCancelled && !wo.isClosed)
              SafeArea(
                top: false,
                child: Container(
                  padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
                  decoration: BoxDecoration(
                    color: t.surface,
                    border: Border(top: BorderSide(color: t.hairline)),
                  ),
                  child: Row(
                    children: [
                      if (wo.isDraft) ...[
                        OutlinedButton(
                          onPressed: _busy ? null : () => _cancel(wo),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: MfgColors.error,
                            side: BorderSide(color: MfgColors.error),
                            minimumSize: const Size(96, 48),
                            padding: const EdgeInsets.symmetric(horizontal: 12),
                          ),
                          child: const Text('Cancel', maxLines: 1),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: MfgPrimaryButton(
                            label: 'Start run',
                            onPressed: _busy ? null : () => _start(wo),
                            icon: Icons.play_arrow_rounded,
                          ),
                        ),
                      ] else if (wo.isInProgress) ...[
                        Expanded(
                          child: MfgPrimaryButton(
                            label: 'Open Run View',
                            onPressed: _busy
                                ? null
                                : () => context.push('/manufacturing/wos/${wo.id}/run'),
                            icon: Icons.play_circle_outline_rounded,
                          ),
                        ),
                      ] else if (wo.isCompleted) ...[
                        Expanded(
                          child: MfgPrimaryButton(
                            label: 'Close work order',
                            loading: _busy,
                            onPressed: _busy ? null : () => _close(wo),
                            icon: Icons.lock_outline_rounded,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  static String _qty(double v) =>
      v == v.truncateToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(3);
}

class _ExpectedLineRow extends StatelessWidget {
  final WorkOrderExpectedLine line;
  final double plannedQty;
  const _ExpectedLineRow({required this.line, required this.plannedQty});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final expectedQty = line.expectedQty(plannedQty);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          flex: 3,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                line.inputItemName,
                style: RunqText.bodyStrong.copyWith(color: t.ink),
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 2),
              Text(
                '${_qty(line.qtyPerOutput)} ${line.inputUom}/output'
                '${line.scrapPct > 0 ? ' + ${line.scrapPct.toStringAsFixed(1)}% scrap' : ''}',
                style: RunqText.caption.copyWith(color: t.muted),
              ),
            ],
          ),
        ),
        const SizedBox(width: 12),
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              '${_qty(expectedQty)} ${line.inputUom}',
              style: RunqText.bodyStrong.copyWith(color: t.ink),
            ),
            const SizedBox(height: 2),
            Text('—', style: RunqText.caption.copyWith(color: t.muted)),
          ],
        ),
      ],
    );
  }

  static String _qty(double v) =>
      v == v.truncateToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(4);
}

class _CostRow extends StatelessWidget {
  final String label;
  final double value;
  const _CostRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Expanded(child: Text(label, style: RunqText.body.copyWith(color: t.muted))),
          Text(
            value == 0 ? '—' : mfgIndianINR(value, decimals: 2),
            style: RunqText.bodyStrong.copyWith(color: t.ink),
          ),
        ],
      ),
    );
  }
}

// ── Redesigned detail sections ────────────────────────────────────────────

/// The run at a glance: output item, planned quantity in display type, status.
/// Everything a manager needs before deciding whether to open it.
class _RunHeroCard extends StatelessWidget {
  const _RunHeroCard({required this.wo});
  final WorkOrder wo;

  @override
  Widget build(BuildContext context) {
    // Everything on the brand gradient is white — theme ink renders near-black
    // on crimson in light mode.
    const onHero = Colors.white;
    final onHeroSoft = Colors.white.withValues(alpha: 0.78);
    final hasOutput = wo.outputQty > 0;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: MfgColors.heroGradientSoft,
        borderRadius: BorderRadius.circular(RunqRadii.card),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // The product is the headline. It was previously set at body weight
        // beside a 32px quantity, so the thing being made read as a caption on
        // its own number.
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Padding(
            padding: EdgeInsets.only(top: 2),
            child: Icon(Icons.factory_outlined, size: 18, color: onHero),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(wo.outputItemName,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: RunqText.h2.copyWith(
                    color: onHero, fontWeight: FontWeight.w700, height: 1.15)),
          ),
          const SizedBox(width: 8),
          _HeroStatusPill(status: wo.status),
        ]),
        const SizedBox(height: 14),
        // Planned and produced as peer figures, each labelled. Side by side they
        // invite the comparison that matters; stacked prose did not.
        Row(children: [
          Expanded(
            child: _HeroStat(
              label: 'Planned',
              value: _WoDetailScreenState._qty(wo.plannedQty),
              uom: wo.outputUom,
              onHero: onHero,
              onHeroSoft: onHeroSoft,
            ),
          ),
          if (hasOutput) ...[
            const SizedBox(width: 10),
            Expanded(
              child: _HeroStat(
                label: 'Produced',
                value: _WoDetailScreenState._qty(wo.outputQty),
                uom: wo.outputUom,
                onHero: onHero,
                onHeroSoft: onHeroSoft,
                emphasis: true,
              ),
            ),
          ],
        ]),
      ]),
    );
  }
}

/// One labelled figure inside the hero. Translucent white panel so it separates
/// from the gradient without introducing a second colour.
class _HeroStat extends StatelessWidget {
  const _HeroStat({
    required this.label,
    required this.value,
    required this.uom,
    required this.onHero,
    required this.onHeroSoft,
    this.emphasis = false,
  });

  final String label;
  final String value;
  final String uom;
  final Color onHero;
  final Color onHeroSoft;

  /// Produced gets the stronger panel — it's the fact you came to check.
  final bool emphasis;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: emphasis ? 0.20 : 0.12),
        border: Border.all(color: Colors.white.withValues(alpha: emphasis ? 0.42 : 0.22)),
        borderRadius: BorderRadius.circular(RunqRadii.chip),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label.toUpperCase(),
            style: RunqText.micro.copyWith(
                color: onHeroSoft, fontWeight: FontWeight.w700, letterSpacing: 0.5)),
        const SizedBox(height: 4),
        Row(crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic, children: [
          Flexible(
            child: Text(value,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: RunqText.h1.copyWith(color: onHero, fontWeight: FontWeight.w700)),
          ),
          const SizedBox(width: 4),
          Text(uom, style: RunqText.caption.copyWith(color: onHeroSoft)),
        ]),
      ]),
    );
  }
}

/// Status pill for use on the brand gradient.
class _HeroStatusPill extends StatelessWidget {
  const _HeroStatusPill({required this.status});
  final String status;

  static const _labels = <String, String>{
    'draft': 'Draft',
    'in_progress': 'In Progress',
    'completed': 'Completed',
    'closed': 'Closed',
    'cancelled': 'Cancelled',
  };

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.22),
        border: Border.all(color: Colors.white.withValues(alpha: 0.45)),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        _labels[status] ?? status,
        style: RunqText.micro.copyWith(color: Colors.white, fontWeight: FontWeight.w700),
      ),
    );
  }
}

/// Scheduling facts as chips. The BOM reference lives here too — it identifies
/// the recipe, but it isn't what the manager is looking for first.
class _RunMetaRow extends StatelessWidget {
  const _RunMetaRow({required this.wo});
  final WorkOrder wo;

  @override
  Widget build(BuildContext context) {
    return MfgCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Wrap(spacing: 8, runSpacing: 8, children: [
          _MetaChip(icon: Icons.event_outlined, label: mfgPrettyDate(wo.scheduledFor)),
          if (wo.shift != null && wo.shift!.isNotEmpty)
            _MetaChip(icon: Icons.schedule_rounded, label: wo.shift!),
          _MetaChip(icon: Icons.warehouse_outlined, label: wo.warehouseName),
        ]),
        const SizedBox(height: 10),
        Text('${wo.bomCode} v${wo.bomVersion} · ${wo.bomName}',
            maxLines: 2,
            style: RunqText.caption.copyWith(color: RT(context).muted)),
      ]),
    );
  }
}

class _MetaChip extends StatelessWidget {
  const _MetaChip({required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: t.bgWarm,
        border: Border.all(color: t.hairline),
        borderRadius: BorderRadius.circular(RunqRadii.chip),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 13, color: t.muted),
        const SizedBox(width: 5),
        Text(label, style: RunqText.caption.copyWith(color: t.ink)),
      ]),
    );
  }
}

/// What the run needs, and — while it's still a draft — whether stock covers it.
/// A draft WO whose inputs aren't on hand is the single most useful thing this
/// screen can tell a plant manager.
class _MaterialsCard extends ConsumerWidget {
  const _MaterialsCard({required this.wo});
  final WorkOrder wo;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final stock = ref
            .watch(invOnHandProvider((
              warehouseId: wo.warehouseId,
              lowOnly: false,
              itemClassGroup: 'inputs',
            )))
            .asData
            ?.value ??
        const <InvOnHandRow>[];
    final available = <String, double>{};
    for (final r in stock) {
      available[r.itemId] = (available[r.itemId] ?? 0) + r.qty;
    }

    return MfgCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Text('Materials', style: RunqText.label),
          const Spacer(),
          if (wo.isDraft)
            Text('vs stock on hand', style: RunqText.caption.copyWith(color: t.muted))
          else
            Text('expected vs actual', style: RunqText.caption.copyWith(color: t.muted)),
        ]),
        const SizedBox(height: 12),
        if (wo.expectedLines.isEmpty)
          Text('This BOM has no input lines, so nothing will be consumed.',
              style: RunqText.caption.copyWith(color: t.muted))
        else
          for (final line in wo.expectedLines) ...[
            if (wo.isDraft)
              _DraftMaterialRow(
                line: line,
                plannedQty: wo.plannedQty,
                have: available[line.inputItemId] ?? 0,
              )
            else
              _ExpectedLineRow(line: line, plannedQty: wo.plannedQty),
            if (line != wo.expectedLines.last) Divider(color: t.hairline, height: 18),
          ],
      ]),
    );
  }
}

/// Draft view of one input: required vs on hand, with a shortfall call-out.
class _DraftMaterialRow extends StatelessWidget {
  const _DraftMaterialRow({
    required this.line,
    required this.plannedQty,
    required this.have,
  });
  final WorkOrderExpectedLine line;
  final double plannedQty;
  final double have;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final need = line.expectedQty(plannedQty);
    final short = need - have;
    final tight = short > 0.0001;
    final ratio = need > 0 ? (have / need).clamp(0.0, 1.0) : 1.0;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Expanded(
          child: Text(line.isOptional ? '${line.inputItemName} · optional' : line.inputItemName,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: RunqText.body.copyWith(color: t.ink)),
        ),
        const SizedBox(width: 8),
        Text('${_WoDetailScreenState._qty(need)} ${line.inputUom}',
            style: RunqText.body.copyWith(
                color: tight && !line.isOptional ? MfgColors.orangeAlert : t.ink,
                fontWeight: FontWeight.w700)),
      ]),
      const SizedBox(height: 4),
      Row(children: [
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(3),
            child: LinearProgressIndicator(
              value: ratio,
              minHeight: 4,
              backgroundColor: t.hairline,
              valueColor: AlwaysStoppedAnimation(
                  tight && !line.isOptional ? MfgColors.orangeAlert : MfgColors.brand(context)),
            ),
          ),
        ),
        const SizedBox(width: 8),
        Text('have ${_WoDetailScreenState._qty(have)} ${line.inputUom}',
            style: RunqText.micro.copyWith(color: t.muted)),
      ]),
      if (tight && !line.isOptional) ...[
        const SizedBox(height: 4),
        Text('Short ${_WoDetailScreenState._qty(short)} ${line.inputUom} to run this quantity',
            style: RunqText.micro.copyWith(color: MfgColors.orangeAlert)),
      ],
    ]);
  }
}

/// Costing only earns space once there is costing. A draft showed three dashes,
/// which reads as broken rather than "not yet".
class _CostingCard extends StatelessWidget {
  const _CostingCard({required this.wo});
  final WorkOrder wo;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final hasNumbers =
        wo.consumedValue != 0 || wo.outputValue != 0 || wo.yieldVariance != 0;
    if (!hasNumbers) {
      return MfgCard(
        child: Row(children: [
          Icon(Icons.payments_outlined, size: 16, color: t.muted2),
          const SizedBox(width: 8),
          Expanded(
            child: Text('Costing appears once the run consumes inputs and records output.',
                style: RunqText.caption.copyWith(color: t.muted)),
          ),
        ]),
      );
    }
    return MfgCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Costing', style: RunqText.label),
        const SizedBox(height: 10),
        _CostRow(label: 'Consumed value', value: wo.consumedValue),
        _CostRow(label: 'Output value', value: wo.outputValue),
        _CostRow(label: 'Yield variance', value: wo.yieldVariance),
        if (wo.jeId != null) ...[
          const SizedBox(height: 8),
          Row(children: [
            Icon(Icons.check_circle_outline, size: 14, color: MfgColors.success),
            const SizedBox(width: 5),
            Text('GL entry posted',
                style: RunqText.caption.copyWith(color: MfgColors.success)),
          ]),
        ],
      ]),
    );
  }
}

/// Lifecycle as a stepper. Replaces the four conditional "Started / Completed /
/// Closed" rows that only appeared once they had happened, so the run's shape
/// was invisible until it was over.
class _RunTimeline extends StatelessWidget {
  const _RunTimeline({required this.wo});
  final WorkOrder wo;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    if (wo.isCancelled) {
      return MfgCard(
        child: Row(children: [
          Icon(Icons.cancel_outlined, size: 16, color: MfgColors.error),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'Cancelled',
              style: RunqText.caption.copyWith(color: t.ink),
            ),
          ),
        ]),
      );
    }
    final steps = <(String, String?)>[
      ('Created', wo.createdAt.isNotEmpty ? wo.createdAt : null),
      ('Started', wo.startedAt),
      ('Completed', wo.completedAt),
      ('Closed', wo.closedAt),
    ];
    return MfgCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Progress', style: RunqText.label),
        const SizedBox(height: 10),
        for (var i = 0; i < steps.length; i++)
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Column(children: [
              Icon(
                steps[i].$2 != null
                    ? Icons.check_circle_rounded
                    : Icons.radio_button_unchecked_rounded,
                size: 16,
                color: steps[i].$2 != null ? MfgColors.success : t.muted2,
              ),
              if (i < steps.length - 1)
                Container(width: 1.5, height: 16, color: t.hairline),
            ]),
            const SizedBox(width: 10),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.only(bottom: 14),
                child: Row(children: [
                  Expanded(
                    child: Text(steps[i].$1,
                        style: RunqText.body.copyWith(
                            color: steps[i].$2 != null ? t.ink : t.muted)),
                  ),
                  if (steps[i].$2 != null)
                    Text(mfgPrettyDate(steps[i].$2!.substring(0, 10)),
                        style: RunqText.caption.copyWith(color: t.muted)),
                ]),
              ),
            ),
          ]),
      ]),
    );
  }
}
