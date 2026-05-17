// Announcement noticeboard + recent activity feed for the HR manager
// home. Kept in a sibling file to hr_dashboard_sections.dart so each file
// stays close to the 500-line guideline.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../api/hr_models.dart';
import '../../../api/hr_repo.dart';
import '../../../providers/app_role_provider.dart';
import '../../../providers/hr_providers.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'hr_colors.dart';

// ─── Shared shells (mirror hr_dashboard_sections._SectionLabel) ───────────

class _SectionLabel extends StatelessWidget {
  final String label;
  final Widget? trailing;
  const _SectionLabel(this.label, {this.trailing});
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 0, 4, 6),
      child: Row(
        children: [
          Text(label.toUpperCase(),
              style: TextStyle(
                color: t.muted2, fontSize: 11,
                fontWeight: FontWeight.w600, letterSpacing: 0.5,
              )),
          const Spacer(),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}

Widget _card(BuildContext context, {required Widget child}) {
  final t = RT(context);
  return Container(
    decoration: BoxDecoration(
      color: t.surface,
      borderRadius: BorderRadius.circular(RunqRadii.smallCard),
      border: Border.all(color: t.hairline, width: 0.5),
      boxShadow: RunqShadows.card,
    ),
    child: child,
  );
}

Widget _empty(BuildContext context, IconData icon, String text) {
  final t = RT(context);
  return _card(context, child: Padding(
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
    child: Row(children: [
      Icon(icon, size: 18, color: t.muted2),
      const SizedBox(width: 10),
      Expanded(child: Text(text,
          style: RunqText.caption.copyWith(color: t.muted, fontSize: 12))),
    ]),
  ));
}

// ─── Announcements ────────────────────────────────────────────────────────

class HrAnnouncementsSection extends ConsumerWidget {
  const HrAnnouncementsSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final role = ref.watch(appRoleProvider);
    final async = ref.watch(hrAnnouncementsProvider);
    final rows = async.asData?.value ?? const [];
    // Admins always see the post action even with an empty feed; managers
    // and employees just see the list.
    final canPost = role == AppRole.admin;
    final top = rows.take(3).toList();
    return Padding(
      padding: const EdgeInsets.only(bottom: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _SectionLabel('Announcements',
              trailing: canPost
                  ? GestureDetector(
                      onTap: () => _openPostSheet(context, ref),
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        Icon(Icons.add, size: 14, color: HrColors.brand(context)),
                        const SizedBox(width: 2),
                        Text('Post',
                            style: TextStyle(
                              color: HrColors.brand(context),
                              fontSize: 11.5, fontWeight: FontWeight.w700,
                            )),
                      ]),
                    )
                  : (rows.length > top.length
                      ? Text('+${rows.length - top.length} more',
                          style: TextStyle(color: t.muted, fontSize: 11,
                              fontWeight: FontWeight.w600))
                      : null)),
          if (rows.isEmpty)
            _empty(context, Icons.campaign_outlined,
                canPost ? 'No announcements yet — tap Post to share one.'
                        : 'No announcements right now.')
          else
            _card(context, child: Column(children: [
              for (var i = 0; i < top.length; i++) ...[
                _AnnouncementRow(item: top[i], canDelete: canPost),
                if (i < top.length - 1)
                  Divider(height: 1, thickness: 0.5, color: t.hairlineSoft, indent: 14),
              ],
            ])),
        ],
      ),
    );
  }
}

