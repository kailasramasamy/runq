// Manufacturing Phase 3 — WO Summary report screen.
//
// Endpoint: GET /api/v1/manufacturing/reports/wo-summary
// Filters: status pill (All / Closed / Completed), date range, BOM picker.
// Each row: WO# + status pill, BOM code/name, Planned vs Actual qty,
//           yield variance qty + value, Consumed ₹ + Output ₹.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../providers/manufacturing_providers.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import '../widgets/mfg_colors.dart';
import '../widgets/mfg_primitives.dart';
import '../_wo_summary_bom_picker.dart';

class WoSummaryScreen extends ConsumerStatefulWidget {
  /// Optionally pre-set the status filter (e.g. from home deep-link).
  final String? initialStatus;
  const WoSummaryScreen({super.key, this.initialStatus});

  @override
  ConsumerState<WoSummaryScreen> createState() => _WoSummaryScreenState();
}

class _WoSummaryScreenState extends ConsumerState<WoSummaryScreen> {
  String? _status;       // null = All
  String? _bomId;
  String? _bomCode;      // display label for active BOM filter
  DateTimeRange? _range;

  @override
  void initState() {
    super.initState();
    _status = widget.initialStatus;
  }

  WoSummaryParams get _params => WoSummaryParams(
        status: _status,
        bomId: _bomId,
        from: _range?.start.toIso8601String().substring(0, 10),
        to: _range?.end.toIso8601String().substring(0, 10),
      );

