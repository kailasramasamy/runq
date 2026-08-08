import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../l10n/app_localizations.dart';
import '../../theme/dhenu_icons.dart';
import '../../widgets/app_bottom_nav.dart';
import '../profile_tab.dart';
import '../../providers/transfer_providers.dart';
import '../role_shell.dart';
import 'pp_home.dart';
import 'pp_receive_tab.dart';
import 'pp_tankers_tab.dart';

/// PP operator shell — Home / ➕ Receive / Tankers / Profile.
class PpShell extends ConsumerWidget {
  const PpShell({super.key, required this.node, this.header});
  final MpNode node;

  /// Optional bar pinned above the tabs — the admin centre-switcher.
  final Widget? header;

  List<DhenuNavItem> _items(AppLocalizations l, bool waiting) => [
        DhenuNavItem(icon: DhenuIcons.home, label: l.navHome),
        DhenuNavItem(icon: DhenuIcons.receive, label: l.navReceive, alert: waiting),
        DhenuNavItem(icon: DhenuIcons.tankers, label: l.navTankers),
        DhenuNavItem(icon: DhenuIcons.profile, label: l.navProfile),
      ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    // Milk on the road and not yet taken in, however old. A PP's backlog is
    // inbound rather than outbound, so its badge watches pending receipts the
    // way a CC's watches pending dispatches.
    final waiting =
        ref.watch(nodePendingInboundProvider(node.id)).valueOrNull?.isNotEmpty ?? false;
    return RoleShell(
      items: _items(l, waiting),
      header: header,
      // A PP is the end of the line — it receives, it never dispatches onward.
      deepLinkTabs: const {'receive': 1},
      pages: [
        PpHome(node: node),
        PpReceiveTab(node: node),
        PpTankersTab(node: node),
        ProfileTab(subtitle: node.name),
      ],
    );
  }
}
