import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../api/api_client.dart';
import '../api/models.dart';
import '../api/repos.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../utils/format_inr.dart';
import 'runq_snack.dart';

/// Read-only detail of a captured payment: what it was for, where the money
/// went, and its bank-match state. Pending captures can jump to edit from here.
Future<void> showPaymentDetailSheet(BuildContext context, PendingPayment item) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: RT(context).surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
    ),
    builder: (_) => _PaymentDetailSheet(item: item),
  );
}

class _PaymentDetailSheet extends StatelessWidget {
  final PendingPayment item;
  const _PaymentDetailSheet({required this.item});

  Future<void> _viewAttachment(BuildContext context) async {
    try {
      final list = await bankingRepo.attachments(item.attachmentEntityType, item.attachmentEntityId);
      if (!context.mounted) return;
      if (list.isEmpty) {
        showRunqSnack(context, 'No attachment found.', kind: SnackKind.error);
        return;
      }
      context.push('/attachments/view', extra: list.first);
    } on ApiException catch (e) {
      if (context.mounted) showRunqSnack(context, e.message, kind: SnackKind.error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final memo = item.note?.trim() ?? '';
    final payee = item.payeeName?.trim() ?? '';
    final category = item.glAccountName ?? 'Uncategorised';
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 10),
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: t.hairline,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              // Headline mirrors the list row: who you paid, then what for,
              // then the amount — the category tag sits below as a label.
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 18),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(payee.isNotEmpty ? payee : (memo.isNotEmpty ? memo : category),
                        style: RunqText.h3.copyWith(color: t.ink)),
                    if (payee.isNotEmpty && memo.isNotEmpty) ...[
                      const SizedBox(height: 3),
                      Text(memo, style: RunqText.body.copyWith(color: t.muted)),
                    ],
                    const SizedBox(height: 6),
                    Text(formatINR(item.amount, paise: true),
                        style: RunqText.tabular(size: 28, w: FontWeight.w700, color: t.ink)),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        _CategoryTag(label: category, code: item.glAccountCode),
                        const SizedBox(width: 8),
                        _StatusPill(status: item.status),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 18),
              Divider(height: 1, thickness: 1, color: t.hairlineSoft),
              const SizedBox(height: 6),
              _Row(icon: Icons.event_outlined, label: 'Paid on', value: _longDate(item.paymentDate)),
              // Payee is already the headline — no need to repeat it here.
              _Row(
                icon: Icons.account_balance_outlined,
                label: 'From account',
                value: item.bankLabel.isEmpty ? '—' : item.bankLabel,
              ),
              if ((item.upiRef ?? '').trim().isNotEmpty)
                _Row(icon: Icons.tag, label: 'UPI reference', value: item.upiRef!.trim()),
              const SizedBox(height: 10),
              Padding(
                padding: const EdgeInsets.fromLTRB(18, 0, 18, 18),
                child: Row(
                  children: [
                    if (item.hasAttachment)
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () => _viewAttachment(context),
                          icon: const Icon(Icons.receipt_long_outlined, size: 18),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: t.ink,
                            side: BorderSide(color: t.hairline),
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                          label: const Text('View receipt'),
                        ),
                      ),
                    if (item.hasAttachment && item.isPending) const SizedBox(width: 10),
                    if (item.isPending)
                      Expanded(
                        child: FilledButton.icon(
                          onPressed: () {
                            Navigator.of(context).pop();
                            context.push('/payment-made', extra: item);
                          },
                          icon: const Icon(Icons.edit_outlined, size: 18),
                          style: FilledButton.styleFrom(
                            backgroundColor: RunqColors.indigo,
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                          label: const Text('Edit'),
                        ),
                      ),
                    if (!item.hasAttachment && !item.isPending)
                      Expanded(
                        child: Text(
                          'Locked — this payment is already matched to a bank transaction.',
                          style: RunqText.caption.copyWith(color: t.muted),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Expense category as a tinted tag — reads as a label on the memo, not as
/// another line of text competing with it.
class _CategoryTag extends StatelessWidget {
  final String label;
  final String? code;
  const _CategoryTag({required this.label, this.code});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: RunqColors.indigo.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.sell_outlined, size: 13, color: RunqColors.indigo),
          const SizedBox(width: 5),
          Text(code == null || code!.isEmpty ? label : '$label · $code',
              style: RunqText.label.copyWith(color: RunqColors.indigo)),
        ],
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  final String status;
  const _StatusPill({required this.status});

  @override
  Widget build(BuildContext context) {
    final (label, color, icon) = switch (status) {
      'matched' => ('Matched to bank', const Color(0xFF22C55E), Icons.check_circle_outline),
      'cancelled' => ('Cancelled', const Color(0xFF94A3B8), Icons.cancel_outlined),
      _ => ('Awaiting bank', const Color(0xFFF59E0B), Icons.schedule_outlined),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: color),
          const SizedBox(width: 5),
          Text(label, style: RunqText.label.copyWith(color: color)),
        ],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  final IconData icon;
  final String label, value;
  const _Row({required this.icon, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
      child: Row(
        children: [
          Icon(icon, size: 18, color: t.muted2),
          const SizedBox(width: 12),
          Text(label, style: RunqText.body.copyWith(color: t.muted)),
          const SizedBox(width: 12),
          Expanded(
            child: Text(value,
                textAlign: TextAlign.right,
                style: RunqText.bodyStrong.copyWith(color: t.ink),
                maxLines: 2, overflow: TextOverflow.ellipsis),
          ),
        ],
      ),
    );
  }
}

const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

String _longDate(String iso) {
  final d = DateTime.tryParse(iso);
  if (d == null) return iso;
  return '${d.day} ${_months[d.month - 1]} ${d.year}';
}
