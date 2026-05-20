// New-hire onboarding checklist for the logged-in employee.
//
// Behaviour by item kind / assigned role:
//   * assignedRole != 'employee'  → locked "Waiting on HR" tile.
//   * kind == 'document_upload'   → upload tile (camera/photos/file).
//                                   Once uploaded, shows the file name +
//                                   a tap-to-replace affordance.
//   * kind == 'acknowledgement'   → "Acknowledge" button that marks done.
//   * otherwise                   → simple checkbox.
//
// Items are grouped by status (Pending / Completed) so the employee always
// sees what's actually outstanding at the top.

library;

import 'dart:io';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';

import '../../api/hr_phase_next.dart';
import '../../widgets/runq_snack.dart';

const _hrAccent = Color(0xFF0891B2);

class HrOnboardingScreen extends ConsumerWidget {
  const HrOnboardingScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(myOnboardingProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Onboarding')),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(myOnboardingProvider),
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(child: Text('$e')),
          data: (wf) {
            if (wf == null) {
              return ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: const [
                  Padding(
                    padding: EdgeInsets.all(40),
                    child: Center(child: Text('No onboarding workflow assigned yet.')),
                  ),
                ],
              );
            }
            return _OnboardingBody(wf: wf);
          },
        ),
      ),
    );
  }
}

class _OnboardingBody extends StatelessWidget {
  const _OnboardingBody({required this.wf});
  final HrOnboardingWorkflow wf;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final mine = wf.items.where((i) => i.isEmployeeAssigned).toList();
    final hr = wf.items.where((i) => !i.isEmployeeAssigned).toList();

    final myPending = mine.where((i) => !i.isCompleted).toList();
    final myDone = mine.where((i) => i.isCompleted).toList();

    final totalDone = wf.items.where((i) => i.isCompleted).length;
    final total = wf.items.length;
    final progress = total == 0 ? 0.0 : totalDone / total;

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.only(bottom: 32),
      children: [
        // Hero progress card.
        Container(
          margin: const EdgeInsets.fromLTRB(12, 12, 12, 0),
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: isDark
                  ? [_hrAccent.withValues(alpha: 0.25), _hrAccent.withValues(alpha: 0.10)]
                  : [_hrAccent.withValues(alpha: 0.18), _hrAccent.withValues(alpha: 0.06)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              const Icon(Icons.checklist_rounded, color: _hrAccent),
              const SizedBox(width: 8),
              const Text('Welcome aboard', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
              const Spacer(),
              if (wf.status == 'completed')
                const _StatusPill(text: 'All done', color: Colors.green, icon: Icons.check_circle),
            ]),
            const SizedBox(height: 14),
            Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text('${(progress * 100).round()}%', style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold)),
              const SizedBox(width: 8),
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Text('$totalDone of $total tasks complete', style: TextStyle(color: theme.hintColor, fontSize: 13)),
              ),
            ]),
            const SizedBox(height: 10),
            ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: LinearProgressIndicator(
                value: progress,
                minHeight: 8,
                backgroundColor: Colors.white24,
                valueColor: const AlwaysStoppedAnimation(_hrAccent),
              ),
            ),
            if (myPending.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(
                '${myPending.length} ${myPending.length == 1 ? "task is" : "tasks are"} waiting for you.',
                style: TextStyle(fontSize: 12, color: theme.hintColor),
              ),
            ],
          ]),
        ),

        if (myPending.isNotEmpty) ...[
          _SectionHeader(label: 'Your tasks', count: myPending.length),
          for (final it in myPending) _ItemCard(item: it),
        ],
        if (myDone.isNotEmpty) ...[
          _SectionHeader(label: 'Completed', count: myDone.length),
          for (final it in myDone) _ItemCard(item: it),
        ],
        if (hr.isNotEmpty) ...[
          _SectionHeader(label: 'Handled by HR', count: hr.length),
          for (final it in hr) _ItemCard(item: it),
        ],
      ],
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.label, required this.count});
  final String label;
  final int count;
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 22, 16, 6),
      child: Row(children: [
        Text(
          label.toUpperCase(),
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.bold,
            letterSpacing: 0.8,
            color: theme.hintColor,
          ),
        ),
        const SizedBox(width: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
          decoration: BoxDecoration(
            color: theme.hintColor.withValues(alpha: 0.15),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Text('$count', style: TextStyle(fontSize: 11, color: theme.hintColor, fontWeight: FontWeight.w600)),
        ),
      ]),
    );
  }
}

