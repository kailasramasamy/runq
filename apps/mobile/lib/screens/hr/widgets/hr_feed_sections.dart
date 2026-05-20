// Announcement noticeboard + recent activity feed for the HR manager
// home. Kept in a sibling file to hr_dashboard_sections.dart so each file
// stays close to the 500-line guideline.

library;

import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import '../../../api/api_client.dart';
import '../../../api/api_config.dart';
import '../../../api/hr_models.dart';
import '../../../api/hr_repo.dart';
import '../../../providers/app_role_provider.dart';
import '../../../providers/auth_provider.dart';
import '../../../providers/hr_providers.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'hr_colors.dart';

// Maps an announcement category code to its display label + icon +
// accent colour. Generic 'general' falls back to a megaphone so the
// row still renders if the server adds a category we don't know.
({String label, IconData icon, Color color}) _categoryMeta(String code) {
  switch (code) {
    case 'policy':
      return (label: 'Policy', icon: Icons.gavel_rounded, color: const Color(0xFF6366F1));
    case 'holiday':
      return (label: 'Holiday', icon: Icons.beach_access_rounded, color: const Color(0xFFEA580C));
    case 'event':
      return (label: 'Event', icon: Icons.event_rounded, color: const Color(0xFF06B6D4));
    case 'operational':
      return (label: 'Operations', icon: Icons.engineering_rounded, color: const Color(0xFF0891B2));
    case 'celebration':
      return (label: 'Celebration', icon: Icons.celebration_rounded, color: const Color(0xFFEC4899));
    case 'payroll':
      return (label: 'Payroll', icon: Icons.payments_rounded, color: const Color(0xFF16A34A));
    default:
      return (label: 'Announcement', icon: Icons.campaign_rounded, color: const Color(0xFF7C3AED));
  }
}

/// Tokenises an announcement body into TextSpans with **bold** and
/// *italic* runs. Lightweight enough to live inline — no markdown
/// engine, no RegExp lookahead — but covers the 80% of formatting
/// HR actually uses on the noticeboard.
///
/// Rules:
///   **text**  → bold
///   *text*    → italic
///   newlines  → preserved (Text widget wraps naturally)
///
/// Markers must be balanced; an unmatched `**` or `*` falls through
/// as literal text. Greedy `**` is matched first so a stray `*` inside
/// a bold run isn't accidentally interpreted as italic.
List<TextSpan> _parseInlineFormatting(String body, TextStyle base) {
  final spans = <TextSpan>[];
  final regex = RegExp(r'(\*\*([^*]+)\*\*|\*([^*]+)\*)');
  var lastEnd = 0;
  for (final m in regex.allMatches(body)) {
    if (m.start > lastEnd) {
      spans.add(TextSpan(text: body.substring(lastEnd, m.start), style: base));
    }
    final bold = m.group(2);
    final italic = m.group(3);
    if (bold != null) {
      spans.add(TextSpan(text: bold, style: base.copyWith(fontWeight: FontWeight.w700)));
    } else if (italic != null) {
      spans.add(TextSpan(text: italic, style: base.copyWith(fontStyle: FontStyle.italic)));
    }
    lastEnd = m.end;
  }
  if (lastEnd < body.length) {
    spans.add(TextSpan(text: body.substring(lastEnd), style: base));
  }
  return spans.isEmpty ? [TextSpan(text: body, style: base)] : spans;
}

/// Authenticated network image for an announcement cover. Server route
/// (/hr/announcements/:id/image) requires the same bearer token the
/// rest of the API uses; Image.network needs an Authorization header
/// since the stream isn't presigned-URL.
class _AnnouncementImage extends StatelessWidget {
  final String relativeUrl;
  final double height;
  final Color surfaceColor;
  const _AnnouncementImage({
    required this.relativeUrl,
    required this.height,
    required this.surfaceColor,
  });

