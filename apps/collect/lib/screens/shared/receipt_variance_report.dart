import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/mp_models.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/mp_payout_providers.dart';
import '../../providers/transfer_providers.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../api/api_client.dart';
import '../../utils/format.dart';
import '../../utils/friendly_error.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/dhenu_toast.dart';
import 'receive_leg.dart';
import 'variance_share.dart';
import 'variance_widgets.dart';

/// Litres that arrived short (or over) of what the sender dispatched, in rupees.
///
/// Loss and gain are shown apart, never only as a net: a plant that nets to zero
/// because one CC over-reads and another leaks is not fine, and the net would
/// hide exactly that. Loads without a milk rate for their day are counted in
/// litres but left out of the rupee figures, and the summary says so.
class ReceiptVarianceReport extends ConsumerStatefulWidget {
  const ReceiptVarianceReport({
    super.key,
    required this.node,
    required this.leg,
  });

  final MpNode node;
  final ReceiveLeg leg;

  @override
  ConsumerState<ReceiptVarianceReport> createState() =>
      _ReceiptVarianceReportState();
}

class _ReceiptVarianceReportState extends ConsumerState<ReceiptVarianceReport> {
  int _period = 0;
  bool _sharing = false;

  String get _stage => widget.leg.kind == 'cc_to_pp' ? 'pp' : 'cc';

  /// Cycle periods, newest first; the last 30 days when the cycle config can't
  /// be read, so the screen still works without it. Null while it loads, so the
  /// report isn't fetched for a stand-in window and then again for the cycle.
  List<MpCyclePeriod>? _periods() {
    final cycles = ref.watch(recentCyclePeriodsProvider);
    if (cycles.isLoading) return null;
    final periods = cycles.asData?.value;
    if (periods != null && periods.isNotEmpty) return periods;
    return [MpCyclePeriod(isoDaysAgo(29), todayIso(), '30d')];
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final periods = _periods();
    if (periods == null) return ListView(children: const [DhenuLoadingList()]);
    final p = periods[_period.clamp(0, periods.length - 1)];
    final args = (
      nodeId: widget.node.id,
      stage: _stage,
      from: p.start,
      to: p.end,
    );
    final report = ref.watch(receiptVarianceProvider(args));
    return Column(
      children: [
        if (periods.length > 1) _periodChips(periods),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () async => ref.invalidate(receiptVarianceProvider(args)),
            child: report.when(
              loading: () => ListView(children: const [DhenuLoadingList()]),
              error: (_, _) => ListView(
                children: [
                  const SizedBox(height: 72),
                  DhenuEmptyState(
                    icon: DhenuIcons.cloudOff,
                    title: l.varianceLoadError,
                  ),
                ],
              ),
              data: (r) => _body(l, r, p),
            ),
          ),
        ),
      ],
    );
  }

  /// The PDF is rendered on the server, which takes a few seconds — the icon
  /// turns into a spinner so a second tap doesn't queue a second document.
  Future<void> _share(MpCyclePeriod p, MpReceiptVarianceReport r) async {
    final l = AppLocalizations.of(context);
    setState(() => _sharing = true);
    try {
      await shareVariance(l, node: widget.node, stage: _stage, period: p, report: r);
    } on ApiException catch (e) {
      if (mounted) {
        showDhenuToast(context, friendlyError(context, e), type: DhenuToastType.error);
      }
    } finally {
      if (mounted) setState(() => _sharing = false);
    }
  }

  Widget _periodChips(List<MpCyclePeriod> periods) => SizedBox(
    height: 52,
    child: ListView.separated(
      scrollDirection: Axis.horizontal,
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.symmetric(
        horizontal: DhenuSpacing.screen,
        vertical: DhenuSpacing.sm,
      ),
      itemCount: periods.length,
      separatorBuilder: (_, _) => const SizedBox(width: DhenuSpacing.sm),
      itemBuilder: (_, i) => ChoiceChip(
        label: Text(periods[i].label, style: DhenuText.caption),
        selected: i == _period,
        onSelected: (_) => setState(() => _period = i),
      ),
    ),
  );

  /// Only loads that moved are listed: a load that measured exactly what was
  /// dispatched has nothing to say here.
  Widget _body(
    AppLocalizations l,
    MpReceiptVarianceReport r,
    MpCyclePeriod p,
  ) {
    final t = DT(context);
    final moved = [
      for (final line in r.lines)
        if (line.varianceQty != 0) line,
    ];
    if (moved.isEmpty) {
      return ListView(
        children: [
          const SizedBox(height: 72),
          DhenuEmptyState(
            icon: DhenuIcons.checkCircle,
            title: l.varianceNoneTitle,
            subtitle: l.varianceNoneSubtitle,
          ),
        ],
      );
    }
    final days = <String, List<MpReceiptVarianceLine>>{};
    for (final line in moved) {
      days.putIfAbsent(line.date, () => []).add(line);
    }
    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(
        DhenuSpacing.screen,
        DhenuSpacing.sm,
        DhenuSpacing.screen,
        DhenuSpacing.x4,
      ),
      children: [
        _summary(t, l, r, p, moved.length),
        for (final d in days.entries) ...[
          const SizedBox(height: DhenuSpacing.lg),
          Text(shortDate(d.key), style: DhenuText.title.copyWith(color: t.ink)),
          const SizedBox(height: DhenuSpacing.sm),
          VarianceLoadList(lines: d.value),
        ],
      ],
    );
  }

  Widget _summary(
    DhenuTokens t,
    AppLocalizations l,
    MpReceiptVarianceReport r,
    MpCyclePeriod p,
    int movedLoads,
  ) {
    final s = r.totals;
    // A zero rupee net can still carry litres (all unpriced), so fall back to them.
    final loss = s.netValue != 0 ? s.netValue < 0 : s.netQty < 0;
    final color = loss ? t.gradeC : t.gradeA;
    return DhenuCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  (loss ? l.varianceNetLoss : l.varianceNetGain).toUpperCase(),
                  style: DhenuText.label.copyWith(color: t.inkSoft),
                ),
              ),
              IconButton(
                icon: _sharing
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Icon(DhenuIcons.share, size: 18, color: t.brand),
                tooltip: l.varianceShare,
                visualDensity: VisualDensity.compact,
                constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
                padding: EdgeInsets.zero,
                onPressed: _sharing ? null : () => _share(p, r),
              ),
            ],
          ),
          const SizedBox(height: DhenuSpacing.xs),
          Text(
            rupees(s.netValue.abs()),
            style: DhenuText.number(size: 28, color: color),
          ),
          const SizedBox(height: DhenuSpacing.md),
          Text(
            l.varianceShortRow(litres(s.shortQty, unit: true), rupees(s.shortValue)),
            style: DhenuText.body.copyWith(color: t.gradeC, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: DhenuSpacing.xs),
          Text(
            l.varianceGainedRow(litres(s.gainQty, unit: true), rupees(s.gainValue)),
            style: DhenuText.body.copyWith(color: t.gradeA, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: DhenuSpacing.md),
          Text(
            l.varianceFlaggedCaption(s.flaggedLoads, movedLoads),
            style: DhenuText.caption.copyWith(color: t.inkSoft),
          ),
          if (s.unpricedQty > 0) ...[
            const SizedBox(height: DhenuSpacing.xs),
            Text(
              l.varianceUnpricedCaption(litres(s.unpricedQty, unit: true)),
              style: DhenuText.caption.copyWith(color: t.inkSoft),
            ),
          ],
        ],
      ),
    );
  }
}