  Future<void> _pickDateRange() async {
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 365)),
      initialDateRange: _range,
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: Theme.of(ctx)
              .colorScheme
              .copyWith(primary: MfgColors.brand(ctx)),
        ),
        child: child!,
      ),
    );
    if (picked != null) setState(() => _range = picked);
  }

  Future<void> _pickBom() async {
    final result = await showWoSummaryBomPicker(context);
    if (result != null) {
      setState(() {
        _bomId = result.id;
        _bomCode = result.bomCode;
      });
    }
  }

  void _clearBom() => setState(() { _bomId = null; _bomCode = null; });
  void _clearRange() => setState(() => _range = null);

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = MfgColors.brand(context);
    final dataAsync = ref.watch(woSummaryProvider(_params));

    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: MfgPlainAppBar(title: 'WO Summary'),
      body: Column(
        children: [
          _FilterStrip(
            status: _status,
            bomCode: _bomCode,
            range: _range,
            onStatusChanged: (s) => setState(() => _status = s),
            onPickDate: _pickDateRange,
            onClearDate: _clearRange,
            onPickBom: _pickBom,
            onClearBom: _clearBom,
          ),
          Expanded(
            child: RefreshIndicator(
              color: brand,
              onRefresh: () async {
                ref.invalidate(woSummaryProvider(_params));
                await Future<void>.delayed(const Duration(milliseconds: 200));
              },
              child: dataAsync.when(
                loading: () => const _SummaryListSkeleton(),
                error: (e, _) => Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(
                      'Failed to load: $e',
                      style: RunqText.body.copyWith(color: t.muted),
                      textAlign: TextAlign.center,
                    ),
                  ),
                ),
                data: (rows) {
                  if (rows.isEmpty) {
                    return ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      keyboardDismissBehavior:
                          ScrollViewKeyboardDismissBehavior.onDrag,
                      children: [
                        MfgEmptyState(
                          icon: Icons.assignment_outlined,
                          title: 'No WOs found',
                          description:
                              'Adjust the filters or run some work orders first.',
                        ),
                      ],
                    );
                  }
                  return ListView.separated(
                    physics: const AlwaysScrollableScrollPhysics(),
                    keyboardDismissBehavior:
                        ScrollViewKeyboardDismissBehavior.onDrag,
                    padding: const EdgeInsets.fromLTRB(12, 8, 12, 100),
                    itemCount: rows.length,
                    separatorBuilder: (context, _) => const SizedBox(height: 8),
                    itemBuilder: (context, i) => _WoSummaryRow(
                      row: rows[i],
                      onTap: () => context.push('/manufacturing/wos/${rows[i].woId}'),
                    ),
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Filter strip ──────────────────────────────────────────────────────────

class _FilterStrip extends StatelessWidget {
  final String? status;
  final String? bomCode;
  final DateTimeRange? range;
  final ValueChanged<String?> onStatusChanged;
  final VoidCallback onPickDate;
  final VoidCallback onClearDate;
  final VoidCallback onPickBom;
  final VoidCallback onClearBom;

  const _FilterStrip({
    required this.status,
    required this.bomCode,
    required this.range,
    required this.onStatusChanged,
    required this.onPickDate,
    required this.onClearDate,
    required this.onPickBom,
    required this.onClearBom,
  });

  String _rangeLabel() {
    if (range == null) return 'Date range';
    final s = range!.start;
    final e = range!.end;
    const months = ['Jan','Feb','Mar','Apr','May','Jun',
                    'Jul','Aug','Sep','Oct','Nov','Dec'];
    return '${s.day} ${months[s.month-1]} – ${e.day} ${months[e.month-1]}';
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      color: t.surface,
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        child: Row(
          children: [
            MfgFilterPill(
              label: 'All',
              active: status == null,
              onTap: () => onStatusChanged(null),
            ),
            const SizedBox(width: 8),
            MfgFilterPill(
              label: 'Completed',
              active: status == 'completed',
              onTap: () => onStatusChanged(
                status == 'completed' ? null : 'completed',
              ),
            ),
            const SizedBox(width: 8),
            MfgFilterPill(
              label: 'Closed',
              active: status == 'closed',
              onTap: () => onStatusChanged(
                status == 'closed' ? null : 'closed',
              ),
            ),
            const SizedBox(width: 8),
            _ActionChip(
              label: _rangeLabel(),
              active: range != null,
              onTap: onPickDate,
              onClear: range != null ? onClearDate : null,
            ),
            const SizedBox(width: 8),
            _ActionChip(
              label: bomCode ?? 'BOM',
              active: bomCode != null,
              onTap: onPickBom,
              onClear: bomCode != null ? onClearBom : null,
            ),
          ],
        ),
      ),
    );
  }
}

class _ActionChip extends StatelessWidget {
  final String label;
  final bool active;
  final VoidCallback onTap;
  final VoidCallback? onClear;
  const _ActionChip({
    required this.label,
    required this.active,
    required this.onTap,
    this.onClear,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = MfgColors.brand(context);
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: active ? MfgColors.roseSubtle : t.bgWarm,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: active ? brand : t.hairline),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              label,
              style: RunqText.bodyStrong.copyWith(
                color: active ? brand : t.muted,
              ),
            ),
            if (onClear != null) ...[
              const SizedBox(width: 4),
              GestureDetector(
                onTap: onClear,
                child: Icon(Icons.close_rounded, size: 14, color: brand),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

// ── WO row card ───────────────────────────────────────────────────────────

class _WoSummaryRow extends StatelessWidget {
  final WoSummaryRow row;
  final VoidCallback onTap;
  const _WoSummaryRow({required this.row, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final varPct = row.yieldVariancePct;
    final isNegVar = (varPct ?? 0) < 0;

    return Material(
      color: t.surface,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: t.hairline),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      row.woNumber,
                      style: RunqText.bodyStrong.copyWith(color: t.ink),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const SizedBox(width: 8),
                  MfgStatusPill(status: row.status),
                ],
              ),
              const SizedBox(height: 2),
              Text(
                '${row.bomCode} · ${row.bomName}',
                style: RunqText.caption.copyWith(color: t.muted),
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  _RowKpi(
                    label: 'Planned',
                    value: row.plannedQty.toStringAsFixed(1),
                  ),
                  const SizedBox(width: 16),
                  _RowKpi(
                    label: 'Actual',
                    value: row.actualOutputQty.toStringAsFixed(1),
                  ),
                  const SizedBox(width: 16),
                  _RowKpi(
                    label: 'Yield',
                    value: varPct == null
                        ? '—'
                        : '${varPct >= 0 ? '+' : ''}${varPct.toStringAsFixed(1)}%',
                    valueColor: isNegVar ? MfgColors.error : null,
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Row(
                children: [
                  _RowKpi(
                    label: 'Consumed',
                    value: mfgCompactINR(row.consumedValue),
                  ),
                  const SizedBox(width: 16),
                  _RowKpi(
                    label: 'Output',
                    value: mfgCompactINR(row.outputValue),
                  ),
                  const Spacer(),
                  Text(
                    mfgPrettyDate(row.scheduledFor),
                    style: RunqText.caption.copyWith(color: t.muted2),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RowKpi extends StatelessWidget {
  final String label;
  final String value;
  final Color? valueColor;
  const _RowKpi({required this.label, required this.value, this.valueColor});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: RunqText.micro.copyWith(color: t.muted2)),
        Text(
          value,
          style: RunqText.caption.copyWith(
            color: valueColor ?? t.ink,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}

// ── Loading skeleton ──────────────────────────────────────────────────────

class _SummaryListSkeleton extends StatelessWidget {
  const _SummaryListSkeleton();

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 100),
      itemCount: 6,
      separatorBuilder: (context, _) => const SizedBox(height: 8),
      itemBuilder: (context, _) => Container(
        height: 96,
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: t.hairline),
        ),
      ),
    );
  }
}
