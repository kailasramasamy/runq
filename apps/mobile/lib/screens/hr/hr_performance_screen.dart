// Employee self-service for performance.
//
// Top level: a card per performance cycle the employee has goals in, with a
// status chip + self-rating progress. Tapping a cycle opens its goals + the
// review wrap-up. Uses the HR theme tokens.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/hr_phase_next.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart';
import 'widgets/hr_colors.dart';

class HrPerformanceScreen extends ConsumerWidget {
  const HrPerformanceScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final async = ref.watch(myPerformanceProvider);
    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: AppBar(title: const Text('My goals')),
      body: RefreshIndicator(
        color: HrColors.brand(context),
        onRefresh: () async => ref.invalidate(myPerformanceProvider),
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(child: Text('$e')),
          data: (b) {
            final cycles = <String, _CycleGroup>{};
            for (final g in b.goals) {
              final c = cycles.putIfAbsent(g.cycleId, () => _CycleGroup(
                    cycleId: g.cycleId,
                    name: g.cycleName ?? 'Performance cycle',
                    status: g.cycleStatus ?? 'active',
                    startDate: g.cycleStartDate,
                    endDate: g.cycleEndDate,
                  ));
              c.goals.add(g);
            }
            final groups = cycles.values.toList();
            if (groups.isEmpty) {
              return ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(32, 100, 32, 32),
                    child: Column(children: [
                      Icon(Icons.flag_outlined, size: 56, color: t.muted),
                      const SizedBox(height: 12),
                      Text('No performance cycles yet',
                          style: RunqText.bodyStrong.copyWith(color: t.ink)),
                      const SizedBox(height: 4),
                      Text('When HR sets up your goals, your cycle will appear here.',
                          textAlign: TextAlign.center,
                          style: RunqText.body.copyWith(color: t.muted)),
                    ]),
                  ),
                ],
              );
            }
            return ListView(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 24),
              children: [
                for (final g in groups)
                  _CycleCard(
                    group: g,
                    reviews: b.reviews.where((r) => r.cycleId == g.cycleId).toList(),
                    onTap: () => Navigator.of(context).push(MaterialPageRoute(
                      builder: (_) => _CycleDetailScreen(cycleId: g.cycleId),
                    )),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _CycleGroup {
  final String cycleId, name, status;
  final String? startDate, endDate;
  final List<HrPerformanceGoal> goals = [];
  _CycleGroup({required this.cycleId, required this.name, required this.status, this.startDate, this.endDate});
}

// Standard 1-5 rating anchors — gives every rater the same yardstick.
String ratingAnchor(double v) {
  if (v <= 0) return 'Not rated';
  if (v < 1.5) return 'Below expectations';
  if (v < 2.5) return 'Partially met';
  if (v < 3.5) return 'Met expectations';
  if (v < 4.5) return 'Exceeded expectations';
  return 'Outstanding';
}

Color ratingAnchorColor(double v) {
  if (v <= 0) return Colors.grey;
  if (v < 1.5) return Colors.red.shade600;
  if (v < 2.5) return Colors.orange.shade700;
  if (v < 3.5) return Colors.amber.shade700;
  if (v < 4.5) return Colors.lightGreen.shade700;
  return Colors.green.shade600;
}

(Color, String) _cycleStatusMeta(String s) => switch (s) {
      'planned' => (Colors.grey, 'Planned'),
      'active' => (Colors.green, 'Active'),
      'review' => (Colors.orange, 'Review open'),
      'closed' => (Colors.blueGrey, 'Closed'),
      _ => (Colors.grey, s),
    };

class _CycleCard extends StatelessWidget {
  const _CycleCard({required this.group, required this.reviews, required this.onTap});
  final _CycleGroup group;
  final List<HrPerformanceReview> reviews;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final (statusColor, statusLabel) = _cycleStatusMeta(group.status);
    final rated = group.goals.where((g) => g.selfRating != null).length;
    final total = group.goals.length;
    final allRated = total > 0 && rated == total;
    final progress = total == 0 ? 0.0 : rated / total;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: t.hairline),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(
                child: Text(group.name,
                    style: RunqText.h4.copyWith(color: t.ink)),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: statusColor.withValues(alpha: isDark ? 0.22 : 0.14),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(statusLabel,
                    style: RunqText.label.copyWith(color: statusColor)),
              ),
            ]),
            if (group.startDate != null && group.endDate != null) ...[
              const SizedBox(height: 3),
              Text('${group.startDate} → ${group.endDate}',
                  style: RunqText.caption.copyWith(color: t.muted)),
            ],
            const SizedBox(height: 12),
            Row(children: [
              Icon(allRated ? Icons.check_circle : Icons.flag_outlined,
                  size: 16, color: allRated ? Colors.green : t.muted),
              const SizedBox(width: 6),
              Text(
                allRated ? 'All $total goals self-rated' : '$rated of $total goals self-rated',
                style: RunqText.body.copyWith(
                  fontWeight: allRated ? FontWeight.w600 : FontWeight.w500,
                  color: allRated ? Colors.green.shade700 : t.ink,
                ),
              ),
              const Spacer(),
              Icon(Icons.chevron_right, color: t.muted),
            ]),
            if (!allRated && total > 0) ...[
              const SizedBox(height: 8),
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: progress,
                  minHeight: 5,
                  backgroundColor: t.muted.withValues(alpha: 0.12),
                  valueColor: AlwaysStoppedAnimation(HrColors.brand(context)),
                ),
              ),
            ],
            if (reviews.any((r) => r.status == 'pending')) ...[
              const SizedBox(height: 8),
              Row(children: [
                Icon(Icons.rate_review_outlined, size: 14, color: Colors.orange.shade700),
                const SizedBox(width: 4),
                Text('Review wrap-up waiting for you',
                    style: RunqText.caption.copyWith(color: Colors.orange.shade700, fontWeight: FontWeight.w600)),
              ]),
            ],
          ]),
        ),
      ),
    );
  }
}

