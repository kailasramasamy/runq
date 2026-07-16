import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/farmer_providers.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_charts.dart';
import '../../widgets/dhenu_toast.dart';
import '../../widgets/gradient_hero_card.dart';
import 'farmer_insights.dart';

/// Rewards screen — streak card, badge grid, referral hook (spec §6.5).
class FarmerRewards extends ConsumerWidget {
  const FarmerRewards({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final pours = ref.watch(farmerMonthPoursProvider).asData?.value ?? [];
    final streak = computeStreak(
        ref.watch(farmerStreakPoursProvider).asData?.value ?? const []);

    return Scaffold(
      backgroundColor: t.surface,
      appBar: AppBar(
        leading: IconButton(
          icon: Icon(DhenuIcons.chevronLeft, color: t.ink),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Text(l.farmerRewardsTitle, style: DhenuText.h2.copyWith(color: t.ink)),
        backgroundColor: t.surface,
        foregroundColor: t.ink,
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(farmerMonthPoursProvider);
          ref.invalidate(farmerStreakPoursProvider);
          await ref.read(farmerStreakPoursProvider.future);
        },
        child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.all(DhenuSpacing.screen),
        children: [
          _streakCard(context, t, l, streak),
          const SizedBox(height: DhenuSpacing.xxl),
          Text(l.farmerRewardsBadgesSection,
              style: DhenuText.title.copyWith(color: t.ink, fontWeight: FontWeight.w700)),
          const SizedBox(height: DhenuSpacing.md),
          _badgesGrid(t, l, streak, pours),
          const SizedBox(height: DhenuSpacing.xxl),
          _referralCard(context, l),
          const SizedBox(height: DhenuSpacing.x4),
        ],
        ),
      ),
    );
  }

  // ── Streak card ──────────────────────────────────────────────────────────
  Widget _streakCard(BuildContext context, DhenuTokens t, AppLocalizations l, int streak) {
    const target = 10;
    final remaining = (target - streak).clamp(0, target);

    return DhenuCard(
      elevated: true,
      padding: const EdgeInsets.all(DhenuSpacing.xl),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          _streakRing(t, l, streak, target),
          const SizedBox(width: DhenuSpacing.lg),
          Expanded(child: _streakText(t, l, streak, remaining)),
        ],
      ),
    );
  }

  Widget _streakRing(DhenuTokens t, AppLocalizations l, int streak, int target) {
    return ProgressRing(
      progress: streak / target,
      color: t.gradeA,
      size: 92,
      strokeWidth: 7,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            '$streak',
            style: DhenuText.number(size: 28, w: FontWeight.w800, color: t.gradeA),
          ),
          Text(l.farmerRewardsStreakDays(target),
              style: DhenuText.caption.copyWith(color: t.inkSoft)),
        ],
      ),
    );
  }

  Widget _streakText(DhenuTokens t, AppLocalizations l, int streak, int remaining) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(l.farmerRewardsQualityStreak, style: DhenuText.title.copyWith(color: t.ink)),
        const SizedBox(height: DhenuSpacing.xs),
        Text(
          remaining == 0 ? l.farmerRewardsBonusUnlocked : l.farmerRewardsStreakRemaining(remaining),
          style: DhenuText.caption.copyWith(color: t.inkSoft),
        ),
      ],
    );
  }

  // ── Badges grid ──────────────────────────────────────────────────────────
  Widget _badgesGrid(DhenuTokens t, AppLocalizations l, int streak, List<MpPour> pours) {
    final badges = _buildBadges(l, streak, pours);
    return GridView.count(
      crossAxisCount: 2,
      crossAxisSpacing: DhenuSpacing.md,
      mainAxisSpacing: DhenuSpacing.md,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      childAspectRatio: 1.1,
      children: badges.map((b) => _badgeTile(t, l, b)).toList(),
    );
  }

  List<_BadgeData> _buildBadges(AppLocalizations l, int streak, List<MpPour> pours) => [
        _BadgeData(
          icon: DhenuIcons.medal,
          name: l.farmerRewardsBadgeConsistent,
          unlocked: streak >= 7,
        ),
        _BadgeData(
          icon: DhenuIcons.calendar,
          name: l.farmerRewardsBadge100Day,
          unlocked: false,
        ),
        _BadgeData(
          icon: DhenuIcons.beaker,
          name: l.farmerRewardsBadgeTopFat,
          unlocked: _hasTopFat(pours),
        ),
        _BadgeData(
          icon: DhenuIcons.userPlus,
          name: l.farmerRewardsBadgeReferrer,
          unlocked: false,
        ),
      ];

  Widget _badgeTile(DhenuTokens t, AppLocalizations l, _BadgeData badge) {
    final chip = Container(
      padding: const EdgeInsets.all(DhenuSpacing.md),
      decoration: BoxDecoration(
        color: badge.unlocked ? t.brandSubtle : Colors.transparent,
        borderRadius: BorderRadius.circular(DhenuRadii.input),
        border: badge.unlocked ? null : Border.all(color: t.hairline),
      ),
      child: Icon(
        badge.icon,
        size: 44,
        color: badge.unlocked ? t.brand : t.inkSoft,
      ),
    );

    final statusLabel = Text(
      badge.unlocked ? l.farmerRewardsBadgeUnlocked : l.farmerRewardsBadgeLocked,
      style: DhenuText.caption.copyWith(
        color: badge.unlocked ? t.gradeA : t.inkSoft,
        fontWeight: FontWeight.w700,
      ),
    );

    final content = DhenuCard(
      padding: const EdgeInsets.symmetric(
        horizontal: DhenuSpacing.md,
        vertical: DhenuSpacing.lg,
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          chip,
          const SizedBox(height: DhenuSpacing.sm),
          Text(
            badge.name,
            style: DhenuText.label.copyWith(color: t.ink),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: DhenuSpacing.xs),
          statusLabel,
        ],
      ),
    );

    if (badge.unlocked) return content;
    return Opacity(opacity: 0.62, child: content);
  }

  // ── Referral card ────────────────────────────────────────────────────────
  Widget _referralCard(BuildContext context, AppLocalizations l) {
    const white = Colors.white;
    final white80 = Colors.white.withValues(alpha: 0.8);

    return GradientHeroCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(l.farmerRewardsReferTitle, style: DhenuText.title.copyWith(color: white)),
          const SizedBox(height: DhenuSpacing.xs),
          Text(
            l.farmerRewardsReferBody,
            style: DhenuText.body.copyWith(color: white80),
          ),
          const SizedBox(height: DhenuSpacing.lg),
          FilledButton.icon(
            onPressed: () => _share(context, l),
            icon: const Icon(DhenuIcons.share, size: 18),
            label: Text(l.farmerRewardsShareInvite),
            style: FilledButton.styleFrom(
              backgroundColor: Colors.white,
              foregroundColor: DhenuColors.brand,
              minimumSize: const Size.fromHeight(DhenuSpacing.minTap),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(DhenuRadii.button),
              ),
              textStyle: DhenuText.button,
            ),
          ),
        ],
      ),
    );
  }

  void _share(BuildContext context, AppLocalizations l) {
    showDhenuToast(context, l.farmerRewardsReferralComingSoon, type: DhenuToastType.info);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  bool _hasTopFat(List<MpPour> pours) =>
      pours.where((p) => (p.fat ?? 0) >= 5.0).length >= 3;
}

class _BadgeData {
  final IconData icon;
  final String name;
  final bool unlocked;
  const _BadgeData({required this.icon, required this.name, required this.unlocked});
}
