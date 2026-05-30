import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/manufacturing_models.dart';
import '../../api/manufacturing_repo.dart';
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

  static String _qty(double v) =>
      v == v.truncateToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(3);
}

class WoDetailScreen extends ConsumerStatefulWidget {
  final String woId;
  const WoDetailScreen({super.key, required this.woId});

  @override
  ConsumerState<WoDetailScreen> createState() => _WoDetailScreenState();
}

class _WoDetailScreenState extends ConsumerState<WoDetailScreen> {
  bool _busy = false;

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
                    // Header pill
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                          decoration: BoxDecoration(
                            color: MfgColors.roseSubtle,
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.factory_outlined,
                                  size: 14, color: MfgColors.brand(context)),
                              const SizedBox(width: 6),
                              Text(
                                wo.outputItemName,
                                style: RunqText.bodyStrong.copyWith(
                                    color: MfgColors.brand(context)),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        MfgStatusPill(status: wo.status),
                      ],
                    ),
                    const SizedBox(height: 16),
                    // WO info card
                    MfgCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Work Order Info', style: RunqText.label),
                          const SizedBox(height: 10),
                          _InfoRow(label: 'WO #', value: wo.woNumber),
                          _InfoRow(label: 'BOM', value: '${wo.bomCode} v${wo.bomVersion}'),
                          _InfoRow(label: 'BOM name', value: wo.bomName),
                          _InfoRow(label: 'Planned', value: '${_qty(wo.plannedQty)} ${wo.outputUom}'),
                          _InfoRow(label: 'Scheduled', value: mfgPrettyDate(wo.scheduledFor)),
                          if (wo.shift != null && wo.shift!.isNotEmpty)
                            _InfoRow(label: 'Shift', value: wo.shift!),
                          _InfoRow(label: 'Warehouse', value: wo.warehouseName),
                          if (wo.startedAt != null)
                            _InfoRow(label: 'Started', value: mfgPrettyDate(wo.startedAt!.substring(0, 10))),
                          if (wo.completedAt != null)
                            _InfoRow(label: 'Completed', value: mfgPrettyDate(wo.completedAt!.substring(0, 10))),
                          if (wo.closedAt != null)
                            _InfoRow(label: 'Closed', value: mfgPrettyDate(wo.closedAt!.substring(0, 10))),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    // Expected vs Actual table
                    MfgCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Text('Expected Inputs', style: RunqText.label),
                              const Spacer(),
                              Text(
                                'vs actuals',
                                style: RunqText.caption.copyWith(color: t.muted),
                              ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          if (wo.expectedLines.isEmpty)
                            Text('No input lines on BOM snapshot.',
                                style: RunqText.caption.copyWith(color: t.muted))
                          else
                            for (final line in wo.expectedLines) ...[
                              _ExpectedLineRow(line: line, plannedQty: wo.plannedQty),
                              if (line != wo.expectedLines.last)
                                Divider(color: t.hairline, height: 14),
                            ],
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    // Actuals card (Phase 2) — visible once WO is in progress
                    if (!wo.isDraft && !wo.isCancelled) ...[
                      _ActualsCard(wo: wo),
                      const SizedBox(height: 12),
                    ],
                    // Costing card
                    MfgCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Costing', style: RunqText.label),
                          const SizedBox(height: 10),
                          _CostRow(label: 'Consumed value', value: wo.consumedValue),
                          _CostRow(label: 'Output value', value: wo.outputValue),
                          _CostRow(label: 'Yield variance', value: wo.yieldVariance),
                          if (wo.jeId != null) ...[
                            const SizedBox(height: 8),
                            Text(
                              'GL entry posted',
                              style: RunqText.caption.copyWith(color: MfgColors.success),
                            ),
                          ],
                        ],
                      ),
                    ),
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
                        Expanded(
                          child: OutlinedButton(
                            onPressed: _busy ? null : () => _cancel(wo),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: MfgColors.error,
                              side: BorderSide(color: MfgColors.error),
                            ),
                            child: const Text('Cancel WO'),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          flex: 2,
                          child: MfgPrimaryButton(
                            label: 'Edit',
                            onPressed: _busy
                                ? null
                                : () => context.push('/manufacturing/wos/${wo.id}/edit'),
                            icon: Icons.edit_outlined,
                          ),
                        ),
                      ] else if (wo.isInProgress || wo.status == 'completed') ...[
                        Expanded(
                          child: MfgPrimaryButton(
                            label: 'Open Run View',
                            onPressed: _busy
                                ? null
                                : () => context.push('/manufacturing/wos/${wo.id}/run'),
                            icon: Icons.play_circle_outline_rounded,
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

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;
  const _InfoRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 96,
            child: Text(label, style: RunqText.caption.copyWith(color: t.muted)),
          ),
          Expanded(
            child: Text(value, style: RunqText.body.copyWith(color: t.ink)),
          ),
        ],
      ),
    );
  }
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
