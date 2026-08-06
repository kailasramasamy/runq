import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/mp_context_provider.dart';
import '../../providers/transfer_providers.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/node_picker.dart';
import '../../utils/friendly_error.dart';
import 'qc_report_view.dart';
import 'qc_source_ranking.dart';
import 'receive_leg.dart';

enum _Scope { all, source, ranking }

/// Inbound QC report — three scopes over the same windowed receipts: all source
/// nodes pooled, one selected source, or every source ranked side by side. The
/// 7/14/30-day range applies to all three. Serves both legs via [ReceiveLeg]:
/// VMCCs feeding a chilling centre, CCs feeding a plant.
class NodeQcReport extends ConsumerStatefulWidget {
  const NodeQcReport({super.key, required this.node, required this.leg});
  final MpNode node;
  final ReceiveLeg leg;

  @override
  ConsumerState<NodeQcReport> createState() => _NodeQcReportState();
}

class _NodeQcReportState extends ConsumerState<NodeQcReport> {
  int _days = 7;
  _Scope _scope = _Scope.all;
  String? _sourceId;

  ReceiveLeg get leg => widget.leg;

  /// The sources to offer: nodes parented to this one, plus any node that
  /// actually dispatched here in the window. The parent link is how a CC's
  /// VMCCs are modelled, but it isn't guaranteed upstream of a plant — a CC that
  /// shipped a tanker here belongs in the report whether or not it is parented
  /// to this plant. Sources with no receipts still appear (ranked last).
  List<MpNode> _sources(List<MpNode> all, List<MpConsignment> rows) {
    final senders = rows.map((c) => c.fromNodeId).toSet();
    return all
        .where((n) => senders.contains(n.id) || (n.parentNodeId == widget.node.id && n.isActive))
        .toList()
      ..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
  }

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final rowsAsync = ref.watch(
        nodeReceivedRangeProvider((nodeId: widget.node.id, kind: leg.kind, days: _days)));
    final allSources = ref.watch(nodesByTypeProvider(leg.sourceType)).asData?.value ?? const [];
    final sources = _sources(allSources, rowsAsync.asData?.value ?? const []);
    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(
            DhenuSpacing.screen, DhenuSpacing.md, DhenuSpacing.screen, DhenuSpacing.sm),
        child: Column(children: [
          _scopeBar(t, l),
          const SizedBox(height: DhenuSpacing.sm),
          _rangeSelector(t, l),
          if (_scope == _Scope.source) ...[
            const SizedBox(height: DhenuSpacing.sm),
            _sourceField(t, sources),
          ],
        ]),
      ),
      Expanded(
        child: RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(nodeReceivedRangeProvider(
                (nodeId: widget.node.id, kind: leg.kind, days: _days)));
            ref.invalidate(nodesByTypeProvider(leg.sourceType));
          },
          child: rowsAsync.when(
            // Scrollable branches so the RefreshIndicator works and a short box
            // never overflows the non-scrolling skeleton/empty.
            loading: () => ListView(children: const [DhenuLoadingList()]),
            error: (e, _) => ListView(children: [
              const SizedBox(height: 72),
              DhenuEmptyState(
                  icon: DhenuIcons.cloudOff, title: l.ccQcLoadError, subtitle: friendlyError(context, e)),
            ]),
            data: (rows) {
              final bands = ref.watch(qualityBandsProvider(widget.node.id)).valueOrNull ?? QualityBands.empty;
              return _content(l, rows, sources, bands, widget.node.effectiveMilkType);
            },
          ),
        ),
      ),
    ]);
  }

  Widget _content(AppLocalizations l, List<MpConsignment> rows, List<MpNode> sources,
      QualityBands bands, MilkType milkType) {
    switch (_scope) {
      case _Scope.all:
        return QcReportView(
          samples: _samples(rows),
          days: _days,
          heroLabel: l.ccQcHeroLabelAll(_days),
          heroFooter: leg.heroFooterAll,
          bands: bands,
          milkType: milkType,
        );
      case _Scope.ranking:
        return QcSourceRanking(
            rows: rows, sources: sources, leg: leg, days: _days, bands: bands, milkType: milkType);
      case _Scope.source:
        final id = _sourceId ?? (sources.isNotEmpty ? sources.first.id : null);
        if (id == null) {
          return DhenuEmptyState(
              icon: leg.sourceIcon,
              title: leg.noSourcesTitle,
              subtitle: leg.noSourcesSubtitle);
        }
        final v = sources.firstWhere((n) => n.id == id, orElse: () => sources.first);
        final filtered = rows.where((c) => c.fromNodeId == id).toList();
        return QcReportView(
          samples: _samples(filtered),
          days: _days,
          heroLabel: leg.heroLabelSource(v.name.toUpperCase(), _days),
          heroFooter: leg.heroFooterSource,
          emptySubtitle: leg.emptySubtitleSource,
          bands: bands,
          milkType: milkType,
        );
    }
  }

  /// Map received consignments into QC samples for the shared report view.
  List<QcSample> _samples(List<MpConsignment> rows) => [
        for (final c in rows)
          (date: c.collectionDate, qty: c.receiptQty ?? 0,
           fat: c.receiptFat, snf: c.receiptSnf, water: c.receiptWater),
      ];

  Widget _scopeBar(DhenuTokens t, AppLocalizations l) => Container(
        decoration: BoxDecoration(
            color: t.hairline, borderRadius: BorderRadius.circular(DhenuRadii.pill)),
        padding: const EdgeInsets.all(3),
        child: Row(children: [
          _scopeSeg(t, _Scope.all, l.ccQcScopeAll),
          _scopeSeg(t, _Scope.source, leg.scopeBySource),
          _scopeSeg(t, _Scope.ranking, l.ccQcScopeRanking),
        ]),
      );

  Widget _scopeSeg(DhenuTokens t, _Scope s, String label) {
    final on = _scope == s;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _scope = s),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          height: 38,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: on ? t.surface : Colors.transparent,
            borderRadius: BorderRadius.circular(DhenuRadii.pill),
          ),
          child: Text(label,
              style: DhenuText.label.copyWith(
                  color: on ? t.brand : t.inkSoft,
                  fontWeight: on ? FontWeight.w700 : FontWeight.w600)),
        ),
      ),
    );
  }

  Widget _sourceField(DhenuTokens t, List<MpNode> sources) {
    final id = _sourceId ?? (sources.isNotEmpty ? sources.first.id : null);
    MpNode? sel;
    for (final n in sources) {
      if (n.id == id) { sel = n; break; }
    }
    return DhenuCard(
      padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md),
      onTap: sources.isEmpty
          ? null
          : () async {
              final picked = await showNodePicker(context,
                  nodes: sources, selectedId: id, title: leg.selectTitle);
              if (picked != null) setState(() => _sourceId = picked.id);
            },
      child: Row(children: [
        Icon(leg.sourceIcon, size: 18, color: t.brand),
        const SizedBox(width: DhenuSpacing.sm),
        Expanded(
            child: Text(sel?.name ?? leg.selectPlaceholder,
                style: DhenuText.body.copyWith(
                    color: sel == null ? t.inkSoft : t.ink, fontWeight: FontWeight.w600))),
        Icon(DhenuIcons.chevronDown, size: 18, color: t.inkSoft),
      ]),
    );
  }

  Widget _rangeSelector(DhenuTokens t, AppLocalizations l) => Row(children: [
        for (final d in const [7, 14, 30]) ...[
          Expanded(child: _rangeChip(t, l, d)),
          if (d != 30) const SizedBox(width: DhenuSpacing.sm),
        ],
      ]);

  Widget _rangeChip(DhenuTokens t, AppLocalizations l, int d) {
    final on = _days == d;
    return GestureDetector(
      onTap: () => setState(() => _days = d),
      child: Container(
        height: 38,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: on ? t.brand : t.inputFill,
          borderRadius: BorderRadius.circular(DhenuRadii.input),
          border: Border.all(color: on ? t.brand : t.hairline),
        ),
        child: Text(l.ccQcRangeDays(d),
            style: DhenuText.label.copyWith(color: on ? Colors.white : t.inkSoft)),
      ),
    );
  }
}
