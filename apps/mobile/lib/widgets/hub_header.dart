import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/auth_provider.dart';
import '../providers/data_providers.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import 'gradient_avatar.dart';

/// Shared header used across all section hubs (Sales, Purchases, Money).
///
/// Mirrors the dashboard header — eyebrow + title on the left, search /
/// notifications / avatar on the right — so the four shell tabs feel like
/// the same surface with different content.
class HubHeader extends ConsumerWidget {
  final String eyebrow;
  final String title;
  const HubHeader({super.key, required this.eyebrow, required this.title});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final user = ref.watch(authProvider).user;
    final approvals = ref.watch(pendingApprovalsProvider);
    final hasNotifications =
        approvals.maybeWhen(data: (l) => l.isNotEmpty, orElse: () => false);

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 16, 16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(eyebrow, style: RunqText.body.copyWith(color: t.muted)),
                Text(
                  title,
                  style: RunqText.h2.copyWith(color: t.ink),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          _IconChip(icon: Icons.search_rounded, onTap: () => context.push('/search')),
          const SizedBox(width: 8),
          _IconChip(
            icon: Icons.notifications_none_rounded,
            badge: hasNotifications,
            onTap: () => context.push('/approvals'),
          ),
          const SizedBox(width: 8),
          InkWell(
            onTap: () => context.push('/profile'),
            borderRadius: BorderRadius.circular(12),
            child: GradientAvatar(name: user?.name ?? user?.email ?? '?', size: 36),
          ),
        ],
      ),
    );
  }
}

class _IconChip extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  final bool badge;
  const _IconChip({required this.icon, required this.onTap, this.badge = false});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: t.surface,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: t.hairline, width: 0.5),
            ),
            alignment: Alignment.center,
            child: Icon(icon, size: 18, color: t.ink),
          ),
          if (badge)
            Positioned(
              right: 8,
              top: 8,
              child: Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: RunqColors.redInk,
                  shape: BoxShape.circle,
                  border: Border.all(color: t.surface, width: 1.5),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