// ─── Cycle detail: goals + review for one cycle ────────────────────────────

class _CycleDetailScreen extends ConsumerWidget {
  const _CycleDetailScreen({required this.cycleId});
  final String cycleId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final async = ref.watch(myPerformanceProvider);
    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: AppBar(title: const Text('My goals')),
      body: RefreshIndicator(
        color: HrColors.brand(context),
        onRefresh: () async => ref.invalidate(myPerformanceProvider),
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(child: Text('$e')),
          data: (b) {
            final goals = b.goals.where((g) => g.cycleId == cycleId).toList();
            final reviews = b.reviews.where((r) => r.cycleId == cycleId).toList();
            final pendingSelf = goals.where((g) => g.selfRating == null).length;

            // "Ready" — the review has reached an outcome the employee should
            // see first (finalised or already acknowledged). When ready, the
            // wrap-up jumps above the goals list.
            final reviewReady = reviews.any(
              (r) => r.status == 'finalised' || r.status == 'acknowledged',
            );

            final wrapUp = <Widget>[
              _SectionHeader('Review wrap-up'),
              if (reviews.isEmpty)
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text(
                    'Once you\'ve self-rated your goals, HR will start the review wrap-up — you\'ll see it here.',
                    style: RunqText.body.copyWith(color: t.muted),
                  ),
                )
              else
                ...reviews.map((r) => _ReviewCard(
                      review: r,
                      onSelfReview: r.status == 'pending'
                          ? () => _SelfReviewSheet.show(context, ref, r.id)
                          : null,
                      onAcknowledge: r.status == 'finalised'
                          ? () => _AcknowledgeSheet.show(context, ref, r.id)
                          : null,
                    )),
            ];

            final goalsSection = <Widget>[
              _SectionHeader('Goals (${goals.length})'),
              if (goals.isEmpty)
                Padding(
                  padding: const EdgeInsets.all(24),
                  child: Text('No goals in this cycle.',
                      textAlign: TextAlign.center, style: TextStyle(color: t.muted)),
                )
              else
                ...goals.map((g) => _GoalCard(
                      goal: g,
                      onRate: () => _SelfRateGoalSheet.show(context, ref, g),
                      onUpdateProgress: () => _ProgressSheet.show(context, ref, g),
                    )),
            ];

            return ListView(
              padding: const EdgeInsets.fromLTRB(0, 8, 0, 24),
              children: [
                if (pendingSelf > 0 && goals.isNotEmpty && !reviewReady)
                  _ActionBanner(
                    title: pendingSelf == 1
                        ? '1 goal needs your self-rating'
                        : '$pendingSelf goals need your self-rating',
                    body: 'Rate each goal honestly — your manager reviews this and adds their own.',
                    icon: Icons.assignment_turned_in_outlined,
                  ),
                if (reviewReady) ...[
                  ...wrapUp,
                  const SizedBox(height: 18),
                  ...goalsSection,
                ] else ...[
                  ...goalsSection,
                  const SizedBox(height: 18),
                  ...wrapUp,
                ],
              ],
            );
          },
        ),
      ),
    );
  }
}

