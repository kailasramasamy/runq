// Expense claims — list / detail / create wizard. Replaces the previous
// link-out to the Finance Expenses surface.
//
// Status lifecycle:
//   draft → submitted → approved → reimbursed
//                     ↘ rejected
// Mobile-side actions:
//   draft: edit, submit, delete
//   submitted (manager): approve, reject
//   approved (manager): mark reimbursed
//
// Receipts are claim-level attachments (polymorphic table; entityType
// = 'expense'). Per-line photos aren't a server concept yet — we expose
// receipts as a section on the detail screen instead.

library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/hr_models.dart';
import '../../api/hr_repo.dart';
import '../../providers/app_role_provider.dart';
import '../../providers/auth_provider.dart';
import '../../providers/hr_persona_provider.dart';
import '../../providers/hr_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart';
import 'widgets/hr_colors.dart';
import 'widgets/hr_form.dart';
import 'widgets/hr_widgets.dart';

// ─── List ─────────────────────────────────────────────────────────────────

final _claimsFilterProvider = StateProvider<String?>((_) => null);

/// Standalone screen for a manager's team expenses, pushed from the
/// Home "Expenses" quick action. Mirrors HrTeamLeavesScreen — wraps
/// the same body widget the Pay > Expenses sub-tab uses, just adds a
/// back arrow + "Expenses" title.
class HrTeamExpensesScreen extends ConsumerWidget {
  const HrTeamExpensesScreen({super.key});

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
                  Text('Expenses', style: RunqText.h1.copyWith(color: t.ink)),
                ],
              ),
            ),
            const Expanded(child: HrExpenseClaimsBody()),
          ],
        ),
      ),
    );
  }
}

/// Claims list + filter strip — embedded inside the Pay > Expenses
/// sub-tab. There used to be a standalone /hr/expense-claims route too;
/// it was removed once the Pay tab gained the same functionality so we
/// don't ship two surfaces for the same data. The /new and /:id forms
/// (still pushed as routes) consume this widget's tap actions.
class HrExpenseClaimsBody extends ConsumerWidget {
  const HrExpenseClaimsBody({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final status = ref.watch(_claimsFilterProvider);
    final query = HrClaimsQuery(status: status);
    final claimsAsync = ref.watch(hrExpenseClaimsProvider(query));
    // Persona-scoped view. The same widget powers both Pay > Expenses
    // sub-tabs:
    //   My View    → only claims the logged-in user filed
    //   Manager    → claims filed by anyone *other* than the user
    //                (review queue — managers can't approve their own)
    // The server returns everything in the tenant; we filter client-side
    // because expense_claims.claimant_id references users (not employees),
    // so the HrAccessScope CTE doesn't apply directly.
    final persona = ref.watch(hrPersonaProvider);
    final role = ref.watch(appRoleProvider);
    final myUserId = ref.watch(authProvider).user?.id;
    final managerLens = role.canSeeManagerPersona && persona == HrPersona.manager;

    return Column(
      children: [
        _FilterChips(
          active: status,
          onChange: (s) => ref.read(_claimsFilterProvider.notifier).state = s,
        ),
        Expanded(
          child: RefreshIndicator(
            color: HrColors.brand(context),
            onRefresh: () async {
              ref.invalidate(hrExpenseClaimsProvider(query));
              await Future<void>.delayed(const Duration(milliseconds: 250));
            },
            child: claimsAsync.when(
              loading: () => const Center(child: CircularProgressIndicator(color: HrColors.teal)),
              error: (e, _) => Center(child: Text('$e', style: RunqText.body.copyWith(color: t.muted))),
              data: (allRows) {
                final rows = myUserId == null
                    ? allRows
                    : allRows.where((c) => managerLens
                        ? c.claimantId != myUserId   // team-only review queue
                        : c.claimantId == myUserId   // own claims only
                      ).toList();
                if (rows.isEmpty) {
                  return ListView(
                    physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
                    padding: const EdgeInsets.fromLTRB(16, 60, 16, 120),
                    children: [
                      Icon(Icons.receipt_long_outlined, size: 40, color: t.muted2),
                      const SizedBox(height: 10),
                      Center(child: Text(
                        managerLens ? 'No team claims to review' : 'No claims yet',
                        style: RunqText.bodyStrong.copyWith(color: t.ink),
                      )),
                      const SizedBox(height: 4),
                      Center(child: Text(
                        managerLens
                            ? 'New requests from your reports will appear here.'
                            : 'Tap + to submit your first claim',
                        textAlign: TextAlign.center,
                        style: RunqText.caption.copyWith(color: t.muted),
                      )),
                    ],
                  );
                }
                // Split into Active (in-flight: draft / submitted /
                // approved-but-not-yet-paid) vs History (reimbursed,
                // rejected). Mirrors the Leave tab pattern so the two
                // employee surfaces read the same way.
                final active = <HrExpenseClaim>[];
                final history = <HrExpenseClaim>[];
                for (final c in rows) {
                  if (c.status == 'reimbursed' || c.status == 'rejected') {
                    history.add(c);
                  } else {
                    active.add(c);
                  }
                }
                return ListView(
                  physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
                  // Top inset is small here because the filter chips
                  // above already carry the 32px breathing room.
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 120),
                  children: [
                    if (active.isNotEmpty) ...[
                      _SectionHeader(label: 'Active', count: active.length, ink: t.ink, muted: t.muted),
                      const SizedBox(height: 8),
                      ...active.map((c) => _ClaimRow(claim: c, showUrgency: managerLens)),
                    ],
                    if (history.isNotEmpty) ...[
                      SizedBox(height: active.isEmpty ? 0 : 32),
                      _SectionHeader(label: 'History', count: history.length, ink: t.ink, muted: t.muted),
                      const SizedBox(height: 8),
                      ...history.map((c) => _ClaimRow(claim: c)),
                    ],
                  ],
                );
              },
            ),
          ),
        ),
      ],
    );
  }
}

