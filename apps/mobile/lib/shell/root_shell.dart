import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/app_module_provider.dart';
import '../theme/runq_tokens.dart';
import '../theme/runq_theme.dart';
import 'fab_sheet.dart';

const _inventoryAmber = Color(0xFFD97706);

class _Tab {
  final String path, label;
  final IconData icon, activeIcon;
  const _Tab(this.path, this.label, this.icon, this.activeIcon);
}

// Two parallel tab sets, one per module. The shell swaps them based on the
// active module — staying in HR doesn't bleed Finance tabs into the nav,
// and vice versa. The centre FAB also picks its action list from the same
// module signal.
const _financeTabs = <_Tab>[
  _Tab('/home', 'Home', Icons.home_outlined, Icons.home_rounded),
  _Tab('/purchases', 'Purchases', Icons.shopping_bag_outlined, Icons.shopping_bag_rounded),
  _Tab('/sales', 'Sales', Icons.trending_up_outlined, Icons.trending_up_rounded),
  _Tab('/money', 'Money', Icons.account_balance_wallet_outlined, Icons.account_balance_wallet_rounded),
];

// People is no longer in the bottom nav — reachable from Home via the
// search pill (org-wide directory) and the "My team" tile (manager view).
// Swapped for More, which surfaces all the self-service flows (regularize,
// tax declaration, loans, onboarding, letters, performance, helpdesk) plus
// HR setup for admins.
const _hrTabs = <_Tab>[
  _Tab('/hr/home', 'Home', Icons.home_outlined, Icons.home_rounded),
  _Tab('/hr/time', 'Time', Icons.access_time_outlined, Icons.access_time_filled_rounded),
  _Tab('/hr/pay', 'Pay', Icons.payments_outlined, Icons.payments_rounded),
  _Tab('/hr/more', 'More', Icons.apps_outlined, Icons.apps_rounded),
];

// Inventory tabs cover the godown-floor day at a glance: a dashboard
// (Home), the live stock list (Stock), every transaction type behind one
// hub (Moves), and reorder/low-stock alerts (Alerts). Receive + Dispatch
// + Transfer + Adjustment + Stock Take all live under Moves now so the
// nav doesn't have to grow to 8 tabs as the module fills out.
const _inventoryTabs = <_Tab>[
  _Tab('/inventory', 'Home', Icons.home_outlined, Icons.home_rounded),
  _Tab('/inventory/on-hand', 'Stock', Icons.inventory_2_outlined, Icons.inventory_2_rounded),
  _Tab('/inventory/moves', 'Moves', Icons.swap_horiz_outlined, Icons.swap_horiz_rounded),
  _Tab('/inventory/alerts', 'Alerts', Icons.notifications_none_rounded, Icons.notifications_rounded),
];

class RootShell extends ConsumerStatefulWidget {
  final GoRouterState state;
  final Widget child;
  const RootShell({super.key, required this.state, required this.child});

  @override
  ConsumerState<RootShell> createState() => _RootShellState();
}

class _RootShellState extends ConsumerState<RootShell> with SingleTickerProviderStateMixin {
  late final AnimationController _fabCtrl;

