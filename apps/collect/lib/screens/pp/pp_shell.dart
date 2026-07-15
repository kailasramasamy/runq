import 'package:flutter/material.dart';
import '../../api/mp_models.dart';
import '../../l10n/app_localizations.dart';
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

  List<DhenuNavItem> _items(AppLocalizations l) => [
        DhenuNavItem(icon: DhenuIcons.home, label: l.navHome),
        DhenuNavItem(icon: DhenuIcons.receive, label: l.navReceive),
        DhenuNavItem(icon: DhenuIcons.tankers, label: l.navTankers),
        DhenuNavItem(icon: DhenuIcons.profile, label: l.navProfile),
      ];

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return RoleShell(
      items: _items(l),
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
