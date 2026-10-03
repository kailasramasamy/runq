import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/api_client.dart';
import '../../api/recurring_bill_models.dart';
import '../../api/recurring_bills_repo.dart';
import '../../providers/recurring_bill_providers.dart';
import '../../utils/format_inr.dart';
import '../../widgets/runq_snack.dart';
import 'recurring_widgets.dart';

Future<bool> _confirm(BuildContext context, String title, String body, String action) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: Text(body),
      actions: [
        TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Keep')),
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(true),
          style: TextButton.styleFrom(foregroundColor: RecurringInk.of(ctx).red),
          child: Text(action),
        ),
      ],
    ),
  );
  return ok ?? false;
}

/// Delete an agreement set up by mistake. The server refuses once a payment
/// exists, and that message is shown as-is (pause it instead).
Future<void> deleteAgreement(BuildContext context, WidgetRef ref, RecurringBillDetail d) async {
  final bills = d.months.length;
  final ok = await _confirm(
    context,
    'Delete agreement?',
    bills == 0
        ? '"${d.agreement.title}" will be removed.'
        : '"${d.agreement.title}" and its $bills unpaid bill${bills == 1 ? '' : 's'} will be removed. '
            'Agreements with payments can\'t be deleted — pause them instead.',
    'Delete',
  );
  if (!ok || !context.mounted) return;
  try {
    await recurringBillsRepo.delete(d.agreement.id);
    ref.invalidate(recurringBillsProvider);
    if (!context.mounted) return;
    showRunqSnack(context, 'Agreement deleted', kind: SnackKind.success);
    context.pop();
  } on ApiException catch (e) {
    if (context.mounted) showRunqSnack(context, e.message, kind: SnackKind.error);
  }
}

/// Cancel a recorded payment: it is reversed and its periods go back to due.
Future<void> cancelPayment(
    BuildContext context, WidgetRef ref, String agreementId, RecurringPaymentRow p) async {
  final periods = p.paidFor.map((f) => f.label).join(', ');
  final ok = await _confirm(
    context,
    'Cancel payment?',
    '${formatINR(p.amount)}${p.reference == null ? '' : ' (${p.reference})'} will be reversed'
        '${periods.isEmpty ? '.' : ' — $periods go back to due.'}',
    'Cancel payment',
  );
  if (!ok || !context.mounted) return;
  try {
    await recurringBillsRepo.cancelPayment(agreementId, p.id);
    ref.invalidate(recurringBillDetailProvider(agreementId));
    ref.invalidate(recurringBillsProvider);
    if (context.mounted) showRunqSnack(context, 'Payment cancelled', kind: SnackKind.success);
  } on ApiException catch (e) {
    if (context.mounted) showRunqSnack(context, e.message, kind: SnackKind.error);
  }
}
