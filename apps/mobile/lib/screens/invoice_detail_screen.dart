import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../api/api_client.dart';
import '../api/models.dart';
import '../api/repos.dart';
import '../providers/data_providers.dart';
import '../theme/runq_tokens.dart';
import '../theme/runq_theme.dart';
import '../utils/format_inr.dart';
import '../widgets/async_slot.dart';
import '../widgets/avatar.dart';
import '../widgets/runq_card.dart';
import '../widgets/runq_snack.dart';
import '../widgets/status_pill.dart';

class InvoiceDetailScreen extends ConsumerWidget {
  final String id;
  const InvoiceDetailScreen({super.key, required this.id});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detail = ref.watch(invoiceDetailProvider(id));
    final receipts = ref.watch(invoiceReceiptsProvider(id));
    return Scaffold(
      body: SafeArea(
        child: AsyncSlot<InvoiceWithDetails>(
          value: detail,
          onRetry: () => ref.invalidate(invoiceDetailProvider(id)),
          data: (inv) => Column(
            children: [
              _DetailHeader(invoiceNumber: inv.invoiceNumber),
              Expanded(
                child: ListView(
                  physics: const BouncingScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                  children: [
                    _HeroCard(invoice: inv),
                    const SizedBox(height: 14),
                    if (inv.items.isNotEmpty) ...[
                      _LineItemsCard(items: inv.items),
                      const SizedBox(height: 14),
                    ],
                    _GstBreakdownCard(invoice: inv),
                    receipts.maybeWhen(
                      data: (list) => list.isEmpty
                          ? const SizedBox.shrink()
                          : Padding(
                              padding: const EdgeInsets.only(top: 14),
                              child: _PaymentHistoryCard(receipts: list),
                            ),
                      orElse: () => const SizedBox.shrink(),
                    ),
                  ],
                ),
              ),
              _StickyFooter(invoice: inv, onChange: () {
                ref.invalidate(invoiceDetailProvider(id));
                ref.invalidate(invoiceReceiptsProvider(id));
                ref.invalidate(invoiceSummaryProvider);
                ref.invalidate(dashboardSummaryProvider);
              }),
            ],
          ),
        ),
      ),
    );
  }
}

class _DetailHeader extends StatelessWidget {
  final String invoiceNumber;
  const _DetailHeader({required this.invoiceNumber});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 8, 12),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
            onPressed: () => context.pop(),
            color: t.ink,
          ),
          Expanded(child: Center(child: Text(invoiceNumber, style: RunqText.bodyStrong.copyWith(color: t.ink)))),
          IconButton(
            icon: const Icon(Icons.ios_share_rounded, size: 20),
            onPressed: () {},
            color: t.ink,
          ),
        ],
      ),
    );
  }
}

class _HeroCard extends StatelessWidget {
  final InvoiceWithDetails invoice;
  const _HeroCard({required this.invoice});

  @override
  Widget build(BuildContext context) {
    return RunqCard(
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              RqAvatar(name: invoice.customerName, size: 48),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(invoice.customerName, style: RunqText.h3.copyWith(fontSize: 16)),
                    const SizedBox(height: 4),
                    Text('Due ${_dueDate(invoice.dueDate)}',
                        style: RunqText.caption.copyWith(fontSize: 12)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          Text('TOTAL', style: RunqText.label),
          const SizedBox(height: 6),
          Text(formatINR(invoice.totalAmount), style: RunqText.h1),
          if (invoice.balanceDue > 0 && invoice.balanceDue != invoice.totalAmount) ...[
            const SizedBox(height: 4),
            Text('Balance ${formatINR(invoice.balanceDue)}', style: RunqText.caption),
          ],
          const SizedBox(height: 10),
          StatusPill(invoice.status, warning: invoice.status == 'overdue'),
        ],
      ),
    );
  }

  String _dueDate(DateTime d) {
    const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${d.day} ${m[d.month - 1]} ${d.year}';
  }
}

class _LineItemsCard extends StatelessWidget {
  final List<InvoiceItem> items;
  const _LineItemsCard({required this.items});

  @override
  Widget build(BuildContext context) {
    return RunqCard(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('LINE ITEMS', style: RunqText.label),
          const SizedBox(height: 8),
          for (var i = 0; i < items.length; i++) ...[
            _ItemRow(item: items[i]),
            if (i < items.length - 1)
              Divider(height: 14, thickness: 0.5, color: RT(context).hairlineSoft),
          ],
        ],
      ),
    );
  }
}

