import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/manufacturing_models.dart';
import '../../providers/manufacturing_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/mfg_colors.dart';
import 'widgets/mfg_doc_list.dart';
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
                error: (e, _) => Center(
                  child: Text('Failed to load: $e', style: RunqText.body),
                ),
                data: (res) {
                  if (res.data.isEmpty) {
                    return MfgEmptyState(
                      icon: Icons.precision_manufacturing_outlined,
                      title: 'No work orders yet',
                      description: 'Create your first WO to schedule a run.',
                    );
                  }
                  // A card per day under its own header. Inside a day the
                  // date block would repeat down every row, so the leading
                  // block carries the shift instead — which is what actually
                  // separates one run from the next within a date.
                  final days = _groupByDay(res.data);
                  return RefreshIndicator(
                    onRefresh: () async =>
                        ref.invalidate(workOrderListProvider(params)),
                    child: ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      keyboardDismissBehavior:
                          ScrollViewKeyboardDismissBehavior.onDrag,
                      padding: const EdgeInsets.fromLTRB(0, 0, 0, 80),
                      children: [
                        for (final day in days.entries) ...[
                          MfgSectionHeader(
                            label: _dayLabel(day.key),
                            trailing: Text(
                              day.value.length == 1
                                  ? '1 run'
                                  : '${day.value.length} runs',
                              style: RunqText.caption.copyWith(color: t.muted2),
                            ),
                          ),
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            child: MfgDividedCard(
                              children: [
                                for (final wo in day.value) _WoTile(wo: wo),
                              ],
                            ),
                          ),
                          const SizedBox(height: 16),
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

/// Rows keyed by their scheduled day, in the order the API returned them —
/// grouping must not re-sort a list the server already ordered.
Map<String, List<WorkOrderListRow>> _groupByDay(List<WorkOrderListRow> rows) {
  final out = <String, List<WorkOrderListRow>>{};
  for (final wo in rows) {
    out.putIfAbsent(wo.scheduledFor, () => []).add(wo);
  }
  return out;
}

/// "Today" / "Yesterday" beat a date the reader has to decode against today.
String _dayLabel(String iso) {
  final dt = DateTime.tryParse(iso);
  if (dt == null) return iso;
  final now = DateTime.now();
  final days = DateTime(
    dt.year,
    dt.month,
    dt.day,
  ).difference(DateTime(now.year, now.month, now.day)).inDays;
  if (days == 0) return 'Today';
  if (days == -1) return 'Yesterday';
  if (days == 1) return 'Tomorrow';
  return mfgPrettyDate(iso);
}

class _WoTile extends StatelessWidget {
  final WorkOrderListRow wo;
  const _WoTile({required this.wo});

  @override
  Widget build(BuildContext context) {
    return MfgDocListTile(
      flat: true,
      icon: Icons.precision_manufacturing_outlined,
      leadingDate: wo.scheduledFor,
      leadingShift: wo.shift,
      title: wo.woNumber,
      subtitle: '${wo.bomCode} v${wo.bomVersion}',
      status: wo.status,
      headline: wo.outputItemName,
      rightValue: _qty(wo.plannedQty),
      rightUnit: wo.outputUom,
      reference: wo.woNumber,
      // Two different off-plan runs, and they need different reactions: an
      // unplanned entry has a person behind it a manager may want to ask
      // about, a repack has nobody — dispatch made it to cover a delivery.
      tag: switch (wo.entryMode) {
        'unplanned' => (label: 'UNPLANNED', colour: MfgColors.orangeAlert),
        'auto_repack' => (label: 'REPACK', colour: MfgColors.info),
        _ => null,
      },
      metaLine: wo.warehouseName,
      onTap: () => context.push('/manufacturing/wos/${wo.id}'),
    );
  }

  static String _qty(double v) =>
      v == v.truncateToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(3);
}
