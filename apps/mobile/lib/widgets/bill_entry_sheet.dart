import 'package:flutter/material.dart';
import '../theme/runq_tokens.dart';
import '../theme/runq_theme.dart';

enum BillEntryChoice { scan, photos, files, recent }

/// Bottom-sheet chooser for adding a bill. Returns the user's pick (or null
/// if dismissed). The caller dispatches to the right capture flow — this
/// widget does not navigate.
Future<BillEntryChoice?> showBillEntrySheet(BuildContext context) {
  return showModalBottomSheet<BillEntryChoice>(
    context: context,
    backgroundColor: RT(context).surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
    ),
    builder: (_) => const _BillEntrySheet(),
  );
}

class _BillEntrySheet extends StatelessWidget {
  const _BillEntrySheet();

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
              icon: Icons.document_scanner_outlined,
              tint: RunqColors.indigo,
              title: 'Scan a bill',
              subtitle: 'Capture with edge detection — AI extracts fields',
              onTap: () => Navigator.pop(context, BillEntryChoice.scan),
            ),
            _Tile(
              icon: Icons.photo_library_outlined,
              tint: const Color(0xFF06B6D4),
              title: 'From Photos',
              subtitle: 'Pick a bill image from your photo library',
              onTap: () => Navigator.pop(context, BillEntryChoice.photos),
            ),
            _Tile(
              icon: Icons.folder_open_rounded,
              tint: RunqColors.accent,
              title: 'From Files',
              subtitle: 'iCloud, Dropbox, Drive, on-device — PDFs and images',
              onTap: () => Navigator.pop(context, BillEntryChoice.files),
            ),
            // Tinted background sets the "view existing" tile apart from the
            // capture actions above.
            _Tile(
              icon: Icons.receipt_long_outlined,
              tint: RunqColors.greenInk,
              title: 'Recent bills',
              subtitle: "View and manage bills you've already added",
              background: t.bgWarm,
              onTap: () => Navigator.pop(context, BillEntryChoice.recent),
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
  /// When set, the tile gets a filled background — used to visually group
  /// "view existing" entries apart from the create/capture actions.
  final Color? background;
  const _Tile({required this.icon, required this.tint, required this.title, required this.subtitle, required this.onTap, this.background});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final tile = InkWell(
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
    if (background == null) return tile;
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 2),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(12),
      ),
      child: tile,
    );
  }
}
