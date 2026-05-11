import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../api/api_client.dart';
import '../api/models.dart';
import '../providers/data_providers.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../utils/format_inr.dart';
import '../widgets/avatar.dart';

/// Mobile equivalent of the web admin's `/inbox` page. Shows everything
/// that needs the user's attention — invoices to send, bills to approve,
/// PO drafts to review, expenses to reimburse — grouped and tappable so
/// each row deep-links straight to the resolution screen.
class InboxScreen extends ConsumerWidget {
  const InboxScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final inbox = ref.watch(inboxProvider);
    return Scaffold(
      backgroundColor: t.bgWarmer,
      appBar: AppBar(
        title: const Text('Inbox'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
          onPressed: () => context.pop(),
        ),
      ),
      body: SafeArea(
        child: RefreshIndicator(
          color: RunqColors.indigo,
          onRefresh: () async {
            ref.invalidate(inboxProvider);
            ref.invalidate(inboxCountProvider);
            await ref.read(inboxProvider.future).catchError((_) =>
                InboxPayload(totalCount: 0, groups: const []));
          },
          child: inbox.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) {
              final msg = e is ApiException ? e.message : 'Could not load inbox';
              return _Centered(icon: Icons.error_outline_rounded, title: msg);
            },
            data: (payload) {
              final groups = payload.groups.where((g) => g.count > 0).toList();
              if (groups.isEmpty) {
                return const _Centered(
                  icon: Icons.inbox_outlined,
                  title: "You're all caught up.",
                  subtitle:
                      'New invoices to send, bills to approve, and expenses to reimburse will land here when there\'s work to do.',
                );
              }
              return _Body(payload: payload, groups: groups);
            },
          ),
        ),
      ),
    );
  }
}

class _Body extends StatelessWidget {
  final InboxPayload payload;
  final List<InboxGroup> groups;
  const _Body({required this.payload, required this.groups});

  @override
  Widget build(BuildContext context) {
    final grandTotal = groups.fold<double>(
      0,
      (s, g) => s + g.items.fold<double>(0, (a, i) => a + (i.amount ?? 0)),
    );
    final needsReview = groups.fold<int>(
      0,
      (s, g) => s + g.items.where((i) => i.status == 'needs_review').length,
    );
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      children: [
        _SummaryStrip(
          totalCount: payload.totalCount,
          grandTotal: grandTotal,
          needsReview: needsReview,
          categories: groups.length,
        ),
        const SizedBox(height: 16),
        for (var i = 0; i < groups.length; i++) ...[
          _GroupCard(group: groups[i]),
          if (i < groups.length - 1) const SizedBox(height: 12),
        ],
      ],
    );
  }
}

// ─── Summary strip (mobile equivalent of web KPI tiles) ─────────────────────

class _SummaryStrip extends StatelessWidget {
  final int totalCount, needsReview, categories;
  final double grandTotal;
  const _SummaryStrip({
    required this.totalCount,
    required this.grandTotal,
    required this.needsReview,
    required this.categories,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      child: Row(
        children: [
          Expanded(
            child: _StatTile(
              label: 'To do',
              value: '$totalCount',
              color: t.ink,
            ),
          ),
          Container(width: 1, height: 28, color: t.muted2.withValues(alpha: 0.35)),
          Expanded(
            child: _StatTile(
              label: 'At stake',
              value: grandTotal > 0 ? formatINR(grandTotal, compact: true) : '—',
              color: t.ink,
            ),
          ),
          Container(width: 1, height: 28, color: t.muted2.withValues(alpha: 0.35)),
          Expanded(
            child: _StatTile(
              label: 'To review',
              value: '$needsReview',
              color: needsReview > 0 ? const Color(0xFFB45309) : t.muted,
            ),
          ),
          Container(width: 1, height: 28, color: t.muted2.withValues(alpha: 0.35)),
          Expanded(
            child: _StatTile(
              label: 'Groups',
              value: '$categories',
              color: t.ink,
            ),
          ),
        ],
      ),
    );
  }
}

