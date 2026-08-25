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

  Future<void> _delete(Bom bom) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete this BOM permanently?'),
        content: Text(
          '${bom.bomCode} and its input lines will be removed. If any work '
          'orders reference this BOM, deletion is blocked — deactivate it '
          'instead to preserve audit history.',
          style: RunqText.body,
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text('Delete', style: TextStyle(color: MfgColors.error)),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _busy = true);
    try {
      await manufacturingRepo.deleteBom(widget.bomId);
      ref.invalidate(bomListProvider);
      if (mounted) {
        showRunqSnack(context, 'BOM ${bom.bomCode} deleted', kind: SnackKind.success);
        context.go('/manufacturing/boms');
      }
    } catch (e) {
      // The 409 body carries the "used by N work order(s)" guidance.
      if (mounted) showRunqSnack(context, e.toString(), kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Single entry point for every BOM action — keeps the detail screen chrome
  /// to one button instead of an app-bar icon row plus a footer.
  Future<void> _showActions(Bom bom) async {
    final action = await showModalBottomSheet<_BomAction>(
      context: context,
      backgroundColor: RT(context).surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (_) => _BomActionsSheet(bom: bom),
    );
    if (action == null || !mounted) return;
    switch (action) {
      case _BomAction.edit:
        context.push('/manufacturing/boms/${bom.id}/edit');
      case _BomAction.clone:
        await _clone(bom);
      case _BomAction.activate:
        await _activate();
      case _BomAction.deactivate:
        await _deactivate();
      case _BomAction.delete:
        await _delete(bom);
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
                    icon: const Icon(Icons.more_vert_rounded, size: 20),
                    tooltip: 'Actions',
                    onPressed: _busy ? null : () => _showActions(bom),
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
                  // No footer bar — actions live in the app-bar overflow — so
                  // the list only needs enough tail room to clear the home
                  // indicator.
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
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
                          if (bom.allowAutoRepack) ...[
                            Divider(color: t.hairline, height: 1),
                            const _InfoRow(
                              label: 'Made on demand',
                              value: 'Yes — run at dispatch, no stock held',
                            ),
                          ],
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
          ],
        ),
      ),
    );
  }

  static String _qty(double v) =>
      v == v.truncateToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(3);
}

enum _BomAction { edit, clone, activate, deactivate, delete }

/// Overflow sheet for BOM actions — same shape as the invoice detail sheet
/// (grab handle, icon + label + one-line why) so the app reads consistently.
class _BomActionsSheet extends StatelessWidget {
  final Bom bom;
  const _BomActionsSheet({required this.bom});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(8, 8, 8, 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40,
              height: 4,
              margin: const EdgeInsets.only(bottom: 12),
              decoration: BoxDecoration(
                color: t.hairline,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            _SheetItem(
              icon: Icons.edit_outlined,
              label: 'Edit BOM',
              subtitle: 'Change output, inputs, quantities',
              onTap: () => Navigator.pop(context, _BomAction.edit),
            ),
            _SheetItem(
              icon: Icons.copy_outlined,
              label: 'Clone BOM',
              subtitle: 'Start a new recipe from this one',
              onTap: () => Navigator.pop(context, _BomAction.clone),
            ),
            if (bom.isActive)
              _SheetItem(
                icon: Icons.pause_circle_outline_rounded,
                label: 'Deactivate BOM',
                subtitle: 'Hide from new work orders — history is kept',
                onTap: () => Navigator.pop(context, _BomAction.deactivate),
              )
            else
              _SheetItem(
                icon: Icons.play_circle_outline_rounded,
                label: 'Activate BOM',
                subtitle: 'Make this the active recipe for its output item',
                onTap: () => Navigator.pop(context, _BomAction.activate),
              ),
            _SheetItem(
              icon: Icons.delete_outline_rounded,
              label: 'Delete BOM',
              subtitle: 'Permanently remove — blocked if work orders use it',
              onTap: () => Navigator.pop(context, _BomAction.delete),
              destructive: true,
            ),
          ],
        ),
      ),
    );
  }
}

class _SheetItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final String? subtitle;
  final VoidCallback onTap;
  final bool destructive;
  const _SheetItem({
    required this.icon,
    required this.label,
    this.subtitle,
    required this.onTap,
    this.destructive = false,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final fg = destructive ? MfgColors.error : t.ink;
    // Each action sits on its own tinted tile so the sheet reads as a list of
    // targets rather than one undivided block. Destructive picks up the error
    // wash; the rest use the warm surface that cards use elsewhere.
    final tileBg = destructive ? MfgColors.errorBg : t.bgWarm;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      child: Material(
        color: tileBg,
        borderRadius: BorderRadius.circular(12),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
            child: Row(
              children: [
                Icon(icon, color: fg, size: 22),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(label,
                          style: RunqText.body
                              .copyWith(color: fg, fontWeight: FontWeight.w600)),
                      if (subtitle != null) ...[
                        const SizedBox(height: 2),
                        Text(subtitle!,
                            style: RunqText.caption.copyWith(color: t.muted)),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
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
                '${line.isOptional ? ' · optional' : ''}'
                '${line.substitutes.isEmpty ? '' : ' · or ${line.substitutes.map((s) => s.itemName).join(' / ')}'}',
                style: RunqText.caption.copyWith(color: t.muted),
              ),
            ],
          ),
        ),
      ],
    );
  }

  static String _qty(double v) =>
      v == v.truncateToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(3);
}
