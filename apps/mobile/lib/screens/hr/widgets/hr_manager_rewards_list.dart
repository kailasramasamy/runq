// Manager-facing reward list and card widgets.
// Grouped by employee so a manager with rewards across many team members can
// jump to one person quickly. Each employee section is collapsible; the most
// recently active employee is expanded by default.

library;

import 'package:flutter/material.dart';
import '../../../api/hr_models.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'hr_widgets.dart';

// ─── List body ────────────────────────────────────────────────────────────

class HrManagerRewardsList extends StatefulWidget {
  final List<HrReward> rewards;
  final String? myEmployeeId;
  final Future<void> Function(HrReward) onDelete;

  const HrManagerRewardsList({
    super.key,
    required this.rewards,
    required this.myEmployeeId,
    required this.onDelete,
  });

  @override
  State<HrManagerRewardsList> createState() => _HrManagerRewardsListState();
}

class _HrManagerRewardsListState extends State<HrManagerRewardsList> {
  /// employeeId → expanded? Persisted across rebuilds so a manager's expand
  /// choices survive a list refresh.
  final Map<String, bool> _expanded = {};

  @override
  Widget build(BuildContext context) {
    final t = RT(context);

    if (widget.rewards.isEmpty) {
      return ListView(
        physics:
            const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.fromLTRB(16, 80, 16, 120),
        children: [
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
              'Tap the button below to recognise a team member.',
              textAlign: TextAlign.center,
              style: RunqText.caption.copyWith(color: t.muted),
            ),
          ),
        ],
      );
    }

    final groups = _groupByEmployee(widget.rewards);

    return ListView.builder(
      physics:
          const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 120),
      itemCount: groups.length,
      itemBuilder: (_, i) {
        final g = groups[i];
        // Default: top group expanded, others collapsed. Single-employee
        // managers see no collapse chrome — the header is purely informational.
        final isOnly = groups.length == 1;
        final expanded = isOnly || (_expanded[g.employeeId] ?? i == 0);
        return Padding(
          padding: EdgeInsets.only(bottom: i == groups.length - 1 ? 0 : 16),
          child: _EmployeeGroup(
            group: g,
            expanded: expanded,
            collapsible: !isOnly,
            myEmployeeId: widget.myEmployeeId,
            onToggle: () => setState(() => _expanded[g.employeeId] = !expanded),
            onDelete: widget.onDelete,
          ),
        );
      },
    );
  }

  /// Build employee groups sorted by most-recent activity (desc).
  static List<_EmpGroupData> _groupByEmployee(List<HrReward> rewards) {
    final byEmp = <String, List<HrReward>>{};
    for (final r in rewards) {
      byEmp.putIfAbsent(r.employeeId, () => []).add(r);
    }
    final groups = byEmp.entries.map((e) {
      final list = e.value..sort((a, b) => b.createdAt.compareTo(a.createdAt));
      return _EmpGroupData(
        employeeId: e.key,
        employeeName: list.first.employeeName ?? '—',
        rewards: list,
      );
    }).toList();
    groups.sort((a, b) =>
        b.rewards.first.createdAt.compareTo(a.rewards.first.createdAt));
    return groups;
  }
}

// ─── Grouped data + section UI ────────────────────────────────────────────

class _EmpGroupData {
  final String employeeId;
  final String employeeName;
  final List<HrReward> rewards;
  _EmpGroupData({
    required this.employeeId,
    required this.employeeName,
    required this.rewards,
  });

  int get activeCount =>
      rewards.where((r) => !_isHistory(r.status)).length;
  int get historyCount => rewards.length - activeCount;

  static bool _isHistory(String s) =>
      s == 'rejected' || s == 'posted' || s == 'paid';
}

class _EmployeeGroup extends StatelessWidget {
  final _EmpGroupData group;
  final bool expanded;
  final bool collapsible;
  final String? myEmployeeId;
  final VoidCallback onToggle;
  final Future<void> Function(HrReward) onDelete;

  const _EmployeeGroup({
    required this.group,
    required this.expanded,
    required this.collapsible,
    required this.myEmployeeId,
    required this.onToggle,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    final active =
        group.rewards.where((r) => !_EmpGroupData._isHistory(r.status)).toList();
    final history = group.rewards
        .where((r) => _EmpGroupData._isHistory(r.status))
        .toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _EmployeeHeader(
          group: group,
          expanded: expanded,
          collapsible: collapsible,
          onToggle: onToggle,
        ),
        if (expanded) ...[
          const SizedBox(height: 8),
          if (active.isNotEmpty) ...[
            _SubHeader(label: 'Active', count: active.length),
            const SizedBox(height: 6),
            ...active.map((r) => _RewardCard(
                  reward: r,
                  myEmployeeId: myEmployeeId,
                  onDelete: onDelete,
                )),
          ],
          if (history.isNotEmpty) ...[
            SizedBox(height: active.isEmpty ? 0 : 8),
            _SubHeader(label: 'History', count: history.length),
            const SizedBox(height: 6),
            ...history.map((r) => _RewardCard(
                  reward: r,
                  myEmployeeId: myEmployeeId,
                  onDelete: onDelete,
                )),
          ],
        ],
      ],
    );
  }
}

