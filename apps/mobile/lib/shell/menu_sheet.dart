// Shared "Menu" bottom sheet — the module destinations that don't earn a
// bottom-nav tab. Opened from the Menu tab rather than routed to, so it
// closes back onto whatever screen the user was already on.
//
// Modules supply only the item list (see `mfg_menu_sheet.dart`,
// `inv_menu_sheet.dart`); the row visuals live here so every module's menu
// reads the same.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';

class MenuItem {
  final IconData icon;
  final String label;

  /// Icon colour. The row itself stays unfilled — colour is the only thing
  /// distinguishing one destination from the next.
  final Color tint;
  final String path;

  /// Shell (bottom-nav) destinations must be switched to with `go`; pushing
  /// them duplicates the ShellRoute page key.
  final bool isTab;
  const MenuItem(this.icon, this.label, this.tint, this.path,
      {this.isTab = false});
}

/// Opens a module menu. [items] is built inside the sheet so it can read
/// providers (module gating, counts). Returns when the sheet is dismissed.
Future<void> showModuleMenuSheet(
  BuildContext context,
  List<MenuItem> Function(WidgetRef ref) items,
) =>
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => _MenuSheet(items: items),
    );

class _MenuSheet extends StatelessWidget {
  final List<MenuItem> Function(WidgetRef ref) items;
  const _MenuSheet({required this.items});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    // Edge to edge, sitting on the bottom of the screen — the nav pill it
    // opens from is a floating island, but the menu is a surface you read
    // down, and full width gives the rows their whole line length. Only the
    // top corners round; the bottom meets the screen edge.
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: const BorderRadius.vertical(
          top: Radius.circular(RunqRadii.hero),
        ),
        border: Border(top: BorderSide(color: t.hairline, width: 0.5)),
        boxShadow: RunqShadows.sheet,
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 8, 14, 10),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: t.hairline,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 10),
              Flexible(
                child: SingleChildScrollView(
                  child: Consumer(
                    builder: (context, ref, _) {
                      final rows = items(ref);
                      return Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          for (var i = 0; i < rows.length; i++) ...[
                            if (i > 0)
                              Divider(
                                height: 1,
                                thickness: 0.5,
                                indent: 46,
                                color: t.hairline,
                              ),
                            _MenuRow(item: rows[i]),
                          ],
                        ],
                      );
                    },
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MenuRow extends StatelessWidget {
  final MenuItem item;
  const _MenuRow({required this.item});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    // No fill on the row and none behind the icon — the sheet's own surface is
    // the ground, hairlines do the separating, and colour lives on the icon.
    final dark = Theme.of(context).brightness == Brightness.dark;
    final fg = dark ? Color.lerp(item.tint, Colors.white, 0.45)! : item.tint;
    return InkWell(
      onTap: () {
        Navigator.of(context).pop();
        if (item.isTab) {
          context.go(item.path);
        } else {
          context.push(item.path);
        }
      },
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 15),
        child: Row(
          children: [
            Icon(item.icon, color: fg, size: 20),
            const SizedBox(width: 14),
            Expanded(
              child: Text(item.label,
                  style: RunqText.bodyStrong.copyWith(color: t.ink)),
            ),
            Icon(Icons.chevron_right_rounded, color: t.muted2, size: 18),
          ],
        ),
      ),
    );
  }
}
