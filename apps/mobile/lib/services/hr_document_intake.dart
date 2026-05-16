// Document intake for HR employees. Mirrors the Finance bill-intake flow:
//   chooser sheet → capture (scan / photos / files) → stitch to PDF
//   → kind picker → upload to /common/attachments/employee/:id
//
// Designed to be called as a single function from the Documents tab; the
// caller doesn't need to know which capture path the user took.

library;

import 'dart:io';
import 'package:cunning_document_scanner/cunning_document_scanner.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:permission_handler/permission_handler.dart';
import '../api/hr_models.dart';
import '../api/hr_repo.dart';
import '../screens/hr/widgets/hr_colors.dart';
import '../screens/hr/widgets/hr_form.dart';
import '../screens/manual_scan_screen.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../widgets/runq_snack.dart';
import 'scan_compiler.dart';

enum _DocSource { scan, photos, files }

/// Top-level entry point. Returns true when an upload completed so the
/// caller can invalidate the documents provider; false on any cancel/error.
Future<bool> startHrDocumentIntake(BuildContext context, {required String employeeId}) async {
  final src = await _showSourceSheet(context);
  if (src == null || !context.mounted) return false;

  final file = await switch (src) {
    _DocSource.scan => _runScanner(context),
    _DocSource.photos => _pickFromPhotos(context),
    _DocSource.files => _pickFromFiles(context),
  };
  if (file == null || !context.mounted) return false;

  final kind = await _showKindSheet(context);
  if (kind == null || !context.mounted) return false;

  // Only doc kinds that have a natural expiry get the second sheet —
  // educational certificates, offer letters, etc. don't expire so we
  // don't ask. User can still skip even when prompted.
  DateTime? expiry;
  if (_kindHasExpiry(kind)) {
    expiry = await _showExpirySheet(context, kind: kind);
    if (!context.mounted) return false;
  }

  // Best-effort mime guess so the server uses the right Content-Type for
  // the stored object. The endpoint accepts PDF + common image formats.
  final mime = _guessMime(file.path);
  try {
    showRunqSnack(context, 'Uploading ${kind.label.toLowerCase()}…');
    await hrRepo.uploadDocument(
      employeeId: employeeId,
      file: file,
      kind: kind,
      expiryDate: expiry,
      mimeType: mime,
    );
    if (context.mounted) {
      showRunqSnack(context, '${kind.label} uploaded', kind: SnackKind.success);
    }
    return true;
  } catch (e) {
    if (context.mounted) {
      showRunqSnack(context, 'Upload failed: $e', kind: SnackKind.error);
    }
    return false;
  }
}

// ─── Source chooser ───────────────────────────────────────────────────────

Future<_DocSource?> _showSourceSheet(BuildContext context) {
  return showModalBottomSheet<_DocSource>(
    context: context,
    backgroundColor: RT(context).surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
    ),
    builder: (_) => const _SourceSheet(),
  );
}

class _SourceSheet extends StatelessWidget {
  const _SourceSheet();

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(8, 8, 8, 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40, height: 4,
              decoration: BoxDecoration(color: t.hairline, borderRadius: BorderRadius.circular(2)),
            ),
            const SizedBox(height: 14),
            _Tile(
              icon: Icons.document_scanner_outlined,
              title: 'Scan with camera',
              subtitle: 'Auto-detect edges, multi-page',
              onTap: () => Navigator.pop(context, _DocSource.scan),
            ),
            _Tile(
              icon: Icons.photo_library_outlined,
              title: 'Choose from photos',
              subtitle: 'Pick an existing image',
              onTap: () => Navigator.pop(context, _DocSource.photos),
            ),
            _Tile(
              icon: Icons.folder_open_outlined,
              title: 'Pick a file',
              subtitle: 'PDF or image from files',
              onTap: () => Navigator.pop(context, _DocSource.files),
            ),
            const SizedBox(height: 4),
          ],
        ),
      ),
    );
  }
}

