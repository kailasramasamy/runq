// Geo-fenced mobile check-in / check-out. The punch card itself is the
// shared HrPunchCard widget (also used by the Home › Time tab) so both
// entry points punch through the same /hr/me/punch backend. This screen
// wraps that card with the recent-punches history list.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../api/hr_phase_next.dart';
import '../../theme/runq_theme.dart';
import 'widgets/hr_punch_card.dart';

class HrCheckInScreen extends ConsumerWidget {
  const HrCheckInScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final punches = ref.watch(myPunchesProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Attendance')),
      body: SafeArea(
        child: Column(
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 16, 16, 18),
              child: HrPunchCard(),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 2, 20, 8),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text('Recent punches',
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w700,
                        )),
              ),
            ),
            Expanded(
              child: punches.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => Center(child: Text('$e')),
                data: (rows) => rows.isEmpty
                    ? Center(
                        child: Text('No punches yet',
                            style: TextStyle(color: Theme.of(context).hintColor)),
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
                        itemCount: rows.length,
                        separatorBuilder: (_, __) => Divider(
                            height: 1,
                            color: Theme.of(context).dividerColor.withValues(alpha: 0.5)),
                        itemBuilder: (_, i) => _punchRow(context, rows[i]),
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _punchRow(BuildContext context, HrPunch p) {
    final isIn = p.kind == 'in';
    final accent = isIn ? Colors.green : Colors.blueGrey;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: accent.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(isIn ? Icons.login : Icons.logout, size: 19, color: accent),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(DateFormat('EEE, d MMM • h:mm a').format(p.punchAt),
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          fontWeight: FontWeight.w600,
                        )),
                const SizedBox(height: 2),
                Text(p.insideFence ? 'Inside fence' : 'Outside / no fence',
                    style: RunqText.caption.copyWith(
                      color: p.insideFence ? Colors.green.shade700 : Colors.orange.shade800,
                    )),
              ],
            ),
          ),
          if (p.lat != null)
            Text('${p.lat!.toStringAsFixed(3)}, ${p.lng!.toStringAsFixed(3)}',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Theme.of(context).hintColor,
                    )),
        ],
      ),
    );
  }
}
