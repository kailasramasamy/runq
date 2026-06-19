import 'package:flutter/material.dart';
import '../../api/mp_models.dart';
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
  const CcShell({super.key, required this.node});
  final MpNode node;

  static const _items = [
    DhenuNavItem(icon: DhenuIcons.home, label: 'Home'),
    DhenuNavItem(icon: DhenuIcons.receive, label: 'Receive'),
    DhenuNavItem(icon: DhenuIcons.dispatch, label: 'Dispatch'),
    DhenuNavItem(icon: DhenuIcons.profile, label: 'Profile'),
  ];

  @override
  Widget build(BuildContext context) {
    return RoleShell(
      items: _items,
      pages: [
        CcHome(node: node),
        CcReceiveTab(node: node),
        CcDispatchTab(node: node),
        ProfileTab(subtitle: node.name),
      ],
    );
  }
}
