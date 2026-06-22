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
import 'farmer_services_stub.dart';

/// Farmer persona shell — 5-tab home (spec §4.3):
/// 🏠 Home · 📊 Collections · 💰 Payments · 🛒 Services · 👤 Profile
class FarmerShell extends ConsumerWidget {
  const FarmerShell({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final items = [
      DhenuNavItem(icon: DhenuIcons.home, label: l.navHome),
      DhenuNavItem(icon: DhenuIcons.collections, label: l.navCollections),
      DhenuNavItem(icon: DhenuIcons.payments, label: l.navPayments),
      DhenuNavItem(icon: DhenuIcons.services, label: l.navServices),
      DhenuNavItem(icon: DhenuIcons.profile, label: l.navProfile),
    ];
    return RoleShell(
      items: items,
      pages: const [
        FarmerHome(),
        FarmerCollectionsTab(),
        FarmerPaymentsTab(),
        FarmerServicesStub(),
        ProfileTab(),
      ],
    );
  }
}
