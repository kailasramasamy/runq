// Correcting a closed run — "I recorded 120 litres, it was 102".
//
// A closed WO can't be edited in place: its output is on the shelf and its
// inputs are off it. So the correction is reverse-then-repost — the server
// unwinds the stock (and the close JE, when one was posted), and we drop the
// operator straight back into Record Production with the same BOM and figures
// so the only thing left to do is fix the number that was wrong.
//
// Split out of wo_detail_screen.dart to keep that file from growing further.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/api_client.dart';
import '../../api/manufacturing_models.dart';
import '../../providers/inventory_providers.dart';
import '../../providers/manufacturing_providers.dart';
import '../../widgets/runq_snack.dart';
import 'record_production_screen.dart';
import 'widgets/mfg_colors.dart';

/// Reverses [wo] and reopens Record Production prefilled from it. Returns
/// silently when the operator backs out of the confirmation.
Future<void> correctClosedRun(BuildContext context, WidgetRef ref, WorkOrder wo) =>
    _reverse(context, ref, wo, reopen: true);

/// Reverses [wo] and stops there — the run shouldn't have happened at all,
/// rather than having happened with the wrong numbers. Same unwind either way:
/// a closed run can't be cancelled in place, so cancelling *is* reversing.
Future<void> cancelClosedRun(BuildContext context, WidgetRef ref, WorkOrder wo) =>
    _reverse(context, ref, wo, reopen: false);

Future<void> _reverse(
  BuildContext context,
  WidgetRef ref,
  WorkOrder wo, {
  required bool reopen,
}) async {
  final reason = await _askReason(context, wo, reopen: reopen);
  // Null means dismissed — only an explicit tap on the confirm action reverses
  // anything. An empty string is a confirmed reversal with no reason given.
  if (reason == null || !context.mounted) return;

  try {
    await manufacturingRepo.reverseWo(
      wo.id,
      reason: reason.isEmpty ? null : reason,
    );
  } on ApiException catch (e) {
    if (context.mounted) {
      showRunqSnack(context, e.message, kind: SnackKind.error);
    }
    return;
  }

  ref.invalidate(workOrderDetailProvider(wo.id));
  ref.invalidate(workOrderListProvider);
  ref.invalidate(mfgDashboardProvider);
  invalidateStockViews(ref);

  if (!context.mounted) return;
  showRunqSnack(
    context,
    reopen
        ? '${wo.woNumber} reversed — re-enter the corrected run'
        : '${wo.woNumber} cancelled — stock movements reversed',
    kind: SnackKind.success,
  );
  // Cancelling leaves you on the detail page, which now reads Cancelled.
  if (!reopen) return;
  // Replaces the detail page: the reversed run is not somewhere to go back to.
  context.pushReplacement(
    '/manufacturing/production/new',
    extra: RecordProductionPrefill(
      bomId: wo.bomId,
      bomCode: wo.bomCode,
      bomName: wo.bomName,
      producedQty: wo.outputQty,
      warehouseId: wo.warehouseId,
      shift: wo.shift,
    ),
  );
}

Future<String?> _askReason(
  BuildContext context,
  WorkOrder wo, {
  required bool reopen,
}) {
  final ctrl = TextEditingController();
  return showDialog<String>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(reopen ? 'Correct this run?' : 'Cancel this run?'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '${wo.woNumber} will be reversed: the inputs go back into stock and '
            '${_qty(wo.outputQty)} ${wo.outputUom} of ${wo.outputItemName} comes '
            'off it.'
            '${reopen ? ' You can then re-enter the run with the right figures.' : ''}',
          ),
          const SizedBox(height: 12),
          TextField(
            controller: ctrl,
            textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(
              labelText: 'Reason (optional)',
              hintText: reopen ? 'Wrong quantity entered' : 'Run never happened',
            ),
          ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Back')),
        TextButton(
          onPressed: () => Navigator.pop(ctx, ctrl.text.trim()),
          child: Text(reopen ? 'Reverse & re-enter' : 'Cancel run',
              style: TextStyle(color: MfgColors.error)),
        ),
      ],
    ),
  );
}

String _qty(double v) =>
    v == v.truncateToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(3);