class _EmployeeHeader extends StatelessWidget {
  final _EmpGroupData group;
  final bool expanded;
  final bool collapsible;
  final VoidCallback onToggle;
  const _EmployeeHeader({
    required this.group,
    required this.expanded,
    required this.collapsible,
    required this.onToggle,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InkWell(
      onTap: collapsible ? onToggle : null,
      borderRadius: BorderRadius.circular(10),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 2),
        child: Row(
          children: [
            _Avatar(name: group.employeeName),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(group.employeeName,
                      style: RunqText.bodyStrong.copyWith(color: t.ink)),
                  const SizedBox(height: 2),
                  Text(_summary(), style: RunqText.caption.copyWith(color: t.muted)),
                ],
              ),
            ),
            if (collapsible)
              Icon(
                expanded
                    ? Icons.keyboard_arrow_up_rounded
                    : Icons.keyboard_arrow_down_rounded,
                color: t.muted,
              ),
          ],
        ),
      ),
    );
  }

  String _summary() {
    final parts = <String>[];
    if (group.activeCount > 0) parts.add('${group.activeCount} active');
    if (group.historyCount > 0) parts.add('${group.historyCount} history');
    return parts.join(' · ');
  }
}

class _Avatar extends StatelessWidget {
  final String name;
  const _Avatar({required this.name});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      width: 32,
      height: 32,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: t.bgWarmer,
        shape: BoxShape.circle,
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      child: Text(
        _initials(name),
        style: RunqText.caption.copyWith(color: t.muted),
      ),
    );
  }

  static String _initials(String n) {
    final parts = n.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty || parts.first.isEmpty) return '—';
    if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
    return (parts.first.substring(0, 1) + parts.last.substring(0, 1))
        .toUpperCase();
  }
}

class _SubHeader extends StatelessWidget {
  final String label;
  final int count;
  const _SubHeader({required this.label, required this.count});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.only(left: 2),
      child: Row(
        children: [
          Text(label, style: RunqText.caption.copyWith(color: t.muted)),
          const SizedBox(width: 6),
          Text('· $count', style: RunqText.micro.copyWith(color: t.muted2)),
        ],
      ),
    );
  }
}

// ─── Reward card ──────────────────────────────────────────────────────────

class _RewardCard extends StatelessWidget {
  final HrReward reward;
  final String? myEmployeeId;
  final Future<void> Function(HrReward) onDelete;

  const _RewardCard({
    required this.reward,
    required this.myEmployeeId,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final canDel = reward.canDelete;

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
                        _HeaderRow(reward: reward, canDelete: canDel, onDelete: onDelete),
                        const SizedBox(height: 8),
                        _BodySection(reward: reward),
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

class _HeaderRow extends StatelessWidget {
  final HrReward reward;
  final bool canDelete;
  final Future<void> Function(HrReward) onDelete;

  const _HeaderRow({
    required this.reward,
    required this.canDelete,
    required this.onDelete,
  });

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
              if (reward.typeName != null) ...[
                const SizedBox(height: 2),
                Text(
                  reward.typeName!,
                  style: RunqText.caption.copyWith(color: t.muted),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(width: 8),
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            HrStatusBadge(status: reward.status),
            if (canDelete) ...[
              const SizedBox(height: 4),
              GestureDetector(
                onTap: () => onDelete(reward),
                child: Icon(Icons.delete_outline_rounded,
                    size: 18, color: t.muted),
              ),
            ],
          ],
        ),
      ],
    );
  }
}

/// Big, bold amount/points line — the headline number on every reward card.
/// Colored to match the card's left rail (purple/green/teal) so the value
/// reads at a glance.
class _RewardAmount extends StatelessWidget {
  final HrReward reward;
  const _RewardAmount({required this.reward});

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
    // Recognition kind — no number, but still want a visible line so the
    // body isn't empty above the date row.
    return Text(
      'Recognition',
      style: RunqText.h3.copyWith(
        color: isDark ? const Color(0xFFFBBF24) : const Color(0xFFD97706),
        fontWeight: FontWeight.w800,
      ),
    );
  }
}

class _BodySection extends StatelessWidget {
  final HrReward reward;
  const _BodySection({required this.reward});

  static const _months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final d = reward.awardDate;
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: t.bgWarmer,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _RewardAmount(reward: reward),
          const SizedBox(height: 6),
          Row(
            children: [
              Text(
                '${d.day} ${_months[d.month - 1]} ${d.year}',
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
                const Icon(Icons.info_outline_rounded,
                    size: 13, color: Color(0xFFDC2626)),
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
