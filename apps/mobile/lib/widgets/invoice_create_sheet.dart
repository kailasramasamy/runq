import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../services/po_intake.dart';
import '../theme/runq_tokens.dart';
import '../theme/runq_theme.dart';

/// Bottom-sheet chooser for creating an invoice. Mirrors the admin-panel
/// "New invoice" menu but adds a third "Upload" option for parity with the
/// existing PO-intake flow on mobile.
Future<void> showInvoiceCreateSheet(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    backgroundColor: RT(context).surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
    ),
    builder: (_) => const _InvoiceCreateSheet(),
  );
}

class _InvoiceCreateSheet extends StatelessWidget {
  const _InvoiceCreateSheet();

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
              icon: Icons.inbox_outlined,
              tint: RunqColors.indigo,
              title: 'Create invoice from PO',
              subtitle: 'Pick a customer PO — AI extracts and drafts the invoice',
              onTap: () {
                Navigator.pop(context);
                WidgetsBinding.instance.addPostFrameCallback((_) {
                  if (context.mounted) startPoIntake(context);
                });
              },
            ),
            _Tile(
              icon: Icons.note_add_outlined,
              tint: const Color(0xFF06B6D4),
              title: 'Create blank invoice',
              subtitle: 'Pick a customer, add items, and save',
              onTap: () {
                Navigator.pop(context);
                WidgetsBinding.instance.addPostFrameCallback((_) {
                  if (context.mounted) context.push('/invoices/new');
                });
              },
            ),
            _Tile(
              icon: Icons.bolt_outlined,
              tint: RunqColors.amberInk,
              title: 'Quick invoice',
              subtitle: 'Pick a saved template, set quantities, and generate',
              onTap: () {
                Navigator.pop(context);
                WidgetsBinding.instance.addPostFrameCallback((_) {
                  if (context.mounted) context.push('/quick-invoice/templates');
                });
              },
            ),
            _Tile(
              icon: Icons.upload_file_outlined,
              tint: RunqColors.accent,
              title: 'Upload invoice',
              subtitle: 'Pick a PDF or image — AI extracts and drafts the invoice',
              onTap: () {
                Navigator.pop(context);
                WidgetsBinding.instance.addPostFrameCallback((_) {
                  if (context.mounted) startPoIntake(context);
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
