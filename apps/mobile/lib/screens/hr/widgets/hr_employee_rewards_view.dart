// Celebratory employee-facing rewards view.
//
// Shown instead of the manager list when isManager == false. Highlights
// newly-received rewards (approved within the last 7 days) with a hero card
// and a confetti burst on first render. Older rewards appear in a history
// section below.

library;

import 'package:confetti/confetti.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../api/hr_models.dart';
import '../../../providers/hr_providers.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'hr_colors.dart';
import 'hr_redeem_points_sheet.dart';
import 'hr_widgets.dart';

/// Per-device set of reward IDs whose confetti has already played. Lets the
/// celebration fire once per reward — not on every visit while the reward
/// is still inside the 7-day "new" window.
const _seenConfettiKey = 'hr_rewards_confetti_seen';

// ─── Public entry point ───────────────────────────────────────────────────

class HrEmployeeRewardsView extends ConsumerStatefulWidget {
  final List<HrReward> rewards;
  final Future<void> Function() onRefresh;

  const HrEmployeeRewardsView({
    super.key,
    required this.rewards,
    required this.onRefresh,
  });

  @override
  ConsumerState<HrEmployeeRewardsView> createState() =>
      _HrEmployeeRewardsViewState();
}

class _HrEmployeeRewardsViewState
    extends ConsumerState<HrEmployeeRewardsView> {
  late final ConfettiController _confetti;

  @override
  void initState() {
    super.initState();
    _confetti = ConfettiController(duration: const Duration(seconds: 3));
    _celebrateUnseen();
  }

  /// Fire confetti only for rewards the user has never seen here before.
  /// "Seen" is per-device in SharedPreferences — if the screen is reopened,
  /// the same reward never re-celebrates. New rewards arriving later do.
  Future<void> _celebrateUnseen() async {
    final newly =
        widget.rewards.where((r) => r.isNewlyReceived).toList();
    if (newly.isEmpty) return;

    final prefs = await SharedPreferences.getInstance();
    final seen =
        (prefs.getStringList(_seenConfettiKey) ?? const <String>[]).toSet();
    final firstTime = newly.where((r) => !seen.contains(r.id)).toList();
    if (firstTime.isEmpty) return;

    if (!mounted) return;
    _confetti.play();

    seen.addAll(newly.map((r) => r.id));
    await prefs.setStringList(_seenConfettiKey, seen.toList());
  }

  @override
  void dispose() {
    _confetti.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Rejected rewards are kept private between the initiating manager and
    // HR — the recipient never sees a "you almost got a reward" entry.
    final visible =
        widget.rewards.where((r) => r.status != 'rejected').toList();
    final newly = visible.where((r) => r.isNewlyReceived).toList();
    final history = visible.where((r) => !r.isNewlyReceived).toList();

    return Stack(
      children: [
        RefreshIndicator(
          color: HrColors.brand(context),
          onRefresh: widget.onRefresh,
          child: visible.isEmpty
              ? _emptyState(context)
              : _scrollBody(context, newly, history),
        ),
        // Confetti anchored at top-center, blasting downward.
        Align(
          alignment: Alignment.topCenter,
          child: ConfettiWidget(
            confettiController: _confetti,
            blastDirection: 1.5708, // π/2 = downward
            emissionFrequency: 0.05,
            numberOfParticles: 20,
            gravity: 0.1,
            colors: const [
              Color(0xFF0891B2),
              Color(0xFF06B6D4),
              Color(0xFFF59E0B),
              Color(0xFF10B981),
              Color(0xFF8B5CF6),
            ],
          ),
        ),
      ],
    );
  }

  Widget _emptyState(BuildContext context) {
    final t = RT(context);
    return ListView(
      physics:
          const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 120),
      children: [
        _PointsBalanceCard(parentRef: ref),
        const SizedBox(height: 32),
        Icon(Icons.star_outline_rounded, size: 44, color: t.muted2),
        const SizedBox(height: 12),
        Center(
          child: Text(
            'No rewards yet',
            style: RunqText.bodyStrong.copyWith(color: t.ink),
          ),
        ),
        const SizedBox(height: 4),
        Center(
          child: Text(
            'Recognition from your manager will appear here.',
            textAlign: TextAlign.center,
            style: RunqText.caption.copyWith(color: t.muted),
          ),
        ),
      ],
    );
  }

  Widget _scrollBody(
    BuildContext context,
    List<HrReward> newly,
    List<HrReward> history,
  ) {
    final hero = newly.isNotEmpty ? newly.first : null;
    final restNew = newly.length > 1 ? newly.sublist(1) : <HrReward>[];

    return ListView(
      physics:
          const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 120),
      children: [
        _PointsBalanceCard(parentRef: ref),
        const SizedBox(height: 16),
        if (hero != null) ...[
          _HeroRewardCard(reward: hero),
          const SizedBox(height: 16),
        ],
        if (restNew.isNotEmpty) ...[
          _EmpSectionHeader(label: 'Recent rewards', count: restNew.length),
          const SizedBox(height: 8),
          for (final r in restNew) ...[
            _EmpRewardCard(reward: r),
          ],
        ],
        if (history.isNotEmpty) ...[
          SizedBox(height: (hero != null || restNew.isNotEmpty) ? 24 : 0),
          _EmpSectionHeader(label: 'Reward history', count: history.length),
          const SizedBox(height: 8),
          for (final r in history) ...[
            _EmpRewardCard(reward: r),
          ],
        ],
      ],
    );
  }
}

