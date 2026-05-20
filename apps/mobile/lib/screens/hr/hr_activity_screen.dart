// Full-screen recent activity feed — pushed from the HR Home
// "Recent activity · View all" link. The Home section caps at 5
// rows; this screen shows everything the server returns (already
// scoped by access — managers see their reports, HR sees org-wide).

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/hr_models.dart';
import '../../providers/hr_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/hr_colors.dart';
import 'widgets/hr_feed_sections.dart';

class HrActivityScreen extends ConsumerWidget {
  const HrActivityScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final async = ref.watch(hrRecentActivityProvider);
    final rows = async.asData?.value ?? const <HrActivityEvent>[];

    return Scaffold(
      backgroundColor: t.bgWarm,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 12, 16, 8),
              child: Row(
                children: [
                  IconButton(
                    onPressed: () => Navigator.of(context).maybePop(),
                    icon: Icon(Icons.arrow_back_rounded, color: t.ink),
                  ),
                  const SizedBox(width: 4),
                  Text('Recent activity', style: RunqText.h1.copyWith(color: t.ink)),
                ],
              ),
            ),
            Expanded(
              child: RefreshIndicator(
                color: HrColors.brand(context),
                onRefresh: () async {
                  ref.invalidate(hrRecentActivityProvider);
                  await Future<void>.delayed(const Duration(milliseconds: 250));
                },
                child: async.when(
                  loading: () => const Center(child: CircularProgressIndicator(color: HrColors.teal)),
                  error: (e, _) => Center(child: Text('$e', style: RunqText.body.copyWith(color: t.muted))),
                  data: (_) {
                    if (rows.isEmpty) {
                      return ListView(
                        physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
                        padding: const EdgeInsets.fromLTRB(16, 60, 16, 140),
                        children: [
                          Icon(Icons.timeline_outlined, size: 40, color: t.muted2),
                          const SizedBox(height: 10),
                          Center(child: Text('No HR activity yet',
                              style: RunqText.bodyStrong.copyWith(color: t.ink))),
                        ],
                      );
                    }
                    return ListView.separated(
                      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
                      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 140),
                      itemCount: rows.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 8),
                      // Each row wrapped in its own card outline — matches
                      // the announcement list pattern so a long activity
                      // log stays scannable instead of running as one
                      // dense divider-separated block.
                      itemBuilder: (_, i) => Container(
                        decoration: BoxDecoration(
                          color: t.surface,
                          borderRadius: BorderRadius.circular(RunqRadii.smallCard),
                          border: Border.all(color: t.hairline, width: 0.5),
                          boxShadow: RunqShadows.card,
                        ),
                        child: HrActivityListRow(event: rows[i]),
                      ),
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
