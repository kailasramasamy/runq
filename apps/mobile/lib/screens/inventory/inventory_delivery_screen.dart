// Dispatches (DN) — list + sheet. Mirrors GRN structure: stats strip,
// search, status filter pills, then a list of DN tiles (number + customer
// + date/wh + status pill, lineCount + total in the footer). Sheet keeps
// the barcode workflow.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/inventory_models.dart';
import '../../api/inventory_repo.dart';
import '../../providers/inventory_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/inv_colors.dart';
import 'widgets/inv_primitives.dart';
import 'widgets/warehouse_picker.dart';

class InventoryDeliveryScreen extends ConsumerStatefulWidget {
  const InventoryDeliveryScreen({super.key});
  @override
  ConsumerState<InventoryDeliveryScreen> createState() => _State();
}

class _State extends ConsumerState<InventoryDeliveryScreen> {
  String _search = '';
  String? _statusFilter;
  final _searchCtrl = TextEditingController();

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  List<InvDn> _filter(List<InvDn> all) {
    var out = all;
    if (_statusFilter != null) {
      out = out.where((d) => d.status == _statusFilter).toList();
    }
    final q = _search.trim().toLowerCase();
    if (q.isNotEmpty) {
      out = out.where((d) =>
        d.dnNo.toLowerCase().contains(q) ||
        (d.customerName?.toLowerCase().contains(q) ?? false) ||
        d.warehouseName.toLowerCase().contains(q),
      ).toList();
    }
    return out;
  }

  Future<void> _refresh() async {
    ref.invalidate(invDnListProvider(null));
    await Future<void>.delayed(const Duration(milliseconds: 200));
  }

  Future<void> _openSheet() async {
    final created = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const _NewDnSheet(),
    );
    if (created == true) {
      ref.invalidate(invDnListProvider(null));
      ref.invalidate(invKpisProvider);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final rows = ref.watch(invDnListProvider(null));
    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: InvPlainAppBar(
        title: 'Dispatches (DN)',
        onBack: () => context.pop(),
        trailing: _AddBtn(onTap: _openSheet),
      ),
      body: RefreshIndicator(
        color: InvColors.brand(context),
        onRefresh: _refresh,
        child: rows.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text('Failed to load: $e',
                  style: RunqText.caption.copyWith(color: t.muted),
                  textAlign: TextAlign.center),
            ),
          ),
          data: (list) {
            final filtered = _filter(list);
            return CustomScrollView(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                SliverToBoxAdapter(child: _Stats(all: list)),
                SliverToBoxAdapter(child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                  child: InvSearchBar(
                    controller: _searchCtrl,
                    onChanged: (v) => setState(() => _search = v),
                    hint: 'DN number, customer, warehouse…',
                  ),
                )),
                SliverToBoxAdapter(child: _StatusPills(
                  selected: _statusFilter,
                  onSelect: (s) => setState(() => _statusFilter = s),
                )),
                if (filtered.isEmpty)
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: InvEmptyState(
                      icon: Icons.local_shipping_outlined,
                      title: list.isEmpty ? 'No deliveries yet' : 'No matches',
                      subtitle: list.isEmpty
                          ? 'Dispatch your first order to get started'
                          : 'Try a different search or filter',
                      actionLabel: '+ New Dispatch',
                      onAction: _openSheet,
                    ),
                  )
                else
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 120),
                    sliver: SliverList.separated(
                      itemCount: filtered.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (_, i) => _DnTile(dn: filtered[i]),
                    ),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _AddBtn extends StatelessWidget {
  const _AddBtn({required this.onTap});
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: Material(
        color: InvColors.brand(context),
        borderRadius: BorderRadius.circular(8),
        child: InkWell(
          borderRadius: BorderRadius.circular(8),
          onTap: onTap,
          child: const SizedBox(
            width: 32, height: 32,
            child: Icon(Icons.add, color: Colors.white, size: 18),
          ),
        ),
      ),
    );
  }
}