  @override
  void initState() {
    super.initState();
    _fabCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 220));
  }

  @override
  void dispose() {
    _fabCtrl.dispose();
    super.dispose();
  }

  int _activeIndex(List<_Tab> tabs, String location) {
    // Pick the *longest* matching prefix, not the first. Inventory's Home
    // path is `/inventory`, which is a prefix of every sibling tab — a plain
    // first-match would always highlight Home. Also require a `/` boundary
    // so `/inventory` doesn't bleed into a hypothetical `/inventoryX`.
    var best = -1;
    var bestLen = -1;
    for (var i = 0; i < tabs.length; i++) {
      final p = tabs[i].path;
      final matches = location == p || location.startsWith('$p/');
      if (matches && p.length > bestLen) {
        best = i;
        bestLen = p.length;
      }
    }
    return best == -1 ? 0 : best;
  }

  void _toggleSheet() {
    if (_fabCtrl.isCompleted) {
      _fabCtrl.reverse();
    } else {
      _fabCtrl.forward();
    }
  }

  @override
  Widget build(BuildContext context) {
    final loc = widget.state.uri.toString();
    // Derive module from the *current route* — not from the provider —
    // so the bottom nav always matches what the user is looking at. The
    // provider is just a persistence helper for "last-used module"; if
    // the splash lands on /home but prefs still say HR (e.g. an admin
    // who switched yesterday), reading prefs would show HR tabs over a
    // Finance screen. Reading the route avoids that drift.
    final module = loc.startsWith('/inventory')
        ? AppModule.inventory
        : loc.startsWith('/hr')
            ? AppModule.hr
            : AppModule.finance;
    // Mirror the active route into the persisted module so the next cold
    // start lands the user in the same module they left. Done as a side
    // effect after build to avoid mutating provider state mid-build.
    final stored = ref.read(appModuleProvider);
    if (stored != module) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        ref.read(appModuleProvider.notifier).setModule(module);
      });
    }
    final tabs = switch (module) {
      AppModule.hr => _hrTabs,
      AppModule.inventory => _inventoryTabs,
      AppModule.finance => _financeTabs,
    };
    final active = _activeIndex(tabs, loc);
    final actions = switch (module) {
      AppModule.hr => hrFabActions(),
      AppModule.inventory => inventoryFabActions(),
      AppModule.finance => financeFabActions(),
    };

    final bg = Theme.of(context).scaffoldBackgroundColor;
    final sysBottom = MediaQuery.of(context).padding.bottom;
    final navInset = sysBottom > 0 ? (sysBottom * 0.6).clamp(14.0, 22.0) : 12.0;
    final fadeHeight = 64 /* nav pill */ + navInset + 24;
    return Scaffold(
      extendBody: true,
      body: Stack(
        children: [
          widget.child,
          // Fade content behind the nav pill so scrolling rows don't get
          // sliced abruptly at the nav edge.
          Positioned(
            left: 0, right: 0, bottom: 0,
            height: fadeHeight,
            child: IgnorePointer(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [bg.withValues(alpha: 0), bg.withValues(alpha: 0.85), bg],
                    stops: const [0, 0.55, 1],
                  ),
                ),
              ),
            ),
          ),
          AnimatedBuilder(
            animation: _fabCtrl,
            builder: (_, __) {
              if (_fabCtrl.value == 0) return const SizedBox.shrink();
              return Positioned.fill(
                child: GestureDetector(
                  onTap: _toggleSheet,
                  child: BackdropFilter(
                    filter: ImageFilter.blur(sigmaX: 2 * _fabCtrl.value, sigmaY: 2 * _fabCtrl.value),
                    child: Container(color: Colors.black.withValues(alpha: 0.25 * _fabCtrl.value)),
                  ),
                ),
              );
            },
          ),
          AnimatedBuilder(
            animation: _fabCtrl,
            builder: (_, __) => FabSheet(
              progress: _fabCtrl.value,
              onClose: _toggleSheet,
              actions: actions,
            ),
          ),
        ],
      ),
      bottomNavigationBar: _BottomNavPill(
        tabs: tabs,
        activeIndex: active,
        // Brand colour for the active tab + centre FAB. Each module
        // keeps its own accent so the bottom bar stays on-brand.
        accent: switch (module) {
          AppModule.hr => const Color(0xFF0891B2),
          AppModule.inventory => _inventoryAmber,
          AppModule.finance => RunqColors.indigo,
        },
        // HR module uses a Home-only shell: every non-Home destination is
        // pushed onto the root navigator (bot nav disappears, back arrow
        // appears). Finance + Inventory keep the classic switch-between-
        // tabs flow.
        onTap: (i) {
          final target = tabs[i].path;
          if (module == AppModule.hr && i != 0) {
            context.push(target);
          } else {
            context.go(target);
          }
        },
        onFab: _toggleSheet,
        fabCtrl: _fabCtrl,
      ),
    );
  }
}

