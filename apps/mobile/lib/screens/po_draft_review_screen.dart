import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../api/api_client.dart';
import '../api/models.dart';
import '../api/repos.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../utils/format_inr.dart';
import '../widgets/async_slot.dart';
import '../widgets/customer_picker_screen.dart';
import '../widgets/invoice_success_sheet.dart';
import '../widgets/po_line_edit_sheet.dart';
import '../widgets/runq_card.dart';
import '../widgets/runq_snack.dart';
import '../providers/data_providers.dart';
import 'po_inbox_screen.dart' show poInboxProvider;

final poDraftDetailProvider =
    FutureProvider.autoDispose.family<PoDraftDetail, String>((ref, uploadId) async {
  return poRepo.getDraft(uploadId);
});

class PoDraftReviewScreen extends ConsumerWidget {
  final String uploadId;
  const PoDraftReviewScreen({super.key, required this.uploadId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detail = ref.watch(poDraftDetailProvider(uploadId));
    return Scaffold(
      body: SafeArea(
        child: AsyncSlot<PoDraftDetail>(
          value: detail,
          onRetry: () => ref.invalidate(poDraftDetailProvider(uploadId)),
          data: (d) => _Body(detail: d),
        ),
      ),
    );
  }
}

class _Body extends ConsumerStatefulWidget {
  final PoDraftDetail detail;
  const _Body({required this.detail});

  @override
  ConsumerState<_Body> createState() => _BodyState();
}

class _BodyState extends ConsumerState<_Body> {
  late PoDraftDetail _detail;
  bool _approving = false;
  bool _cancelling = false;
  bool _reassigning = false;

  @override
  void initState() {
    super.initState();
    _detail = widget.detail;
  }

  Future<void> _editLine(PoDraftLine line) async {
    final updated = await showPoLineEditSheet(
      context: context,
      uploadId: _detail.id,
      line: line,
    );
    if (updated != null && mounted) {
      setState(() => _detail = updated);
    }
  }

  Future<void> _reassignCustomer() async {
    if (_reassigning) return;
    final picked = await showCustomerPicker(
      context,
      currentCustomerId: _detail.customerId,
    );
    if (picked == null || !mounted) return;
    if (picked.id == _detail.customerId) return;
    setState(() => _reassigning = true);
    try {
      final updated = await poRepo.updateDraft(_detail.id, customerId: picked.id);
      if (!mounted) return;
      setState(() => _detail = updated);
      showRunqSnack(context, 'Customer updated to ${picked.name}');
    } on ApiException catch (e) {
      if (mounted) showRunqSnack(context, e.message, kind: SnackKind.error);
    } catch (_) {
      if (mounted) showRunqSnack(context, 'Could not update customer.', kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _reassigning = false);
    }
  }

  Future<void> _cancel() async {
    if (_cancelling || _approving) return;
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cancel this PO?'),
        content: const Text(
          'This will permanently delete the upload and parsed draft. '
          'You can re-upload the file later if needed.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Keep'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirm != true || !mounted) return;
    setState(() => _cancelling = true);
    try {
      await poRepo.discard(_detail.id);
      if (!mounted) return;
      showRunqSnack(context, 'PO cancelled');
      if (context.mounted) context.pop();
    } on ApiException catch (e) {
      if (mounted) showRunqSnack(context, e.message, kind: SnackKind.error);
    } catch (_) {
      if (mounted) showRunqSnack(context, 'Could not cancel the PO.', kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _cancelling = false);
    }
  }

