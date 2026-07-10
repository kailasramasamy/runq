import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../api/models.dart';
import '../api/repos.dart';
import '../providers/data_providers.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../widgets/async_slot.dart';
import '../widgets/runq_card.dart';
import '../widgets/runq_snack.dart';
import 'gst/gst_auth_sheet.dart';
import 'gst/gst_status_chip.dart';

class GstReturnsScreen extends ConsumerStatefulWidget {
  const GstReturnsScreen({super.key});

  @override
  ConsumerState<GstReturnsScreen> createState() => _GstReturnsScreenState();
}

class _GstReturnsScreenState extends ConsumerState<GstReturnsScreen> {
  String _typeFilter = 'all'; // all | gstr1 | gstr3b
  bool _busy = false;

  Future<void> _refresh() async {
    ref.invalidate(gstReturnsProvider);
    await ref.read(gstReturnsProvider.future).catchError((_) => throw 0);
  }

  Future<void> _generate(String type) async {
    final period = await _pickPeriod(context);
    if (period == null || !mounted) return;
    setState(() => _busy = true);
    try {
      final ret = type == 'gstr3b'
          ? await gstRepo.generateGstr3b(period)
          : await gstRepo.generateGstr1(period);
      if (!mounted) return;
      ref.invalidate(gstReturnsProvider);
      showRunqSnack(context,
          '${type == 'gstr3b' ? 'GSTR-3B' : 'GSTR-1'} draft generated',
          kind: SnackKind.success);
      context.push('/gst/returns/${ret.id}');
    } catch (e) {
      if (!mounted) return;
      showRunqSnack(context, friendlyGstError(e, "Couldn't generate the draft."),
          kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final all = ref.watch(gstReturnsProvider);

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          color: t.brand,
          onRefresh: _refresh,
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
            slivers: [
              SliverToBoxAdapter(child: _Header(busy: _busy, onGenerate: _generate)),
              SliverToBoxAdapter(
                child: _TypeFilter(
                  value: _typeFilter,
                  onChange: (v) => setState(() => _typeFilter = v),
                ),
              ),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 120),
                sliver: SliverToBoxAdapter(
                  child: AsyncSlot<List<GstReturn>>(
                    value: all,
                    onRetry: () => ref.invalidate(gstReturnsProvider),
                    data: (list) {
                      final filtered = _typeFilter == 'all'
                          ? list
                          : list.where((r) => r.returnType == _typeFilter).toList();
                      if (filtered.isEmpty) {
                        return const RunqCard(
                          child: EmptyState(
                            icon: Icons.history_rounded,
                            title: 'No returns yet',
                            subtitle: 'Tap "Generate" to create a GSTR-1 or 3B draft for the period.',
                          ),
                        );
                      }
                      return RunqCard(
                        padding: EdgeInsets.zero,
                        child: Column(
                          children: [
                            for (var i = 0; i < filtered.length; i++) ...[
                              _Row(ret: filtered[i]),
                              if (i < filtered.length - 1)
                                Divider(height: 1, thickness: 0.6, color: t.hairline),
                            ],
                          ],
                        ),
                      );
                    },
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  final bool busy;
  final void Function(String type) onGenerate;
  const _Header({required this.busy, required this.onGenerate});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 12, 16, 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          IconButton(
            onPressed: () => Navigator.of(context).pop(),
            icon: Icon(Icons.arrow_back_rounded, color: t.ink),
          ),
          const SizedBox(width: 4),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('Filings', style: RunqText.body.copyWith(color: t.muted)),
                Text('Returns', style: RunqText.h2.copyWith(color: t.ink)),
              ],
            ),
          ),
          Material(
            color: RunqColors.indigo,
            borderRadius: BorderRadius.circular(999),
            child: InkWell(
              borderRadius: BorderRadius.circular(999),
              onTap: busy
                  ? null
                  : () async {
                      final picked = await _pickGenerateType(context);
                      if (picked != null) onGenerate(picked);
                    },
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                child: busy
                    ? const SizedBox(
                        width: 16, height: 16,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white),
                      )
                    : Text('Generate',
                        style: RunqText.body
                            .copyWith(color: Colors.white)),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TypeFilter extends StatelessWidget {
  final String value;
  final ValueChanged<String> onChange;
  const _TypeFilter({required this.value, required this.onChange});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
      child: SizedBox(
        height: 36,
        child: ListView(
          scrollDirection: Axis.horizontal,
          children: [
            _Pill(label: 'All', active: value == 'all', onTap: () => onChange('all')),
            const SizedBox(width: 8),
            _Pill(label: 'GSTR-1', active: value == 'gstr1', onTap: () => onChange('gstr1')),
            const SizedBox(width: 8),
            _Pill(label: 'GSTR-3B', active: value == 'gstr3b', onTap: () => onChange('gstr3b')),
          ],
        ),
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  final String label;
  final bool active;
  final VoidCallback onTap;
  const _Pill({required this.label, required this.active, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: active ? RunqColors.indigo : t.surface,
            border: Border.all(
              color: active ? RunqColors.indigo : t.hairline,
              width: 0.5,
            ),
            borderRadius: BorderRadius.circular(999),
          ),
          alignment: Alignment.center,
          child: Text(
            label,
            style: RunqText.body.copyWith(
              color: active ? Colors.white : t.ink,
            ),
          ),
        ),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  final GstReturn ret;
  const _Row({required this.ret});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final type = ret.returnType == 'gstr3b' ? 'GSTR-3B' : 'GSTR-1';
    return InkWell(
      onTap: () => context.push('/gst/returns/${ret.id}'),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('$type · ${ret.periodLabel}',
                      style: RunqText.bodyStrong.copyWith(color: t.ink)),
                  const SizedBox(height: 2),
                  Text(
                    ret.arn != null && ret.arn!.isNotEmpty
                        ? 'ARN ${ret.arn}'
                        : ret.gstin,
                    style: RunqText.caption.copyWith(color: t.muted2),
                    maxLines: 1, overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            GstStatusChip(status: ret.status),
            const SizedBox(width: 4),
            Icon(Icons.chevron_right_rounded, color: t.muted2, size: 20),
          ],
        ),
      ),
    );
  }
}

Future<String?> _pickGenerateType(BuildContext context) async {
  final t = RT(context);
  return showModalBottomSheet<String>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (_) => GstSheetShell(
      padding: const EdgeInsets.fromLTRB(8, 12, 8, 12),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
            child: Text('Generate draft', style: RunqText.h4.copyWith(color: t.ink)),
          ),
          _GenerateTile(
            icon: Icons.description_outlined,
            tint: RunqColors.indigo,
            title: 'GSTR-1',
            subtitle: 'Outward supplies — invoices, B2B, B2C, HSN summary',
            onTap: () => Navigator.pop(context, 'gstr1'),
          ),
          _GenerateTile(
            icon: Icons.account_balance_wallet_outlined,
            tint: RunqColors.greenInk,
            title: 'GSTR-3B',
            subtitle: 'Summary return — tax payable, ITC, net liability',
            onTap: () => Navigator.pop(context, 'gstr3b'),
          ),
        ],
      ),
    ),
  );
}

