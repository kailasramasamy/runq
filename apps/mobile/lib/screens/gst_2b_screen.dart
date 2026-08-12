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
import 'gst/gst_form_kit.dart';

final _periodProvider = StateProvider<String>((_) {
  final now = DateTime.now();
  // Default to previous month — that's when 2B is published.
  final d = DateTime(now.year, now.month - 1, 1);
  return '${d.month.toString().padLeft(2, '0')}${d.year}';
});

// Client-side list filter. 'all' shows every row; 'missing' combines the two
// missing statuses (not_in_books + not_in_2b) so it maps 1:1 to the hero's
// "Missing" stat.
final _statusProvider = StateProvider<String>((_) => 'all');

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
      showRunqSnack(context, friendlyGstError(e, "Couldn't pull 2B from GSTN."),
          kind: SnackKind.error);
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
      showRunqSnack(context, friendlyGstError(e, "Couldn't reconcile with books."),
          kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busyReconcile = false);
    }
  }

  /// Book a "not in books" 2B line as a draft purchase bill to claim its ITC.
  /// If the supplier GSTIN matches existing vendors, GSTN-side returns a
  /// vendor decision which we resolve with a dialog, then re-book.
  Future<void> _book(Gstr2bMatch match) async {
    final period = ref.read(_periodProvider);
    Future<void> invalidate() async {
      ref.invalidate(gst2bSummaryProvider(period));
      ref.invalidate(gst2bMatchesProvider(Gstr2bFilter(period: period)));
    }

    try {
      var res = await gstRepo.book2b(match.id);
      if (res['status'] == 'needs_vendor_decision') {
        if (!mounted) return;
        final candidates = (res['candidates'] as List? ?? const [])
            .whereType<Map>()
            .map((e) => e.cast<String, dynamic>())
            .toList();
        final choice = await _askVendorDecision(match, candidates);
        if (choice == null) return; // cancelled
        res = await gstRepo.book2b(
          match.id,
          vendorAction: choice.$1,
          existingVendorId: choice.$2,
        );
      }
      if (!mounted) return;
      await invalidate();
      showRunqSnack(context, 'Booked as a draft bill', kind: SnackKind.success);
    } catch (e) {
      if (!mounted) return;
      showRunqSnack(context, friendlyGstError(e, "Couldn't book this bill."),
          kind: SnackKind.error);
    }
  }

  /// Returns (vendorAction, existingVendorId?) or null if cancelled.
  Future<(String, String?)?> _askVendorDecision(
    Gstr2bMatch match,
    List<Map<String, dynamic>> candidates,
  ) {
    final t = RT(context);
    return showModalBottomSheet<(String, String?)>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => GstSheetShell(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Which vendor?', style: RunqText.h3.copyWith(color: t.ink)),
            const SizedBox(height: 4),
            Text(
              '${match.supplierName ?? match.supplierGstin} may already exist. '
              'Pick a match, or create a new vendor.',
              style: RunqText.caption.copyWith(color: t.muted),
            ),
            const SizedBox(height: 12),
            for (final c in candidates)
              ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                title: Text((c['name'] ?? c['gstin'] ?? '—').toString(),
                    style: RunqText.bodyStrong.copyWith(color: t.ink)),
                subtitle: Text(
                    [c['gstin'], c['reason']]
                        .where((e) => e != null && '$e'.isNotEmpty)
                        .join(' · '),
                    style: RunqText.caption.copyWith(color: t.muted2)),
                trailing: Icon(Icons.chevron_right_rounded, color: t.muted2),
                onTap: () => Navigator.pop(
                    ctx, ('use_existing', (c['id'] ?? '').toString())),
              ),
            const SizedBox(height: 4),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: () => Navigator.pop(ctx, ('create_new', null)),
                icon: const Icon(Icons.add_rounded, size: 18),
                label: const Text('Create new vendor'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final period = ref.watch(_periodProvider);
    final status = ref.watch(_statusProvider);
    final summary = ref.watch(gst2bSummaryProvider(period));
    // Fetch all rows once and filter client-side, so the 'Missing' filter can
    // combine both missing statuses and tab/stat switches are instant.
    final matches = ref.watch(gst2bMatchesProvider(Gstr2bFilter(period: period)));

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
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                sliver: SliverToBoxAdapter(
                  child: Text(
                    '2B is what your vendors reported selling to you. Matching your bills to it protects the tax credit you can claim.',
                    style: RunqText.caption.copyWith(color: RT(context).muted),
                  ),
                ),
              ),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
                sliver: SliverToBoxAdapter(
                  child: AsyncSlot<Gstr2bSummary>(
                    value: summary,
                    onRetry: () => ref.invalidate(gst2bSummaryProvider(period)),
                    data: (s) => _SummaryCard(
                      summary: s,
                      activeStatus: status,
                      onSelect: (v) => ref.read(_statusProvider.notifier).state = v,
                    ),
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
                        gst2bMatchesProvider(Gstr2bFilter(period: period))),
                    data: (allRows) {
                      final rows = _filterRows(allRows, status);
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
                              _MatchRow(
                                match: rows[i],
                                onBook: rows[i].matchStatus == 'not_in_books'
                                    ? () => _book(rows[i])
                                    : null,
                              ),
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
        'missing' => 'Nothing missing',
        'all' => 'No 2B rows yet',
        _ => 'No data',
      };

  List<Gstr2bMatch> _filterRows(List<Gstr2bMatch> rows, String status) =>
      switch (status) {
        'matched' => rows.where((r) => r.matchStatus == 'matched').toList(),
        'mismatched' => rows.where((r) => r.matchStatus == 'mismatched').toList(),
        'missing' => rows
            .where((r) =>
                r.matchStatus == 'not_in_books' || r.matchStatus == 'not_in_2b')
            .toList(),
        _ => rows, // 'all'
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
          _ActionsButton(
            busy: busyPull || busyReconcile,
            onPull: onPull,
            onReconcile: onReconcile,
          ),
        ],
      ),
    );
  }
}

