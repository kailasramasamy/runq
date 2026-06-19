import 'package:flutter/material.dart';
import '../../theme/dhenu_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../providers/mp_context_provider.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/hero_number_card.dart';

/// VMCC Reports tab — today's collection summary in a glanceable layout.
class VmccReportsTab extends ConsumerWidget {
  const VmccReportsTab({super.key, required this.node});
  final MpNode node;

  Future<void> _refresh(WidgetRef ref) async {
    ref.invalidate(nodeTodaySummaryProvider(node.id));
    await ref.read(nodeTodaySummaryProvider(node.id).future);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    final summaryAsync = ref.watch(nodeTodaySummaryProvider(node.id));
    return RefreshIndicator(
      onRefresh: () => _refresh(ref),
      child: ListView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.fromLTRB(
            DhenuSpacing.screen, DhenuSpacing.lg, DhenuSpacing.screen, DhenuSpacing.x4),
        children: [
          Text('Today\'s Collection',
              style: DhenuText.h2.copyWith(color: t.ink)),
          const SizedBox(height: DhenuSpacing.md),
          summaryAsync.when(
            loading: () => const DhenuLoadingList(rows: 3),
            error: (e, _) => DhenuEmptyState(
              icon: DhenuIcons.cloudOff,
              title: 'Could not load summary',
              subtitle: '$e',
            ),
            data: (s) => s == null
                ? const DhenuEmptyState(
                    icon: DhenuIcons.drop,
                    title: 'No collection today',
                  )
                : _summaryBody(t, s),
          ),
        ],
      ),
    );
  }

  Widget _summaryBody(DhenuTokens t, MpCollectionSummary s) {
    return Column(children: [
      HeroNumberCard(
        label: 'Total collected',
        primaryValue: litres(s.totalQty, unit: true),
        footer: Text(
          '${s.farmerCount} farmers · ${s.pourCount} pours',
          style: DhenuText.body.copyWith(color: t.inkSoft),
        ),
      ),
      const SizedBox(height: DhenuSpacing.md),
      _statsGrid(t, s),
    ]);
  }

  Widget _statsGrid(DhenuTokens t, MpCollectionSummary s) {
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisSpacing: DhenuSpacing.md,
      mainAxisSpacing: DhenuSpacing.md,
      childAspectRatio: 1.6,
      children: [
        _statCard(t, '☀️ AM', litres(s.amQty, unit: true), t.am),
        _statCard(t, '🌙 PM', litres(s.pmQty, unit: true), t.pm),
        _statCard(t, 'Avg FAT', '${oneDp(s.avgFat)} %', t.brand),
        _statCard(t, 'Avg SNF', '${oneDp(s.avgSnf)} %', t.brand),
        _statCard(t, 'Farmers', '${s.farmerCount}', t.ink),
        _statCard(t, 'Gross', rupees(s.grossAmount), t.gradeA),
      ],
    );
  }

  Widget _statCard(DhenuTokens t, String label, String value, Color valueColor) {
    return DhenuCard(
      padding: const EdgeInsets.all(DhenuSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(label,
              style: DhenuText.caption
                  .copyWith(color: t.inkSoft, letterSpacing: 0.8)),
          const SizedBox(height: DhenuSpacing.xs),
          Text(value,
              style: DhenuText.number(size: 18, color: valueColor),
              maxLines: 1,
              overflow: TextOverflow.ellipsis),
        ],
      ),
    );
  }
}
