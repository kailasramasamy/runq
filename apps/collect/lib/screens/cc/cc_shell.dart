import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/transfer_providers.dart';
import '../../theme/dhenu_icons.dart';
import '../../widgets/app_bottom_nav.dart';
import '../role_shell.dart';
import 'cc_dispatch_tab.dart';
import 'cc_home.dart';
import 'cc_payments_tab.dart';
import 'cc_receive_tab.dart';

/// CC operator shell — receive from VMCCs, chill, dispatch onward to the plant.
/// Home / ➕ Receive / Dispatch / Payments. Payments lives here, not
/// only on web: cycles are CC-scoped, so this node owns the ones its VMCCs are
/// settled from, and a CC manager is scoped to bill them.
class CcShell extends ConsumerWidget {
  const CcShell({super.key, required this.node, this.header});
  final MpNode node;

  /// Optional bar pinned above the tabs — the admin centre-switcher.
  final Widget? header;

  List<DhenuNavItem> _items(AppLocalizations l, bool owed) => [
        DhenuNavItem(icon: DhenuIcons.home, label: l.navHome),
        DhenuNavItem(icon: DhenuIcons.receive, label: l.navReceive),
        DhenuNavItem(icon: DhenuIcons.dispatch, label: l.navDispatch, alert: owed),
        DhenuNavItem(icon: DhenuIcons.payments, label: l.navPayments),
      ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    // Milk received but never sent onward, however old — the badge follows the
    // operator across every tab, which is the point: they live on Receive.
    // Closes and dispatches share one badge here because a CC does both on the
    // dispatch screen; only a VMCC has to split them across two tabs.
    final owed = ref.watch(pendingDispatchProvider(node.id)).valueOrNull?.isNotEmpty ?? false;
    return RoleShell(
      items: _items(l, owed),
      header: header,
      // A CC both receives from VMCCs and dispatches onward.
      deepLinkTabs: const {'receive': 1, 'dispatch': 2},
      pages: [
        CcHome(node: node),
        CcReceiveTab(node: node),
        CcDispatchTab(node: node),
        CcPaymentsTab(node: node),
      ],
    );
  }
}
