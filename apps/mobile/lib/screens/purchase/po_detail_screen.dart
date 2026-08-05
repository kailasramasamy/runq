import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import '../../api/api_client.dart';
import '../../api/models.dart' show BillAttachment;
import '../../api/purchase_models.dart';
import '../../api/purchase_repo.dart';
import '../../providers/purchase_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart';
import 'widgets/pur_colors.dart';
import 'widgets/pur_primitives.dart';

/// PO detail — redesigned to mirror the create-screen polish:
/// vendor hero, date chips, line cards with a received-progress bar,
/// violet-deep totals, and a sticky bar whose secondary actions live in
/// an overflow menu so the primary CTA always has room.
class PurchaseOrderDetailScreen extends ConsumerStatefulWidget {
  final String poId;
  const PurchaseOrderDetailScreen({super.key, required this.poId});

  @override
  ConsumerState<PurchaseOrderDetailScreen> createState() => _PurchaseOrderDetailScreenState();
}

class _PurchaseOrderDetailScreenState extends ConsumerState<PurchaseOrderDetailScreen> {
  bool _busy = false;

  Future<void> _run(Future<PurchaseOrderWithLines> Function() op, String successMsg) async {
    setState(() => _busy = true);
    try {
      await op();
      ref.invalidate(purchaseOrderDetailProvider(widget.poId));
      ref.invalidate(purchaseOrderListProvider);
      if (mounted) showRunqSnack(context, successMsg, kind: SnackKind.success);
    } catch (e) {
      if (mounted) showRunqSnack(context, e.toString(), kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _send() async {
    setState(() => _busy = true);
    try {
      final po = await purchaseRepo.send(widget.poId);
      ref.invalidate(purchaseOrderDetailProvider(widget.poId));
      ref.invalidate(purchaseOrderListProvider);
      if (!mounted) return;
      // The server has marked it sent, but the vendor only has it once the
      // share sheet actually goes through — so confirm after, not before.
      final shared = await _sharePdf(po);
      if (!mounted) return;
      showRunqSnack(
        context,
        shared
            ? 'PO ${po.poNumber} sent to ${po.vendorName}'
            : 'PO ${po.poNumber} marked as sent — not shared yet',
        kind: shared ? SnackKind.success : SnackKind.info,
      );
    } catch (e) {
      if (mounted) showRunqSnack(context, e.toString(), kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Returns true only when the share sheet actually handed the PO off —
  /// dismissing it leaves the vendor without the document, and the caller
  /// words its confirmation accordingly.
  Future<bool> _sharePdf(PurchaseOrderWithLines po) async {
    final box = context.findRenderObject() as RenderBox?;
    final origin = box != null ? box.localToGlobal(Offset.zero) & box.size : null;
    try {
      final result = await purchaseRepo.pdfBytes(widget.poId);
      if (!mounted) return false;
      final fileName = result.fileName ?? '${po.poNumber}.pdf';
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/$fileName');
      await file.writeAsBytes(result.bytes, flush: true);
      if (!mounted) return false;
      final shared = await Share.shareXFiles(
        [XFile(file.path, mimeType: 'application/pdf', name: fileName)],
        subject: 'Purchase Order ${po.poNumber}',
        text: _buildShareText(po),
        sharePositionOrigin: origin,
      );
      return shared.status == ShareResultStatus.success;
    } on ApiException catch (e) {
      if (mounted) showRunqSnack(context, e.message, kind: SnackKind.error);
      return false;
    } catch (_) {
      if (mounted) showRunqSnack(context, 'Could not generate PO PDF', kind: SnackKind.error);
      return false;
    }
  }

  /// Friendly default body for the share sheet — vendor salutation, the
  /// PO number / dates, an itemised line list, and the total. PDF stays
  /// the source of truth; this is just preview text the recipient sees
  /// in WhatsApp / email before opening the attachment.
  String _buildShareText(PurchaseOrderWithLines po) {
    final buf = StringBuffer();
    buf.writeln('Hello ${po.vendorName},');
    buf.writeln();
    buf.writeln('Please find attached Purchase Order ${po.poNumber} '
        'dated ${prettyShortDate(po.poDate)}.');
    if (po.expectedDate != null) {
      buf.writeln('Expected delivery: ${prettyShortDate(po.expectedDate!)}.');
    }
    buf.writeln();
    buf.writeln('Items:');
    for (var i = 0; i < po.lines.length; i++) {
      final l = po.lines[i];
      final qty = _qtyText(l.qtyOrdered);
      final uom = (l.uom ?? '').trim();
      final qtyLabel = uom.isEmpty ? qty : '$qty $uom';
      buf.writeln('${i + 1}. ${l.description} — $qtyLabel');
    }
    if ((po.paymentTerms ?? '').trim().isNotEmpty) {
      buf.writeln();
      buf.writeln('Payment terms: ${po.paymentTerms!.trim()}');
    }
    buf.writeln();
    buf.writeln('Please confirm receipt of this PO.');
    return buf.toString();
  }

  static String _qtyText(double v) {
    if (v == v.truncateToDouble()) return v.toStringAsFixed(0);
    return v.toStringAsFixed(3)
        .replaceFirst(RegExp(r'0+$'), '')
        .replaceFirst(RegExp(r'\.$'), '');
  }

  /// App-bar overflow → bottom sheet with the secondary actions. Keeps
  /// the sticky bar focused on the single primary CTA (Send / Receive).
  Future<void> _showMoreSheet({
    required bool canEdit,
    required bool canClose,
    required bool canCancel,
  }) async {
    final t = RT(context);
    final action = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: t.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 40, height: 4,
                margin: const EdgeInsets.symmetric(vertical: 10),
                decoration: BoxDecoration(
                  color: t.hairline,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 4),
              if (canEdit)
                _MoreSheetTile(
                  icon: Icons.edit_outlined,
                  label: 'Edit PO',
                  subtitle: 'Modify vendor, dates, lines',
                  onTap: () => Navigator.pop(ctx, 'edit'),
                ),
              if (canClose)
                _MoreSheetTile(
                  icon: Icons.flag_outlined,
                  label: 'Close PO',
                  subtitle: 'Mark complete and stop further receipts',
                  onTap: () => Navigator.pop(ctx, 'close'),
                ),
              if (canCancel)
                _MoreSheetTile(
                  icon: Icons.cancel_outlined,
                  label: 'Cancel PO',
                  subtitle: 'Void this PO — history is preserved',
                  destructive: true,
                  onTap: () => Navigator.pop(ctx, 'cancel'),
                ),
              const SizedBox(height: 12),
            ],
          ),
        );
      },
    );
    if (action == null || !mounted) return;
    switch (action) {
      case 'edit':
        context.push('/purchase/pos/${widget.poId}/edit');
        break;
      case 'close':
        await _close();
        break;
      case 'cancel':
        await _cancel();
        break;
    }
  }

  Future<void> _close() async {
    final reason = await _askReason(context,
        title: 'Close PO', hint: 'Short-supply; closing remainder.');
    if (reason == null || reason.trim().isEmpty) return;
    await _run(() => purchaseRepo.close(widget.poId, reason: reason.trim()), 'PO closed');
  }

  Future<void> _cancel() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cancel this PO?'),
        content: const Text('History is preserved; no further GRNs or bills can match it.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Keep')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Cancel PO')),
        ],
      ),
    );
    if (ok != true) return;
    await _run(() => purchaseRepo.cancel(widget.poId), 'PO cancelled');
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final detail = ref.watch(purchaseOrderDetailProvider(widget.poId));
    return Scaffold(
      backgroundColor: t.bgWarm,
      body: SafeArea(
        bottom: false,
        child: detail.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(child: Text('Failed to load: $e', style: RunqText.body)),
          data: (po) {
            final canEdit = po.status == 'draft';
            final canSend = po.status == 'draft' && po.lines.isNotEmpty;
            final canReceive = ['sent', 'partially_received'].contains(po.status);
            final canClose = ['sent', 'partially_received', 'received'].contains(po.status);
            final canCancel = !['cancelled', 'closed'].contains(po.status);
            final canDownload = po.status != 'draft' && po.status != 'cancelled';
            // New POs carry no pricing (rate arrives with the vendor bill).
            // Legacy POs raised before that change still have values, so the
            // money UI stays but only renders when there's something to show.
            final priced = po.total > 0;
            return Column(
              children: [
                PurPlainAppBar(
                  title: po.poNumber,
                  actions: [
                    if (canDownload)
                      IconButton(
                        icon: const Icon(Icons.ios_share_rounded, size: 20),
                        tooltip: 'Share PDF',
                        onPressed: _busy ? null : () => _sharePdf(po),
                      ),
                    if (canEdit || canClose || canCancel)
                      IconButton(
                        icon: const Icon(Icons.more_vert_rounded, size: 22),
                        tooltip: 'More',
                        onPressed: _busy
                            ? null
                            : () => _showMoreSheet(
                                  canEdit: canEdit,
                                  canClose: canClose,
                                  canCancel: canCancel,
                                ),
                      ),
                  ],
                ),
                Expanded(
                  child: ListView(
                    physics: const BouncingScrollPhysics(),
                    keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                    children: [
                      _VendorHero(name: po.vendorName, status: po.status),
                      const SizedBox(height: 12),
                      _ScheduleRow(
                        poDate: po.poDate,
                        expectedDate: po.expectedDate,
                      ),
                      if ((po.paymentTerms ?? '').isNotEmpty) ...[
                        const SizedBox(height: 10),
                        _InfoStrip(
                          icon: Icons.payments_outlined,
                          label: 'Payment terms',
                          value: po.paymentTerms!,
                        ),
                      ],
                      if ((po.deliveryAddress ?? '').isNotEmpty) ...[
                        const SizedBox(height: 10),
                        _InfoStrip(
                          icon: Icons.place_outlined,
                          label: 'Delivery address',
                          value: po.deliveryAddress!,
                        ),
                      ],
                      const SizedBox(height: 16),
                      _ItemsHeader(count: po.lines.length),
                      const SizedBox(height: 8),
                      for (final l in po.lines)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: _LineCard(line: l, priced: priced),
                        ),
                      if (priced) ...[
                        const SizedBox(height: 6),
                        _TotalsCard(subtotal: po.subtotal, tax: po.taxTotal, total: po.total),
                      ],
                      if ((po.notes ?? '').isNotEmpty) ...[
                        const SizedBox(height: 12),
                        _NotesCard(notes: po.notes!),
                      ],
                      const SizedBox(height: 12),
                      _LinkedDocumentsCard(poId: widget.poId),
                      if (po.status == 'closed' && (po.closedReason ?? '').isNotEmpty) ...[
                        const SizedBox(height: 12),
                        _ClosedReasonCard(reason: po.closedReason!),
                      ],
                    ],
                  ),
                ),
                _StickyBar(
                  total: priced ? po.total : null,
                  vendorName: po.vendorName,
                  busy: _busy,
                  primary: canSend
                      ? _PrimaryAction(
                          label: 'Send PO',
                          icon: Icons.send_rounded,
                          onTap: _send,
                        )
                      : canReceive
                          ? _PrimaryAction(
                              label: 'Receive',
                              icon: Icons.local_shipping_outlined,
                              onTap: () => context.push('/purchase/pos/${widget.poId}/receive'),
                            )
                          : null,
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

// ── Vendor hero ────────────────────────────────────────────────────────────

class _VendorHero extends StatelessWidget {
  final String name;
  final String status;
  const _VendorHero({required this.name, required this.status});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final initial = name.trim().isEmpty ? '?' : name.trim().substring(0, 1).toUpperCase();
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: t.hairline),
      ),
      child: Row(
        children: [
          Container(
            width: 44, height: 44,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              gradient: PurColors.heroGradient,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(initial,
                style: RunqText.h3.copyWith(color: Colors.white, fontWeight: FontWeight.w700)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('VENDOR',
                    style: RunqText.micro.copyWith(color: t.muted, letterSpacing: 0.6)),
                const SizedBox(height: 2),
                Text(
                  name,
                  style: RunqText.bodyStrong.copyWith(color: t.ink),
                  maxLines: 2, overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          PurStatusPill(status: status),
        ],
      ),
    );
  }
}

// ── Schedule row (read-only twin of create-screen version) ────────────────

class _ScheduleRow extends StatelessWidget {
  final String poDate;
  final String? expectedDate;
  const _ScheduleRow({required this.poDate, required this.expectedDate});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: _ReadOnlyDateChip(
            label: 'PO date',
            icon: Icons.event_rounded,
            value: prettyShortDate(poDate),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _ReadOnlyDateChip(
            label: 'Expected',
            icon: Icons.local_shipping_outlined,
            value: expectedDate == null ? null : prettyShortDate(expectedDate!),
          ),
        ),
      ],
    );
  }
}

class _ReadOnlyDateChip extends StatelessWidget {
  final String label;
  final IconData icon;
  final String? value;
  const _ReadOnlyDateChip({required this.label, required this.icon, required this.value});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final filled = value != null;
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: t.hairline),
      ),
      child: Row(
        children: [
          Icon(icon, size: 18, color: PurColors.brand(context)),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(label.toUpperCase(),
                    style: RunqText.micro.copyWith(color: t.muted, letterSpacing: 0.6)),
                const SizedBox(height: 1),
                Text(
                  filled ? value! : '—',
                  style: RunqText.bodyStrong.copyWith(color: filled ? t.ink : t.muted2),
                  maxLines: 1, overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Generic info strip (payment terms, delivery address) ──────────────────

class _InfoStrip extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  const _InfoStrip({required this.icon, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: t.hairline),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: PurColors.brand(context)),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(label.toUpperCase(),
                    style: RunqText.micro.copyWith(color: t.muted, letterSpacing: 0.6)),
                const SizedBox(height: 2),
                Text(value, style: RunqText.body.copyWith(color: t.ink)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Items header (label + count badge) ─────────────────────────────────────

class _ItemsHeader extends StatelessWidget {
  final int count;
  const _ItemsHeader({required this.count});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(2, 0, 2, 0),
      child: Row(
        children: [
          Text('ITEMS', style: RunqText.label.copyWith(color: t.muted)),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1),
            decoration: BoxDecoration(
              color: PurColors.violetSubtle,
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text('$count',
                style: RunqText.micro.copyWith(
                    color: PurColors.brand(context), fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
  }
}

// ── Line card with receive-progress bar ────────────────────────────────────

class _LineCard extends StatelessWidget {
  final PurchaseOrderLine line;
  final bool priced;
  const _LineCard({required this.line, required this.priced});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final ordered = line.qtyOrdered;
    final received = line.qtyReceived;
    final fullyReceived = ordered > 0 && received >= ordered;
    final partial = received > 0 && received < ordered;
    final pct = ordered <= 0 ? 0.0 : (received / ordered).clamp(0.0, 1.0);

    final progressColor = fullyReceived
        ? PurColors.success
        : (partial ? PurColors.orangeAlert : t.hairline);

    final lineTotal = priced ? line.amount + (line.taxAmount ?? 0) : 0.0;

    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: t.hairline),
        boxShadow: [
          BoxShadow(color: Colors.black.withValues(alpha: 0.03),
              blurRadius: 6, offset: const Offset(0, 1)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header: line# + description + total
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 22, height: 22,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: PurColors.violetSubtle,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text('${line.lineNo}',
                    style: RunqText.micro.copyWith(
                        color: PurColors.brand(context), fontWeight: FontWeight.w700)),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(line.description,
                    style: RunqText.bodyStrong.copyWith(color: t.ink)),
              ),
              if (priced) ...[
                const SizedBox(width: 8),
                Text(indianINR(lineTotal, decimals: 2),
                    style: RunqText.bodyStrong.copyWith(color: t.ink)),
              ],
            ],
          ),
          const SizedBox(height: 10),
          // Qty / Received / Rate row
          Row(
            children: [
              Expanded(
                child: _StatCell(
                  label: 'Qty',
                  value: _qty(ordered),
                  trailing: line.uom,
                ),
              ),
              Expanded(
                child: _StatCell(
                  label: 'Received',
                  value: _qty(received),
                  color: fullyReceived
                      ? PurColors.success
                      : (partial ? PurColors.orangeAlert : t.muted2),
                ),
              ),
              if (priced)
                Expanded(
                  child: _StatCell(
                    label: 'Rate',
                    value: indianINR(line.unitRate, decimals: 2),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 10),
          // Receive progress bar
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: pct,
              minHeight: 4,
              backgroundColor: t.hairlineSoft,
              valueColor: AlwaysStoppedAnimation(progressColor),
            ),
          ),
          if ((line.taxRate != null && line.taxRate! > 0) ||
              (line.hsnSacCode ?? '').isNotEmpty ||
              line.qtyBilled > 0) ...[
            const SizedBox(height: 10),
            Wrap(
              spacing: 6, runSpacing: 6,
              children: [
                if (line.taxRate != null && line.taxRate! > 0)
                  _MetaChip(label: 'Tax ${line.taxRate}%'),
                if ((line.hsnSacCode ?? '').isNotEmpty)
                  _MetaChip(label: 'HSN ${line.hsnSacCode}'),
                if (line.qtyBilled > 0)
                  _MetaChip(
                    label: 'Billed ${_qty(line.qtyBilled)}',
                    icon: Icons.receipt_long_outlined,
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  static String _qty(double v) {
    if (v == v.truncateToDouble()) return v.toStringAsFixed(0);
    return v.toStringAsFixed(3).replaceFirst(RegExp(r'0+$'), '').replaceFirst(RegExp(r'\.$'), '');
  }
}

class _StatCell extends StatelessWidget {
  final String label;
  final String value;
  final String? trailing;
  final Color? color;
  const _StatCell({required this.label, required this.value, this.trailing, this.color});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(label.toUpperCase(),
            style: RunqText.micro.copyWith(color: t.muted, letterSpacing: 0.6)),
        const SizedBox(height: 2),
        Row(
          crossAxisAlignment: CrossAxisAlignment.baseline,
          textBaseline: TextBaseline.alphabetic,
          children: [
            Flexible(
              child: Text(
                value,
                style: RunqText.bodyStrong.copyWith(color: color ?? t.ink),
                overflow: TextOverflow.ellipsis,
              ),
            ),
            if (trailing != null) ...[
              const SizedBox(width: 3),
              Text(trailing!,
                  style: RunqText.caption.copyWith(color: t.muted)),
            ],
          ],
        ),
      ],
    );
  }
}

class _MetaChip extends StatelessWidget {
  final String label;
  final IconData? icon;
  const _MetaChip({required this.label, this.icon});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: t.bgWarm,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: t.hairline),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 11, color: t.muted),
            const SizedBox(width: 4),
          ],
          Text(label, style: RunqText.micro.copyWith(color: t.muted)),
        ],
      ),
    );
  }
}

