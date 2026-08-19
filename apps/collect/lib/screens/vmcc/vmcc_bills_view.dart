import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../api/mp_repo.dart';
import '../../l10n/app_localizations.dart';
import '../../l10n/l10n_helpers.dart';
import '../../providers/mp_payout_providers.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../utils/friendly_error.dart';
import '../../widgets/breakdown_bar.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/dhenu_toast.dart';
import '../../widgets/pdf_preview_screen.dart';
import '../../widgets/section_header.dart';
import '../../widgets/stat_card.dart';

/// Payments for a VMCC whose milk is bought in bulk: one settlement bill per
/// cycle, not a farmer payout run.
///
/// These centres don't register farmers — the chilling centre keys their
/// arrivals by hand — so the cycles view has nothing to show them, and the
/// cycle it would ask for belongs to the parent CC anyway, outside their
/// operator's reach. The bill is the whole of their money: what the milk came
/// to, what the operator was paid on top, and whether it has landed.
class VmccBillsView extends ConsumerWidget {
  const VmccBillsView({super.key, required this.node});
  final MpNode node;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final billsAsync = ref.watch(nodeVmccBillsProvider(node.id));
    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(nodeVmccBillsProvider(node.id));
        await ref.read(nodeVmccBillsProvider(node.id).future);
      },
      child: billsAsync.when(
        loading: () => const DhenuLoadingList(rows: 4),
        error: (e, _) => ListView(children: [
          const SizedBox(height: DhenuSpacing.x4),
          DhenuEmptyState(
              icon: DhenuIcons.cloudOff,
              title: l.paymentsCouldNotLoadCycles,
              subtitle: friendlyError(context, e)),
        ]),
        data: (bills) => _list(context, t, l, bills),
      ),
    );
  }

  Widget _list(
      BuildContext context, DhenuTokens t, AppLocalizations l, List<MpVmccBill> bills) {
    final live = bills.where((b) => !b.isReversed);
    final paid = live.where((b) => b.isPaid).fold<double>(0, (a, b) => a + b.totalAmount);
    final due = live.where((b) => !b.isPaid).fold<double>(0, (a, b) => a + b.totalAmount);
    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(
          DhenuSpacing.screen, DhenuSpacing.lg, DhenuSpacing.screen, DhenuSpacing.x4),
      children: [
        DhenuSectionHeader(l.navPayments),
        const SizedBox(height: DhenuSpacing.xs),
        Text(l.paymentsBillsSubtitle, style: DhenuText.caption.copyWith(color: t.inkSoft)),
        const SizedBox(height: DhenuSpacing.lg),
        if (bills.isEmpty)
          DhenuEmptyState(
            icon: DhenuIcons.payments,
            title: l.paymentsBillsEmptyTitle,
            subtitle: l.paymentsBillsEmptySubtitle,
          )
        else ...[
          Row(children: [
            Expanded(child: DhenuStatCard(
                label: l.paymentsBillsPaidTotal, value: rupees(paid), valueColor: t.gradeA)),
            const SizedBox(width: DhenuSpacing.md),
            Expanded(child: DhenuStatCard(
                label: l.paymentsBillsDueTotal,
                value: rupees(due),
                valueColor: due > 0 ? t.gradeB : t.inkSoft)),
          ]),
          const SizedBox(height: DhenuSpacing.xl),
          Text(l.paymentsBillsTitle, style: DhenuText.title.copyWith(color: t.ink)),
          const SizedBox(height: DhenuSpacing.sm),
          for (final b in bills) ...[
            _BillCard(node: node, bill: b),
            const SizedBox(height: DhenuSpacing.md),
          ],
        ],
      ],
    );
  }
}

/// One cycle's bill: period and litres, the amount, how it was made up, and the
/// statement behind it.
class _BillCard extends StatefulWidget {
  const _BillCard({required this.node, required this.bill});
  final MpNode node;
  final MpVmccBill bill;

  @override
  State<_BillCard> createState() => _BillCardState();
}

class _BillCardState extends State<_BillCard> {
  bool _busy = false;

  MpVmccBill get b => widget.bill;

