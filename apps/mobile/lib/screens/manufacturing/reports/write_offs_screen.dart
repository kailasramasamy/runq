// Daily write-off register — what stock was lost each day and what it cost.
//
// Endpoint: GET /api/v1/inventory/reports/write-offs
// Grouped by day rather than by document: the question a plant asks is "how
// much did we lose yesterday", and a day can carry several write-offs across
// items. Production loss carries the run it came off, so a spike traces back
// to the batch that caused it.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../api/inventory_models.dart';
import '../../../providers/inventory_providers.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import '../widgets/mfg_colors.dart';
import '../widgets/mfg_primitives.dart';

const _reasonLabels = <String, String>{
  'production_loss': 'Production loss',
  'damage': 'Damage',
  'expiry': 'Expiry',
  'theft': 'Theft',
  'free_issue': 'Free issue',
};

/// Reason filter pills. `null` = every loss reason.
const _reasonFilters = <(String?, String)>[
  (null, 'All'),
  ('production_loss', 'Production'),
  ('damage', 'Damage'),
  ('expiry', 'Expiry'),
];

class WriteOffsScreen extends ConsumerStatefulWidget {
  const WriteOffsScreen({super.key});

  @override
  ConsumerState<WriteOffsScreen> createState() => _WriteOffsScreenState();
}

class _WriteOffsScreenState extends ConsumerState<WriteOffsScreen> {
  String? _reason;
  DateTimeRange? _range;

  InvWriteOffParams get _params => (
        from: _range == null ? null : _iso(_range!.start),
        to: _range == null ? null : _iso(_range!.end),
        warehouseId: null,
        reason: _reason,
      );

  static String _iso(DateTime d) => d.toIso8601String().substring(0, 10);

  Future<void> _pickRange() async {
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 1)),
      initialDateRange: _range,
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: Theme.of(ctx).colorScheme.copyWith(primary: MfgColors.brand(ctx)),
        ),
        child: child!,
      ),
    );
    if (picked != null && mounted) setState(() => _range = picked);
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = MfgColors.brand(context);
    final async = ref.watch(invWriteOffsProvider(_params));

    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: const MfgPlainAppBar(title: 'Write-offs'),
      body: Column(
        children: [
          _ControlStrip(
            reason: _reason,
            range: _range,
            onReason: (r) => setState(() => _reason = r),
            onPickRange: _pickRange,
            onClearRange: () => setState(() => _range = null),
          ),
          Expanded(
            child: RefreshIndicator(
              color: brand,
              onRefresh: () async {
                ref.invalidate(invWriteOffsProvider(_params));
                await Future<void>.delayed(const Duration(milliseconds: 200));
              },
              child: async.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => _Scrollable(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text('Failed to load: $e',
                        style: RunqText.body.copyWith(color: t.muted),
                        textAlign: TextAlign.center),
                  ),
                ),
                data: (report) => report.days.isEmpty
                    ? const _Scrollable(
                        child: MfgEmptyState(
                          icon: Icons.delete_outline,
                          title: 'Nothing written off',
                          description: 'No losses recorded in this period.',
                        ),
                      )
                    : _Register(report: report),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Pull-to-refresh needs a scrollable even when there is nothing to show.
class _Scrollable extends StatelessWidget {
  final Widget child;
  const _Scrollable({required this.child});

  @override
  Widget build(BuildContext context) => ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        children: [child],
      );
}

class _ControlStrip extends StatelessWidget {
  final String? reason;
  final DateTimeRange? range;
  final ValueChanged<String?> onReason;
  final VoidCallback onPickRange;
  final VoidCallback onClearRange;

  const _ControlStrip({
    required this.reason,
    required this.range,
    required this.onReason,
    required this.onPickRange,
    required this.onClearRange,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      color: t.surface,
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
      child: Column(
        children: [
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(children: [
              for (final (value, label) in _reasonFilters) ...[
                MfgFilterPill(
                  label: label,
                  active: reason == value,
                  onTap: () => onReason(value),
                ),
                const SizedBox(width: 8),
              ],
            ]),
          ),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(
              child: InkWell(
                onTap: onPickRange,
                borderRadius: BorderRadius.circular(10),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  decoration: BoxDecoration(
                    color: t.bgWarm,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: t.hairline),
                  ),
                  child: Row(children: [
                    Icon(Icons.date_range_rounded, size: 16, color: t.muted),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        range == null
                            ? 'Last 30 days'
                            : '${_WriteOffsScreenState._iso(range!.start)} → ${_WriteOffsScreenState._iso(range!.end)}',
                        style: RunqText.body.copyWith(color: t.ink),
                      ),
                    ),
                  ]),
                ),
              ),
            ),
            if (range != null) ...[
              const SizedBox(width: 8),
              IconButton(
                icon: Icon(Icons.close_rounded, size: 18, color: t.muted),
                onPressed: onClearRange,
              ),
            ],
          ]),
        ],
      ),
    );
  }
}

class _Register extends StatelessWidget {
  final InvWriteOffReport report;
  const _Register({required this.report});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
      children: [
        MfgCard(
          child: Row(children: [
            Expanded(
              child: Text(
                'Total loss · ${report.days.length} day${report.days.length == 1 ? '' : 's'}',
                style: RunqText.caption.copyWith(color: t.muted),
              ),
            ),
            Text(
              mfgIndianINR(report.totalValue, decimals: 2),
              style: RunqText.numberLg.copyWith(color: MfgColors.error),
            ),
          ]),
        ),
        const SizedBox(height: 12),
        for (final day in report.days) ...[
          _DayCard(day: day),
          const SizedBox(height: 10),
        ],
      ],
    );
  }
}

class _DayCard extends StatelessWidget {
  final InvWriteOffDay day;
  const _DayCard({required this.day});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return MfgCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(children: [
            Expanded(
              child: Text(day.date, style: RunqText.bodyStrong.copyWith(color: t.ink)),
            ),
            Text(mfgIndianINR(day.value, decimals: 2),
                style: RunqText.bodyStrong.copyWith(color: MfgColors.error)),
          ]),
          Divider(color: t.hairline, height: 18),
          for (final line in day.lines) ...[
            _LineRow(line: line),
            if (line != day.lines.last) const SizedBox(height: 12),
          ],
        ],
      ),
    );
  }
}

class _LineRow extends StatelessWidget {
  final InvWriteOffLine line;
  const _LineRow({required this.line});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    // Batch and source run are the two things worth chasing a loss by; the
    // adjustment number is the paper trail behind it.
    final meta = [
      _reasonLabels[line.reason] ?? line.reason,
      if (line.batchNo != null && line.batchNo!.isNotEmpty) line.batchNo!,
      if (line.woNumber != null && line.woNumber!.isNotEmpty) line.woNumber!,
      line.adjNo,
    ].join(' · ');

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(line.itemName, style: RunqText.body.copyWith(color: t.ink)),
              const SizedBox(height: 2),
              Text(meta, style: RunqText.caption.copyWith(color: t.muted2)),
            ],
          ),
        ),
        const SizedBox(width: 10),
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text('${_trim(line.qty)}${line.uom == null ? '' : ' ${line.uom}'}',
                style: RunqText.body.copyWith(color: t.ink)),
            const SizedBox(height: 2),
            Text(mfgIndianINR(line.value, decimals: 2),
                style: RunqText.caption.copyWith(color: t.muted)),
          ],
        ),
      ],
    );
  }
}

String _trim(double v) {
  final s = v.toStringAsFixed(3);
  return s.contains('.') ? s.replaceAll(RegExp(r'0+$'), '').replaceAll(RegExp(r'\.$'), '') : s;
}