class _AnnouncementRow extends ConsumerWidget {
  final HrAnnouncement item;
  final bool canDelete;
  const _AnnouncementRow({required this.item, required this.canDelete});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final age = _relativeTime(item.postedAt);
    final meta = [
      if (item.postedByName != null && item.postedByName!.isNotEmpty) item.postedByName!,
      age,
      if (item.audience == 'managers') 'managers only',
    ].join(' · ');
    return InkWell(
      onTap: () => _showFullBody(context, item),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (item.pinned)
              Padding(
                padding: const EdgeInsets.only(top: 2, right: 8),
                child: Icon(Icons.push_pin, size: 14, color: HrColors.brand(context)),
              ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(item.title,
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 13)),
                  const SizedBox(height: 2),
                  Text(item.body,
                      maxLines: 2, overflow: TextOverflow.ellipsis,
                      style: RunqText.caption.copyWith(color: t.muted, fontSize: 11.5, height: 1.35)),
                  const SizedBox(height: 4),
                  Text(meta,
                      style: TextStyle(color: t.muted2, fontSize: 10.5,
                          fontWeight: FontWeight.w600, letterSpacing: 0.2)),
                ],
              ),
            ),
            if (canDelete)
              IconButton(
                visualDensity: VisualDensity.compact,
                tooltip: 'Delete',
                icon: Icon(Icons.delete_outline, size: 16, color: t.muted2),
                onPressed: () => _confirmDelete(context, ref, item),
              ),
          ],
        ),
      ),
    );
  }
}

void _showFullBody(BuildContext context, HrAnnouncement item) {
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (ctx) {
      final t = RT(ctx);
      return Padding(
        padding: EdgeInsets.fromLTRB(20, 4, 20, 24 + MediaQuery.of(ctx).viewInsets.bottom),
        child: Column(mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            if (item.pinned) ...[
              Icon(Icons.push_pin, size: 16, color: HrColors.brand(ctx)),
              const SizedBox(width: 6),
            ],
            Expanded(child: Text(item.title,
                style: RunqText.h3.copyWith(color: t.ink))),
          ]),
          const SizedBox(height: 12),
          Text(item.body,
              style: RunqText.body.copyWith(color: t.ink, height: 1.45)),
        ]),
      );
    },
  );
}

Future<void> _confirmDelete(BuildContext context, WidgetRef ref, HrAnnouncement item) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('Delete announcement?'),
      content: Text('"${item.title}" will be removed for everyone.'),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
        TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Delete')),
      ],
    ),
  );
  if (ok != true) return;
  await hrRepo.deleteAnnouncement(item.id);
  ref.invalidate(hrAnnouncementsProvider);
}

void _openPostSheet(BuildContext context, WidgetRef ref) {
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => const _PostAnnouncementSheet(),
  );
}

class _PostAnnouncementSheet extends ConsumerStatefulWidget {
  const _PostAnnouncementSheet();
  @override
  ConsumerState<_PostAnnouncementSheet> createState() => _PostAnnouncementSheetState();
}

class _PostAnnouncementSheetState extends ConsumerState<_PostAnnouncementSheet> {
  final _titleC = TextEditingController();
  final _bodyC = TextEditingController();
  String _audience = 'all';
  bool _pinned = false;
  bool _saving = false;

  @override
  void dispose() {
    _titleC.dispose();
    _bodyC.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final title = _titleC.text.trim();
    final body = _bodyC.text.trim();
    if (title.length < 2 || body.length < 2) return;
    setState(() => _saving = true);
    try {
      await hrRepo.createAnnouncement(
        title: title, body: body, audience: _audience, pinned: _pinned,
      );
      ref.invalidate(hrAnnouncementsProvider);
      if (mounted) Navigator.pop(context);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 4, 20, 24 + MediaQuery.of(context).viewInsets.bottom),
      child: Column(mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('New announcement',
            style: RunqText.h3.copyWith(color: t.ink)),
        const SizedBox(height: 12),
        TextField(
          controller: _titleC,
          textCapitalization: TextCapitalization.sentences,
          decoration: const InputDecoration(labelText: 'Title', isDense: true),
          maxLength: 140,
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _bodyC,
          textCapitalization: TextCapitalization.sentences,
          decoration: const InputDecoration(labelText: 'Body', isDense: true),
          maxLines: 5, minLines: 3, maxLength: 4000,
        ),
        const SizedBox(height: 8),
        Row(children: [
          DropdownButton<String>(
            value: _audience,
            items: const [
              DropdownMenuItem(value: 'all', child: Text('Everyone')),
              DropdownMenuItem(value: 'managers', child: Text('Managers only')),
            ],
            onChanged: (v) => setState(() => _audience = v ?? 'all'),
          ),
          const Spacer(),
          Row(mainAxisSize: MainAxisSize.min, children: [
            Switch.adaptive(
              value: _pinned,
              onChanged: (v) => setState(() => _pinned = v),
            ),
            const Text('Pin to top'),
          ]),
        ]),
        const SizedBox(height: 12),
        FilledButton(
          onPressed: _saving ? null : _submit,
          child: Text(_saving ? 'Posting…' : 'Post announcement'),
        ),
      ]),
    );
  }
}

