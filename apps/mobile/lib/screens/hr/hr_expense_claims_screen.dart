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
import '../../providers/hr_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart';
import 'widgets/hr_colors.dart';
import 'widgets/hr_form.dart';
import 'widgets/hr_widgets.dart';

// ─── List ─────────────────────────────────────────────────────────────────

final _claimsFilterProvider = StateProvider<String?>((_) => null);

class HrExpenseClaimsScreen extends ConsumerWidget {
  const HrExpenseClaimsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final status = ref.watch(_claimsFilterProvider);
    final query = HrClaimsQuery(status: status);
    final claimsAsync = ref.watch(hrExpenseClaimsProvider(query));

    return Scaffold(
      backgroundColor: t.bgWarm,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            _Header(),
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
                  data: (rows) {
                    if (rows.isEmpty) {
                      return ListView(
                        physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
                        padding: const EdgeInsets.fromLTRB(16, 60, 16, 120),
                        children: [
                          Icon(Icons.receipt_long_outlined, size: 40, color: t.muted2),
                          const SizedBox(height: 10),
                          Center(child: Text('No claims here',
                              style: RunqText.bodyStrong.copyWith(color: t.ink))),
                          const SizedBox(height: 4),
                          Center(child: Text('Tap + to submit your first claim',
                              style: RunqText.caption.copyWith(color: t.muted))),
                        ],
                      );
                    }
                    return ListView.builder(
                      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
                      padding: const EdgeInsets.fromLTRB(16, 4, 16, 120),
                      itemCount: rows.length,
                      itemBuilder: (_, i) => _ClaimRow(claim: rows[i]),
                    );
                  },
                ),
              ),
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        heroTag: 'new-claim',
        backgroundColor: HrColors.teal,
        foregroundColor: Colors.white,
        onPressed: () => context.push('/hr/expense-claims/new'),
        icon: const Icon(Icons.add_rounded),
        label: const Text('New claim'),
      ),
    );
  }
}

