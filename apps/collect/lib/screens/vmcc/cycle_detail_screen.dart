import 'package:flutter/material.dart';
import '../../theme/dhenu_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../api/mp_repo.dart';
import '../../providers/mp_context_provider.dart';
import '../../providers/mp_payout_providers.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/breakdown_bar.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/dhenu_toast.dart';
import '../../widgets/primary_action.dart';
import '../../widgets/source_row.dart';

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
      ref.invalidate(nodeCyclesProvider(widget.node.id));
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
    return showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(pay ? 'Pay cycle?' : 'Lock cycle?'),
        content: Text(pay
            ? 'This posts payments for every farmer and cannot be undone.'
            : 'Locking freezes totals and posts loan repayments. You can pay after.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(pay ? 'Pay' : 'Lock')),
        ],
      ),
    );
  }

  bool _isPaid(MpPayoutLine l) => _override[l.id] ?? l.isPaid;

  /// Toggle one farmer's disbursement flag — optimistic, reverts on error.
  Future<void> _togglePaid(MpPayoutLine l) async {
    final next = !_isPaid(l);
    setState(() => _override[l.id] = next);
    try {
      await mpRepo.markLinePaid(widget.cycleId, l.id, next);
      ref.invalidate(cycleDetailProvider(widget.cycleId));
      ref.invalidate(nodeCyclesProvider(widget.node.id));
    } catch (e) {
      if (!mounted) return;
      setState(() => _override[l.id] = !next);
      showDhenuToast(context, '$e', type: DhenuToastType.error);
    }
  }

  Future<void> _markAll(bool paid) async {
    setState(() => _busy = true);
    try {
      await mpRepo.markAllPaid(widget.cycleId, paid);
      _override.clear();
      ref.invalidate(cycleDetailProvider(widget.cycleId));
      ref.invalidate(nodeCyclesProvider(widget.node.id));
    } catch (e) {
      if (mounted) showDhenuToast(context, '$e', type: DhenuToastType.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
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
      appBar: AppBar(title: Text('Cycle', style: DhenuText.h2.copyWith(color: t.ink))),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: cycleAsync.when(
          loading: () => const DhenuLoadingList(rows: 4),
          error: (e, _) => DhenuEmptyState(
              icon: DhenuIcons.cloudOff, title: 'Could not load cycle', subtitle: '$e'),
          data: (c) => c == null
              ? const DhenuEmptyState(icon: DhenuIcons.error, title: 'Cycle not found')
              : _body(t, c, farmerById),
        ),
      ),
      bottomSheet: (cycleAsync.valueOrNull == null || keyboardOpen)
          ? null
          : _actionBar(t, cycleAsync.value!),
    );
  }

  Widget _body(DhenuTokens t, MpPayoutCycle c, Map<String, MpFarmer> farmerById) {
    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(
          DhenuSpacing.screen, DhenuSpacing.lg, DhenuSpacing.screen, 120),
      children: [
        Row(children: [
          Text(c.cycleNo, style: DhenuText.title.copyWith(color: t.ink)),
          const Spacer(),
          _statusChip(t, c.status),
        ]),
        Text('${prettyDate(c.periodStart)} – ${prettyDate(c.periodEnd)}',
            style: DhenuText.caption.copyWith(color: t.inkSoft)),
        const SizedBox(height: DhenuSpacing.md),
        _progressCard(t, c),
        const SizedBox(height: DhenuSpacing.xl),
        if (c.lines.isEmpty)
          const DhenuEmptyState(icon: DhenuIcons.users, title: 'No lines in this cycle')
        else ...[
          _controls(t, c),
          const SizedBox(height: DhenuSpacing.md),
          _lines(t, c, farmerById),
        ],
      ],
    );
  }

  /// Net payable + a paid/pending disbursement progress bar driven by the
  /// per-farmer flags (optimistic overrides included).
  Widget _progressCard(DhenuTokens t, MpPayoutCycle c) {
    final net = c.lines.fold<double>(0, (a, l) => a + l.netAmount);
    final paidSum = c.lines.where(_isPaid).fold<double>(0, (a, l) => a + l.netAmount);
    final pending = (net - paidSum).clamp(0, double.infinity).toDouble();
    final paidCount = c.lines.where(_isPaid).length;
    return DhenuCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('NET PAYABLE', style: DhenuText.caption.copyWith(
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
          Text('${rupees(paidSum)} paid · $paidCount/${c.lines.length}',
              style: DhenuText.caption.copyWith(color: t.inkSoft)),
          const Spacer(),
          if (pending > 0) ...[
            _legendDot(t.gradeB),
            Text('${rupees(pending)} pending', style: DhenuText.caption.copyWith(color: t.inkSoft)),
          ],
        ]),
      ]),
    );
  }

  Widget _legendDot(Color c) => Padding(
        padding: const EdgeInsets.only(right: DhenuSpacing.xs),
        child: Container(width: 8, height: 8, decoration: BoxDecoration(color: c, shape: BoxShape.circle)),
      );

  Widget _controls(DhenuTokens t, MpPayoutCycle c) {
    final allPaid = c.lines.isNotEmpty && c.lines.every(_isPaid);
    return Column(children: [
      Row(children: [
        Text('${c.lines.length} farmers', style: DhenuText.title.copyWith(color: t.ink)),
        const Spacer(),
        if (c.status != 'reversed')
          TextButton(
            onPressed: _busy ? null : () => _markAll(!allPaid),
            child: Text(allPaid ? 'Mark all unpaid' : 'Mark all paid'),
          ),
      ]),
      const SizedBox(height: DhenuSpacing.xs),
      Row(children: [
        for (final f in _PaidFilter.values) ...[
          _filterChip(t, f),
          const SizedBox(width: DhenuSpacing.sm),
        ],
      ]),
      const SizedBox(height: DhenuSpacing.sm),
      TextField(
        onChanged: (v) => setState(() => _query = v.trim().toLowerCase()),
        textCapitalization: TextCapitalization.words,
        style: DhenuText.body.copyWith(color: t.ink),
        decoration: InputDecoration(
          hintText: 'Search farmer',
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

  Widget _filterChip(DhenuTokens t, _PaidFilter f) {
    final selected = _filter == f;
    final label = switch (f) {
      _PaidFilter.all => 'All',
      _PaidFilter.unpaid => 'Unpaid',
      _PaidFilter.paid => 'Paid',
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

  Widget _lines(DhenuTokens t, MpPayoutCycle c, Map<String, MpFarmer> farmerById) {
    final lines = [
      for (final l in c.lines)
        if (_matchesFilter(l) && _matchesQuery(l, farmerById)) l,
    ];
    if (lines.isEmpty) {
      return const DhenuEmptyState(icon: DhenuIcons.filterOff, title: 'No farmers match');
    }
    return DhenuCard(
      padding: EdgeInsets.zero,
      child: Column(children: [
        for (var i = 0; i < lines.length; i++) ...[
          if (i > 0) Divider(height: 1, color: t.hairline),
          _lineRow(t, c, lines[i], farmerById[lines[i].farmerId]),
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

  Widget _lineRow(DhenuTokens t, MpPayoutCycle c, MpPayoutLine l, MpFarmer? farmer) {
    final paid = _isPaid(l);
    final hasDed = l.deductionTotal > 0;
    final toggleable = c.status != 'reversed';
    return SourceRow(
      title: farmer?.name ?? 'Farmer',
      leadingInitials: farmer?.initials,
      litres: litres(l.qtyLitres, unit: true),
      amount: rupees(l.netAmount),
      amountFirst: true,
      onTap: toggleable ? () => _togglePaid(l) : null,
      trailingStatus: Row(mainAxisSize: MainAxisSize.min, children: [
        if (hasDed) ...[
          Text('− ${rupees(l.deductionTotal)}', style: DhenuText.caption.copyWith(color: t.gradeC)),
          const SizedBox(width: DhenuSpacing.sm),
        ],
        _paidToggle(t, paid),
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

  Widget _statusChip(DhenuTokens t, String status) {
    final (label, color) = switch (status) {
      'open' => ('Open', t.gradeB),
      'locked' => ('Locked', t.brand),
      'paid' => ('Paid', t.gradeA),
      _ => ('Reversed', t.inkSoft),
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
    final (label, icon, action) = switch (c.status) {
      'open' => ('Lock cycle', DhenuIcons.lock, 'lock'),
      'locked' => ('Pay cycle', DhenuIcons.payments, 'pay'),
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
