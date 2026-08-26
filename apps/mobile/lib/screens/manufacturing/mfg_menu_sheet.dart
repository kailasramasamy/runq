// The Manufacturing "Menu" bottom sheet — everything the shop floor reaches
// for that doesn't earn a bottom-nav tab (input pool, reclaims, write-offs,
// reports). Opened from the Menu tab rather than routed to, so the sheet
// closes back onto whatever screen the user was already on.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../providers/app_module_provider.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/mfg_colors.dart';

class _MenuItem {
  final IconData icon;
  final String label;
  final Color tint;
  final String path;
  /// Shell (bottom-nav) destinations must be switched to with `go`; pushing
  /// them duplicates the ShellRoute page key.
  final bool isTab;
  const _MenuItem(this.icon, this.label, this.tint, this.path,
      {this.isTab = false});
}

/// Opens the manufacturing menu. Returns when the sheet is dismissed.
Future<void> showMfgMenuSheet(BuildContext context) => showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => const _MfgMenuSheet(),
    );

class _MfgMenuSheet extends ConsumerWidget {
  const _MfgMenuSheet();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    // The write-off register reads /inventory/reports/write-offs, which is
    // gated on the inventory module — hide the row rather than route into a 403.
    final hasInventory =
        ref.watch(allowedModulesProvider).contains(AppModule.inventory);

    final items = <_MenuItem>[
      const _MenuItem(Icons.bolt_rounded, 'Record production',
          MfgColors.roseDarkest, '/manufacturing/production/new'),
      const _MenuItem(Icons.delete_outline, 'Write-offs & wastage',
          Color(0xFFDC2626), '/manufacturing/reports/write-offs'),
      const _MenuItem(Icons.layers_outlined, 'Input pool',
          Color(0xFF2563EB), '/manufacturing/input-pool'),
      const _MenuItem(Icons.inventory_2_outlined, 'Raw materials',
          Color(0xFF0891B2), '/manufacturing/raw-materials'),
      const _MenuItem(Icons.recycling_rounded, 'Reclaim stock',
          Color(0xFF16A34A), '/manufacturing/reclaims/new'),
      const _MenuItem(Icons.account_tree_outlined, 'Bills of materials',
          MfgColors.rose, '/manufacturing/boms', isTab: true),
      const _MenuItem(Icons.precision_manufacturing_outlined, 'Work orders',
          MfgColors.roseDeep, '/manufacturing/wos', isTab: true),
      const _MenuItem(Icons.summarize_outlined, 'Work-order summary',
          Color(0xFF7C3AED), '/manufacturing/reports/wo-summary'),
      const _MenuItem(Icons.show_chart_rounded, 'Yield trend',
          Color(0xFFEA580C), '/manufacturing/reports/yield-trend'),
    ].where((i) => hasInventory || !i.path.endsWith('write-offs')).toList();

    return SafeArea(
      top: false,
      child: Container(
        margin: const EdgeInsets.fromLTRB(12, 0, 12, 12),
        padding: const EdgeInsets.fromLTRB(8, 6, 8, 8),
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: BorderRadius.circular(RunqRadii.hero),
          border: Border.all(color: t.hairline, width: 0.5),
          boxShadow: RunqShadows.sheet,
        ),
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
            const SizedBox(height: 8),
            Flexible(
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    for (var i = 0; i < items.length; i++) ...[
                      if (i > 0)
                        Divider(
                          height: 1,
                          thickness: 0.5,
                          indent: 42,
                          color: t.hairline,
                        ),
                      _MenuRow(item: items[i]),
                    ],
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MenuRow extends StatelessWidget {
  final _MenuItem item;
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
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 11),
        child: Row(
          children: [
            Icon(item.icon, color: fg, size: 20),
            const SizedBox(width: 12),
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