class _Stats extends StatelessWidget {
  const _Stats({required this.all});
  final List<InvDn> all;
  @override
  Widget build(BuildContext context) {
    final today = DateTime.now().toIso8601String().substring(0, 10);
    final month = today.substring(0, 7);
    var todayN = 0, monthN = 0;
    var todayValue = 0.0;
    for (final d in all) {
      if (d.dispatchDate == today) {
        todayN++;
        if (d.status == 'dispatched') todayValue += d.totalValue;
      }
      if (d.dispatchDate.startsWith(month)) monthN++;
    }
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      // IntrinsicHeight — see note on GRN _Stats; same sliver-stretch trap.
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(child: InvKpiCard(label: 'Today', value: '$todayN', sub: 'dispatches')),
            const SizedBox(width: 8),
            Expanded(child: InvKpiCard(label: 'This Month', value: '$monthN', sub: 'total')),
            const SizedBox(width: 8),
            Expanded(child: InvKpiCard(
              label: 'Today Val.',
              value: compactINR(todayValue),
              sub: 'dispatched',
            )),
          ],
        ),
      ),
    );
  }
}

class _StatusPills extends StatelessWidget {
  const _StatusPills({required this.selected, required this.onSelect});
  final String? selected;
  final ValueChanged<String?> onSelect;
  static const _opts = <(String?, String)>[
    (null, 'All'),
    ('dispatched', 'Dispatched'),
    ('draft', 'Draft'),
    ('cancelled', 'Cancelled'),
  ];
  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 40,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
        children: [
          for (var i = 0; i < _opts.length; i++) ...[
            if (i > 0) const SizedBox(width: 6),
            InvFilterPill(
              label: _opts[i].$2,
              active: selected == _opts[i].$1,
              onTap: () => onSelect(_opts[i].$1),
            ),
          ],
        ],
      ),
    );
  }
}

class _DnTile extends StatelessWidget {
  const _DnTile({required this.dn});
  final InvDn dn;
  @override
  Widget build(BuildContext context) {
    return InvDocListTile(
      leadingIcon: Icons.local_shipping_outlined,
      title: dn.dnNo,
      subtitle: dn.customerName,
      statusPill: InvStatusPill(status: dn.status),
      meta: [
        InvDocMeta(Icons.calendar_today_outlined, prettyShortDate(dn.dispatchDate)),
        InvDocMeta(Icons.warehouse_outlined, dn.warehouseName),
      ],
      valueLabel: '${dn.lineCount} ${dn.lineCount == 1 ? 'line' : 'lines'}',
      valueText: indianINR(dn.totalValue),
      onTap: () => context.push('/inventory/delivery/${dn.id}'),
    );
  }
}

// ── New DN sheet — barcode-driven, reskinned ─────────────────────────────

class _NewDnSheet extends ConsumerStatefulWidget {
  const _NewDnSheet();
  @override
  ConsumerState<_NewDnSheet> createState() => _NewDnSheetState();
}

class _NewDnSheetState extends ConsumerState<_NewDnSheet> {
  final _qtyCtrl = TextEditingController();
  final _batchCtrl = TextEditingController();
  final _barcodeCtrl = TextEditingController();
  String? warehouseId;
  InvItem? picked;
  bool submitting = false;

  @override
  void initState() {
    super.initState();
    _qtyCtrl.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _qtyCtrl.dispose(); _batchCtrl.dispose(); _barcodeCtrl.dispose();
    super.dispose();
  }

