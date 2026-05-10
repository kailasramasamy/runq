import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../theme/runq_tokens.dart';
import '../theme/runq_theme.dart';
import 'invoice_create_sheet.dart';

/// Two-row chooser shown when the user taps the "Invoice" quick-action tile
/// on the dashboard. Splits the FAB-style "create" entry from the read-only
/// "view recent" path so the tile feels like an action hub, not a navigator.
Future<void> showInvoiceQuickSheet(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    backgroundColor: RT(context).surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
    ),
    builder: (_) => const _InvoiceQuickSheet(),
  );
}

class _InvoiceQuickSheet extends StatelessWidget {
  const _InvoiceQuickSheet();

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(8, 8, 8, 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40, height: 4,
              decoration: BoxDecoration(color: t.hairline, borderRadius: BorderRadius.circular(2)),
            ),
            const SizedBox(height: 14),
            _Tile(
              icon: Icons.add_circle_outline_rounded,
              tint: const Color(0xFF06B6D4),
              title: 'Create invoice',
              subtitle: 'From a PO, blank, or upload a file',
              onTap: () {
                Navigator.pop(context);
                WidgetsBinding.instance.addPostFrameCallback((_) {
                  if (context.mounted) showInvoiceCreateSheet(context);
                });
              },
            ),
            _Tile(
              icon: Icons.receipt_long_outlined,
              tint: RunqColors.indigo,
              title: 'View recent invoices',
              subtitle: 'Open the invoices list',
              onTap: () {
                Navigator.pop(context);
                WidgetsBinding.instance.addPostFrameCallback((_) {
                  if (context.mounted) context.push('/sales/invoices');
                });
              },
            ),
            const SizedBox(height: 4),
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
  const _Tile({required this.icon, required this.tint, required this.title, required this.subtitle, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        child: Row(
          children: [
            Container(
              width: 40, height: 40,
              decoration: BoxDecoration(color: tint.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(10)),
              child: Icon(icon, color: tint, size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: RunqText.bodyStrong.copyWith(color: t.ink)),
                  const SizedBox(height: 2),
                  Text(subtitle, style: RunqText.caption.copyWith(color: t.muted, fontSize: 12)),
                ],
              ),
            ),
            Icon(Icons.chevron_right_rounded, color: t.muted2),
          ],
        ),
      ),
    );
  }
}
