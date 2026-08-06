import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dhenu/l10n/app_localizations.dart';
import '../../api/mp_models.dart';
import '../../providers/transfer_providers.dart';
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
class VmccShell extends ConsumerWidget {
  const VmccShell({super.key, required this.node, this.header});
  final MpNode node;

  /// Optional bar pinned above the tabs — the admin centre-switcher.
  final Widget? header;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    // Milk poured but never sent onward, however old. Split by what it needs:
    // an unclosed slot is resolved on Record Collection (Collect), a closed one
    // on Dispatch — so each badge points at the screen that clears it.
    final owed = ref.watch(pendingDispatchProvider(node.id)).valueOrNull
        ?? const <MpPendingDispatch>[];
    final toClose = owed.any((s) => !s.closed);
    final toDispatch = owed.any((s) => s.closed);
    final items = [
      DhenuNavItem(icon: DhenuIcons.home, label: l.navHome),
      DhenuNavItem(icon: DhenuIcons.collect, label: l.navCollect, alert: toClose),
      DhenuNavItem(icon: DhenuIcons.dispatch, label: l.navDispatch, alert: toDispatch),
      DhenuNavItem(icon: DhenuIcons.payments, label: l.navPayments),
      DhenuNavItem(icon: DhenuIcons.profile, label: l.navProfile),
    ];
    return RoleShell(
      items: items,
      header: header,
      // A VMCC only dispatches; milk reaches it as farmer pours, not consignments.
      deepLinkTabs: const {'dispatch': 2},
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
