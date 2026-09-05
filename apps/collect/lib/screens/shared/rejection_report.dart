import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/mp_models.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/transfer_providers.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_states.dart';

/// Rejection rate by source, and by reason.
///
/// This is the figure the whole rejection feature exists to produce. Everything
/// else — recording the refusal instead of erasing it, keeping the reading,
/// naming who pays — is plumbing that makes this table possible. A source whose
/// rate is climbing is the one to visit BEFORE the milk goes bad, and there was
/// previously no way to know that from anything the app stored.
///
/// The denominator is what ARRIVED, accepted plus rejected — not what was kept.
/// Dividing by accepted alone flatters exactly the worst supplier: refuse half
/// of what someone brings and their "rate" improves.
class RejectionReport extends ConsumerWidget {
  const RejectionReport({
    super.key,
    required this.node,
    required this.days,
    required this.rows,
    required this.sources,
  });

  final MpNode node;
  final int days;

  /// Accepted receipts over the same window — the denominator.
  final List<MpConsignment> rows;
  final List<MpNode> sources;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final bySource = ref.watch(
        rejectionStatsProvider((nodeId: node.id, days: days, groupBy: 'node')));
    final byReason = ref.watch(
        rejectionStatsProvider((nodeId: node.id, days: days, groupBy: 'reason')));
    return bySource.when(
      loading: () => ListView(children: const [DhenuLoadingList()]),
      error: (_, _) => ListView(children: [
        const SizedBox(height: 72),
        DhenuEmptyState(icon: DhenuIcons.cloudOff, title: l.ccQcLoadError),
      ]),
      data: (stats) {
        if (stats.isEmpty) {
          return ListView(children: [
            const SizedBox(height: 72),
            DhenuEmptyState(
              icon: DhenuIcons.checkCircle,
              title: l.rejectNoneTitle,
              subtitle: l.rejectNoneSubtitle(days),
            ),
          ]);
        }
        return ListView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: const EdgeInsets.fromLTRB(
              DhenuSpacing.screen, DhenuSpacing.sm, DhenuSpacing.screen, DhenuSpacing.x4),
          children: [
            _sourceCard(t, l, stats),
            const SizedBox(height: DhenuSpacing.lg),
            byReason.maybeWhen(
              data: (r) => r.isEmpty ? const SizedBox.shrink() : _reasonCard(t, l, r),
              orElse: () => const SizedBox.shrink(),
            ),
          ],
        );
      },
    );
  }

  /// Litres accepted from each source in the window — the other half of the rate.
  Map<String, double> get _acceptedBySource {
    final m = <String, double>{};
    for (final c in rows) {
      if (c.isReversed || !c.received) continue;
      m[c.fromNodeId] = (m[c.fromNodeId] ?? 0) + (c.receiptQty ?? 0);
    }
    return m;
  }

  Widget _sourceCard(DhenuTokens t, AppLocalizations l, List<MpRejectionStat> stats) {
    final accepted = _acceptedBySource;
    final names = {for (final n in sources) n.id: n.name};
    final ranked = [...stats]..sort((a, b) => _rate(b, accepted).compareTo(_rate(a, accepted)));
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(l.rejectBySourceTitle, style: DhenuText.title.copyWith(color: t.ink)),
      const SizedBox(height: DhenuSpacing.sm),
      DhenuCard(
        child: Column(children: [
          for (final s in ranked) ...[
            if (s != ranked.first) ...[
              const SizedBox(height: DhenuSpacing.md),
              Divider(height: 1, color: t.hairline),
              const SizedBox(height: DhenuSpacing.md),
            ],
            _sourceRow(t, l, s, names[s.key] ?? l.dispatchHistoryCcFallback, accepted),
          ],
        ]),
      ),
    ]);
  }

  Widget _sourceRow(DhenuTokens t, AppLocalizations l, MpRejectionStat s, String name,
      Map<String, double> accepted) {
    final rate = _rate(s, accepted);
    // Any rejection at all is worth a second look; above 2% is a conversation.
    final color = rate >= 2 ? t.gradeC : (rate > 0 ? t.gradeB : t.gradeA);
    return Row(children: [
      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(name, style: DhenuText.body.copyWith(color: t.ink, fontWeight: FontWeight.w600)),
        const SizedBox(height: 2),
        Text(l.rejectEventsLine(s.events, litres(s.rejectedQty, unit: true)),
            style: DhenuText.caption.copyWith(color: t.inkSoft)),
      ])),
      const SizedBox(width: DhenuSpacing.sm),
      Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
        Text('${rate.toStringAsFixed(1)}%', style: DhenuText.number(size: 16, color: color)),
        if (s.amount > 0) ...[
          const SizedBox(height: 2),
          Text(rupees(s.amount), style: DhenuText.caption.copyWith(color: t.inkSoft)),
        ],
      ]),
    ]);
  }

  Widget _reasonCard(DhenuTokens t, AppLocalizations l, List<MpRejectionStat> stats) {
    final ranked = [...stats]..sort((a, b) => b.rejectedQty.compareTo(a.rejectedQty));
    final total = ranked.fold<double>(0, (s, r) => s + r.rejectedQty);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(l.rejectByReasonTitle, style: DhenuText.title.copyWith(color: t.ink)),
      const SizedBox(height: DhenuSpacing.sm),
      DhenuCard(
        child: Column(children: [
          for (final s in ranked) ...[
            if (s != ranked.first) const SizedBox(height: DhenuSpacing.md),
            Row(children: [
              Expanded(child: Text(rejectionReasonL10n(l, s.key),
                  style: DhenuText.body.copyWith(color: t.ink))),
              Text(litres(s.rejectedQty, unit: true),
                  style: DhenuText.number(size: 15, color: t.ink)),
              const SizedBox(width: DhenuSpacing.sm),
              SizedBox(
                width: 44,
                child: Text(
                  total > 0 ? '${(s.rejectedQty / total * 100).toStringAsFixed(0)}%' : '—',
                  textAlign: TextAlign.end,
                  style: DhenuText.caption.copyWith(color: t.inkSoft),
                ),
              ),
            ]),
          ],
        ]),
      ),
    ]);
  }

  double _rate(MpRejectionStat s, Map<String, double> accepted) {
    final kept = accepted[s.key ?? ''] ?? 0;
    final brought = kept + s.rejectedQty;
    return brought <= 0 ? 0 : (s.rejectedQty / brought) * 100;
  }
}

/// Reason code → the operator's word for it, in their language.
String rejectionReasonL10n(AppLocalizations l, String? code) => switch (code) {
      'sour' => l.rejectReasonSour,
      'temperature' => l.rejectReasonTemperature,
      'adulterated' => l.rejectReasonAdulterated,
      'cob_positive' => l.rejectReasonCob,
      'antibiotic' => l.rejectReasonAntibiotic,
      'foreign_matter' => l.rejectReasonForeign,
      _ => l.rejectReasonOther,
    };
