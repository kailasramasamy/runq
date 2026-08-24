import 'package:flutter/material.dart';
import '../../theme/dhenu_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../api/mp_repo.dart';
import '../../l10n/app_localizations.dart';
import '../../l10n/l10n_helpers.dart';
import '../../providers/mp_context_provider.dart';
import '../../providers/mp_payout_providers.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../utils/friendly_error.dart';
import '../../widgets/breakdown_bar.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/dhenu_toast.dart';
import '../../widgets/primary_action.dart';
import '../../widgets/source_row.dart';
import '../shared/cycle_payments.dart';
import 'payout_line_sheet.dart';

enum _PaidFilter { all, unpaid, paid }

/// Cycle detail — per-farmer payout lines with a paid/unpaid disbursement
/// checklist, plus the lock/pay GL progression (open → Lock → locked → Pay →
/// paid; Pay posts vendor payments to Finance). The per-farmer toggle is an
/// operational flag the operator ticks as each farmer is handed cash/UPI.
class CycleDetailScreen extends ConsumerStatefulWidget {
  const CycleDetailScreen({super.key, required this.node, required this.cycleId});
  final MpNode node;
  final String cycleId;

  @override
  ConsumerState<CycleDetailScreen> createState() => _CycleDetailScreenState();
}

class _CycleDetailScreenState extends ConsumerState<CycleDetailScreen> {
  bool _busy = false;
  _PaidFilter _filter = _PaidFilter.all;
  String _query = '';
  // Optimistic per-line paid overrides (lineId → paid) so toggles feel instant.
  final Map<String, bool> _override = {};

  Future<void> _refresh() async {
    ref.invalidate(cycleDetailProvider(widget.cycleId));
    await ref.read(cycleDetailProvider(widget.cycleId).future);
  }

