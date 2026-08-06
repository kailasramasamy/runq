import 'package:flutter/widgets.dart';
import '../../l10n/app_localizations.dart';
import '../../theme/dhenu_icons.dart';

/// Which inbound leg a receive-history / QC screen is reporting on, plus the
/// wording that goes with it. A chilling centre receives vmcc→cc cans from its
/// VMCCs; a processing plant receives cc→pp tankers from its CCs. The screens
/// are otherwise identical, so the difference lives here rather than in two
/// forked copies of each screen.
class ReceiveLeg {
  const ReceiveLeg({
    required this.kind,
    required this.sourceType,
    required this.sourceIcon,
    required this.showRates,
    required this.sourceCount,
    required this.rankingSummary,
    required this.historyEmptySubtitle,
    required this.rankingHeader,
    required this.scopeBySource,
    required this.heroFooterAll,
    required this.heroLabelSource,
    required this.heroFooterSource,
    required this.emptySubtitleSource,
    required this.selectTitle,
    required this.selectPlaceholder,
    required this.noSourcesTitle,
    required this.noSourcesSubtitle,
  });

  /// mp_consignments.kind for this leg.
  final String kind;

  /// Node type of the sending side — what `nodesByTypeProvider` is keyed on.
  final String sourceType;

  final IconData sourceIcon;

  /// Whether the history breakup shows an effective ₹/L per leg. Only the
  /// vmcc→cc leg has one: the rate comes off the farmer pours behind that can.
  /// A tanker leaving a CC carries no per-litre rate of its own.
  final bool showRates;

  final String Function(int) sourceCount;
  final String Function(int active, int total, int days) rankingSummary;
  final String Function(String name, int days) heroLabelSource;
  final String historyEmptySubtitle, rankingHeader, scopeBySource;
  final String heroFooterAll, heroFooterSource, emptySubtitleSource;
  final String selectTitle, selectPlaceholder;
  final String noSourcesTitle, noSourcesSubtitle;

  /// VMCC cans arriving at a chilling centre.
  factory ReceiveLeg.vmccToCc(AppLocalizations l) => ReceiveLeg(
        kind: 'vmcc_to_cc',
        sourceType: 'vmcc',
        sourceIcon: DhenuIcons.store,
        showRates: true,
        sourceCount: l.ccHistoryVmccCount,
        rankingSummary: l.ccQcRankingSummary,
        historyEmptySubtitle: l.ccHistoryNoReceiptsSubtitle,
        rankingHeader: 'VMCC',
        scopeBySource: l.ccQcScopeByVmcc,
        heroFooterAll: l.ccQcHeroFooterAll,
        heroLabelSource: l.ccQcHeroLabelVmcc,
        heroFooterSource: l.ccQcHeroFooterVmcc,
        emptySubtitleSource: l.ccQcEmptySubtitleVmcc,
        selectTitle: l.ccQcSelectVmccTitle,
        selectPlaceholder: l.ccQcSelectVmccPlaceholder,
        noSourcesTitle: l.ccNoVmccsLinkedTitle,
        noSourcesSubtitle: l.ccNoVmccsLinkedSubtitle,
      );

  /// CC tankers arriving at a processing plant.
  factory ReceiveLeg.ccToPp(AppLocalizations l) => ReceiveLeg(
        kind: 'cc_to_pp',
        sourceType: 'cc',
        sourceIcon: DhenuIcons.snowflake,
        showRates: false,
        sourceCount: l.ppHistoryCcCount,
        rankingSummary: l.ppQcRankingSummary,
        historyEmptySubtitle: l.ppHistoryNoReceiptsSubtitle,
        rankingHeader: 'CC',
        scopeBySource: l.ppQcScopeByCc,
        heroFooterAll: l.ppQcHeroFooterAll,
        heroLabelSource: l.ppQcHeroLabelCc,
        heroFooterSource: l.ppQcHeroFooterCc,
        emptySubtitleSource: l.ppQcEmptySubtitleCc,
        selectTitle: l.ppQcSelectCcTitle,
        selectPlaceholder: l.ppQcSelectCcPlaceholder,
        noSourcesTitle: l.ppHomeNoCcsTitle,
        noSourcesSubtitle: l.ppHomeNoCcsSubtitle,
      );
}
