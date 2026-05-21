// Resume tab on the employee detail screen. Shows the AI-extracted resume
// profile (summary, experience, education, skills, certifications,
// languages), lets management replace the resume to re-extract, and edit
// the extracted data. All fields are self-reported — surfaced as such.

library;

import 'dart:io';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../api/hr_models.dart';
import '../../../api/hr_repo.dart';
import '../../../providers/hr_providers.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import '../../../widgets/runq_snack.dart';
import 'hr_colors.dart';
import 'hr_resume_edit.dart';

class HrResumeTab extends ConsumerStatefulWidget {
  final String employeeId;
  /// Self-service mode — the logged-in employee viewing their OWN resume.
  /// Uses the /me endpoints, allows upload, hides Edit (corrections are HR's).
  final bool selfService;
  /// Management mode — viewer is owner / accountant / HR. Enables upload + edit.
  final bool canManage;
  const HrResumeTab({
    super.key,
    required this.employeeId,
    this.selfService = false,
    this.canManage = false,
  });

  @override
  ConsumerState<HrResumeTab> createState() => _HrResumeTabState();
}

class _HrResumeTabState extends ConsumerState<HrResumeTab> {
  bool _editing = false;
  bool _uploading = false;

  Future<void> _pickAndUpload() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['pdf', 'jpg', 'jpeg', 'png', 'webp'],
    );
    final files = result?.files ?? const [];
    final path = files.isEmpty ? null : files.first.path;
    if (path == null || !mounted) return;

    setState(() => _uploading = true);
    if (mounted) showRunqSnack(context, 'Uploading & extracting resume…');
    try {
      if (widget.selfService) {
        await hrRepo.uploadMyResume(File(path), mimeType: _mime(path));
        ref.invalidate(hrMyResumeProfileProvider);
      } else {
        await hrRepo.uploadResume(widget.employeeId, File(path), mimeType: _mime(path));
        ref.invalidate(hrResumeProfileProvider(widget.employeeId));
      }
      if (!mounted) return;
      showRunqSnack(context, 'Resume profile ready', kind: SnackKind.success);
    } catch (e) {
      if (!mounted) return;
      showRunqSnack(context, 'Upload failed: $e', kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  static String _mime(String path) {
    switch (path.toLowerCase().split('.').last) {
      case 'pdf':
        return 'application/pdf';
      case 'png':
        return 'image/png';
      case 'webp':
        return 'image/webp';
      default:
        return 'image/jpeg';
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = widget.selfService
        ? ref.watch(hrMyResumeProfileProvider)
        : ref.watch(hrResumeProfileProvider(widget.employeeId));
    final canUpload = widget.selfService || widget.canManage;
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator(color: HrColors.teal)),
      error: (e, _) => _ErrorBody(message: '$e'),
      data: (profile) {
        if (_editing && profile != null && widget.canManage) {
          return HrResumeEditForm(
            employeeId: widget.employeeId,
            profile: profile,
            onDone: () => setState(() => _editing = false),
          );
        }
        if (profile == null) {
          return _EmptyBody(
            canUpload: canUpload,
            uploading: _uploading,
            onUpload: _pickAndUpload,
          );
        }
        return _ResumeView(
          profile: profile,
          canUpload: canUpload,
          canEdit: widget.canManage,
          uploading: _uploading,
          onReplace: _pickAndUpload,
          onEdit: () => setState(() => _editing = true),
        );
      },
    );
  }
}

class _ErrorBody extends StatelessWidget {
  final String message;
  const _ErrorBody({required this.message});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 40, 16, 16),
      children: [
        Center(child: Text(message, style: RunqText.body.copyWith(color: t.muted))),
      ],
    );
  }
}

class _EmptyBody extends StatelessWidget {
  final bool canUpload;
  final bool uploading;
  final VoidCallback onUpload;
  const _EmptyBody({required this.canUpload, required this.uploading, required this.onUpload});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 48, 16, 140),
      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
      children: [
        Icon(Icons.description_outlined, size: 40, color: t.muted2),
        const SizedBox(height: 12),
        Text('No resume on file',
            textAlign: TextAlign.center,
            style: RunqText.h4.copyWith(color: t.ink)),
        const SizedBox(height: 4),
        Text(
            canUpload
                ? 'Upload a PDF or image — a profile is extracted automatically.'
                : 'The employee can upload their resume from the runq app.',
            textAlign: TextAlign.center,
            style: RunqText.body.copyWith(color: t.muted)),
        if (canUpload) ...[
          const SizedBox(height: 18),
          Center(
            child: _UploadButton(uploading: uploading, onTap: onUpload, label: 'Upload resume'),
          ),
        ],
      ],
    );
  }
}