  Future<void> _approve() async {
    if (_approving) return;
    setState(() => _approving = true);
    try {
      final result = await poRepo.approve(_detail.id);
      if (!mounted) return;
      // The PO is now linked to an invoice — refresh the inbox row's
      // status pill, the unified inbox counter, and any open invoice list
      // so coming back from this screen reflects the new state without a
      // manual pull-to-refresh.
      ref.invalidate(poInboxProvider);
      ref.invalidate(inboxCountProvider);
      ref.invalidate(invoiceSummaryProvider);
      ref.invalidate(invoicesProvider);
      await showInvoiceSuccessSheet(
        context,
        invoiceId: result.invoiceId,
        invoiceNumber: result.invoiceNumber,
      );
      // If the user dismisses the sheet without picking an action, return to
      // the PO inbox so the screen they came from is the next thing they see.
      if (mounted && context.mounted) context.pop();
    } on ApiException catch (e) {
      if (mounted) showRunqSnack(context, e.message, kind: SnackKind.error);
    } catch (_) {
      if (mounted) showRunqSnack(context, 'Could not generate the invoice.', kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _approving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = _detail;
    final unresolved = d.lines.where((l) => !l.isInvoiceable).length;
    final t = RT(context);
    return Column(
      children: [
        _Header(
          poNumber: d.poNumberExtracted ?? d.fileName ?? 'Review PO',
          onCancel: _cancelling ? null : _cancel,
          cancelling: _cancelling,
        ),
        Expanded(
          child: ListView(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            physics: const BouncingScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            children: [
              _StatusStrip(
                unresolved: unresolved,
                totalLines: d.lines.length,
                hasCustomer: d.customerId != null,
                approvedInvoiceNumber: d.approvedInvoiceNumber,
              ),
              const SizedBox(height: 12),
              _CustomerCard(
                detail: d,
                onTap: _approving ? null : _reassignCustomer,
                reassigning: _reassigning,
              ),
              const SizedBox(height: 14),
              if (d.lines.isNotEmpty) ...[
                _LinesCard(lines: d.lines, onEdit: _editLine, locked: d.approvedInvoiceId != null),
                const SizedBox(height: 14),
              ],
              _TotalsCard(detail: d),
              const SizedBox(height: 8),
              if (unresolved > 0)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(
                    'Tip: tap any "Tap to map" line to pick the matching item from your masters. '
                    'We\'ll remember it for the next PO from this customer.',
                    style: RunqText.caption.copyWith(color: t.muted, height: 1.4),
                  ),
                ),
            ],
          ),
        ),
        _Footer(
          approving: _approving,
          onApprove: _approve,
          total: d.grandTotal,
          unresolved: unresolved,
          approvedInvoiceId: d.approvedInvoiceId,
          approvedInvoiceNumber: d.approvedInvoiceNumber,
        ),
      ],
    );
  }
}

class _Header extends StatelessWidget {
  final String poNumber;
  final VoidCallback? onCancel;
  final bool cancelling;
  const _Header({required this.poNumber, this.onCancel, this.cancelling = false});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
      child: Row(
        children: [
          _CircleIconButton(icon: Icons.arrow_back_ios_new_rounded, onTap: () => context.pop()),
          Expanded(
            child: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('REVIEW PO',
                      style: RunqText.micro.copyWith(
                        color: t.muted, letterSpacing: 1.2)),
                  const SizedBox(height: 2),
                  Text(poNumber,
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: RunqText.bodyStrong.copyWith(color: t.ink)),
                ],
              ),
            ),
          ),
          if (onCancel != null)
            _CircleIconButton(
              icon: cancelling ? Icons.hourglass_empty_rounded : Icons.delete_outline_rounded,
              onTap: cancelling ? () {} : onCancel!,
            )
          else
            const SizedBox(width: 40),
        ],
      ),
    );
  }
}

class _CircleIconButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  const _CircleIconButton({required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        width: 40, height: 40,
        decoration: BoxDecoration(
          color: t.surface,
          shape: BoxShape.circle,
          border: Border.all(color: t.hairline, width: 0.5),
        ),
        alignment: Alignment.center,
        child: Icon(icon, size: 16, color: t.ink),
      ),
    );
  }
}

/// Top-of-page traffic light: green when everything is ready, amber when
/// some lines need attention. Gives the user an at-a-glance answer to
/// "what do I need to fix?" without scrolling to the footer.
class _StatusStrip extends StatelessWidget {
  final int unresolved;
  final int totalLines;
  final bool hasCustomer;
  final String? approvedInvoiceNumber;
  const _StatusStrip({
    required this.unresolved,
    required this.totalLines,
    required this.hasCustomer,
    this.approvedInvoiceNumber,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final invoiced = approvedInvoiceNumber != null;
    final ready = unresolved == 0 && hasCustomer && totalLines > 0;
    final color = (invoiced || ready) ? RunqColors.greenInk : const Color(0xFFB45309);
    final bg = (invoiced || ready) ? RunqColors.greenBg : const Color(0x33F59E0B);
    final icon = (invoiced || ready) ? Icons.check_circle_rounded : Icons.error_outline_rounded;

    final problems = <String>[];
    if (totalLines == 0) problems.add('no line items parsed');
    if (unresolved > 0) {
      problems.add('$unresolved product${unresolved == 1 ? '' : 's'} need to be mapped');
    }
    final message = invoiced
        ? 'Invoice $approvedInvoiceNumber generated · ${totalLines} line${totalLines == 1 ? '' : 's'}'
        : ready
            ? 'Ready to generate · ${totalLines} line${totalLines == 1 ? '' : 's'}'
            : problems.join(' · ');

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withValues(alpha: 0.25), width: 0.5),
      ),
      child: Row(
        children: [
          Icon(icon, size: 16, color: color),
          const SizedBox(width: 8),
          Expanded(
            child: Text(message,
                style: RunqText.caption.copyWith(
                  color: ready ? color : t.ink,
                  fontWeight: FontWeight.w600,
                )),
          ),
        ],
      ),
    );
  }
}