class _ActionBanner extends StatelessWidget {
  const _ActionBanner({required this.title, required this.body, required this.icon});
  final String title, body;
  final IconData icon;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      margin: const EdgeInsets.fromLTRB(12, 6, 12, 12),
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: isDark ? Colors.amber.withValues(alpha: 0.15) : Colors.amber.withValues(alpha: 0.10),
        border: Border.all(color: Colors.amber.withValues(alpha: 0.45)),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(icon, color: Colors.amber.shade800, size: 20),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: RunqText.bodyStrong.copyWith(fontWeight: FontWeight.w700, color: t.ink)),
            const SizedBox(height: 2),
            Text(body, style: RunqText.caption.copyWith(color: t.muted)),
          ]),
        ),
      ]),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader(this.label);
  final String label;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      child: Text(label.toUpperCase(),
          style: RunqText.label.copyWith(color: t.muted)),
    );
  }
}

class _GoalCard extends StatelessWidget {
  const _GoalCard({required this.goal, required this.onRate, required this.onUpdateProgress});
  final HrPerformanceGoal goal;
  final VoidCallback onRate;
  final VoidCallback onUpdateProgress;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final hasSelf = goal.selfRating != null;
    return Container(
      margin: const EdgeInsets.fromLTRB(12, 0, 12, 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: t.hairline),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
            child: Text(goal.title,
                style: RunqText.bodyStrong.copyWith(fontWeight: FontWeight.w700, color: t.ink)),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: HrColors.brand(context).withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text('${goal.weight.toStringAsFixed(0)}%',
                style: RunqText.label.copyWith(color: HrColors.brand(context))),
          ),
        ]),
        if (goal.description != null && goal.description!.isNotEmpty) ...[
          const SizedBox(height: 6),
          Text(goal.description!, style: RunqText.body.copyWith(color: t.muted, height: 1.35)),
        ],
        const SizedBox(height: 10),
        // Mid-cycle progress — tap to update.
        InkWell(
          onTap: onUpdateProgress,
          borderRadius: BorderRadius.circular(6),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 2),
            child: Row(children: [
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: (goal.progressPct ?? 0) / 100,
                    minHeight: 6,
                    backgroundColor: t.muted.withValues(alpha: 0.12),
                    valueColor: AlwaysStoppedAnimation(HrColors.brand(context)),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Text(
                goal.progressPct == null ? 'Set progress' : '${goal.progressPct}%',
                style: RunqText.caption.copyWith(
                  fontWeight: FontWeight.w600,
                  color: goal.progressPct == null ? HrColors.brand(context) : t.ink,
                ),
              ),
              Icon(Icons.edit, size: 13, color: t.muted),
            ]),
          ),
        ),
        const SizedBox(height: 10),
        Row(children: [
          _ratingChip('Self', goal.selfRating, accent: !hasSelf),
          const SizedBox(width: 6),
          _ratingChip('Mgr', goal.managerRating),
          const SizedBox(width: 6),
          _ratingChip('Final', goal.finalRating),
          const Spacer(),
          FilledButton.icon(
            onPressed: onRate,
            style: FilledButton.styleFrom(
              backgroundColor: HrColors.teal,
              foregroundColor: Colors.white,
              visualDensity: VisualDensity.compact,
            ),
            icon: Icon(hasSelf ? Icons.edit_outlined : Icons.star_outline, size: 16),
            label: Text(hasSelf ? 'Edit' : 'Self-rate'),
          ),
        ]),
      ]),
    );
  }

  Widget _ratingChip(String label, double? v, {bool accent = false}) {
    return Builder(builder: (ctx) {
      final t = RT(ctx);
      final empty = v == null;
      final fg = accent ? Colors.amber.shade800 : t.muted;
      final bg = accent ? Colors.amber.withValues(alpha: 0.12) : t.muted.withValues(alpha: 0.08);
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(8)),
        child: Text(
          '$label: ${empty ? '—' : v.toStringAsFixed(1)}',
          style: RunqText.label.copyWith(color: fg),
        ),
      );
    });
  }
}

