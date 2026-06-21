import 'package:flutter/material.dart';
import '../theme/dhenu_tokens.dart';
import '../widgets/app_bottom_nav.dart';

/// A persona home shell: an IndexedStack of tab pages under the 5-item
/// [AppBottomNav] (spec §4.3). Each role supplies its own tabs + nav items.
/// Keeping tabs in an IndexedStack preserves each tab's scroll/state on switch.
class RoleShell extends StatefulWidget {
  const RoleShell({
    super.key,
    required this.items,
    required this.pages,
    this.initialIndex = 0,
    this.tabActions = const {},
    this.header,
  });

  final List<DhenuNavItem> items;
  final List<Widget> pages;
  final int initialIndex;

  /// Optional bar pinned above the tab pages (e.g. the admin centre-switcher).
  final Widget? header;

  /// Indices whose tap fires an action (e.g. push the capture screen) instead
  /// of switching tabs — the §4.3 centre "➕" action. Pass a placeholder page
  /// for those indices in [pages].
  final Map<int, VoidCallback> tabActions;

  @override
  State<RoleShell> createState() => _RoleShellState();
}

class _RoleShellState extends State<RoleShell> {
  late int _index = widget.initialIndex;

  void _onTap(int i) {
    final action = widget.tabActions[i];
    if (action != null) {
      action();
      return;
    }
    setState(() => _index = i);
  }

  @override
  Widget build(BuildContext context) {
    assert(widget.items.length == widget.pages.length);
    return Scaffold(
      backgroundColor: DT(context).surface,
      body: SafeArea(
        bottom: false,
        child: Column(children: [
          ?widget.header,
          Expanded(child: IndexedStack(index: _index, children: widget.pages)),
        ]),
      ),
      bottomNavigationBar: AppBottomNav(
        items: widget.items,
        currentIndex: _index,
        onTap: _onTap,
      ),
    );
  }
}
