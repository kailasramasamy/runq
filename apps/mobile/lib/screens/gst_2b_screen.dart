import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/models.dart';
import '../api/repos.dart';
import '../providers/data_providers.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../utils/format_inr.dart';
import '../widgets/async_slot.dart';
import '../widgets/runq_card.dart';
import '../widgets/runq_snack.dart';

final _periodProvider = StateProvider<String>((_) {
  final now = DateTime.now();
  // Default to previous month — that's when 2B is published.
  final d = DateTime(now.year, now.month - 1, 1);
  return '${d.month.toString().padLeft(2, '0')}${d.year}';
});

final _statusProvider = StateProvider<String>((_) => 'matched');

class Gst2bScreen extends ConsumerStatefulWidget {
  const Gst2bScreen({super.key});

  @override
  ConsumerState<Gst2bScreen> createState() => _Gst2bScreenState();
}

class _Gst2bScreenState extends ConsumerState<Gst2bScreen> {
  bool _busyPull = false;
  bool _busyReconcile = false;

  Future<void> _pull() async {
    final period = ref.read(_periodProvider);
    setState(() => _busyPull = true);
    try {
      await gstRepo.pull2b(period);
      if (!mounted) return;
      ref.invalidate(gst2bSummaryProvider(period));
      ref.invalidate(gst2bMatchesProvider(Gstr2bFilter(period: period)));
      showRunqSnack(context, '2B pulled from GSTN', kind: SnackKind.success);
    } catch (e) {
      if (!mounted) return;
      showRunqSnack(context, "Couldn't pull: $e", kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busyPull = false);
    }
  }

  Future<void> _reconcile() async {
    final period = ref.read(_periodProvider);
    setState(() => _busyReconcile = true);
    try {
      await gstRepo.reconcile2b(period);
      if (!mounted) return;
      ref.invalidate(gst2bSummaryProvider(period));
      ref.invalidate(gst2bMatchesProvider(Gstr2bFilter(period: period)));
      showRunqSnack(context, 'Reconciled with books', kind: SnackKind.success);
    } catch (e) {
      if (!mounted) return;
      showRunqSnack(context, "Couldn't reconcile: $e", kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busyReconcile = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final period = ref.watch(_periodProvider);
    final status = ref.watch(_statusProvider);
    final summary = ref.watch(gst2bSummaryProvider(period));
    final matches =
        ref.watch(gst2bMatchesProvider(Gstr2bFilter(period: period, status: status)));

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          color: t.brand,
          onRefresh: () async {
            ref.invalidate(gst2bSummaryProvider(period));
            ref.invalidate(gst2bMatchesProvider(Gstr2bFilter(period: period)));
            await ref.read(gst2bSummaryProvider(period).future).catchError((_) => throw 0);
          },
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
            slivers: [
              SliverToBoxAdapter(
                child: _Header(
                  busyPull: _busyPull,
                  busyReconcile: _busyReconcile,
                  onPull: _pull,
                  onReconcile: _reconcile,
                ),
              ),
              SliverToBoxAdapter(child: _PeriodPicker(period: period)),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
                sliver: SliverToBoxAdapter(
                  child: AsyncSlot<Gstr2bSummary>(
                    value: summary,
                    onRetry: () => ref.invalidate(gst2bSummaryProvider(period)),
                    data: (s) => _SummaryCard(summary: s),
                  ),
                ),
              ),
              SliverToBoxAdapter(
                child: _StatusTabs(
                  summary: summary.maybeWhen(data: (s) => s, orElse: () => null),
                  value: status,
                  onChange: (v) => ref.read(_statusProvider.notifier).state = v,
                ),
              ),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 120),
                sliver: SliverToBoxAdapter(
                  child: AsyncSlot<List<Gstr2bMatch>>(
                    value: matches,
                    onRetry: () => ref.invalidate(
                        gst2bMatchesProvider(Gstr2bFilter(period: period, status: status))),
                    data: (rows) {
                      if (rows.isEmpty) {
                        return RunqCard(
                          child: EmptyState(
                            icon: Icons.task_alt_rounded,
                            title: _emptyTitle(status),
                            subtitle: 'Pull 2B and reconcile to populate this view.',
                          ),
                        );
                      }
                      return RunqCard(
                        padding: EdgeInsets.zero,
                        child: Column(
                          children: [
                            for (var i = 0; i < rows.length; i++) ...[
                              _MatchRow(match: rows[i]),
                              if (i < rows.length - 1)
                                Divider(height: 1, thickness: 0.6, color: t.hairline),
                            ],
                          ],
                        ),
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

  String _emptyTitle(String s) => switch (s) {
        'matched' => 'No matches yet',
        'mismatched' => 'No mismatches',
        'not_in_books' => 'Nothing missing in books',
        'not_in_2b' => 'Nothing missing in 2B',
        _ => 'No data',
      };
}

class _Header extends StatelessWidget {
  final bool busyPull, busyReconcile;
  final VoidCallback onPull, onReconcile;
  const _Header({
    required this.busyPull,
    required this.busyReconcile,
    required this.onPull,
    required this.onReconcile,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 12, 16, 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
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
                Text('Reconciliation', style: RunqText.body.copyWith(color: t.muted)),
                Text('GSTR-2B', style: RunqText.h2.copyWith(color: t.ink)),
              ],
            ),
          ),
          PopupMenuButton<String>(
            tooltip: 'Actions',
            enabled: !busyPull && !busyReconcile,
            onSelected: (v) =>
                v == 'pull' ? onPull() : onReconcile(),
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'pull', child: Text('Pull 2B from GSTN')),
              PopupMenuItem(value: 'reconcile', child: Text('Reconcile with books')),
            ],
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                color: RunqColors.indigo,
                borderRadius: BorderRadius.circular(999),
              ),
              child: (busyPull || busyReconcile)
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white),
                    )
                  : Text('Actions',
                      style: RunqText.body
                          .copyWith(color: Colors.white)),
            ),
          ),
        ],
      ),
    );
  }
}

