// Dedicated Leave screen — the destination of the Home "Leaves" quick
// action. For a manager:
//   - Pending team approvals are pinned ABOVE the tab bar, so a manager
//     arriving from an approval notification sees them whichever tab is
//     active (the request would otherwise be buried in a non-default tab).
//   - Two tabs: "My leaves" (own balances + requests) and "Team" (the
//     team's recent leave decisions).
// A non-manager sees the "My leaves" content with no pinned region or
// tab bar. Replaces the old Pay > Leave / Pay > Approvals sub-tabs.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/hr_models.dart';
import '../../api/hr_repo.dart';
import '../../providers/hr_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart';
import 'widgets/hr_colors.dart';
import 'widgets/hr_leave_widgets.dart';
import 'widgets/hr_widgets.dart';

class HrLeaveScreen extends ConsumerStatefulWidget {
  const HrLeaveScreen({super.key});

  @override
  ConsumerState<HrLeaveScreen> createState() => _HrLeaveScreenState();
}

class _HrLeaveScreenState extends ConsumerState<HrLeaveScreen> {
  // 0 = My leaves, 1 = Team. Only meaningful for a manager — a plain
  // employee never sees the tab bar and stays on the My leaves view.
  int _tab = 0;

  @override
  void initState() {
    super.initState();
    // Opening the screen fresh — e.g. from a notification tap about a
    // leave decision — should show current data, not whatever a prior
    // visit left cached. Deferred a frame: ref.invalidate reads an
    // inherited widget, which is illegal during initState.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      ref.invalidate(hrPendingLeaveRequestsProvider);
      ref.invalidate(hrReviewedLeaveRequestsProvider);
      ref.invalidate(hrMyLeaveRequestsProvider);
      ref.invalidate(hrMyLeaveBalancesProvider);
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final me = ref.watch(hrMeProvider).asData?.value;
    final myEmployeeId = me?.employee?.id;
    final systemRole = me?.systemRole.toLowerCase();
    final isAdminHr = systemRole == 'owner'
        || systemRole == 'accountant'
        || systemRole == 'hr';
    // Who gets the team surface: line managers (have direct reports) AND
    // admin / HR — the latter approve leave org-wide even with no reports
    // of their own. Gating on `isManager` alone hid the approval queue
    // from an owner / HR user, so a leave notification led to a screen
    // with no visible request to action.
    final canReviewTeam = (me?.isManager ?? false) || isAdminHr;
    // Separation of duties — a reviewer can't approve their own request,
    // so it's excluded from the pinned queue (it shows on My leaves).
    final pending = canReviewTeam
        ? (ref.watch(hrPendingLeaveRequestsProvider).asData?.value ?? const [])
            .where((r) => myEmployeeId == null || r.employeeId != myEmployeeId)
            .toList()
        : const <HrLeaveRequest>[];

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
                    // Fall back to HR home when there's nothing to pop —
                    // e.g. landed here cold from a push-notification tap.
                    onPressed: () => Navigator.of(context).canPop()
                        ? Navigator.of(context).pop()
                        : context.go('/hr/home'),
                    icon: Icon(Icons.arrow_back_rounded, color: t.ink),
                  ),
                  const SizedBox(width: 4),
                  Text('Leave', style: RunqText.h1.copyWith(color: t.ink)),
                ],
              ),
            ),
            if (pending.isNotEmpty)
              ConstrainedBox(
                // Cap so a long queue can't crowd out the tabs — the list
                // scrolls within this region once it exceeds the cap.
                constraints: BoxConstraints(
                  maxHeight: MediaQuery.of(context).size.height * 0.4,
                ),
                child: _PendingApprovals(
                  pending: pending,
                  // After a decision the request moves to "Recent
                  // decisions" — jump there so the manager sees the
                  // outcome land. Remaining pendings stay pinned above.
                  onReviewed: () => setState(() => _tab = 1),
                ),
              ),
            if (canReviewTeam) ...[
              HrSubTabs(
                labels: const ['My leaves', 'Team'],
                active: _tab,
                onChange: (i) => setState(() => _tab = i),
              ),
              const SizedBox(height: 4),
            ],
            Expanded(
              child: canReviewTeam
                  ? IndexedStack(
                      index: _tab,
                      children: const [_MyLeaveTab(), _TeamDecisionsTab()],
                    )
                  : const _MyLeaveTab(),
            ),
          ],
        ),
      ),
      // Applying leave is a "my leave" action — hidden on the Team tab.
      floatingActionButton: (!canReviewTeam || _tab == 0)
          ? FloatingActionButton.extended(
              heroTag: 'apply-leave',
              backgroundColor: HrColors.teal,
              foregroundColor: Colors.white,
              icon: const Icon(Icons.event_available_rounded),
              label: const Text('Apply leave'),
              onPressed: _openApplyLeave,
            )
          : null,
    );
  }

  Future<void> _openApplyLeave() async {
    final types = await ref.read(hrMyLeaveTypesProvider.future);
    final tlist = types.map((lt) => (id: lt.id, code: lt.code, name: lt.name)).toList();
    if (!mounted) return;
    final res = await showApplyLeaveSheet(context, leaveTypes: tlist);
    if (res == null) return;
    final empId = ref.read(hrMeProvider).asData?.value.employee?.id;
    if (empId == null) {
      if (mounted) showRunqSnack(context, 'No employee record linked', kind: SnackKind.error);
      return;
    }
    try {
      await hrRepo.applyLeave(
        employeeId: empId,
        leaveTypeId: res.leaveTypeId,
        fromDate: res.fromDate,
        toDate: res.toDate,
        halfDay: res.halfDay,
        reason: res.reason,
      );
      ref.invalidate(hrMyLeaveRequestsProvider);
      ref.invalidate(hrMyLeaveBalancesProvider);
      if (mounted) showRunqSnack(context, 'Leave request submitted', kind: SnackKind.success);
    } catch (e) {
      if (mounted) showRunqSnack(context, '$e', kind: SnackKind.error);
    }
  }
}

