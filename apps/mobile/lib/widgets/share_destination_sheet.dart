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
  /// payment-made capture, OCR-prefilled, to reconcile against the bank later.
  quickPayment,
}

/// Bottom sheet shown when the user shares a file from another app
/// (WhatsApp, Mail, Files, etc). Vendor bills and customer POs go through
/// completely different processing pipelines, so we always ask first
/// rather than guess.
Future<ShareDestination?> showShareDestinationSheet(BuildContext context) {
  return showModalBottomSheet<ShareDestination>(
    context: context,
    backgroundColor: Colors.transparent,
    isDismissible: true,
    // Size to content — the option list is taller than the default ~56% cap.
    isScrollControlled: true,
    builder: (_) => const _Sheet(),
  );
}

class _Sheet extends StatefulWidget {
  const _Sheet();

  @override
  State<_Sheet> createState() => _SheetState();
}

class _SheetState extends State<_Sheet> {
  bool _showMore = false;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius:
            const BorderRadius.vertical(top: Radius.circular(RunqRadii.hero)),
        border: Border.all(color: t.hairline, width: 0.5),
        boxShadow: RunqShadows.sheet,
      ),
      child: SafeArea(
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
                child: Text('What did you share?', style: RunqText.h3),
              ),
              const SizedBox(height: 4),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: Text(
                  "Most shares are a supplier's invoice — we'll assume that unless you say otherwise.",
                  style: RunqText.caption.copyWith(color: t.muted),
                ),
              ),
              const SizedBox(height: 14),
              _PrimaryTile(
                icon: Icons.receipt_long_outlined,
                title: 'Vendor bill',
                subtitle: 'Invoice received from a supplier — books an expense',
                onTap: () => Navigator.pop(context, ShareDestination.vendorBill),
              ),
              const SizedBox(height: 4),
              _Tile(
                icon: Icons.assignment_outlined,
                tint: const Color(0xFF06B6D4),
                title: 'Customer PO',
                subtitle: 'A purchase order from a customer — generates a sales invoice',
                onTap: () => Navigator.pop(context, ShareDestination.customerPo),
              ),
              const SizedBox(height: 4),
              if (!_showMore)
                TextButton(
                  onPressed: () => setState(() => _showMore = true),
                  child: const Text('Something else?'),
                )
              else
                ..._moreOptions(context),
              const SizedBox(height: 4),
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Cancel'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _moreOptions(BuildContext context) {
    return [
      _Tile(
        icon: Icons.local_shipping_outlined,
        tint: const Color(0xFF7C3AED),
        title: 'Receive against PO',
        subtitle: "Vendor's invoice for an open PO — posts GRN + bill",
        onTap: () => Navigator.pop(context, ShareDestination.receiveAgainstPo),
      ),
      _Tile(
        icon: Icons.qr_code_scanner_outlined,
        tint: const Color(0xFF0891B2),
        title: 'Payment made',
        subtitle: 'UPI/QR payment you made — logs it to match your bank',
        onTap: () => Navigator.pop(context, ShareDestination.quickPayment),
      ),
    ];
  }
}

/// The prominent, one-tap default option — vendor bill covers the large
/// majority of share-ins, so it gets a filled hero button instead of
/// competing as just another list tile.
class _PrimaryTile extends StatelessWidget {
  final IconData icon;
  final String title, subtitle;
  final VoidCallback onTap;
  const _PrimaryTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: Material(
        color: RunqColors.indigo,
        borderRadius: BorderRadius.circular(14),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Container(
                  width: 44, height: 44,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.16),
                    borderRadius: BorderRadius.circular(11),
                  ),
                  child: Icon(icon, color: Colors.white, size: 22),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: RunqText.bodyStrong.copyWith(color: Colors.white)),
                      const SizedBox(height: 2),
                      Text(
                        subtitle,
                        style: RunqText.caption.copyWith(color: Colors.white.withValues(alpha: 0.85)),
                      ),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right, size: 20, color: Colors.white),
              ],
            ),
          ),
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
