import 'dart:io';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import '../widgets/runq_snack.dart';

const _allowedExts = ['pdf', 'xlsx', 'xls', 'csv', 'jpg', 'jpeg', 'png', 'webp'];

class PoIntakeArgs {
  final File file;
  final String source;
  PoIntakeArgs({required this.file, this.source = 'share_sheet'});
}

Future<void> startPoIntake(BuildContext context) async {
  final file = await _pickFile(context);
  if (file == null || !context.mounted) return;
  context.push('/po/processing', extra: PoIntakeArgs(file: file, source: 'share_sheet'));
}

void openPoProcessing(BuildContext context, File file, {String source = 'share_sheet'}) {
  context.push('/po/processing', extra: PoIntakeArgs(file: file, source: source));
}

Future<File?> _pickFile(BuildContext context) async {
  try {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: _allowedExts,
      allowMultiple: false,
      withData: false,
    );
    final path = result?.files.firstOrNull?.path;
    if (path == null) return null;
    return File(path);
  } on PlatformException catch (e) {
    debugPrint('[po-intake] files failed: ${e.code} ${e.message}');
    if (context.mounted) {
      showRunqSnack(context, e.message ?? 'Could not open the file picker.', kind: SnackKind.error);
    }
    return null;
  } catch (e) {
    debugPrint('[po-intake] files error: $e');
    return null;
  }
}
