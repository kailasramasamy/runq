import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import '../api/api_client.dart';
import '../api/dunning_repo.dart';
import '../api/models.dart';
import '../api/repos.dart';
import '../providers/data_providers.dart';
import '../providers/dunning_providers.dart';
import '../theme/runq_tokens.dart';
import '../theme/runq_theme.dart';
import '../utils/format_inr.dart';
import '../widgets/async_slot.dart';
import '../widgets/avatar.dart';
import '../widgets/invoice_send_outcome.dart';
import '../widgets/payment_qr_sheet.dart';
import '../widgets/reminder_channel_sheet.dart';
import '../widgets/runq_card.dart';
import '../widgets/runq_snack.dart';
import '../widgets/status_pill.dart';
import 'inventory/widgets/shortfall_flow.dart';
import '../widgets/swipe_action.dart' show showPaymentMethodSheet;

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
              _DetailHeader(invoice: inv),
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
                // Status pill on lists (sales hub / invoices screen) and PO
                // inbox can change after send / mark-paid — invalidate the
                // family so every consumer refetches when navigated back to.
                ref.invalidate(invoicesProvider);
              }),
            ],
          ),
        ),
      ),
    );
  }
}

class _DetailHeader extends ConsumerStatefulWidget {
  final InvoiceWithDetails invoice;
  const _DetailHeader({required this.invoice});

  @override
  ConsumerState<_DetailHeader> createState() => _DetailHeaderState();
}

class _DetailHeaderState extends ConsumerState<_DetailHeader> {
  bool _sharing = false;
  bool _busy = false;

  Future<void> _share() async {
    if (_sharing) return;
    setState(() => _sharing = true);
    final box = context.findRenderObject() as RenderBox?;
    final origin = box != null ? box.localToGlobal(Offset.zero) & box.size : null;
    try {
      // Mirror the post-create success-sheet flow: use the server-supplied
      // `<invoice#>-<customer>.pdf` filename (Content-Disposition) and write
      // to a real temp file so the iOS share sheet / WhatsApp / Mail show
      // the intended filename. `XFile.fromData` keeps a tmp UUID path,
      // which most apps display instead of the XFile.name.
      final result = await invoicesRepo.pdfBytes(widget.invoice.id);
      if (!mounted) return;
      final fileName = result.fileName ?? '${widget.invoice.invoiceNumber}.pdf';
      // Parse the customer suffix out of "<invoice#>-<customer>.pdf" so the
      // share subject reads "Invoice INV-001 - Acme Co" — same convention
      // as the post-create sheet so users see the same message regardless
      // of entry point.
      final stem = fileName.toLowerCase().endsWith('.pdf')
          ? fileName.substring(0, fileName.length - 4)
          : fileName;
      final prefix = '${widget.invoice.invoiceNumber}-';
      final customer = stem.startsWith(prefix) ? stem.substring(prefix.length) : '';
      final shareText = customer.isEmpty
          ? 'Invoice ${widget.invoice.invoiceNumber}'
          : 'Invoice ${widget.invoice.invoiceNumber} - $customer';
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/$fileName');
      await file.writeAsBytes(result.bytes, flush: true);
      if (!mounted) return;
      await Share.shareXFiles(
        [XFile(file.path, mimeType: 'application/pdf', name: fileName)],
        subject: shareText,
        text: shareText,
        sharePositionOrigin: origin,
      );
    } on ApiException catch (e) {
      if (mounted) showRunqSnack(context, e.message, kind: SnackKind.error);
    } catch (_) {
      if (mounted) showRunqSnack(context, 'Could not generate invoice PDF', kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _sharing = false);
    }
  }

