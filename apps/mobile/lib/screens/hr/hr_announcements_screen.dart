// Full-screen announcements feed — pushed from the HR Home
// "Announcements · View all" link. The Home feed shows only the
// top 3 rows; this screen shows everything the user is allowed to
// see, with filter chips for category.
//
// Reuses _AnnouncementRow + _showFullBody via the shared helpers
// exposed from hr_feed_sections.dart. Posting (admin / HR only) is
// available via the same modal the Home section uses.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/hr_models.dart';
import '../../providers/app_role_provider.dart';
import '../../providers/hr_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/hr_colors.dart';
import 'widgets/hr_feed_sections.dart';

class HrAnnouncementsScreen extends ConsumerStatefulWidget {
  const HrAnnouncementsScreen({super.key});

  @override
  ConsumerState<HrAnnouncementsScreen> createState() => _HrAnnouncementsScreenState();
}

class _HrAnnouncementsScreenState extends ConsumerState<HrAnnouncementsScreen> {
  /// null = show all categories; otherwise filter to this one only.
  String? _filter;

  static const _filters = <(String?, String)>[
    (null, 'All'),
    ('policy', 'Policy'),
    ('holiday', 'Holiday'),
    ('event', 'Event'),
    ('operational', 'Operations'),
    ('celebration', 'Celebration'),
    ('payroll', 'Payroll'),
  ];

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final role = ref.watch(appRoleProvider);
    // Posting opens up to managers (server narrows to their dept).
    // Edit + delete are gated inside HrAnnouncementListRow: admin /
    // HR can moderate any post; managers can edit / delete only the
    // ones they authored (ownership compared against authProvider).
    final canPost = role.canPostAnnouncements;
    final canModerateAny = role == AppRole.admin || role == AppRole.hr;
    final async = ref.watch(hrAnnouncementsProvider);
    final all = async.asData?.value ?? const <HrAnnouncement>[];
    final rows = _filter == null
        ? all
        : all.where((a) => a.category == _filter).toList();

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
                  Text('Announcements', style: RunqText.h1.copyWith(color: t.ink)),
                ],
              ),
            ),
            // Horizontal chip strip — quick filter by category.
            SizedBox(
              height: 42,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                itemCount: _filters.length,
                separatorBuilder: (_, __) => const SizedBox(width: 6),
                itemBuilder: (_, i) {
                  final (code, label) = _filters[i];
                  final selected = code == _filter;
                  return GestureDetector(
                    onTap: () => setState(() => _filter = code),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                      decoration: BoxDecoration(
                        color: selected ? HrColors.teal : t.surface,
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(
                          color: selected ? HrColors.teal : t.hairline,
                          width: selected ? 1.0 : 0.5,
                        ),
                      ),
                      child: Text(
                        label,
                        style: RunqText.caption.copyWith(
                          color: selected ? Colors.white : t.ink,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
            Expanded(
              child: RefreshIndicator(
                color: HrColors.brand(context),
                onRefresh: () async {
                  ref.invalidate(hrAnnouncementsProvider);
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
                          Icon(Icons.campaign_outlined, size: 40, color: t.muted2),
                          const SizedBox(height: 10),
                          Center(child: Text(
                            _filter == null ? 'No announcements yet' : 'No matches',
                            style: RunqText.bodyStrong.copyWith(color: t.ink),
                          )),
                          if (_filter != null) ...[
                            const SizedBox(height: 4),
                            Center(child: Text('Try a different filter or tap All.',
                                style: RunqText.caption.copyWith(color: t.muted))),
                          ],
                        ],
                      );
                    }
                    return ListView.builder(
                      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 140),
                      itemCount: rows.length,
                      itemBuilder: (_, i) => Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        // Wraps every row in a card outline so each
                        // post reads as its own block — the dense
                        // divider-separated list pattern used on Home
                        // looks cramped when the list is long.
                        child: _ScreenAnnouncementCard(
                          item: rows[i],
                          canModerateAny: canModerateAny,
                          tokens: t,
                        ),
                      ),
                    );
                  },
                ),
              ),
            ),
          ],
        ),
      ),
      floatingActionButton: canPost
          ? FloatingActionButton.extended(
              heroTag: 'post-announcement',
              backgroundColor: HrColors.teal,
              foregroundColor: Colors.white,
              icon: const Icon(Icons.add_rounded),
              label: const Text('Post'),
              onPressed: () => openAnnouncementPostSheet(context, ref),
            )
          : null,
    );
  }
}

class _ScreenAnnouncementCard extends StatelessWidget {
  final HrAnnouncement item;
  final bool canModerateAny;
  final RunqTokens tokens;
  const _ScreenAnnouncementCard({
    required this.item,
    required this.canModerateAny,
    required this.tokens,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: tokens.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: tokens.hairline, width: 0.5),
        boxShadow: RunqShadows.card,
      ),
      // Tap the whole card → full body sheet. _AnnouncementRowFull is
      // a public helper re-exported from hr_feed_sections.
      child: HrAnnouncementListRow(item: item, canModerateAny: canModerateAny),
    );
  }
}
