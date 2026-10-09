import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../api/api_client.dart';
import '../api/models.dart';
import '../api/repos.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../utils/format_inr.dart';
import 'runq_snack.dart';

/// A bill paid with money already logged via "Payment made" must be linked
/// to that capture, not marked paid a second time — otherwise the expense is
/// booked twice (once from the capture, once from the bill).

/// Logged payments that could be the money for a bill. Advisory: a failed
/// lookup just means no suggestion.
Future<List<PendingPayment>> findLoggedPayments({
  required double amount,
  required DateTime date,
  String? vendorName,
}) async {
  if (amount <= 0) return const [];
  try {
    return await bankingRepo.captureCandidates(amount: amount, date: date, vendorName: vendorName);
  } on ApiException {
    return const [];
  }
}

/// Links [payment] to the bill. Returns true on success; errors are snacked.
Future<bool> settleWithLoggedPayment(BuildContext context, String billId, PendingPayment payment) async {
  try {
    await billsRepo.settleWithCapture(billId, payment.id);
    if (context.mounted) {
      showRunqSnack(context, 'Bill settled with your ${formatINR(payment.amount, compact: true)} payment',
          kind: SnackKind.success);
    }
    return true;
  } on ApiException catch (e) {
    if (context.mounted) showRunqSnack(context, e.message, kind: SnackKind.error);
    return false;
  }
}

/// The user's pick when marking a bill paid with logged payments around.
/// [payment] null means "paid another way" (own money).
class LoggedPaymentChoice {
  final PendingPayment? payment;
  const LoggedPaymentChoice(this.payment);
}

/// Asks which logged payment paid the bill. Null when dismissed.
Future<LoggedPaymentChoice?> showLoggedPaymentSheet(BuildContext context, List<PendingPayment> options) {
  return showModalBottomSheet<LoggedPaymentChoice>(
    context: context,
    useSafeArea: true,
    isScrollControlled: true,
    backgroundColor: RT(context).surface,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(18))),
    builder: (ctx) => SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Already logged this payment?', style: RunqText.h3.copyWith(color: RT(ctx).ink)),
            const SizedBox(height: 4),
            Text('Pick it so the money isn\'t counted twice.',
                style: RunqText.caption.copyWith(color: RT(ctx).muted)),
            const SizedBox(height: 12),
            for (final p in options)
              LoggedPaymentTile(payment: p, onTap: () => Navigator.pop(ctx, LoggedPaymentChoice(p))),
            const SizedBox(height: 4),
            Center(
              child: TextButton(
                onPressed: () => Navigator.pop(ctx, const LoggedPaymentChoice(null)),
                child: const Text('No — I paid it another way'),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

/// One logged payment: who, when, from which account, how much.
class LoggedPaymentTile extends StatelessWidget {
  final PendingPayment payment;
  final VoidCallback? onTap;
  const LoggedPaymentTile({super.key, required this.payment, this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Material(
        color: t.bgWarm,
        borderRadius: BorderRadius.circular(12),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(children: [
              Icon(Icons.qr_code_scanner_outlined, size: 20, color: t.brand),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(_payee(payment), style: RunqText.bodyStrong.copyWith(color: t.ink),
                      maxLines: 1, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 2),
                  Text(_subtitle(payment), style: RunqText.caption.copyWith(color: t.muted),
                      maxLines: 1, overflow: TextOverflow.ellipsis),
                ]),
              ),
              const SizedBox(width: 8),
              Text(formatINR(payment.amount, paise: true), style: RunqText.bodyStrong.copyWith(color: t.ink)),
            ]),
          ),
        ),
      ),
    );
  }
}

/// Inline heads-up that a logged payment looks like this bill's money.
class LoggedPaymentBanner extends StatelessWidget {
  final PendingPayment payment;
  final String message;
  const LoggedPaymentBanner({super.key, required this.payment, required this.message});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: t.brandSubtle,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: t.brand.withValues(alpha: 0.25), width: 0.5),
      ),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(Icons.info_outline_rounded, size: 16, color: t.brand),
        const SizedBox(width: 8),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('You already logged this payment', style: RunqText.bodyStrong.copyWith(color: t.ink)),
            const SizedBox(height: 4),
            Text('${formatINR(payment.amount, paise: true)} to ${_payee(payment)} · ${_date(payment.paymentDate)}',
                style: RunqText.caption.copyWith(color: t.ink2)),
            const SizedBox(height: 4),
            Text(message, style: RunqText.caption.copyWith(color: t.muted)),
          ]),
        ),
      ]),
    );
  }
}

String _payee(PendingPayment p) {
  final name = p.payeeName?.trim() ?? '';
  return name.isNotEmpty ? name : 'Payment';
}

String _subtitle(PendingPayment p) =>
    [_date(p.paymentDate), p.bankLabel, if ((p.upiRef ?? '').isNotEmpty) 'Ref ${p.upiRef}']
        .where((s) => s.isNotEmpty)
        .join(' · ');

String _date(String iso) {
  final d = DateTime.tryParse(iso);
  return d == null ? iso : DateFormat('d MMM yyyy').format(d);
}