  Future<void> _openMore() async {
    final action = await showModalBottomSheet<_InvoiceAction>(
      context: context,
      backgroundColor: RT(context).surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(18))),
      builder: (_) => _MoreActionsSheet(invoice: widget.invoice),
    );
    if (action == null || !mounted) return;
    switch (action) {
      case _InvoiceAction.recordOffline:
        await _recordOfflinePayment();
      case _InvoiceAction.amend:
        if (mounted) context.push('/invoices/${widget.invoice.id}/edit');
      case _InvoiceAction.discard:
        await _confirmDiscard();
      case _InvoiceAction.hardDelete:
        await _confirmHardDelete();
    }
  }

  /// Escape hatch for the rare case where the customer paid in cash or into a
  /// personal account, so the receipt will never land on a bank statement to
  /// reconcile. Normal (bank-account) payments must NOT go through here — they
  /// record themselves at statement import. Kept off the primary footer and in
  /// the overflow menu so it isn't the default money-in path.
  Future<void> _recordOfflinePayment() async {
    if (_busy) return;
    final result = await showPaymentMethodSheet(context, widget.invoice.balanceDue);
    if (result == null || !mounted) return;
    setState(() => _busy = true);
    try {
      await invoicesRepo.markPaid(
        widget.invoice.id,
        paymentMethod: result.method,
        referenceNumber: result.reference,
      );
      if (!mounted) return;
      showRunqSnack(context, 'Payment recorded', kind: SnackKind.success);
      ref.invalidate(invoiceDetailProvider(widget.invoice.id));
      ref.invalidate(invoiceSummaryProvider);
      ref.invalidate(dashboardSummaryProvider);
    } on ApiException catch (e) {
      if (mounted) showRunqSnack(context, e.message, kind: SnackKind.error);
    } catch (_) {
      if (mounted) showRunqSnack(context, 'Could not record payment', kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _confirmDiscard() async {
    final ok = await _confirm(
      title: 'Discard ${widget.invoice.invoiceNumber}?',
      body: 'This sets the invoice status to cancelled. Only draft invoices can be discarded; the row stays in the database for audit but no longer counts toward AR.',
      confirmLabel: 'Discard',
    );
    if (ok != true || !mounted) return;
    setState(() => _busy = true);
    try {
      await invoicesRepo.discard(widget.invoice.id);
      if (!mounted) return;
      showRunqSnack(context, 'Invoice discarded', kind: SnackKind.success);
      _refreshAndPop();
    } on ApiException catch (e) {
      if (mounted) showRunqSnack(context, e.message, kind: SnackKind.error);
    } catch (_) {
      if (mounted) showRunqSnack(context, 'Could not discard invoice', kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _confirmHardDelete() async {
    final ok = await _confirm(
      title: 'Permanently delete ${widget.invoice.invoiceNumber}?',
      body: 'This cannot be undone. The invoice and all its line items will be removed. The delete will be refused if any receipts, credit notes, or GL postings reference this invoice.',
      confirmLabel: 'Delete forever',
    );
    if (ok != true || !mounted) return;
    setState(() => _busy = true);
    try {
      await invoicesRepo.hardDelete(widget.invoice.id);
      if (!mounted) return;
      showRunqSnack(context, 'Invoice deleted', kind: SnackKind.success);
      _refreshAndPop();
    } on ApiException catch (e) {
      if (mounted) showRunqSnack(context, e.message, kind: SnackKind.error);
    } catch (_) {
      if (mounted) showRunqSnack(context, 'Could not delete invoice', kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<bool?> _confirm({required String title, required String body, required String confirmLabel}) {
    return showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Text(body),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: Text(confirmLabel),
          ),
        ],
      ),
    );
  }

  void _refreshAndPop() {
    ref.invalidate(invoiceDetailProvider(widget.invoice.id));
    ref.invalidate(invoiceSummaryProvider);
    ref.invalidate(dashboardSummaryProvider);
    if (context.canPop()) context.pop();
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
      child: Row(
        children: [
          _CircleIconButton(
            icon: Icons.arrow_back_ios_new_rounded,
            iconSize: 16,
            onTap: () => context.pop(),
          ),
          Expanded(child: Center(child: Text(widget.invoice.invoiceNumber, style: RunqText.bodyStrong.copyWith(color: t.ink)))),
          _CircleIconButton(
            icon: Icons.ios_share_rounded,
            iconSize: 18,
            loading: _sharing,
            onTap: _share,
          ),
          const SizedBox(width: 8),
          _CircleIconButton(
            icon: Icons.more_horiz_rounded,
            iconSize: 20,
            loading: _busy,
            onTap: _openMore,
          ),
        ],
      ),
    );
  }
}

enum _InvoiceAction { recordOffline, amend, discard, hardDelete }

class _MoreActionsSheet extends StatelessWidget {
  final InvoiceWithDetails invoice;
  const _MoreActionsSheet({required this.invoice});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final status = invoice.status;
    final canDiscard = status == 'draft';
    // Edit + delete on sent/overdue mirror the web admin's amend-after-send
    // policy: allowed while no payment has been received. Backend rebuilds
    // the GL posting in-tx on save and unwinds it on delete.
    final canAmend = status == 'draft' ||
        ((status == 'sent' || status == 'overdue') && invoice.amountReceived == 0);
    final canHardDelete = status == 'draft' ||
        status == 'cancelled' ||
        ((status == 'sent' || status == 'overdue') && invoice.amountReceived == 0);
    // Offline (cash / personal-account) receipt — the rare payment that won't
    // reconcile from a bank statement. Bank payments should NOT use this.
    final canRecordOffline = invoice.balanceDue > 0 &&
        (status == 'sent' || status == 'overdue' || status == 'partially_paid');

    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(8, 8, 8, 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40, height: 4,
              margin: const EdgeInsets.only(bottom: 12),
              decoration: BoxDecoration(color: t.hairline, borderRadius: BorderRadius.circular(2)),
            ),
            if (canRecordOffline)
              _SheetItem(
                icon: Icons.payments_outlined,
                label: 'Record offline payment',
                subtitle: 'Only for cash / personal a/c — bank payments record '
                    'themselves at reconciliation',
                onTap: () => Navigator.pop(context, _InvoiceAction.recordOffline),
              ),
            if (canAmend)
              _SheetItem(
                icon: Icons.edit_outlined,
                label: status == 'draft' ? 'Edit invoice' : 'Amend invoice',
                subtitle: status == 'draft'
                    ? 'Update customer, items, dates'
                    : 'Customer revised the order — adjust qty/items',
                onTap: () => Navigator.pop(context, _InvoiceAction.amend),
              ),
            if (canDiscard)
              _SheetItem(
                icon: Icons.block_rounded,
                label: 'Discard invoice',
                subtitle: 'Cancel it — kept on record for your books',
                onTap: () => Navigator.pop(context, _InvoiceAction.discard),
                destructive: true,
              ),
            if (canHardDelete)
              _SheetItem(
                icon: Icons.delete_outline_rounded,
                label: 'Delete forever',
                subtitle: 'Permanently remove — only if no receipts/postings',
                onTap: () => Navigator.pop(context, _InvoiceAction.hardDelete),
                destructive: true,
              ),
            if (!canRecordOffline && !canAmend && !canDiscard && !canHardDelete)
              Padding(
                padding: const EdgeInsets.all(20),
                child: Text(
                  'No additional actions for this invoice.',
                  style: RunqText.caption.copyWith(color: t.muted),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _SheetItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final String? subtitle;
  final VoidCallback onTap;
  final bool destructive;
  const _SheetItem({
    required this.icon,
    required this.label,
    this.subtitle,
    required this.onTap,
    this.destructive = false,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final fg = destructive ? const Color(0xFFEF4444) : t.ink;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
        child: Row(
          children: [
            Icon(icon, color: fg, size: 22),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: RunqText.body.copyWith(color: fg, fontWeight: FontWeight.w600)),
                  if (subtitle != null) ...[
                    const SizedBox(height: 2),
                    Text(subtitle!, style: RunqText.caption.copyWith(color: t.muted)),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CircleIconButton extends StatelessWidget {
  final IconData icon;
  final double iconSize;
  final VoidCallback onTap;
  final bool loading;
  const _CircleIconButton({
    required this.icon,
    required this.onTap,
    this.iconSize = 18,
    this.loading = false,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InkWell(
      onTap: loading ? null : onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        width: 40, height: 40,
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: t.hairline, width: 0.5),
        ),
        alignment: Alignment.center,
        child: loading
            ? SizedBox(
                width: 16, height: 16,
                child: CircularProgressIndicator(strokeWidth: 2, color: t.ink),
              )
            : Icon(icon, size: iconSize, color: t.ink),
      ),
    );
  }
}

class _HeroCard extends StatelessWidget {
  final InvoiceWithDetails invoice;
  const _HeroCard({required this.invoice});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return RunqCard(
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              RqAvatar(name: invoice.customerName, size: 44, filled: true),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(invoice.customerName,
                        style: RunqText.h4,
                        maxLines: 2, overflow: TextOverflow.ellipsis),
                    const SizedBox(height: 4),
                    Text(
                      // Drop the year from "Issued" (the actionable date is
                      // due-date) so the line fits in the avatar row beside
                      // the status pill without wrapping.
                      'Issued ${_shortDate(invoice.invoiceDate)}  ·  Due ${_dueDate(invoice.dueDate)}',
                      style: RunqText.caption.copyWith(color: t.muted),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              // Status pill lives next to the customer so it answers
              // "what state is this invoice in?" at the same glance as
              // the customer name. Frees the bottom of the card to be
              // dominated by the amount alone.
              StatusPill(invoice.status, warning: invoice.status == 'overdue'),
            ],
          ),
          const SizedBox(height: 18),
          // Drop the redundant 'TOTAL' eyebrow — the giant rupee number
          // followed by the GST breakdown card is self-evidently the
          // invoice total. Caption above only says what it costs in pixels.
          Text(formatINR(invoice.totalAmount),
              style: RunqText.tabular(size: 30, w: FontWeight.w700, color: t.ink).copyWith(height: 1.0)),
          if (invoice.balanceDue > 0 && invoice.balanceDue != invoice.totalAmount) ...[
            const SizedBox(height: 6),
            Text('${formatINR(invoice.balanceDue)} balance due',
                style: RunqText.caption.copyWith(color: RunqColors.redInk, fontWeight: FontWeight.w600)),
          ],
        ],
      ),
    );
  }

  String _dueDate(DateTime d) {
    const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${d.day} ${m[d.month - 1]} ${d.year}';
  }

  String _shortDate(DateTime d) {
    const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${d.day} ${m[d.month - 1]}';
  }
}

class _LineItemsCard extends StatelessWidget {
  final List<InvoiceItem> items;
  const _LineItemsCard({required this.items});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return RunqCard(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('LINE ITEMS', style: RunqText.label),
              const SizedBox(width: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1.5),
                decoration: BoxDecoration(
                  color: RunqColors.indigo.withValues(alpha: 0.10),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text('${items.length}',
                    style: RunqText.tabular(size: 10, w: FontWeight.w800, color: RunqColors.indigo)),
              ),
            ],
          ),
          const SizedBox(height: 10),
          for (var i = 0; i < items.length; i++) ...[
            _ItemRow(item: items[i]),
            if (i < items.length - 1)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 10),
                child: Container(height: 1, color: t.muted2.withValues(alpha: 0.30)),
              ),
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
    final t = RT(context);
    final qtyStr = item.quantity.toStringAsFixed(item.quantity == item.quantity.toInt() ? 0 : 2);
    final taxLabel = _taxLabel(item);
    final uom = item.uom?.trim();
    final metaParts = <String>[
      if (uom != null && uom.isNotEmpty) uom,
      '$qtyStr × ${formatINR(item.unitPrice)}',
      if (taxLabel != null) taxLabel,
    ];
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                item.itemName.isEmpty ? item.description : item.itemName,
                style: RunqText.bodyStrong.copyWith(color: t.ink, height: 1.3),
              ),
              const SizedBox(height: 4),
              Text(
                metaParts.join('  ·  '),
                style: RunqText.caption.copyWith(color: t.muted),
              ),
            ],
          ),
        ),
        const SizedBox(width: 12),
        // GST-INCLUSIVE line total — pre-tax amount + the line's tax. Mirrors
        // the web invoice and PDF so the per-row figure matches what the
        // customer pays for that line.
        Text(
          formatINR(item.amount + item.taxAmount),
          style: RunqText.tabular(size: 14, w: FontWeight.w700, color: t.ink),
        ),
      ],
    );
  }

  /// "GST 5% · ₹12.50" / "GST 0%" / null (no rate set ≠ explicitly exempt).
  String? _taxLabel(InvoiceItem item) {
    if (item.taxRate == null) return null;
    final rate = item.taxRate!;
    final rateStr = rate == rate.toInt() ? rate.toInt().toString() : rate.toStringAsFixed(1);
    if (rate == 0 || item.taxAmount == 0) return 'GST $rateStr%';
    return 'GST $rateStr% · ${formatINR(item.taxAmount)}';
  }
}

