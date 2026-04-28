import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../api/models.dart';
import '../api/repos.dart';
import '../providers/data_providers.dart';
import '../theme/runq_tokens.dart';
import '../theme/runq_theme.dart';
import '../utils/format_inr.dart';
import '../widgets/async_slot.dart';
import '../widgets/runq_card.dart';
import 'dashboard/activity_spec.dart';

final _allActivityProvider = FutureProvider<List<ActivityEntry>>((ref) async {
  ref.watch(activityProvider); // refresh together with the dashboard widget
  return dashboardRepo.activity(limit: 100);
});

class ActivityScreen extends ConsumerWidget {
  const ActivityScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(_allActivityProvider);
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            _Header(),
            Expanded(
              child: RefreshIndicator(
                color: RunqColors.indigo,
                onRefresh: () async {
                  ref.invalidate(_allActivityProvider);
                  ref.invalidate(activityProvider);
                  await ref.read(_allActivityProvider.future).catchError((_) => throw 0);
                },
                child: AsyncSlot<List<ActivityEntry>>(
                  value: value,
                  onRetry: () => ref.invalidate(_allActivityProvider),
                  data: (items) {
                    if (items.isEmpty) {
                      return ListView(children: const [
                        SizedBox(height: 80),
                        EmptyState(
                          icon: Icons.history_rounded,
                          title: 'No activity yet',
                          subtitle: 'Updates will show here as you and your team work.',
                        ),
                      ]);
                    }
                    final groups = _groupByDay(items);
                    return ListView.builder(
                      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                      itemCount: groups.length,
                      itemBuilder: (_, i) => _DayGroup(group: groups[i]),
                    );
                  },
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 8, 12),
      child: Row(
        children: [
          IconButton(icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18), onPressed: () => context.pop()),
          Text('Activity', style: RunqText.h2.copyWith(color: t.ink)),
          const Spacer(),
        ],
      ),
    );
  }
}

class _Group {
  final String label;
  final List<ActivityEntry> items;
  _Group({required this.label, required this.items});
}

List<_Group> _groupByDay(List<ActivityEntry> items) {
  final byKey = <String, List<ActivityEntry>>{};
  for (final e in items) {
    final d = e.createdAt;
    final key = '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
    byKey.putIfAbsent(key, () => []).add(e);
  }
  final keys = byKey.keys.toList()..sort((a, b) => b.compareTo(a));
  final today = DateTime.now();
  return keys.map((k) {
    final list = byKey[k]!;
    final d = list.first.createdAt;
    final label = _isSameDay(d, today)
        ? 'Today'
        : _isSameDay(d, today.subtract(const Duration(days: 1)))
            ? 'Yesterday'
            : _absDate(d);
    return _Group(label: label, items: list);
  }).toList();
}

bool _isSameDay(DateTime a, DateTime b) => a.year == b.year && a.month == b.month && a.day == b.day;

String _absDate(DateTime d) {
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return '${d.day} ${m[d.month - 1]}';
}

class _DayGroup extends StatelessWidget {
  final _Group group;
  const _DayGroup({required this.group});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 0, 4, 8),
            child: Text(group.label.toUpperCase(), style: RunqText.label.copyWith(color: RT(context).muted2)),
          ),
          RunqCard(
            padding: EdgeInsets.zero,
            child: Column(
              children: [
                for (var i = 0; i < group.items.length; i++) ...[
                  _Row(entry: group.items[i]),
                  if (i < group.items.length - 1)
                    Padding(
                      padding: const EdgeInsets.only(left: 60),
                      child: Divider(height: 1, thickness: 0.5, color: RT(context).hairlineSoft),
                    ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  final ActivityEntry entry;
  const _Row({required this.entry});

  void _onTap(BuildContext context) {
    switch (entry.entityType) {
      case 'sales_invoice':
        context.push('/invoices/${entry.entityId}');
        break;
      case 'purchase_invoice':
        context.push('/bills/${entry.entityId}');
        break;
      case 'bank_transaction':
        context.push('/banking');
        break;
      case 'payment':
      case 'receipt':
      case 'credit_note':
      case 'debit_note':
        // No detail screen yet — fall through silently.
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final spec = activitySpec(entry);
    return InkWell(
      onTap: () => _onTap(context),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        child: Row(
          children: [
            Container(
              width: 36, height: 36,
              decoration: BoxDecoration(color: spec.tint.withValues(alpha: 0.12), shape: BoxShape.circle),
              child: Icon(spec.icon, size: 18, color: spec.tint),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          spec.title,
                          style: RunqText.bodyStrong.copyWith(fontSize: 14, color: t.ink),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (entry.amount != null) ...[
                        const SizedBox(width: 8),
                        Text(formatINR(entry.amount!),
                            style: RunqText.tabular(size: 14, w: FontWeight.w700, color: t.ink)),
                      ],
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(spec.subtitle(_relTime(entry.createdAt)),
                      style: RunqText.caption.copyWith(fontSize: 11, color: t.muted2),
                      maxLines: 1, overflow: TextOverflow.ellipsis),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

String _relTime(DateTime t) {
  final diff = DateTime.now().difference(t);
  if (diff.inSeconds < 60) return 'just now';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
  if (diff.inHours < 24) return '${diff.inHours}h ago';
  return _absDate(t);
}