  /// The same document the chilling centre and the web app hand out — rendered
  /// server-side, so nobody argues about which paper is authoritative. It opens
  /// for reading: the operator's first question is whether the amount is right,
  /// which they answer by looking, not by sending it to someone.
  Future<void> _statement() async {
    setState(() => _busy = true);
    try {
      final doc = await mpRepo.vmccBillStatementPdf(
        nodeId: widget.node.id, from: b.periodStart, to: b.periodEnd);
      if (!mounted) return;
      final l = AppLocalizations.of(context);
      await Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => PdfPreviewScreen(
          title: l.paymentsBillStatement, bytes: doc.bytes, filename: doc.filename),
      ));
    } catch (e) {
      if (mounted) {
        showDhenuToast(context, friendlyError(context, e), type: DhenuToastType.error);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    return DhenuCard(
      padding: EdgeInsets.zero,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        _identity(t, l),
        Divider(height: 1, color: t.hairline),
        _money(t, l),
        Divider(height: 1, color: t.hairline),
        _action(t, l),
      ]),
    );
  }

  /// Which cycle this is, and where it stands. The period leads because that is
  /// how an operator asks the question — "what did I get for the second half of
  /// July" — not by bill number.
  Widget _identity(DhenuTokens t, AppLocalizations l) {
    final (label, color) = b.isReversed
        ? (l.paymentsBillReversed, t.inkSoft)
        : b.isPaid
            ? (l.paymentsBillStatusPaid, t.gradeA)
            : (l.paymentsBillStatusDue, t.gradeB);
    return Padding(
      padding: const EdgeInsets.fromLTRB(
          DhenuSpacing.lg, DhenuSpacing.lg, DhenuSpacing.lg, DhenuSpacing.md),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(
            child: Text('${prettyDate(b.periodStart)} – ${prettyDate(b.periodEnd)}',
                style: DhenuText.title.copyWith(color: t.ink),
                maxLines: 1, overflow: TextOverflow.ellipsis),
          ),
          const SizedBox(width: DhenuSpacing.sm),
          Container(
            padding: const EdgeInsets.symmetric(
                horizontal: DhenuSpacing.md, vertical: DhenuSpacing.xs),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(DhenuRadii.pill),
            ),
            child: Text(label, style: DhenuText.label.copyWith(color: color)),
          ),
        ]),
        const SizedBox(height: DhenuSpacing.xs),
        Text('${b.billNo}  ·  ${litres(b.qtyLitres, unit: true)}',
            style: DhenuText.caption.copyWith(color: t.inkSoft)),
      ]),
    );
  }

  /// The amount, then what it is made of. Milk and operator pay are settled
  /// together but earned differently, so an operator chasing a short payment
  /// can see which half moved — the bar carries that split at a glance, the
  /// legend puts figures on it.
  Widget _money(DhenuTokens t, AppLocalizations l) {
    final split = b.operatorComp > 0;
    return Padding(
      padding: const EdgeInsets.all(DhenuSpacing.lg),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic, children: [
          Text(rupees(b.totalAmount),
              style: DhenuText.number(size: 22, color: b.isReversed ? t.inkSoft : t.ink)),
          const SizedBox(width: DhenuSpacing.sm),
          Text(l.paymentsBillTotal, style: DhenuText.caption.copyWith(color: t.inkSoft)),
        ]),
        if (split) ...[
          const SizedBox(height: DhenuSpacing.md),
          BreakdownBar(height: 8, segments: [
            BreakdownSegment(b.milkCost, t.brand),
            BreakdownSegment(b.operatorComp, t.am),
          ]),
          const SizedBox(height: DhenuSpacing.sm),
          // Wrapped, not a Row: a five-figure milk cost beside a translated
          // "Operator" label runs past a phone's width on one line.
          Wrap(
            spacing: DhenuSpacing.lg,
            runSpacing: DhenuSpacing.xs,
            children: [
              _legend(t, t.brand, l.paymentsBillMilk, b.milkCost),
              _legend(t, t.am, l.paymentsBillOperator, b.operatorComp),
            ],
          ),
        ],
        if (b.isPaid && b.paymentDate != null) ...[
          const SizedBox(height: DhenuSpacing.md),
          Row(children: [
            Icon(DhenuIcons.checkCircle, size: 13, color: t.gradeA),
            const SizedBox(width: DhenuSpacing.xs),
            Text(_paidLine(l), style: DhenuText.caption.copyWith(color: t.inkSoft)),
          ]),
        ],
      ]),
    );
  }

  /// When it landed, and how — the two things asked of a payment after the
  /// amount itself. Mode is dropped when the record doesn't carry one.
  String _paidLine(AppLocalizations l) {
    final when = shortDate(b.paymentDate!);
    final mode = b.paymentMode;
    return mode == null ? when : '$when  ·  ${paymentModeL10n(l, mode)}';
  }

  Widget _legend(DhenuTokens t, Color c, String label, double amount) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(width: 8, height: 8,
              decoration: BoxDecoration(color: c, shape: BoxShape.circle)),
          const SizedBox(width: DhenuSpacing.xs),
          Text('$label ${rupees(amount)}',
              style: DhenuText.caption.copyWith(color: t.inkSoft)),
        ],
      );

  Widget _action(DhenuTokens t, AppLocalizations l) => Material(
        type: MaterialType.transparency,
        child: InkWell(
          onTap: _busy ? null : _statement,
          borderRadius: const BorderRadius.vertical(
              bottom: Radius.circular(DhenuRadii.card)),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: DhenuSpacing.md),
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              if (_busy)
                SizedBox(
                    width: 14, height: 14,
                    child: CircularProgressIndicator(strokeWidth: 2, color: t.brand))
              else
                Icon(DhenuIcons.download, size: 16, color: t.brand),
              const SizedBox(width: DhenuSpacing.sm),
              Text(l.paymentsBillStatement,
                  style: DhenuText.label.copyWith(color: t.brand)),
            ]),
          ),
        ),
      );
}
