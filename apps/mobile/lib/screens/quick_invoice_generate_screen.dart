import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../api/api_client.dart';
import '../api/models.dart';
import '../api/repos.dart';
import '../providers/data_providers.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../utils/format_inr.dart';
import '../widgets/invoice_success_sheet.dart';
import '../widgets/runq_snack.dart';

/// Loads a quick-invoice template, lets the user adjust per-item quantities,
/// and POSTs to /ar/quick-templates/:id/generate to create the invoice. On
/// success, navigates to the invoice detail screen.
class QuickInvoiceGenerateScreen extends ConsumerStatefulWidget {
  final String templateId;
  const QuickInvoiceGenerateScreen({super.key, required this.templateId});

  @override
  ConsumerState<QuickInvoiceGenerateScreen> createState() => _QuickInvoiceGenerateScreenState();
}

class _QuickInvoiceGenerateScreenState extends ConsumerState<QuickInvoiceGenerateScreen> {
  late Future<QuickInvoiceTemplate> _future;
  DateTime _invoiceDate = DateTime.now();
  // Per-item-id quantity override. Lazily initialized once the template loads.
  final Map<String, String> _qty = {};
  bool _qtyInit = false;
  bool _generating = false;

  @override
  void initState() {
    super.initState();
    _future = quickTemplatesRepo.get(widget.templateId);
  }

  void _ensureQty(QuickInvoiceTemplate tpl) {
    if (_qtyInit) return;
    for (final it in tpl.items) {
      _qty[it.itemId] = it.defaultQuantity > 0 ? _trim(it.defaultQuantity) : '';
    }
    _qtyInit = true;
  }

  String _trim(double v) {
    if (v == v.roundToDouble()) return v.toInt().toString();
    return v.toString();
  }

  double _qtyOf(QuickTemplateItem it) =>
      double.tryParse(_qty[it.itemId] ?? '') ?? it.defaultQuantity;

  double _landingPrice(QuickTemplateItem it) =>
      it.unitPrice * (1 + (it.taxRate ?? 0) / 100);

  double _lineAmt(QuickTemplateItem it) => _qtyOf(it) * _landingPrice(it);