class _Header extends StatelessWidget {
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
          Text('Expense claims', style: RunqText.h1.copyWith(color: t.ink)),
        ],
      ),
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
      height: 42,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
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
  const _ClaimRow({required this.claim});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
        boxShadow: RunqShadows.card,
      ),
      child: InkWell(
        onTap: () => context.push('/hr/expense-claims/${claim.id}'),
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
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
    final canManage = role == AppRole.admin;

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
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 140),
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
                _DetailActions(claim: claim, canManage: canManage),
              ],
            );
          },
        ),
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
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
            decoration: BoxDecoration(
              color: HrColors.tealSubtle,
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(
              hrExpenseCategoryLabel(item.category),
              style: TextStyle(
                color: HrColors.brand(context), fontSize: 10.5, fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(item.description,
                    maxLines: 2, overflow: TextOverflow.ellipsis,
                    style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 13)),
                const SizedBox(height: 2),
                Text('${item.expenseDate.day} ${m[item.expenseDate.month - 1]}',
                    style: RunqText.caption.copyWith(color: t.muted, fontSize: 11.5)),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(hrFormatINR(item.amount),
              style: RunqText.tabular(size: 14, w: FontWeight.w700, color: t.ink)),
        ],
      ),
    );
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
  final bool canManage;
  const _DetailActions({required this.claim, required this.canManage});

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
    if (canManage && claim.canApprove) {
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
    if (canManage && claim.canReimburse) {
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
      child: Container(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
        decoration: BoxDecoration(
          color: t.surface,
          border: Border(top: BorderSide(color: t.hairline, width: 0.5)),
        ),
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
      ref.invalidate(hrExpenseClaimsProvider(const HrClaimsQuery()));
      if (context.mounted) showRunqSnack(context, 'Submitted for approval', kind: SnackKind.success);
    } catch (e) {
      if (context.mounted) showRunqSnack(context, 'Submit failed: $e', kind: SnackKind.error);
    }
  }

  Future<void> _approve(BuildContext context, WidgetRef ref) async {
    try {
      await hrRepo.approveExpenseClaim(claim.id, approved: true);
      ref.invalidate(hrExpenseClaimProvider(claim.id));
      ref.invalidate(hrExpenseClaimsProvider(const HrClaimsQuery()));
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
      ref.invalidate(hrExpenseClaimsProvider(const HrClaimsQuery()));
      if (context.mounted) showRunqSnack(context, 'Claim rejected', kind: SnackKind.success);
    } catch (e) {
      if (context.mounted) showRunqSnack(context, 'Reject failed: $e', kind: SnackKind.error);
    }
  }

  Future<void> _reimburse(BuildContext context, WidgetRef ref) async {
    try {
      await hrRepo.reimburseExpenseClaim(claim.id);
      ref.invalidate(hrExpenseClaimProvider(claim.id));
      ref.invalidate(hrExpenseClaimsProvider(const HrClaimsQuery()));
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

class _HrExpenseClaimFormScreenState extends ConsumerState<HrExpenseClaimFormScreen> {
  DateTime _claimDate = DateTime.now();
  final _description = TextEditingController();
  final List<_LineState> _lines = [];
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final e = widget.existing;
    if (e != null) {
      _claimDate = e.claimDate;
      _description.text = e.description ?? '';
      for (final it in e.items) {
        _lines.add(_LineState.fromItem(it));
      }
    } else {
      _lines.add(_LineState.blank());
    }
  }

  @override
  void dispose() {
    _description.dispose();
    for (final l in _lines) {
      l.dispose();
    }
    super.dispose();
  }

  double get _total => _lines.fold<double>(0, (s, l) => s + (l.amount ?? 0));

  bool get _canSave {
    if (_lines.isEmpty) return false;
    for (final l in _lines) {
      if (!l.isValid) return false;
    }
    return true;
  }

  Future<void> _save() async {
    if (!_canSave || _saving) return;
    setState(() => _saving = true);
    final items = _lines.map((l) => l.toPayload()).toList();
    try {
      if (widget.existing == null) {
        await hrRepo.createExpenseClaim(
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
      // Invalidate caches so list + detail show the change.
      ref.invalidate(hrExpenseClaimsProvider(const HrClaimsQuery()));
      if (widget.existing != null) {
        ref.invalidate(hrExpenseClaimProvider(widget.existing!.id));
      }
      if (mounted) {
        Navigator.of(context).pop();
        showRunqSnack(
          context,
          widget.existing == null ? 'Claim created' : 'Claim updated',
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

  void _addLine() {
    setState(() => _lines.add(_LineState.blank()));
  }

  void _removeLine(int i) {
    setState(() {
      _lines[i].dispose();
      _lines.removeAt(i);
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return HrFormScreen(
      title: widget.existing == null ? 'New claim' : 'Edit claim',
      bottomAction: HrSubmitButton(
        label: widget.existing == null ? 'Create claim' : 'Save changes',
        loading: _saving,
        enabled: _canSave,
        onPressed: _save,
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
          const SizedBox(height: 14),
          Row(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(4, 0, 4, 6),
                child: Text(
                  'LINE ITEMS',
                  style: TextStyle(
                    color: t.muted2, fontSize: 11, fontWeight: FontWeight.w600, letterSpacing: 0.5,
                  ),
                ),
              ),
              const Spacer(),
              Text(
                'Total ${hrFormatINR(_total)}',
                style: RunqText.bodyStrong.copyWith(color: HrColors.brand(context), fontSize: 13),
              ),
            ],
          ),
          for (var i = 0; i < _lines.length; i++) ...[
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: _LineCard(
                index: i + 1,
                line: _lines[i],
                onChanged: () => setState(() {}),
                onRemove: _lines.length > 1 ? () => _removeLine(i) : null,
              ),
            ),
          ],
          OutlinedButton.icon(
            onPressed: _addLine,
            icon: const Icon(Icons.add_rounded, size: 18),
            style: OutlinedButton.styleFrom(
              foregroundColor: HrColors.brand(context),
              side: BorderSide(color: HrColors.brand(context).withValues(alpha: 0.4)),
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            label: const Text('Add line'),
          ),
        ],
      ),
    );
  }
}

class _LineState {
  final TextEditingController description;
  final TextEditingController amountCtrl;
  DateTime expenseDate;
  String category;

  _LineState({
    required this.description,
    required this.amountCtrl,
    required this.expenseDate,
    required this.category,
  });

  factory _LineState.blank() => _LineState(
        description: TextEditingController(),
        amountCtrl: TextEditingController(),
        expenseDate: DateTime.now(),
        category: 'other',
      );

  factory _LineState.fromItem(HrExpenseClaimItem it) => _LineState(
        description: TextEditingController(text: it.description),
        amountCtrl: TextEditingController(
          text: it.amount == it.amount.toInt()
              ? it.amount.toInt().toString()
              : it.amount.toStringAsFixed(2),
        ),
        expenseDate: it.expenseDate,
        category: it.category,
      );

  double? get amount => double.tryParse(amountCtrl.text.trim());
  bool get isValid =>
      description.text.trim().isNotEmpty && (amount ?? 0) > 0;

  Map<String, dynamic> toPayload() => {
        'expenseDate':
            '${expenseDate.year.toString().padLeft(4, '0')}-${expenseDate.month.toString().padLeft(2, '0')}-${expenseDate.day.toString().padLeft(2, '0')}',
        'category': category,
        'description': description.text.trim(),
        'amount': amount ?? 0,
      };

  void dispose() {
    description.dispose();
    amountCtrl.dispose();
  }
}

class _LineCard extends StatelessWidget {
  final int index;
  final _LineState line;
  final VoidCallback onChanged;
  final VoidCallback? onRemove;
  const _LineCard({
    required this.index,
    required this.line,
    required this.onChanged,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
        boxShadow: RunqShadows.card,
      ),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 10, 6, 0),
            child: Row(
              children: [
                Text('Line $index',
                    style: RunqText.caption.copyWith(color: t.muted2, fontSize: 11)),
                const Spacer(),
                if (onRemove != null)
                  IconButton(
                    icon: Icon(Icons.delete_outline_rounded, color: t.muted2, size: 18),
                    visualDensity: VisualDensity.compact,
                    onPressed: onRemove,
                  ),
              ],
            ),
          ),
          HrTextField(
            label: 'Description',
            controller: line.description,
            required: true,
            hint: 'What did you spend on?',
            onChanged: (_) => onChanged(),
          ),
          Divider(height: 1, thickness: 0.5, color: t.hairlineSoft, indent: 14),
          HrSelectField<String>(
            label: 'Category',
            value: line.category,
            required: true,
            options: hrExpenseCategories,
            display: hrExpenseCategoryLabel,
            onChanged: (c) {
              line.category = c ?? 'other';
              onChanged();
            },
          ),
          Divider(height: 1, thickness: 0.5, color: t.hairlineSoft, indent: 14),
          HrDateField(
            label: 'Expense date',
            value: line.expenseDate,
            required: true,
            onChanged: (d) {
              if (d != null) line.expenseDate = d;
              onChanged();
            },
          ),
          Divider(height: 1, thickness: 0.5, color: t.hairlineSoft, indent: 14),
          HrTextField(
            label: 'Amount (₹)',
            controller: line.amountCtrl,
            required: true,
            hint: '0',
            keyboard: const TextInputType.numberWithOptions(decimal: true),
            formatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
            textCapitalization: TextCapitalization.none,
            onChanged: (_) => onChanged(),
          ),
        ],
      ),
    );
  }
}
