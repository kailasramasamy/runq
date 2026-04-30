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
import '../widgets/po_line_edit_sheet.dart';
import '../widgets/runq_card.dart';
import '../widgets/runq_snack.dart';

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
      showRunqSnack(context, 'PO cancelled', kind: SnackKind.success);
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
      if (context.mounted) {
        showRunqSnack(context, 'Invoice ${result.invoiceNumber} created', kind: SnackKind.success);
      }
      // Replace this screen with the new invoice detail so back goes to inbox/dashboard.
      context.pushReplacement('/invoices/${result.invoiceId}');
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
    return Column(
      children: [
        _Header(
          poNumber: d.poNumberExtracted ?? d.fileName ?? 'Review PO',
          onCancel: _cancelling ? null : _cancel,
          cancelling: _cancelling,
        ),
        Expanded(
          child: ListView(
            physics: const BouncingScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            children: [
              _CustomerCard(detail: d),
              const SizedBox(height: 14),
              if (d.lines.isNotEmpty) ...[
                _LinesCard(lines: d.lines, onEdit: _editLine),
                const SizedBox(height: 14),
              ],
              _TotalsCard(detail: d),
            ],
          ),
        ),
        _Footer(
          approving: _approving,
          onApprove: _approve,
          total: d.grandTotal,
          unresolved: unresolved,
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
              child: Text(poNumber,
                  maxLines: 1, overflow: TextOverflow.ellipsis,
                  style: RunqText.bodyStrong.copyWith(color: t.ink)),
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

class _CustomerCard extends StatelessWidget {
  final PoDraftDetail detail;
  const _CustomerCard({required this.detail});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final hasMatch = detail.customerId != null;
    final displayName = detail.customerName ?? detail.buyerNameRaw ?? 'Unknown buyer';

    return RunqCard(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('CUSTOMER', style: RunqText.label),
          const SizedBox(height: 8),
          Text(displayName, style: RunqText.h3.copyWith(fontSize: 16)),
          if (detail.buyerGstinRaw != null) ...[
            const SizedBox(height: 4),
            Text('GSTIN ${detail.buyerGstinRaw}', style: RunqText.caption.copyWith(color: t.muted)),
          ],
          if (!hasMatch) ...[
            const SizedBox(height: 10),
            _Warning(
              icon: Icons.info_outline_rounded,
              text: 'No matching customer in your books — a new one will be created on approve.',
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
            child: Text(text, style: RunqText.caption.copyWith(fontSize: 12)),
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
    // Skip the chip when there's no rate set on the master — we don't want to
    // pretend "no GST" for items the user just hasn't configured yet.
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
        style: RunqText.caption.copyWith(
          fontSize: 10,
          color: fg,
          fontWeight: FontWeight.w600,
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
  const _LinesCard({required this.lines, required this.onEdit});

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
              const Spacer(),
              Text('Tap to edit',
                  style: RunqText.caption.copyWith(fontSize: 10, color: t.muted2)),
            ],
          ),
          const SizedBox(height: 8),
          for (var i = 0; i < lines.length; i++) ...[
            _LineRow(line: lines[i], onTap: () => onEdit(lines[i])),
            if (i < lines.length - 1)
              Divider(height: 20, thickness: 1, color: t.hairline),
          ],
        ],
      ),
    );
  }
}

class _LineRow extends StatelessWidget {
  final PoDraftLine line;
  final VoidCallback onTap;
  const _LineRow({required this.line, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final qty = line.rawQty == line.rawQty.toInt()
        ? line.rawQty.toInt().toString()
        : line.rawQty.toStringAsFixed(2);
    final rate = line.effectiveRate;
    final unmatched = line.matchedItemId == null;
    final amountText =
        line.amount > 0 ? formatINR(line.amount) : (rate > 0 ? formatINR(qty == '' ? 0 : line.rawQty * rate) : '—');

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              flex: 5,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(child: Text(line.displayName, style: RunqText.body)),
                      if (unmatched)
                        Container(
                          margin: const EdgeInsets.only(left: 6, top: 2),
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: const Color(0x33F59E0B),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text('NEW',
                              style: RunqText.caption.copyWith(
                                fontSize: 10,
                                color: const Color(0xFFB45309),
                                fontWeight: FontWeight.w700,
                              )),
                        ),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Wrap(
                    spacing: 6,
                    runSpacing: 4,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      Text(
                        '$qty${line.displayUom != null ? ' ${line.displayUom}' : ''} × ${rate > 0 ? formatINR(rate) : 'no rate'}',
                        style: RunqText.caption.copyWith(fontSize: 11, color: t.muted),
                      ),
                      if (line.customerSku != null && line.customerSku!.isNotEmpty)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                          decoration: BoxDecoration(
                            color: t.hairlineSoft,
                            borderRadius: BorderRadius.circular(3),
                          ),
                          child: Text(
                            line.customerSku!,
                            style: RunqText.caption.copyWith(
                              fontSize: 10,
                              color: t.muted,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      if (line.matchedItemId != null) _GstChip(rate: line.matchedItemGstRate),
                    ],
                  ),
                ],
              ),
            ),
            Text(amountText, style: RunqText.tabular(size: 14, w: FontWeight.w600)),
          ],
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
    return RunqCard(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('TOTALS', style: RunqText.label),
          const SizedBox(height: 8),
          _LinePair(label: 'Subtotal', value: formatINR(detail.subtotal, paise: true)),
          _LinePair(label: 'Tax', value: formatINR(detail.taxTotal, paise: true)),
          Divider(height: 14, thickness: 0.5, color: t.hairlineSoft),
          _LinePair(label: 'Grand total', value: formatINR(detail.grandTotal, paise: true), strong: true),
        ],
      ),
    );
  }
}

class _LinePair extends StatelessWidget {
  final String label, value;
  final bool strong;
  const _LinePair({required this.label, required this.value, this.strong = false});

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
  const _Footer({
    required this.approving,
    required this.total,
    required this.unresolved,
    required this.onApprove,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
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
          if (blocked) ...[
            Row(
              children: [
                const Icon(Icons.info_outline_rounded, size: 14, color: Color(0xFFB45309)),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    '$unresolved line${unresolved == 1 ? '' : 's'} need an item or rate. Tap each to fix.',
                    style: RunqText.caption.copyWith(fontSize: 11, color: t.ink),
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
      ),
    );
  }
}