class _ReviewCard extends StatelessWidget {
  const _ReviewCard({required this.review, this.onSelfReview, this.onAcknowledge});
  final HrPerformanceReview review;
  final VoidCallback? onSelfReview;
  final VoidCallback? onAcknowledge;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      margin: const EdgeInsets.fromLTRB(12, 0, 12, 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: t.hairline),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: _statusColor(review.status).withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Text(
              review.status.replaceAll('_', ' '),
              style: RunqText.label.copyWith(color: _statusColor(review.status)),
            ),
          ),
          const Spacer(),
          if (onSelfReview != null)
            FilledButton(
              onPressed: onSelfReview,
              style: FilledButton.styleFrom(
                backgroundColor: HrColors.teal,
                foregroundColor: Colors.white,
                visualDensity: VisualDensity.compact,
              ),
              child: const Text('Submit self review'),
            ),
          if (onAcknowledge != null)
            FilledButton.icon(
              onPressed: onAcknowledge,
              style: FilledButton.styleFrom(
                backgroundColor: HrColors.teal,
                foregroundColor: Colors.white,
                visualDensity: VisualDensity.compact,
              ),
              icon: const Icon(Icons.check, size: 16),
              label: const Text('Acknowledge'),
            ),
        ]),
        const SizedBox(height: 8),
        Row(children: [
          _statTile(context, 'Self', review.displaySelf,
              derived: review.selfOverallRating == null && review.computedSelfScore != null),
          _statTile(context, 'Manager', review.displayManager,
              derived: review.managerOverallRating == null && review.computedManagerScore != null),
          _statTile(context, 'Final', review.finalOverallRating),
        ]),
        if (review.managerComments != null && review.managerComments!.isNotEmpty) ...[
          const SizedBox(height: 10),
          Text("Manager's comments", style: RunqText.label.copyWith(color: t.muted)),
          const SizedBox(height: 2),
          Text(review.managerComments!, style: RunqText.body.copyWith(color: t.ink, height: 1.35)),
        ],
        if (review.employeeAckComment != null && review.employeeAckComment!.isNotEmpty) ...[
          const SizedBox(height: 10),
          Text('Your acknowledgement note', style: RunqText.label.copyWith(color: t.muted)),
          const SizedBox(height: 2),
          Text(review.employeeAckComment!, style: RunqText.body.copyWith(color: t.ink, height: 1.35)),
        ],
      ]),
    );
  }

  Color _statusColor(String s) => switch (s) {
        'pending' => Colors.orange.shade700,
        'self_submitted' => Colors.blue.shade700,
        'manager_submitted' => Colors.purple.shade700,
        'finalised' => Colors.green.shade700,
        _ => Colors.grey,
      };

  Widget _statTile(BuildContext ctx, String label, double? v, {bool derived = false}) {
    final t = RT(ctx);
    return Expanded(
      child: Container(
        margin: const EdgeInsets.only(right: 6),
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: t.muted.withValues(alpha: 0.06),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Column(children: [
          Text(v?.toStringAsFixed(1) ?? '—',
              style: RunqText.h3.copyWith(color: t.ink)),
          Text(derived ? '$label · from goals' : label,
              textAlign: TextAlign.center,
              style: RunqText.micro.copyWith(color: t.muted)),
        ]),
      ),
    );
  }
}

class _SelfRateGoalSheet extends StatefulWidget {
  const _SelfRateGoalSheet({required this.goal});
  final HrPerformanceGoal goal;

  static void show(BuildContext context, WidgetRef ref, HrPerformanceGoal goal) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: RT(context).surface,
      builder: (_) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: _SelfRateGoalSheet(goal: goal),
      ),
    ).then((_) => ref.invalidate(myPerformanceProvider));
  }

  @override
  State<_SelfRateGoalSheet> createState() => _SelfRateGoalSheetState();
}