  @override
  Widget build(BuildContext context) {
    final tok = apiClient.token;
    final headers = (tok == null || tok.isEmpty) ? null : {'Authorization': 'Bearer $tok'};
    final fullUrl = relativeUrl.startsWith('http')
        ? relativeUrl
        : '${ApiConfig.baseUrl}${relativeUrl.replaceFirst('/api/v1', '')}';
    return ClipRRect(
      borderRadius: BorderRadius.circular(8),
      child: Image.network(
        fullUrl,
        height: height,
        width: double.infinity,
        fit: BoxFit.cover,
        headers: headers,
        errorBuilder: (_, __, ___) => const SizedBox.shrink(),
        loadingBuilder: (c, child, p) =>
            p == null ? child : Container(height: height, color: surfaceColor),
      ),
    );
  }
}

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
    // Admins / HR post org-wide; managers can post inside their own
    // dept (server enforces the dept lock + audience).
    final canPost = role.canPostAnnouncements;
    // Org-wide writers (admin/HR) get a small "moderator" affordance:
    // they can delete any post. Managers can only delete their own,
    // which is enforced server-side via posted_by_id check.
    final canModerate = role == AppRole.admin || role == AppRole.hr;
    final top = rows.take(3).toList();
    return Padding(
      padding: const EdgeInsets.only(bottom: 32),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _SectionLabel('Announcements',
              // "View all" link is always present when there are
              // more rows than the 3 we show inline; the Post action
              // (admins) takes precedence in that slot, so we drop
              // the explicit "View all" for them — they can still
              // tap the section title block to navigate.
              trailing: canPost
                  ? GestureDetector(
                      onTap: () => GoRouter.of(context).push('/hr/announcements'),
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        Text('View all',
                            style: TextStyle(
                              color: HrColors.brand(context),
                              fontSize: 11.5, fontWeight: FontWeight.w600,
                            )),
                        Icon(Icons.chevron_right_rounded, size: 14, color: HrColors.brand(context)),
                      ]),
                    )
                  : (rows.length > top.length
                      ? GestureDetector(
                          onTap: () => GoRouter.of(context).push('/hr/announcements'),
                          child: Row(mainAxisSize: MainAxisSize.min, children: [
                            Text('+${rows.length - top.length} more',
                                style: TextStyle(color: t.muted, fontSize: 11,
                                    fontWeight: FontWeight.w600)),
                            Icon(Icons.chevron_right_rounded, size: 14, color: t.muted),
                          ]),
                        )
                      : null)),
          if (rows.isEmpty)
            _empty(context, Icons.campaign_outlined,
                canPost ? 'No announcements yet — tap Post to share one.'
                        : 'No announcements right now.')
          else
            _card(context, child: Column(children: [
              for (var i = 0; i < top.length; i++) ...[
                HrAnnouncementListRow(item: top[i], canModerateAny: canModerate),
                if (i < top.length - 1)
                  Divider(height: 1, thickness: 0.5, color: t.hairlineSoft, indent: 14),
              ],
            ])),
        ],
      ),
    );
  }
}

