// Success dialog for Record Production — shows the created WO number, the
// output batch (fetched from the output list since the create response
// doesn't carry it), and any server warnings.

library;

import 'package:flutter/material.dart';

import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/mfg_colors.dart';

class RecordProductionResultDialog extends StatelessWidget {
  final String woNumber;
  final String? outputBatchNo;
  final List<String> warnings;
  const RecordProductionResultDialog({
    super.key,
    required this.woNumber,
    required this.outputBatchNo,
    required this.warnings,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return AlertDialog(
      backgroundColor: t.surface,
      icon: Icon(Icons.check_circle_rounded, color: MfgColors.success, size: 32),
      title: Text('Production posted', style: RunqText.h3.copyWith(color: t.ink)),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Work order $woNumber', style: RunqText.bodyStrong.copyWith(color: t.ink)),
          if (outputBatchNo != null && outputBatchNo!.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text('Output batch $outputBatchNo',
                style: RunqText.caption.copyWith(color: t.muted)),
          ],
          if (warnings.isNotEmpty) ...[
            const SizedBox(height: 10),
            for (final w in warnings)
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.warning_amber_rounded, size: 14, color: MfgColors.orangeAlert),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(w, style: RunqText.caption.copyWith(color: t.muted)),
                    ),
                  ],
                ),
              ),
          ],
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: Text('Done',
              style: RunqText.bodyStrong.copyWith(color: MfgColors.brand(context))),
        ),
      ],
    );
  }
}
