import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../api/api_client.dart';
import '../api/models.dart';
import '../api/repos.dart';
import '../providers/data_providers.dart';
import '../theme/runq_tokens.dart';
import '../theme/runq_theme.dart';
import '../utils/format_inr.dart';
import '../widgets/async_slot.dart';
import '../widgets/runq_card.dart';
import '../widgets/runq_snack.dart';

class ApprovalsScreen extends ConsumerStatefulWidget {
  const ApprovalsScreen({super.key});

  @override
  ConsumerState<ApprovalsScreen> createState() => _ApprovalsScreenState();
}

class _ApprovalsScreenState extends ConsumerState<ApprovalsScreen> {
  final Set<String> _confirming = {};

  Future<void> _decide(ApprovalInstance a, bool approve) async {
    final step = a.currentPendingStep;
    if (step == null) return;
    setState(() => _confirming.add(a.id));
    try {
      await approvalsRepo.decide(stepId: step.id, instanceId: a.id, approve: approve);
      await Future.delayed(const Duration(milliseconds: 250));
      if (!mounted) return;
      ref.invalidate(pendingApprovalsProvider);
    } on ApiException catch (e) {
      if (!mounted) return;
      showRunqSnack(context, e.message, kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _confirming.remove(a.id));
    }
  }

  String _ago(DateTime t) {
    final now = DateTime.now();
    final diff = now.difference(t);
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    return '${diff.inDays}d ago';
  }

  @override
  Widget build(BuildContext context) {
    final value = ref.watch(pendingApprovalsProvider);
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            _Header(count: value.maybeWhen(data: (l) => l.length, orElse: () => 0)),
            Expanded(
              child: RefreshIndicator(
                color: RT(context).brand,
                onRefresh: () async {
                  ref.invalidate(pendingApprovalsProvider);
                  await ref.read(pendingApprovalsProvider.future).catchError((_) => throw 0);
                },
                child: AsyncSlot<List<ApprovalInstance>>(
                  value: value,
                  onRetry: () => ref.invalidate(pendingApprovalsProvider),
                  data: (items) {
                    if (items.isEmpty) {
                      return ListView(children: const [
                        SizedBox(height: 80),
                        EmptyState(
                          icon: Icons.task_alt_rounded,
                          title: 'All caught up',
                          subtitle: 'No approvals waiting on you.',
                        ),
                      ]);
                    }
                    return ListView.separated(
                      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                      itemCount: items.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 10),
                      itemBuilder: (_, i) {
                        final a = items[i];
                        return _ApprovalCard(
                          approval: a,
                          ago: _ago(a.requestedAt),
                          confirming: _confirming.contains(a.id),
                          onApprove: () => _decide(a, true),
                          onDecline: () => _decide(a, false),
                        );
                      },
                    );
                  },
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  final int count;
  const _Header({required this.count});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 8, 12),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.close_rounded),
            onPressed: () => context.pop(),
          ),
          const SizedBox(width: 4),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('Approvals', style: RunqText.h2),
              Text('Pending ($count)', style: RunqText.caption),
            ],
          ),
          const Spacer(),
        ],
      ),
    );
  }
}

class _ApprovalCard extends StatelessWidget {
  final ApprovalInstance approval;
  final String ago;
  final bool confirming;
  final VoidCallback onApprove, onDecline;
  const _ApprovalCard({
    required this.approval,
    required this.ago,
    required this.confirming,
    required this.onApprove,
    required this.onDecline,
  });

  IconData _kindIcon() => switch (approval.entityType) {
        'purchase_invoice' || 'bill' => Icons.description_outlined,
        'payment' => Icons.payments_outlined,
        'sales_invoice' || 'invoice' => Icons.receipt_long_outlined,
        _ => Icons.task_alt_rounded,
      };

  String _refLabel() {
    if (approval.entityRef != null && approval.entityRef!.isNotEmpty) return approval.entityRef!;
    return '${approval.entityType.toUpperCase()} · ${approval.entityId.substring(0, approval.entityId.length.clamp(0, 8))}';
  }

  @override
  Widget build(BuildContext context) {
    return RunqCard(
      padding: const EdgeInsets.all(14),
      child: AnimatedSwitcher(
        duration: const Duration(milliseconds: 280),
        child: confirming
            ? const _ConfirmedState()
            : Column(
                key: const ValueKey('open'),
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(_kindIcon(), size: 16, color: RT(context).muted),
                      const SizedBox(width: 6),
                      Flexible(
                        child: Text(_refLabel(),
                            maxLines: 1, overflow: TextOverflow.ellipsis,
                            style: RunqText.bodyStrong),
                      ),
                      const Spacer(),
                      Text(ago, style: RunqText.caption.copyWith(color: RT(context).muted2)),
                    ],
                  ),
                  const SizedBox(height: 10),
                  if (approval.entityWho != null)
                    Text(approval.entityWho!, style: RunqText.bodyStrong),
                  if (approval.amount != null) ...[
                    const SizedBox(height: 4),
                    Text(formatINR(approval.amount!), style: RunqText.tabular(size: 22, w: FontWeight.w700)),
                  ],
                  const SizedBox(height: 6),
                  Text('${approval.requestedBy} requested', style: RunqText.caption),
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      Expanded(
                        child: SizedBox(
                          height: 44,
                          child: OutlinedButton(
                            onPressed: onDecline,
                            style: OutlinedButton.styleFrom(
                              side: BorderSide(color: RunqColors.redInk.withValues(alpha: 0.3), width: 0.5),
                              foregroundColor: RunqColors.redInk,
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                            ),
                            child: const Text('Decline'),
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: SizedBox(
                          height: 44,
                          child: FilledButton(
                            onPressed: onApprove,
                            style: FilledButton.styleFrom(backgroundColor: RunqColors.greenInk),
                            child: const Text('Approve'),
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
      ),
    );
  }
}

class _ConfirmedState extends StatelessWidget {
  const _ConfirmedState();

  @override
  Widget build(BuildContext context) {
    return Padding(
      key: ValueKey('confirmed'),
      padding: EdgeInsets.symmetric(vertical: 16),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          SizedBox(
            width: 18, height: 18,
            child: CircularProgressIndicator(strokeWidth: 2, color: RT(context).brand),
          ),
          const SizedBox(width: 10),
          Text('Submitting…', style: RunqText.bodyStrong),
        ],
      ),
    );
  }
}