// ─── Recent activity ──────────────────────────────────────────────────────

class HrRecentActivitySection extends ConsumerWidget {
  const HrRecentActivitySection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final async = ref.watch(hrRecentActivityProvider);
    final rows = async.asData?.value ?? const [];
    final top = rows.take(6).toList();
    return Padding(
      padding: const EdgeInsets.only(bottom: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _SectionLabel('Recent activity',
              trailing: rows.length > top.length
                  ? Text('+${rows.length - top.length} more',
                      style: TextStyle(color: t.muted, fontSize: 11,
                          fontWeight: FontWeight.w600))
                  : null),
          if (rows.isEmpty)
            _empty(context, Icons.timeline_outlined, 'No HR activity yet.')
          else
            _card(context, child: Column(children: [
              for (var i = 0; i < top.length; i++) ...[
                _ActivityRow(event: top[i]),
                if (i < top.length - 1)
                  Divider(height: 1, thickness: 0.5, color: t.hairlineSoft, indent: 56),
              ],
            ])),
        ],
      ),
    );
  }
}

class _ActivityRow extends StatelessWidget {
  final HrActivityEvent event;
  const _ActivityRow({required this.event});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final (icon, tint) = _iconFor(event.kind);
    final ageLabel = _relativeTime(event.occurredAt);
    final subjectLine = [
      event.title,
      if (event.subject != null) event.subject!,
    ].join(' · ');
    return InkWell(
      onTap: event.employeeId == null
          ? null
          : () => context.push('/hr/people/${event.employeeId}'),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(children: [
          Container(
            width: 32, height: 32,
            decoration: BoxDecoration(
              color: tint.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, size: 16, color: tint),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(subjectLine,
                    maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 13)),
                const SizedBox(height: 2),
                Text(ageLabel,
                    style: RunqText.caption.copyWith(color: t.muted, fontSize: 11.5)),
              ],
            ),
          ),
        ]),
      ),
    );
  }
}

(IconData, Color) _iconFor(String kind) {
  switch (kind) {
    case 'employee_added':    return (Icons.person_add_alt_1, const Color(0xFF16A34A));
    case 'employee_exited':   return (Icons.logout, const Color(0xFFDC2626));
    case 'leave_approved':    return (Icons.check_circle_outline, const Color(0xFF0891B2));
    case 'leave_rejected':    return (Icons.cancel_outlined, const Color(0xFFDC2626));
    case 'salary_assigned':   return (Icons.payments_outlined, const Color(0xFF7C3AED));
    case 'document_uploaded': return (Icons.description_outlined, const Color(0xFF0284C7));
    case 'payroll_started':   return (Icons.receipt_long, const Color(0xFFD97706));
    default:                  return (Icons.history, const Color(0xFF64748B));
  }
}

String _relativeTime(DateTime when) {
  final diff = DateTime.now().difference(when);
  if (diff.inMinutes < 1) return 'Just now';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
  if (diff.inHours < 24) return '${diff.inHours}h ago';
  if (diff.inDays < 7) return '${diff.inDays}d ago';
  if (diff.inDays < 30) return '${(diff.inDays / 7).floor()}w ago';
  if (diff.inDays < 365) return '${(diff.inDays / 30).floor()}mo ago';
  return '${(diff.inDays / 365).floor()}y ago';
}