class _SelfRateGoalSheetState extends State<_SelfRateGoalSheet> {
  late double _rating;
  late TextEditingController _comments;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _rating = widget.goal.selfRating ?? 3.0;
    _comments = TextEditingController(text: widget.goal.comments ?? '');
  }

  @override
  void dispose() {
    _comments.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = HrColors.brand(context);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(widget.goal.title,
              style: RunqText.h4.copyWith(color: t.ink)),
          if (widget.goal.description != null) ...[
            const SizedBox(height: 4),
            Text(widget.goal.description!, style: RunqText.body.copyWith(color: t.muted)),
          ],
          const SizedBox(height: 16),
          Row(children: [
            Text('Your rating', style: RunqText.bodyStrong.copyWith(color: t.muted)),
            const Spacer(),
            Text('${_rating.toStringAsFixed(1)} / 5',
                style: RunqText.h3.copyWith(color: brand)),
          ]),
          SliderTheme(
            data: SliderTheme.of(context).copyWith(
              activeTrackColor: brand,
              thumbColor: brand,
              overlayColor: brand.withValues(alpha: 0.15),
              inactiveTrackColor: t.muted.withValues(alpha: 0.18),
            ),
            child: Slider(
              min: 0, max: 5, divisions: 10, value: _rating,
              label: _rating.toStringAsFixed(1),
              onChanged: (v) => setState(() => _rating = v),
            ),
          ),
          Center(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: ratingAnchorColor(_rating).withValues(alpha: 0.14),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(ratingAnchor(_rating),
                  style: RunqText.caption.copyWith(fontWeight: FontWeight.w700, color: ratingAnchorColor(_rating))),
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _comments,
            maxLines: 3,
            textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(
              labelText: 'Notes (optional)',
              hintText: 'What went well? Any challenges?',
              border: const OutlineInputBorder(),
              focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: brand, width: 1.5)),
            ),
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              style: FilledButton.styleFrom(backgroundColor: HrColors.teal, foregroundColor: Colors.white),
              onPressed: _busy ? null : _save,
              child: Text(_busy ? 'Saving…' : 'Save rating'),
            ),
          ),
        ]),
      ),
    );
  }

  Future<void> _save() async {
    setState(() => _busy = true);
    try {
      await hrPhaseNextRepo.selfRateGoal(
        widget.goal.id,
        rating: _rating,
        comments: _comments.text,
      );
      if (mounted) {
        Navigator.pop(context);
        showRunqSnack(context, 'Rating saved', kind: SnackKind.success);
      }
    } catch (e) {
      if (mounted) showRunqSnack(context, 'Failed: $e', kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

class _SelfReviewSheet extends StatefulWidget {
  const _SelfReviewSheet({required this.id});
  final String id;
  static void show(BuildContext context, WidgetRef ref, String id) {
    showModalBottomSheet(
      context: context, isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: RT(context).surface,
      builder: (_) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: _SelfReviewSheet(id: id),
      ),
    ).then((_) => ref.invalidate(myPerformanceProvider));
  }
  @override
  State<_SelfReviewSheet> createState() => _SelfReviewSheetState();
}

class _SelfReviewSheetState extends State<_SelfReviewSheet> {
  final _comments = TextEditingController();
  double _rating = 3.0;
  bool _busy = false;

  @override
  void dispose() {
    _comments.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = HrColors.brand(context);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Overall self review',
              style: RunqText.h4.copyWith(color: t.ink)),
          const SizedBox(height: 12),
          Row(children: [
            Text('Overall rating', style: RunqText.bodyStrong.copyWith(color: t.muted)),
            const Spacer(),
            Text('${_rating.toStringAsFixed(1)} / 5',
                style: RunqText.h3.copyWith(color: brand)),
          ]),
          SliderTheme(
            data: SliderTheme.of(context).copyWith(
              activeTrackColor: brand,
              thumbColor: brand,
              overlayColor: brand.withValues(alpha: 0.15),
              inactiveTrackColor: t.muted.withValues(alpha: 0.18),
            ),
            child: Slider(
              min: 0, max: 5, divisions: 10, value: _rating,
              label: _rating.toStringAsFixed(1),
              onChanged: (v) => setState(() => _rating = v),
            ),
          ),
          Center(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: ratingAnchorColor(_rating).withValues(alpha: 0.14),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(ratingAnchor(_rating),
                  style: RunqText.caption.copyWith(fontWeight: FontWeight.w700, color: ratingAnchorColor(_rating))),
            ),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _comments,
            maxLines: 4,
            textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(
              labelText: 'Overall comments',
              border: const OutlineInputBorder(),
              focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: brand, width: 1.5)),
            ),
          ),
          const SizedBox(height: 12),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: HrColors.teal, foregroundColor: Colors.white),
            onPressed: _busy ? null : () async {
              setState(() => _busy = true);
              try {
                await hrPhaseNextRepo.selfSubmitReview(widget.id,
                  selfComments: _comments.text.trim().isEmpty ? null : _comments.text.trim(),
                  selfOverallRating: _rating,
                );
                if (mounted) { Navigator.pop(context); showRunqSnack(context, 'Submitted', kind: SnackKind.success); }
              } catch (e) {
                if (mounted) showRunqSnack(context, 'Failed: $e', kind: SnackKind.error);
              } finally { if (mounted) setState(() => _busy = false); }
            },
            child: const Text('Submit self review'),
          ),
        ]),
      ),
    );
  }
}

