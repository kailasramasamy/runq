import 'package:flutter/material.dart';
import '../theme/dhenu_icons.dart';
import '../theme/dhenu_tokens.dart';
import '../theme/dhenu_theme.dart';
import '../l10n/app_localizations.dart';

/// Centered empty state — a 96px rounded chip in [color] (brand by default),
/// title, optional subtitle + action (CTA).
class DhenuEmptyState extends StatelessWidget {
  const DhenuEmptyState({
    super.key,
    required this.icon,
    required this.title,
    this.subtitle,
    this.action,
    this.color,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget? action;

  /// Chip fill + icon tint. Defaults to brand.
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final c = color ?? t.brand;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(DhenuSpacing.x4),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 96,
              height: 96,
              decoration: BoxDecoration(
                color: c.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(DhenuRadii.cardLg),
              ),
              child: Icon(icon, size: 40, color: c),
            ),
            const SizedBox(height: DhenuSpacing.lg),
            Text(
              title,
              style: DhenuText.title.copyWith(color: t.ink, fontWeight: FontWeight.w700),
              textAlign: TextAlign.center,
            ),
            if (subtitle != null) ...[
              const SizedBox(height: DhenuSpacing.sm),
              Text(
                subtitle!,
                style: DhenuText.body.copyWith(color: t.inkSoft),
                textAlign: TextAlign.center,
              ),
            ],
            if (action != null) ...[
              const SizedBox(height: DhenuSpacing.xl),
              action!,
            ],
          ],
        ),
      ),
    );
  }
}

/// Centered error state — gradeC warning chip + a Retry button.
class DhenuErrorState extends StatelessWidget {
  const DhenuErrorState({
    super.key,
    this.title,
    this.subtitle,
    required this.onRetry,
  });

  /// Localized defaults apply when null.
  final String? title;
  final String? subtitle;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return DhenuEmptyState(
      icon: DhenuIcons.warning,
      color: DT(context).gradeC,
      title: title ?? l.commonErrorTitle,
      subtitle: subtitle ?? l.commonErrorSubtitle,
      action: FilledButton.icon(
        onPressed: onRetry,
        icon: const Icon(DhenuIcons.refresh, size: 18),
        label: Text(l.commonRetry),
      ),
    );
  }
}

/// Skeleton loading list — static rounded grey placeholder rows.
/// No animation needed; just faint hairline-coloured bars.
class DhenuLoadingList extends StatelessWidget {
  const DhenuLoadingList({super.key, this.rows = 5});

  final int rows;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(rows, (i) => _SkeletonRow(t: t, index: i)),
    );
  }
}

class _SkeletonRow extends StatelessWidget {
  const _SkeletonRow({required this.t, required this.index});

  final DhenuTokens t;
  final int index;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: DhenuSpacing.screen,
        vertical: DhenuSpacing.md,
      ),
      child: Row(
        children: [
          // Avatar placeholder
          Container(
            width: DhenuSpacing.x4,
            height: DhenuSpacing.x4,
            decoration: BoxDecoration(
              color: t.hairline,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: DhenuSpacing.md),
          // Text placeholder lines
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                _Bar(t: t, width: 0.55 + (index % 3) * 0.1, height: 14),
                const SizedBox(height: DhenuSpacing.sm),
                _Bar(t: t, width: 0.35 + (index % 2) * 0.1, height: 10),
              ],
            ),
          ),
          const SizedBox(width: DhenuSpacing.md),
          // Trailing number placeholder
          _Bar(t: t, width: 48, height: 16, fixedWidth: true),
        ],
      ),
    );
  }
}

class _Bar extends StatelessWidget {
  const _Bar({
    required this.t,
    required this.width,
    required this.height,
    this.fixedWidth = false,
  });

  final DhenuTokens t;

  /// If fixedWidth, treated as px; otherwise fraction of parent.
  final double width;
  final double height;
  final bool fixedWidth;

  @override
  Widget build(BuildContext context) {
    return fixedWidth
        ? Container(
            width: width,
            height: height,
            decoration: BoxDecoration(
              color: t.hairline,
              borderRadius: BorderRadius.circular(DhenuRadii.pill),
            ),
          )
        : FractionallySizedBox(
            widthFactor: width,
            child: Container(
              height: height,
              decoration: BoxDecoration(
                color: t.hairline,
                borderRadius: BorderRadius.circular(DhenuRadii.pill),
              ),
            ),
          );
  }
}

/// Full-width inline offline banner — calm, never alarming.
class DhenuOfflineBanner extends StatelessWidget {
  const DhenuOfflineBanner({super.key, this.onRetry});

  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(
        horizontal: DhenuSpacing.screen,
        vertical: DhenuSpacing.md,
      ),
      color: t.hairline,
      child: Row(
        children: [
          Icon(DhenuIcons.cloudOff, size: 18, color: t.inkSoft),
          const SizedBox(width: DhenuSpacing.sm),
          Expanded(
            child: Text(
              AppLocalizations.of(context).commonOfflineSaved,
              style: DhenuText.body.copyWith(color: t.inkSoft),
            ),
          ),
          if (onRetry != null)
            TextButton(
              onPressed: onRetry,
              style: TextButton.styleFrom(
                foregroundColor: t.brand,
                minimumSize: const Size(44, 44),
                padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.md),
              ),
              child: Text(AppLocalizations.of(context).commonRetry, style: DhenuText.label.copyWith(color: t.brand)),
            ),
        ],
      ),
    );
  }
}