  Future<void> _advance(String action) async {
    final confirmed = await _confirm(action);
    if (confirmed != true) return;
    setState(() => _busy = true);
    try {
      if (action == 'lock') {
        await mpRepo.lockCycle(widget.cycleId);
      } else {
        await mpRepo.payCycle(widget.cycleId);
      }
      ref.invalidate(cycleDetailProvider(widget.cycleId));
      ref.invalidate(nodeCyclesProvider(widget.node.payoutScopeNodeId));
    } catch (e) {
      if (mounted) {
        showDhenuToast(context, '$e', type: DhenuToastType.error);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<bool?> _confirm(String action) {
    final pay = action == 'pay';
    final l = AppLocalizations.of(context);
    return showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(pay ? l.cyclePayTitle : l.cycleLockTitle),
        content: Text(pay ? l.cyclePayContent : l.cycleLockContent),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(l.commonCancel)),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: Text(pay ? l.cyclePayAction : l.cycleLockAction)),
        ],
      ),
    );
  }

  bool _isPaid(MpPayoutLine l) => _override[l.id] ?? l.isPaid;

  /// Toggle one farmer's disbursement flag — optimistic, reverts on error.
  /// Returns where the flag actually ended up, so a caller showing its own copy
  /// of the state (the detail sheet) follows the revert instead of the intent.
  Future<bool> _togglePaid(MpPayoutLine l) async {
    final next = !_isPaid(l);
    setState(() => _override[l.id] = next);
    try {
      await mpRepo.markLinePaid(widget.cycleId, l.id, next);
      ref.invalidate(cycleDetailProvider(widget.cycleId));
      ref.invalidate(nodeCyclesProvider(widget.node.payoutScopeNodeId));
      return next;
    } catch (e) {
      if (!mounted) return !next;
      setState(() => _override[l.id] = !next);
      showDhenuToast(context, '$e', type: DhenuToastType.error);
      return !next;
    }
  }

  Future<void> _markAll(bool paid) async {
    setState(() => _busy = true);
    try {
      await mpRepo.markAllPaid(widget.cycleId, paid);
      _override.clear();
      ref.invalidate(cycleDetailProvider(widget.cycleId));
      ref.invalidate(nodeCyclesProvider(widget.node.payoutScopeNodeId));
    } catch (e) {
      if (mounted) showDhenuToast(context, '$e', type: DhenuToastType.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final cycleAsync = ref.watch(cycleDetailProvider(widget.cycleId));
    final farmersAsync = ref.watch(nodeFarmersProvider(widget.node.id));
    final farmerById = {
      for (final f in farmersAsync.valueOrNull ?? const <MpFarmer>[]) f.id: f,
    };
    // While the keyboard is up (farmer search), drop the bottom action bar so it
    // doesn't sit over the focused search field — this lets the list scroll the
    // field clear above the keypad.
    final keyboardOpen = MediaQuery.of(context).viewInsets.bottom > 0;
    return Scaffold(
      appBar: AppBar(title: Text(l.cycleCycle, style: DhenuText.h2.copyWith(color: t.ink))),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: cycleAsync.when(
          loading: () => const DhenuLoadingList(rows: 4),
          error: (e, _) => DhenuEmptyState(
              icon: DhenuIcons.cloudOff, title: l.cycleCouldNotLoad, subtitle: '$e'),
          data: (c) => c == null
              ? DhenuEmptyState(icon: DhenuIcons.error, title: l.cycleNotFound)
              : _body(t, c, farmerById),
        ),
      ),
      bottomSheet: (cycleAsync.valueOrNull == null || keyboardOpen)
          ? null
          : _actionBar(t, cycleAsync.value!),
    );
  }

  Widget _body(DhenuTokens t, MpPayoutCycle c, Map<String, MpFarmer> farmerById) {
    final l = AppLocalizations.of(context);
    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(
          DhenuSpacing.screen, DhenuSpacing.lg, DhenuSpacing.screen, 120),
      children: [
        Row(children: [
          Text(c.cycleNo, style: DhenuText.title.copyWith(color: t.ink)),
          const Spacer(),
          _statusChip(t, c.status, l),
        ]),
        Text('${prettyDate(c.periodStart)} – ${prettyDate(c.periodEnd)}',
            style: DhenuText.caption.copyWith(color: t.inkSoft)),
        const SizedBox(height: DhenuSpacing.md),
        _progressCard(t, c, l),
        const SizedBox(height: DhenuSpacing.xl),
        // A cycle settles one way or the other: farmer payout lines, or bulk
        // bills per VMCC. Reading only the lines left a wholesale CC's cycle
        // looking empty when it held lakhs.
        if (c.lines.isEmpty)
          _billBreakup(t, l)
        else ...[
          _controls(t, c, l),
          const SizedBox(height: DhenuSpacing.md),
          _lines(t, c, farmerById, l),
        ],
      ],
    );
  }

  /// The cycle's VMCC bills — for a wholesale CC this is the whole account of
  /// where the money went, so it replaces the farmer list rather than adding to it.
  Widget _billBreakup(DhenuTokens t, AppLocalizations l) {
    final async = ref.watch(cycleVmccBillsProvider(widget.cycleId));
    return async.when(
      loading: () => const DhenuLoadingList(rows: 3),
      error: (e, _) => DhenuEmptyState(
          icon: DhenuIcons.cloudOff,
          title: l.cycleCouldNotLoad,
          subtitle: friendlyError(context, e)),
      data: (bills) => bills.isEmpty
          ? DhenuEmptyState(icon: DhenuIcons.users, title: l.cycleNoLines)
          : VmccBillBreakup(bills: bills),
    );
  }

  /// Net payable + a paid/pending disbursement progress bar. Driven by the
  /// per-farmer flags (optimistic overrides included) when the cycle pays
  /// farmers, and by the VMCC bills when it settles centres wholesale.
  Widget _progressCard(DhenuTokens t, MpPayoutCycle c, AppLocalizations l) {
    if (c.lines.isEmpty) return _billProgressCard(t, c, l);
    final net = c.lines.fold<double>(0, (a, ln) => a + ln.netAmount);
    final paidSum = c.lines.where(_isPaid).fold<double>(0, (a, ln) => a + ln.netAmount);
    final pending = (net - paidSum).clamp(0, double.infinity).toDouble();
    final paidCount = c.lines.where(_isPaid).length;
    return DhenuCard(
      elevated: true,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(l.cycleNetPayable, style: DhenuText.caption.copyWith(
            color: t.inkSoft, fontWeight: FontWeight.w700, letterSpacing: 1.1)),
        const SizedBox(height: DhenuSpacing.xs),
        Text(rupees(net), style: DhenuText.number(size: 32, color: t.ink)),
        const SizedBox(height: DhenuSpacing.lg),
        BreakdownBar(height: 10, segments: [
          BreakdownSegment(paidSum, t.gradeA),
          BreakdownSegment(pending, t.gradeB),
        ]),
        const SizedBox(height: DhenuSpacing.sm),
        Row(children: [
          _legendDot(t.gradeA),
          Text(l.cyclePaidLegend(rupees(paidSum), paidCount, c.lines.length),
              style: DhenuText.caption.copyWith(color: t.inkSoft)),
          const Spacer(),
          if (pending > 0) ...[
            _legendDot(t.gradeB),
            Text(l.paymentsAmountPending(rupees(pending)),
                style: DhenuText.caption.copyWith(color: t.inkSoft)),
          ],
        ]),
      ]),
    );
  }

  /// The same card, summed from the cycle's centre bills.
  Widget _billProgressCard(DhenuTokens t, MpPayoutCycle c, AppLocalizations l) {
    final bills = ref.watch(cycleVmccBillsProvider(widget.cycleId)).valueOrNull
        ?? const <MpVmccBill>[];
    final live = bills.where((b) => !b.isReversed);
    final net = live.fold<double>(0, (a, b) => a + b.totalAmount);
    final paidSum =
        live.where((b) => b.isPaid).fold<double>(0, (a, b) => a + b.totalAmount);
    final pending = (net - paidSum).clamp(0, double.infinity).toDouble();
    return DhenuCard(
      elevated: true,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(l.cycleNetPayable, style: DhenuText.caption.copyWith(
            color: t.inkSoft, fontWeight: FontWeight.w700, letterSpacing: 1.1)),
        const SizedBox(height: DhenuSpacing.xs),
        // Falls back to the server's roll-up until the bills land, so the
        // headline never flashes ₹0 on a cycle that has money in it.
        Text(rupees(net > 0 ? net : c.billTotal),
            style: DhenuText.number(size: 32, color: t.ink)),
        const SizedBox(height: DhenuSpacing.lg),
        BreakdownBar(height: 10, segments: [
          BreakdownSegment(paidSum, t.gradeA),
          BreakdownSegment(pending, t.gradeB),
        ]),
        const SizedBox(height: DhenuSpacing.sm),
        Row(children: [
          _legendDot(t.gradeA),
          Text(
              l.cyclePaidLegend(rupees(paidSum),
                  live.where((b) => b.isPaid).length, live.length),
              style: DhenuText.caption.copyWith(color: t.inkSoft)),
          const Spacer(),
          if (pending > 0) ...[
            _legendDot(t.gradeB),
            Text(l.paymentsAmountPending(rupees(pending)),
                style: DhenuText.caption.copyWith(color: t.inkSoft)),
          ],
        ]),
      ]),
    );
  }

  Widget _legendDot(Color c) => Padding(
        padding: const EdgeInsets.only(right: DhenuSpacing.xs),
        child: Container(width: 8, height: 8, decoration: BoxDecoration(color: c, shape: BoxShape.circle)),
      );

  Widget _controls(DhenuTokens t, MpPayoutCycle c, AppLocalizations l) {
    final allPaid = c.lines.isNotEmpty && c.lines.every(_isPaid);
    return Column(children: [
      Row(children: [
        Text(l.paymentsFarmerCount(c.lines.length), style: DhenuText.title.copyWith(color: t.ink)),
        const Spacer(),
        if (c.status != 'reversed')
          TextButton(
            onPressed: _busy ? null : () => _markAll(!allPaid),
            child: Text(allPaid ? l.cycleMarkAllUnpaid : l.cycleMarkAllPaid),
          ),
      ]),
      const SizedBox(height: DhenuSpacing.xs),
      Row(children: [
        for (final f in _PaidFilter.values) ...[
          _filterChip(t, f, l),
          const SizedBox(width: DhenuSpacing.sm),
        ],
      ]),
      const SizedBox(height: DhenuSpacing.sm),
      TextField(
        onChanged: (v) => setState(() => _query = v.trim().toLowerCase()),
        textCapitalization: TextCapitalization.words,
        style: DhenuText.body.copyWith(color: t.ink),
        decoration: InputDecoration(
          hintText: l.historySearchFarmer,
          isDense: true,
          prefixIcon: Icon(DhenuIcons.search, color: t.inkSoft),
          filled: true,
          fillColor: t.inputFill,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(DhenuRadii.input),
            borderSide: BorderSide(color: t.hairline),
          ),
        ),
      ),
    ]);
  }

  Widget _filterChip(DhenuTokens t, _PaidFilter f, AppLocalizations l) {
    final selected = _filter == f;
    final label = switch (f) {
      _PaidFilter.all => l.cycleFilterAll,
      _PaidFilter.unpaid => l.cycleFilterUnpaid,
      _PaidFilter.paid => l.cycleFilterPaid,
    };
    return GestureDetector(
      onTap: () => setState(() => _filter = f),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.md, vertical: DhenuSpacing.xs),
        decoration: BoxDecoration(
          color: selected ? t.brand.withValues(alpha: 0.12) : t.inputFill,
          borderRadius: BorderRadius.circular(DhenuRadii.pill),
          border: Border.all(color: selected ? t.brand : t.hairline),
        ),
        child: Text(label, style: DhenuText.label.copyWith(color: selected ? t.brand : t.inkSoft)),
      ),
    );
  }

  Widget _lines(DhenuTokens t, MpPayoutCycle c, Map<String, MpFarmer> farmerById, AppLocalizations l) {
    final lines = [
      for (final ln in c.lines)
        if (_matchesFilter(ln) && _matchesQuery(ln, farmerById)) ln,
    ];
    if (lines.isEmpty) {
      return DhenuEmptyState(icon: DhenuIcons.filterOff, title: l.cycleNoFarmersMatch);
    }
    return DhenuCard(
      padding: EdgeInsets.zero,
      child: Column(children: [
        for (var i = 0; i < lines.length; i++) ...[
          if (i > 0) Divider(height: 1, color: t.hairline),
          _lineRow(t, c, lines[i], farmerById[lines[i].farmerId], l),
        ],
      ]),
    );
  }

  bool _matchesFilter(MpPayoutLine l) => switch (_filter) {
        _PaidFilter.all => true,
        _PaidFilter.paid => _isPaid(l),
        _PaidFilter.unpaid => !_isPaid(l),
      };

  bool _matchesQuery(MpPayoutLine l, Map<String, MpFarmer> byId) {
    if (_query.isEmpty) return true;
    final f = byId[l.farmerId];
    if (f == null) return false;
    return f.name.toLowerCase().contains(_query) || f.code.toLowerCase().contains(_query);
  }

  /// Tap opens the payment detail (breakdown, statement, mark-paid); the tick
  /// itself stays a one-tap toggle for working down the list at the counter.
  /// The row tap used to be the toggle — an accidental brush marked a farmer
  /// paid with nothing on screen to say what they were owed.
  Widget _lineRow(DhenuTokens t, MpPayoutCycle c, MpPayoutLine ln, MpFarmer? farmer, AppLocalizations l) {
    final paid = _isPaid(ln);
    final hasDed = ln.deductionTotal > 0;
    final toggleable = c.status != 'reversed';
    final display = farmer != null ? farmerName(context, farmer) : l.historyFarmerFallback;
    return SourceRow(
      title: display,
      subtitle: (farmer != null && display != farmer.name) ? farmer.name : null,
      farmer: farmer,
      litres: litres(ln.qtyLitres, unit: true),
      amount: rupees(ln.netAmount),
      amountFirst: true,
      onTap: () => showPayoutLineSheet(
        context,
        cycle: c,
        line: ln,
        farmer: farmer,
        paid: paid,
        onTogglePaid: () => _togglePaid(ln),
      ),
      trailingStatus: Row(mainAxisSize: MainAxisSize.min, children: [
        if (hasDed) ...[
          Text('− ${rupees(ln.deductionTotal)}', style: DhenuText.caption.copyWith(color: t.gradeC)),
          const SizedBox(width: DhenuSpacing.sm),
        ],
        GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: toggleable ? () => _togglePaid(ln) : null,
          child: _paidToggle(t, paid),
        ),
      ]),
    );
  }

  Widget _paidToggle(DhenuTokens t, bool paid) => AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        width: 26,
        height: 26,
        decoration: BoxDecoration(
          color: paid ? t.gradeA : Colors.transparent,
          shape: BoxShape.circle,
          border: Border.all(color: paid ? t.gradeA : t.hairline, width: 2),
        ),
        child: Icon(DhenuIcons.check, size: 16, color: paid ? Colors.white : t.hairline),
      );

  Widget _statusChip(DhenuTokens t, String status, AppLocalizations l) {
    final (label, color) = switch (status) {
      'open' => (l.paymentsCycleStatusOpen, t.gradeB),
      'locked' => (l.paymentsCycleStatusLocked, t.brand),
      'paid' => (l.paymentsCycleStatusPaid, t.gradeA),
      _ => (l.paymentsCycleStatusReversed, t.inkSoft),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.md, vertical: DhenuSpacing.xs),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(DhenuRadii.pill),
      ),
      child: Text(label, style: DhenuText.label.copyWith(color: color)),
    );
  }

  Widget? _actionBar(DhenuTokens t, MpPayoutCycle c) {
    final l = AppLocalizations.of(context);
    final (label, icon, action) = switch (c.status) {
      'open' => (l.cycleLockCycle, DhenuIcons.lock, 'lock'),
      'locked' => (l.cyclePayCycle, DhenuIcons.payments, 'pay'),
      _ => (null, null, null),
    };
    if (action == null) return null;
    return Padding(
      padding: const EdgeInsets.all(DhenuSpacing.screen),
      child: PrimaryAction(
        label: label!,
        icon: icon,
        loading: _busy,
        onPressed: () => _advance(action),
      ),
    );
  }
}