class _ItemCard extends ConsumerStatefulWidget {
  const _ItemCard({required this.item});
  final HrOnboardingItem item;
  @override
  ConsumerState<_ItemCard> createState() => _ItemCardState();
}

class _ItemCardState extends ConsumerState<_ItemCard> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    final it = widget.item;
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final isHrAssigned = !it.isEmployeeAssigned;
    final isDoc = it.kind == 'document_upload';
    final isAck = it.kind == 'acknowledgement';

    final iconColor = it.isCompleted
        ? Colors.green
        : isHrAssigned
            ? theme.hintColor
            : _hrAccent;

    return Card(
      margin: const EdgeInsets.fromLTRB(12, 6, 12, 0),
      clipBehavior: Clip.antiAlias,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: iconColor.withValues(alpha: isDark ? 0.18 : 0.12),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(_iconFor(it), color: iconColor, size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(
                  it.title,
                  style: TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 15,
                    decoration: it.isCompleted ? TextDecoration.lineThrough : null,
                    color: it.isCompleted ? theme.hintColor : null,
                  ),
                ),
                if (it.instructions != null && it.instructions!.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(it.instructions!, style: TextStyle(fontSize: 12, color: theme.hintColor)),
                ],
                if (it.isCompleted && it.completedAt != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    'Completed ${DateFormat('d MMM y').format(it.completedAt!.toLocal())}',
                    style: const TextStyle(fontSize: 11, color: Colors.green),
                  ),
                ],
              ]),
            ),
            if (isHrAssigned) const _StatusPill(text: 'HR', color: Colors.grey, icon: Icons.support_agent),
          ]),
          if (isDoc && it.isEmployeeAssigned) ...[
            const SizedBox(height: 12),
            _docTile(context),
          ] else if (isAck && it.isEmployeeAssigned && !it.isCompleted) ...[
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                style: FilledButton.styleFrom(backgroundColor: _hrAccent),
                onPressed: _busy ? null : _acknowledge,
                icon: const Icon(Icons.check),
                label: const Text('Acknowledge'),
              ),
            ),
          ] else if (it.isEmployeeAssigned && !it.isCompleted) ...[
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: _busy ? null : _markDone,
                icon: const Icon(Icons.check_circle_outline),
                label: const Text('Mark as done'),
              ),
            ),
          ],
        ]),
      ),
    );
  }

  Widget _docTile(BuildContext context) {
    final it = widget.item;
    final theme = Theme.of(context);
    if (it.isCompleted && it.attachmentFileName != null) {
      return Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Colors.green.withValues(alpha: 0.10),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(children: [
          const Icon(Icons.insert_drive_file, color: Colors.green, size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Uploaded', style: TextStyle(fontSize: 11, color: theme.hintColor)),
              Text(it.attachmentFileName!, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600)),
            ]),
          ),
        ]),
      );
    }
    final kindLabel = it.documentKind != null ? _docKindLabel(it.documentKind!) : 'document';
    return InkWell(
      onTap: _busy ? null : _pickAndUpload,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          border: Border.all(color: _hrAccent.withValues(alpha: 0.5), style: BorderStyle.solid),
          borderRadius: BorderRadius.circular(10),
          color: _hrAccent.withValues(alpha: 0.05),
        ),
        child: _busy
            ? const Center(child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)))
            : Row(children: [
                const Icon(Icons.cloud_upload_outlined, color: _hrAccent),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('Upload $kindLabel', style: const TextStyle(fontWeight: FontWeight.w600, color: _hrAccent)),
                    Text('PDF, PNG, JPG or WEBP, up to 10 MB', style: TextStyle(fontSize: 11, color: theme.hintColor)),
                  ]),
                ),
                const Icon(Icons.chevron_right, color: _hrAccent),
              ]),
      ),
    );
  }

  Future<void> _acknowledge() async {
    setState(() => _busy = true);
    try {
      await hrPhaseNextRepo.completeOnboardingItem(widget.item.id);
      ref.invalidate(myOnboardingProvider);
      if (mounted) showRunqSnack(context, 'Acknowledged', kind: SnackKind.success);
    } catch (e) {
      if (mounted) showRunqSnack(context, 'Failed: $e', kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _markDone() async {
    setState(() => _busy = true);
    try {
      await hrPhaseNextRepo.completeOnboardingItem(widget.item.id);
      ref.invalidate(myOnboardingProvider);
      if (mounted) showRunqSnack(context, 'Marked complete', kind: SnackKind.success);
    } catch (e) {
      if (mounted) showRunqSnack(context, 'Failed: $e', kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _pickAndUpload() async {
    final src = await _showSourceSheet(context);
    if (src == null || !mounted) return;
    File? file;
    try {
      switch (src) {
        case _UploadSource.camera:
          final picked = await ImagePicker().pickImage(
            source: ImageSource.camera,
            imageQuality: 88,
            maxWidth: 2400,
          );
          if (picked != null) file = File(picked.path);
        case _UploadSource.gallery:
          final picked = await ImagePicker().pickImage(
            source: ImageSource.gallery,
            imageQuality: 88,
            maxWidth: 2400,
          );
          if (picked != null) file = File(picked.path);
        case _UploadSource.files:
          final result = await FilePicker.platform.pickFiles(
            type: FileType.custom,
            allowedExtensions: const ['pdf', 'jpg', 'jpeg', 'png', 'webp'],
          );
          final path = result?.files.firstOrNull?.path;
          if (path != null) file = File(path);
      }
    } catch (e) {
      if (mounted) showRunqSnack(context, 'Could not open picker: $e', kind: SnackKind.error);
      return;
    }
    if (file == null || !mounted) return;

    setState(() => _busy = true);
    try {
      final mime = _guessMime(file.path);
      await hrPhaseNextRepo.uploadOnboardingDocument(
        itemId: widget.item.id,
        file: file,
        mimeType: mime,
      );
      ref.invalidate(myOnboardingProvider);
      if (mounted) showRunqSnack(context, 'Uploaded', kind: SnackKind.success);
    } catch (e) {
      if (mounted) showRunqSnack(context, 'Upload failed: $e', kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.text, required this.color, required this.icon});
  final String text;
  final Color color;
  final IconData icon;
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 12, color: color),
        const SizedBox(width: 4),
        Text(text, style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w600)),
      ]),
    );
  }
}

