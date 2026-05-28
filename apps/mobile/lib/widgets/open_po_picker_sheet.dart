import 'package:flutter/material.dart';

import '../api/purchase_models.dart';
import '../api/purchase_repo.dart';
import '../screens/purchase/widgets/pur_colors.dart';
import '../screens/purchase/widgets/pur_primitives.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';

/// Bottom-sheet picker for the share-intake "Receive against PO" flow.
/// Lists POs whose status is `sent` or `partially_received` (i.e. open
/// and able to accept a GRN) and returns the picked PO id.
Future<String?> showOpenPoPickerSheet(BuildContext context) {
  return showModalBottomSheet<String>(
    context: context,
    backgroundColor: RT(context).surface,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
    ),
    builder: (_) => const _Sheet(),
  );
}

class _Sheet extends StatefulWidget {
  const _Sheet();

  @override
  State<_Sheet> createState() => _SheetState();
}

class _SheetState extends State<_Sheet> {
  List<PurchaseOrder>? _pos;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final res = await purchaseRepo.listPOs(status: 'sent,partially_received');
      if (!mounted) return;
      setState(() => _pos = res.data);
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final maxHeight = MediaQuery.of(context).size.height * 0.7;
    return ConstrainedBox(
      constraints: BoxConstraints(maxHeight: maxHeight),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40, height: 4,
              margin: const EdgeInsets.symmetric(vertical: 10),
              decoration: BoxDecoration(
                color: t.hairline,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 2, 16, 4),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text('Pick an open PO',
                    style: RunqText.h3.copyWith(
                        color: t.ink, fontWeight: FontWeight.w700)),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'Only POs awaiting receipt are listed.',
                  style: RunqText.caption.copyWith(color: t.muted),
                ),
              ),
            ),
            Flexible(child: _buildBody(t)),
          ],
        ),
      ),
    );
  }

  Widget _buildBody(RunqTokens t) {
    if (_error != null) {
      return Padding(
        padding: const EdgeInsets.all(24),
        child: Text('Could not load POs: $_error',
            style: RunqText.caption.copyWith(color: PurColors.error)),
      );
    }
    final list = _pos;
    if (list == null) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 40),
        child: Center(child: CircularProgressIndicator()),
      );
    }
    if (list.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 40),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.inbox_outlined, size: 36, color: t.muted2),
            const SizedBox(height: 8),
            Text('No open POs',
                style: RunqText.bodyStrong.copyWith(color: t.ink)),
            const SizedBox(height: 4),
            Text(
              'Create a PO and mark it sent before receiving against it.',
              textAlign: TextAlign.center,
              style: RunqText.caption.copyWith(color: t.muted),
            ),
          ],
        ),
      );
    }
    return ListView.separated(
      shrinkWrap: true,
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
      itemCount: list.length,
      separatorBuilder: (_, __) => const SizedBox(height: 6),
      itemBuilder: (_, i) => _PoRow(po: list[i], onTap: () {
        Navigator.of(context).pop(list[i].id);
      }),
    );
  }
}

class _PoRow extends StatelessWidget {
  final PurchaseOrder po;
  final VoidCallback onTap;
  const _PoRow({required this.po, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = PurColors.brand(context);
    return Material(
      color: t.surface,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.fromLTRB(12, 10, 10, 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: t.hairline),
          ),
          child: Row(
            children: [
              Container(
                width: 36, height: 36,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: PurColors.violetSubtle,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(Icons.shopping_cart_outlined,
                    size: 18, color: brand),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(po.poNumber,
                              style: RunqText.bodyStrong.copyWith(color: t.ink),
                              maxLines: 1, overflow: TextOverflow.ellipsis),
                        ),
                        PurStatusPill(status: po.status),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${po.vendorName} · ${prettyShortDate(po.poDate)}',
                      style: RunqText.caption.copyWith(color: t.muted),
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Text(indianINR(po.total, decimals: 0),
                  style: RunqText.bodyStrong.copyWith(color: t.ink)),
              Icon(Icons.chevron_right_rounded, size: 18, color: t.muted2),
            ],
          ),
        ),
      ),
    );
  }
}