class _PeriodPicker extends ConsumerWidget {
  final String period;
  const _PeriodPicker({required this.period});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final options = _periodOptions();
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
      child: SizedBox(
        height: 36,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          itemCount: options.length,
          separatorBuilder: (_, __) => const SizedBox(width: 8),
          itemBuilder: (_, i) {
            final o = options[i];
            final active = o.value == period;
            return Material(
              color: Colors.transparent,
              borderRadius: BorderRadius.circular(999),
              child: InkWell(
                borderRadius: BorderRadius.circular(999),
                onTap: () => ref.read(_periodProvider.notifier).state = o.value,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  decoration: BoxDecoration(
                    color: active ? RunqColors.indigo : t.surface,
                    border: Border.all(
                      color: active ? RunqColors.indigo : t.hairline,
                      width: 0.5,
                    ),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  alignment: Alignment.center,
                  child: Text(
                    o.label,
                    style: RunqText.body.copyWith(
                      color: active ? Colors.white : t.ink,
                    ),
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }

  List<({String value, String label})> _periodOptions() {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    final now = DateTime.now();
    final out = <({String value, String label})>[];
    for (int i = 0; i < 12; i++) {
      final d = DateTime(now.year, now.month - i, 1);
      final mm = d.month.toString().padLeft(2, '0');
      out.add((value: '$mm${d.year}', label: '${months[d.month - 1]} ${d.year}'));
    }
    return out;
  }
}

class _SummaryCard extends StatelessWidget {
  final Gstr2bSummary summary;
  const _SummaryCard({required this.summary});

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
          Text('CLAIMABLE ITC',
              style: RunqText.label.copyWith(
                color: Colors.white.withValues(alpha: 0.65),
              )),
          const SizedBox(height: 8),
          Text(formatINR(summary.totalItcClaimable),
              style: RunqText.tabular(
                  size: 30, w: FontWeight.w700, color: Colors.white)
                .copyWith(height: 1.05)),
          const SizedBox(height: 4),
          Text(
            'of ${formatINR(summary.totalItcAvailable, compact: true)} available in 2B',
            style: RunqText.caption.copyWith(
              color: Colors.white.withValues(alpha: 0.65),
            ),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: _Stat(
                  label: 'Matched',
                  value: '${summary.matchedCount}',
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _Stat(
                  label: 'Mismatched',
                  value: '${summary.mismatchedCount}',
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _Stat(
                  label: 'Missing',
                  value: '${summary.notInBooksCount + summary.notIn2bCount}',
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
  final String label;
  final String value;
  const _Stat({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 10, 10, 10),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style: RunqText.caption.copyWith(
                color: Colors.white.withValues(alpha: 0.65),
              )),
          const SizedBox(height: 2),
          Text(value,
              style: RunqText.tabular(
                  size: 18, w: FontWeight.w700, color: Colors.white)),
        ],
      ),
    );
  }
}

class _StatusTabs extends StatelessWidget {
  final Gstr2bSummary? summary;
  final String value;
  final ValueChanged<String> onChange;
  const _StatusTabs({
    required this.summary,
    required this.value,
    required this.onChange,
  });

  @override
  Widget build(BuildContext context) {
    final tabs = <({String value, String label, int? count})>[
      (value: 'matched', label: 'Matched', count: summary?.matchedCount),
      (value: 'mismatched', label: 'Mismatched', count: summary?.mismatchedCount),
      (value: 'not_in_books', label: 'Missing in books', count: summary?.notInBooksCount),
      (value: 'not_in_2b', label: 'Missing in 2B', count: summary?.notIn2bCount),
    ];
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
      child: SizedBox(
        height: 36,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          itemCount: tabs.length,
          separatorBuilder: (_, __) => const SizedBox(width: 8),
          itemBuilder: (_, i) {
            final tt = tabs[i];
            final active = tt.value == value;
            final t = RT(context);
            return Material(
              color: Colors.transparent,
              borderRadius: BorderRadius.circular(999),
              child: InkWell(
                borderRadius: BorderRadius.circular(999),
                onTap: () => onChange(tt.value),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  decoration: BoxDecoration(
                    color: active ? RunqColors.indigo : t.surface,
                    border: Border.all(
                      color: active ? RunqColors.indigo : t.hairline,
                      width: 0.5,
                    ),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  alignment: Alignment.center,
                  child: Text(
                    tt.count == null ? tt.label : '${tt.label} · ${tt.count}',
                    style: RunqText.body.copyWith(
                      color: active ? Colors.white : t.ink,
                    ),
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

class _MatchRow extends StatelessWidget {
  final Gstr2bMatch match;
  const _MatchRow({required this.match});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final tax = match.igst2b + match.cgst2b + match.sgst2b;
    final dim = match.matchStatus == 'not_in_2b' ||
        match.matchStatus == 'not_in_books';
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Container(
            width: 32,
            height: 32,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: _statusBg(match.matchStatus, t),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(_statusIcon(match.matchStatus),
                size: 16, color: _statusInk(match.matchStatus)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  match.supplierName?.isNotEmpty == true
                      ? match.supplierName!
                      : match.supplierGstin,
                  style: RunqText.bodyStrong.copyWith(color: t.ink),
                  maxLines: 1, overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                Text(
                  _subtitle(match),
                  style: RunqText.caption.copyWith(color: t.muted2),
                  maxLines: 1, overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                formatINR(match.taxableValue2b, compact: true),
                style: RunqText.tabular(
                    size: 14,
                    w: FontWeight.w700,
                    color: dim ? t.muted : t.ink),
              ),
              const SizedBox(height: 2),
              Text(
                tax > 0 ? '+${formatINR(tax, compact: true)} tax' : '—',
                style: RunqText.caption.copyWith(color: t.muted2),
              ),
            ],
          ),
        ],
      ),
    );
  }

  String _subtitle(Gstr2bMatch m) {
    switch (m.matchStatus) {
      case 'mismatched':
        final diff = m.valueDiff ?? 0;
        return '${m.invoiceNumber2b} · diff ${formatINR(diff, compact: true)}';
      case 'not_in_books':
        return '${m.invoiceNumber2b} · only in 2B';
      case 'not_in_2b':
        return '${m.invoiceNumberBooks ?? '—'} · only in books';
      case 'matched':
      default:
        return m.invoiceNumber2b;
    }
  }

  Color _statusBg(String s, dynamic t) {
    switch (s) {
      case 'matched': return RunqColors.greenBg;
      case 'mismatched': return RunqColors.amberBg;
      case 'not_in_books':
      case 'not_in_2b':
        return RunqColors.redBg;
      default: return RunqColors.greenBg;
    }
  }

  Color _statusInk(String s) {
    switch (s) {
      case 'matched': return RunqColors.greenInk;
      case 'mismatched': return RunqColors.amberInk;
      case 'not_in_books':
      case 'not_in_2b':
        return RunqColors.redInk;
      default: return RunqColors.greenInk;
    }
  }

  IconData _statusIcon(String s) {
    switch (s) {
      case 'matched': return Icons.check_rounded;
      case 'mismatched': return Icons.compare_arrows_rounded;
      case 'not_in_books': return Icons.add_rounded;
      case 'not_in_2b': return Icons.remove_rounded;
      default: return Icons.help_outline_rounded;
    }
  }
}