class _Tile extends StatelessWidget {
  final IconData icon;
  final String title, subtitle;
  final VoidCallback onTap;
  const _Tile({required this.icon, required this.title, required this.subtitle, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
        child: Row(
          children: [
            Container(
              width: 40, height: 40,
              decoration: BoxDecoration(
                color: HrColors.tealSubtle,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, color: HrColors.brand(context), size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: RunqText.bodyStrong.copyWith(color: t.ink)),
                  const SizedBox(height: 2),
                  Text(subtitle, style: RunqText.caption.copyWith(color: t.muted)),
                ],
              ),
            ),
            Icon(Icons.chevron_right_rounded, color: t.muted2),
          ],
        ),
      ),
    );
  }
}

// ─── Capture paths ────────────────────────────────────────────────────────

const int _maxScanPages = 10;

Future<File?> _runScanner(BuildContext context) async {
  final status = await Permission.camera.request();
  if (!context.mounted) return null;
  if (!status.isGranted) {
    if (context.mounted) {
      showRunqSnack(context, 'Camera permission denied', kind: SnackKind.error);
    }
    return null;
  }
  if (Platform.isIOS) {
    // Reuse the existing manual capture screen — gives the same paginated
    // feel as bill scans on iOS.
    return await Navigator.of(context).push<File>(
      MaterialPageRoute(builder: (_) => const ManualScanScreen(), fullscreenDialog: true),
    );
  }
  try {
    final paths = await CunningDocumentScanner.getPictures(
      noOfPages: _maxScanPages,
      isGalleryImportAllowed: true,
    );
    if (paths == null || paths.isEmpty) return null;
    if (!context.mounted) return null;
    return _stitchPages(context, paths.map(File.new).toList());
  } on PlatformException catch (e) {
    if (context.mounted) {
      showRunqSnack(context, e.message ?? 'Could not open the scanner.', kind: SnackKind.error);
    }
    return null;
  }
}

Future<File?> _pickFromPhotos(BuildContext context) async {
  try {
    final picked = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      imageQuality: 90,
      maxWidth: 2400,
    );
    if (picked == null) return null;
    if (!context.mounted) return null;
    return _stitchPages(context, [File(picked.path)]);
  } on PlatformException catch (e) {
    if (context.mounted) {
      showRunqSnack(context, e.message ?? 'Could not open photos.', kind: SnackKind.error);
    }
    return null;
  }
}

Future<File?> _pickFromFiles(BuildContext context) async {
  try {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['pdf', 'jpg', 'jpeg', 'png', 'heic', 'webp'],
      allowMultiple: true,
    );
    final files = result?.files ?? const [];
    if (files.isEmpty) return null;

    // Single PDF — upload as-is. The server stores it untouched.
    if (files.length == 1 && files.first.extension?.toLowerCase() == 'pdf') {
      final path = files.first.path;
      return path == null ? null : File(path);
    }
    // Mixing PDFs and images doesn't compose into a single attachment; ask
    // the user to pick one mode.
    final hasPdf = files.any((f) => f.extension?.toLowerCase() == 'pdf');
    if (hasPdf && files.length > 1) {
      if (context.mounted) {
        showRunqSnack(context, 'Pick either one PDF or multiple images — not both.', kind: SnackKind.error);
      }
      return null;
    }
    final imageFiles = files.map((f) => f.path).whereType<String>().map(File.new).toList();
    if (imageFiles.isEmpty) return null;
    if (!context.mounted) return null;
    return _stitchPages(context, imageFiles);
  } on PlatformException catch (e) {
    if (context.mounted) {
      showRunqSnack(context, e.message ?? 'Could not open the file picker.', kind: SnackKind.error);
    }
    return null;
  }
}

