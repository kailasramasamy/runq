import 'package:flutter/material.dart';
import '../../api/mp_models.dart';
import '../../theme/dhenu_icons.dart';
import '../../widgets/app_bottom_nav.dart';
import '../profile_tab.dart';
import '../role_shell.dart';
import 'record_collection.dart';
import 'vmcc_dispatch_tab.dart';
import 'vmcc_home.dart';
import 'vmcc_payments_tab.dart';

/// VMCC operator shell — wraps the 5-tab role experience.
/// Home / ➕ Collect / Dispatch / Payments / Profile. Farmers & Reports are
/// reached as quick-links from Home (today-summary lives on Home now).
class VmccShell extends StatelessWidget {
  const VmccShell({super.key, required this.node});
  final MpNode node;

  static const _items = [
    DhenuNavItem(icon: DhenuIcons.home, label: 'Home'),
    DhenuNavItem(icon: DhenuIcons.collect, label: 'Collect'),
    DhenuNavItem(icon: DhenuIcons.dispatch, label: 'Dispatch'),
    DhenuNavItem(icon: DhenuIcons.payments, label: 'Payments'),
    DhenuNavItem(icon: DhenuIcons.profile, label: 'Profile'),
  ];

  @override
  Widget build(BuildContext context) {
    return RoleShell(
      items: _items,
      tabActions: {
        1: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => RecordCollectionScreen(node: node)),
            ),
      },
      pages: [
        VmccHome(node: node),
        const SizedBox.shrink(), // placeholder for tab-action index 1
        VmccDispatchTab(node: node),
        VmccPaymentsTab(node: node),
        ProfileTab(subtitle: node.name),
      ],
    );
  }
}
