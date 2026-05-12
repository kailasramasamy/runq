import 'dart:io';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import '../api/api_client.dart';
import '../api/repos.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import 'runq_snack.dart';

/// Post-create celebration + next-step chooser. Shown after a PO draft is
/// approved or a blank invoice is saved. Dismissing the sheet sends the
/// user back to the previous screen (typically the PO inbox or the
/// invoices list), so callers don't need to navigate after pop.
Future<void> showInvoiceSuccessSheet(
  BuildContext context, {
  required String invoiceId,
  required String invoiceNumber,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isDismissible: true,
    backgroundColor: RT(context).surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
    ),
    builder: (_) => _InvoiceSuccessSheet(
      invoiceId: invoiceId,
      invoiceNumber: invoiceNumber,
    ),
  );
}

class _InvoiceSuccessSheet extends StatefulWidget {
  final String invoiceId;
  final String invoiceNumber;
  const _InvoiceSuccessSheet({required this.invoiceId, required this.invoiceNumber});

  @override
  State<_InvoiceSuccessSheet> createState() => _InvoiceSuccessSheetState();
}

class _InvoiceSuccessSheetState extends State<_InvoiceSuccessSheet> {
  bool _sharing = false;

  Future<void> _share() async {
    if (_sharing) return;
    setState(() => _sharing = true);
    try {
      final result = await invoicesRepo.pdfBytes(widget.invoiceId);
      if (!mounted) return;
      // Use the server-supplied filename (<invoice#>-<customer>.pdf) so the
      // shared file matches the admin export naming. Falls back to just the
      // invoice number if the header is missing.
      final fileName = result.fileName ?? '${widget.invoiceNumber}.pdf';
      // Pull the customer nickname out of the server-supplied filename
      // (format: "<invoice#>-<customer>.pdf") so the share message reads
      // "Invoice INV-001 - Acme Co" instead of the bare invoice number.
      final stem = fileName.toLowerCase().endsWith('.pdf')
          ? fileName.substring(0, fileName.length - 4)
          : fileName;
      final prefix = '${widget.invoiceNumber}-';
      final customer = stem.startsWith(prefix) ? stem.substring(prefix.length) : '';
      final shareText = customer.isEmpty
          ? 'Invoice ${widget.invoiceNumber}'
          : 'Invoice ${widget.invoiceNumber} - $customer';
      // Write to a temp file so the system share sheet can pass it on as
      // a real attachment (WhatsApp / Mail / Drive all expect a file URI,
      // not raw bytes).
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/$fileName');
      await file.writeAsBytes(result.bytes, flush: true);
      if (!mounted) return;
      final box = context.findRenderObject() as RenderBox?;
      await Share.shareXFiles(
        [XFile(file.path, mimeType: 'application/pdf', name: fileName)],
        subject: shareText,
        text: shareText,
        sharePositionOrigin:
            box != null ? box.localToGlobal(Offset.zero) & box.size : null,
      );
    } on ApiException catch (e) {
      if (mounted) showRunqSnack(context, e.message, kind: SnackKind.error);
    } catch (_) {
      if (mounted) showRunqSnack(context, 'Could not share the invoice.', kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _sharing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final btnShape = RoundedRectangleBorder(borderRadius: BorderRadius.circular(12));
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40, height: 4,
                decoration: BoxDecoration(
                  color: t.hairline,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 18),
            Center(
              child: Container(
                width: 56, height: 56,
                decoration: const BoxDecoration(
                  color: RunqColors.greenBg,
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.check_rounded,
                    color: RunqColors.greenInk, size: 30),
              ),
            ),
            const SizedBox(height: 14),
            Text(
              'Invoice created',
              textAlign: TextAlign.center,
              style: RunqText.h3.copyWith(color: t.ink),
            ),
            const SizedBox(height: 4),
            Text(
              widget.invoiceNumber,
              textAlign: TextAlign.center,
              style: RunqText.tabular(size: 15, w: FontWeight.w600, color: t.muted),
            ),
            const SizedBox(height: 22),
            FilledButton.icon(
              onPressed: _sharing
                  ? null
                  : () {
                      Navigator.of(context).pop();
                      context.pushReplacement('/invoices/${widget.invoiceId}');
                    },
              style: FilledButton.styleFrom(
                backgroundColor: RunqColors.indigo,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: btnShape,
              ),
              icon: const Icon(Icons.receipt_long_rounded, size: 18),
              label: const Text('Open invoice'),
            ),
            const SizedBox(height: 10),
            FilledButton.icon(
              onPressed: _sharing ? null : _share,
              style: FilledButton.styleFrom(
                backgroundColor: t.surface,
                foregroundColor: t.ink,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                  side: BorderSide(color: t.hairline, width: 0.5),
                ),
                elevation: 0,
              ),
              icon: _sharing
                  ? const SizedBox(
                      width: 16, height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.ios_share_rounded, size: 18),
              label: Text(_sharing ? 'Preparing PDF…' : 'Share PDF'),
            ),
            const SizedBox(height: 10),
            TextButton(
              onPressed: _sharing
                  ? null
                  : () {
                      Navigator.of(context).pop();
                      context.go('/sales/invoices');
                    },
              child: Text('View all invoices',
                  style: RunqText.body.copyWith(color: t.muted)),
            ),
          ],
        ),
      ),
    );
  }
}