class _ItemRow extends StatelessWidget {
  final InvoiceItem item;
  const _ItemRow({required this.item});

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          flex: 5,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(item.itemName.isEmpty ? item.description : item.itemName, style: RunqText.body),
              const SizedBox(height: 2),
              Text('${item.quantity.toStringAsFixed(item.quantity == item.quantity.toInt() ? 0 : 2)} × ${formatINR(item.unitPrice)}',
                  style: RunqText.caption.copyWith(fontSize: 11)),
            ],
          ),
        ),
        Text(formatINR(item.amount), style: RunqText.tabular(size: 14, w: FontWeight.w600)),
      ],
    );
  }
}

class _GstBreakdownCard extends StatelessWidget {
  final InvoiceWithDetails invoice;
  const _GstBreakdownCard({required this.invoice});

  @override
  Widget build(BuildContext context) {
    return RunqCard(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('GST BREAKDOWN', style: RunqText.label),
          const SizedBox(height: 8),
          _LineRow(label: 'Subtotal', value: formatINR(invoice.subtotal)),
          if (invoice.igst > 0) _LineRow(label: 'IGST', value: formatINR(invoice.igst)),
          if (invoice.cgst > 0) _LineRow(label: 'CGST', value: formatINR(invoice.cgst)),
          if (invoice.sgst > 0) _LineRow(label: 'SGST', value: formatINR(invoice.sgst)),
          if (invoice.cess > 0) _LineRow(label: 'Cess', value: formatINR(invoice.cess)),
          Divider(height: 14, thickness: 0.5, color: RT(context).hairlineSoft),
          _LineRow(label: 'Total', value: formatINR(invoice.totalAmount), strong: true),
        ],
      ),
    );
  }
}

class _LineRow extends StatelessWidget {
  final String label, value;
  final bool strong;
  const _LineRow({required this.label, required this.value, this.strong = false});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final style = strong
        ? RunqText.bodyStrong.copyWith(fontSize: 14, color: t.ink)
        : RunqText.caption.copyWith(fontSize: 12, color: t.muted);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(child: Text(label, style: style)),
          Text(value, style: RunqText.tabular(size: strong ? 14 : 12, w: strong ? FontWeight.w700 : FontWeight.w500)),
        ],
      ),
    );
  }
}

class _PaymentHistoryCard extends StatelessWidget {
  final List<InvoiceReceipt> receipts;
  const _PaymentHistoryCard({required this.receipts});

  @override
  Widget build(BuildContext context) {
    return RunqCard(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('PAYMENT HISTORY', style: RunqText.label),
          const SizedBox(height: 10),
          for (var i = 0; i < receipts.length; i++) ...[
            _ReceiptRow(r: receipts[i]),
            if (i < receipts.length - 1)
              Divider(height: 14, thickness: 0.5, color: RT(context).hairlineSoft),
          ],
        ],
      ),
    );
  }
}

class _ReceiptRow extends StatelessWidget {
  final InvoiceReceipt r;
  const _ReceiptRow({required this.r});

  String _date(DateTime d) {
    const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${d.day} ${m[d.month - 1]}';
  }

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(_date(r.receiptDate), style: RunqText.caption),
              Text(r.paymentMethod.toUpperCase(),
                  style: RunqText.caption.copyWith(fontSize: 11, color: RT(context).muted2, letterSpacing: 0.04 * 11)),
            ],
          ),
        ),
        Text(formatINR(r.amount),
            style: RunqText.tabular(size: 14, w: FontWeight.w600, color: RunqColors.greenInk)),
      ],
    );
  }
}

class _StickyFooter extends ConsumerStatefulWidget {
  final InvoiceWithDetails invoice;
  final VoidCallback onChange;
  const _StickyFooter({required this.invoice, required this.onChange});

  @override
  ConsumerState<_StickyFooter> createState() => _StickyFooterState();
}

class _StickyFooterState extends ConsumerState<_StickyFooter> {
  bool _sending = false, _marking = false;

