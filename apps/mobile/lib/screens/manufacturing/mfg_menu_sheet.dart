// Manufacturing's Menu items — everything the shop floor reaches for that
// doesn't earn a bottom-nav tab. Row visuals live in `shell/menu_sheet.dart`.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/app_module_provider.dart';
import '../../shell/menu_sheet.dart';
import 'widgets/mfg_colors.dart';

/// Opens the manufacturing menu. Returns when the sheet is dismissed.
Future<void> showMfgMenuSheet(BuildContext context) =>
    showModuleMenuSheet(context, _items);

List<MenuItem> _items(WidgetRef ref) {
  // The write-off register reads /inventory/reports/write-offs, which is gated
  // on the inventory module — hide the row rather than route into a 403.
  final hasInventory =
      ref.watch(allowedModulesProvider).contains(AppModule.inventory);
  return [
    const MenuItem(Icons.bolt_rounded, 'Record production',
        MfgColors.roseDarkest, '/manufacturing/production/new'),
    if (hasInventory)
      const MenuItem(Icons.delete_outline, 'Write-offs & wastage',
          Color(0xFFDC2626), '/manufacturing/reports/write-offs'),
    const MenuItem(Icons.layers_outlined, 'Input pool', Color(0xFF2563EB),
        '/manufacturing/input-pool'),
    const MenuItem(Icons.inventory_2_outlined, 'Raw materials',
        Color(0xFF0891B2), '/manufacturing/raw-materials'),
    const MenuItem(Icons.recycling_rounded, 'Reclaim stock',
        Color(0xFF16A34A), '/manufacturing/reclaims/new'),
    const MenuItem(Icons.account_tree_outlined, 'Bills of materials',
        MfgColors.rose, '/manufacturing/boms', isTab: true),
    const MenuItem(Icons.precision_manufacturing_outlined, 'Work orders',
        MfgColors.roseDeep, '/manufacturing/wos', isTab: true),
    const MenuItem(Icons.summarize_outlined, 'Work-order summary',
        Color(0xFF7C3AED), '/manufacturing/reports/wo-summary'),
    const MenuItem(Icons.show_chart_rounded, 'Yield trend', Color(0xFFEA580C),
        '/manufacturing/reports/yield-trend'),
  ];
}