class _StatTile extends StatelessWidget {
  final String label, value;
  final Color color;
  const _StatTile({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(label,
            style: RunqText.caption.copyWith(
              fontSize: 10.5, color: t.muted, letterSpacing: 0.5,
              fontWeight: FontWeight.w700,
            )),
        const SizedBox(height: 4),
        Text(value, style: RunqText.tabular(size: 16, w: FontWeight.w700, color: color)),
      ],
    );
  }
}

// ─── Group card ─────────────────────────────────────────────────────────────

class _GroupCard extends StatelessWidget {
  final InboxGroup group;
  const _GroupCard({required this.group});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final groupTotal = group.items.fold<double>(0, (s, i) => s + (i.amount ?? 0));
    final colors = _groupColors(group.key);
    return Container(
      // Color-coded card: thin coloured top stripe + tinted header bg so each
      // section feels distinct without overwhelming the row content. The body
      // (item list) keeps the neutral surface so amounts and titles stay
      // legible and the rows still read as standard list rows.
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          // Header — soft tint of the group colour so the section reads as
          // belonging to that category at a glance.
          Container(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
            color: colors.bg,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 28, height: 28,
                  decoration: BoxDecoration(
                    // White tile against the tinted header so the icon
                    // doesn't dissolve into the same coloured background.
                    color: t.surface,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: colors.fg.withValues(alpha: 0.15), width: 0.5),
                  ),
                  child: Icon(_groupIcon(group.key), size: 14, color: colors.fg),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Flexible(
                            child: Text(group.title,
                                style: RunqText.bodyStrong.copyWith(color: t.ink),
                                maxLines: 1, overflow: TextOverflow.ellipsis),
                          ),
                          const SizedBox(width: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                            decoration: BoxDecoration(
                              color: t.surface,
                              borderRadius: BorderRadius.circular(999),
                              border: Border.all(color: colors.fg.withValues(alpha: 0.2), width: 0.5),
                            ),
                            child: Text('${group.count}',
                                style: RunqText.caption.copyWith(
                                  fontSize: 10.5,
                                  color: colors.fg,
                                  fontWeight: FontWeight.w800,
                                )),
                          ),
                        ],
                      ),
                      const SizedBox(height: 2),
                      Text(group.caption,
                          style: RunqText.caption.copyWith(color: t.muted, fontSize: 11),
                          maxLines: 2, overflow: TextOverflow.ellipsis),
                    ],
                  ),
                ),
                if (groupTotal > 0) ...[
                  const SizedBox(width: 8),
                  Text(formatINR(groupTotal),
                      style: RunqText.tabular(size: 13, w: FontWeight.w700, color: t.ink)),
                ],
              ],
            ),
          ),
          // Item rows
          Divider(height: 1, thickness: 0.5, color: t.hairline),
          for (var i = 0; i < group.items.length; i++) ...[
            _ItemRow(item: group.items[i]),
            if (i < group.items.length - 1)
              Padding(
                padding: const EdgeInsets.only(left: 56),
                child: Divider(height: 1, thickness: 0.5, color: t.hairlineSoft),
              ),
          ],
        ],
      ),
    );
  }
}

// ─── Item row ───────────────────────────────────────────────────────────────

class _ItemRow extends StatelessWidget {
  final InboxItem item;
  const _ItemRow({required this.item});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final needsReview = item.status == 'needs_review';
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () => _open(context),
        child: Container(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
          color: needsReview ? const Color(0x14F59E0B) : null,
          child: Row(
            children: [
              RqAvatar(name: item.title, size: 32),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        _StatusDot(status: item.status),
                        const SizedBox(width: 6),
                        Flexible(
                          child: Text(item.title,
                              style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 13.5),
                              maxLines: 1, overflow: TextOverflow.ellipsis),
                        ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Wrap(
                      spacing: 6,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        Text(item.subtitle,
                            style: RunqText.caption.copyWith(color: t.muted, fontSize: 11)),
                        Text('· ${_relativeDate(item.date)}',
                            style: RunqText.caption.copyWith(color: t.muted, fontSize: 11)),
                        if (needsReview)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                            decoration: BoxDecoration(
                              color: const Color(0x33F59E0B),
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: const Text('Needs review',
                                style: TextStyle(
                                  fontSize: 10,
                                  color: Color(0xFFB45309),
                                  fontWeight: FontWeight.w700,
                                )),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              if (item.amount != null)
                Text(formatINR(item.amount!),
                    style: RunqText.tabular(size: 13.5, w: FontWeight.w700, color: t.ink)),
              const SizedBox(width: 6),
              Icon(Icons.chevron_right_rounded, size: 18, color: t.muted2),
            ],
          ),
        ),
      ),
    );
  }

  void _open(BuildContext context) {
    final route = _toMobileRoute(item.href);
    if (route != null) context.push(route);
  }
}

