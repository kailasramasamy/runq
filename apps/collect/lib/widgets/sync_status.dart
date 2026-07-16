import 'package:flutter/material.dart';
import '../l10n/app_localizations.dart';
import '../theme/dhenu_icons.dart';
import '../theme/dhenu_tokens.dart';
import '../theme/dhenu_theme.dart';

enum SyncState { synced, pending, offline, failed }

/// Calm tappable chip for the header showing sync state.
///
/// - synced: "● Synced 2m ago" (green dot)
/// - pending: "3 to send" (amber, hourglass icon)
/// - offline: "Offline — saved on device" (inkSoft, cloud-off icon)
/// - failed: "1 failed — needs attention" (gradeC, warning icon) — rejected pours that
///   will never auto-retry; they stay visible and keep blocking shift close.
class SyncStatus extends StatelessWidget {
  const SyncStatus({
    super.key,
    required this.state,
    this.pendingCount = 0,
    this.failedCount = 0,
    this.agoLabel,
    this.onTap,
  });

  final SyncState state;
  final int pendingCount;
  final int failedCount;

  /// e.g. "2m ago" — used when state is synced.
  final String? agoLabel;

  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final content = _buildContent(t, AppLocalizations.of(context));

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

  List<Widget> _buildContent(DhenuTokens t, AppLocalizations l) {
    switch (state) {
      case SyncState.failed:
        return [
          Icon(DhenuIcons.warning, size: 12, color: t.gradeC),
          const SizedBox(width: DhenuSpacing.xs),
          Text(
            l.syncFailedLabel(failedCount),
            style: DhenuText.caption.copyWith(color: t.gradeC),
          ),
        ];

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
            agoLabel != null ? l.syncSyncedAgoLabel(agoLabel!) : l.syncSyncedLabel,
            style: DhenuText.caption.copyWith(color: t.inkSoft),
          ),
        ];

      case SyncState.pending:
        return [
          Icon(DhenuIcons.transit, size: 12, color: t.gradeB),
          const SizedBox(width: DhenuSpacing.xs),
          Text(
            l.syncToSendLabel(pendingCount),
            style: DhenuText.caption.copyWith(color: t.gradeB),
          ),
        ];

      case SyncState.offline:
        return [
          Icon(DhenuIcons.cloudOff, size: 12, color: t.inkSoft),
          const SizedBox(width: DhenuSpacing.xs),
          Text(
            l.syncOfflineLabel,
            style: DhenuText.caption.copyWith(color: t.inkSoft),
          ),
        ];
    }
  }
}
