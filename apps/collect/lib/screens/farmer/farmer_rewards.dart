import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../providers/farmer_providers.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_charts.dart';
import '../../widgets/dhenu_toast.dart';
import '../../widgets/gradient_hero_card.dart';

/// Rewards screen — streak card, badge grid, referral hook (spec §6.5).
class FarmerRewards extends ConsumerWidget {
  const FarmerRewards({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    final pours = ref.watch(farmerMonthPoursProvider).asData?.value ?? [];
    final streak = _computeStreak(pours);

    return Scaffold(
      backgroundColor: t.surface,
      appBar: AppBar(
        leading: IconButton(
          icon: Icon(DhenuIcons.chevronLeft, color: t.ink),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Text('Rewards', style: DhenuText.h2.copyWith(color: t.ink)),
        backgroundColor: t.surface,
        foregroundColor: t.ink,
      ),
      body: ListView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.all(DhenuSpacing.screen),
        children: [
          _streakCard(context, t, streak),
          const SizedBox(height: DhenuSpacing.xxl),
          Text('Badges', style: DhenuText.title.copyWith(color: t.ink, fontWeight: FontWeight.w700)),
          const SizedBox(height: DhenuSpacing.md),
          _badgesGrid(t, streak, pours),
          const SizedBox(height: DhenuSpacing.xxl),
          _referralCard(context),
          const SizedBox(height: DhenuSpacing.x4),
        ],
      ),
    );
  }

  // ── Streak card ──────────────────────────────────────────────────────────
  Widget _streakCard(BuildContext context, DhenuTokens t, int streak) {
    const target = 10;
    final remaining = (target - streak).clamp(0, target);

    return DhenuCard(
      elevated: true,
      padding: const EdgeInsets.all(DhenuSpacing.xl),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          _streakRing(t, streak, target),
          const SizedBox(width: DhenuSpacing.lg),
          Expanded(child: _streakText(t, streak, remaining)),
        ],
      ),
    );
  }

  Widget _streakRing(DhenuTokens t, int streak, int target) {
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
          Text('/ $target days', style: DhenuText.caption.copyWith(color: t.inkSoft)),
        ],
      ),
    );
  }

  Widget _streakText(DhenuTokens t, int streak, int remaining) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text('Quality Streak', style: DhenuText.title.copyWith(color: t.ink)),
        const SizedBox(height: DhenuSpacing.xs),
        Text(
          remaining == 0
              ? 'Bonus unlocked — keep it going!'
              : '$remaining more to unlock a ₹500 bonus',
          style: DhenuText.caption.copyWith(color: t.inkSoft),
        ),
      ],
    );
  }

  // ── Badges grid ──────────────────────────────────────────────────────────
  Widget _badgesGrid(DhenuTokens t, int streak, List<MpPour> pours) {
    final badges = _buildBadges(streak, pours);
    return GridView.count(
      crossAxisCount: 2,
      crossAxisSpacing: DhenuSpacing.md,
      mainAxisSpacing: DhenuSpacing.md,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      childAspectRatio: 1.1,
      children: badges.map((b) => _badgeTile(t, b)).toList(),
    );
  }

  List<_BadgeData> _buildBadges(int streak, List<MpPour> pours) => [
        _BadgeData(
          icon: DhenuIcons.medal,
          name: 'Consistent',
          unlocked: streak >= 7,
        ),
        _BadgeData(
          icon: DhenuIcons.calendar,
          name: '100-Day Club',
          unlocked: false,
        ),
        _BadgeData(
          icon: DhenuIcons.beaker,
          name: 'Top FAT',
          unlocked: _hasTopFat(pours),
        ),
        _BadgeData(
          icon: DhenuIcons.userPlus,
          name: 'Referrer',
          unlocked: false,
        ),
      ];

  Widget _badgeTile(DhenuTokens t, _BadgeData badge) {
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

    final label = Text(
      badge.unlocked ? 'UNLOCKED' : 'LOCKED',
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
          label,
        ],
      ),
    );

    if (badge.unlocked) return content;
    return Opacity(opacity: 0.62, child: content);
  }

  // ── Referral card ────────────────────────────────────────────────────────
  Widget _referralCard(BuildContext context) {
    const white = Colors.white;
    final white80 = Colors.white.withValues(alpha: 0.8);

    return GradientHeroCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('Refer a farmer', style: DhenuText.title.copyWith(color: white)),
          const SizedBox(height: DhenuSpacing.xs),
          Text(
            'Earn ₹100 for every farmer who joins',
            style: DhenuText.body.copyWith(color: white80),
          ),
          const SizedBox(height: DhenuSpacing.lg),
          FilledButton.icon(
            onPressed: () => _share(context),
            icon: const Icon(DhenuIcons.share, size: 18),
            label: const Text('Share invite'),
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

  void _share(BuildContext context) {
    showDhenuToast(context, 'Referral invite coming soon!', type: DhenuToastType.info);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  int _computeStreak(List<MpPour> pours) {
    if (pours.isEmpty) return 0;
    final byDate = <String, List<MpPour>>{};
    for (final p in pours) {
      byDate.putIfAbsent(p.collectionDate, () => []).add(p);
    }
    final sorted = byDate.keys.toList()..sort((a, b) => b.compareTo(a));
    var streak = 0;
    for (final d in sorted) {
      if (!byDate[d]!.every((p) => p.qualityGrade == Grade.a)) break;
      streak++;
    }
    return streak;
  }

  bool _hasTopFat(List<MpPour> pours) =>
      pours.where((p) => (p.fat ?? 0) >= 5.0).length >= 3;
}

class _BadgeData {
  final IconData icon;
  final String name;
  final bool unlocked;
  const _BadgeData({required this.icon, required this.name, required this.unlocked});
}