// ─── Pinned pending approvals ─────────────────────────────────────────────

class _PendingApprovals extends ConsumerWidget {
  final List<HrLeaveRequest> pending;
  /// Called after a request is successfully approved or rejected.
  final VoidCallback onReviewed;
  const _PendingApprovals({required this.pending, required this.onReviewed});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: t.hairline, width: 0.5)),
      ),
      child: ListView(
        shrinkWrap: true,
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 14),
        physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
        children: [
          HrLeaveSubHeader(label: 'Pending approval', count: pending.length, t: t),
          const SizedBox(height: 12),
          for (final r in pending) ...[
            _pendingCard(context, ref, r),
            if (r != pending.last) const SizedBox(height: 10),
          ],
        ],
      ),
    );
  }

  Widget _pendingCard(BuildContext context, WidgetRef ref, HrLeaveRequest r) =>
      HrPendingLeaveCard(
        // Stable per-request key — without it, approving the top card
        // (which fades itself out) makes the shrunk list reuse that
        // faded-out State for the next request, rendering it invisible.
        key: ValueKey(r.id),
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
          var ok = true;
          try {
            await hrRepo.reviewLeave(
              id: r.id,
              approved: approved,
              rejectionReason: approved ? null : 'Rejected from mobile',
            );
          } catch (_) {
            ok = false;
            if (context.mounted) {
              showRunqSnack(context, 'Could not update request', kind: SnackKind.error);
            }
          }
          ref.invalidate(hrPendingLeaveRequestsProvider);
          ref.invalidate(hrReviewedLeaveRequestsProvider);
          ref.invalidate(hrWhoIsOutTodayProvider);
          ref.invalidate(hrRecentActivityProvider);
          // Only switch tabs if the decision actually went through — a
          // failed call leaves the request pending, not decided.
          if (ok) onReviewed();
        },
      );
}

// ─── My leaves tab ────────────────────────────────────────────────────────

