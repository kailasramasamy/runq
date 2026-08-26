// Inventory's Menu items — the destinations the godown floor needs that the
// four-tab nav can't hold. Row visuals live in `shell/menu_sheet.dart`.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../shell/menu_sheet.dart';
import 'widgets/inv_colors.dart';

/// Opens the inventory menu. Returns when the sheet is dismissed.
Future<void> showInvMenuSheet(BuildContext context) =>
    showModuleMenuSheet(context, _items);

// `ref` is unused today — inventory has no module-gated rows the way
// manufacturing's write-off register does — but the builder signature is
// shared, and gating is exactly what it exists for.
List<MenuItem> _items(WidgetRef ref) => const [
      // Alerts lost its tab to Menu; it stays first here, and Home's "Needs
      // attention" block still surfaces the same exceptions.
      MenuItem(Icons.warning_amber_rounded, 'Low-stock alerts',
          Color(0xFFDC2626), '/inventory/alerts', isTab: true),
      MenuItem(Icons.event_busy_outlined, 'Expiry report', Color(0xFFEA580C),
          '/inventory/reports/expiry', isTab: true),
      MenuItem(Icons.delete_outline, 'Write-offs & wastage', Color(0xFFBE123C),
          '/inventory/reports/write-offs'),
      MenuItem(Icons.warehouse_outlined, 'Stock by warehouse',
          InvColors.amberDarkest, '/inventory/warehouses'),
      MenuItem(Icons.alt_route_outlined, 'Transfers', Color(0xFF2563EB),
          '/inventory/transfers'),
      MenuItem(Icons.tune_rounded, 'Adjustments', Color(0xFF0891B2),
          '/inventory/adjustments'),
      MenuItem(Icons.checklist_outlined, 'Stock take', Color(0xFF16A34A),
          '/inventory/stock-take'),
      MenuItem(Icons.trending_up_rounded, 'Analytics', Color(0xFF7C3AED),
          '/inventory/analytics', isTab: true),
      MenuItem(Icons.receipt_long_outlined, 'Activity feed',
          InvColors.amberDeep, '/inventory/activity'),
      // Item master is reference data, not daily floor work — it sits last.
      MenuItem(Icons.category_outlined, 'Items', InvColors.amber,
          '/inventory/items'),
    ];
