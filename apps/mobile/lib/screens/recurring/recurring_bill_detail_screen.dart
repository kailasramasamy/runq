import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/api_client.dart';
import '../../api/recurring_bill_models.dart';
import '../../api/recurring_bills_repo.dart';
import '../../providers/recurring_bill_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../utils/format_inr.dart';
import '../../widgets/async_slot.dart';
import '../../widgets/runq_card.dart';
import '../../widgets/runq_snack.dart';
import 'recurring_actions.dart';
import 'recurring_ledger_sections.dart';
import 'recurring_payment_sheet.dart';
import 'recurring_widgets.dart';

class RecurringBillDetailScreen extends ConsumerWidget {
  final String id;
  const RecurringBillDetailScreen({super.key, required this.id});

  Future<void> _toggle(BuildContext context, WidgetRef ref, RecurringBill a) async {
    try {
      await recurringBillsRepo.update(a.id, {'isActive': !a.isActive});
      ref.invalidate(recurringBillDetailProvider(id));
      ref.invalidate(recurringBillsProvider);
    } on ApiException catch (e) {
      if (context.mounted) showRunqSnack(context, e.message, kind: SnackKind.error);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final async = ref.watch(recurringBillDetailProvider(id));
    final agreement = async.value?.agreement;
    return Scaffold(
      backgroundColor: t.bgWarmer,
      appBar: AppBar(
        title: const Text('Recurring bill'),
        actions: [
          if (agreement != null)
            _ActionsMenu(
              active: agreement.isActive,
              onEdit: () => context.push('/recurring-bills/$id/edit'),
              onToggle: () => _toggle(context, ref, agreement),
              onDelete: () => deleteAgreement(context, ref, async.value!),
            ),
        ],
      ),
      body: AsyncSlot<RecurringBillDetail>(
        value: async,
        onRetry: () => ref.invalidate(recurringBillDetailProvider(id)),
        data: (d) => RefreshIndicator(
          onRefresh: () async => ref.invalidate(recurringBillDetailProvider(id)),
          child: _Body(detail: d),
        ),
      ),
    );
  }
}

/// The ⋯ menu: icon-led rows with room to breathe, opening below the app bar.
class _ActionsMenu extends StatelessWidget {
  final bool active;
  final VoidCallback onEdit, onToggle, onDelete;
  const _ActionsMenu({
    required this.active, required this.onEdit, required this.onToggle, required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return PopupMenuButton<VoidCallback>(
      icon: const Icon(Icons.more_vert_rounded),
      tooltip: 'More',
      position: PopupMenuPosition.under,
      offset: const Offset(0, 6),
      color: t.surface,
      elevation: 8,
      constraints: const BoxConstraints(minWidth: 220),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: t.hairline, width: 0.6),
      ),
      onSelected: (action) => action(),
      itemBuilder: (_) => [
        _item(t, onEdit, Icons.edit_outlined, 'Edit agreement', 'Amount, bill day, end month'),
        const PopupMenuDivider(height: 1),
        _item(
          t,
          onToggle,
          active ? Icons.pause_circle_outline_rounded : Icons.play_circle_outline_rounded,
          active ? 'Pause' : 'Resume',
          active ? 'Stop raising new bills' : 'Start raising bills again',
        ),
        const PopupMenuDivider(height: 1),
        _item(t, onDelete, Icons.delete_outline_rounded, 'Delete', 'Only while nothing is paid',
            tint: RecurringInk.of(context).red),
      ],
    );
  }

  PopupMenuItem<VoidCallback> _item(
      RunqTokens t, VoidCallback action, IconData icon, String label, String hint, {Color? tint}) {
    final c = tint ?? RunqColors.indigo;
    return PopupMenuItem(
      value: action,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: c.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, size: 19, color: c),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(label, style: RunqText.bodyStrong.copyWith(color: tint ?? t.ink)),
                const SizedBox(height: 2),
                Text(hint, style: RunqText.caption.copyWith(color: t.muted)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Body extends ConsumerWidget {
  final RecurringBillDetail detail;
  const _Body({required this.detail});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final a = detail.agreement;
    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
      children: [
        _Header(a: a),
        const SizedBox(height: 12),
        _Stats(a: a),
        const SizedBox(height: 12),
        FilledButton(
          style: FilledButton.styleFrom(
            backgroundColor: RunqColors.indigo,
            foregroundColor: Colors.white,
            minimumSize: const Size.fromHeight(48),
          ),
          onPressed: () => showRecurringPaymentSheet(context, a, detail.months),
          child: const Text('Record payment'),
        ),
        const SizedBox(height: 24),
        LedgerSection(
          title: a.frequency == 'semi_monthly' ? 'Bills' : 'Months',
          summary: '${detail.months.length} · ${formatINR(detail.months.fold<double>(0, (s, m) => s + m.total))}',
          emptyText: 'No bills yet — raised after each period ends',
          rows: [for (final m in detail.months) LedgerMonthRow(m: m)],
        ),
        const SizedBox(height: 24),
        LedgerSection(
          title: 'Payments',
          summary: '${detail.payments.length} · ${formatINR(detail.payments.fold<double>(0, (s, p) => s + p.amount))}',
          emptyText: 'No payments yet',
          rows: [
            for (final p in detail.payments)
              LedgerPaymentRow(p: p, onCancel: () => cancelPayment(context, ref, detail.agreement.id, p)),
          ],
        ),
      ],
    );
  }
}

class _Header extends StatelessWidget {
  final RecurringBill a;
  const _Header({required this.a});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final ink = RecurringInk.of(context);
    return RunqCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(a.title, style: RunqText.h3.copyWith(color: t.ink))),
              RecurringChip(a.isActive ? 'Active' : 'Paused', a.isActive ? ink.green : t.muted),
            ],
          ),
          const SizedBox(height: 2),
          Text(a.vendorName, style: RunqText.body.copyWith(color: t.muted)),
          const SizedBox(height: 10),
          Text('${formatINR(a.amount)} / month',
              style: RunqText.numberLg.copyWith(color: t.ink)),
          const SizedBox(height: 2),
          Text(
            '${categoryLabel(a.category)} · ${a.frequency == 'semi_monthly' ? 'billed 16th & 1st' : 'billed on day ${a.billDay} of next month'} · from ${monthLabel(a.startMonth)}'
            '${a.endMonth == null ? '' : ' to ${monthLabel(a.endMonth!)}'}',
            style: RunqText.caption.copyWith(color: t.muted),
          ),
        ],
      ),
    );
  }
}

class _Stats extends StatelessWidget {
  final RecurringBill a;
  const _Stats({required this.a});

  @override
  Widget build(BuildContext context) {
    final ink = RecurringInk.of(context);
    return RunqCard(
      child: Row(
        children: [
          Expanded(
            child: RecurringStat(
                label: 'Outstanding',
                value: formatINR(a.outstanding),
                color: a.outstanding > 0 ? ink.amber : null),
          ),
          Expanded(
            child: RecurringStat(
                label: 'Advance held',
                value: formatINR(a.advanceHeld),
                color: a.advanceHeld > 0 ? ink.green : null),
          ),
          Expanded(child: RecurringStat(label: 'Paid to date', value: formatINR(a.paid))),
        ],
      ),
    );
  }
}

