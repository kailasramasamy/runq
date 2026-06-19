import 'package:flutter/material.dart';
import '../theme/dhenu_tokens.dart';
import '../theme/dhenu_theme.dart';

enum SyncState { synced, pending, offline }

/// Calm tappable chip for the header showing sync state.
///
/// - synced: "● Synced 2m ago" (green dot)
/// - pending: "⏳ 3 to send" (amber)
/// - offline: "⚠ Offline — saved on device" (inkSoft)
class SyncStatus extends StatelessWidget {
  const SyncStatus({
    super.key,
    required this.state,
    this.pendingCount = 0,
    this.agoLabel,
    this.onTap,
  });

  final SyncState state;
  final int pendingCount;

  /// e.g. "2m ago" — used when state is synced.
  final String? agoLabel;

  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final content = _buildContent(t);

    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: DhenuSpacing.md,
          vertical: DhenuSpacing.xs,
        ),
        decoration: BoxDecoration(
          color: t.hairline,
          borderRadius: BorderRadius.circular(DhenuRadii.pill),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: content,
        ),
      ),
    );
  }

  List<Widget> _buildContent(DhenuTokens t) {
    switch (state) {
      case SyncState.synced:
        return [
          Container(
            width: 7,
            height: 7,
            decoration: BoxDecoration(
              color: t.gradeA,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: DhenuSpacing.xs),
          Text(
            agoLabel != null ? 'Synced $agoLabel' : 'Synced',
            style: DhenuText.caption.copyWith(color: t.inkSoft),
          ),
        ];

      case SyncState.pending:
        return [
          Text('⏳', style: DhenuText.caption),
          const SizedBox(width: DhenuSpacing.xs),
          Text(
            '$pendingCount to send',
            style: DhenuText.caption.copyWith(color: t.gradeB),
          ),
        ];

      case SyncState.offline:
        return [
          Text('⚠', style: DhenuText.caption.copyWith(color: t.inkSoft)),
          const SizedBox(width: DhenuSpacing.xs),
          Text(
            'Offline — saved on device',
            style: DhenuText.caption.copyWith(color: t.inkSoft),
          ),
        ];
    }
  }
}