// ─── Points balance card ──────────────────────────────────────────────────

class _PointsBalanceCard extends ConsumerWidget {
  final WidgetRef parentRef;
  const _PointsBalanceCard({required this.parentRef});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final t = RT(context);
    final balanceAsync = ref.watch(hrPointsBalanceProvider);

    return balanceAsync.when(
      loading: () => const SizedBox(height: 80),
      error: (_, _) => const SizedBox.shrink(),
      data: (bal) => _PointsBalanceCardBody(
        balance: bal,
        parentRef: parentRef,
        isDark: isDark,
        t: t,
      ),
    );
  }
}

class _PointsBalanceCardBody extends StatelessWidget {
  final HrPointsBalance balance;
  final WidgetRef parentRef;
  final bool isDark;
  final RunqTokens t;

  const _PointsBalanceCardBody({
    required this.balance,
    required this.parentRef,
    required this.isDark,
    required this.t,
  });

  static const _minRedeem = 500;

  @override
  Widget build(BuildContext context) {
    final hasBal = balance.balance > 0;
    final canRedeem = balance.balance >= _minRedeem;

    final bgColors = isDark
        ? [const Color(0xFF1C3A52), const Color(0xFF0F2D42)]
        : [const Color(0xFFF0FAFB), const Color(0xFFE0F2FE)];
    final accent = isDark ? HrColors.tealLight : HrColors.teal;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: bgColors,
        ),
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(
          color: accent.withValues(alpha: isDark ? 0.3 : 0.15),
          width: 0.5,
        ),
        boxShadow: RunqShadows.card,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: accent.withValues(alpha: 0.15),
                  shape: BoxShape.circle,
                ),
                child: Icon(Icons.toll_rounded, color: accent, size: 18),
              ),
              const SizedBox(width: 10),
              Text(
                'Points balance',
                style: RunqText.bodyStrong.copyWith(
                  color: isDark ? const Color(0xFFE0F7FA) : t.ink,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            '${balance.balance} pts',
            style: RunqText.h2.copyWith(
              color: hasBal ? accent : t.muted,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            'Worth ₹${balance.balance}  •  Lifetime: ${balance.lifetime}  •  Redeemed: ${balance.redeemed}',
            style: RunqText.caption.copyWith(
              color: isDark ? const Color(0xFF67E8F9) : const Color(0xFF155E75),
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              onPressed: canRedeem
                  ? () => showRedeemPointsSheet(
                        context,
                        parentRef,
                        maxBalance: balance.balance,
                      )
                  : null,
              style: OutlinedButton.styleFrom(
                foregroundColor: canRedeem ? accent : t.muted,
                side: BorderSide(
                  color: canRedeem
                      ? accent.withValues(alpha: 0.6)
                      : t.hairline,
                  width: 1,
                ),
                padding: const EdgeInsets.symmetric(vertical: 10),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
              ),
              child: Text(
                canRedeem
                    ? 'Redeem points'
                    : 'Minimum $_minRedeem points to redeem',
                style: RunqText.bodyStrong.copyWith(
                  color: canRedeem ? accent : t.muted,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Celebratory hero card ────────────────────────────────────────────────

class _HeroRewardCard extends StatelessWidget {
  final HrReward reward;
  const _HeroRewardCard({required this.reward});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final t = RT(context);

    final gradientColors = isDark
        ? [const Color(0xFF164E63), const Color(0xFF0E7490)]
        : [const Color(0xFFECFEFF), const Color(0xFFCFFAFE)];
    final accentColor =
        isDark ? HrColors.tealLight : HrColors.teal;
    final subInk = isDark ? const Color(0xFF67E8F9) : const Color(0xFF155E75);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: gradientColors,
        ),
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(
          color: accentColor.withValues(alpha: isDark ? 0.3 : 0.2),
          width: 0.5,
        ),
        boxShadow: RunqShadows.card,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: accentColor.withValues(alpha: 0.18),
                  shape: BoxShape.circle,
                ),
                child: Icon(Icons.star_rounded, color: accentColor, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  '🎉 You received a reward!',
                  style: RunqText.bodyStrong.copyWith(
                    color: isDark ? const Color(0xFFE0F7FA) : t.ink,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Text(
            reward.title,
            style: RunqText.h3.copyWith(
              color: isDark ? const Color(0xFFE0F7FA) : t.ink,
            ),
          ),
          const SizedBox(height: 4),
          if (reward.typeName != null)
            Text(
              reward.typeName!,
              style: RunqText.caption.copyWith(color: subInk),
            ),
          const SizedBox(height: 10),
          if (reward.isPoints) ...[
            Text(
              '${reward.amountNum.toInt()} pts',
              style: RunqText.h2.copyWith(
                color: accentColor,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 6),
          ] else if (reward.isMonetary) ...[
            Text(
              hrFormatINR(reward.amountNum),
              style: RunqText.h2.copyWith(
                color: accentColor,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 6),
          ],
          if (reward.citation != null && reward.citation!.isNotEmpty)
            Text(
              '"${reward.citation!}"',
              style: RunqText.body.copyWith(
                color: isDark ? const Color(0xFFB2EBF2) : const Color(0xFF155E75),
                fontStyle: FontStyle.italic,
              ),
              maxLines: 4,
              overflow: TextOverflow.ellipsis,
            ),
        ],
      ),
    );
  }
}

// ─── Employee reward card (history / extra new) ───────────────────────────

class _EmpRewardCard extends StatelessWidget {
  final HrReward reward;
  const _EmpRewardCard({required this.reward});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Container(
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: BorderRadius.circular(RunqRadii.smallCard),
          border: Border.all(color: t.hairline, width: 0.5),
          boxShadow: RunqShadows.card,
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(RunqRadii.smallCard),
          child: IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Container(
                  width: 4,
                  color: reward.isPoints
                      ? (isDark
                          ? const Color(0xFFA78BFA)
                          : const Color(0xFF7C3AED))
                      : reward.isMonetary
                          ? (isDark
                              ? const Color(0xFF4ADE80)
                              : const Color(0xFF16A34A))
                          : (isDark
                              ? const Color(0xFFFBBF24)
                              : const Color(0xFFD97706)),
                ),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _EmpCardHeader(reward: reward),
                        const SizedBox(height: 8),
                        _EmpCardBody(reward: reward),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _EmpCardHeader extends StatelessWidget {
  final HrReward reward;
  const _EmpCardHeader({required this.reward});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            color: reward.isPoints
                ? const Color(0xFFEDE9FE)
                : reward.isMonetary
                    ? const Color(0xFFDCFCE7)
                    : const Color(0xFFFEF3C7),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(
            reward.isPoints
                ? Icons.toll_rounded
                : reward.isMonetary
                    ? Icons.payments_outlined
                    : Icons.star_rounded,
            size: 18,
            color: reward.isPoints
                ? const Color(0xFF7C3AED)
                : reward.isMonetary
                    ? const Color(0xFF15803D)
                    : const Color(0xFFD97706),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                reward.title,
                style: RunqText.bodyStrong.copyWith(color: t.ink),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 2),
              if (reward.typeName != null)
                Text(
                  reward.typeName!,
                  style: RunqText.caption.copyWith(color: t.muted),
                ),
            ],
          ),
        ),
        const SizedBox(width: 8),
        HrStatusBadge(status: reward.status),
      ],
    );
  }
}

