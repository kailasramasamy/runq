// The action sheet behind the Awaiting-dispatch app bar. Every other module
// offers a choice of actions in a bottom sheet, so this one does too.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../providers/inventory_providers.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import '../inventory_bulk_dispatch.dart';
import 'inv_colors.dart';

/// The two ways to empty this queue, offered the way every other module
/// offers a choice of actions — a bottom sheet, not an app-bar popup.
///
/// They are not variations of each other: one ships the goods, the other says
/// they left before inventory existed. The sheet gives each a line of its own
/// to say so, and keeps the irreversible one off the edge of the screen.
Future<void> showQueueActionsSheet(
  BuildContext context,
  WidgetRef ref, {
  required int pendingTotal,
}) async {
  final choice = await showModalBottomSheet<_QueueAction>(
    context: context,
    backgroundColor: RT(context).surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
    ),
    builder: (_) => const _QueueActionsSheet(),
  );
  if (choice == null || !context.mounted) return;
  switch (choice) {
    case _QueueAction.dispatch:
      await runBulkDispatch(
        context, ref, pendingTotal: pendingTotal, from: invPendingDispatchFrom());
    case _QueueAction.waive:
      await runWaiveDispatch(context, ref, pendingTotal: pendingTotal);
  }
}

enum _QueueAction { dispatch, waive }

class _QueueActionsSheet extends StatelessWidget {
  const _QueueActionsSheet();

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
              decoration: BoxDecoration(
                color: t.hairline, borderRadius: BorderRadius.circular(2)),
            ),
            const SizedBox(height: 14),
            _ActionTile(
              icon: Icons.local_shipping_outlined,
              tint: InvColors.brand(context),
              title: 'Dispatch all',
              subtitle: 'Moves stock and posts the cost of goods',
              onTap: () => Navigator.pop(context, _QueueAction.dispatch),
            ),
            _ActionTile(
              icon: Icons.playlist_remove,
              tint: InvColors.amberDeep,
              title: 'Clear without stock',
              subtitle: 'For invoices raised before you tracked stock — '
                  'no stock moves, no cost posts',
              onTap: () => Navigator.pop(context, _QueueAction.waive),
            ),
            const SizedBox(height: 4),
          ],
        ),
      ),
    );
  }
}

class _ActionTile extends StatelessWidget {
  const _ActionTile({
    required this.icon,
    required this.tint,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });
  final IconData icon;
  final Color tint;
  final String title, subtitle;
  final VoidCallback onTap;

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
                  Text(title, style: RunqText.bodyStrong.copyWith(color: t.ink)),
                  const SizedBox(height: 2),
                  Text(subtitle, style: RunqText.caption.copyWith(color: t.muted)),
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