// ── Totals card ────────────────────────────────────────────────────────────

class _TotalsCard extends StatelessWidget {
  final double subtotal, tax, total;
  const _TotalsCard({required this.subtotal, required this.tax, required this.total});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return PurCard(
      child: Column(
        children: [
          _row(t, 'Subtotal', subtotal),
          const SizedBox(height: 4),
          _row(t, 'Tax', tax),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 10),
            child: Container(height: 1, color: t.hairline),
          ),
          Row(
            children: [
              Text('Total', style: RunqText.bodyStrong.copyWith(color: t.ink)),
              const Spacer(),
              Text(
                indianINR(total, decimals: 2),
                style: RunqText.h3.copyWith(
                    color: PurColors.violetDeep, fontWeight: FontWeight.w800),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _row(RunqTokens t, String label, double v) => Row(
        children: [
          Text(label, style: RunqText.body.copyWith(color: t.muted)),
          const Spacer(),
          Text(indianINR(v, decimals: 2), style: RunqText.body.copyWith(color: t.ink)),
        ],
      );
}

// ── Notes / Closed reason ──────────────────────────────────────────────────

class _NotesCard extends StatelessWidget {
  final String notes;
  const _NotesCard({required this.notes});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return PurCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('NOTES',
              style: RunqText.micro.copyWith(color: t.muted, letterSpacing: 0.6)),
          const SizedBox(height: 6),
          Text(notes, style: RunqText.body.copyWith(color: t.ink)),
        ],
      ),
    );
  }
}

