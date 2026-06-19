import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
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

  static const _items = [
    DhenuNavItem(icon: DhenuIcons.home, label: 'Home'),
    DhenuNavItem(icon: DhenuIcons.collections, label: 'Collections'),
    DhenuNavItem(icon: DhenuIcons.payments, label: 'Payments'),
    DhenuNavItem(icon: DhenuIcons.services, label: 'Services'),
    DhenuNavItem(icon: DhenuIcons.profile, label: 'Profile'),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return RoleShell(
      items: _items,
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
