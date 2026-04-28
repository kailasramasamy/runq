import 'dart:io';
import 'package:cunning_document_scanner/cunning_document_scanner.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:permission_handler/permission_handler.dart';
import '../widgets/bill_entry_sheet.dart';
import '../widgets/runq_snack.dart';

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

Future<File?> _runScanner(BuildContext context) async {
  final status = await Permission.camera.request();
  if (!context.mounted) return null;
  if (!status.isGranted) {
    await _showPermissionSheet(context);
    return null;
  }

  try {
    final pages = await CunningDocumentScanner.getPictures(
      noOfPages: 1,
      isGalleryImportAllowed: true,
    );
    if (pages == null || pages.isEmpty) return null; // user cancelled
    return File(pages.first);
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

Future<File?> _pickFromPhotos(BuildContext context) async {
  try {
    final picked = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      imageQuality: 90,
      maxWidth: 2400,
    );
    if (picked == null) return null;
    return File(picked.path);
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
      allowMultiple: false,
      withData: false,
    );
    final path = result?.files.firstOrNull?.path;
    if (path == null) return null;
    return File(path);
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