class _EmpCardBody extends StatelessWidget {
  final HrReward reward;
  const _EmpCardBody({required this.reward});

  static const _months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final d = reward.awardDate;
    final dateStr = '${d.day} ${_months[d.month - 1]} ${d.year}';

    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: t.bgWarmer,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _EmpRewardAmount(reward: reward),
          const SizedBox(height: 6),
          Row(
            children: [
              Text(
                dateStr,
                style: RunqText.caption.copyWith(color: t.muted),
              ),
              const Spacer(),
              Text(
                reward.rewardNumber,
                style: RunqText.micro.copyWith(color: t.muted2),
              ),
            ],
          ),
          if (reward.citation != null && reward.citation!.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              reward.citation!,
              style: RunqText.caption.copyWith(color: t.muted),
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
            ),
          ],
          if (reward.rejectionReason != null &&
              reward.rejectionReason!.isNotEmpty) ...[
            const SizedBox(height: 6),
            Row(
              children: [
                const Icon(
                  Icons.info_outline_rounded,
                  size: 13,
                  color: Color(0xFFDC2626),
                ),
                const SizedBox(width: 4),
                Expanded(
                  child: Text(
                    reward.rejectionReason!,
                    style: RunqText.caption
                        .copyWith(color: const Color(0xFFDC2626)),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

/// Same big/bold amount headline used on the manager cards — kept inline
/// here so the employee view doesn't import the manager widget file.
class _EmpRewardAmount extends StatelessWidget {
  final HrReward reward;
  const _EmpRewardAmount({required this.reward});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    if (reward.isPoints) {
      return Text(
        '${reward.amountNum.toInt()} pts',
        style: RunqText.h2.copyWith(
          color: isDark ? const Color(0xFFA78BFA) : const Color(0xFF7C3AED),
          fontWeight: FontWeight.w800,
        ),
      );
    }
    if (reward.isMonetary && reward.isRedemption) {
      return Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Icon(Icons.autorenew_rounded, size: 18, color: t.muted),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              '${reward.pointsUsed} pts → ${hrFormatINR(reward.amountNum)}',
              style: RunqText.h3.copyWith(
                color: t.ink,
                fontWeight: FontWeight.w800,
              ),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      );
    }
    if (reward.isMonetary) {
      return Text(
        hrFormatINR(reward.amountNum),
        style: RunqText.h2.copyWith(
          color: isDark ? const Color(0xFF4ADE80) : const Color(0xFF15803D),
          fontWeight: FontWeight.w800,
        ),
      );
    }
    return Text(
      'Recognition',
      style: RunqText.h3.copyWith(
        color: isDark ? const Color(0xFFFBBF24) : const Color(0xFFD97706),
        fontWeight: FontWeight.w800,
      ),
    );
  }
}

// ─── Section header ───────────────────────────────────────────────────────

class _EmpSectionHeader extends StatelessWidget {
  final String label;
  final int count;
  const _EmpSectionHeader({required this.label, required this.count});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Row(
      children: [
        Text(label, style: RunqText.bodyStrong.copyWith(color: t.ink)),
        const SizedBox(width: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          decoration: BoxDecoration(
            color: t.muted.withValues(alpha: 0.15),
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text(
            '$count',
            style: RunqText.micro.copyWith(color: t.muted),
          ),
        ),
      ],
    );
  }
}