class _GenerateTile extends StatelessWidget {
  final IconData icon;
  final Color tint;
  final String title, subtitle;
  final VoidCallback onTap;
  const _GenerateTile({
    required this.icon,
    required this.tint,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        child: Row(
          children: [
            Container(
              width: 40, height: 40,
              decoration: BoxDecoration(
                color: tint.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, color: tint, size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      style: RunqText.bodyStrong.copyWith(color: t.ink)),
                  const SizedBox(height: 2),
                  Text(subtitle,
                      style: RunqText.caption
                          .copyWith(color: t.muted)),
                ],
              ),
            ),
            Icon(Icons.chevron_right_rounded, color: t.muted2),
          ],
        ),
      ),
    );
  }
}

Future<String?> _pickPeriod(BuildContext context) async {
  final t = RT(context);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  final now = DateTime.now();
  final options = <({String value, String label})>[];
  for (int i = 0; i < 12; i++) {
    final d = DateTime(now.year, now.month - i, 1);
    final mm = d.month.toString().padLeft(2, '0');
    options.add((value: '$mm${d.year}', label: '${months[d.month - 1]} ${d.year}'));
  }
  return showModalBottomSheet<String>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (_) => GstSheetShell(
      padding: const EdgeInsets.fromLTRB(8, 12, 8, 8),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 4),
            child: Text('Select period', style: RunqText.h4.copyWith(color: t.ink)),
          ),
          for (final o in options)
            ListTile(
              dense: true,
              title: Text(o.label, style: RunqText.body.copyWith(color: t.ink)),
              onTap: () => Navigator.of(context).pop(o.value),
            ),
        ],
      ),
    ),
  );
}
