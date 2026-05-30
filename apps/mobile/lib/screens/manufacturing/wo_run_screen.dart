// WO Run Screen — plant-floor consumption + output view.
// Tabbed (Consume / Output) with a live costing strip and lifecycle actions.
// Online-only in Phase 2; offline queue deferred to Phase 2.5.

library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/manufacturing_models.dart';
import '../../providers/manufacturing_providers.dart';
import '../../services/wo_run_queue.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart';
import '_wo_run_close_dialog.dart';
import '_wo_run_costing_strip.dart';
import '_wo_run_consume_tab.dart';
import '_wo_run_output_tab.dart';
import 'widgets/mfg_colors.dart';
import 'widgets/mfg_primitives.dart';

class WoRunScreen extends ConsumerStatefulWidget {
  final String woId;
  const WoRunScreen({super.key, required this.woId});

  @override
  ConsumerState<WoRunScreen> createState() => _WoRunScreenState();
}

class _WoRunScreenState extends ConsumerState<WoRunScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  void _invalidateAll() {
    ref.invalidate(workOrderDetailProvider(widget.woId));
    ref.invalidate(woConsumptionProvider(widget.woId));
    ref.invalidate(woOutputProvider(widget.woId));
    ref.invalidate(woPreviewProvider(widget.woId));
  }

  Future<void> _startWo() async {
    setState(() => _busy = true);
    try {
      await manufacturingRepo.startWo(widget.woId);
      _invalidateAll();
      if (mounted) showRunqSnack(context, 'Work order started', kind: SnackKind.success);
    } catch (e) {
      if (mounted) showRunqSnack(context, e.toString(), kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _completeWo() async {
    setState(() => _busy = true);
    try {
      await manufacturingRepo.completeWo(widget.woId);
      _invalidateAll();
      if (mounted) showRunqSnack(context, 'Marked complete', kind: SnackKind.success);
    } catch (e) {
      if (mounted) showRunqSnack(context, e.toString(), kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _closeWo(WorkOrder wo) async {
    // Load preview for dialog
    WoCostingPreview? preview;
    try {
      preview = await manufacturingRepo.getCostingPreview(widget.woId);
    } catch (_) {}

    if (!mounted) return;
    final confirmed = await showWoCloseDialog(
      context,
      preview: preview ??
          WoCostingPreview(
            woId: widget.woId,
            consumedValue: wo.consumedValue,
            actualOutputQty: wo.outputQty,
            expectedOutputQty: wo.plannedQty,
            perUnitOutputCost: 0,
            varianceQty: wo.outputQty - wo.plannedQty,
            varianceValue: 0,
          ),
      outputUom: wo.outputUom,
    );
    if (confirmed != true || !mounted) return;

    setState(() => _busy = true);
    try {
      final result = await manufacturingRepo.closeWo(widget.woId);
      if (result.warnings.isNotEmpty && mounted) {
        // Show warnings and ask to acknowledge
        final ack = await showWoCloseDialog(
          context,
          preview: preview ??
              WoCostingPreview(
                woId: widget.woId,
                consumedValue: wo.consumedValue,
                actualOutputQty: wo.outputQty,
                expectedOutputQty: wo.plannedQty,
                perUnitOutputCost: 0,
                varianceQty: wo.outputQty - wo.plannedQty,
                varianceValue: 0,
              ),
          outputUom: wo.outputUom,
          warnings: result.warnings,
        );
        if (ack != true || !mounted) return;
        // Retry with acknowledgement
        await manufacturingRepo.closeWo(widget.woId, varianceAcknowledged: true);
      }
      _invalidateAll();
      if (mounted) showRunqSnack(context, 'Work order closed — GL posted', kind: SnackKind.success);
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
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Text('Failed to load: $e', style: RunqText.body.copyWith(color: t.muted)),
        ),
        data: (wo) {
          final isEditable = wo.status == 'in_progress';
          final isClosed = wo.status == 'closed' || wo.status == 'cancelled';

          return Column(
            children: [
              SafeArea(
                bottom: false,
                child: MfgPlainAppBar(
                  title: wo.woNumber,
                  actions: [
                    MfgStatusPill(status: wo.status),
                    const SizedBox(width: 8),
                  ],
                ),
              ),
              // Pending-sync banner — appears whenever offline queue has rows
              _PendingSyncBanner(woId: widget.woId),
              // Sticky header card
              _WoHeaderCard(wo: wo),
              // Tabs
              Container(
                color: t.surface,
                child: TabBar(
                  controller: _tabs,
                  labelColor: MfgColors.brand(context),
                  unselectedLabelColor: t.muted,
                  indicatorColor: MfgColors.brand(context),
                  labelStyle: RunqText.bodyStrong,
                  unselectedLabelStyle: RunqText.body,
                  tabs: const [
                    Tab(text: 'Consume'),
                    Tab(text: 'Output'),
                  ],
                ),
              ),
              // Tab bodies
              Expanded(
                child: TabBarView(
                  controller: _tabs,
                  children: [
                    WoRunConsumeTab(
                      wo: wo,
                      isEditable: isEditable,
                      onMutated: _invalidateAll,
                    ),
                    WoRunOutputTab(
                      wo: wo,
                      isEditable: isEditable,
                      onMutated: _invalidateAll,
                    ),
                  ],
                ),
              ),
              // Costing strip
              WoRunCostingStrip(woId: widget.woId, outputUom: wo.outputUom),
              // Bottom action bar
              if (!isClosed) _ActionBar(wo: wo, busy: _busy, onStart: _startWo, onComplete: _completeWo, onClose: () => _closeWo(wo)),
            ],
          );
        },
      ),
    );
  }
}

// ── Header card ───────────────────────────────────────────────────────────────

class _WoHeaderCard extends StatelessWidget {
  final WorkOrder wo;
  const _WoHeaderCard({required this.wo});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      color: t.surface,
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 10),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(wo.bomName,
                    style: RunqText.bodyStrong.copyWith(color: t.ink),
                    overflow: TextOverflow.ellipsis),
                const SizedBox(height: 2),
                Text(
                  '${_qty(wo.plannedQty)} ${wo.outputUom}'
                  '  ·  ${mfgPrettyDate(wo.scheduledFor)}'
                  '${wo.shift != null && wo.shift!.isNotEmpty ? '  ·  ${wo.shift}' : ''}',
                  style: RunqText.caption.copyWith(color: t.muted),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(
            wo.warehouseName,
            style: RunqText.caption.copyWith(color: t.muted),
            textAlign: TextAlign.right,
          ),
        ],
      ),
    );
  }

  static String _qty(double v) =>
      v == v.truncateToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(3);
}