// Same shape as the Leave tab's section header — kept inline rather than
// extracted because the two contexts have slightly different styling
// budgets and this is the only second use. Promote to a shared widget
// when a third surface needs it.
class _SectionHeader extends StatelessWidget {
  final String label;
  final int count;
  final Color ink, muted;
  const _SectionHeader({
    required this.label,
    required this.count,
    required this.ink,
    required this.muted,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(label, style: RunqText.bodyStrong.copyWith(color: ink)),
        const SizedBox(width: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          decoration: BoxDecoration(
            color: muted.withValues(alpha: 0.15),
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text('$count',
              style: RunqText.caption.copyWith(
                  color: muted, fontSize: 10.5, fontWeight: FontWeight.w700)),
        ),
      ],
    );
  }
}

class _FilterChips extends StatelessWidget {
  final String? active;
  final ValueChanged<String?> onChange;
  const _FilterChips({required this.active, required this.onChange});

  static const _opts = <(String?, String)>[
    (null, 'All'),
    ('draft', 'Draft'),
    ('submitted', 'Submitted'),
    ('approved', 'Approved'),
    ('rejected', 'Rejected'),
    ('reimbursed', 'Reimbursed'),
  ];

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return SizedBox(
      // Taller box + asymmetric top inset so the chips don't collide
      // with the sub-tab strip directly above. Matches the 32px
      // breathing-room rhythm we use between sections elsewhere.
      height: 70,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(16, 32, 16, 4),
        itemCount: _opts.length,
        separatorBuilder: (_, __) => const SizedBox(width: 6),
        itemBuilder: (_, i) {
          final o = _opts[i];
          final sel = o.$1 == active;
          return GestureDetector(
            onTap: () => onChange(o.$1),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                color: sel ? HrColors.teal : t.surface,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(
                  color: sel ? HrColors.teal : t.hairline,
                  width: sel ? 1.0 : 0.5,
                ),
              ),
              child: Text(
                o.$2,
                style: TextStyle(
                  color: sel ? Colors.white : t.ink,
                  fontSize: 12, fontWeight: FontWeight.w600,
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _ClaimRow extends StatelessWidget {
  final HrExpenseClaim claim;
  /// When true, decorate submitted (pending-approval) rows with a left
  /// accent stripe + "Submitted N days ago" prompt so the manager sees
  /// aging claims at a glance. Off by default — own-claim lists already
  /// communicate the wait via the status pill.
  final bool showUrgency;
  const _ClaimRow({required this.claim, this.showUrgency = false});

  /// Urgency rules mirror the leave card: red for stale (> a week),
  /// orange for ageing (3–7 days), amber for fresh-but-actionable
  /// (1–2 days), teal for "just came in." Driven by claim_date which
  /// is what the employee marked the expense as happening on.
  ({Color accent, String label, bool urgent}) _urgency(BuildContext ctx) {
    final today = DateTime.now();
    final midnight = DateTime(today.year, today.month, today.day);
    final since = midnight.difference(DateTime(claim.claimDate.year, claim.claimDate.month, claim.claimDate.day)).inDays;
    if (since >= 7) {
      return (accent: const Color(0xFFDC2626), label: '$since days old · review now', urgent: true);
    }
    if (since >= 3) {
      return (accent: const Color(0xFFEA580C), label: '$since days old · review soon', urgent: true);
    }
    if (since >= 1) {
      return (accent: const Color(0xFFD97706), label: '$since day${since == 1 ? '' : 's'} ago', urgent: false);
    }
    return (accent: HrColors.brand(ctx), label: 'New today', urgent: false);
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    final shouldHighlight = showUrgency && claim.status == 'submitted';
    final urgency = shouldHighlight ? _urgency(context) : null;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
        boxShadow: RunqShadows.card,
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        child: InkWell(
          onTap: () => context.push('/hr/expense-claims/${claim.id}'),
          child: IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (urgency != null) Container(width: 4, color: urgency.accent),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                    child: Row(
                      children: [
                        Container(
                          width: 40, height: 40,
                          decoration: BoxDecoration(
                            color: HrColors.tealSubtle,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Icon(Icons.receipt_outlined, size: 20, color: HrColors.brand(context)),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(claim.claimNumber,
                                  maxLines: 1, overflow: TextOverflow.ellipsis,
                                  style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 14)),
                              const SizedBox(height: 2),
                              Text(
                                [
                                  '${claim.claimDate.day} ${m[claim.claimDate.month - 1]} ${claim.claimDate.year}',
                                  claim.claimantName,
                                ].join(' · '),
                                maxLines: 1, overflow: TextOverflow.ellipsis,
                                style: RunqText.caption.copyWith(color: t.muted, fontSize: 11.5),
                              ),
                              if (urgency != null) ...[
                                const SizedBox(height: 4),
                                Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(
                                      urgency.urgent
                                          ? Icons.priority_high_rounded
                                          : Icons.schedule_rounded,
                                      size: 12, color: urgency.accent,
                                    ),
                                    const SizedBox(width: 3),
                                    Text(urgency.label,
                                        style: TextStyle(
                                          color: urgency.accent,
                                          fontSize: 11,
                                          fontWeight: urgency.urgent ? FontWeight.w700 : FontWeight.w600,
                                        )),
                                  ],
                                ),
                              ],
                            ],
                          ),
                        ),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text(hrFormatINR(claim.totalAmount),
                                style: RunqText.tabular(size: 14, w: FontWeight.w700, color: t.ink)),
                            const SizedBox(height: 4),
                            HrStatusBadge(status: claim.status),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ─── Detail ───────────────────────────────────────────────────────────────

class HrExpenseClaimDetailScreen extends ConsumerWidget {
  final String id;
  const HrExpenseClaimDetailScreen({super.key, required this.id});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final claimAsync = ref.watch(hrExpenseClaimProvider(id));
    final role = ref.watch(appRoleProvider);
    // Approve / reject is open to managers (so they can decide on their
    // team's claims) plus the usual admin + HR set. The post-to-GL and
    // mark-reimbursed buttons stay admin-only via canFinanceManage so a
    // line manager can't accidentally book journals.
    final canApproveReject = role == AppRole.admin
        || role == AppRole.hr
        || role == AppRole.manager;
    final canFinanceManage = role == AppRole.admin;

    return Scaffold(
      backgroundColor: t.bgWarm,
      body: SafeArea(
        bottom: false,
        child: claimAsync.when(
          loading: () => const Center(child: CircularProgressIndicator(color: HrColors.teal)),
          error: (e, _) => Center(child: Text('$e', style: RunqText.body.copyWith(color: t.muted))),
          data: (claim) {
            return Column(
              children: [
                _DetailHeader(claim: claim),
                Expanded(
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                    physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
                    children: [
                      _SummaryCard(claim: claim),
                      const SizedBox(height: 12),
                      _ItemsCard(items: claim.items),
                      if (claim.status == 'rejected' && claim.rejectionReason != null) ...[
                        const SizedBox(height: 12),
                        _RejectionCard(reason: claim.rejectionReason!),
                      ],
                    ],
                  ),
                ),
              ],
            );
          },
        ),
      ),
      // Action bar moved to bottomNavigationBar so ScaffoldMessenger
      // lifts SnackBars above it — was overlapping the buttons before.
      bottomNavigationBar: claimAsync.maybeWhen(
        data: (claim) => _DetailActions(
          claim: claim,
          canApproveReject: canApproveReject,
          canFinanceManage: canFinanceManage,
        ),
        orElse: () => null,
      ),
    );
  }
}

class _DetailHeader extends StatelessWidget {
  final HrExpenseClaim claim;
  const _DetailHeader({required this.claim});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 12, 16, 4),
      child: Row(
        children: [
          IconButton(
            onPressed: () => Navigator.of(context).maybePop(),
            icon: Icon(Icons.arrow_back_rounded, color: t.ink),
          ),
          const SizedBox(width: 4),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(claim.claimNumber, style: RunqText.h2.copyWith(color: t.ink, fontSize: 20)),
                const SizedBox(height: 2),
                Text(claim.claimantName, style: RunqText.caption.copyWith(color: t.muted)),
              ],
            ),
          ),
          HrStatusBadge(status: claim.status),
        ],
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  final HrExpenseClaim claim;
  const _SummaryCard({required this.claim});

  @override
  Widget build(BuildContext context) {

    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: HrColors.heroGradient,
        borderRadius: BorderRadius.circular(RunqRadii.card),
        boxShadow: RunqShadows.card,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Total claimed',
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.85),
                fontSize: 12, fontWeight: FontWeight.w600, letterSpacing: 0.3,
              )),
          const SizedBox(height: 8),
          Text(hrFormatINR(claim.totalAmount),
              style: const TextStyle(
                color: Colors.white, fontSize: 30, fontWeight: FontWeight.w800,
                fontFeatures: [FontFeature.tabularFigures()],
              )),
          const SizedBox(height: 6),
          Text(
            'Claim date · ${claim.claimDate.day} ${m[claim.claimDate.month - 1]} ${claim.claimDate.year}',
            style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 13),
          ),
          if (claim.description != null && claim.description!.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(claim.description!,
                style: TextStyle(color: Colors.white.withValues(alpha: 0.9), fontSize: 13)),
          ],
          if (claim.approvedAt != null) ...[
            const SizedBox(height: 6),
            Text('Approved · ${_fmtDt(claim.approvedAt!)}',
                style: TextStyle(color: Colors.white.withValues(alpha: 0.7), fontSize: 11.5)),
          ],
          if (claim.reimbursedAt != null) ...[
            const SizedBox(height: 4),
            Text('Reimbursed · ${_fmtDt(claim.reimbursedAt!)}',
                style: TextStyle(color: Colors.white.withValues(alpha: 0.7), fontSize: 11.5)),
          ],
        ],
      ),
    );
  }

  static String _fmtDt(DateTime d) {
    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    final localD = d.toLocal();
    return '${localD.day} ${m[localD.month - 1]} ${localD.year}';
  }
}

