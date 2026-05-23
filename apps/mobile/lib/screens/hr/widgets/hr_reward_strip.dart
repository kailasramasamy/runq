// Home-screen reward strip for the employee persona.
//
// Shown in _EmployeeBody right after _AttendanceStrip when the logged-in
// employee has ≥1 newly-received reward (approved within the last 7 days).
// Hidden entirely when there is nothing new — SizedBox.shrink().
//
// Tapping navigates to /hr/rewards.

library;

import 'package:confetti/confetti.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../api/hr_models.dart';
import '../../../providers/hr_providers.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'hr_colors.dart';
import 'hr_widgets.dart';

class HrRewardStrip extends ConsumerStatefulWidget {
  const HrRewardStrip({super.key});

  @override
  ConsumerState<HrRewardStrip> createState() => _HrRewardStripState();
}

class _HrRewardStripState extends ConsumerState<HrRewardStrip> {
  late final ConfettiController _confetti;
  bool _played = false;

  @override
  void initState() {
    super.initState();
    _confetti = ConfettiController(duration: const Duration(seconds: 2));
  }

  @override
  void dispose() {
    _confetti.dispose();
    super.dispose();
  }

  void _maybePlay(bool hasNew) {
    if (hasNew && !_played) {
      _played = true;
      _confetti.play();
    }
  }

  @override
  Widget build(BuildContext context) {
    final me = ref.watch(hrMeProvider).asData?.value;
    final myEmpId = me?.employee?.id;
    if (myEmpId == null) return const SizedBox.shrink();

    final rewardsAsync =
        ref.watch(hrRewardsProvider(HrRewardsQuery(employeeId: myEmpId)));

    return rewardsAsync.when(
      loading: () => const SizedBox.shrink(),
      error: (_, _) => const SizedBox.shrink(),
      data: (all) {
        final newly = all.where((r) => r.isNewlyReceived).toList();
        if (newly.isEmpty) return const SizedBox.shrink();
        _maybePlay(true);
        return _StripBody(
          newly: newly,
          confetti: _confetti,
          onTap: () => context.push('/hr/rewards'),
        );
      },
    );
  }
}

// ─── Strip body ───────────────────────────────────────────────────────────

class _StripBody extends StatelessWidget {
  final List<HrReward> newly;
  final ConfettiController confetti;
  final VoidCallback onTap;

  const _StripBody({
    required this.newly,
    required this.confetti,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final t = RT(context);
    final accentColor =
        isDark ? HrColors.tealLight : HrColors.teal;

    final gradientColors = isDark
        ? [const Color(0xFF164E63), const Color(0xFF0E7490)]
        : [const Color(0xFFECFEFF), const Color(0xFFCFFAFE)];

    final subLine = newly.length == 1
        ? _singleSubline(newly.first)
        : 'You have ${newly.length} new rewards';

    return Stack(
      clipBehavior: Clip.none,
      children: [
        GestureDetector(
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
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
            child: Row(
              children: [
                Container(
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(
                    color: accentColor.withValues(alpha: 0.18),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    Icons.star_rounded,
                    color: accentColor,
                    size: 20,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '🎉 You received a reward!',
                        style: RunqText.bodyStrong.copyWith(
                          color: isDark ? const Color(0xFFE0F7FA) : t.ink,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        subLine,
                        style: RunqText.caption.copyWith(
                          color: isDark
                              ? const Color(0xFF67E8F9)
                              : const Color(0xFF155E75),
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Icon(
                  Icons.chevron_right_rounded,
                  size: 18,
                  color: accentColor,
                ),
              ],
            ),
          ),
        ),
        // Tiny confetti burst anchored at top-center of the strip.
        Positioned(
          top: 0,
          left: 0,
          right: 0,
          child: Align(
            alignment: Alignment.topCenter,
            child: ConfettiWidget(
              confettiController: confetti,
              blastDirection: 1.5708, // π/2 = downward
              emissionFrequency: 0.08,
              numberOfParticles: 12,
              gravity: 0.15,
              colors: const [
                Color(0xFF0891B2),
                Color(0xFF06B6D4),
                Color(0xFFF59E0B),
                Color(0xFF10B981),
              ],
            ),
          ),
        ),
      ],
    );
  }

  String _singleSubline(HrReward r) {
    final parts = <String>[r.title];
    if (r.isPoints && r.amountNum > 0) {
      parts.add('${r.amountNum.toInt()} pts');
    } else if (r.isMonetary && r.amountNum > 0) {
      parts.add(hrFormatINR(r.amountNum));
    }
    return parts.join(' · ');
  }
}