/// Single announcement row — reused by both the Home feed (capped at 3
/// rows) and the dedicated /hr/announcements screen (all rows). Public
/// so the screen can drop it inside its own card outline without
/// duplicating the layout logic.
class HrAnnouncementListRow extends ConsumerWidget {
  final HrAnnouncement item;
  /// Admin / HR — can edit + delete *any* post regardless of author.
  /// Managers don't get this; their gates are ownership-only.
  final bool canModerateAny;
  const HrAnnouncementListRow({
    super.key,
    required this.item,
    required this.canModerateAny,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final currentUserId = ref.watch(authProvider).user?.id;
    final isOwner = currentUserId != null
        && item.postedById != null
        && item.postedById == currentUserId;
    final canEdit = canModerateAny || isOwner;
    final canDelete = canModerateAny || isOwner;
    final age = _relativeTime(item.postedAt);
    final cat = _categoryMeta(item.category);
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
            // Category tile on the left — readable visual cue before the
            // user reads the title. Replaces the bare pin icon (still
            // overlaid on top of the tile when pinned).
            Stack(
              clipBehavior: Clip.none,
              children: [
                Container(
                  width: 40, height: 40,
                  decoration: BoxDecoration(
                    color: cat.color.withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(cat.icon, size: 20, color: cat.color),
                ),
                if (item.pinned)
                  Positioned(
                    right: -4, top: -4,
                    child: Container(
                      padding: const EdgeInsets.all(3),
                      decoration: BoxDecoration(
                        color: t.surface,
                        shape: BoxShape.circle,
                      ),
                      child: Icon(Icons.push_pin, size: 11, color: HrColors.brand(context)),
                    ),
                  ),
              ],
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(item.title,
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 13)),
                  const SizedBox(height: 2),
                  Text.rich(
                    TextSpan(children: _parseInlineFormatting(
                      item.body,
                      RunqText.caption.copyWith(color: t.muted, fontSize: 11.5, height: 1.35),
                    )),
                    maxLines: 2, overflow: TextOverflow.ellipsis,
                  ),
                  if (item.imageUrl != null) ...[
                    const SizedBox(height: 6),
                    _AnnouncementImage(relativeUrl: item.imageUrl!, height: 110, surfaceColor: t.hairlineSoft),
                  ],
                  const SizedBox(height: 4),
                  // Department tag inlined with the meta line so the row
                  // stays at three lines max. Hidden when org-wide.
                  Wrap(
                    spacing: 6,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      Text(meta,
                          style: TextStyle(color: t.muted2, fontSize: 10.5,
                              fontWeight: FontWeight.w600, letterSpacing: 0.2)),
                      if (item.departmentName != null && item.departmentName!.isNotEmpty)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                          decoration: BoxDecoration(
                            color: cat.color.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(item.departmentName!,
                              style: TextStyle(color: cat.color, fontSize: 9.5, fontWeight: FontWeight.w700)),
                        ),
                    ],
                  ),
                ],
              ),
            ),
            if (canEdit)
              IconButton(
                visualDensity: VisualDensity.compact,
                tooltip: 'Edit',
                icon: Icon(Icons.edit_outlined, size: 16, color: t.muted2),
                onPressed: () => openAnnouncementPostSheet(context, ref, editing: item),
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
    // Cap at 90% of screen so a long body still leaves a hint of
    // backdrop above — easier to swipe-down close. Without this the
    // sheet sized to its content via wrap-and-clip semantics and the
    // body fell off below the visible area on small phones.
    constraints: BoxConstraints(
      maxHeight: MediaQuery.of(context).size.height * 0.9,
    ),
    builder: (ctx) {
      final t = RT(ctx);
      final cat = _categoryMeta(item.category);
      return SafeArea(
        top: false,
        child: Padding(
          padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Chips row — wrapped so a long department name pushes
                // to the next line instead of pushing the body off the
                // sheet via horizontal overflow.
                Wrap(
                  spacing: 8,
                  runSpacing: 6,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: cat.color.withValues(alpha: 0.14),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        Icon(cat.icon, size: 13, color: cat.color),
                        const SizedBox(width: 4),
                        Text(cat.label,
                            style: TextStyle(color: cat.color, fontSize: 11, fontWeight: FontWeight.w700)),
                      ]),
                    ),
                    if (item.pinned)
                      Icon(Icons.push_pin, size: 14, color: HrColors.brand(ctx)),
                    if (item.departmentName != null && item.departmentName!.isNotEmpty)
                      Text(item.departmentName!,
                          style: TextStyle(color: t.muted, fontSize: 11.5, fontWeight: FontWeight.w600)),
                  ],
                ),
                const SizedBox(height: 10),
                Text(item.title, style: RunqText.h3.copyWith(color: t.ink)),
                const SizedBox(height: 12),
                if (item.imageUrl != null) ...[
                  _AnnouncementImage(
                    relativeUrl: item.imageUrl!,
                    height: 220,
                    surfaceColor: t.hairlineSoft,
                  ),
                  const SizedBox(height: 12),
                ],
                Text.rich(
                  TextSpan(children: _parseInlineFormatting(
                    item.body,
                    RunqText.body.copyWith(color: t.ink, height: 1.45),
                  )),
                ),
                const SizedBox(height: 16),
                if (item.postedByName != null && item.postedByName!.isNotEmpty)
                  Text(
                    '${item.postedByName}  ·  ${_relativeTime(item.postedAt)}',
                    style: RunqText.caption.copyWith(color: t.muted2, fontSize: 11),
                  ),
              ],
            ),
          ),
        ),
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