class _CustomerCard extends StatelessWidget {
  final PoDraftDetail detail;
  final VoidCallback? onTap;
  final bool reassigning;
  const _CustomerCard({
    required this.detail,
    required this.onTap,
    required this.reassigning,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final hasMatch = detail.customerId != null;
    final displayName = detail.customerName ?? detail.buyerNameRaw ?? 'Unknown buyer';

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        child: RunqCard(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text('CUSTOMER', style: RunqText.label),
                  const Spacer(),
                  if (reassigning)
                    const SizedBox(
                      width: 12, height: 12,
                      child: CircularProgressIndicator(strokeWidth: 1.5),
                    )
                  else
                    Row(
                      children: [
                        Icon(hasMatch ? Icons.swap_horiz_rounded : Icons.add_rounded,
                            size: 14, color: RunqColors.indigo),
                        const SizedBox(width: 4),
                        Text(hasMatch ? 'Reassign' : 'Pick customer',
                            style: RunqText.caption.copyWith(
                              color: RunqColors.indigo,
                              fontWeight: FontWeight.w600,
                            )),
                      ],
                    ),
                ],
              ),
              const SizedBox(height: 8),
              Text(displayName,
                  style: RunqText.h4.copyWith(
                    color: hasMatch ? t.ink : t.muted,
                    fontStyle: hasMatch ? FontStyle.normal : FontStyle.italic,
                  )),
              if (detail.buyerGstinRaw != null) ...[
                const SizedBox(height: 4),
                Text('GSTIN ${detail.buyerGstinRaw}',
                    style: RunqText.caption.copyWith(color: t.muted)),
              ],
              if (hasMatch && detail.buyerNameRaw != null && detail.buyerNameRaw != detail.customerName) ...[
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                  decoration: BoxDecoration(
                    color: t.bgWarmer,
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(color: t.hairline, width: 0.5),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.text_snippet_outlined, size: 12, color: t.muted),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          'On PO: ${detail.buyerNameRaw}',
                          style: RunqText.caption.copyWith(color: t.muted),
                          maxLines: 2, overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
              if (!hasMatch) ...[
                const SizedBox(height: 10),
                _Warning(
                  icon: Icons.touch_app_outlined,
                  text: 'No matching customer in your books — tap "Pick customer" to assign one.',
                ),
              ],
              if (detail.poNumberExtracted != null) ...[
                const SizedBox(height: 10),
                Row(
                  children: [
                    Text('PO #', style: RunqText.caption.copyWith(color: t.muted)),
                    const SizedBox(width: 6),
                    Text(detail.poNumberExtracted!, style: RunqText.bodyStrong.copyWith(color: t.ink)),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _Warning extends StatelessWidget {
  final IconData icon;
  final String text;
  const _Warning({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: const Color(0x33F59E0B),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 16, color: const Color(0xFFB45309)),
          const SizedBox(width: 8),
          Expanded(
            child: Text(text, style: RunqText.caption),
          ),
        ],
      ),
    );
  }
}

class _GstChip extends StatelessWidget {
  /// Null = no master rate set; 0 = explicitly exempt; positive = taxable.
  final double? rate;
  const _GstChip({required this.rate});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    if (rate == null) return const SizedBox.shrink();
    final isExempt = rate == 0;
    final label = isExempt ? 'GST 0%' : 'GST ${_fmtRate(rate!)}%';
    final fg = isExempt ? RunqColors.greenInk : t.muted;
    final bg = isExempt ? RunqColors.greenBg : t.hairlineSoft;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(3)),
      child: Text(
        label,
        style: RunqText.micro.copyWith(
          color: fg,
        ),
      ),
    );
  }

  String _fmtRate(double v) =>
      v == v.toInt() ? v.toInt().toString() : v.toStringAsFixed(1);
}

