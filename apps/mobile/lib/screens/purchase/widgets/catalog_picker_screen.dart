import 'dart:async';

import 'package:flutter/material.dart';

import '../../../api/purchase_models.dart';
import '../../../api/purchase_repo.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'po_form_widgets.dart';
import 'pur_colors.dart';
import 'pur_primitives.dart';

/// Result of [CatalogPickerScreen]. Either a real catalog entry (which the
/// caller can use to autofill rate / UOM / HSN / tax) or a free-form custom
/// description the user typed.
class CatalogPickResult {
  final VendorCatalogEntry? entry;
  final String? customDescription;
  const CatalogPickResult.entry(this.entry) : customDescription = null;
  const CatalogPickResult.custom(this.customDescription) : entry = null;

  bool get isEntry => entry != null;
}

/// Full-screen vendor-catalog picker.
///
/// UX rules:
/// - Pushed as a route (not a bottom sheet) so the list has room to breathe.
/// - The search field does NOT autofocus — the keyboard only appears when
///   the user explicitly taps the search box. The list is browsable
///   without any keyboard interaction.
/// - Empty / no-match queries surface a "Use the typed text as custom item"
///   action at the bottom of the list so free-form entry stays one tap
///   away.
class CatalogPickerScreen extends StatefulWidget {
  final String vendorId;
  final String? initialQuery;
  const CatalogPickerScreen({
    super.key,
    required this.vendorId,
    this.initialQuery,
  });

  @override
  State<CatalogPickerScreen> createState() => _CatalogPickerScreenState();
}

class _CatalogPickerScreenState extends State<CatalogPickerScreen> {
  late final TextEditingController _ctrl;
  List<VendorCatalogEntry> _results = const [];
  bool _loading = false;
  String _lastQuery = '__init__';
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    _ctrl = TextEditingController(text: widget.initialQuery ?? '');
    _fetch(_ctrl.text);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _fetch(String q) async {
    setState(() {
      _loading = true;
      _lastQuery = q;
    });
    try {
      final res = await purchaseRepo.listVendorCatalog(widget.vendorId, query: q);
      if (!mounted || _lastQuery != q) return;
      setState(() => _results = res);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _onQueryChanged(String v) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 180), () => _fetch(v));
    // Repaint to refresh the "Use as custom" footer state immediately.
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final query = _ctrl.text.trim();
    final hasExactMatch =
        _results.any((e) => e.description.trim().toLowerCase() == query.toLowerCase());
    final showCustomFooter = query.isNotEmpty && !hasExactMatch;

    return Scaffold(
      backgroundColor: t.surface,
      appBar: AppBar(
        backgroundColor: t.surface,
        elevation: 0,
        scrolledUnderElevation: 0,
        surfaceTintColor: Colors.transparent,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: const Text('Select item'),
      ),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
              child: PurSearchBar(
                controller: _ctrl,
                placeholder: 'Search catalog…',
                onChanged: _onQueryChanged,
              ),
            ),
            if (_loading) const LinearProgressIndicator(minHeight: 2),
            Expanded(
              child: _results.isEmpty && !_loading
                  ? _EmptyState(query: query, hasVendor: true)
                  : ListView.separated(
                      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                      padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
                      itemCount: _results.length,
                      separatorBuilder: (_, __) => Divider(height: 1, color: t.hairlineSoft),
                      itemBuilder: (_, i) => _CatalogRow(
                        entry: _results[i],
                        onTap: () => Navigator.of(context)
                            .pop(CatalogPickResult.entry(_results[i])),
                      ),
                    ),
            ),
            if (showCustomFooter)
              _CustomFooter(
                query: query,
                onTap: () => Navigator.of(context).pop(CatalogPickResult.custom(query)),
              ),
          ],
        ),
      ),
    );
  }
}

// ── Row ───────────────────────────────────────────────────────────────────

class _CatalogRow extends StatelessWidget {
  final VendorCatalogEntry entry;
  final VoidCallback onTap;
  const _CatalogRow({required this.entry, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(4, 14, 4, 14),
          child: Row(
            children: [
              Container(
                width: 40, height: 40,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: PurColors.violetSubtle,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(Icons.inventory_2_outlined,
                    size: 18, color: PurColors.brand(context)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(entry.description,
                              style: RunqText.bodyStrong.copyWith(color: t.ink),
                              maxLines: 2, overflow: TextOverflow.ellipsis),
                        ),
                        if (entry.defaultUom != null) ...[
                          const SizedBox(width: 6),
                          PoUomChip(uom: entry.defaultUom!),
                        ],
                      ],
                    ),
                    if (entry.hsnSacCode != null) ...[
                      const SizedBox(height: 3),
                      Text('HSN ${entry.hsnSacCode}',
                          style: RunqText.caption.copyWith(color: t.muted)),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 8),
              if (entry.defaultRate != null)
                Text('Last ${indianINR(entry.defaultRate!, decimals: 2)}',
                    style: RunqText.caption.copyWith(color: t.muted2)),
              const SizedBox(width: 4),
              Icon(Icons.chevron_right_rounded, color: t.muted2),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Empty state ───────────────────────────────────────────────────────────

class _EmptyState extends StatelessWidget {
  final String query;
  final bool hasVendor;
  const _EmptyState({required this.query, required this.hasVendor});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final isSearch = query.isNotEmpty;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 48),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 56, height: 56,
            decoration: BoxDecoration(
              color: PurColors.violetSubtle,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Icon(
              isSearch ? Icons.search_off_rounded : Icons.menu_book_outlined,
              color: PurColors.brand(context), size: 26,
            ),
          ),
          const SizedBox(height: 12),
          Text(
            isSearch ? 'No matches' : 'Catalog is empty',
            style: RunqText.bodyStrong.copyWith(color: t.ink),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 4),
          Text(
            isSearch
                ? 'Use "$query" as a custom item below, or change your search.'
                : 'Add items to this vendor\'s catalog from the web admin to see them here.',
            style: RunqText.caption.copyWith(color: t.muted),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

// ── Custom-item footer ────────────────────────────────────────────────────

class _CustomFooter extends StatelessWidget {
  final String query;
  final VoidCallback onTap;
  const _CustomFooter({required this.query, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        border: Border(top: BorderSide(color: t.hairline)),
      ),
      padding: EdgeInsets.fromLTRB(16, 10, 16, 10 + MediaQuery.of(context).padding.bottom),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            decoration: BoxDecoration(
              gradient: PurColors.heroGradient,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                const Icon(Icons.add_rounded, color: Colors.white, size: 18),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Use "$query" as custom item',
                    style: RunqText.bodyStrong.copyWith(color: Colors.white),
                    maxLines: 1, overflow: TextOverflow.ellipsis,
                  ),
                ),
                const Icon(Icons.arrow_forward_rounded, color: Colors.white, size: 18),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