  Future<void> _sendReminder() async {
    setState(() => _sending = true);
    try {
      await invoicesRepo.send(widget.invoice.id, channel: 'whatsapp');
      if (!mounted) return;
      showRunqSnack(context, 'Reminder sent', kind: SnackKind.success);
      widget.onChange();
    } on ApiException catch (e) {
      if (!mounted) return;
      showRunqSnack(context, e.message, kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _recordPayment() async {
    final result = await showModalBottomSheet<_PaymentInput>(
      context: context,
      isScrollControlled: true,
      backgroundColor: RT(context).surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(18))),
      builder: (_) => _RecordPaymentSheet(maxAmount: widget.invoice.balanceDue),
    );
    if (result == null || !mounted) return;
    setState(() => _marking = true);
    try {
      await invoicesRepo.markPaid(
        widget.invoice.id,
        amount: result.amount,
        paymentMethod: result.method,
        referenceNumber: result.reference,
      );
      if (!mounted) return;
      showRunqSnack(context, 'Payment recorded', kind: SnackKind.success);
      widget.onChange();
    } on ApiException catch (e) {
      if (!mounted) return;
      showRunqSnack(context, e.message, kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _marking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final canMark = widget.invoice.balanceDue > 0;
    final t = RT(context);
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        border: Border(top: BorderSide(color: t.hairline, width: 0.5)),
      ),
      padding: EdgeInsets.fromLTRB(16, 12, 16, 12 + MediaQuery.of(context).padding.bottom),
      child: Row(
        children: [
          Expanded(
            child: SizedBox(
              height: 48,
              child: FilledButton.icon(
                onPressed: _sending ? null : _sendReminder,
                style: FilledButton.styleFrom(backgroundColor: RunqColors.whatsapp),
                icon: _sending
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.chat_bubble_rounded, size: 18),
                label: const Text('Send reminder'),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: SizedBox(
              height: 48,
              child: FilledButton(
                onPressed: !canMark || _marking ? null : _recordPayment,
                child: _marking
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Text('Record payment'),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PaymentInput {
  final double amount;
  final String method;
  final String? reference;
  _PaymentInput({required this.amount, required this.method, this.reference});
}

class _RecordPaymentSheet extends StatefulWidget {
  final double maxAmount;
  const _RecordPaymentSheet({required this.maxAmount});

  @override
  State<_RecordPaymentSheet> createState() => _RecordPaymentSheetState();
}

class _RecordPaymentSheetState extends State<_RecordPaymentSheet> {
  late final _amountCtrl = TextEditingController(text: widget.maxAmount.toStringAsFixed(2));
  final _refCtrl = TextEditingController();
  String _method = 'upi';

  @override
  void dispose() {
    _amountCtrl.dispose();
    _refCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 16, 20, 16 + MediaQuery.of(context).viewInsets.bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Record payment', style: RunqText.h3),
          const SizedBox(height: 12),
          TextField(
            controller: _amountCtrl,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(labelText: 'Amount', prefixText: '₹ '),
          ),
          const SizedBox(height: 10),
          DropdownButtonFormField<String>(
            initialValue: _method,
            items: const [
              DropdownMenuItem(value: 'upi', child: Text('UPI')),
              DropdownMenuItem(value: 'neft', child: Text('NEFT / RTGS')),
              DropdownMenuItem(value: 'imps', child: Text('IMPS')),
              DropdownMenuItem(value: 'cash', child: Text('Cash')),
              DropdownMenuItem(value: 'cheque', child: Text('Cheque')),
              DropdownMenuItem(value: 'card', child: Text('Card')),
            ],
            decoration: const InputDecoration(labelText: 'Method'),
            onChanged: (v) => setState(() => _method = v ?? 'upi'),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _refCtrl,
            decoration: const InputDecoration(labelText: 'Reference (UTR / cheque #)'),
          ),
          const SizedBox(height: 18),
          SizedBox(
            height: 48,
            child: FilledButton(
              onPressed: () {
                final amt = double.tryParse(_amountCtrl.text.trim()) ?? 0;
                if (amt <= 0) return;
                Navigator.pop(context, _PaymentInput(
                  amount: amt,
                  method: _method,
                  reference: _refCtrl.text.trim().isEmpty ? null : _refCtrl.text.trim(),
                ));
              },
              child: const Text('Save'),
            ),
          ),
        ],
      ),
    );
  }
}
