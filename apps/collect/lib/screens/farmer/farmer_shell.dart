import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../l10n/app_localizations.dart';
import '../../screens/profile_tab.dart';
import '../../screens/role_shell.dart';
import '../../theme/dhenu_icons.dart';
import '../../widgets/app_bottom_nav.dart';
import 'farmer_collections_tab.dart';
import 'farmer_home.dart';
import 'farmer_payments_tab.dart';

/// Farmer persona shell — 4-tab home:
/// 🏠 Home · 📊 Collections · 💰 Payments · 👤 Profile
///
/// Services was the fifth tab, but it is still a "coming soon" board with no
/// working service behind it — a permanent nav slot for a page that can only be
/// read once, at the cost of squeezing the four real destinations. It now sits
/// as a Home quick link ([FarmerServicesStub] pushed as a route) and returns to
/// the nav when the services themselves do.
class FarmerShell extends ConsumerWidget {
  const FarmerShell({super.key, this.header});

  /// Optional bar pinned above the tabs — the admin "view as farmer" switcher.
  /// Null for a real farmer login.
  final Widget? header;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final items = [
      DhenuNavItem(icon: DhenuIcons.home, label: l.navHome),
      DhenuNavItem(icon: DhenuIcons.collections, label: l.navCollections),
      DhenuNavItem(icon: DhenuIcons.payments, label: l.navPayments),
      DhenuNavItem(icon: DhenuIcons.profile, label: l.navProfile),
    ];
    return RoleShell(
      items: items,
      header: header,
      pages: const [
        FarmerHome(),
        FarmerCollectionsTab(),
        FarmerPaymentsTab(),
        ProfileTab(),
      ],
    );
  }
}
