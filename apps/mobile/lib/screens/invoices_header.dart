import 'package:flutter/material.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../utils/format_inr.dart';
import '../widgets/list_filter_kit.dart';

/// Status tab definition shared by the invoices screen and its header.
class InvoiceTab {
  final String key, label;
  final String? statusFilter;
  const InvoiceTab(this.key, this.label, this.statusFilter);
}

const invoiceTabs = <InvoiceTab>[
  InvoiceTab('all', 'All', null),
  InvoiceTab('draft', 'Draft', 'draft'),
  InvoiceTab('overdue', 'Overdue', 'overdue'),
  // 'unpaid' is a backend sentinel that resolves to (sent OR partially_paid)
  // with balance_due > 0 — i.e., everything still owed by the customer.
  InvoiceTab('unpaid', 'Unpaid', 'unpaid'),
  InvoiceTab('paid', 'Paid', 'paid'),
];

/// Scrolling header for the invoices screen: filter pills → summary cards →
/// "Invoice history" with an always-visible search box.
class InvoicesHeader extends StatelessWidget {
  final int? count;
  final double? amount;
  final String amountLabel;
  final String? customerName;
  final VoidCallback onPickCustomer;
  final VoidCallback onClearCustomer;
  final String rangeLabel;
  final bool rangeActive;
  final VoidCallback onPickRange;
  final String tabKey;
  final Map<String, int> badges;
  final ValueChanged<String> onTab;
  final TextEditingController searchController;
  final ValueChanged<String> onSearchChanged;
  const InvoicesHeader({
    super.key,
    required this.count,
    required this.amount,
    required this.amountLabel,
    required this.customerName,
    required this.onPickCustomer,
    required this.onClearCustomer,
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
    final hasCustomer = customerName != null && customerName!.isNotEmpty;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          // Scope first: date range and customer decide what the numbers
          // below mean, so they sit ahead of the status pills.
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
                  label: hasCustomer ? customerName! : 'All customers',
                  active: hasCustomer,
                  leading: Icons.person_outline_rounded,
                  trailing: hasCustomer ? Icons.close_rounded : Icons.expand_more_rounded,
                  onTap: onPickCustomer,
                  onTrailing: hasCustomer ? onClearCustomer : null,
                ),
                const SizedBox(width: 8),
                Container(width: 1, margin: const EdgeInsets.symmetric(vertical: 8), color: t.hairline),
                const SizedBox(width: 8),
                for (final tab in invoiceTabs) ...[
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
                    icon: Icons.receipt_long_rounded,
                    label: count == 1 ? 'INVOICE' : 'INVOICES',
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
          Text('Invoice history', style: RunqText.h3.copyWith(color: t.ink)),
          const SizedBox(height: 10),
          ListSearchField(
            controller: searchController,
            onChanged: onSearchChanged,
            hint: 'Search invoice no., customer…',
          ),
          const SizedBox(height: 12),
        ],
      ),
    );
  }
}