/// Circular icon button that opens the actions bottom sheet. Shows a spinner
/// in place of the icon while a pull/reconcile is running.
class _ActionsButton extends StatelessWidget {
  final bool busy;
  final VoidCallback onPull, onReconcile;
  const _ActionsButton({
    required this.busy,
    required this.onPull,
    required this.onReconcile,
  });

  Future<void> _open(BuildContext context) async {
    final action = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const _ActionsSheet(),
    );
    if (action == 'pull') onPull();
    if (action == 'reconcile') onReconcile();
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      color: RunqColors.indigo,
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: busy ? null : () => _open(context),
        child: SizedBox(
          width: 40,
          height: 40,
          child: Center(
            child: busy
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white),
                  )
                : const Icon(Icons.more_horiz_rounded,
                    color: Colors.white, size: 20),
          ),
        ),
      ),
    );
  }
}

/// Bottom sheet listing the 2B actions. Returns the chosen action id (or null
/// on dismiss) so the caller runs it after the sheet closes.
class _ActionsSheet extends StatelessWidget {
  const _ActionsSheet();

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(22)),
        border: Border.all(color: t.hairline, width: 0.5),
        boxShadow: RunqShadows.sheet,
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(8, 8, 8, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: 8),
                decoration: BoxDecoration(
                  color: t.hairline,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              _ActionSheetItem(
                icon: Icons.cloud_download_outlined,
                tint: RunqColors.indigo,
                label: 'Pull 2B from GSTN',
                subtitle: 'Fetch the latest 2B from the portal',
                onTap: () => Navigator.pop(context, 'pull'),
              ),
              _ActionSheetItem(
                icon: Icons.sync_alt_rounded,
                tint: RunqColors.greenInk,
                label: 'Reconcile with books',
                subtitle: 'Match 2B against your purchase register',
                onTap: () => Navigator.pop(context, 'reconcile'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ActionSheetItem extends StatelessWidget {
  final IconData icon;
  final Color tint;
  final String label, subtitle;
  final VoidCallback onTap;
  const _ActionSheetItem({
    required this.icon,
    required this.tint,
    required this.label,
    required this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(RunqRadii.smallCard),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: tint.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, color: tint, size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(label,
                      style: RunqText.bodyStrong.copyWith(color: t.ink)),
                  const SizedBox(height: 2),
                  Text(subtitle,
                      style: RunqText.caption.copyWith(color: t.muted)),
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
  final String activeStatus;
  final ValueChanged<String> onSelect;
  const _SummaryCard({
    required this.summary,
    required this.activeStatus,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        gradient: RunqColors.heroGradient,
        borderRadius: BorderRadius.circular(RunqRadii.hero),
        boxShadow: RunqShadows.card,
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
                  active: activeStatus == 'matched',
                  onTap: () => onSelect('matched'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _Stat(
                  label: 'Mismatched',
                  value: '${summary.mismatchedCount}',
                  active: activeStatus == 'mismatched',
                  onTap: () => onSelect('mismatched'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _Stat(
                  label: 'Missing',
                  value: '${summary.notInBooksCount + summary.notIn2bCount}',
                  active: activeStatus == 'missing',
                  onTap: () => onSelect('missing'),
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
  final bool active;
  final VoidCallback onTap;
  const _Stat({
    required this.label,
    required this.value,
    required this.onTap,
    this.active = false,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.fromLTRB(10, 10, 10, 10),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: active ? 0.22 : 0.10),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: Colors.white.withValues(alpha: active ? 0.55 : 0.0),
              width: 1,
            ),
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
        ),
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
    final s = summary;
    final tabs = <({String value, String label, int? count})>[
      (
        value: 'all',
        label: 'All',
        count: s == null
            ? null
            : s.matchedCount + s.mismatchedCount + s.notInBooksCount + s.notIn2bCount,
      ),
      (value: 'matched', label: 'Matched', count: s?.matchedCount),
      (value: 'mismatched', label: 'Mismatched', count: s?.mismatchedCount),
      (
        value: 'missing',
        label: 'Missing',
        count: s == null ? null : s.notInBooksCount + s.notIn2bCount,
      ),
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
  /// Non-null only for bookable ("not in books") rows — tapping books a bill.
  final VoidCallback? onBook;
  const _MatchRow({required this.match, this.onBook});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final tax = match.igst2b + match.cgst2b + match.sgst2b;
    final dim = match.matchStatus == 'not_in_2b' ||
        match.matchStatus == 'not_in_books';
    final row = Padding(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Container(
            width: 32,
            height: 32,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: _statusBg(match.matchStatus, isDark),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(_statusIcon(match.matchStatus),
                size: 16, color: _statusInk(match.matchStatus, isDark)),
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
              if (onBook != null)
                Text('Book bill →',
                    style: RunqText.caption.copyWith(
                        color: RunqColors.indigo, fontWeight: FontWeight.w700))
              else
                Text(tax > 0 ? '+${formatINR(tax, compact: true)} tax' : '—',
                    style: RunqText.caption.copyWith(color: t.muted2)),
            ],
          ),
        ],
      ),
    );
    if (onBook == null) return row;
    return InkWell(onTap: onBook, child: row);
  }

  String _subtitle(Gstr2bMatch m) {
    switch (m.matchStatus) {
      case 'mismatched':
        final diff = m.valueDiff ?? 0;
        return '${m.invoiceNumber2b} · diff ${formatINR(diff, compact: true)}';
      case 'not_in_books':
        return '${m.invoiceNumber2b} · claim ITC — not in books';
      case 'not_in_2b':
        return '${m.invoiceNumberBooks ?? '—'} · only in books';
      case 'matched':
      default:
        return m.invoiceNumber2b;
    }
  }

  Color _statusBg(String s, bool isDark) {
    switch (s) {
      case 'matched':
        return isDark ? const Color(0x3310B981) : RunqColors.greenBg;
      case 'mismatched':
        return isDark ? const Color(0x33F59E0B) : RunqColors.amberBg;
      case 'not_in_books':
      case 'not_in_2b':
        return isDark ? const Color(0x22EF4444) : RunqColors.redBg;
      default:
        return isDark ? const Color(0x3310B981) : RunqColors.greenBg;
    }
  }

  Color _statusInk(String s, bool isDark) {
    switch (s) {
      case 'matched':
        return isDark ? const Color(0xFF34D399) : RunqColors.greenInk;
      case 'mismatched':
        return isDark ? const Color(0xFFFBBF24) : RunqColors.amberInk;
      case 'not_in_books':
      case 'not_in_2b':
        return isDark ? const Color(0xFFFCA5A5) : RunqColors.redInk;
      default:
        return isDark ? const Color(0xFF34D399) : RunqColors.greenInk;
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