void openAnnouncementPostSheet(
  BuildContext context,
  WidgetRef ref, {
  HrAnnouncement? editing,
}) {
  final t = RT(context);
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    backgroundColor: Color.alphaBlend(HrColors.tealSubtle, t.surface),
    builder: (_) => _PostAnnouncementSheet(editing: editing),
  );
}

class _PostAnnouncementSheet extends ConsumerStatefulWidget {
  /// When provided the sheet runs in edit mode: hydrates from this
  /// row and routes submit through PUT instead of POST. Image cover
  /// is editable too — picking a new file replaces the old via the
  /// dedicated /image route.
  final HrAnnouncement? editing;
  const _PostAnnouncementSheet({this.editing});
  @override
  ConsumerState<_PostAnnouncementSheet> createState() => _PostAnnouncementSheetState();
}

class _PostAnnouncementSheetState extends ConsumerState<_PostAnnouncementSheet> {
  late final TextEditingController _titleC;
  late final TextEditingController _bodyC;
  late String _audience;
  late String _category;
  /// Null = org-wide. Otherwise the picked department's id.
  late String? _departmentId;
  /// Null = never expires. Stored as date-only (midnight local); the
  /// submit handler shifts it to end-of-day before sending so the
  /// chosen day stays visible until midnight.
  DateTime? _expiresAt;
  File? _pickedImage;
  late bool _pinned;
  bool _saving = false;

  bool get _isEdit => widget.editing != null;

  @override
  void initState() {
    super.initState();
    final e = widget.editing;
    _titleC = TextEditingController(text: e?.title ?? '');
    _bodyC = TextEditingController(text: e?.body ?? '');
    _audience = e?.audience ?? 'all';
    _category = e?.category ?? 'general';
    _departmentId = e?.departmentId;
    _pinned = e?.pinned ?? false;
    _expiresAt = e?.expiresAt?.toLocal();
  }

  static const _categories = [
    'general', 'policy', 'holiday', 'event',
    'operational', 'celebration', 'payroll',
  ];

  @override
  void dispose() {
    _titleC.dispose();
    _bodyC.dispose();
    super.dispose();
  }