class _AcknowledgeSheet extends StatefulWidget {
  const _AcknowledgeSheet({required this.id});
  final String id;
  static void show(BuildContext context, WidgetRef ref, String id) {
    showModalBottomSheet(
      context: context, isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: RT(context).surface,
      builder: (_) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: _AcknowledgeSheet(id: id),
      ),
    ).then((_) => ref.invalidate(myPerformanceProvider));
  }
  @override
  State<_AcknowledgeSheet> createState() => _AcknowledgeSheetState();
}

class _AcknowledgeSheetState extends State<_AcknowledgeSheet> {
  final _comment = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = HrColors.brand(context);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Acknowledge review',
              style: RunqText.h4.copyWith(color: t.ink)),
          const SizedBox(height: 4),
          Text(
            'Confirm you\'ve seen your finalised review. You can add a note for the record (optional).',
            style: RunqText.body.copyWith(color: t.muted),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _comment,
            maxLines: 3,
            textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(
              labelText: 'Your note (optional)',
              hintText: 'Agree / disagree / anything to flag…',
              border: const OutlineInputBorder(),
              focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: brand, width: 1.5)),
            ),
          ),
          const SizedBox(height: 14),
          FilledButton.icon(
            style: FilledButton.styleFrom(backgroundColor: HrColors.teal, foregroundColor: Colors.white),
            onPressed: _busy ? null : () async {
              setState(() => _busy = true);
              try {
                await hrPhaseNextRepo.acknowledgeReview(widget.id, comment: _comment.text);
                if (mounted) {
                  Navigator.pop(context);
                  showRunqSnack(context, 'Review acknowledged', kind: SnackKind.success);
                }
              } catch (e) {
                if (mounted) showRunqSnack(context, 'Failed: $e', kind: SnackKind.error);
              } finally {
                if (mounted) setState(() => _busy = false);
              }
            },
            icon: const Icon(Icons.check, size: 18),
            label: Text(_busy ? 'Submitting…' : 'Acknowledge review'),
          ),
        ]),
      ),
    );
  }
}

class _ProgressSheet extends StatefulWidget {
  const _ProgressSheet({required this.goal});
  final HrPerformanceGoal goal;
  static void show(BuildContext context, WidgetRef ref, HrPerformanceGoal goal) {
    showModalBottomSheet(
      context: context, isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: RT(context).surface,
      builder: (_) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: _ProgressSheet(goal: goal),
      ),
    ).then((_) => ref.invalidate(myPerformanceProvider));
  }
  @override
  State<_ProgressSheet> createState() => _ProgressSheetState();
}

class _ProgressSheetState extends State<_ProgressSheet> {
  late double _pct;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _pct = (widget.goal.progressPct ?? 0).toDouble();
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = HrColors.brand(context);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(widget.goal.title,
              style: RunqText.h4.copyWith(color: t.ink)),
          const SizedBox(height: 4),
          Text('How far along are you on this goal?',
              style: RunqText.body.copyWith(color: t.muted)),
          const SizedBox(height: 16),
          Row(children: [
            Text('Progress', style: RunqText.bodyStrong.copyWith(color: t.muted)),
            const Spacer(),
            Text('${_pct.round()}%',
                style: RunqText.tabular(size: 20, w: FontWeight.w700, color: brand)),
          ]),
          SliderTheme(
            data: SliderTheme.of(context).copyWith(
              activeTrackColor: brand,
              thumbColor: brand,
              overlayColor: brand.withValues(alpha: 0.15),
              inactiveTrackColor: t.muted.withValues(alpha: 0.18),
            ),
            child: Slider(
              min: 0, max: 100, divisions: 20, value: _pct,
              label: '${_pct.round()}%',
              onChanged: (v) => setState(() => _pct = v),
            ),
          ),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              style: FilledButton.styleFrom(backgroundColor: HrColors.teal, foregroundColor: Colors.white),
              onPressed: _busy ? null : () async {
                setState(() => _busy = true);
                try {
                  await hrPhaseNextRepo.updateGoalProgress(widget.goal.id, _pct.round());
                  if (mounted) {
                    Navigator.pop(context);
                    showRunqSnack(context, 'Progress updated', kind: SnackKind.success);
                  }
                } catch (e) {
                  if (mounted) showRunqSnack(context, 'Failed: $e', kind: SnackKind.error);
                } finally {
                  if (mounted) setState(() => _busy = false);
                }
              },
              child: Text(_busy ? 'Saving…' : 'Save progress'),
            ),
          ),
        ]),
      ),
    );
  }
}
