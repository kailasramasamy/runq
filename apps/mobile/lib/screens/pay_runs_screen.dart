import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../api/api_client.dart';
import '../api/payrun_models.dart';
import '../api/payrun_repo.dart';
import '../providers/payrun_providers.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../utils/format_inr.dart';
import '../widgets/async_slot.dart';
import '../widgets/runq_card.dart';
import '../widgets/runq_snack.dart';
import '../widgets/section_head.dart';
import '../widgets/status_pill.dart';

class PayRunsScreen extends ConsumerWidget {
  const PayRunsScreen({super.key});

  Future<void> _refresh(WidgetRef ref) async {
    ref.invalidate(payRunQueueProvider);
    ref.invalidate(payRunListProvider);
    await ref.read(payRunQueueProvider.future).catchError((_) => throw 0);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final queue = ref.watch(payRunQueueProvider);
    final runs = ref.watch(payRunListProvider);
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          color: RT(context).brand,
          onRefresh: () => _refresh(ref),
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
            slivers: [
              const SliverToBoxAdapter(child: _Header()),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                sliver: SliverToBoxAdapter(
                  child: AsyncSlot<PaymentQueue>(
                    value: queue,
                    onRetry: () => ref.invalidate(payRunQueueProvider),
                    data: (q) => _QueueHero(summary: q.summary),
                  ),
                ),
              ),
              SliverToBoxAdapter(
                child: AsyncSlot<PaymentQueue>(
                  value: queue,
                  onRetry: () => ref.invalidate(payRunQueueProvider),
                  data: (q) => _ScheduleSection(queue: q),
                ),
              ),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 24, 16, 8),
                sliver: SliverToBoxAdapter(
                  child: SectionHead(
                    title: 'Pay runs',
                    action: 'Refresh',
                    onAction: () => ref.invalidate(payRunListProvider),
                  ),
                ),
              ),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 120),
                sliver: SliverToBoxAdapter(
                  child: AsyncSlot<List<PaymentRun>>(
                    value: runs,
                    onRetry: () => ref.invalidate(payRunListProvider),
                    data: (list) {
                      if (list.isEmpty) {
                        return const EmptyState(
                          icon: Icons.payments_outlined,
                          title: 'No pay runs yet',
                          subtitle:
                              'Tap "Pay overdue bills" above to bundle payments into a run.',
                        );
                      }
                      return Column(
                        children: [
                          for (final r in list)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 8),
                              child: _RunRow(run: r),
                            ),
                        ],
                      );
                    },
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header();

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 12, 16, 16),
      child: Row(
        children: [
          IconButton(
            onPressed: () => Navigator.of(context).pop(),
            icon: Icon(Icons.arrow_back_rounded, color: t.ink),
          ),
          const SizedBox(width: 4),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('Outgoing payments',
                    style: RunqText.body.copyWith(color: t.muted)),
                Text('Pay runs', style: RunqText.h2.copyWith(color: t.ink)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _QueueHero extends StatelessWidget {
  final PaymentQueueSummary summary;
  const _QueueHero({required this.summary});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        gradient: RunqColors.heroGradient,
        borderRadius: BorderRadius.circular(RunqRadii.hero),
        boxShadow: const [
          BoxShadow(color: Color(0x331E1B4B), blurRadius: 24, offset: Offset(0, 8)),
        ],
      ),
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'TOTAL PAYABLE',
            style: RunqText.label.copyWith(
              color: Colors.white.withValues(alpha: 0.65),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            formatINR(summary.totalPayable),
            style: RunqText.display.copyWith(
                color: Colors.white, height: 1.05),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: _Stat(
                  label: 'Overdue',
                  value: formatINR(summary.overdueAmount, compact: true),
                  caption: '${summary.overdueCount} bills',
                  accent: const Color(0xFFFCA5A5),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _Stat(
                  label: 'Due this week',
                  value: formatINR(summary.dueThisWeek, compact: true),
                  caption: 'releasing soon',
                  accent: const Color(0xFFFCD34D),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  final String label, value, caption;
  final Color accent;
  const _Stat({
    required this.label,
    required this.value,
    required this.caption,
    required this.accent,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label,
              style: RunqText.caption.copyWith(
                color: Colors.white.withValues(alpha: 0.7),
              )),
          const SizedBox(height: 4),
          Text(value,
              style: RunqText.tabular(
                  size: 18, w: FontWeight.w700, color: Colors.white)),
          const SizedBox(height: 2),
          Text(caption,
              style: RunqText.caption.copyWith(color: accent),
              maxLines: 1,
              overflow: TextOverflow.ellipsis),
        ],
      ),
    );
  }
}

class _ScheduleSection extends ConsumerStatefulWidget {
  final PaymentQueue queue;
  const _ScheduleSection({required this.queue});

  @override
  ConsumerState<_ScheduleSection> createState() => _ScheduleSectionState();
}

class _ScheduleSectionState extends ConsumerState<_ScheduleSection> {
  bool _busy = false;

  Future<void> _scheduleOverdue() async {
    final overdue =
        widget.queue.bills.where((b) => b.daysOverdue > 0).toList();
    if (overdue.isEmpty) return;
    setState(() => _busy = true);
    final navigator = GoRouter.of(context);
    try {
      final run = await payRunRepo.createFromBills(
        overdue.map((b) => b.id).toList(),
        description: 'Overdue payments — ${DateTime.now().toIso8601String().substring(0, 10)}',
      );
      ref.invalidate(payRunListProvider);
      ref.invalidate(payRunQueueProvider);
      navigator.push('/purchases/pay-runs/${run.id}');
    } on ApiException catch (e) {
      if (!mounted) return;
      showRunqSnack(context, e.message, kind: SnackKind.error);
    } catch (_) {
      if (!mounted) return;
      showRunqSnack(context, "Couldn't create the pay run. Please try again.",
          kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final overdueCount = widget.queue.bills.where((b) => b.daysOverdue > 0).length;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(RunqRadii.card),
        child: InkWell(
          onTap: (overdueCount == 0 || _busy) ? null : _scheduleOverdue,
          borderRadius: BorderRadius.circular(RunqRadii.card),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: t.brand.withValues(alpha: 0.08),
              border: Border.all(color: t.brand.withValues(alpha: 0.4), width: 0.5),
              borderRadius: BorderRadius.circular(RunqRadii.card),
            ),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: RunqColors.indigo,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: _busy
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white),
                        )
                      : const Icon(Icons.flash_on_rounded,
                          color: Colors.white, size: 20),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        overdueCount == 0
                            ? 'Nothing overdue'
                            : 'Pay $overdueCount overdue ${overdueCount == 1 ? 'bill' : 'bills'}',
                        style: RunqText.bodyStrong.copyWith(color: t.ink),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        overdueCount == 0
                            ? 'Caught up. Nothing to schedule.'
                            : 'bundles overdue bills into a pay run',
                        style: RunqText.caption.copyWith(color: t.muted),
                      ),
                    ],
                  ),
                ),
                if (overdueCount > 0)
                  Icon(Icons.chevron_right_rounded, color: t.muted2, size: 20),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _RunRow extends StatelessWidget {
  final PaymentRun run;
  const _RunRow({required this.run});

  String _date(DateTime d) {
    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return '${d.day} ${m[d.month - 1]}';
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return RunqCard(
      onTap: () => context.push('/purchases/pay-runs/${run.id}'),
      padding: const EdgeInsets.all(14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(run.runId,
                    style: RunqText.bodyStrong.copyWith(color: t.ink),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis),
                const SizedBox(height: 4),
                Text(
                  '${run.totalCount} ${run.totalCount == 1 ? 'line' : 'lines'} · ${_date(run.createdAt)}',
                  style: RunqText.caption.copyWith(color: t.muted),
                ),
                const SizedBox(height: 8),
                StatusPill(run.status, warning: run.status == 'draft'),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(formatINR(run.totalAmount, compact: true),
              style: RunqText.tabular(
                  size: 16, w: FontWeight.w700, color: t.ink)),
        ],
      ),
    );
  }
}