enum _UploadSource { camera, gallery, files }

Future<_UploadSource?> _showSourceSheet(BuildContext context) async {
  return showModalBottomSheet<_UploadSource>(
    context: context,
    showDragHandle: true,
    builder: (_) => SafeArea(
      top: false,
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        ListTile(
          leading: const Icon(Icons.photo_camera_outlined, color: _hrAccent),
          title: const Text('Take a photo'),
          subtitle: const Text('Use your camera'),
          onTap: () => Navigator.pop(context, _UploadSource.camera),
        ),
        ListTile(
          leading: const Icon(Icons.photo_library_outlined, color: _hrAccent),
          title: const Text('Choose from photos'),
          subtitle: const Text('Pick an image from your gallery'),
          onTap: () => Navigator.pop(context, _UploadSource.gallery),
        ),
        ListTile(
          leading: const Icon(Icons.folder_outlined, color: _hrAccent),
          title: const Text('Choose a file'),
          subtitle: const Text('PDF or image from device storage'),
          onTap: () => Navigator.pop(context, _UploadSource.files),
        ),
        const SizedBox(height: 8),
      ]),
    ),
  );
}

IconData _iconFor(HrOnboardingItem it) {
  if (it.isCompleted) return Icons.check_circle;
  if (!it.isEmployeeAssigned) return Icons.support_agent;
  return switch (it.kind) {
    'document_upload' => Icons.cloud_upload_outlined,
    'acknowledgement' => Icons.assignment_turned_in_outlined,
    'asset_issue' => Icons.devices_outlined,
    'induction' => Icons.school_outlined,
    _ => Icons.radio_button_unchecked,
  };
}

String _guessMime(String path) {
  final ext = path.toLowerCase().split('.').last;
  return switch (ext) {
    'pdf' => 'application/pdf',
    'png' => 'image/png',
    'webp' => 'image/webp',
    _ => 'image/jpeg',
  };
}

String _docKindLabel(String k) => switch (k) {
  'aadhaar' => 'Aadhaar card',
  'pan' => 'PAN card',
  'passport' => 'passport',
  'driving_license' => 'driving licence',
  'voter_id' => 'voter ID',
  'address_proof' => 'address proof',
  'bank_passbook' => 'bank passbook / cancelled cheque',
  'photo_id_card' => 'photo ID card',
  'offer_letter' => 'offer letter',
  'employment_contract' => 'employment contract',
  'educational_certificate' => 'educational certificate',
  'experience_letter' => 'experience letter',
  'relieving_letter' => 'relieving letter',
  'appraisal_letter' => 'appraisal letter',
  _ => 'document',
};