class _ItemsCard extends StatelessWidget {
  final List<HrExpenseClaimItem> items;
  const _ItemsCard({required this.items});

  @override
  Widget build(BuildContext context) {

    if (items.isEmpty) {
      return _EmptyCard(label: 'No line items');
    }
    return HrFormSection(
      title: 'Line items',
      children: items
          .map((it) => _ItemRow(item: it))
          .toList(),
    );
  }
}

class _ItemRow extends StatelessWidget {
  final HrExpenseClaimItem item;
  const _ItemRow({required this.item});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Category icon tile — same visual language as the new-claim
          // form's summary cards. Lifts the category to the top of the
          // row and gives the eye an instant scan of "what kind of
          // expense" without reading a pill.
          Container(
            width: 40, height: 40,
            decoration: BoxDecoration(
              color: HrColors.tealSubtle,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(_categoryIcon(item.category), size: 20, color: HrColors.brand(context)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(hrExpenseCategoryLabel(item.category),
                    style: TextStyle(
                      color: HrColors.brand(context),
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.3,
                    )),
                const SizedBox(height: 2),
                Text(item.description,
                    maxLines: 2, overflow: TextOverflow.ellipsis,
                    style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 13.5)),
                const SizedBox(height: 2),
                Text('${item.expenseDate.day} ${m[item.expenseDate.month - 1]}',
                    style: RunqText.caption.copyWith(color: t.muted, fontSize: 11.5)),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Text(hrFormatINR(item.amount),
              style: RunqText.tabular(size: 14, w: FontWeight.w700, color: t.ink)),
        ],
      ),
    );
  }

  // Mirror of the form's summary-card icon mapping. Promoted here so
  // both surfaces (form + detail) share one source of truth — if you
  // tweak an icon for "Travel", both screens follow.
  static IconData _categoryIcon(String code) {
    switch (code) {
      case 'travel':         return Icons.flight_outlined;
      case 'meals':          return Icons.restaurant_outlined;
      case 'lodging':        return Icons.hotel_outlined;
      case 'fuel':           return Icons.local_gas_station_outlined;
      case 'office_supplies':return Icons.inventory_2_outlined;
      case 'communication':  return Icons.phone_outlined;
      case 'subscriptions':  return Icons.subscriptions_outlined;
      case 'professional_services': return Icons.handshake_outlined;
      case 'training':       return Icons.school_outlined;
      case 'utilities':      return Icons.bolt_outlined;
      case 'repairs':        return Icons.build_outlined;
      case 'medical':        return Icons.medical_services_outlined;
      case 'entertainment':  return Icons.celebration_outlined;
      case 'gifts':          return Icons.card_giftcard_outlined;
      default:               return Icons.receipt_long_outlined;
    }
  }
}