class _StatusDot extends StatelessWidget {
  final String status;
  const _StatusDot({required this.status});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final color = status == 'draft'
        ? t.muted
        : status == 'needs_review'
            ? const Color(0xFFB45309)
            : RunqColors.greenInk; // ready or approved
    return Container(
      width: 6, height: 6,
      decoration: BoxDecoration(color: color, shape: BoxShape.circle),
    );
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

class _GroupColors {
  final Color bg, fg;
  const _GroupColors(this.bg, this.fg);
}

/// Soft tinted icon-tile colors per group key. Mirrors the web admin's
/// `GROUP_ICON_BG/FG` palette so the two clients feel like one product.
_GroupColors _groupColors(String key) {
  switch (key) {
    case 'invoices_to_send':
      return const _GroupColors(Color(0xFFE0E7FF), Color(0xFF4338CA));
    case 'bills_to_approve':
      return const _GroupColors(Color(0xFFD1FAE5), Color(0xFF047857));
    case 'bills_pending_match':
      return const _GroupColors(Color(0xFFFEF3C7), Color(0xFF92400E));
    case 'po_drafts_to_review':
      return const _GroupColors(Color(0xFFEDE9FE), Color(0xFF6D28D9));
    case 'expenses_to_approve':
      return const _GroupColors(Color(0xFFEDE9FE), Color(0xFF6D28D9));
    case 'expenses_to_reimburse':
      return const _GroupColors(Color(0xFFCCFBF1), Color(0xFF0F766E));
    default:
      return const _GroupColors(Color(0xFFE5E7EB), Color(0xFF374151));
  }
}

IconData _groupIcon(String key) {
  switch (key) {
    case 'invoices_to_send': return Icons.send_outlined;
    case 'bills_to_approve': return Icons.fact_check_outlined;
    case 'bills_pending_match': return Icons.search_rounded;
    case 'po_drafts_to_review': return Icons.auto_awesome_outlined;
    case 'expenses_to_approve': return Icons.account_balance_wallet_outlined;
    case 'expenses_to_reimburse': return Icons.payments_outlined;
    default: return Icons.inbox_outlined;
  }
}

/// Web `href` routes (e.g. `/ar/invoices/<id>`) → mobile router paths.
String? _toMobileRoute(String href) {
  if (href.isEmpty) return null;
  // Sales invoice detail → /invoices/:id (mobile router uses the bare path)
  if (href.startsWith('/ar/invoices/')) {
    return '/invoices/${href.substring('/ar/invoices/'.length)}';
  }
  // Bill detail
  if (href.startsWith('/ap/bills/')) {
    return '/bills/${href.substring('/ap/bills/'.length)}';
  }
  // PO inbox detail
  if (href.startsWith('/ar/po-inbox/')) {
    return '/po-drafts/${href.substring('/ar/po-inbox/'.length)}';
  }
  // Expense claims index — mobile has /expenses
  if (href.startsWith('/expenses')) {
    return '/expenses';
  }
  return null;
}

String _relativeDate(DateTime d) {
  final diff = DateTime.now().difference(d);
  if (diff.inHours < 24) return 'today';
  if (diff.inHours < 48) return 'yesterday';
  if (diff.inDays < 7) return '${diff.inDays}d ago';
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return '${d.day} ${m[d.month - 1]}';
}

class _Centered extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  const _Centered({required this.icon, required this.title, this.subtitle});

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
      ],
    );
  }
}
