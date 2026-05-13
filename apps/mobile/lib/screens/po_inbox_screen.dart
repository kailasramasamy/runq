import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_slidable/flutter_slidable.dart';
import 'package:go_router/go_router.dart';
import '../api/api_client.dart';
import '../api/models.dart';
import '../api/repos.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../utils/format_inr.dart';
import '../widgets/avatar.dart';
import '../widgets/runq_snack.dart';
import '../widgets/swipe_action.dart';

final poInboxProvider = FutureProvider.autoDispose<List<PoInboxRow>>((ref) async {
  return poRepo.listInbox(limit: 100);
});

enum PoFilter { all, toReview, parsing, invoiced, errors }

extension on PoFilter {
  String get label => switch (this) {
        PoFilter.all => 'All',
        PoFilter.toReview => 'To review',
        PoFilter.parsing => 'Parsing',
        PoFilter.invoiced => 'Invoiced',
        PoFilter.errors => 'Errors',
      };
}

final _poFilterProvider = StateProvider.autoDispose<PoFilter>((_) => PoFilter.all);

bool _matchesFilter(PoInboxRow r, PoFilter f) {
  final s = r.displayStatus;
  switch (f) {
    case PoFilter.all:
      return true;
    case PoFilter.toReview:
      return s == 'ready' || s == 'needs review';
    case PoFilter.parsing:
      return s == 'parsing';
    case PoFilter.invoiced:
      return s == 'invoiced';
    case PoFilter.errors:
      return s == 'error' || s == 'rejected';
  }
}

class _PoSummary {
  final int toReview, parsing, invoiced, errors, total;
  final double pendingValue;
  const _PoSummary({
    required this.toReview,
    required this.parsing,
    required this.invoiced,
    required this.errors,
    required this.total,
    required this.pendingValue,
  });

  factory _PoSummary.from(List<PoInboxRow> rows) {
    int toReview = 0, parsing = 0, invoiced = 0, errors = 0;
    double pending = 0;
    for (final r in rows) {
      final s = r.displayStatus;
      if (s == 'ready' || s == 'needs review') {
        toReview++;
        pending += r.grandTotal ?? 0;
      } else if (s == 'parsing') {
        parsing++;
      } else if (s == 'invoiced') {
        invoiced++;
      } else if (s == 'error' || s == 'rejected') {
        errors++;
      }
    }
    return _PoSummary(
      toReview: toReview,
      parsing: parsing,
      invoiced: invoiced,
      errors: errors,
      total: rows.length,
      pendingValue: pending,
    );
  }
}

