import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_slidable/flutter_slidable.dart';
import 'package:go_router/go_router.dart';
import '../api/api_client.dart';
import '../api/models.dart';
import '../api/repos.dart';
import '../api/dunning_repo.dart';
import '../providers/data_providers.dart';
import '../providers/dunning_providers.dart';
import '../theme/runq_tokens.dart';
import '../theme/runq_theme.dart';
import '../utils/format_inr.dart';
import '../widgets/avatar.dart';
import '../widgets/invoice_send_outcome.dart';
import '../widgets/reminder_channel_sheet.dart';
import '../widgets/runq_card.dart';
import '../widgets/runq_snack.dart';
import '../widgets/payment_qr_sheet.dart';
import '../widgets/status_pill.dart';
import '../widgets/swipe_action.dart';
import 'inventory/widgets/shortfall_flow.dart';

class InvoiceRow extends ConsumerWidget {
  final Invoice invoice;
  /// Optional callback invoked after a successful swipe action so the host
  /// screen can do a full refresh (the same one its pull-to-refresh uses).
  /// Pure family invalidation has shown to occasionally not propagate to
  /// currently-mounted watchers, so we let the screen drive the refetch.
  final Future<void> Function()? onAfterAction;
  /// Compact = no card chrome (no border, no shadow, transparent bg) so the
  /// dashboard's Recent invoices section can stack many rows inside one
  /// shared RunqCard with dividers, matching the Activity layout.
  final bool compact;
  const InvoiceRow({super.key, required this.invoice, this.onAfterAction, this.compact = false});