// ── Action bar ────────────────────────────────────────────────────────────────

class _ActionBar extends StatelessWidget {
  final WorkOrder wo;
  final bool busy;
  final VoidCallback onStart;
  final VoidCallback onComplete;
  final VoidCallback onClose;

  const _ActionBar({
    required this.wo,
    required this.busy,
    required this.onStart,
    required this.onComplete,
    required this.onClose,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
        decoration: BoxDecoration(
          color: t.surface,
          border: Border(top: BorderSide(color: t.hairline)),
        ),
        child: SizedBox(
          width: double.infinity,
          child: switch (wo.status) {
            'draft' => MfgPrimaryButton(
                label: 'Start Run',
                loading: busy,
                onPressed: busy ? null : onStart,
              ),
            'in_progress' => MfgPrimaryButton(
                label: 'Mark Complete',
                loading: busy,
                onPressed: (busy || wo.outputQty <= 0) ? null : onComplete,
              ),
            'completed' => MfgPrimaryButton(
                label: 'Close Work Order',
                loading: busy,
                onPressed: busy ? null : onClose,
              ),
            _ => const SizedBox.shrink(),
          },
        ),
      ),
    );
  }
}

// ── Online-only banner ────────────────────────────────────────────────────────

/// Surfaces pending offline-queue rows for this WO. Empty render when the
/// queue is clean; tap-to-retry on failed entries; auto-updates via the
/// queue's `changes` stream.
class _PendingSyncBanner extends StatefulWidget {
  final String woId;
  const _PendingSyncBanner({required this.woId});

  @override
  State<_PendingSyncBanner> createState() => _PendingSyncBannerState();
}

class _PendingSyncBannerState extends State<_PendingSyncBanner> {
  late final StreamSubscription<int> _sub;

  @override
  void initState() {
    super.initState();
    _sub = WoRunQueue.instance.changes.listen((_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _sub.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final pending = WoRunQueue.instance.pendingFor(widget.woId);
    if (pending.isEmpty) return const SizedBox.shrink();

    final failed = pending.where((p) => p.hasFailed).length;
    final total = pending.length;
    final bg = failed > 0 ? MfgColors.orangeAlertBg : MfgColors.infoBg;
    final fg = failed > 0 ? MfgColors.orangeAlert : MfgColors.info;
    final icon = failed > 0 ? Icons.sync_problem_rounded : Icons.sync_rounded;
    final label = failed > 0
        ? '$failed of $total pending posts failed — tap to retry'
        : '$total saved offline — will sync when online';

    return InkWell(
      onTap: () => WoRunQueue.instance.drain(),
      child: Container(
        color: bg,
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
        child: Row(
          children: [
            Icon(icon, size: 14, color: fg),
            const SizedBox(width: 8),
            Expanded(
              child: Text(label, style: RunqText.caption.copyWith(color: fg)),
            ),
            Icon(Icons.chevron_right_rounded, size: 16, color: fg),
          ],
        ),
      ),
    );
  }
}

