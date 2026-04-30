import 'dart:io';
import 'package:cunning_document_scanner/cunning_document_scanner.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:permission_handler/permission_handler.dart';
import '../screens/manual_scan_screen.dart';
import '../widgets/bill_entry_sheet.dart';
import '../widgets/runq_snack.dart';
import 'scan_compiler.dart';

/// Entry point for the "add a bill" flow. Shows the chooser sheet, runs the
/// matching capture (scanner / photos / files), and routes to the extract
/// screen with the resulting File. No intermediate routes — the caller's
/// screen stays visible while the chooser/picker overlays.
Future<void> startBillIntake(BuildContext context) async {
  final choice = await showBillEntrySheet(context);
  if (choice == null || !context.mounted) return;

  final file = await switch (choice) {
    BillEntryChoice.scan => _runScanner(context),
    BillEntryChoice.photos => _pickFromPhotos(context),
    BillEntryChoice.files => _pickFromFiles(context),
  };
  if (file == null || !context.mounted) return;
  context.push('/bills/extract', extra: file);
}

/// Max pages allowed in a single bill scan. Most invoices fit in 1–3 pages
/// even for complex multi-page tax invoices; 10 is a safety ceiling.
const int _maxScanPages = 10;

Future<File?> _runScanner(BuildContext context) async {
  final status = await Permission.camera.request();
  if (!context.mounted) return null;
  if (!status.isGranted) {
    await _showPermissionSheet(context);
    return null;
  }

  // iOS's VNDocumentCamera auto-captures and gives no first-class control
  // over retake or "stop here" — push our own manual page-by-page flow
  // instead. Android keeps the native scanner because its edge-detect UX
  // works well there.
  if (Platform.isIOS) {
    // Manual screen handles stitching internally so the user never sees the
    // home tab flash between confirmation and the AI extract screen.
    final pdf = await Navigator.of(context).push<File>(
      MaterialPageRoute(builder: (_) => const ManualScanScreen(), fullscreenDialog: true),
    );
    return pdf;
  }

  try {
    final pagePaths = await CunningDocumentScanner.getPictures(
      noOfPages: _maxScanPages,
      isGalleryImportAllowed: true,
    );
    if (pagePaths == null || pagePaths.isEmpty) return null; // user cancelled
    if (!context.mounted) return null;

    final pageFiles = pagePaths.map(File.new).toList();
    return _stitchPages(context, pageFiles);
  } on PlatformException catch (e) {
    debugPrint('[bill-intake] scanner failed: ${e.code} ${e.message}');
    if (context.mounted) showRunqSnack(context, e.message ?? 'Could not open the scanner.', kind: SnackKind.error);
    return null;
  } catch (e) {
    debugPrint('[bill-intake] scanner error: $e');
    if (e.toString().toLowerCase().contains('permission')) {
      if (context.mounted) await _showPermissionSheet(context);
    } else {
      if (context.mounted) showRunqSnack(context, 'Could not open the scanner.', kind: SnackKind.error);
    }
    return null;
  }
}

/// Compile scanned page images into one grayscale PDF. Always runs even
/// for single-page captures — the AI is happy with PDF input and the
/// grayscale + JPEG-q75 re-encoding cuts file size 3–5× vs raw PNG/JPEG
/// from the scanner.
Future<File?> _stitchPages(BuildContext context, List<File> pages) async {
  if (pages.isEmpty) return null;
  if (pages.length > 1) {
    showRunqSnack(context, 'Compiling ${pages.length} pages…');
  }
  try {
    return await compileScansToPdf(pages, grayscale: true);
  } catch (e) {
    debugPrint('[bill-intake] PDF stitch failed: $e');
    if (context.mounted) {
      showRunqSnack(context, 'Could not compile pages. Uploading first page as-is.', kind: SnackKind.error);
    }
    return pages.first;
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
    // Wrap the picked image in a grayscale PDF for consistency + size.
    return _stitchPages(context, [File(picked.path)]);
  } on PlatformException catch (e) {
    debugPrint('[bill-intake] photos failed: ${e.code} ${e.message}');
    if (!context.mounted) return null;
    if (e.code == 'photo_access_denied') {
      await _showPermissionSheet(context, photos: true);
    } else {
      showRunqSnack(context, e.message ?? 'Could not open photos.', kind: SnackKind.error);
    }
    return null;
  } catch (e) {
    debugPrint('[bill-intake] photos error: $e');
    return null;
  }
}

Future<File?> _pickFromFiles(BuildContext context) async {
  try {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['pdf', 'jpg', 'jpeg', 'png', 'heic', 'webp'],
      // Allow picking multiple images so they can be stitched into a single
      // multi-page PDF. PDFs are inherently multi-page, so we don't stitch
      // when a single PDF is picked.
      allowMultiple: true,
      withData: false,
    );
    final files = result?.files ?? const [];
    if (files.isEmpty) return null;

    // Single PDF — pass through; AI handles multi-page natively.
    if (files.length == 1 && files.first.extension?.toLowerCase() == 'pdf') {
      final path = files.first.path;
      return path == null ? null : File(path);
    }

    // Multiple files — refuse if any is a PDF (mixing PDFs and images
    // doesn't compose cleanly; user should split into separate scans).
    final hasPdf = files.any((f) => f.extension?.toLowerCase() == 'pdf');
    if (hasPdf && files.length > 1) {
      if (context.mounted) {
        showRunqSnack(context, 'Pick either one PDF or multiple images — not both.', kind: SnackKind.error);
      }
      return null;
    }

    // One or more images — wrap into a grayscale PDF (single-image still
    // benefits from the size reduction and gives a consistent attachment
    // format on the bill).
    final imageFiles = files
        .map((f) => f.path)
        .whereType<String>()
        .map(File.new)
        .toList();
    if (imageFiles.isEmpty) return null;
    if (!context.mounted) return null;
    return _stitchPages(context, imageFiles);
  } on PlatformException catch (e) {
    debugPrint('[bill-intake] files failed: ${e.code} ${e.message}');
    if (context.mounted) showRunqSnack(context, e.message ?? 'Could not open the file picker.', kind: SnackKind.error);
    return null;
  } catch (e) {
    debugPrint('[bill-intake] files error: $e');
    return null;
  }
}

Future<void> _showPermissionSheet(BuildContext context, {bool photos = false}) async {
  await showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    builder: (_) => _PermissionPrompt(photos: photos),
  );
}

class _PermissionPrompt extends StatelessWidget {
  final bool photos;
  const _PermissionPrompt({required this.photos});

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Icon(photos ? Icons.photo_library_outlined : Icons.lock_outline_rounded,
                size: 36, color: const Color(0xFFB45309)),
            const SizedBox(height: 8),
            Text(photos ? 'Photo access needed' : 'Camera access needed',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: 6),
            Text(
              photos
                  ? 'Enable Photos in Settings → runQ → Photos to import bills.'
                  : 'Enable Camera in Settings → runQ → Camera to scan bills.',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: () {
                Navigator.pop(context);
                openAppSettings();
              },
              icon: const Icon(Icons.settings_outlined, size: 18),
              label: const Text('Open Settings'),
            ),
            const SizedBox(height: 4),
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Not now'),
            ),
          ],
        ),
      ),
    );
  }
}
