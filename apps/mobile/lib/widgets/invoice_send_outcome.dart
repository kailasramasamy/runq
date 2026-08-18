import 'package:flutter/material.dart';
import '../api/models.dart';
import 'runq_snack.dart';

/// Reports where an issued invoice actually went.
///
/// Delivery first: an invoice the customer never received is the failure the
/// operator most needs to hear about, so a failed email is louder than the
/// successful issue behind it. A null outcome means the server was not asked
/// for an email — the invoice was still issued.
void reportInvoiceSendOutcome(
  BuildContext context,
  InvoiceEmailOutcome? outcome, {
  required String invoiceNumber,
  required String customerName,
}) {
  if (outcome == null) {
    showRunqSnack(context, 'Sent $invoiceNumber to $customerName',
        kind: SnackKind.success);
    return;
  }
  if (!outcome.sent) {
    showRunqSnack(
      context,
      '$invoiceNumber issued, but the email did not go out — '
      '${outcome.reason ?? 'unknown error'}',
      kind: SnackKind.error,
    );
    return;
  }
  final who = outcome.to.isEmpty ? customerName : outcome.to.join(', ');
  final what = outcome.attached ? 'with the PDF' : 'without the PDF';
  showRunqSnack(
    context,
    outcome.reason == null
        ? '$invoiceNumber emailed to $who $what'
        : '$invoiceNumber emailed to $who — ${outcome.reason}',
    kind: outcome.reason == null ? SnackKind.success : SnackKind.info,
  );
}