  Future<void> _generate(QuickInvoiceTemplate tpl) async {
    final qtys = <String, double>{
      for (final it in tpl.items) it.itemId: _qtyOf(it),
    };
    if (qtys.values.every((v) => v <= 0)) {
      showRunqSnack(context, 'Set a quantity on at least one item.', kind: SnackKind.error);
      return;
    }
    setState(() => _generating = true);
    try {
      final res = await quickTemplatesRepo.generate(
        tpl.id,
        invoiceDate: _invoiceDate,
        quantities: qtys,
      );
      if (!mounted) return;
      ref.invalidate(invoiceSummaryProvider);
      ref.invalidate(invoicesProvider(const InvoiceFilter()));
      if (res.invoiceId.isNotEmpty) {
        await showInvoiceSuccessSheet(
          context,
          invoiceId: res.invoiceId,
          invoiceNumber: res.invoiceNumber,
        );
        // Sheet was dismissed without picking Open / View all — fall back to
        // popping the generate screen so the user lands on the templates list.
        if (mounted && context.mounted) context.pop();
      } else {
        showRunqSnack(context, 'Invoice ${res.invoiceNumber} created.');
        context.pop();
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      showRunqSnack(context, e.message, kind: SnackKind.error);
    } catch (_) {
      if (!mounted) return;
      showRunqSnack(context, 'Could not generate invoice.', kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _generating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Scaffold(
      backgroundColor: t.bgWarmer,
      appBar: AppBar(
        title: const Text('Generate invoice'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => context.pop(),
        ),
      ),
      body: FutureBuilder<QuickInvoiceTemplate>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) {
            final msg = snap.error is ApiException
                ? (snap.error as ApiException).message
                : 'Could not load template';
            return Center(child: Text(msg, style: RunqText.body.copyWith(color: RunqColors.redInk)));
          }
          final tpl = snap.data!;
          _ensureQty(tpl);
          final subtotal = tpl.items.fold<double>(0, (s, it) => s + _lineAmt(it));
          return SafeArea(
            child: ListView(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
              children: [
                _Header(template: tpl),
                const SizedBox(height: 12),
                _SectionCard(
                  title: 'Invoice date',
                  child: _DateField(
                    value: _invoiceDate,
                    onChanged: (d) => setState(() => _invoiceDate = d),
                  ),
                ),
                const SizedBox(height: 12),
                _SectionCard(
                  title: 'Items',
                  child: Column(
                    children: [
                      for (int i = 0; i < tpl.items.length; i++) ...[
                        if (i > 0) Divider(height: 16, color: t.hairlineSoft),
                        _ItemRow(
                          item: tpl.items[i],
                          quantity: _qty[tpl.items[i].itemId] ?? '',
                          onQuantityChanged: (v) => setState(() {
                            _qty[tpl.items[i].itemId] = v;
                          }),
                          landingPrice: _landingPrice(tpl.items[i]),
                          lineAmt: _lineAmt(tpl.items[i]),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                _SectionCard(
                  title: 'Total',
                  child: Row(
                    children: [
                      Expanded(
                        child: Text('Total (incl. GST)',
                            style: RunqText.bodyStrong.copyWith(color: t.ink)),
                      ),
                      Text(formatINR(subtotal),
                          style: RunqText.tabular(size: 18, w: FontWeight.w700, color: t.ink)),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                FilledButton.icon(
                  onPressed: _generating ? null : () => _generate(tpl),
                  style: FilledButton.styleFrom(
                    backgroundColor: RunqColors.indigo,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  icon: _generating
                      ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Icon(Icons.bolt_rounded, size: 18),
                  label: Text(_generating ? 'Generating…' : 'Generate invoice'),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _Header extends StatelessWidget {
  final QuickInvoiceTemplate template;
  const _Header({required this.template});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      child: Row(
        children: [
          Container(
            width: 40, height: 40,
            decoration: BoxDecoration(
              color: RunqColors.indigo.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(Icons.bolt_rounded, color: RunqColors.indigo, size: 22),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(template.name,
                    style: RunqText.bodyStrong.copyWith(color: t.ink),
                    maxLines: 1, overflow: TextOverflow.ellipsis),
                if (template.customerName != null && template.customerName!.isNotEmpty)
                  Text(template.customerName!,
                      style: RunqText.caption.copyWith(color: t.muted, fontSize: 11),
                      maxLines: 1, overflow: TextOverflow.ellipsis),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  final String title;
  final Widget child;
  const _SectionCard({required this.title, required this.child});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 13)),
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }
}

class _DateField extends StatelessWidget {
  final DateTime value;
  final ValueChanged<DateTime> onChanged;
  const _DateField({required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final text = '${value.day.toString().padLeft(2, '0')}/${value.month.toString().padLeft(2, '0')}/${value.year}';
    return InkWell(
      onTap: () async {
        final picked = await showDatePicker(
          context: context,
          initialDate: value,
          firstDate: DateTime(2020),
          lastDate: DateTime(2100),
        );
        if (picked != null) onChanged(picked);
      },
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          color: t.inputFill,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: t.hairline, width: 0.5),
        ),
        child: Row(
          children: [
            Icon(Icons.calendar_today_rounded, size: 14, color: t.muted),
            const SizedBox(width: 8),
            Text(text, style: RunqText.body.copyWith(color: t.ink)),
          ],
        ),
      ),
    );
  }
}

class _ItemRow extends StatelessWidget {
  final QuickTemplateItem item;
  final String quantity;
  final ValueChanged<String> onQuantityChanged;
  final double landingPrice, lineAmt;
  const _ItemRow({
    required this.item,
    required this.quantity,
    required this.onQuantityChanged,
    required this.landingPrice,
    required this.lineAmt,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(item.description,
            style: RunqText.bodyStrong.copyWith(color: t.ink),
            maxLines: 2, overflow: TextOverflow.ellipsis),
        const SizedBox(height: 2),
        Text(
          '${formatINR(landingPrice)} per unit · ${(item.taxRate ?? 0).toStringAsFixed(0)}% GST',
          style: RunqText.caption.copyWith(color: t.muted, fontSize: 11),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            SizedBox(
              width: 96,
              child: TextFormField(
                initialValue: quantity,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
                onChanged: onQuantityChanged,
                decoration: InputDecoration(
                  isDense: true,
                  filled: true,
                  fillColor: t.inputFill,
                  hintText: 'Qty',
                  hintStyle: RunqText.body.copyWith(color: t.muted),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: BorderSide(color: t.hairline, width: 0.5),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: BorderSide(color: t.hairline, width: 0.5),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: const BorderSide(color: RunqColors.indigo, width: 1),
                  ),
                ),
              ),
            ),
            const Spacer(),
            Text(formatINR(lineAmt),
                style: RunqText.tabular(size: 14, w: FontWeight.w700, color: t.ink)),
          ],
        ),
      ],
    );
  }
}