  Future<void> _pickImage() async {
    final picker = ImagePicker();
    final xfile = await picker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 92,
      maxWidth: 2400,
    );
    if (xfile != null && mounted) {
      setState(() => _pickedImage = File(xfile.path));
    }
  }

  Future<void> _submit() async {
    final title = _titleC.text.trim();
    final body = _bodyC.text.trim();
    if (title.length < 2 || body.length < 2) return;
    setState(() => _saving = true);
    try {
      // Shift to end-of-day local so the chosen date stays visible
      // until midnight — feels more natural than expiring at 00:00 of
      // the picked day.
      final expiresIso = _expiresAt == null
          ? null
          : DateTime(_expiresAt!.year, _expiresAt!.month, _expiresAt!.day, 23, 59, 59);
      final String targetId;
      if (_isEdit) {
        final e = widget.editing!;
        // Preserve audit trail: keep the same row, only ship the
        // delta. expiresAtNull tells the server "clear it" vs "leave
        // it alone" since a null value alone is ambiguous over JSON.
        await hrRepo.updateAnnouncement(
          e.id,
          title: title,
          body: body,
          audience: _audience,
          category: _category,
          departmentId: _departmentId,
          departmentIdNull: _departmentId == null,
          pinned: _pinned,
          expiresAt: expiresIso,
          expiresAtNull: expiresIso == null,
        );
        targetId = e.id;
      } else {
        final created = await hrRepo.createAnnouncement(
          title: title,
          body: body,
          audience: _audience,
          category: _category,
          departmentId: _departmentId,
          pinned: _pinned,
          expiresAt: expiresIso,
        );
        targetId = created.id;
      }
      // Upload image if the user picked a new one. Best-effort: a
      // failure here just leaves the existing image (or text-only)
      // intact and the post itself is already saved.
      if (_pickedImage != null) {
        try {
          await hrRepo.uploadAnnouncementImage(targetId, _pickedImage!);
        } catch (_) { /* swallow — text post still landed */ }
      }
      ref.invalidate(hrAnnouncementsProvider);
      if (mounted) Navigator.pop(context);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final depts = ref.watch(hrDepartmentsProvider).asData?.value ?? const [];
    // Managers post into their own dept only; the server overrides
    // whatever we send, so we hide the picker to avoid raising false
    // expectations. Audience hides too — managers can't push
    // "managers only" posts.
    final role = ref.watch(appRoleProvider);
    final isAdminOrHr = role == AppRole.admin || role == AppRole.hr;
    return SingleChildScrollView(
      // Drop the keyboard on drag so users can scroll the long form
      // without first tapping outside the active field. Matches the
      // app-wide convention for scrollables.
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: EdgeInsets.fromLTRB(20, 4, 20, 24 + MediaQuery.of(context).viewInsets.bottom),
      child: Column(mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        // Title row with an inline Save / Post text-action so the
        // primary affordance is reachable without scrolling to the
        // bottom of a long form.
        Row(children: [
          Expanded(
            child: Text(_isEdit ? 'Edit announcement' : 'New announcement',
                style: RunqText.h3.copyWith(color: t.ink)),
          ),
          TextButton(
            onPressed: _saving ? null : _submit,
            style: TextButton.styleFrom(
              foregroundColor: HrColors.brand(context),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            ),
            child: Text(
              _saving
                  ? (_isEdit ? 'Saving…' : 'Posting…')
                  : (_isEdit ? 'Save' : 'Post'),
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
        ]),
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
        const SizedBox(height: 12),
        // Category — drives the icon + accent across the feed.
        // Managers can't pick 'policy' (HR's lane); the server also
        // rejects it as a belt-and-suspenders.
        DropdownButtonFormField<String>(
          initialValue: _category,
          isDense: true,
          decoration: const InputDecoration(labelText: 'Category', isDense: true),
          items: _categories
              .where((c) => isAdminOrHr || c != 'policy')
              .map((c) {
            final m = _categoryMeta(c);
            return DropdownMenuItem(
              value: c,
              child: Row(children: [
                Icon(m.icon, size: 16, color: m.color),
                const SizedBox(width: 8),
                Text(m.label),
              ]),
            );
          }).toList(),
          onChanged: (v) => setState(() => _category = v ?? 'general'),
        ),
        const SizedBox(height: 12),
        // Department — admin/HR can pick any (incl. "All departments"
        // for org-wide). Managers don't see this; server pins it to
        // their own dept on submit.
        if (isAdminOrHr) ...[
          DropdownButtonFormField<String?>(
            initialValue: _departmentId,
            isDense: true,
            decoration: const InputDecoration(labelText: 'Department', isDense: true),
            items: [
              const DropdownMenuItem<String?>(value: null, child: Text('All departments (org-wide)')),
              ...depts.map((d) => DropdownMenuItem<String?>(value: d.id, child: Text(d.name))),
            ],
            onChanged: (v) => setState(() => _departmentId = v),
          ),
          const SizedBox(height: 12),
        ] else
          // Reassure managers about the scope without making it a
          // pickable surface that could mislead them.
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text('Posts to your department only.',
                style: RunqText.caption.copyWith(color: t.muted)),
          ),
        // Cover image — optional. Shows a preview tile with a Remove
        // affordance once picked so the user can re-pick or drop.
        if (_pickedImage != null)
          Stack(children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: Image.file(_pickedImage!, height: 140, width: double.infinity, fit: BoxFit.cover),
            ),
            Positioned(
              right: 6, top: 6,
              child: Material(
                color: Colors.black54,
                shape: const CircleBorder(),
                child: IconButton(
                  iconSize: 18,
                  icon: const Icon(Icons.close_rounded, color: Colors.white),
                  onPressed: () => setState(() => _pickedImage = null),
                ),
              ),
            ),
          ])
        else if (_isEdit && widget.editing!.imageUrl != null) ...[
          // Existing cover preview during edit — tapping the Replace
          // affordance opens the gallery so the user can swap it.
          _AnnouncementImage(
            relativeUrl: widget.editing!.imageUrl!,
            height: 140,
            surfaceColor: t.hairlineSoft,
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: _pickImage,
            icon: const Icon(Icons.swap_horiz_rounded, size: 18),
            label: const Text('Replace cover image'),
            style: OutlinedButton.styleFrom(
              foregroundColor: HrColors.brand(context),
              side: BorderSide(color: HrColors.brand(context).withValues(alpha: 0.4)),
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
        ]
        else
          OutlinedButton.icon(
            onPressed: _pickImage,
            icon: const Icon(Icons.image_outlined, size: 18),
            label: const Text('Add cover image (optional)'),
            style: OutlinedButton.styleFrom(
              foregroundColor: HrColors.brand(context),
              side: BorderSide(color: HrColors.brand(context).withValues(alpha: 0.4)),
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
        const SizedBox(height: 12),
        // Expiry — optional. Picking a date hides the post after the
        // end-of-day local. Auto-shifted so the post stays visible
        // *through* the chosen day, not vanishing at 00:00.
        InkWell(
          onTap: () async {
            final today = DateTime.now();
            final picked = await showDatePicker(
              context: context,
              initialDate: _expiresAt ?? today.add(const Duration(days: 7)),
              firstDate: today,
              lastDate: today.add(const Duration(days: 365)),
              helpText: 'Hide after this date',
              builder: (ctx, child) => Theme(
                data: Theme.of(ctx).copyWith(
                  colorScheme: Theme.of(ctx).colorScheme.copyWith(primary: HrColors.teal),
                ),
                child: child!,
              ),
            );
            if (picked != null) setState(() => _expiresAt = picked);
          },
          borderRadius: BorderRadius.circular(12),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            decoration: BoxDecoration(
              border: Border.all(color: t.hairline, width: 0.5),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                Icon(Icons.event_outlined, size: 18, color: t.muted),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    _expiresAt == null
                        ? 'Expires on (never)'
                        : 'Expires on ${_expiresAt!.day} ${_monthShort(_expiresAt!.month)} ${_expiresAt!.year}',
                    style: TextStyle(color: t.ink, fontSize: 13),
                  ),
                ),
                if (_expiresAt != null)
                  GestureDetector(
                    onTap: () => setState(() => _expiresAt = null),
                    child: Icon(Icons.close_rounded, size: 18, color: t.muted),
                  ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        Row(children: [
          // Audience picker is admin/HR-only — managers can't post a
          // "managers only" message; their posts always go to all
          // viewers within their dept.
          if (isAdminOrHr)
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
          child: Text(_saving
              ? (_isEdit ? 'Saving…' : 'Posting…')
              : (_isEdit ? 'Save changes' : 'Post announcement')),
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
    final top = rows.take(5).toList();
    final hasMore = rows.length > top.length;
    return Padding(
      padding: const EdgeInsets.only(bottom: 32),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _SectionLabel('Recent activity',
              trailing: hasMore
                  ? GestureDetector(
                      onTap: () => GoRouter.of(context).push('/hr/activity'),
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        Text('View all',
                            style: TextStyle(
                              color: HrColors.brand(context),
                              fontSize: 11.5, fontWeight: FontWeight.w600,
                            )),
                        Icon(Icons.chevron_right_rounded, size: 14, color: HrColors.brand(context)),
                      ]),
                    )
                  : null),
          if (rows.isEmpty)
            _empty(context, Icons.timeline_outlined, 'No HR activity yet.')
          else
            _card(context, child: Column(children: [
              for (var i = 0; i < top.length; i++) ...[
                HrActivityListRow(event: top[i]),
                if (i < top.length - 1)
                  Divider(height: 1, thickness: 0.5, color: t.hairlineSoft, indent: 56),
              ],
            ])),
        ],
      ),
    );
  }
}

class HrActivityListRow extends StatelessWidget {
  final HrActivityEvent event;
  const HrActivityListRow({super.key, required this.event});

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

String _monthShort(int month) {
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return m[(month - 1).clamp(0, 11)];
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