class _GstBreakdownCard extends StatelessWidget {
  final InvoiceWithDetails invoice;
  const _GstBreakdownCard({required this.invoice});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return RunqCard(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('SUMMARY', style: RunqText.label),
          const SizedBox(height: 10),
          _LineRow(label: 'Subtotal', value: formatINR(invoice.subtotal)),
          if (invoice.taxAmount > 0) ...[
            if (invoice.igst > 0) _LineRow(label: 'IGST', value: formatINR(invoice.igst)),
            if (invoice.cgst > 0) _LineRow(label: 'CGST', value: formatINR(invoice.cgst)),
            if (invoice.sgst > 0) _LineRow(label: 'SGST', value: formatINR(invoice.sgst)),
            if (invoice.cess > 0) _LineRow(label: 'Cess', value: formatINR(invoice.cess)),
          ] else
            // Always render a Tax line so the breakdown's structure is
            // consistent even when this invoice happens to be GST-0% (e.g.
            // exempt staples like milk). Without this, users see "Subtotal
            // → Total" with no tax row and wonder if the calculation skipped.
            _LineRow(label: 'GST', value: formatINR(0)),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Container(height: 1, color: t.muted2.withValues(alpha: 0.30)),
          ),
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
    // Tighter, matched-weight subtotal/tax lines so the structure reads as
    // "math": Subtotal + GST → Total. Total stays bold + larger to be the
    // visual punctuation at the bottom of the column.
    final labelStyle = strong
        ? RunqText.bodyStrong.copyWith(color: t.ink)
        : RunqText.body.copyWith(color: t.ink2);
    final valueStyle = strong
        ? RunqText.tabular(size: 16, w: FontWeight.w800, color: t.ink)
        : RunqText.tabular(size: 13, w: FontWeight.w600, color: t.ink);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        children: [
          Expanded(child: Text(label, style: labelStyle)),
          Text(value, style: valueStyle),
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
                  style: RunqText.label.copyWith(color: RT(context).muted2, letterSpacing: 0.04 * 11)),
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
  bool _sending = false;

