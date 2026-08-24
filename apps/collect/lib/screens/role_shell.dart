import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/notification_providers.dart';
import '../theme/dhenu_tokens.dart';
import '../widgets/app_bottom_nav.dart';

/// A persona home shell: an IndexedStack of tab pages under [AppBottomNav]
/// (spec §4.3). Each role supplies its own tabs + nav items — four apiece; the
/// operator shells reach Profile from the Home avatar instead, keeping the nav
/// for the daily loop. Keeping tabs in an IndexedStack preserves each tab's
/// scroll/state on switch.
class RoleShell extends ConsumerStatefulWidget {
  const RoleShell({
    super.key,
    required this.items,
    required this.pages,
    this.initialIndex = 0,
    this.tabActions = const {},
    this.header,
    this.deepLinkTabs = const {},
  });

  final List<DhenuNavItem> items;
  final List<Widget> pages;
  final int initialIndex;

  /// Notification deep-link target ('receive' / 'dispatch') → this shell's tab
  /// index. Personas order their tabs differently, so the mapping belongs to the
  /// shell, not the payload. A target this shell doesn't serve is left parked
  /// rather than guessed at.
  final Map<String, int> deepLinkTabs;

  /// Optional bar pinned above the tab pages (e.g. the admin centre-switcher).
  final Widget? header;

  /// Indices whose tap fires an action (e.g. push the capture screen) instead
  /// of switching tabs — the §4.3 centre "➕" action. Pass a placeholder page
  /// for those indices in [pages].
  final Map<int, VoidCallback> tabActions;

  /// Switch the enclosing shell to [index] — lets a tab's own content link to a
  /// sibling tab (farmer Home → Collections). Pushing the sibling as a route
  /// instead would stack a second copy of it with no bottom nav under it.
  static void goToTab(BuildContext context, int index) =>
      context.findAncestorStateOfType<_RoleShellState>()?.select(index);

  @override
  ConsumerState<RoleShell> createState() => _RoleShellState();
}

class _RoleShellState extends ConsumerState<RoleShell> {
  late int _index = widget.initialIndex;

  void select(int i) => setState(() => _index = i);

  /// Consume a parked notification deep-link: switch to the matching tab and
  /// clear it, so re-entering the shell later doesn't re-navigate.
  void _consumeDeepLink(String? target) {
    if (target == null) return;
    final index = widget.deepLinkTabs[target];
    if (index == null) return;
    // Clearing the provider during a build/listen callback needs to land after
    // this frame, or the notifier rebuilds mid-build.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      select(index);
      ref.read(pendingDeepLinkProvider.notifier).state = null;
    });
  }

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
    // A tap that arrives while the shell is already mounted; the read below
    // covers a tap that launched the app cold, before this shell existed.
    ref.listen<String?>(pendingDeepLinkProvider, (_, next) => _consumeDeepLink(next));
    _consumeDeepLink(ref.read(pendingDeepLinkProvider));
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
