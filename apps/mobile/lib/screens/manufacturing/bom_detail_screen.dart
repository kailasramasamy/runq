import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/manufacturing_models.dart';
import '../../api/manufacturing_repo.dart';
import '../../providers/manufacturing_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart';
import 'widgets/mfg_colors.dart';
import 'widgets/mfg_primitives.dart';

class BomDetailScreen extends ConsumerStatefulWidget {
  final String bomId;
  const BomDetailScreen({super.key, required this.bomId});

  @override
  ConsumerState<BomDetailScreen> createState() => _BomDetailScreenState();
}

class _BomDetailScreenState extends ConsumerState<BomDetailScreen> {
  bool _busy = false;

  Future<void> _activate() async {
    setState(() => _busy = true);
    try {
      await manufacturingRepo.activateBom(widget.bomId);
      ref.invalidate(bomDetailProvider(widget.bomId));
      ref.invalidate(bomListProvider);
      if (mounted) showRunqSnack(context, 'BOM activated', kind: SnackKind.success);
    } catch (e) {
      if (mounted) showRunqSnack(context, e.toString(), kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _deactivate() async {
    setState(() => _busy = true);
    try {
      await manufacturingRepo.deactivateBom(widget.bomId);
      ref.invalidate(bomDetailProvider(widget.bomId));
      ref.invalidate(bomListProvider);
      if (mounted) showRunqSnack(context, 'BOM deactivated', kind: SnackKind.success);
    } catch (e) {
      if (mounted) showRunqSnack(context, e.toString(), kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _clone(Bom bom) async {
    final ctrl = TextEditingController(text: '${bom.bomCode}-v${bom.version + 1}');
    final newCode = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Clone BOM'),
        content: TextField(
          controller: ctrl,
          textCapitalization: TextCapitalization.none,
          decoration: const InputDecoration(labelText: 'New BOM code'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, ctrl.text.trim()),
            child: const Text('Clone'),
          ),
        ],
      ),
    );
    ctrl.dispose();
    if (newCode == null || newCode.isEmpty || !mounted) return;
    setState(() => _busy = true);
    try {
      final cloned = await manufacturingRepo.cloneBom(widget.bomId, newCode);
      ref.invalidate(bomListProvider);
      if (mounted) {
        showRunqSnack(context, 'Cloned as ${cloned.bomCode}', kind: SnackKind.success);
        context.push('/manufacturing/boms/${cloned.id}');
      }
    } catch (e) {
      if (mounted) showRunqSnack(context, e.toString(), kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final bomAsync = ref.watch(bomDetailProvider(widget.bomId));

    return Scaffold(
      backgroundColor: t.bgWarm,
      body: bomAsync.when(
        loading: () => const Scaffold(body: Center(child: CircularProgressIndicator())),
        error: (e, _) => Scaffold(
          body: Center(child: Text('Failed to load: $e', style: RunqText.body)),
        ),
        data: (bom) => Column(
          children: [
            SafeArea(
              bottom: false,
              child: MfgPlainAppBar(
                title: bom.bomCode,
                actions: [
                  IconButton(
                    icon: const Icon(Icons.edit_outlined, size: 20),
                    onPressed: _busy
                        ? null
                        : () => context.push('/manufacturing/boms/${bom.id}/edit'),
                  ),
                ],
              ),
            ),
            Expanded(
              child: RefreshIndicator(
                onRefresh: () async => ref.invalidate(bomDetailProvider(widget.bomId)),
                child: ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 120),
                  children: [
                    // Header pill
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                          decoration: BoxDecoration(
                            color: MfgColors.roseSubtle,
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.factory_outlined,
                                  size: 14, color: MfgColors.brand(context)),
                              const SizedBox(width: 6),
                              Text(
                                bom.outputItemName,
                                style: RunqText.bodyStrong.copyWith(
                                    color: MfgColors.brand(context)),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        MfgBomStatusPill(isActive: bom.isActive),
                      ],
                    ),
                    const SizedBox(height: 16),
                    // Info card
                    MfgCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('BOM Info', style: RunqText.label),
                          const SizedBox(height: 10),
                          // Hairline between each row gives the info card the
                          // same scannable feel as the Input Lines card below.
                          _InfoRow(label: 'Name', value: bom.name),
                          Divider(color: t.hairline, height: 1),
                          _InfoRow(label: 'Code', value: bom.bomCode),
                          Divider(color: t.hairline, height: 1),
                          _InfoRow(label: 'Version', value: 'v${bom.version}'),
                          Divider(color: t.hairline, height: 1),
                          _InfoRow(
                            // "1 × 500ml" reads cleaner than "1 500ml" —
                            // makes the qty × pack-size relationship obvious.
                            label: 'Output',
                            value: '${_qty(bom.outputQty)} × ${bom.outputUom}',
                          ),
                          if (bom.effectiveFrom != null) ...[
                            Divider(color: t.hairline, height: 1),
                            _InfoRow(
                              label: 'Effective',
                              value: mfgPrettyDate(bom.effectiveFrom!),
                            ),
                          ],
                          if (bom.notes != null && bom.notes!.isNotEmpty) ...[
                            Divider(color: t.hairline, height: 1),
                            _InfoRow(label: 'Notes', value: bom.notes!),
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    // Lines card
                    MfgCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Text('Input Lines', style: RunqText.label),
                              const Spacer(),
                              Text(
                                '${bom.lines.length} input${bom.lines.length == 1 ? '' : 's'}',
                                style: RunqText.caption.copyWith(color: t.muted),
                              ),
                            ],
                          ),
                          if (bom.lines.isEmpty) ...[
                            const SizedBox(height: 12),
                            Text('No input lines defined.',
                                style: RunqText.caption.copyWith(color: t.muted)),
                          ] else ...[
                            const SizedBox(height: 10),
                            for (final line in bom.lines) ...[
                              _BomLineRow(line: line),
                              if (line != bom.lines.last)
                                Divider(color: t.hairline, height: 16),
                            ],
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            // Bottom action bar. The white background extends through the
            // home-indicator inset so the empty strip below the buttons is
            // white too — bgWarm peeking through there made the bar look
            // like it was floating on a cream stripe.
            Container(
              decoration: BoxDecoration(
                color: t.surface,
                border: Border(top: BorderSide(color: t.hairline)),
              ),
              // Flat 32px breathing room top + bottom; no SafeArea wrap so
              // the white background extends edge-to-edge under the buttons.
              padding: const EdgeInsets.fromLTRB(16, 32, 16, 32),
              child: Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: _busy ? null : () => _clone(bom),
                        icon: const Icon(Icons.copy_outlined, size: 16),
                        label: const Text('Clone'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: MfgColors.brand(context),
                          side: BorderSide(color: MfgColors.brand(context)),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      flex: 2,
                      child: MfgPrimaryButton(
                        label: bom.isActive ? 'Deactivate' : 'Activate',
                        loading: _busy,
                        onPressed: bom.isActive ? _deactivate : _activate,
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  static String _qty(double v) =>
      v == v.truncateToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(3);
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;
  const _InfoRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 88,
            child: Text(label, style: RunqText.caption.copyWith(color: t.muted)),
          ),
          Expanded(
            child: Text(value, style: RunqText.body.copyWith(color: t.ink)),
          ),
        ],
      ),
    );
  }
}

class _BomLineRow extends StatelessWidget {
  final BomLine line;
  const _BomLineRow({required this.line});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 24, height: 24,
          decoration: BoxDecoration(
            color: MfgColors.roseSubtle,
            shape: BoxShape.circle,
          ),
          alignment: Alignment.center,
          child: Text(
            '${line.lineNo}',
            style: RunqText.micro.copyWith(
              color: MfgColors.brand(context),
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(line.inputItemName, style: RunqText.bodyStrong.copyWith(color: t.ink)),
              const SizedBox(height: 2),
              Text(
                '${_qty(line.qtyPerOutput)} x ${line.inputUom} per output'
                '${line.scrapPct > 0 ? ' · ${line.scrapPct.toStringAsFixed(1)}% scrap' : ''}'
                '${line.isOptional ? ' · optional' : ''}',
                style: RunqText.caption.copyWith(color: t.muted),
              ),
            ],
          ),
        ),
      ],
    );
  }

  static String _qty(double v) =>
      v == v.truncateToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(4);
}
