import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../api/models.dart';
import '../providers/data_providers.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../widgets/async_slot.dart';
import '../widgets/runq_card.dart';
import '../widgets/section_head.dart';
import 'gst/gst_status_chip.dart';

class GstHubScreen extends ConsumerWidget {
  const GstHubScreen({super.key});

  Future<void> _refresh(WidgetRef ref) async {
    ref.invalidate(gstReadinessProvider);
    ref.invalidate(gstReturnsProvider);
    await ref.read(gstReturnsProvider.future).catchError((_) => throw 0);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final readiness = ref.watch(gstReadinessProvider);
    final returns = ref.watch(gstReturnsProvider);

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
                  child: AsyncSlot<GstReadiness?>(
                    value: readiness,
                    onRetry: () => ref.invalidate(gstReadinessProvider),
                    data: (g) => g == null
                        ? const _NoGstinCard()
                        : _ReadinessCard(readiness: g),
                  ),
                ),
              ),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                sliver: SliverToBoxAdapter(child: _ReconcileTile()),
              ),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
                sliver: SliverToBoxAdapter(
                  child: SectionHead(
                    title: 'Returns',
                    action: 'See all',
                    onAction: () => context.push('/gst/returns'),
                  ),
                ),
              ),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 120),
                sliver: SliverToBoxAdapter(
                  child: AsyncSlot<List<GstReturn>>(
                    value: returns,
                    onRetry: () => ref.invalidate(gstReturnsProvider),
                    data: (list) => _RecentReturns(returns: list.take(6).toList()),
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
                Text('Compliance', style: RunqText.body.copyWith(color: t.muted)),
                Text('GST', style: RunqText.h2.copyWith(color: t.ink)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ReadinessCard extends StatelessWidget {
  final GstReadiness readiness;
  const _ReadinessCard({required this.readiness});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final score = readiness.score;
    final failing = readiness.firstFailingSignal;
    final days = readiness.daysToGstr1;
    final dueText = days == null
        ? null
        : days < 0
            ? 'Overdue'
            : 'Due in $days ${days == 1 ? 'day' : 'days'}';
    final passing = readiness.signals.where((s) => s.ok).length;
    final total = readiness.signals.length;

    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.card),
        border: Border.all(color: t.hairline, width: 0.5),
        boxShadow: RunqShadows.card,
      ),
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                'GSTR-1 · ${readiness.periodLabel.toUpperCase()}',
                style: RunqText.label.copyWith(
                  color: t.muted2, fontSize: 11, letterSpacing: 0.5,
                ),
              ),
              const Spacer(),
              if (dueText != null)
                Text(
                  dueText,
                  style: RunqText.caption.copyWith(
                    color: (days ?? 0) < 0 ? RunqColors.redInk : t.muted,
                    fontSize: 12,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            '$score% ready to file',
            style: RunqText.h2.copyWith(color: t.ink),
          ),
          const SizedBox(height: 4),
          Text(
            failing != null
                ? (failing.detail ?? failing.label)
                : '$passing of $total checks passing',
            style: RunqText.caption.copyWith(color: t.muted, fontSize: 12),
          ),
          const SizedBox(height: 14),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: (score / 100).clamp(0.0, 1.0),
              minHeight: 6,
              backgroundColor: t.hairlineSoft,
              valueColor: const AlwaysStoppedAnimation(RunqColors.indigo),
            ),
          ),
          if (readiness.signals.isNotEmpty) ...[
            const SizedBox(height: 16),
            Divider(height: 1, color: t.hairline),
            const SizedBox(height: 12),
            for (final s in readiness.signals.take(6)) _SignalRow(signal: s),
          ],
        ],
      ),
    );
  }
}

class _SignalRow extends StatelessWidget {
  final GstSignal signal;
  const _SignalRow({required this.signal});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final ok = signal.ok;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            ok ? Icons.check_circle_rounded : Icons.error_outline_rounded,
            size: 16,
            color: ok ? const Color(0xFF059669) : RunqColors.amberInk,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(signal.label,
                    style: RunqText.body.copyWith(color: t.ink, fontSize: 13)),
                if (!ok && signal.detail != null) ...[
                  const SizedBox(height: 2),
                  Text(signal.detail!,
                      style: RunqText.caption.copyWith(color: t.muted, fontSize: 11)),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ReconcileTile extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InkWell(
      borderRadius: BorderRadius.circular(RunqRadii.card),
      onTap: () => context.push('/gst/2b'),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: BorderRadius.circular(RunqRadii.card),
          border: Border.all(color: t.hairline, width: 0.5),
        ),
        child: Row(
          children: [
            Container(
              width: 40, height: 40,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: RunqColors.indigo.withValues(alpha: 0.10),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(
                Icons.sync_alt_rounded,
                color: RunqColors.indigo,
                size: 20,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('GSTR-2B reconciliation',
                      style: RunqText.bodyStrong.copyWith(color: t.ink)),
                  const SizedBox(height: 2),
                  Text('Match purchases against vendor uploads',
                      style: RunqText.caption.copyWith(color: t.muted, fontSize: 12)),
                ],
              ),
            ),
            Icon(Icons.chevron_right_rounded, color: t.muted2, size: 20),
          ],
        ),
      ),
    );
  }
}

class _NoGstinCard extends StatelessWidget {
  const _NoGstinCard();

  @override
  Widget build(BuildContext context) {
    return RunqCard(
      child: EmptyState(
        icon: Icons.receipt_long_outlined,
        title: 'GSTIN not configured',
        subtitle: 'Add your GSTIN in profile to see filing readiness.',
      ),
    );
  }
}

class _RecentReturns extends StatelessWidget {
  final List<GstReturn> returns;
  const _RecentReturns({required this.returns});

  @override
  Widget build(BuildContext context) {
    if (returns.isEmpty) {
      return const RunqCard(
        child: EmptyState(
          icon: Icons.history_rounded,
          title: 'No returns yet',
          subtitle: 'Generate a GSTR-1 or 3B draft to see it here.',
        ),
      );
    }
    return RunqCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          for (var i = 0; i < returns.length; i++) ...[
            _ReturnRow(ret: returns[i]),
            if (i < returns.length - 1)
              Divider(height: 1, thickness: 0.6, color: RT(context).hairline),
          ],
        ],
      ),
    );
  }
}

class _ReturnRow extends StatelessWidget {
  final GstReturn ret;
  const _ReturnRow({required this.ret});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final type = ret.returnType == 'gstr3b' ? 'GSTR-3B' : 'GSTR-1';
    return InkWell(
      onTap: () => context.push('/gst/returns/${ret.id}'),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('$type · ${ret.periodLabel}',
                      style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 14)),
                  if (ret.arn != null && ret.arn!.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text('ARN ${ret.arn}',
                        style: RunqText.caption.copyWith(color: t.muted2, fontSize: 11),
                        maxLines: 1, overflow: TextOverflow.ellipsis),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 8),
            GstStatusChip(status: ret.status),
            const SizedBox(width: 4),
            Icon(Icons.chevron_right_rounded, color: t.muted2, size: 20),
          ],
        ),
      ),
    );
  }
}
