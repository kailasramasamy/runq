import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/payrun_models.dart';
import '../api/payrun_repo.dart';
import '../providers/data_providers.dart';
import '../providers/payrun_providers.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../utils/format_inr.dart';
import '../widgets/async_slot.dart';
import '../widgets/runq_card.dart';
import '../widgets/runq_snack.dart';
import '../widgets/status_pill.dart';

final _selectedLinesProvider =
    StateProvider.family<Set<String>, String>((_, __) => <String>{});

class PayRunDetailScreen extends ConsumerWidget {
  final String id;
  const PayRunDetailScreen({super.key, required this.id});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detail = ref.watch(payRunDetailProvider(id));
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: AsyncSlot<PaymentRunWithLines>(
          value: detail,
          onRetry: () => ref.invalidate(payRunDetailProvider(id)),
          data: (run) => _Body(run: run),
        ),
      ),
      bottomNavigationBar:
          detail.maybeWhen(data: (run) => _ActionBar(run: run), orElse: () => null),
    );
  }
}

class _Body extends ConsumerWidget {
  final PaymentRunWithLines run;
  const _Body({required this.run});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selected = ref.watch(_selectedLinesProvider(run.id));
    return CustomScrollView(
      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
      slivers: [
        SliverToBoxAdapter(child: _Header(run: run)),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          sliver: SliverToBoxAdapter(child: _SummaryCard(run: run)),
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
          sliver: SliverToBoxAdapter(
            child: _SelectAllRow(
              run: run,
              selectedCount: selected.length,
            ),
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 120),
          sliver: SliverList.separated(
            itemCount: run.lines.length,
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemBuilder: (_, i) {
              final line = run.lines[i];
              return _LineRow(
                line: line,
                checked: selected.contains(line.id),
                editable: (run.status == 'pending_approval' ||
                        run.status == 'partially_approved') &&
                    line.status == 'pending',
                onToggle: () {
                  final s = {...selected};
                  if (s.contains(line.id)) {
                    s.remove(line.id);
                  } else {
                    s.add(line.id);
                  }
                  ref.read(_selectedLinesProvider(run.id).notifier).state = s;
                },
              );
            },
          ),
        ),
      ],
    );
  }
}

class _Header extends StatelessWidget {
  final PaymentRunWithLines run;
  const _Header({required this.run});

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
                Text('Pay run', style: RunqText.body.copyWith(color: t.muted)),
                Text(run.runId, style: RunqText.h2.copyWith(color: t.ink)),
              ],
            ),
          ),
          StatusPill(run.status, warning: run.status == 'draft'),
        ],
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  final PaymentRunWithLines run;
  const _SummaryCard({required this.run});

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
            'TOTAL',
            style: RunqText.label.copyWith(
              color: Colors.white.withValues(alpha: 0.65),
              fontSize: 11,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            formatINR(run.totalAmount),
            style: RunqText.display
                .copyWith(color: Colors.white, fontSize: 32, height: 1.05),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: _MiniStat(
                  label: 'Lines',
                  value: '${run.totalCount}',
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _MiniStat(
                  label: 'Approved',
                  value: '${run.approvedCount} / ${run.totalCount}',
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _MiniStat(
                  label: 'Approved ₹',
                  value: formatINR(run.approvedAmount, compact: true),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  final String label, value;
  const _MiniStat({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label,
              style: RunqText.caption.copyWith(
                color: Colors.white.withValues(alpha: 0.65),
                fontSize: 10,
              )),
          const SizedBox(height: 2),
          Text(value,
              style: RunqText.tabular(
                  size: 14, w: FontWeight.w700, color: Colors.white)),
        ],
      ),
    );
  }
}