/// Mobile PO Inbox — paginated list of every PO upload (parsing, ready,
/// invoiced, error). Tap a row to open the parse review screen, or tap the
/// linked invoice chip on an invoiced row to jump straight to that invoice.
class PoInboxScreen extends ConsumerWidget {
  const PoInboxScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final inbox = ref.watch(poInboxProvider);
    final filter = ref.watch(_poFilterProvider);
    return Scaffold(
      backgroundColor: t.bgWarmer,
      appBar: AppBar(
        title: const Text('PO Inbox'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
          onPressed: () => context.pop(),
        ),
      ),
      body: SafeArea(
        child: RefreshIndicator(
          color: RunqColors.indigo,
          onRefresh: () async {
            ref.invalidate(poInboxProvider);
            await ref.read(poInboxProvider.future).catchError((_) => <PoInboxRow>[]);
          },
          child: inbox.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) {
              final msg = e is ApiException ? e.message : 'Could not load PO inbox';
              return _Centered(
                icon: Icons.error_outline_rounded,
                title: msg,
                action: 'Retry',
                onAction: () => ref.invalidate(poInboxProvider),
              );
            },
            data: (rows) {
              if (rows.isEmpty) {
                return const _Centered(
                  icon: Icons.inbox_outlined,
                  title: 'No POs yet',
                  subtitle:
                      'Share or upload a PO from a customer — it lands here, AI parses it, and you approve it into an invoice.',
                );
              }
              final summary = _PoSummary.from(rows);
              final visible = rows.where((r) => _matchesFilter(r, filter)).toList();
              return CustomScrollView(
                physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
                slivers: [
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
                    sliver: SliverToBoxAdapter(
                      child: _SummaryGrid(
                        summary: summary,
                        active: filter,
                        onTap: (f) => ref.read(_poFilterProvider.notifier).state = f,
                      ),
                    ),
                  ),
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(8, 14, 8, 6),
                    sliver: SliverToBoxAdapter(
                      child: _FilterChipRow(
                        active: filter,
                        onChanged: (f) => ref.read(_poFilterProvider.notifier).state = f,
                      ),
                    ),
                  ),
                  if (visible.isEmpty)
                    SliverToBoxAdapter(
                      child: _EmptyFilter(
                        label: filter.label,
                        onClear: () =>
                            ref.read(_poFilterProvider.notifier).state = PoFilter.all,
                      ),
                    )
                  else
                    SliverPadding(
                      padding: const EdgeInsets.fromLTRB(12, 4, 12, 24),
                      sliver: SliverList.separated(
                        itemCount: visible.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 8),
                        itemBuilder: (_, i) => _PoRow(
                          row: visible[i],
                          onAfterDelete: () => ref.invalidate(poInboxProvider),
                        ),
                      ),
                    ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}

class _SummaryGrid extends StatelessWidget {
  final _PoSummary summary;
  final PoFilter active;
  final ValueChanged<PoFilter> onTap;
  const _SummaryGrid({required this.summary, required this.active, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final tiles = <_SummaryStat>[
      _SummaryStat(
        label: 'To review',
        value: '${summary.toReview}',
        valueColor: summary.toReview > 0 ? RunqColors.indigo : t.muted,
        filter: PoFilter.toReview,
      ),
      _SummaryStat(
        label: 'Parsing',
        value: '${summary.parsing}',
        valueColor: summary.parsing > 0 ? const Color(0xFFB45309) : t.muted,
        filter: PoFilter.parsing,
      ),
      _SummaryStat(
        label: 'Invoiced',
        value: '${summary.invoiced}',
        valueColor: summary.invoiced > 0 ? RunqColors.greenInk : t.muted,
        filter: PoFilter.invoiced,
      ),
      _SummaryStat(
        label: 'Errors',
        value: '${summary.errors}',
        valueColor: summary.errors > 0 ? RunqColors.redInk : t.muted,
        filter: PoFilter.errors,
      ),
    ];

    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      clipBehavior: Clip.antiAlias,
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (var i = 0; i < tiles.length; i++) ...[
              if (i > 0)
                Container(
                  width: 1,
                  color: t.muted2.withValues(alpha: 0.25),
                ),
              Expanded(
                child: _SummaryCell(
                  stat: tiles[i],
                  active: active == tiles[i].filter,
                  onTap: () => onTap(active == tiles[i].filter
                      ? PoFilter.all
                      : tiles[i].filter),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _SummaryStat {
  final String label, value;
  final Color valueColor;
  final PoFilter filter;
  const _SummaryStat({
    required this.label,
    required this.value,
    required this.valueColor,
    required this.filter,
  });
}

class _SummaryCell extends StatelessWidget {
  final _SummaryStat stat;
  final bool active;
  final VoidCallback onTap;
  const _SummaryCell({
    required this.stat,
    required this.active,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Material(
      color: active ? stat.valueColor.withValues(alpha: 0.08) : Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 6),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(stat.label.toUpperCase(),
                  style: RunqText.caption.copyWith(
                    fontSize: 10.5, color: t.muted, letterSpacing: 0.5,
                    fontWeight: FontWeight.w700,
                  )),
              const SizedBox(height: 4),
              Text(stat.value,
                  style: RunqText.tabular(
                      size: 18, w: FontWeight.w700, color: stat.valueColor)),
            ],
          ),
        ),
      ),
    );
  }
}

class _FilterChipRow extends StatelessWidget {
  final PoFilter active;
  final ValueChanged<PoFilter> onChanged;
  const _FilterChipRow({required this.active, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 36,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 4),
        itemCount: PoFilter.values.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          final f = PoFilter.values[i];
          return _FilterChip(
            label: f.label,
            active: f == active,
            onTap: () => onChanged(f),
          );
        },
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  final String label;
  final bool active;
  final VoidCallback onTap;
  const _FilterChip({required this.label, required this.active, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
          decoration: BoxDecoration(
            color: active ? RunqColors.indigo : t.surface,
            border: Border.all(
              color: active ? RunqColors.indigo : t.hairline,
              width: 0.5,
            ),
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text(label,
              style: RunqText.bodyStrong.copyWith(
                color: active ? Colors.white : t.ink,
                fontSize: 12.5,
              )),
        ),
      ),
    );
  }
}

class _PoRow extends StatelessWidget {
  final PoInboxRow row;
  final VoidCallback onAfterDelete;
  const _PoRow({required this.row, required this.onAfterDelete});

  Future<void> _confirmDelete(BuildContext context) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete this PO?'),
        content: Text(
          row.reviewStatus == 'approved'
              ? 'This PO has already been converted to invoice ${row.approvedInvoiceNumber ?? ''}. Deleting the PO will not delete the invoice. Continue?'
              : 'This permanently removes the upload and parsed draft. The original file can be re-uploaded later.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    try {
      await poRepo.discard(row.id);
      if (!context.mounted) return;
      showRunqSnack(context, 'PO deleted');
      onAfterDelete();
    } on ApiException catch (e) {
      if (context.mounted) showRunqSnack(context, e.message, kind: SnackKind.error);
    } catch (_) {
      if (context.mounted) showRunqSnack(context, 'Could not delete the PO.', kind: SnackKind.error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Slidable(
      key: ValueKey(row.id),
      endActionPane: ActionPane(
        motion: const ScrollMotion(),
        extentRatio: 0.28,
        children: [
          SwipeAction(
            icon: Icons.delete_outline_rounded,
            label: 'Delete',
            color: Colors.red,
            onTap: () => _confirmDelete(context),
          ),
        ],
      ),
      child: Material(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        child: InkWell(
          borderRadius: BorderRadius.circular(RunqRadii.smallCard),
          onTap: () => context.push('/po-drafts/${row.id}'),
          child: Container(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
            decoration: BoxDecoration(
              border: Border.all(color: t.hairline, width: 0.5),
              borderRadius: BorderRadius.circular(RunqRadii.smallCard),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  // Top-align so the amount sits on the title line, not
                  // visually centred against title + subtitle — matches the
                  // invoice list layout.
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    RqAvatar(name: row.displayTitle, size: 36),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(row.displayTitle,
                              style: RunqText.bodyStrong.copyWith(color: t.ink),
                              maxLines: 1, overflow: TextOverflow.ellipsis),
                          const SizedBox(height: 2),
                          Text(_subtitle(),
                              style: RunqText.caption.copyWith(color: t.muted, fontSize: 11),
                              maxLines: 1, overflow: TextOverflow.ellipsis),
                        ],
                      ),
                    ),
                    if (row.grandTotal != null && row.grandTotal! > 0)
                      Padding(
                        // Nudge the amount down to centre against the
                        // title line specifically (top of Text has a small
                        // ascender gap; this matches it visually).
                        padding: const EdgeInsets.only(top: 1),
                        child: Text(formatINR(row.grandTotal!),
                            style: RunqText.tabular(size: 14, w: FontWeight.w700, color: t.ink)),
                      ),
                  ],
                ),
                const SizedBox(height: 10),
                Padding(
                  // Indent to align with the title (avatar 36 + gap 12).
                  padding: const EdgeInsets.only(left: 48),
                  child: Row(
                    children: [
                      _StatusPill(status: row.displayStatus),
                      const Spacer(),
                      if (row.approvedInvoiceId != null)
                        _InvoiceChip(
                          number: row.approvedInvoiceNumber ?? 'invoice',
                          onTap: () => context.push('/invoices/${row.approvedInvoiceId}'),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  String _subtitle() {
    final parts = <String>[];
    if (row.poNumberExtracted != null && row.poNumberExtracted!.isNotEmpty) {
      parts.add('PO #${row.poNumberExtracted!}');
    }
    parts.add(_relativeDate(row.uploadedAt));
    return parts.join(' · ');
  }

  String _relativeDate(DateTime d) {
    final now = DateTime.now();
    final diff = now.difference(d);
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inHours < 1) return '${diff.inMinutes}m ago';
    if (diff.inDays < 1) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${d.day} ${months[d.month - 1]}';
  }
}

class _StatusPill extends StatelessWidget {
  final String status;
  const _StatusPill({required this.status});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final s = status.toLowerCase();
    Color fg;
    Color bg;
    // Use alpha-tinted backgrounds throughout so pills render correctly on
    // both light and dark surfaces — solid pastel backgrounds (e.g. light
    // mint green) blow out against a dark canvas. Text colours flip per
    // mode so contrast on the tinted bg stays readable.
    if (s == 'invoiced') {
      fg = isDark ? const Color(0xFF34D399) : RunqColors.greenInk;
      bg = const Color(0x3310B981);  // emerald @20% alpha
    } else if (s == 'ready') {
      fg = isDark ? const Color(0xFFA5B4FC) : RunqColors.indigo;
      bg = const Color(0x1F4F46E5);
    } else if (s == 'needs review' || s == 'parsing') {
      fg = isDark ? const Color(0xFFFCD34D) : const Color(0xFFB45309);
      bg = const Color(0x33F59E0B);
    } else if (s == 'error' || s == 'rejected') {
      fg = isDark ? const Color(0xFFFCA5A5) : RunqColors.redInk;
      bg = const Color(0x22EF4444);
    } else {
      fg = t.muted;
      bg = t.hairlineSoft;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Text(status.toUpperCase(),
          style: RunqText.caption.copyWith(
            fontSize: 10,
            color: fg,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.5,
          )),
    );
  }
}

class _InvoiceChip extends StatelessWidget {
  final String number;
  final VoidCallback onTap;
  const _InvoiceChip({required this.number, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(999),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: RunqColors.indigo.withValues(alpha: 0.10),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.receipt_long_rounded, size: 12, color: RunqColors.indigo),
            const SizedBox(width: 4),
            Text(number,
                style: RunqText.caption.copyWith(
                  fontSize: 11,
                  color: RunqColors.indigo,
                  fontWeight: FontWeight.w700,
                )),
            const SizedBox(width: 2),
            const Icon(Icons.chevron_right_rounded, size: 14, color: RunqColors.indigo),
          ],
        ),
      ),
    );
  }
}

class _EmptyFilter extends StatelessWidget {
  final String label;
  final VoidCallback onClear;
  const _EmptyFilter({required this.label, required this.onClear});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 48, 24, 32),
      child: Column(
        children: [
          Icon(Icons.filter_alt_off_rounded, size: 32, color: t.muted),
          const SizedBox(height: 10),
          Text('Nothing matches “$label”',
              textAlign: TextAlign.center,
              style: RunqText.bodyStrong.copyWith(color: t.ink)),
          const SizedBox(height: 6),
          Text('Try a different filter or clear it to see everything.',
              textAlign: TextAlign.center,
              style: RunqText.caption.copyWith(color: t.muted)),
          const SizedBox(height: 14),
          OutlinedButton(onPressed: onClear, child: const Text('Show all')),
        ],
      ),
    );
  }
}

class _Centered extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final String? action;
  final VoidCallback? onAction;
  const _Centered({
    required this.icon,
    required this.title,
    this.subtitle,
    this.action,
    this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        const SizedBox(height: 80),
        Icon(icon, size: 36, color: t.muted),
        const SizedBox(height: 12),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Text(title,
              textAlign: TextAlign.center,
              style: RunqText.bodyStrong.copyWith(color: t.ink)),
        ),
        if (subtitle != null) ...[
          const SizedBox(height: 6),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Text(subtitle!,
                textAlign: TextAlign.center,
                style: RunqText.caption.copyWith(color: t.muted)),
          ),
        ],
        if (action != null) ...[
          const SizedBox(height: 16),
          Center(
            child: OutlinedButton(onPressed: onAction, child: Text(action!)),
          ),
        ],
      ],
    );
  }
}
