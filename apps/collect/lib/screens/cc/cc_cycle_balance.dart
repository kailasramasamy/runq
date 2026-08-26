import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../api/mp_running_models.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/mp_payout_providers.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../utils/friendly_error.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/running_cycle_card.dart';
import '../../widgets/source_row.dart';

/// What each VMCC under this CC is owed for the window still being collected
/// into — the number a manager needs before generating bills, rather than after.
///
/// A VMCC's total is its farmers' net (milk less advances and goods sold to
/// them) plus the operator comp that rides on the same bill. Centres with no
/// farmers are bought in bulk, so their milk comes from the CC's own receipts.
class CcCycleBalance extends ConsumerWidget {
  const CcCycleBalance({super.key, required this.node});

  final MpNode node;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final async = ref.watch(runningBalanceProvider(node.id));
    return Scaffold(
      backgroundColor: t.surface,
      appBar: AppBar(
        title: Text(l.ccCycleBalanceTitle,
            style: DhenuText.title
                .copyWith(fontWeight: FontWeight.w800, color: t.ink)),
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(runningBalanceProvider(node.id));
          await ref.read(runningBalanceProvider(node.id).future);
        },
        child: async.when(
          loading: () => const DhenuLoadingList(rows: 5),
          error: (e, _) => ListView(children: [
            const SizedBox(height: DhenuSpacing.x4),
            DhenuEmptyState(
              icon: DhenuIcons.cloudOff,
              title: l.runningCycleLoadError,
              subtitle: friendlyError(context, e),
            ),
          ]),
          data: (b) => _body(t, l, b),
        ),
      ),
    );
  }

  Widget _body(DhenuTokens t, AppLocalizations l, MpRunningBalance b) {
    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(DhenuSpacing.screen, DhenuSpacing.lg,
          DhenuSpacing.screen, DhenuSpacing.x4),
      children: [
        RunningCycleCard(
          balance: b,
          subtitle: b.vmccs.isEmpty ? null : l.runningCycleVmccCount(b.vmccs.length),
        ),
        const SizedBox(height: DhenuSpacing.lg),
        if (b.hasWindow && b.vmccs.isEmpty)
          DhenuEmptyState(
            icon: DhenuIcons.store,
            title: l.ccCycleBalanceEmpty,
          )
        else
          for (final v in b.vmccs) _vmccRow(t, l, v),
      ],
    );
  }

  Widget _vmccRow(DhenuTokens t, AppLocalizations l, MpRunningVmcc v) => Column(
        children: [
          SourceRow(
            title: v.vmccName,
            leadingInitials:
                v.vmccName.isNotEmpty ? v.vmccName[0].toUpperCase() : 'V',
            // The two halves of the bill, spelled out — a manager querying a
            // total asks which half moved.
            subtitle: [
              l.ccCycleBalanceMilk(rupees(v.milkCost)),
              if (v.operatorComp > 0) l.ccCycleBalanceComp(rupees(v.operatorComp)),
            ].join(' · '),
            litres: litres(v.qtyLitres, unit: true),
            amount: rupees(v.total),
          ),
          Divider(height: 1, color: t.hairline),
        ],
      );
}