class _LinesCard extends StatelessWidget {
  final List<PoDraftLine> lines;
  final ValueChanged<PoDraftLine> onEdit;
  final bool locked;
  const _LinesCard({required this.lines, required this.onEdit, this.locked = false});

  @override
  Widget build(BuildContext context) {
    final unresolved = lines.where((l) => !l.isInvoiceable).length;
    return RunqCard(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('LINE ITEMS', style: RunqText.label),
              const SizedBox(width: 6),
              if (unresolved > 0)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                  decoration: BoxDecoration(
                    color: const Color(0x33F59E0B),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text('$unresolved to fix',
                      style: RunqText.micro.copyWith(
                        color: const Color(0xFFB45309),
                      )),
                ),
            ],
          ),
          const SizedBox(height: 10),
          for (var i = 0; i < lines.length; i++) ...[
            _LineRow(line: lines[i], onTap: () => onEdit(lines[i]), locked: locked),
            if (i < lines.length - 1) const SizedBox(height: 6),
          ],
        ],
      ),
    );
  }
}

class _LineRow extends StatelessWidget {
  final PoDraftLine line;
  final VoidCallback onTap;
  final bool locked;
  const _LineRow({required this.line, required this.onTap, this.locked = false});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final qty = line.rawQty == line.rawQty.toInt()
        ? line.rawQty.toInt().toString()
        : line.rawQty.toStringAsFixed(2);
    final rate = line.effectiveRate;
    final unmatched = line.matchedItemId == null;
    // Display LANDING total (inclusive of GST) per line so the sum across
    // lines matches the PO's stated grand total — regardless of whether the
    // PO printed inclusive (Type A) or pre-tax (Type B) prices.
    final gst = line.effectiveGstRate ?? 0;
    final preTax = line.amount > 0 ? line.amount : line.rawQty * rate;
    final landing = preTax * (1 + gst / 100);
    final amountText = landing > 0 ? formatINR(landing) : '—';

    final borderColor = unmatched
        ? const Color(0xFFF59E0B).withValues(alpha: 0.45)
        : t.hairline;
    final bgColor = unmatched
        ? const Color(0x14F59E0B)
        : t.surface;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: locked ? null : onTap,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          padding: const EdgeInsets.fromLTRB(12, 10, 10, 10),
          decoration: BoxDecoration(
            color: bgColor,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: borderColor, width: 0.8),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(line.displayName,
                        style: RunqText.body.copyWith(color: t.ink),
                        maxLines: 2, overflow: TextOverflow.ellipsis),
                    const SizedBox(height: 4),
                    Wrap(
                      spacing: 6,
                      runSpacing: 4,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        Text(
                          '$qty${line.displayUom != null ? ' ${line.displayUom}' : ''} × ${rate > 0 ? formatINR(rate) : 'no rate'}',
                          style: RunqText.caption.copyWith(color: t.muted),
                        ),
                        if (line.customerSku != null && line.customerSku!.isNotEmpty)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                            decoration: BoxDecoration(
                              color: t.hairlineSoft,
                              borderRadius: BorderRadius.circular(3),
                            ),
                            child: Text(line.customerSku!,
                                style: RunqText.micro.copyWith(
                                  color: t.muted,
                                )),
                          ),
                        if (line.effectiveGstRate != null) _GstChip(rate: line.effectiveGstRate),
                      ],
                    ),
                    if (unmatched) ...[
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          const Icon(Icons.touch_app_rounded, size: 14, color: Color(0xFFB45309)),
                          const SizedBox(width: 4),
                          Text('Tap to map to a product',
                              style: RunqText.caption.copyWith(
                                color: const Color(0xFFB45309),
                                fontWeight: FontWeight.w700,
                              )),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(amountText,
                      style: RunqText.tabular(
                        size: 14,
                        w: FontWeight.w700,
                        color: unmatched ? t.muted : t.ink,
                      )),
                  if (!locked) ...[
                    const SizedBox(height: 4),
                    Icon(Icons.chevron_right_rounded, size: 16, color: t.muted2),
                  ],
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TotalsCard extends StatelessWidget {
  final PoDraftDetail detail;
  const _TotalsCard({required this.detail});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    // Compute live from the lines so unmatched lines (which have amount=0
    // server-side) still contribute to the visible total. The server's
    // stored grandTotal only reflects matched lines; this view shows what
    // the PO would total if every line were approved at its current rate.
    double subtotal = 0;
    double tax = 0;
    bool anyMissingTax = false;
    for (final l in detail.lines) {
      final lineNet = l.amount > 0 ? l.amount : (l.rawQty * l.effectiveRate);
      subtotal += lineNet;
      // Prefer the parser-captured per-line GST (works for unmatched lines on
      // POs that printed the rate); fall back to the matched item master's
      // rate.
      final rate = l.effectiveGstRate;
      if (rate != null && rate > 0) {
        tax += lineNet * rate / 100;
      } else if (rate == null && l.matchedItemId == null) {
        anyMissingTax = true;
      }
    }
    final total = subtotal + tax;
    return RunqCard(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('TOTALS', style: RunqText.label),
          const SizedBox(height: 8),
          _LinePair(label: 'Subtotal', value: formatINR(subtotal)),
          _LinePair(
            label: 'Tax',
            value: formatINR(tax),
            hint: anyMissingTax ? 'GST on unmapped lines unknown' : null,
          ),
          Divider(height: 14, thickness: 0.5, color: t.hairlineSoft),
          _LinePair(label: 'Grand total', value: formatINR(total), strong: true),
        ],
      ),
    );
  }
}