Future<File?> _stitchPages(BuildContext context, List<File> pages) async {
  if (pages.isEmpty) return null;
  if (pages.length == 1) return pages.first;
  // Multi-page → stitch into a single PDF, same helper Finance bills use.
  showRunqSnack(context, 'Compiling ${pages.length} pages…');
  try {
    return await compileScansToPdf(pages, grayscale: false);
  } catch (e) {
    if (context.mounted) {
      showRunqSnack(context, 'Could not compile pages. Uploading first page as-is.', kind: SnackKind.error);
    }
    return pages.first;
  }
}

// ─── Kind chooser ─────────────────────────────────────────────────────────

Future<HrDocumentKind?> _showKindSheet(BuildContext context) {
  return showModalBottomSheet<HrDocumentKind>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (_) => const _KindSheet(),
  );
}

class _KindSheet extends StatefulWidget {
  const _KindSheet();
  @override
  State<_KindSheet> createState() => _KindSheetState();
}

class _KindSheetState extends State<_KindSheet> {
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final q = _q.trim().toLowerCase();
    final filtered = HrDocumentKind.values
        .where((k) => q.isEmpty || k.label.toLowerCase().contains(q))
        .toList();
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: Container(
          constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.7),
          decoration: BoxDecoration(
            color: t.bgWarmer,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
          ),
          padding: const EdgeInsets.fromLTRB(0, 12, 0, 8),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Center(
                child: Container(
                  width: 36, height: 4,
                  decoration: BoxDecoration(
                    color: t.hairline,
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                child: Row(
                  children: [
                    Text('What kind of document?',
                        style: RunqText.h3.copyWith(color: t.ink, fontSize: 16)),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                child: TextField(
                  onChanged: (v) => setState(() => _q = v),
                  style: TextStyle(color: t.ink, fontSize: 14),
                  decoration: InputDecoration(
                    hintText: 'Search document types',
                    hintStyle: TextStyle(color: t.muted),
                    prefixIcon: Icon(Icons.search_rounded, size: 18, color: t.muted),
                    isDense: true,
                    filled: true,
                    fillColor: t.surface,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide(color: t.hairline, width: 0.5),
                    ),
                  ),
                ),
              ),
              Flexible(
                child: ListView.separated(
                  shrinkWrap: true,
                  itemCount: filtered.length,
                  separatorBuilder: (_, __) =>
                      Divider(height: 1, thickness: 0.5, color: t.hairlineSoft, indent: 56),
                  itemBuilder: (_, i) {
                    final k = filtered[i];
                    return ListTile(
                      dense: true,
                      leading: Container(
                        width: 32, height: 32,
                        decoration: BoxDecoration(
                          color: HrColors.tealSubtle,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Icon(_kindIcon(k), size: 16, color: HrColors.brand(context)),
                      ),
                      title: Text(k.label,
                          style: RunqText.body.copyWith(color: t.ink, fontSize: 14)),
                      onTap: () => Navigator.of(context).pop(k),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

IconData _kindIcon(HrDocumentKind k) => switch (k) {
      HrDocumentKind.aadhaar => Icons.credit_card_outlined,
      HrDocumentKind.pan => Icons.fingerprint_rounded,
      HrDocumentKind.passport => Icons.menu_book_outlined,
      HrDocumentKind.drivingLicense => Icons.directions_car_outlined,
      HrDocumentKind.voterId => Icons.how_to_vote_outlined,
      HrDocumentKind.addressProof => Icons.home_outlined,
      HrDocumentKind.bankPassbook => Icons.account_balance_outlined,
      HrDocumentKind.photoIdCard => Icons.badge_outlined,
      HrDocumentKind.offerLetter => Icons.description_outlined,
      HrDocumentKind.employmentContract => Icons.assignment_outlined,
      HrDocumentKind.educationalCertificate => Icons.school_outlined,
      HrDocumentKind.experienceLetter => Icons.work_history_outlined,
      HrDocumentKind.relievingLetter => Icons.logout_rounded,
      HrDocumentKind.appraisalLetter => Icons.trending_up_rounded,
      HrDocumentKind.other => Icons.insert_drive_file_outlined,
    };

String _guessMime(String path) {
  final ext = path.toLowerCase().split('.').last;
  switch (ext) {
    case 'pdf':  return 'application/pdf';
    case 'png':  return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'webp': return 'image/webp';
    case 'heic': return 'image/heic';
    default:     return 'application/octet-stream';
  }
}

// ─── Expiry sheet ─────────────────────────────────────────────────────────

/// Which doc kinds have a natural expiry. Educational certificates and
/// offer letters don't expire — skip the sheet for them entirely so we
/// don't add friction. List is conservative: include only kinds where
/// expiry tracking has compliance value.
bool _kindHasExpiry(HrDocumentKind k) => const {
      HrDocumentKind.aadhaar,
      HrDocumentKind.passport,
      HrDocumentKind.drivingLicense,
      HrDocumentKind.voterId,
      HrDocumentKind.addressProof,
      HrDocumentKind.photoIdCard,
      HrDocumentKind.employmentContract,
    }.contains(k);

Future<DateTime?> _showExpirySheet(BuildContext context, {required HrDocumentKind kind}) {
  return showModalBottomSheet<DateTime?>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (_) => _ExpirySheet(kind: kind),
  );
}

class _ExpirySheet extends StatefulWidget {
  final HrDocumentKind kind;
  const _ExpirySheet({required this.kind});
  @override
  State<_ExpirySheet> createState() => _ExpirySheetState();
}

class _ExpirySheetState extends State<_ExpirySheet> {
  DateTime? _expiry;

  /// Sensible defaults per doc kind — gives the user a usable starting
  /// point even though they can override.
  DateTime _defaultExpiry() {
    final now = DateTime.now();
    switch (widget.kind) {
      case HrDocumentKind.passport:
        return DateTime(now.year + 10, now.month, now.day);
      case HrDocumentKind.drivingLicense:
        return DateTime(now.year + 5, now.month, now.day);
      case HrDocumentKind.aadhaar:
      case HrDocumentKind.voterId:
        // No statutory expiry — push 5y out so the picker has somewhere
        // to start. User likely skips this sheet for these kinds.
        return DateTime(now.year + 5, now.month, now.day);
      case HrDocumentKind.employmentContract:
        return DateTime(now.year + 1, now.month, now.day);
      default:
        return DateTime(now.year + 1, now.month, now.day);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final inset = MediaQuery.of(context).viewInsets.bottom;
    return Container(
      decoration: BoxDecoration(
        color: t.bgWarmer,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: EdgeInsets.fromLTRB(0, 12, 0, 16 + inset),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Center(
            child: Container(
              width: 36, height: 4,
              decoration: BoxDecoration(color: t.hairline, borderRadius: BorderRadius.circular(999)),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 14, 20, 6),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('When does this ${widget.kind.label.toLowerCase()} expire?',
                    style: RunqText.h3.copyWith(color: t.ink, fontSize: 16)),
                const SizedBox(height: 4),
                Text(
                  'We\'ll show a warning on the dashboard 90 days before. Skip if it doesn\'t expire.',
                  style: RunqText.caption.copyWith(color: t.muted),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: HrFormSection(children: [
              HrDateField(
                label: 'Expiry date',
                value: _expiry,
                firstDate: DateTime.now().subtract(const Duration(days: 365)),
                lastDate: DateTime.now().add(const Duration(days: 365 * 30)),
                onChanged: (d) => setState(() => _expiry = d),
              ),
            ]),
          ),
          const SizedBox(height: 14),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.of(context).pop(null),
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      side: BorderSide(color: t.hairline),
                      foregroundColor: t.ink,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    child: const Text('Skip'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  flex: 2,
                  child: HrSubmitButton(
                    label: 'Upload',
                    enabled: true,
                    onPressed: () => Navigator.of(context).pop(_expiry ?? _defaultExpiry()),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