class _RejectionCard extends StatelessWidget {
  final String reason;
  const _RejectionCard({required this.reason});

  @override
  Widget build(BuildContext context) {

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFFEE2E2),
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: const Color(0xFFFCA5A5), width: 0.5),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.cancel_outlined, color: Color(0xFF7F1D1D), size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Rejected',
                    style: TextStyle(color: const Color(0xFF7F1D1D), fontSize: 12, fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text(reason,
                    style: const TextStyle(color: Color(0xFF7F1D1D), fontSize: 13)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyCard extends StatelessWidget {
  final String label;
  const _EmptyCard({required this.label});
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      child: Center(child: Text(label, style: RunqText.body.copyWith(color: t.muted))),
    );
  }
}

class _DetailActions extends ConsumerWidget {
  final HrExpenseClaim claim;
  /// Approve / reject visibility — true for admin, HR, and managers
  /// (so a reporting manager can decide on team claims). Server scope-
  /// checks the manager case; UI shows the button optimistically.
  final bool canApproveReject;
  /// Mark-reimbursed (and the post-to-GL action that follows it). Stays
  /// admin-only since it books a journal entry + moves money.
  final bool canFinanceManage;
  const _DetailActions({
    required this.claim,
    required this.canApproveReject,
    required this.canFinanceManage,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    // Each status surfaces a different action set. Render bottom action
    // bar only when there's at least one action available to this user.
    final actions = <Widget>[];
    if (claim.canSubmit) {
      actions.add(Expanded(
        child: HrSubmitButton(
          label: 'Submit',
          enabled: true,
          onPressed: () => _submit(context, ref),
        ),
      ));
    }
    if (claim.isEditable) {
      actions.add(Expanded(
        child: OutlinedButton(
          onPressed: () => context.push('/hr/expense-claims/${claim.id}/edit', extra: claim),
          style: OutlinedButton.styleFrom(
            padding: const EdgeInsets.symmetric(vertical: 14),
            side: BorderSide(color: t.hairline),
            foregroundColor: t.ink,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
          child: const Text('Edit'),
        ),
      ));
    }
    if (canApproveReject && claim.canApprove) {
      actions.add(Expanded(
        child: OutlinedButton(
          onPressed: () => _reject(context, ref),
          style: OutlinedButton.styleFrom(
            padding: const EdgeInsets.symmetric(vertical: 14),
            side: const BorderSide(color: Color(0xFFDC2626)),
            foregroundColor: const Color(0xFFDC2626),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
          child: const Text('Reject'),
        ),
      ));
      actions.add(Expanded(
        child: FilledButton(
          onPressed: () => _approve(context, ref),
          style: FilledButton.styleFrom(
            backgroundColor: const Color(0xFF16A34A),
            padding: const EdgeInsets.symmetric(vertical: 14),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
          child: const Text('Approve'),
        ),
      ));
    }
    if (canFinanceManage && claim.canReimburse) {
      actions.add(Expanded(
        child: HrSubmitButton(
          label: 'Mark reimbursed',
          enabled: true,
          onPressed: () => _reimburse(context, ref),
        ),
      ));
    }
    if (actions.isEmpty) return const SizedBox.shrink();
    return SafeArea(
      top: false,
      // Bottom action bar sits flush on the scaffold — the older
      // "surface + hairline" treatment painted a visible strip on dark
      // mode that read like a docked toolbar. Same change as HrFormScreen.
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
        child: Row(
          children: [
            for (var i = 0; i < actions.length; i++) ...[
              if (i > 0) const SizedBox(width: 10),
              actions[i],
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _submit(BuildContext context, WidgetRef ref) async {
    try {
      await hrRepo.submitExpenseClaim(claim.id);
      ref.invalidate(hrExpenseClaimProvider(claim.id));
      ref.invalidate(hrExpenseClaimsProvider);
      ref.invalidate(hrPendingExpenseClaimsProvider);
      if (context.mounted) showRunqSnack(context, 'Submitted for approval', kind: SnackKind.success);
    } catch (e) {
      if (context.mounted) showRunqSnack(context, 'Submit failed: $e', kind: SnackKind.error);
    }
  }

  Future<void> _approve(BuildContext context, WidgetRef ref) async {
    try {
      await hrRepo.approveExpenseClaim(claim.id, approved: true);
      ref.invalidate(hrExpenseClaimProvider(claim.id));
      ref.invalidate(hrExpenseClaimsProvider);
      ref.invalidate(hrPendingExpenseClaimsProvider);
      if (context.mounted) showRunqSnack(context, 'Claim approved', kind: SnackKind.success);
    } catch (e) {
      if (context.mounted) showRunqSnack(context, 'Approve failed: $e', kind: SnackKind.error);
    }
  }

  Future<void> _reject(BuildContext context, WidgetRef ref) async {
    final reasonCtrl = TextEditingController();
    final reason = await showDialog<String>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Reject claim'),
        content: TextField(
          controller: reasonCtrl,
          maxLines: 3,
          decoration: const InputDecoration(hintText: 'Reason (visible to claimant)'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.of(context).pop(reasonCtrl.text.trim()),
            style: TextButton.styleFrom(foregroundColor: const Color(0xFFDC2626)),
            child: const Text('Reject'),
          ),
        ],
      ),
    );
    if (reason == null || reason.isEmpty) return;
    try {
      await hrRepo.approveExpenseClaim(claim.id, approved: false, rejectionReason: reason);
      ref.invalidate(hrExpenseClaimProvider(claim.id));
      ref.invalidate(hrExpenseClaimsProvider);
      ref.invalidate(hrPendingExpenseClaimsProvider);
      if (context.mounted) showRunqSnack(context, 'Claim rejected', kind: SnackKind.success);
    } catch (e) {
      if (context.mounted) showRunqSnack(context, 'Reject failed: $e', kind: SnackKind.error);
    }
  }

  Future<void> _reimburse(BuildContext context, WidgetRef ref) async {
    try {
      await hrRepo.reimburseExpenseClaim(claim.id);
      ref.invalidate(hrExpenseClaimProvider(claim.id));
      ref.invalidate(hrExpenseClaimsProvider);
      if (context.mounted) showRunqSnack(context, 'Marked reimbursed', kind: SnackKind.success);
    } catch (e) {
      if (context.mounted) showRunqSnack(context, 'Mark failed: $e', kind: SnackKind.error);
    }
  }
}

// ─── Create / Edit form (single screen — header + dynamic lines) ─────────

class HrExpenseClaimFormScreen extends ConsumerStatefulWidget {
  final HrExpenseClaim? existing;
  const HrExpenseClaimFormScreen({super.key, this.existing});

  @override
  ConsumerState<HrExpenseClaimFormScreen> createState() => _HrExpenseClaimFormScreenState();
}

// Plain data holder for an in-progress line item. No TextEditingControllers
// here — those live inside the bottom-sheet editor and are converted to
// values on save. Keeping the parent state controller-free means we can
// freely add / remove / reorder rows without lifecycle gymnastics.
class _LineData {
  String description;
  double amount;
  DateTime expenseDate;
  String category;

  _LineData({
    required this.description,
    required this.amount,
    required this.expenseDate,
    required this.category,
  });

  factory _LineData.fromItem(HrExpenseClaimItem it) => _LineData(
        description: it.description,
        amount: it.amount,
        expenseDate: it.expenseDate,
        category: it.category,
      );

  Map<String, dynamic> toPayload() => {
        'expenseDate':
            '${expenseDate.year.toString().padLeft(4, '0')}-${expenseDate.month.toString().padLeft(2, '0')}-${expenseDate.day.toString().padLeft(2, '0')}',
        'category': category,
        'description': description,
        'amount': amount,
      };
}

class _HrExpenseClaimFormScreenState extends ConsumerState<HrExpenseClaimFormScreen> {
  DateTime _claimDate = DateTime.now();
  final _description = TextEditingController();
  final List<_LineData> _lines = [];
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final e = widget.existing;
    if (e != null) {
      _claimDate = e.claimDate;
      _description.text = e.description ?? '';
      for (final it in e.items) {
        _lines.add(_LineData.fromItem(it));
      }
    }
  }

  @override
  void dispose() {
    _description.dispose();
    super.dispose();
  }

  double get _total => _lines.fold<double>(0, (s, l) => s + l.amount);

  bool get _canSave => _lines.isNotEmpty && !_saving;

  Future<void> _addItem() async {
    final res = await _openItemSheet();
    if (res != null) setState(() => _lines.add(res));
  }

  Future<void> _editItem(int i) async {
    final res = await _openItemSheet(initial: _lines[i]);
    if (res != null) setState(() => _lines[i] = res);
  }

  Future<_LineData?> _openItemSheet({_LineData? initial}) {
    return showModalBottomSheet<_LineData>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      useSafeArea: true,
      builder: (_) => _ExpenseItemSheet(initial: initial),
    );
  }

  void _removeItem(int i) {
    setState(() => _lines.removeAt(i));
  }

  Future<void> _save() async {
    if (!_canSave) return;
    setState(() => _saving = true);
    final items = _lines.map((l) => l.toPayload()).toList();
    try {
      HrExpenseClaim? created;
      if (widget.existing == null) {
        created = await hrRepo.createExpenseClaim(
          claimDate: _claimDate,
          description: _description.text.trim().isEmpty ? null : _description.text.trim(),
          items: items,
        );
      } else {
        await hrRepo.updateExpenseClaim(
          widget.existing!.id,
          claimDate: _claimDate,
          description: _description.text.trim().isEmpty ? null : _description.text.trim(),
          items: items,
        );
      }
      ref.invalidate(hrExpenseClaimsProvider);
      if (widget.existing != null) {
        ref.invalidate(hrExpenseClaimProvider(widget.existing!.id));
      }
      if (!mounted) return;

      // After a fresh create, ask whether to submit for approval now or
      // keep as draft — saves the user a second navigation when the
      // claim is ready to go. Edit flow just pops back to the list.
      if (created != null) {
        final shouldSubmit = await _askSubmitNow(created);
        if (!mounted) return;
        if (shouldSubmit == true) {
          try {
            await hrRepo.submitExpenseClaim(created.id);
            ref.invalidate(hrExpenseClaimsProvider);
            if (mounted) {
              Navigator.of(context).pop();
              showRunqSnack(context, 'Submitted for approval', kind: SnackKind.success);
            }
            return;
          } catch (e) {
            if (mounted) {
              showRunqSnack(context, 'Submit failed: $e', kind: SnackKind.error);
            }
          }
        }
      }
      if (mounted) {
        Navigator.of(context).pop();
        showRunqSnack(
          context,
          widget.existing == null ? 'Claim saved as draft' : 'Claim updated',
          kind: SnackKind.success,
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() => _saving = false);
        showRunqSnack(context, 'Save failed: $e', kind: SnackKind.error);
      }
    }
  }

  /// Sheet with two actions: "Submit for approval now" or "Save as
  /// draft". Returns true if user picked submit, false / null otherwise.
  Future<bool?> _askSubmitNow(HrExpenseClaim claim) {
    return showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      useSafeArea: true,
      builder: (_) => _SubmitOrDraftSheet(claim: claim),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return HrFormScreen(
      title: widget.existing == null ? 'New claim' : 'Edit claim',
      // Stretch to full width — HrSubmitButton renders a FilledButton
      // that defaults to wrap-content, leaving a tiny pill on the
      // dark bottom-action bar. Every other caller of HrSubmitButton
      // wraps it the same way; if this becomes universal it can move
      // into the widget itself.
      bottomAction: SizedBox(
        width: double.infinity,
        child: HrSubmitButton(
          label: widget.existing == null ? 'Create claim' : 'Save changes',
          loading: _saving,
          enabled: _canSave,
          onPressed: _save,
        ),
      ),
      body: Column(
        children: [
          HrFormSection(title: 'Claim', children: [
            HrDateField(
              label: 'Claim date',
              value: _claimDate,
              required: true,
              onChanged: (d) => setState(() => _claimDate = d ?? DateTime.now()),
            ),
            HrTextField(
              label: 'Description',
              controller: _description,
              hint: 'What is this claim for?',
              maxLines: 2,
            ),
          ]),
          const SizedBox(height: 24),
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 0, 4, 10),
            child: Row(
              children: [
                Text('ITEMS',
                    style: TextStyle(
                      color: t.muted2, fontSize: 11, fontWeight: FontWeight.w600, letterSpacing: 0.5,
                    )),
                const Spacer(),
                if (_lines.isNotEmpty)
                  Text('Total ${hrFormatINR(_total)}',
                      style: RunqText.bodyStrong.copyWith(color: HrColors.brand(context), fontSize: 13)),
              ],
            ),
          ),
          if (_lines.isEmpty)
            _EmptyItemsHint(t: t)
          else
            for (var i = 0; i < _lines.length; i++) ...[
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _ItemSummaryCard(
                  line: _lines[i],
                  onEdit: () => _editItem(i),
                  onDelete: () => _confirmDelete(i),
                ),
              ),
            ],
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: _addItem,
              icon: const Icon(Icons.add_rounded, size: 18),
              style: OutlinedButton.styleFrom(
                foregroundColor: HrColors.brand(context),
                side: BorderSide(color: HrColors.brand(context).withValues(alpha: 0.4)),
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              label: Text(_lines.isEmpty ? 'Add first item' : 'Add another item'),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _confirmDelete(int i) async {
    final line = _lines[i];
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Remove this item?'),
        content: Text('${line.description.isEmpty ? "Item" : line.description} · ${hrFormatINR(line.amount)}'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Keep')),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: TextButton.styleFrom(foregroundColor: const Color(0xFFDC2626)),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    if (ok == true) _removeItem(i);
  }
}

class _EmptyItemsHint extends StatelessWidget {
  final RunqTokens t;
  const _EmptyItemsHint({required this.t});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 28, horizontal: 16),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      child: Column(
        children: [
          Icon(Icons.receipt_long_outlined, size: 32, color: t.muted2),
          const SizedBox(height: 8),
          Text('No items yet',
              style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 13)),
          const SizedBox(height: 2),
          Text('Add expense items one by one — each gets its own date, category, and amount.',
              textAlign: TextAlign.center,
              style: RunqText.caption.copyWith(color: t.muted, fontSize: 11.5)),
        ],
      ),
    );
  }
}

// Compact item card — category icon · description / date · amount with
// edit + delete icons on the right. Replaces the old inline-form
// approach so the screen reads top-down without nesting form-in-form.
class _ItemSummaryCard extends StatelessWidget {
  final _LineData line;
  final VoidCallback onEdit;
  final VoidCallback onDelete;
  const _ItemSummaryCard({required this.line, required this.onEdit, required this.onDelete});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    final dateLabel = '${line.expenseDate.day} ${m[line.expenseDate.month - 1]}';
    return Material(
      color: t.surface,
      borderRadius: BorderRadius.circular(RunqRadii.smallCard),
      child: InkWell(
        onTap: onEdit,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        child: Container(
          padding: const EdgeInsets.fromLTRB(12, 10, 6, 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(RunqRadii.smallCard),
            border: Border.all(color: t.hairline, width: 0.5),
          ),
          child: Row(
            children: [
              Container(
                width: 38, height: 38,
                decoration: BoxDecoration(
                  color: HrColors.tealSubtle,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(_categoryIcon(line.category), size: 18, color: HrColors.brand(context)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(line.description.isEmpty ? 'Untitled item' : line.description,
                        maxLines: 1, overflow: TextOverflow.ellipsis,
                        style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 13.5)),
                    const SizedBox(height: 2),
                    Text('$dateLabel · ${hrExpenseCategoryLabel(line.category)}',
                        style: RunqText.caption.copyWith(color: t.muted, fontSize: 11.5)),
                  ],
                ),
              ),
              Text(hrFormatINR(line.amount),
                  style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 13.5)),
              IconButton(
                tooltip: 'Edit',
                icon: Icon(Icons.edit_outlined, color: t.muted, size: 18),
                visualDensity: VisualDensity.compact,
                onPressed: onEdit,
              ),
              IconButton(
                tooltip: 'Remove',
                icon: Icon(Icons.delete_outline_rounded, color: t.muted, size: 18),
                visualDensity: VisualDensity.compact,
                onPressed: onDelete,
              ),
            ],
          ),
        ),
      ),
    );
  }

  static IconData _categoryIcon(String code) {
    switch (code) {
      case 'travel':         return Icons.flight_outlined;
      case 'meals':          return Icons.restaurant_outlined;
      case 'lodging':        return Icons.hotel_outlined;
      case 'fuel':           return Icons.local_gas_station_outlined;
      case 'office_supplies':return Icons.inventory_2_outlined;
      case 'communication':  return Icons.phone_outlined;
      case 'subscriptions':  return Icons.subscriptions_outlined;
      case 'professional_services': return Icons.handshake_outlined;
      case 'training':       return Icons.school_outlined;
      case 'utilities':      return Icons.bolt_outlined;
      case 'repairs':        return Icons.build_outlined;
      case 'medical':        return Icons.medical_services_outlined;
      case 'entertainment':  return Icons.celebration_outlined;
      case 'gifts':          return Icons.card_giftcard_outlined;
      default:               return Icons.receipt_long_outlined;
    }
  }
}

// Bottom sheet for adding / editing a single expense item. Owns its own
// controllers so the parent screen stays controller-free. Returns a
// fully-populated _LineData via Navigator.pop, or null on cancel.
// Confirmation sheet shown right after a new claim is created — gives
// the user the choice to send it for approval immediately or park it
// as a draft and come back later. Saves a navigation hop for the
// common "I'm done, please review" case.
class _SubmitOrDraftSheet extends StatelessWidget {
  final HrExpenseClaim claim;
  const _SubmitOrDraftSheet({required this.claim});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final mq = MediaQuery.of(context);
    return Container(
      decoration: BoxDecoration(
        color: t.bgWarmer,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: EdgeInsets.fromLTRB(20, 12, 20, 16 + mq.padding.bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 36, height: 4,
              decoration: BoxDecoration(color: t.hairline, borderRadius: BorderRadius.circular(999)),
            ),
          ),
          const SizedBox(height: 18),
          Container(
            width: 48, height: 48,
            decoration: BoxDecoration(
              color: HrColors.tealSubtle,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(Icons.check_rounded, size: 26, color: HrColors.brand(context)),
          ),
          const SizedBox(height: 14),
          Text('Claim saved',
              textAlign: TextAlign.center,
              style: RunqText.h3.copyWith(color: t.ink, fontSize: 20)),
          const SizedBox(height: 4),
          Text('${claim.claimNumber} · ${hrFormatINR(claim.totalAmount)}',
              textAlign: TextAlign.center,
              style: RunqText.caption.copyWith(color: t.muted)),
          const SizedBox(height: 8),
          Text('Send it to your manager for approval, or keep it as a draft and submit later from the Expenses list.',
              textAlign: TextAlign.center,
              style: RunqText.body.copyWith(color: t.muted, fontSize: 13)),
          const SizedBox(height: 22),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: FilledButton.styleFrom(
              backgroundColor: HrColors.teal,
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            child: const Text('Submit for approval'),
          ),
          const SizedBox(height: 8),
          OutlinedButton(
            onPressed: () => Navigator.of(context).pop(false),
            style: OutlinedButton.styleFrom(
              foregroundColor: t.ink,
              side: BorderSide(color: t.hairline),
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            child: const Text('Save as draft'),
          ),
        ],
      ),
    );
  }
}