class _MyLeaveTab extends ConsumerWidget {
  const _MyLeaveTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final balances = ref.watch(hrMyLeaveBalancesProvider);
    final reqs = ref.watch(hrMyLeaveRequestsProvider);
    return RefreshIndicator(
      color: HrColors.brand(context),
      onRefresh: () async {
        ref.invalidate(hrMyLeaveBalancesProvider);
        ref.invalidate(hrMyLeaveRequestsProvider);
        await Future<void>.delayed(const Duration(milliseconds: 250));
      },
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 140),
        physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
        children: [
          balances.when(
            data: (rows) => rows.isEmpty
                ? Text('No leave balances', style: RunqText.body.copyWith(color: t.muted))
                : HrLeaveBalancePills(rows: rows),
            loading: () => const SizedBox.shrink(),
            error: (_, __) => const SizedBox.shrink(),
          ),
          const SizedBox(height: 24),
          reqs.when(
            data: (rows) => _requests(rows, t),
            loading: () => const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Center(child: CircularProgressIndicator()),
            ),
            error: (e, _) => Text('$e', style: RunqText.body.copyWith(color: t.muted)),
          ),
        ],
      ),
    );
  }

  // Split into Active (pending, or approved still upcoming / in progress)
  // vs History (approved-past, rejected, cancelled). Both newest-applied
  // first so the most recent action sits at the top of its section.
  Widget _requests(List<HrLeaveRequest> rows, RunqTokens t) {
    if (rows.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 24),
        child: Center(child: Text('No leave requests yet',
            style: RunqText.body.copyWith(color: t.muted))),
      );
    }
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final active = <HrLeaveRequest>[];
    final history = <HrLeaveRequest>[];
    for (final r in rows) {
      final isActive = r.status == 'pending' ||
          (r.status == 'approved' && !r.toDate.isBefore(today));
      (isActive ? active : history).add(r);
    }
    int byApplied(HrLeaveRequest a, HrLeaveRequest b) =>
        (b.appliedAt?.millisecondsSinceEpoch ?? 0)
            .compareTo(a.appliedAt?.millisecondsSinceEpoch ?? 0);
    active.sort(byApplied);
    history.sort(byApplied);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (active.isNotEmpty) ...[
          HrLeaveSubHeader(label: 'Active', count: active.length, t: t),
          const SizedBox(height: 4),
          ...active.map((r) => HrMyLeaveRow(req: r)),
        ],
        if (history.isNotEmpty) ...[
          SizedBox(height: active.isEmpty ? 0 : 24),
          HrLeaveSubHeader(label: 'History', count: history.length, t: t),
          const SizedBox(height: 4),
          ...history.map((r) => HrMyLeaveRow(req: r)),
        ],
      ],
    );
  }
}

// ─── Team tab — recent leave decisions ────────────────────────────────────

class _TeamDecisionsTab extends ConsumerWidget {
  const _TeamDecisionsTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final reviewedAsync = ref.watch(hrReviewedLeaveRequestsProvider);
    return RefreshIndicator(
      color: HrColors.brand(context),
      onRefresh: () async {
        ref.invalidate(hrReviewedLeaveRequestsProvider);
        ref.invalidate(hrPendingLeaveRequestsProvider);
        await Future<void>.delayed(const Duration(milliseconds: 250));
      },
      child: reviewedAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e', style: RunqText.body.copyWith(color: t.muted))),
        data: (reviewed) {
          final history = [...reviewed]..sort((a, b) =>
              (b.appliedAt?.millisecondsSinceEpoch ?? 0)
                  .compareTo(a.appliedAt?.millisecondsSinceEpoch ?? 0));
          if (history.isEmpty) {
            return ListView(
              physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
              padding: const EdgeInsets.fromLTRB(16, 60, 16, 140),
              children: [
                Center(child: Text('No leave decisions yet',
                    style: RunqText.body.copyWith(color: t.muted))),
              ],
            );
          }
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 140),
            physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
            children: [
              HrLeaveSubHeader(label: 'Recent decisions', count: history.length, t: t),
              const SizedBox(height: 12),
              for (final r in history.take(20)) ...[
                HrReviewedLeaveRow(req: r),
                const SizedBox(height: 8),
              ],
            ],
          );
        },
      ),
    );
  }
}