  Future<void> _lookupBarcode() async {
    final code = _barcodeCtrl.text.trim();
    if (code.isEmpty) return;
    final item = await inventoryRepo.findByBarcode(code);
    if (!mounted) return;
    if (item == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No item matched that barcode')),
      );
    } else {
      setState(() => picked = item);
    }
  }

  bool get _canSubmit {
    if (warehouseId == null || picked == null || submitting) return false;
    final qty = double.tryParse(_qtyCtrl.text) ?? 0;
    return qty > 0;
  }

  Future<void> _submit() async {
    if (!_canSubmit) return;
    final qty = double.parse(_qtyCtrl.text);
    setState(() => submitting = true);
    try {
      final today = DateTime.now().toIso8601String().substring(0, 10);
      final dn = await inventoryRepo.createDn(
        warehouseId: warehouseId!,
        dispatchDate: today,
        lines: [
          InvDnLineInput(
            itemId: picked!.id,
            batchNo: _batchCtrl.text.trim().isEmpty ? null : _batchCtrl.text.trim(),
            qty: qty,
          ),
        ],
      );
      await inventoryRepo.dispatchDn(dn.id);
      if (!mounted) return;
      Navigator.of(context).pop(true);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Delivery ${dn.dnNo} dispatched')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed: $e')));
    } finally {
      if (mounted) setState(() => submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final insets = MediaQuery.of(context).viewInsets;
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: EdgeInsets.only(bottom: insets.bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _SheetHeader(title: 'Dispatch Stock', onClose: () => Navigator.of(context).pop(false)),
          Flexible(
            child: SingleChildScrollView(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  _Lbl('Warehouse'),
                  WarehousePicker(
                    value: warehouseId,
                    onChanged: (id) => setState(() => warehouseId = id),
                    allowAll: false,
                    dense: true,
                  ),
                  const SizedBox(height: 14),
                  _Lbl('Barcode (scan or type)'),
                  TextField(
                    controller: _barcodeCtrl,
                    style: RunqText.body.copyWith(color: t.ink, fontSize: 14),
                    onSubmitted: (_) => _lookupBarcode(),
                    decoration: _dec(context,
                      hint: 'Scan or type barcode',
                      suffix: IconButton(
                        icon: Icon(Icons.qr_code_scanner, color: InvColors.brand(context)),
                        onPressed: _lookupBarcode,
                      ),
                    ),
                  ),
                  if (picked != null) ...[
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                      decoration: BoxDecoration(
                        color: t.bgWarmer,
                        border: Border.all(color: t.hairlineSoft),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(children: [
                        Icon(Icons.check_circle, size: 16, color: InvColors.success),
                        const SizedBox(width: 8),
                        Expanded(child: Text(picked!.name,
                            style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 14),
                            maxLines: 1, overflow: TextOverflow.ellipsis)),
                        if (picked!.sku != null)
                          Text(picked!.sku!, style: RunqText.caption.copyWith(color: t.muted)),
                      ]),
                    ),
                  ],
                  const SizedBox(height: 14),
                  _Lbl('Qty'),
                  TextField(
                    controller: _qtyCtrl,
                    style: RunqText.body.copyWith(color: t.ink, fontSize: 14),
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    decoration: _dec(context, hint: '0'),
                  ),
                  if (picked?.trackBatches ?? false) ...[
                    const SizedBox(height: 14),
                    _Lbl('Batch (blank = FEFO)'),
                    TextField(
                      controller: _batchCtrl,
                      style: RunqText.body.copyWith(color: t.ink, fontSize: 14),
                      decoration: _dec(context, hint: 'Batch number'),
                    ),
                  ],
                  const SizedBox(height: 20),
                  InvPrimaryButton(
                    label: 'Dispatch + Post',
                    icon: Icons.send,
                    busy: submitting,
                    onTap: _canSubmit ? _submit : null,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SheetHeader extends StatelessWidget {
  const _SheetHeader({required this.title, required this.onClose});
  final String title;
  final VoidCallback onClose;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const SizedBox(height: 10),
        Container(
          width: 36, height: 4,
          decoration: BoxDecoration(color: t.hairline, borderRadius: BorderRadius.circular(2)),
        ),
        const SizedBox(height: 8),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 12, 8),
          child: Row(children: [
            Expanded(child: Text(title, style: RunqText.h3.copyWith(color: t.ink))),
            Material(
              color: t.bgWarmer,
              shape: const CircleBorder(),
              child: InkWell(
                customBorder: const CircleBorder(),
                onTap: onClose,
                child: SizedBox(
                  width: 28, height: 28,
                  child: Icon(Icons.close, size: 14, color: t.muted),
                ),
              ),
            ),
          ]),
        ),
      ],
    );
  }
}

class _Lbl extends StatelessWidget {
  const _Lbl(this.label);
  final String label;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 5),
      child: Text(label.toUpperCase(),
          style: RunqText.label.copyWith(color: RT(context).muted, letterSpacing: 0.5)),
    );
  }
}

InputDecoration _dec(BuildContext context, {String? hint, Widget? suffix}) {
  final t = RT(context);
  return InputDecoration(
    hintText: hint,
    hintStyle: RunqText.body.copyWith(color: t.muted2, fontSize: 14),
    filled: true,
    fillColor: t.surface,
    isDense: true,
    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
    suffixIcon: suffix,
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(10),
      borderSide: BorderSide(color: t.hairline),
    ),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(10),
      borderSide: BorderSide(color: t.hairline),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(10),
      borderSide: BorderSide(color: InvColors.brand(context), width: 1.2),
    ),
  );
}
