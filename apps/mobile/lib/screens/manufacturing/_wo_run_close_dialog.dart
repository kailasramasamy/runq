// WO Close confirmation dialog.
// Shows variance summary; if API returned warnings, renders an amber banner
// + acknowledgement checkbox before allowing the user to proceed.

library;

import 'package:flutter/material.dart';

import '../../api/manufacturing_models.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/mfg_colors.dart';
import 'widgets/mfg_primitives.dart';

/// Result returned to caller:
///   - null → user cancelled
///   - true → proceed (varianceAcknowledged if needed)
Future<bool?> showWoCloseDialog(
  BuildContext context, {
  required WoCostingPreview preview,
  required String outputUom,
  List<String> warnings = const [],
}) {
  return showDialog<bool>(
    context: context,
    builder: (_) => _WoCloseDialog(
      preview: preview,
      outputUom: outputUom,
      warnings: warnings,
    ),
  );
}

class _WoCloseDialog extends StatefulWidget {
  final WoCostingPreview preview;
  final String outputUom;
  final List<String> warnings;

  const _WoCloseDialog({
    required this.preview,
    required this.outputUom,
    required this.warnings,
  });

  @override
  State<_WoCloseDialog> createState() => _WoCloseDialogState();
}

class _WoCloseDialogState extends State<_WoCloseDialog> {
  bool _acknowledged = false;

  bool get _canClose =>
      widget.warnings.isEmpty || _acknowledged;

  String _qty(double v) =>
      v == v.truncateToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(3);

  String _pct(double actual, double expected) {
    if (expected == 0) return '—';
    final pct = ((actual - expected) / expected * 100);
    final sign = pct >= 0 ? '+' : '';
    return '$sign${pct.toStringAsFixed(1)}%';
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final p = widget.preview;
    final hasNegative = p.varianceQty < 0;

    return AlertDialog(
      backgroundColor: t.surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      title: Text('Close Work Order', style: RunqText.h2.copyWith(color: t.ink)),
      content: SizedBox(
        width: double.maxFinite,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Variance summary card
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: t.bgWarm,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: t.hairline),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Yield Summary', style: RunqText.label.copyWith(color: t.muted)),
                  const SizedBox(height: 8),
                  _SummaryRow(
                    label: 'Planned output',
                    value: '${_qty(p.expectedOutputQty)} ${widget.outputUom}',
                    valueStyle: RunqText.body.copyWith(color: t.ink),
                  ),
                  const SizedBox(height: 4),
                  _SummaryRow(
                    label: 'Actual output',
                    value: '${_qty(p.actualOutputQty)} ${widget.outputUom}',
                    valueStyle: RunqText.body.copyWith(color: t.ink),
                  ),
                  const SizedBox(height: 4),
                  _SummaryRow(
                    label: 'Variance',
                    value: '${_qty(p.varianceQty)} ${widget.outputUom}'
                        ' (${_pct(p.actualOutputQty, p.expectedOutputQty)})',
                    valueStyle: RunqText.bodyStrong.copyWith(
                      color: hasNegative ? MfgColors.error : MfgColors.success,
                    ),
                  ),
                  const SizedBox(height: 4),
                  _SummaryRow(
                    label: 'Total consumed',
                    value: mfgIndianINR(p.consumedValue, decimals: 2),
                    valueStyle: RunqText.body.copyWith(color: t.ink),
                  ),
                ],
              ),
            ),
            // Warnings banner
            if (widget.warnings.isNotEmpty) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: MfgColors.orangeAlertBg,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: MfgColors.orangeAlert.withValues(alpha: 0.5),
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(Icons.warning_amber_rounded,
                            size: 16, color: MfgColors.orangeAlert),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text('Review before closing',
                              style: RunqText.bodyStrong
                                  .copyWith(color: MfgColors.orangeAlert)),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    for (final w in widget.warnings)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 4),
                        child: Text('• $w',
                            style: RunqText.caption.copyWith(color: t.ink)),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 10),
              InkWell(
                onTap: () => setState(() => _acknowledged = !_acknowledged),
                borderRadius: BorderRadius.circular(6),
                child: Row(
                  children: [
                    Checkbox(
                      value: _acknowledged,
                      onChanged: (v) => setState(() => _acknowledged = v ?? false),
                      activeColor: MfgColors.rose,
                      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                    Expanded(
                      child: Text(
                        "I've reviewed the variance and want to proceed",
                        style: RunqText.caption.copyWith(color: t.ink),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: Text('Cancel', style: RunqText.body.copyWith(color: t.muted)),
        ),
        FilledButton(
          onPressed: _canClose ? () => Navigator.pop(context, true) : null,
          style: FilledButton.styleFrom(
            backgroundColor: MfgColors.rose,
            disabledBackgroundColor: MfgColors.rose.withValues(alpha: 0.4),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          ),
          child: Text('Close WO', style: RunqText.bodyStrong.copyWith(color: Colors.white)),
        ),
      ],
    );
  }
}

class _SummaryRow extends StatelessWidget {
  final String label;
  final String value;
  final TextStyle valueStyle;

  const _SummaryRow({
    required this.label,
    required this.value,
    required this.valueStyle,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Row(
      children: [
        Expanded(child: Text(label, style: RunqText.caption.copyWith(color: t.muted))),
        Text(value, style: valueStyle),
      ],
    );
  }
}