class _ResumeView extends StatelessWidget {
  final HrResumeProfile profile;
  final bool canUpload;
  final bool canEdit;
  final bool uploading;
  final VoidCallback onReplace;
  final VoidCallback onEdit;
  const _ResumeView({
    required this.profile,
    required this.canUpload,
    required this.canEdit,
    required this.uploading,
    required this.onReplace,
    required this.onEdit,
  });

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 140),
      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
      children: [
        _ProvenanceBanner(profile: profile),
        if (canUpload || canEdit) ...[
          const SizedBox(height: 12),
          Row(
            children: [
              if (canUpload)
                Expanded(
                  child: _UploadButton(uploading: uploading, onTap: onReplace, label: 'Replace'),
                ),
              if (canUpload && canEdit) const SizedBox(width: 10),
              if (canEdit)
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: onEdit,
                    icon: const Icon(Icons.edit_outlined, size: 16),
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      side: BorderSide(color: RT(context).hairline),
                      foregroundColor: HrColors.brand(context),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    label: const Text('Edit'),
                  ),
                ),
            ],
          ),
        ],
        if (profile.summary != null && profile.summary!.trim().isNotEmpty) ...[
          const SizedBox(height: 16),
          _SummaryCard(text: profile.summary!.trim()),
        ],
        if (profile.experience.isNotEmpty) ...[
          const SizedBox(height: 16),
          _EntryList(
            title: 'Experience',
            icon: Icons.work_outline_rounded,
            entries: [
              for (final e in profile.experience)
                _Entry(
                  title: [e.title, e.company].where(_has).join(' · '),
                  meta: _dateRange(e.fromDate, e.toDate),
                  body: e.description,
                ),
            ],
          ),
        ],
        if (profile.education.isNotEmpty) ...[
          const SizedBox(height: 16),
          _EntryList(
            title: 'Education',
            icon: Icons.school_outlined,
            entries: [
              for (final e in profile.education)
                _Entry(
                  title: e.degree,
                  meta: [e.institution, e.year, e.grade].where(_has).join(' · '),
                ),
            ],
          ),
        ],
        if (profile.skills.isNotEmpty) ...[
          const SizedBox(height: 16),
          _ChipSection(title: 'Skills', items: profile.skills),
        ],
        if (profile.certifications.isNotEmpty) ...[
          const SizedBox(height: 16),
          _EntryList(
            title: 'Certifications',
            icon: Icons.workspace_premium_outlined,
            entries: [
              for (final c in profile.certifications)
                _Entry(
                  title: c.name,
                  meta: [c.issuer, c.year].where(_has).join(' · '),
                ),
            ],
          ),
        ],
        if (profile.languages.isNotEmpty) ...[
          const SizedBox(height: 16),
          _ChipSection(title: 'Languages', items: profile.languages),
        ],
        if (profile.isEmpty) ...[
          const SizedBox(height: 16),
          _NothingExtracted(),
        ],
      ],
    );
  }
}

bool _has(String? s) => s != null && s.trim().isNotEmpty;

String _dateRange(String? from, String? to) {
  if (!_has(from) && !_has(to)) return '';
  return '${from ?? '?'} — ${to ?? 'Present'}';
}

class _ProvenanceBanner extends StatelessWidget {
  final HrResumeProfile profile;
  const _ProvenanceBanner({required this.profile});