class _ClosedReasonCard extends StatelessWidget {
  final String reason;
  const _ClosedReasonCard({required this.reason});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: PurColors.violetSubtle,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: PurColors.violetDeep.withValues(alpha: 0.25)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.lock_outline_rounded, size: 16, color: PurColors.violetDeep),
              const SizedBox(width: 6),
              Text('CLOSED REASON',
                  style: RunqText.micro.copyWith(
                      color: PurColors.violetDeep,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.6)),
            ],
          ),
          const SizedBox(height: 6),
          Text(reason, style: RunqText.body.copyWith(color: t.ink)),
        ],
      ),
    );
  }
}

// ── Sticky bar (Total + overflow + primary CTA) ───────────────────────────

class _PrimaryAction {
  final String label;
  final IconData icon;
  final VoidCallback onTap;
  const _PrimaryAction({required this.label, required this.icon, required this.onTap});
}

class _StickyBar extends StatelessWidget {
  /// Null for unpriced POs — the value only exists once the vendor bill
  /// prices the order, so the bar shows the vendor alone until then.
  final double? total;
  final String vendorName;
  final bool busy;
  final _PrimaryAction? primary;
  const _StickyBar({
    required this.total,
    required this.vendorName,
    required this.busy,
    required this.primary,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        border: Border(top: BorderSide(color: t.hairline)),
        boxShadow: [
          BoxShadow(color: Colors.black.withValues(alpha: 0.05),
              blurRadius: 12, offset: const Offset(0, -2)),
        ],
      ),
      // Equal top + bottom padding. No home-indicator inset — adding it
      // makes the bar look bottom-heavy on iPhones (the OS already keeps
      // the indicator drawable above content).
      padding: const EdgeInsets.fromLTRB(24, 24, 24, 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('VENDOR',
                        style: RunqText.micro.copyWith(
                            color: t.muted, letterSpacing: 0.6)),
                    const SizedBox(height: 2),
                    Text(
                      vendorName,
                      style: RunqText.bodyStrong.copyWith(color: t.ink),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              if (total != null) ...[
                const SizedBox(width: 12),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('TOTAL',
                        style: RunqText.micro.copyWith(
                            color: t.muted, letterSpacing: 0.6)),
                    const SizedBox(height: 2),
                    ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 200),
                      child: FittedBox(
                        fit: BoxFit.scaleDown,
                        alignment: Alignment.centerRight,
                        child: Text(
                          indianINR(total!, decimals: 2),
                          style: RunqText.h3.copyWith(
                              color: t.ink, fontWeight: FontWeight.w800),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
          if (primary != null) ...[
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: PurPrimaryButton(
                label: primary!.label,
                icon: primary!.icon,
                loading: busy,
                onPressed: busy ? null : primary!.onTap,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _MoreSheetTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final String? subtitle;
  final bool destructive;
  final VoidCallback onTap;
  const _MoreSheetTile({
    required this.icon,
    required this.label,
    required this.onTap,
    this.subtitle,
    this.destructive = false,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final iconBg = destructive
        ? PurColors.errorBg
        : PurColors.violetSubtle;
    final iconFg = destructive ? PurColors.error : PurColors.brand(context);
    final titleColor = destructive ? PurColors.error : t.ink;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(14),
          child: Container(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: t.hairline),
            ),
            child: Row(
              children: [
                Container(
                  width: 40, height: 40,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: iconBg,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(icon, size: 20, color: iconFg),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(label,
                          style: RunqText.bodyStrong.copyWith(color: titleColor)),
                      if (subtitle != null) ...[
                        const SizedBox(height: 2),
                        Text(subtitle!,
                            style: RunqText.caption.copyWith(color: t.muted)),
                      ],
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Icon(Icons.chevron_right_rounded,
                    size: 18, color: t.muted2),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

Future<String?> _askReason(BuildContext context,
    {required String title, required String hint}) async {
  final ctl = TextEditingController();
  final result = await showDialog<String>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: TextField(
        controller: ctl,
        autofocus: true,
        textCapitalization: TextCapitalization.sentences,
        decoration: InputDecoration(border: const OutlineInputBorder(), hintText: hint),
        maxLines: 3,
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
        FilledButton(onPressed: () => Navigator.pop(ctx, ctl.text), child: const Text('OK')),
      ],
    ),
  );
  ctl.dispose();
  return result;
}

// ── Linked documents card ─────────────────────────────────────────────────

class _LinkedDocumentsCard extends ConsumerWidget {
  final String poId;
  const _LinkedDocumentsCard({required this.poId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final async = ref.watch(purchaseOrderLinkedDocsProvider(poId));
    return PurCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.link_rounded, size: 16, color: t.muted),
              const SizedBox(width: 6),
              Text('LINKED DOCUMENTS',
                  style: RunqText.micro.copyWith(
                      color: t.muted, letterSpacing: 0.6, fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: 10),
          async.when(
            loading: () => Text('Loading…', style: RunqText.caption.copyWith(color: t.muted)),
            error: (e, _) => Text('$e', style: RunqText.caption.copyWith(color: Colors.red)),
            data: (d) {
              if (d.grns.isEmpty && d.bills.isEmpty && d.attachments.isEmpty) {
                return Text(
                  'No receipts or bills posted against this PO yet.',
                  style: RunqText.caption.copyWith(color: t.muted),
                );
              }
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (d.grns.isNotEmpty) ...[
                    _subhead(t, 'GRNs', d.grns.length),
                    const SizedBox(height: 6),
                    for (final g in d.grns)
                      _docRow(
                        context,
                        icon: Icons.inventory_2_outlined,
                        label: g['grnNo'] as String,
                        meta:
                            '${prettyShortDate(g['receivedDate'] as String)} · ${g['source'] == 'po_with_bill' ? 'scan' : g['source']}',
                        amount: (g['totalValue'] as num).toDouble(),
                      ),
                  ],
                  if (d.grns.isNotEmpty && d.bills.isNotEmpty) const SizedBox(height: 10),
                  if (d.bills.isNotEmpty) ...[
                    _subhead(t, 'Bills', d.bills.length),
                    const SizedBox(height: 6),
                    for (final b in d.bills)
                      _docRow(
                        context,
                        icon: Icons.receipt_long_outlined,
                        label: b['invoiceNumber'] as String,
                        meta:
                            '${prettyShortDate(b['invoiceDate'] as String)} · ${b['status']}',
                        amount: (b['totalAmount'] as num).toDouble(),
                        onTap: () => context.push('/bills/${b['id']}'),
                      ),
                  ],
                  if (d.attachments.isNotEmpty &&
                      (d.grns.isNotEmpty || d.bills.isNotEmpty))
                    const SizedBox(height: 10),
                  if (d.attachments.isNotEmpty) ...[
                    _subhead(t, 'Original invoice', d.attachments.length),
                    const SizedBox(height: 6),
                    for (final a in d.attachments)
                      _docRow(
                        context,
                        icon: Icons.description_outlined,
                        label: a['fileName'] as String,
                        meta:
                            '${prettyShortDate((a['createdAt'] as String).substring(0, 10))} · ${_fmtSize((a['fileSize'] as num).toInt())}',
                        trailing: _shortMime(a['mimeType'] as String),
                        onTap: () => _openAttachment(context, a),
                      ),
                  ],
                ],
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _subhead(RunqTokens t, String label, int count) => Row(
        children: [
          Text(label, style: RunqText.caption.copyWith(color: t.ink, fontWeight: FontWeight.w700)),
          const SizedBox(width: 6),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
            decoration: BoxDecoration(
              color: t.bgWarm,
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: t.hairline),
            ),
            child: Text('$count',
                style: RunqText.micro.copyWith(color: t.muted, fontWeight: FontWeight.w700)),
          ),
        ],
      );

  Widget _docRow(
    BuildContext context, {
    required IconData icon,
    required String label,
    required String meta,
    double? amount,
    String? trailing,
    VoidCallback? onTap,
  }) {
    final t = RT(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          children: [
            Icon(icon, size: 16, color: PurColors.brand(context)),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(label, style: RunqText.bodyStrong.copyWith(color: t.ink)),
                  const SizedBox(height: 1),
                  Text(meta,
                      style: RunqText.caption.copyWith(color: t.muted),
                      overflow: TextOverflow.ellipsis),
                ],
              ),
            ),
            if (amount != null) ...[
              const SizedBox(width: 6),
              Text(indianINR(amount, decimals: 2),
                  style: RunqText.body.copyWith(
                    color: t.ink,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  )),
            ] else if (trailing != null) ...[
              const SizedBox(width: 6),
              Text(trailing,
                  style: RunqText.caption.copyWith(color: t.muted)),
            ],
            if (onTap != null) ...[
              const SizedBox(width: 4),
              Icon(Icons.chevron_right_rounded, size: 16, color: t.muted2),
            ],
          ],
        ),
      ),
    );
  }
}

String _fmtSize(int bytes) {
  if (bytes < 1024) return '$bytes B';
  if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
  return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
}

String _shortMime(String mime) {
  if (mime == 'application/pdf') return 'PDF';
  if (mime.startsWith('image/')) return mime.substring(6).toUpperCase();
  return mime.split('/').last.toUpperCase();
}

/// Push the in-app viewer so the user can preview the PDF/image inline
/// and share via the OS share sheet from the viewer's top-right action.
void _openAttachment(BuildContext context, Map<String, dynamic> a) {
  final att = BillAttachment.fromJson(a);
  context.push('/attachments/view', extra: att);
}
