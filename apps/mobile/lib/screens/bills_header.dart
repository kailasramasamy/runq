import 'package:flutter/material.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../utils/format_inr.dart';
import '../widgets/list_filter_kit.dart';

/// Pill-shaped "Add bill" affordance for the title row — capture is the
/// primary action, so it stays pinned while the filters scroll away.
class AddBillButton extends StatelessWidget {
  final VoidCallback onTap;
  const AddBillButton({super.key, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    // Dark mode's brand is a light indigo, so pick the label colour from the
    // fill's brightness rather than hardcoding white.
    final fg = ThemeData.estimateBrightnessForColor(t.brand) == Brightness.dark
        ? Colors.white
        : const Color(0xFF1E1B4B);
    return Material(
      color: t.brand,
      borderRadius: BorderRadius.circular(999),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 16, 10),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.add_rounded, color: fg, size: 18),
              const SizedBox(width: 4),
              Text('Add bill', style: RunqText.bodyStrong.copyWith(color: fg)),
            ],
          ),
        ),
      ),
    );
  }
}

/// Status tab definition shared by the bills screen and its header.
class BillTab {
  final String key, label;
  final String? statusFilter;
  const BillTab(this.key, this.label, this.statusFilter);
}

// "Pending" = every bill that's still owed — i.e., not paid or cancelled.
// Backend status filter accepts CSV; the schema validates each part.
const _pendingStatuses = 'draft,pending_match,matched,approved,partially_paid';

const billTabs = <BillTab>[
  BillTab('all', 'All', null),
  BillTab('pending', 'Pending', _pendingStatuses),
  BillTab('approved', 'Approved', 'approved'),
  BillTab('paid', 'Paid', 'paid'),
];

/// Scrolling header for the bills screen: filter pills → summary cards →
/// "Bill history" with an always-visible search box.
class BillsHeader extends StatelessWidget {
  final int? count;
  final double? amount;
  final String amountLabel;
  final String? vendorName;
  final VoidCallback onPickVendor;
  final VoidCallback onClearVendor;
  final String rangeLabel;
  final bool rangeActive;
  final VoidCallback onPickRange;
  final String tabKey;
  final Map<String, int> badges;
  final ValueChanged<String> onTab;
  final TextEditingController searchController;
  final ValueChanged<String> onSearchChanged;
  const BillsHeader({
    super.key,
    required this.count,
    required this.amount,
    required this.amountLabel,
    required this.vendorName,
    required this.onPickVendor,
    required this.onClearVendor,
    required this.rangeLabel,
    required this.rangeActive,
    required this.onPickRange,
    required this.tabKey,
    required this.badges,
    required this.onTab,
    required this.searchController,
    required this.onSearchChanged,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final hasVendor = vendorName != null && vendorName!.isNotEmpty;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          // Scope first: date range and vendor decide what the numbers below
          // mean, so they sit ahead of the status pills.
          SizedBox(
            height: 38,
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: [
                FilterPill(
                  label: rangeLabel,
                  active: rangeActive,
                  trailing: Icons.keyboard_arrow_down_rounded,
                  onTap: onPickRange,
                ),
                const SizedBox(width: 8),
                FilterPill(
                  label: hasVendor ? vendorName! : 'All vendors',
                  active: hasVendor,
                  leading: Icons.storefront_outlined,
                  trailing: hasVendor ? Icons.close_rounded : Icons.expand_more_rounded,
                  onTap: onPickVendor,
                  onTrailing: hasVendor ? onClearVendor : null,
                ),
                const SizedBox(width: 8),
                Container(width: 1, margin: const EdgeInsets.symmetric(vertical: 8), color: t.hairline),
                const SizedBox(width: 8),
                for (final tab in billTabs) ...[
                  FilterPill(
                    label: tab.label,
                    active: tab.key == tabKey,
                    badge: badges[tab.key] ?? 0,
                    onTap: () => onTab(tab.key),
                  ),
                  const SizedBox(width: 8),
                ],
              ],
            ),
          ),
          const SizedBox(height: 14),
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  child: ListStatCard(
                    icon: Icons.description_rounded,
                    label: count == 1 ? 'BILL' : 'BILLS',
                    value: count == null ? '—' : '$count',
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: ListStatCard(
                    icon: Icons.account_balance_wallet_rounded,
                    label: amountLabel.toUpperCase(),
                    value: amount == null ? '—' : formatINR(amount, compact: true),
                    tinted: true,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          Text('Bill history', style: RunqText.h3.copyWith(color: t.ink)),
          const SizedBox(height: 10),
          ListSearchField(
            controller: searchController,
            onChanged: onSearchChanged,
            hint: 'Search bill no., vendor…',
          ),
          const SizedBox(height: 12),
        ],
      ),
    );
  }
}