class _ExpenseItemSheet extends StatefulWidget {
  final _LineData? initial;
  const _ExpenseItemSheet({this.initial});

  @override
  State<_ExpenseItemSheet> createState() => _ExpenseItemSheetState();
}

class _ExpenseItemSheetState extends State<_ExpenseItemSheet> {
  late final TextEditingController _description;
  late final TextEditingController _amount;
  late DateTime _expenseDate;
  late String _category;

  @override
  void initState() {
    super.initState();
    final init = widget.initial;
    _description = TextEditingController(text: init?.description ?? '');
    _amount = TextEditingController(
      text: init == null
          ? ''
          : (init.amount == init.amount.toInt()
              ? init.amount.toInt().toString()
              : init.amount.toStringAsFixed(2)),
    );
    _expenseDate = init?.expenseDate ?? DateTime.now();
    _category = init?.category ?? 'other';
  }

  @override
  void dispose() {
    _description.dispose();
    _amount.dispose();
    super.dispose();
  }

  double? get _amountValue => double.tryParse(_amount.text.trim());
  bool get _canSave =>
      _description.text.trim().isNotEmpty && (_amountValue ?? 0) > 0;

  void _submit() {
    if (!_canSave) return;
    Navigator.of(context).pop(_LineData(
      description: _description.text.trim(),
      amount: _amountValue!,
      expenseDate: _expenseDate,
      category: _category,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final mq = MediaQuery.of(context);
    final isEdit = widget.initial != null;
    return Container(
      decoration: BoxDecoration(
        color: t.bgWarmer,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: EdgeInsets.fromLTRB(0, 12, 0, 12 + mq.viewInsets.bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Center(
            child: Container(
              width: 36, height: 4,
              decoration: BoxDecoration(color: t.hairline, borderRadius: BorderRadius.circular(999)),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 14, 20, 8),
            child: Row(
              children: [
                Text(isEdit ? 'Edit item' : 'Add item',
                    style: RunqText.h3.copyWith(color: t.ink, fontSize: 18)),
                const Spacer(),
                IconButton(
                  icon: Icon(Icons.close_rounded, color: t.muted),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
          ),
          HrTextField(
            label: 'Description',
            controller: _description,
            required: true,
            hint: 'What did you spend on?',
            onChanged: (_) => setState(() {}),
          ),
          Divider(height: 1, thickness: 0.5, color: t.hairlineSoft, indent: 14),
          HrSelectField<String>(
            label: 'Category',
            value: _category,
            required: true,
            options: hrExpenseCategories,
            display: hrExpenseCategoryLabel,
            onChanged: (c) => setState(() => _category = c ?? 'other'),
          ),
          Divider(height: 1, thickness: 0.5, color: t.hairlineSoft, indent: 14),
          HrDateField(
            label: 'Expense date',
            value: _expenseDate,
            required: true,
            onChanged: (d) => setState(() => _expenseDate = d ?? DateTime.now()),
          ),
          Divider(height: 1, thickness: 0.5, color: t.hairlineSoft, indent: 14),
          HrTextField(
            label: 'Amount (₹)',
            controller: _amount,
            required: true,
            hint: '0',
            keyboard: const TextInputType.numberWithOptions(decimal: true),
            formatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
            textCapitalization: TextCapitalization.none,
            onChanged: (_) => setState(() {}),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 4),
            child: SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: _canSave ? _submit : null,
                style: FilledButton.styleFrom(
                  backgroundColor: HrColors.teal,
                  disabledBackgroundColor: t.hairlineSoft,
                  disabledForegroundColor: t.muted2,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                child: Text(isEdit ? 'Save item' : 'Add item'),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
