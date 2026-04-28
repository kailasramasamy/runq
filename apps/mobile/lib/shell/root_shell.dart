import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../theme/runq_tokens.dart';
import '../theme/runq_theme.dart';
import 'fab_sheet.dart';

class _Tab {
  final String path, label;
  final IconData icon, activeIcon;
  const _Tab(this.path, this.label, this.icon, this.activeIcon);
}

const _tabs = <_Tab>[
  _Tab('/home', 'Home', Icons.home_outlined, Icons.home_rounded),
  _Tab('/invoices', 'Invoices', Icons.receipt_long_outlined, Icons.receipt_long_rounded),
  _Tab('/bills', 'Bills', Icons.description_outlined, Icons.description_rounded),
  _Tab('/banking', 'Banking', Icons.account_balance_outlined, Icons.account_balance_rounded),
];

class RootShell extends StatefulWidget {
  final GoRouterState state;
  final Widget child;
  const RootShell({super.key, required this.state, required this.child});

  @override
  State<RootShell> createState() => _RootShellState();
}

class _RootShellState extends State<RootShell> with SingleTickerProviderStateMixin {
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

  int _activeIndex(String location) {
    for (var i = 0; i < _tabs.length; i++) {
      if (location.startsWith(_tabs[i].path)) return i;
    }
    return 0;
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
    final active = _activeIndex(loc);

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
            ),
          ),
        ],
      ),
      bottomNavigationBar: _BottomNavPill(
        activeIndex: active,
        onTap: (i) => context.go(_tabs[i].path),
        onFab: _toggleSheet,
        fabCtrl: _fabCtrl,
      ),
    );
  }
}

class _BottomNavPill extends StatelessWidget {
  final int activeIndex;
  final ValueChanged<int> onTap;
  final VoidCallback onFab;
  final AnimationController fabCtrl;
  const _BottomNavPill({
    required this.activeIndex,
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
                    Expanded(child: _NavItem(tab: _tabs[i], active: i == activeIndex, onTap: () => onTap(i))),
                  _FabButton(onTap: onFab, fabCtrl: fabCtrl),
                  for (var i = 2; i < _tabs.length; i++)
                    Expanded(child: _NavItem(tab: _tabs[i], active: i == activeIndex, onTap: () => onTap(i))),
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
  final VoidCallback onTap;
  const _NavItem({required this.tab, required this.active, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final color = active ? RunqColors.indigo : RT(context).muted;
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
                fontSize: 10,
                letterSpacing: 0.04 * 10,
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
  const _FabButton({required this.onTap, required this.fabCtrl});

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
                color: RunqColors.indigo,
                shape: BoxShape.circle,
                boxShadow: RunqShadows.fab,
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
