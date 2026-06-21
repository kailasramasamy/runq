import 'package:flutter/material.dart';
import '../../api/mp_models.dart';
import '../../theme/dhenu_icons.dart';
import '../../widgets/app_bottom_nav.dart';
import '../profile_tab.dart';
import '../role_shell.dart';
import 'pp_home.dart';
import 'pp_receive_tab.dart';
import 'pp_tankers_tab.dart';

/// PP operator shell — Home / ➕ Receive / Tankers / Profile.
class PpShell extends StatelessWidget {
  const PpShell({super.key, required this.node, this.header});
  final MpNode node;

  /// Optional bar pinned above the tabs — the admin centre-switcher.
  final Widget? header;

  static const _items = [
    DhenuNavItem(icon: DhenuIcons.home, label: 'Home'),
    DhenuNavItem(icon: DhenuIcons.receive, label: 'Receive'),
    DhenuNavItem(icon: DhenuIcons.tankers, label: 'Tankers'),
    DhenuNavItem(icon: DhenuIcons.profile, label: 'Profile'),
  ];

  @override
  Widget build(BuildContext context) {
    return RoleShell(
      items: _items,
      header: header,
      pages: [
        PpHome(node: node),
        PpReceiveTab(node: node),
        PpTankersTab(node: node),
        ProfileTab(subtitle: node.name),
      ],
    );
  }
}
