// Dedicated screen for a manager's team leave queue — pushed from the
// Home "Leaves" quick action. Two sections: Pending approval + Recent
// decisions, mirroring the same widget that used to live inside the
// Pay > Approvals sub-tab.
//
// Kept as a standalone route (rather than a Pay sub-tab) because
// "Approvals" was conceptually a manager-only function — the Pay screen
// is for personal payslips / leave / expenses. Splitting the two
// surfaces by intent (own pay vs team review) keeps each tight.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/hr_models.dart';
import '../../api/hr_repo.dart';
import '../../providers/hr_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart';
import 'widgets/hr_colors.dart';
import 'widgets/hr_widgets.dart';

class HrTeamLeavesScreen extends ConsumerWidget {
  const HrTeamLeavesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    return Scaffold(
      backgroundColor: t.bgWarm,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 12, 16, 8),
              child: Row(
                children: [
                  IconButton(
                    onPressed: () => Navigator.of(context).maybePop(),
                    icon: Icon(Icons.arrow_back_rounded, color: t.ink),
                  ),
                  const SizedBox(width: 4),
                  Text('Leaves', style: RunqText.h1.copyWith(color: t.ink)),
                ],
              ),
            ),
            const Expanded(child: HrTeamLeavesBody()),
          ],
        ),
      ),
    );
  }
}

/// Same body that used to render inside Pay > Approvals. Public so a
/// future surface (manager dashboard "open all leaves" card, etc.) can
/// drop it in without rewriting the section logic.
class HrTeamLeavesBody extends ConsumerWidget {
  const HrTeamLeavesBody({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final pendingAsync = ref.watch(hrPendingLeaveRequestsProvider);
    final reviewedAsync = ref.watch(hrReviewedLeaveRequestsProvider);
    return RefreshIndicator(
      color: HrColors.brand(context),
      onRefresh: () async {
        ref.invalidate(hrPendingLeaveRequestsProvider);
        ref.invalidate(hrReviewedLeaveRequestsProvider);
        await Future<void>.delayed(const Duration(milliseconds: 250));
      },
      child: pendingAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e', style: RunqText.body.copyWith(color: t.muted))),
        data: (pending) {
          final reviewed = reviewedAsync.asData?.value ?? const <HrLeaveRequest>[];
          final history = [...reviewed]..sort((a, b) {
            int ts(HrLeaveRequest r) =>
                (r.appliedAt ?? DateTime.fromMillisecondsSinceEpoch(0))
                    .millisecondsSinceEpoch;
            return ts(b).compareTo(ts(a));
          });
          if (pending.isEmpty && history.isEmpty) {
            return ListView(
              physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
              padding: const EdgeInsets.fromLTRB(16, 30, 16, 140),
              children: [
                const SizedBox(height: 30),
                Center(child: Text('🎉', style: TextStyle(fontSize: 36))),
                const SizedBox(height: 8),
                Center(child: Text('All caught up!',
                    style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 16))),
                const SizedBox(height: 4),
                Center(child: Text('No leave requests yet',
                    style: RunqText.caption.copyWith(color: t.muted))),
              ],
            );
          }
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 140),
            physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
            children: [
              if (pending.isNotEmpty) ...[
                _TeamLeavesSectionHeader(label: 'Pending approval', count: pending.length, t: t),
                const SizedBox(height: 12),
                for (final r in pending) ...[
                  HrPendingLeaveCard(
                    employeeId: r.employeeId,
                    employeeName: r.employeeName,
                    employeeCode: r.employeeCode,
                    employeePhotoUrl: r.employeePhotoUrl,
                    leaveTypeName: r.typeName,
                    fromDate: r.fromDate,
                    toDate: r.toDate,
                    totalDays: r.totalDays,
                    reason: r.reason,
                    onDecide: (approved) async {
                      try {
                        await hrRepo.reviewLeave(
                          id: r.id,
                          approved: approved,
                          rejectionReason: approved ? null : 'Rejected from mobile',
                        );
                      } catch (e) {
                        if (context.mounted) {
                          showRunqSnack(context, 'Could not update request', kind: SnackKind.error);
                        }
                      }
                      ref.invalidate(hrPendingLeaveRequestsProvider);
                      ref.invalidate(hrReviewedLeaveRequestsProvider);
                      ref.invalidate(hrWhoIsOutTodayProvider);
                      ref.invalidate(hrRecentActivityProvider);
                    },
                  ),
                  const SizedBox(height: 10),
                ],
              ],
              if (history.isNotEmpty) ...[
                SizedBox(height: pending.isEmpty ? 0 : 20),
                _TeamLeavesSectionHeader(label: 'Recent decisions', count: history.length, t: t),
                const SizedBox(height: 12),
                for (final r in history.take(20)) ...[
                  _TeamLeaveReviewedRow(req: r),
                  const SizedBox(height: 8),
                ],
              ],
            ],
          );
        },
      ),
    );
  }
}

class _TeamLeavesSectionHeader extends StatelessWidget {
  final String label;
  final int count;
  final RunqTokens t;
  const _TeamLeavesSectionHeader({required this.label, required this.count, required this.t});

  @override
  Widget build(BuildContext context) {
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
          child: Text('$count',
              style: RunqText.caption.copyWith(
                  color: t.muted, fontSize: 10.5, fontWeight: FontWeight.w700)),
        ),
      ],
    );
  }
}

class _TeamLeaveReviewedRow extends StatelessWidget {
  final HrLeaveRequest req;
  const _TeamLeaveReviewedRow({required this.req});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    final dateLabel = req.fromDate == req.toDate
        ? '${req.fromDate.day} ${m[req.fromDate.month - 1]}'
        : '${req.fromDate.day} ${m[req.fromDate.month - 1]} → ${req.toDate.day} ${m[req.toDate.month - 1]}';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(req.employeeName,
                    style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 13.5)),
                const SizedBox(height: 2),
                Text(
                  '${req.typeCode} · $dateLabel · ${req.totalDays.toStringAsFixed(req.totalDays % 1 == 0 ? 0 : 1)}d',
                  style: RunqText.caption.copyWith(color: t.muted, fontSize: 11.5),
                ),
              ],
            ),
          ),
          HrStatusBadge(status: req.status),
        ],
      ),
    );
  }
}
