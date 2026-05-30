// Manufacturing Phase 3 — Yield Trend report screen.
//
// Endpoint: GET /api/v1/manufacturing/reports/yield-trend
// Filters: BOM picker, bucket pills (Day / Week / Month), date range.
// Chart: fl_chart line chart (already in pubspec.yaml as fl_chart ^0.69.2).

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../providers/manufacturing_providers.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import '../widgets/mfg_colors.dart';
import '../widgets/mfg_primitives.dart';
import '../_wo_summary_bom_picker.dart';

part '_yield_trend_widgets.dart';

class YieldTrendScreen extends ConsumerStatefulWidget {
  const YieldTrendScreen({super.key});

  @override
  ConsumerState<YieldTrendScreen> createState() => _YieldTrendScreenState();
}

class _YieldTrendScreenState extends ConsumerState<YieldTrendScreen> {
  String _bucket = 'week';
  String? _bomId;
  String? _bomCode;
  DateTimeRange? _range;

  YieldTrendParams get _params => YieldTrendParams(
        bomId: _bomId,
        bucket: _bucket,
        from: _range?.start.toIso8601String().substring(0, 10),
        to: _range?.end.toIso8601String().substring(0, 10),
      );

  Future<void> _pickBom() async {
    final result = await showWoSummaryBomPicker(context);
    if (result != null) {
      setState(() { _bomId = result.id; _bomCode = result.bomCode; });
    }
  }

  Future<void> _pickRange() async {
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

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = MfgColors.brand(context);
    final dataAsync = ref.watch(yieldTrendProvider(_params));

    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: MfgPlainAppBar(title: 'Yield Trend'),
      body: Column(
        children: [
          _ControlStrip(
            bucket: _bucket,
            bomCode: _bomCode,
            range: _range,
            onBucketChanged: (b) => setState(() => _bucket = b),
            onPickBom: _pickBom,
            onClearBom: () => setState(() { _bomId = null; _bomCode = null; }),
            onPickRange: _pickRange,
            onClearRange: () => setState(() => _range = null),
          ),
          Expanded(
            child: RefreshIndicator(
              color: brand,
              onRefresh: () async {
                ref.invalidate(yieldTrendProvider(_params));
                await Future<void>.delayed(const Duration(milliseconds: 200));
              },
              child: dataAsync.when(
                loading: () => const _TrendSkeleton(),
                error: (e, _) => ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  keyboardDismissBehavior:
                      ScrollViewKeyboardDismissBehavior.onDrag,
                  children: [
                    Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(
                        'Failed to load: $e',
                        style: RunqText.body.copyWith(color: t.muted),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  ],
                ),
                data: (points) {
                  if (points.isEmpty) {
                    return ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      keyboardDismissBehavior:
                          ScrollViewKeyboardDismissBehavior.onDrag,
                      children: [
                        MfgEmptyState(
                          icon: Icons.show_chart_rounded,
                          title: 'No data yet',
                          description:
                              'Close some work orders to see yield trends.',
                        ),
                      ],
                    );
                  }
                  return ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    keyboardDismissBehavior:
                        ScrollViewKeyboardDismissBehavior.onDrag,
                    padding: const EdgeInsets.fromLTRB(12, 8, 12, 100),
                    children: [
                      if (points.length > 1)
                        _YieldChart(points: points)
                      else
                        MfgCard(
                          child: Text(
                            'Add more data points to see the trend chart.',
                            style: RunqText.caption.copyWith(color: t.muted),
                            textAlign: TextAlign.center,
                          ),
                        ),
                      const SizedBox(height: 12),
                      MfgSectionHeader(label: 'Data table'),
                      const SizedBox(height: 4),
                      _TrendTable(points: points),
                    ],
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

// ── Control strip ─────────────────────────────────────────────────────────

class _ControlStrip extends StatelessWidget {
  final String bucket;
  final String? bomCode;
  final DateTimeRange? range;
  final ValueChanged<String> onBucketChanged;
  final VoidCallback onPickBom;
  final VoidCallback onClearBom;
  final VoidCallback onPickRange;
  final VoidCallback onClearRange;

  const _ControlStrip({
    required this.bucket,
    required this.bomCode,
    required this.range,
    required this.onBucketChanged,
    required this.onPickBom,
    required this.onClearBom,
    required this.onPickRange,
    required this.onClearRange,
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
            for (final b in ['day', 'week', 'month']) ...[
              MfgFilterPill(
                label: b[0].toUpperCase() + b.substring(1),
                active: bucket == b,
                onTap: () => onBucketChanged(b),
              ),
              if (b != 'month') const SizedBox(width: 8),
            ],
            const SizedBox(width: 8),
            _ChipButton(
              label: bomCode ?? 'BOM',
              active: bomCode != null,
              onTap: onPickBom,
              onClear: bomCode != null ? onClearBom : null,
            ),
            const SizedBox(width: 8),
            _ChipButton(
              label: _rangeLabel(),
              active: range != null,
              onTap: onPickRange,
              onClear: range != null ? onClearRange : null,
            ),
          ],
        ),
      ),
    );
  }
}

class _ChipButton extends StatelessWidget {
  final String label;
  final bool active;
  final VoidCallback onTap;
  final VoidCallback? onClear;
  const _ChipButton({
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
