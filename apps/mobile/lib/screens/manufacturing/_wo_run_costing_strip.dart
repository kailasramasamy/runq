// Sticky bottom costing strip for the WO Run screen.
// Shows consumed ₹ / output qty (actual/expected) / variance with animated
// value transitions. Polls woPreviewProvider on each rebuild.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../providers/manufacturing_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/mfg_colors.dart';
import 'widgets/mfg_primitives.dart';

class WoRunCostingStrip extends ConsumerWidget {
  final String woId;
  final String outputUom;

  const WoRunCostingStrip({
    super.key,
    required this.woId,
    required this.outputUom,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final previewAsync = ref.watch(woPreviewProvider(woId));
    final t = RT(context);

    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        border: Border(top: BorderSide(color: t.hairline)),
      ),
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
      child: previewAsync.when(
        loading: () => _StripPlaceholder(),
        error: (_, __) => _StripPlaceholder(),
        data: (preview) {
          final hasVariance = preview.varianceQty != 0;
          final isNegative = preview.varianceQty < 0;

          return Row(
            children: [
              Expanded(child: _StripCell(
                label: 'Consumed',
                value: mfgIndianINR(preview.consumedValue, decimals: 2),
                valueColor: t.ink,
              )),
              _Divider(),
              Expanded(child: _StripCell(
                label: 'Output',
                value: '${_qty(preview.actualOutputQty)} / ${_qty(preview.expectedOutputQty)} $outputUom',
                valueColor: t.ink,
              )),
              _Divider(),
              Expanded(child: _StripCell(
                label: 'Variance',
                value: hasVariance
                    ? '${isNegative ? '' : '+'}${_qty(preview.varianceQty)} $outputUom'
                    : '—',
                valueColor: hasVariance
                    ? (isNegative ? MfgColors.error : MfgColors.success)
                    : t.muted,
              )),
            ],
          );
        },
      ),
    );
  }

  static String _qty(double v) =>
      v == v.truncateToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(3);
}

class _StripCell extends StatelessWidget {
  final String label;
  final String value;
  final Color valueColor;

  const _StripCell({
    required this.label,
    required this.value,
    required this.valueColor,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Text(label, style: RunqText.caption.copyWith(color: t.muted)),
        const SizedBox(height: 2),
        AnimatedDefaultTextStyle(
          duration: const Duration(milliseconds: 200),
          style: RunqText.bodyStrong.copyWith(color: valueColor),
          child: Text(value, textAlign: TextAlign.center, maxLines: 2),
        ),
      ],
    );
  }
}

class _Divider extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(width: 1, height: 32, color: t.hairline, margin: const EdgeInsets.symmetric(horizontal: 8));
  }
}

class _StripPlaceholder extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Row(
      children: [
        for (var i = 0; i < 3; i++) ...[
          if (i > 0) Container(width: 1, height: 32, color: t.hairline, margin: const EdgeInsets.symmetric(horizontal: 8)),
          Expanded(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(height: 10, width: 48, decoration: BoxDecoration(color: t.hairline, borderRadius: BorderRadius.circular(4))),
                const SizedBox(height: 4),
                Container(height: 14, width: 60, decoration: BoxDecoration(color: t.hairline, borderRadius: BorderRadius.circular(4))),
              ],
            ),
          ),
        ],
      ],
    );
  }
}