class _LinePair extends StatelessWidget {
  final String label, value;
  final String? hint;
  final bool strong;
  const _LinePair({required this.label, required this.value, this.hint, this.strong = false});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final style = strong
        ? RunqText.bodyStrong.copyWith(color: t.ink)
        : RunqText.caption.copyWith(color: t.muted);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: style),
                if (hint != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 1),
                    child: Text(hint!,
                        style: RunqText.micro.copyWith(color: t.muted2)),
                  ),
              ],
            ),
          ),
          Text(value, style: strong
              ? RunqText.tabular(size: 15, w: FontWeight.w700)
              : RunqText.tabular(size: 13, w: FontWeight.w500)),
        ],
      ),
    );
  }
}

class _Footer extends StatelessWidget {
  final bool approving;
  final double total;
  final int unresolved;
  final VoidCallback onApprove;
  final String? approvedInvoiceId;
  final String? approvedInvoiceNumber;
  const _Footer({
    required this.approving,
    required this.total,
    required this.unresolved,
    required this.onApprove,
    this.approvedInvoiceId,
    this.approvedInvoiceNumber,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final approved = approvedInvoiceId != null;
    final blocked = unresolved > 0;
    return Container(
      padding: EdgeInsets.fromLTRB(16, 12, 16, 12 + MediaQuery.of(context).padding.bottom),
      decoration: BoxDecoration(
        color: t.bgWarm,
        border: Border(top: BorderSide(color: t.hairline, width: 0.5)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (approved) ...[
            Row(
              children: [
                const Icon(Icons.check_circle_rounded, size: 14, color: RunqColors.greenInk),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    approvedInvoiceNumber != null
                        ? 'Invoice $approvedInvoiceNumber created from this PO.'
                        : 'Invoice already created from this PO.',
                    style: RunqText.caption.copyWith(color: t.ink),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                style: FilledButton.styleFrom(
                  backgroundColor: RunqColors.indigo,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
                onPressed: () => context.push('/invoices/$approvedInvoiceId'),
                icon: const Icon(Icons.receipt_long_rounded, size: 18, color: Colors.white),
                label: Text(
                  'View invoice${approvedInvoiceNumber != null ? ' · $approvedInvoiceNumber' : ''}',
                  style: RunqText.bodyStrong.copyWith(color: Colors.white),
                ),
              ),
            ),
          ] else ...[
            if (blocked) ...[
              Row(
                children: [
                  const Icon(Icons.info_outline_rounded, size: 14, color: Color(0xFFB45309)),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      '$unresolved product${unresolved == 1 ? '' : 's'} need to be mapped. Tap each line to fix.',
                      style: RunqText.caption.copyWith(color: t.ink),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
            ],
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                style: FilledButton.styleFrom(
                  backgroundColor: blocked ? t.muted2 : RunqColors.indigo,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
                onPressed: approving || blocked ? null : onApprove,
                icon: approving
                    ? const SizedBox(
                        width: 18, height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : const Icon(Icons.check_rounded, size: 18, color: Colors.white),
                label: Text(
                  approving ? 'Generating...' : 'Generate invoice · ${formatINR(total)}',
                  style: RunqText.bodyStrong.copyWith(color: Colors.white),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