class _BottomNavPill extends StatelessWidget {
  final List<_Tab> tabs;
  final int activeIndex;
  final Color accent;
  final ValueChanged<int> onTap;
  final VoidCallback onFab;
  final AnimationController fabCtrl;
  const _BottomNavPill({
    required this.tabs,
    required this.activeIndex,
    required this.accent,
    required this.onTap,
    required this.onFab,
    required this.fabCtrl,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    // Inset just enough to clear the home indicator without leaving a big gap.
    // Roughly a third of the system safe-area is plenty; full safe-area looks
    // floaty on devices with a 34px indicator zone.
    final sysBottom = MediaQuery.of(context).padding.bottom;
    final inset = sysBottom > 0 ? (sysBottom * 0.6).clamp(14.0, 22.0) : 12.0;
    return Padding(
      padding: EdgeInsets.fromLTRB(12, 0, 12, inset),
      child: ClipRRect(
          borderRadius: BorderRadius.circular(RunqRadii.hero),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
            child: Container(
              height: 64,
              padding: const EdgeInsets.symmetric(horizontal: 8),
              decoration: BoxDecoration(
                color: t.surface.withValues(alpha: 0.92),
                border: Border.all(color: t.hairline, width: 0.5),
                borderRadius: BorderRadius.circular(RunqRadii.hero),
                boxShadow: RunqShadows.tabBar,
              ),
              child: Row(
                children: [
                  for (var i = 0; i < 2; i++)
                    Expanded(child: _NavItem(tab: tabs[i], active: i == activeIndex, accent: accent, onTap: () => onTap(i))),
                  _FabButton(onTap: onFab, fabCtrl: fabCtrl, accent: accent),
                  for (var i = 2; i < tabs.length; i++)
                    Expanded(child: _NavItem(tab: tabs[i], active: i == activeIndex, accent: accent, onTap: () => onTap(i))),
                ],
              ),
            ),
          ),
        ),
    );
  }
}

class _NavItem extends StatelessWidget {
  final _Tab tab;
  final bool active;
  final Color accent;
  final VoidCallback onTap;
  const _NavItem({
    required this.tab,
    required this.active,
    required this.accent,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    // Inactive tabs need more contrast in dark mode — `muted` (a warm beige)
    // sits too close to the surface tint and the labels go ghosted.
    final inactive = isDark ? t.ink2 : t.muted;
    final color = active ? accent : inactive;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(RunqRadii.smallCard),
      child: SizedBox(
        height: 56,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(active ? tab.activeIcon : tab.icon, color: color, size: 22),
            const SizedBox(height: 2),
            Text(
              tab.label,
              style: RunqText.micro.copyWith(
                color: color,
                fontWeight: active ? FontWeight.w700 : FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FabButton extends StatelessWidget {
  final VoidCallback onTap;
  final AnimationController fabCtrl;
  final Color accent;
  const _FabButton({required this.onTap, required this.fabCtrl, required this.accent});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: AnimatedBuilder(
        animation: fabCtrl,
        builder: (_, __) {
          return GestureDetector(
            onTap: onTap,
            child: Container(
              width: 52,
              height: 52,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: accent,
                shape: BoxShape.circle,
                // Derive the glow from the accent so HR's teal FAB has a
                // teal shadow, not the default indigo from RunqShadows.fab.
                boxShadow: [
                  BoxShadow(
                    color: accent.withValues(alpha: 0.40),
                    blurRadius: 20,
                    offset: const Offset(0, 6),
                  ),
                ],
              ),
              child: Transform.rotate(
                angle: fabCtrl.value * 0.785,
                child: const Icon(Icons.add, color: Colors.white, size: 26),
              ),
            ),
          );
        },
      ),
    );
  }
}
