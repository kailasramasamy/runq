import 'package:flutter/material.dart';
import '../theme/dhenu_tokens.dart';

/// Thin convenience wrapper around [Scaffold] with the Dhenu background and
/// a custom header (not a Material AppBar).
///
/// Layout (top to bottom):
///   SafeArea → header row (title + actions)
///   body (expanded, scrollable by caller)
///   [bottomAction] pinned above safe area (e.g. PrimaryAction)
///   [bottomNavigationBar]
class DhenuScaffold extends StatelessWidget {
  const DhenuScaffold({
    super.key,
    this.title,
    this.actions,
    required this.body,
    this.bottomNavigationBar,
    this.bottomAction,
    this.padding,
  });

  /// Custom header content (left side, e.g. a Text wordmark or Row).
  final Widget? title;

  /// Header trailing widgets (e.g. SyncStatus, LanguageToggle, notification icon).
  final List<Widget>? actions;

  final Widget body;

  final Widget? bottomNavigationBar;

  /// A widget pinned above the safe area — typically a [PrimaryAction].
  final Widget? bottomAction;

  /// Body horizontal padding. Defaults to [DhenuSpacing.screen] on each side.
  final EdgeInsets? padding;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final effectivePadding = padding ??
        const EdgeInsets.symmetric(horizontal: DhenuSpacing.screen);

    return Scaffold(
      backgroundColor: t.surface,
      bottomNavigationBar: bottomNavigationBar,
      body: Column(
        children: [
          // Header
          SafeArea(
            bottom: false,
            child: _Header(title: title, actions: actions, t: t),
          ),
          // Body
          Expanded(
            child: Padding(
              padding: effectivePadding,
              child: body,
            ),
          ),
          // Bottom action pinned above safe area
          if (bottomAction != null)
            SafeArea(
              top: false,
              child: Padding(
                padding: EdgeInsets.only(
                  left: effectivePadding.left,
                  right: effectivePadding.right,
                  bottom: DhenuSpacing.lg,
                  top: DhenuSpacing.sm,
                ),
                child: bottomAction,
              ),
            ),
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({this.title, this.actions, required this.t});

  final Widget? title;
  final List<Widget>? actions;
  final DhenuTokens t;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: DhenuSpacing.screen,
        vertical: DhenuSpacing.md,
      ),
      color: t.surface,
      child: Row(
        children: [
          if (title != null)
            Expanded(child: title!)
          else
            const Expanded(child: SizedBox.shrink()),
          if (actions != null)
            Row(
              mainAxisSize: MainAxisSize.min,
              children: actions!
                  .expand((w) => [w, const SizedBox(width: DhenuSpacing.sm)])
                  .toList()
                ..removeLast(),
            ),
        ],
      ),
    );
  }
}