  @override
  Widget build(BuildContext context) {
    final brand = HrColors.brand(context);
    final text = profile.manuallyEdited
        ? 'Extracted from the resume, then corrected by HR. Self-reported — unverified.'
        : 'Extracted from the employee’s resume. Self-reported — unverified.';
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: HrColors.tealSubtle,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.auto_awesome_outlined, size: 16, color: brand),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(text, style: RunqText.body.copyWith(color: brand)),
                const SizedBox(height: 4),
                Text(_confidenceLabel(profile),
                    style: RunqText.caption.copyWith(color: brand, fontWeight: FontWeight.w700)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  static String _confidenceLabel(HrResumeProfile p) {
    if (p.manuallyEdited) return 'HR-reviewed';
    if (p.aiConfidence == null) return 'AI-extracted';
    final pct = (p.aiConfidence! * 100).round();
    if (p.aiConfidence! >= 0.75) return '$pct% confidence';
    if (p.aiConfidence! >= 0.5) return '$pct% confidence — review';
    return '$pct% confidence — verify';
  }
}

class _UploadButton extends StatelessWidget {
  final bool uploading;
  final VoidCallback onTap;
  final String label;
  const _UploadButton({required this.uploading, required this.onTap, required this.label});

  @override
  Widget build(BuildContext context) {
    return FilledButton.icon(
      onPressed: uploading ? null : onTap,
      style: FilledButton.styleFrom(
        backgroundColor: HrColors.teal,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 18),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      icon: uploading
          ? const SizedBox(
              width: 15, height: 15,
              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
          : const Icon(Icons.upload_file_outlined, size: 16),
      label: Text(uploading ? 'Extracting…' : label),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  final String text;
  const _SummaryCard({required this.text});

  @override
  Widget build(BuildContext context) {
    return _Card(
      title: 'Summary',
      child: Text(text,
          style: RunqText.body.copyWith(color: RT(context).ink, height: 1.45)),
    );
  }
}

class _NothingExtracted extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      child: Text(
        'The resume was processed but no profile fields could be extracted. '
        'Try a clearer file, or add details with Edit.',
        textAlign: TextAlign.center,
        style: RunqText.body.copyWith(color: t.muted),
      ),
    );
  }
}

class _Card extends StatelessWidget {
  final String title;
  final Widget child;
  const _Card({required this.title, required this.child});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 0, 4, 6),
          child: Text(title.toUpperCase(),
              style: RunqText.label.copyWith(color: t.muted2)),
        ),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: t.surface,
            borderRadius: BorderRadius.circular(RunqRadii.smallCard),
            border: Border.all(color: t.hairline, width: 0.5),
            boxShadow: RunqShadows.card,
          ),
          child: child,
        ),
      ],
    );
  }
}

class _Entry {
  final String title;
  final String meta;
  final String? body;
  const _Entry({required this.title, required this.meta, this.body});
}

class _EntryList extends StatelessWidget {
  final String title;
  final IconData icon;
  final List<_Entry> entries;
  const _EntryList({required this.title, required this.icon, required this.entries});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 0, 4, 6),
          child: Text(title.toUpperCase(),
              style: RunqText.label.copyWith(color: t.muted2)),
        ),
        for (var i = 0; i < entries.length; i++) ...[
          if (i > 0) const SizedBox(height: 8),
          _EntryCardView(icon: icon, entry: entries[i]),
        ],
      ],
    );
  }
}

class _EntryCardView extends StatelessWidget {
  final IconData icon;
  final _Entry entry;
  const _EntryCardView({required this.icon, required this.entry});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
        boxShadow: RunqShadows.card,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 15, color: HrColors.brand(context)),
              const SizedBox(width: 7),
              Expanded(
                child: Text(entry.title,
                    style: RunqText.bodyStrong.copyWith(color: t.ink)),
              ),
            ],
          ),
          if (entry.meta.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(left: 22, top: 2),
              child: Text(entry.meta,
                  style: RunqText.caption.copyWith(color: t.muted2)),
            ),
          if (_has(entry.body))
            Padding(
              padding: const EdgeInsets.only(left: 22, top: 5),
              child: Text(entry.body!.trim(),
                  style: RunqText.body.copyWith(color: t.muted, height: 1.4)),
            ),
        ],
      ),
    );
  }
}

class _ChipSection extends StatelessWidget {
  final String title;
  final List<String> items;
  const _ChipSection({required this.title, required this.items});

  @override
  Widget build(BuildContext context) {
    return _Card(
      title: title,
      child: Wrap(
        spacing: 6,
        runSpacing: 6,
        children: [
          for (final it in items)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: HrColors.tealSubtle,
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(it,
                  style: RunqText.caption.copyWith(color: HrColors.brand(context))),
            ),
        ],
      ),
    );
  }
}
