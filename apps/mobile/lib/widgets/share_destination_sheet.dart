import 'package:flutter/material.dart';
import '../theme/runq_tokens.dart';
import '../theme/runq_theme.dart';

/// What to do with a file the user shared into runQ from another app.
enum ShareDestination {
  /// Vendor bill — incoming invoice we received and need to record.
  /// Routes to AP scan-and-extract; line items are free-text (not matched
  /// to items master).
  vendorBill,

  /// Customer PO — purchase order from a customer. Routes to the AR PO
  /// inbox; line items DO get matched against items master (catalogue of
  /// products we sell).
  customerPo,

  /// Vendor invoice that's already tied to a known open PO of ours.
  /// Routes to a "pick an open PO" picker, then into the scan-receive
  /// flow so we post a combined GRN + Bill in one shot.
  receiveAgainstPo,

  /// A UPI/bank payment confirmation for money already paid. Routes to the
  /// quick-payment capture, OCR-prefilled, to reconcile against the bank later.
  quickPayment,
}

/// Bottom sheet shown when the user shares a file from another app
/// (WhatsApp, Mail, Files, etc). Vendor bills and customer POs go through
/// completely different processing pipelines, so we always ask first
/// rather than guess.
Future<ShareDestination?> showShareDestinationSheet(BuildContext context) {
  return showModalBottomSheet<ShareDestination>(
    context: context,
    backgroundColor: RT(context).surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
    ),
    isDismissible: true,
    // Size to content — the option list is taller than the default ~56% cap.
    isScrollControlled: true,
    builder: (_) => const _Sheet(),
  );
}

class _Sheet extends StatelessWidget {
  const _Sheet();

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return SafeArea(
      top: false,
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(8, 8, 8, 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40, height: 4,
              decoration: BoxDecoration(color: t.hairline, borderRadius: BorderRadius.circular(2)),
            ),
            const SizedBox(height: 12),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Text(
                'What did you share?',
                style: RunqText.h3,
              ),
            ),
            const SizedBox(height: 4),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Text(
                'Bills and customer POs use different processing pipelines.',
                style: RunqText.caption.copyWith(color: t.muted),
              ),
            ),
            const SizedBox(height: 12),
            _Tile(
              icon: Icons.receipt_long_outlined,
              tint: RunqColors.indigo,
              title: 'Vendor bill',
              subtitle: 'Invoice received from a supplier — books an expense',
              onTap: () => Navigator.pop(context, ShareDestination.vendorBill),
            ),
            _Tile(
              icon: Icons.assignment_outlined,
              tint: const Color(0xFF06B6D4),
              title: 'Customer PO',
              subtitle: 'Purchase order from a customer — generates a sales invoice',
              onTap: () => Navigator.pop(context, ShareDestination.customerPo),
            ),
            _Tile(
              icon: Icons.local_shipping_outlined,
              tint: const Color(0xFF7C3AED),
              title: 'Receive against PO',
              subtitle: "Vendor's invoice for an open PO — posts GRN + bill",
              onTap: () => Navigator.pop(context, ShareDestination.receiveAgainstPo),
            ),
            _Tile(
              icon: Icons.qr_code_scanner_outlined,
              tint: const Color(0xFF22C55E),
              title: 'Quick payment',
              subtitle: 'UPI/QR payment you made — logs it to match your bank',
              onTap: () => Navigator.pop(context, ShareDestination.quickPayment),
            ),
            const SizedBox(height: 4),
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
          ],
        ),
      ),
    );
  }
}

class _Tile extends StatelessWidget {
  final IconData icon;
  final Color tint;
  final String title, subtitle;
  final VoidCallback onTap;
  const _Tile({
    required this.icon,
    required this.tint,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      child: Material(
        color: t.bgWarm,
        borderRadius: BorderRadius.circular(12),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Container(
                  width: 40, height: 40,
                  decoration: BoxDecoration(
                    color: tint.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(icon, color: tint, size: 20),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: RunqText.bodyStrong),
                      const SizedBox(height: 2),
                      Text(subtitle, style: RunqText.caption.copyWith(color: t.muted)),
                    ],
                  ),
                ),
                Icon(Icons.chevron_right, size: 18, color: t.muted),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
