import 'package:flutter/material.dart';
import '../../api/mp_models.dart';
import '../../l10n/app_localizations.dart';
import '../../theme/dhenu_icons.dart';
import '../../widgets/app_bottom_nav.dart';
import '../profile_tab.dart';
import '../role_shell.dart';
import 'cc_dispatch_tab.dart';
import 'cc_home.dart';
import 'cc_receive_tab.dart';

/// CC operator shell — receive from VMCCs, chill, dispatch onward to the plant.
/// Home / ➕ Receive / Dispatch / Profile. (Payments are handled by the tenant
/// owner on web — the CC operator isn't involved.)
class CcShell extends StatelessWidget {
  const CcShell({super.key, required this.node, this.header});
  final MpNode node;

  /// Optional bar pinned above the tabs — the admin centre-switcher.
  final Widget? header;

  List<DhenuNavItem> _items(AppLocalizations l) => [
        DhenuNavItem(icon: DhenuIcons.home, label: l.navHome),
        DhenuNavItem(icon: DhenuIcons.receive, label: l.navReceive),
        DhenuNavItem(icon: DhenuIcons.dispatch, label: l.navDispatch),
        DhenuNavItem(icon: DhenuIcons.profile, label: l.navProfile),
      ];

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return RoleShell(
      items: _items(l),
      header: header,
      pages: [
        CcHome(node: node),
        CcReceiveTab(node: node),
        CcDispatchTab(node: node),
        ProfileTab(subtitle: node.name),
      ],
    );
  }
}
