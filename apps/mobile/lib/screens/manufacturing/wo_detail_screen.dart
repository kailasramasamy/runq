import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '_wo_run_close_dialog.dart';
import '../../api/manufacturing_models.dart';
import '../../api/manufacturing_repo.dart';
import '../../providers/inventory_providers.dart';
import '../../providers/manufacturing_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart';
import '_wo_correct_entry.dart';
import '_wo_detail_sections.dart';
import 'widgets/mfg_colors.dart';
import 'widgets/mfg_primitives.dart';

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
    // Null means the dialog was dismissed — only the explicit action cancels.
    // An empty string is a confirmed cancel with no reason typed.
    if (reason == null || !mounted) return;
    setState(() => _busy = true);
    try {
      await manufacturingRepo.cancelWo(
        widget.woId,
        reason: reason.isEmpty ? null : reason,
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

  /// Cancelling reverses any stock already drawn, so it stays available right
  /// up to close — a run abandoned mid-shift is the common case, not a draft
  /// nobody started.
  Widget _cancelButton(WorkOrder wo) => OutlinedButton(
        onPressed: _busy ? null : () => _cancel(wo),
        style: OutlinedButton.styleFrom(
          foregroundColor: MfgColors.error,
          side: BorderSide(color: MfgColors.error),
          minimumSize: const Size(96, 48),
          padding: const EdgeInsets.symmetric(horizontal: 12),
        ),
        child: const Text('Cancel', maxLines: 1),
      );

  /// Reverse a closed run and reopen the entry form prefilled from it.
  Future<void> _correct(WorkOrder wo) async {
    setState(() => _busy = true);
    try {
      await correctClosedRun(context, ref, wo);
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
                    // Consumed folds expected *into* actual — these used to be
                    // two cards listing the same inputs twice.
                    WoMaterialsCard(wo: wo),
                    const SizedBox(height: 12),
                    if (!wo.isDraft && !wo.isCancelled) ...[
                      WoOutputCard(wo: wo),
                      const SizedBox(height: 12),
                    ],
                    WoCostingStrip(wo: wo),
                    if (wo.consumedValue != 0 ||
                        wo.outputValue != 0 ||
                        wo.yieldVariance != 0)
                      const SizedBox(height: 12),
                    WoProgressStrip(wo: wo),
                  ],
                ),
              ),
            ),
            // Bottom action bar
            // Closed runs keep a bar too — not to advance the run, but to
            // undo it when the figures went in wrong.
            if (!wo.isCancelled)
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
                        _cancelButton(wo),
                        const SizedBox(width: 10),
                        Expanded(
                          child: MfgPrimaryButton(
                            label: 'Start run',
                            onPressed: _busy ? null : () => _start(wo),
                            icon: Icons.play_arrow_rounded,
                          ),
                        ),
                      ] else if (wo.isInProgress) ...[
                        _cancelButton(wo),
                        const SizedBox(width: 10),
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
                        _cancelButton(wo),
                        const SizedBox(width: 10),
                        Expanded(
                          child: MfgPrimaryButton(
                            label: 'Close work order',
                            loading: _busy,
                            onPressed: _busy ? null : () => _close(wo),
                            icon: Icons.lock_outline_rounded,
                          ),
                        ),
                      ] else if (wo.isClosed) ...[
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: _busy ? null : () => _correct(wo),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: MfgColors.error,
                              side: BorderSide(color: MfgColors.error),
                              minimumSize: const Size(96, 48),
                            ),
                            icon: const Icon(Icons.undo_rounded, size: 18),
                            label: const Text('Correct entry', maxLines: 1),
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
