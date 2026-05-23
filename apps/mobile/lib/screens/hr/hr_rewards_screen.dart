// Rewards & Spot Bonus screen.
//
// MANAGER view: list of rewards initiated by/for their team + FAB to initiate.
// EMPLOYEE view: celebratory view of rewards they received (HrEmployeeRewardsView).
//
// HR approval happens on the web. Status lifecycle:
//   draft → submitted → approved → rejected / posted → paid
//
// On initiate: creates a draft then immediately submits it.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/hr_models.dart';
import '../../api/hr_repo.dart';
import '../../providers/hr_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart' show showRunqSnack, SnackKind;
import 'widgets/hr_colors.dart';
import 'widgets/hr_employee_rewards_view.dart';
import 'widgets/hr_manager_rewards_list.dart';
import 'widgets/hr_reward_form.dart';

// ─── Screen ───────────────────────────────────────────────────────────────

class HrRewardsScreen extends ConsumerStatefulWidget {
  const HrRewardsScreen({super.key});

  @override
  ConsumerState<HrRewardsScreen> createState() => _HrRewardsScreenState();
}

class _HrRewardsScreenState extends ConsumerState<HrRewardsScreen> {
  bool _submitting = false;

  void _invalidate() => ref.invalidate(hrRewardsProvider);

  Future<void> _refresh() async {
    _invalidate();
    await Future<void>.delayed(const Duration(milliseconds: 250));
  }

  Future<void> _onInitiate() async {
    final me = ref.read(hrMeProvider).asData?.value;
    if (me == null) return;

    final teamFuture = hrRepo.employees(status: 'active', limit: 200);
    final typesFuture = hrRepo.rewardTypes(activeOnly: true);
    final results = await Future.wait([teamFuture, typesFuture]);
    final teamPage = results[0] as HrEmployeeListPage;
    final types = results[1] as List<HrRewardType>;

    final myEmpId = me.employee?.id;
    final teamList = teamPage.data.where((e) => e.id != myEmpId).toList();

    if (!mounted) return;

    final result = await showInitiateRewardSheet(
      context,
      teamMembers: teamList,
      rewardTypes: types,
    );

    if (result == null || !mounted) return;

    setState(() => _submitting = true);
    try {
      final created = await hrRepo.createReward(
        employeeId: result.employeeId,
        rewardTypeId: result.rewardTypeId,
        amount: result.amount,
        title: result.title,
        citation: result.citation,
        awardDate: result.awardDate,
      );
      await hrRepo.submitReward(created.id);
      _invalidate();
      if (mounted) showRunqSnack(context, 'Reward submitted for HR approval');
    } catch (e) {
      if (mounted) showRunqSnack(context, 'Error: $e', kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _onDelete(HrReward reward) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete reward?'),
        content: const Text('This action cannot be undone.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text(
              'Delete',
              style: TextStyle(color: Color(0xFFDC2626)),
            ),
          ),
        ],
      ),
    );
    if (confirm != true || !mounted) return;
    try {
      await hrRepo.deleteReward(reward.id);
      _invalidate();
      if (mounted) showRunqSnack(context, 'Reward deleted');
    } catch (e) {
      if (mounted) showRunqSnack(context, 'Error: $e', kind: SnackKind.error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final me = ref.watch(hrMeProvider).asData?.value;
    final isManager = me?.isManager ?? false;
    final myEmpId = me?.employee?.id;

    final query = isManager
        ? const HrRewardsQuery()
        : HrRewardsQuery(employeeId: myEmpId ?? '');

    final rewardsAsync = ref.watch(hrRewardsProvider(query));

    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: AppBar(
        title: const Text('Rewards'),
        leading: Navigator.of(context).canPop()
            ? IconButton(
                icon: const Icon(Icons.arrow_back_rounded),
                onPressed: () => Navigator.of(context).pop(),
              )
            : null,
      ),
      floatingActionButton: isManager ? _managerFab() : null,
      body: isManager
          ? _managerBody(context, t, rewardsAsync, myEmpId)
          : _employeeBody(context, t, rewardsAsync),
    );
  }

  Widget _managerFab() {
    return FloatingActionButton.extended(
      onPressed: _submitting ? null : _onInitiate,
      backgroundColor: HrColors.teal,
      icon: _submitting
          ? const SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
            )
          : const Icon(Icons.star_rounded, color: Colors.white),
      label: Text(
        'Initiate reward',
        style: RunqText.bodyStrong.copyWith(color: Colors.white),
      ),
    );
  }

  Widget _managerBody(
    BuildContext context,
    RunqTokens t,
    AsyncValue<List<HrReward>> async,
    String? myEmpId,
  ) {
    return RefreshIndicator(
      color: HrColors.brand(context),
      onRefresh: _refresh,
      child: async.when(
        loading: () =>
            const Center(child: CircularProgressIndicator(color: HrColors.teal)),
        error: (e, _) =>
            Center(child: Text('$e', style: RunqText.body.copyWith(color: t.muted))),
        data: (all) => HrManagerRewardsList(
          rewards: all,
          myEmployeeId: myEmpId,
          onDelete: _onDelete,
        ),
      ),
    );
  }

  Widget _employeeBody(
    BuildContext context,
    RunqTokens t,
    AsyncValue<List<HrReward>> async,
  ) {
    return async.when(
      loading: () =>
          const Center(child: CircularProgressIndicator(color: HrColors.teal)),
      error: (e, _) =>
          Center(child: Text('$e', style: RunqText.body.copyWith(color: t.muted))),
      data: (all) => HrEmployeeRewardsView(rewards: all, onRefresh: _refresh),
    );
  }
}