  Future<void> _send() async {
    setState(() => _sending = true);
    try {
      // WhatsApp pings the customer; the invoice mail with the PDF attached
      // goes out alongside it, which is the copy they actually file.
      final sent = await invoicesRepo.send(widget.invoice.id, channel: 'whatsapp');
      if (!mounted) return;
      widget.onChange();
      // Auto-dispatch has already met the shelf by now. If it came up short,
      // ask here — the person who just billed it is the one who can decide.
      //
      // The shortage is asked first and the send confirmation waits behind it.
      // Reporting delivery immediately put a toast over the sheet's primary
      // action, which read as though the email were part of the decision.
      final dispatch = sent.dispatch;
      if (dispatch != null && mounted) {
        await runShortfallFlow(context, ref, dispatch, invoiceId: widget.invoice.id);
      }
      if (!mounted) return;
      reportInvoiceSendOutcome(
        context,
        sent.email,
        invoiceNumber: widget.invoice.invoiceNumber,
        customerName: widget.invoice.customerName,
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      showRunqSnack(context, e.message, kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  /// Asks the user how to deliver the reminder (Email / WhatsApp / Both),
  /// then fires one API call per chosen channel and surfaces honest results.
  /// Email actually delivers via the configured provider; WhatsApp/SMS are
  /// logged but not yet dispatched server-side (Gupshup integration TBD), so
  /// we report "queued" rather than "sent" for that channel.
  Future<void> _remind() async {
    final inv = widget.invoice;
    final choice = await showReminderChannelSheet(
      context,
      customerEmail: inv.customerEmail,
      customerPhone: inv.customerPhone,
    );
    if (choice == null || !mounted) return;

    setState(() => _sending = true);
    try {
      final rules = await ref.read(dunningRulesProvider.future);
      final due = inv.dueDate;
      final daysOverdue =
          due.isBefore(DateTime.now()) ? DateTime.now().difference(due).inDays : 0;
      final level = daysOverdue >= 45
          ? 4
          : daysOverdue >= 30
              ? 3
              : daysOverdue >= 15
                  ? 2
                  : 1;
      final rule = rules.firstWhere(
        (r) => r.escalationLevel == level && r.isActive,
        orElse: () => rules.firstWhere((r) => r.isActive,
            orElse: () => rules.first),
      );

      if (choice.hasEmail) {
        await dunningRepo.sendReminders(
          invoiceIds: [inv.id],
          ruleId: rule.id,
          channel: 'email',
        );
      }
      if (choice.hasWhatsapp) {
        await dunningRepo.sendReminders(
          invoiceIds: [inv.id],
          ruleId: rule.id,
          channel: 'whatsapp',
        );
      }

      if (!mounted) return;
      reportReminderOutcome(context, choice);
      widget.onChange();
    } on ApiException catch (e) {
      if (!mounted) return;
      showRunqSnack(context, e.message, kind: SnackKind.error);
    } catch (e) {
      if (!mounted) return;
      showRunqSnack(context, "Couldn't send reminder: $e",
          kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }


  /// Show a scannable UPI QR so the customer pays into the business account.
  /// Recording is left to bank reconciliation — this sheet never mutates the
  /// invoice, so no busy state or onChange is needed.
  Future<void> _showPaymentQr() {
    final inv = widget.invoice;
    return showPaymentQrSheet(
      context,
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      customerName: inv.customerName,
      balanceDue: inv.balanceDue,
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final status = widget.invoice.status;
    final isDraft = status == 'draft';
    // Cancelled and fully-paid invoices are terminal — no reminders, no
    // payments. Hide the action footer entirely so the user doesn't try to
    // act on a closed bill (and so the screen ends with a clean line items
    // section instead of dead-disabled buttons).
    final isClosed = status == 'cancelled' || status == 'paid';
    if (isClosed) return const SizedBox.shrink();

    final canMark = widget.invoice.balanceDue > 0;

    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        border: Border(top: BorderSide(color: t.hairline, width: 0.5)),
      ),
      padding: EdgeInsets.fromLTRB(16, 12, 16, 12 + MediaQuery.of(context).padding.bottom),
      child: isDraft
          ? SizedBox(
              height: 48,
              width: double.infinity,
              // Draft → flip status to sent. Once it's no longer a draft this
              // footer rebuilds into the reminder + record-payment row.
              child: FilledButton.icon(
                onPressed: _sending ? null : _send,
                style: FilledButton.styleFrom(backgroundColor: RunqColors.indigo),
                icon: _sending
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.send_rounded, size: 18),
                label: const Text('Send invoice'),
              ),
            )
          : Row(
              children: [
                Expanded(
                  child: SizedBox(
                    height: 48,
                    child: FilledButton.icon(
                      onPressed: _sending ? null : _remind,
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
                    child: FilledButton.icon(
                      onPressed: !canMark ? null : _showPaymentQr,
                      style: FilledButton.styleFrom(backgroundColor: RunqColors.indigo),
                      icon: const Icon(Icons.qr_code_2_rounded, size: 18),
                      label: const Text('Payment QR'),
                    ),
                  ),
                ),
              ],
            ),
    );
  }
}