  String _date(DateTime d) {
    const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${d.day} ${m[d.month - 1]}';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final isPartial = invoice.status == 'partially_paid';
    // Money still owed on this invoice. Drafts/paid rows have nothing
    // outstanding, so they keep showing the invoice value + its date.
    final hasBalance = invoice.balanceDue > 0 && invoice.status != 'draft';
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final due = DateTime(invoice.dueDate.year, invoice.dueDate.month, invoice.dueDate.day);
    // Derive lateness from the date, not the status flag, so triage is honest
    // even before the backend's overnight job flips 'sent' -> 'overdue'.
    final isLate = hasBalance && due.isBefore(today);
    final daysLate = isLate ? today.difference(due).inDays : 0;
    // Headline = what's still owed (balance), not the gross total.
    final headline = hasBalance ? invoice.balanceDue : invoice.totalAmount;
    final actions = _buildActions(context, ref);
    final body = Column(
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            RqAvatar(
              name: invoice.customerName,
              size: compact ? 36 : 44,
              square: true,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(invoice.customerName, style: RunqText.bodyStrong, maxLines: 1, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 2),
                  Text.rich(
                    TextSpan(
                      style: RunqText.caption.copyWith(color: t.muted),
                      children: [
                        TextSpan(text: invoice.invoiceNumber),
                        const TextSpan(text: '  ·  '),
                        // Issue date always shown; due date follows when the
                        // invoice still carries a balance.
                        TextSpan(text: _date(invoice.invoiceDate)),
                        if (hasBalance)
                          TextSpan(
                            text: '  ·  Due ${_date(invoice.dueDate)}',
                            style: isLate ? TextStyle(color: RunqColors.redInk) : null,
                          ),
                        if (isLate)
                          TextSpan(
                            text: '  ·  ${daysLate < 1 ? 'due today' : '${daysLate}d late'}',
                            style: TextStyle(color: RunqColors.redInk, fontWeight: FontWeight.w700),
                          ),
                      ],
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (!isPartial) ...[
                    const SizedBox(height: 6),
                    StatusPill(invoice.status, warning: invoice.status == 'overdue'),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 8),
            Text(formatINR(headline), style: RunqText.tabular(size: 15, w: FontWeight.w700)),
          ],
        ),
        if (isPartial) ...[
          const SizedBox(height: 10),
          _PartialPayBar(paid: invoice.amountReceived, total: invoice.totalAmount),
        ],
      ],
    );
    final tap = invoice.id.isEmpty ? null : () => context.push('/invoices/${invoice.id}');
    final tile = compact
        ? Material(
            color: RT(context).surface,
            child: InkWell(
              onTap: tap,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
                child: body,
              ),
            ),
          )
        : RunqCard(
            onTap: tap,
            padding: const EdgeInsets.all(14),
            child: body,
          );
    if (actions.isEmpty) return tile;
    return Slidable(
      groupTag: 'invoices',
      key: ValueKey('invoice-${invoice.id}'),
      endActionPane: ActionPane(
        motion: const BehindMotion(),
        extentRatio: actions.length == 1 ? 0.28 : 0.52,
        children: actions,
      ),
      child: tile,
    );
  }

  List<Widget> _buildActions(BuildContext context, WidgetRef ref) {
    switch (invoice.status) {
      case 'draft':
        return [
          SwipeAction(
            icon: Icons.send_rounded,
            label: 'Send',
            color: const Color(0xFF4338CA),
            onTap: () => _send(context, ref),
          ),
          SwipeAction(
            icon: Icons.delete_outline_rounded,
            label: 'Delete',
            color: RunqColors.redInk,
            onTap: () => _delete(context, ref),
          ),
        ];
      case 'sent':
      case 'overdue':
      case 'partially_paid':
        return [
          SwipeAction(
            icon: Icons.notifications_active_rounded,
            label: 'Remind',
            color: const Color(0xFFB45309),
            onTap: () => _remind(context, ref),
          ),
          SwipeAction(
            icon: Icons.qr_code_2_rounded,
            label: 'Collect',
            color: const Color(0xFF047857),
            onTap: () => _showQr(context),
          ),
        ];
      default:
        return const [];
    }
  }

  Future<void> _refreshAll(WidgetRef ref) async {
    ref.invalidate(invoicesProvider);
    ref.invalidate(invoiceSummaryProvider);
    ref.invalidate(invoiceDetailProvider(invoice.id));
    if (onAfterAction != null) await onAfterAction!();
  }

  Future<void> _send(BuildContext context, WidgetRef ref) async {
    try {
      final sent = await invoicesRepo.send(invoice.id);
      await _refreshAll(ref);
      if (!context.mounted) return;
      // Shortage first — see the note in invoice_detail_screen._send.
      final dispatch = sent.dispatch;
      if (dispatch != null) {
        await runShortfallFlow(context, ref, dispatch, invoiceId: invoice.id);
      }
      if (!context.mounted) return;
      reportInvoiceSendOutcome(
        context,
        sent.email,
        invoiceNumber: invoice.invoiceNumber,
        customerName: invoice.customerName,
      );
    } catch (e) {
      if (!context.mounted) return;
      showRunqSnack(context, "Couldn't send: $e", kind: SnackKind.error);
    }
  }

  Future<void> _delete(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete invoice?'),
        content: Text('Permanently remove draft ${invoice.invoiceNumber}?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            style: FilledButton.styleFrom(
              backgroundColor: RunqColors.redInk,
              foregroundColor: Colors.white,
            ),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    if (!context.mounted) return;
    try {
      await apiClient.delete('/ar/invoices/${invoice.id}/hard');
      await _refreshAll(ref);
      if (!context.mounted) return;
      showRunqSnack(context, 'Invoice deleted', kind: SnackKind.success);
    } catch (e) {
      if (!context.mounted) return;
      showRunqSnack(context, "Couldn't delete: $e", kind: SnackKind.error);
    }
  }

  Future<void> _remind(BuildContext context, WidgetRef ref) async {
    final choice = await showReminderChannelSheet(
      context,
      customerEmail: invoice.customerEmail,
      customerPhone: invoice.customerPhone,
    );
    if (choice == null || !context.mounted) return;
    try {
      // Pick the dunning rule whose escalation level matches this invoice's
      // overdue severity — same logic the auto-run uses.
      final rules = await ref.read(dunningRulesProvider.future);
      final daysOverdue = invoice.dueDate.isBefore(DateTime.now())
          ? DateTime.now().difference(invoice.dueDate).inDays
          : 0;
      final level = daysOverdue >= 45 ? 4 : daysOverdue >= 30 ? 3 : daysOverdue >= 15 ? 2 : 1;
      final rule = rules.firstWhere(
        (r) => r.escalationLevel == level && r.isActive,
        orElse: () => rules.firstWhere((r) => r.isActive, orElse: () => rules.first),
      );

      if (choice.hasEmail) {
        await dunningRepo.sendReminders(
          invoiceIds: [invoice.id],
          ruleId: rule.id,
          channel: 'email',
        );
      }
      if (choice.hasWhatsapp) {
        await dunningRepo.sendReminders(
          invoiceIds: [invoice.id],
          ruleId: rule.id,
          channel: 'whatsapp',
        );
      }
      await _refreshAll(ref);
      if (!context.mounted) return;
      reportReminderOutcome(context, choice);
    } catch (e) {
      if (!context.mounted) return;
      showRunqSnack(context, "Couldn't send reminder: $e", kind: SnackKind.error);
    }
  }

  /// Show the invoice's UPI QR so the customer pays into the business account.
  /// Recording is left to bank reconciliation, so this never mutates state.
  /// (Cash / personal-account receipts use "Record offline payment" on the
  /// invoice detail's overflow menu.)
  Future<void> _showQr(BuildContext context) {
    return showPaymentQrSheet(
      context,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerName: invoice.customerName,
      balanceDue: invoice.balanceDue,
    );
  }
}

class _PartialPayBar extends StatelessWidget {
  final double paid, total;
  const _PartialPayBar({required this.paid, required this.total});

  @override
  Widget build(BuildContext context) {
    final pct = total <= 0 ? 0.0 : (paid / total).clamp(0.0, 1.0);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(2),
          child: Container(
            height: 4,
            color: const Color(0xFFE5E7EB),
            child: Align(
              alignment: Alignment.centerLeft,
              child: FractionallySizedBox(
                widthFactor: pct,
                child: Container(color: RT(context).brand),
              ),
            ),
          ),
        ),
        const SizedBox(height: 6),
        Text('${formatINR(paid)} of ${formatINR(total)} paid',
            style: RunqText.caption),
      ],
    );
  }
}
