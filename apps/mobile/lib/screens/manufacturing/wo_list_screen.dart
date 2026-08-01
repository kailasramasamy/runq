import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/manufacturing_models.dart';
import '../../providers/manufacturing_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/mfg_primitives.dart';

const _woTabs = <({String? key, String label})>[
  (key: null, label: 'All'),
  (key: 'draft', label: 'Draft'),
  (key: 'in_progress', label: 'In Progress'),
  (key: 'completed', label: 'Completed'),
  (key: 'closed', label: 'Closed'),
  (key: 'cancelled', label: 'Cancelled'),
];

class WoListScreen extends ConsumerStatefulWidget {
  /// Pre-filter — set from the router's queryParameters for deep-links.
  final String? initialStatus;
  final String? initialScheduledFrom;
  final String? initialScheduledTo;
  const WoListScreen({
    super.key,
    this.initialStatus,
    this.initialScheduledFrom,
    this.initialScheduledTo,
  });

  @override
  ConsumerState<WoListScreen> createState() => _WoListScreenState();
}

class _WoListScreenState extends ConsumerState<WoListScreen> {
  final _searchCtl = TextEditingController();
  late String? _statusKey;
  late String? _scheduledFrom;
  late String? _scheduledTo;
  String _search = '';

  @override
  void initState() {
    super.initState();
    _statusKey = widget.initialStatus;
    _scheduledFrom = widget.initialScheduledFrom;
    _scheduledTo = widget.initialScheduledTo;
  }

  @override
  void dispose() {
    _searchCtl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final params = WoListParams(
      status: _statusKey,
      search: _search.isEmpty ? null : _search,
      scheduledFrom: _scheduledFrom,
      scheduledTo: _scheduledTo,
    );
    final listAsync = ref.watch(workOrderListProvider(params));

    return Scaffold(
      backgroundColor: t.bgWarm,
      body: SafeArea(
        child: Column(
          children: [
            MfgPlainAppBar(title: 'Work Orders', showBack: false),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 14),
              child: MfgSearchBar(
                controller: _searchCtl,
                placeholder: 'Search product, WO # or BOM…',
                onChanged: (v) => setState(() => _search = v),
              ),
            ),
            SizedBox(
              height: 38,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                itemCount: _woTabs.length,
                separatorBuilder: (_, __) => const SizedBox(width: 6),
                itemBuilder: (_, i) => MfgFilterPill(
                  label: _woTabs[i].label,
                  active: _statusKey == _woTabs[i].key,
                  onTap: () => setState(() {
                    _statusKey = _woTabs[i].key;
                    _scheduledFrom = null;
                    _scheduledTo = null;
                  }),
                ),
              ),
            ),
            const SizedBox(height: 18),
            Expanded(
              child: listAsync.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) =>
                    Center(child: Text('Failed to load: $e', style: RunqText.body)),
                data: (res) {
                  if (res.data.isEmpty) {
                    return MfgEmptyState(
                      icon: Icons.precision_manufacturing_outlined,
                      title: 'No work orders yet',
                      description: 'Create your first WO to schedule a run.',
                    );
                  }
                  // Grouped by scheduled date: a plant runs many WOs a day, and
                  // an undated stream gives no sense of which day's schedule you
                  // are looking at. Server order is preserved within each day.
                  final byDay = <String, List<WorkOrderListRow>>{};
                  for (final wo in res.data) {
                    byDay.putIfAbsent(wo.scheduledFor, () => []).add(wo);
                  }
                  return RefreshIndicator(
                    onRefresh: () async =>
                        ref.invalidate(workOrderListProvider(params)),
                    child: ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      keyboardDismissBehavior:
                          ScrollViewKeyboardDismissBehavior.onDrag,
                      padding: const EdgeInsets.fromLTRB(16, 4, 16, 80),
                      children: [
                        for (final entry in byDay.entries) ...[
                          _DayHeader(date: entry.key, count: entry.value.length),
                          for (final wo in entry.value) ...[
                            _WoTile(wo: wo),
                            const SizedBox(height: 14),
                          ],
                          const SizedBox(height: 8),
                        ],
                      ],
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _WoTile extends StatelessWidget {
  final WorkOrderListRow wo;
  const _WoTile({required this.wo});

  @override
  Widget build(BuildContext context) {
    return MfgDocListTile(
      icon: Icons.precision_manufacturing_outlined,
      title: wo.woNumber,
      subtitle: '${wo.bomCode} v${wo.bomVersion}',
      status: wo.status,
      headline: wo.outputItemName,
      rightValue: _qty(wo.plannedQty),
      rightUnit: wo.outputUom,
      reference: wo.woNumber,
      metaLine: [
        if (wo.shift != null && wo.shift!.isNotEmpty) wo.shift!,
        wo.warehouseName,
      ].join(' · '),
      onTap: () => context.push('/manufacturing/wos/${wo.id}'),
    );
  }

  static String _qty(double v) =>
      v == v.truncateToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(3);
}


/// Date band above each day's work orders, with the day's run count.
class _DayHeader extends StatelessWidget {
  const _DayHeader({required this.date, required this.count});
  final String date;
  final int count;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(children: [
        Text(mfgPrettyDate(date),
            style: RunqText.label.copyWith(color: t.ink, fontWeight: FontWeight.w700)),
        const SizedBox(width: 10),
        Expanded(child: Divider(color: t.hairline, height: 1)),
        const SizedBox(width: 10),
        Text('$count run${count == 1 ? '' : 's'}',
            style: RunqText.caption.copyWith(color: t.muted)),
      ]),
    );
  }
}