class _SelectAllRow extends ConsumerWidget {
  final PaymentRunWithLines run;
  final int selectedCount;
  const _SelectAllRow({required this.run, required this.selectedCount});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final pendingIds = run.lines
        .where((l) => l.status == 'pending')
        .map((l) => l.id)
        .toSet();
    final allSelected =
        pendingIds.isNotEmpty && selectedCount == pendingIds.length;
    final canSelect = (run.status == 'pending_approval' ||
            run.status == 'partially_approved') &&
        pendingIds.isNotEmpty;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Text('Vendors',
              style: RunqText.label.copyWith(color: t.muted2, fontSize: 11)),
          const Spacer(),
          if (canSelect)
            TextButton(
              onPressed: () {
                ref.read(_selectedLinesProvider(run.id).notifier).state =
                    allSelected ? <String>{} : pendingIds;
              },
              style: TextButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              child: Text(
                allSelected ? 'Clear' : 'Select all pending',
                style: RunqText.caption.copyWith(
                  color: t.brand,
                  fontWeight: FontWeight.w600,
                  fontSize: 12,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _LineRow extends StatelessWidget {
  final PaymentRunLine line;
  final bool checked;
  final bool editable;
  final VoidCallback onToggle;
  const _LineRow({
    required this.line,
    required this.checked,
    required this.editable,
    required this.onToggle,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final color = switch (line.status) {
      'approved' => const Color(0xFF047857),
      'rejected' => RunqColors.redInk,
      _ => t.muted,
    };
    return RunqCard(
      onTap: editable ? onToggle : null,
      padding: const EdgeInsets.all(14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          if (editable)
            Container(
              width: 22,
              height: 22,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: checked ? t.brand : Colors.transparent,
                border: Border.all(
                  color: checked ? t.brand : t.hairline,
                  width: 1.5,
                ),
                borderRadius: BorderRadius.circular(6),
              ),
              child: checked
                  ? const Icon(Icons.check, color: Colors.white, size: 14)
                  : null,
            )
          else
            Container(
              width: 22,
              height: 22,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Icon(
                line.status == 'approved'
                    ? Icons.check_rounded
                    : line.status == 'rejected'
                        ? Icons.close_rounded
                        : Icons.schedule_rounded,
                size: 14,
                color: color,
              ),
            ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(line.vendorName,
                    style: RunqText.bodyStrong.copyWith(color: t.ink),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis),
                if (line.reference != null && line.reference!.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(line.reference!,
                      style: RunqText.caption.copyWith(color: t.muted, fontSize: 12),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis),
                ],
                if (line.errorMessage != null && line.errorMessage!.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(line.errorMessage!,
                      style: RunqText.caption
                          .copyWith(color: RunqColors.redInk, fontSize: 11),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis),
                ],
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(formatINR(line.amount, compact: true),
              style: RunqText.tabular(size: 15, w: FontWeight.w700, color: t.ink)),
        ],
      ),
    );
  }
}

class _ActionBar extends ConsumerStatefulWidget {
  final PaymentRunWithLines run;
  const _ActionBar({required this.run});

  @override
  ConsumerState<_ActionBar> createState() => _ActionBarState();
}

class _ActionBarState extends ConsumerState<_ActionBar> {
  bool _busy = false;

  Future<void> _approve() async {
    final selected = ref.read(_selectedLinesProvider(widget.run.id));
    if (selected.isEmpty) return;
    setState(() => _busy = true);
    try {
      await payRunRepo.approveLines(widget.run.id, selected.toList());
      ref.invalidate(payRunDetailProvider(widget.run.id));
      ref.invalidate(payRunListProvider);
      ref.read(_selectedLinesProvider(widget.run.id).notifier).state = {};
      if (!mounted) return;
      showRunqSnack(
        context,
        'Approved ${selected.length} ${selected.length == 1 ? 'line' : 'lines'}',
        kind: SnackKind.success,
      );
    } catch (e) {
      if (!mounted) return;
      showRunqSnack(context, "Couldn't approve: $e", kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _execute() async {
    final accounts = await ref.read(bankAccountsProvider.future);
    if (!mounted) return;
    final picked = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _BankAccountPicker(accounts: accounts),
    );
    if (picked == null) return;
    if (!mounted) return;
    setState(() => _busy = true);
    try {
      await payRunRepo.execute(widget.run.id, picked);
      ref.invalidate(payRunDetailProvider(widget.run.id));
      ref.invalidate(payRunListProvider);
      ref.invalidate(payRunQueueProvider);
      ref.invalidate(bankAccountsProvider);
      if (!mounted) return;
      showRunqSnack(context, 'Pay run executed', kind: SnackKind.success);
    } catch (e) {
      if (!mounted) return;
      showRunqSnack(context, "Couldn't execute: $e", kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final run = widget.run;
    final selected = ref.watch(_selectedLinesProvider(run.id));
    final isDraft = run.status == 'pending_approval' ||
        run.status == 'partially_approved';
    final isApproved = run.status == 'approved';
    if (!isDraft && !isApproved) return const SizedBox.shrink();
    return SafeArea(
      child: Container(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
        decoration: BoxDecoration(
          color: t.surface,
          border: Border(top: BorderSide(color: t.hairline, width: 0.5)),
        ),
        child: SizedBox(
          height: 50,
          child: isDraft
              ? FilledButton(
                  onPressed: (_busy || selected.isEmpty) ? null : _approve,
                  style: FilledButton.styleFrom(
                    backgroundColor: t.brand,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: _busy
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white),
                        )
                      : Text(
                          selected.isEmpty
                              ? 'Select lines to approve'
                              : 'Approve ${selected.length} ${selected.length == 1 ? 'line' : 'lines'}',
                          style: RunqText.bodyStrong
                              .copyWith(color: Colors.white, fontSize: 15),
                        ),
                )
              : FilledButton(
                  onPressed: _busy ? null : _execute,
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFF047857),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: _busy
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white),
                        )
                      : Text(
                          'Release ${formatINR(run.approvedAmount, compact: true)}',
                          style: RunqText.bodyStrong
                              .copyWith(color: Colors.white, fontSize: 15),
                        ),
                ),
        ),
      ),
    );
  }
}

class _BankAccountPicker extends StatelessWidget {
  final List accounts;
  const _BankAccountPicker({required this.accounts});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return SafeArea(
      child: Container(
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(22)),
          border: Border.all(color: t.hairline, width: 0.5),
          boxShadow: RunqShadows.sheet,
        ),
        padding: const EdgeInsets.fromLTRB(20, 14, 20, 18),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 36,
                height: 4,
                margin: const EdgeInsets.only(bottom: 14),
                decoration: BoxDecoration(
                  color: t.hairline,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            Text('Release from',
                style: RunqText.h3.copyWith(color: t.ink)),
            const SizedBox(height: 4),
            Text('Pick the bank account to debit',
                style: RunqText.caption.copyWith(color: t.muted)),
            const SizedBox(height: 14),
            for (final a in accounts) ...[
              Material(
                color: Colors.transparent,
                borderRadius: BorderRadius.circular(12),
                child: InkWell(
                  onTap: () => Navigator.of(context).pop(a.id as String),
                  borderRadius: BorderRadius.circular(12),
                  child: Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      border: Border.all(color: t.hairline, width: 0.5),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(a.name as String,
                                  style: RunqText.bodyStrong.copyWith(color: t.ink)),
                              const SizedBox(height: 2),
                              Text(a.bankName as String,
                                  style: RunqText.caption.copyWith(color: t.muted)),
                            ],
                          ),
                        ),
                        Text(formatINR(a.currentBalance as double, compact: true),
                            style: RunqText.tabular(
                                size: 14, w: FontWeight.w700, color: t.ink)),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 8),
            ],
          ],
        ),
      ),
    );
  }
}
