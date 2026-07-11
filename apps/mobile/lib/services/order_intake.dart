import 'dart:io';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import '../widgets/runq_snack.dart';

const _allowedExts = ['pdf', 'xlsx', 'xls', 'csv', 'jpg', 'jpeg', 'png', 'webp'];

class OrderIntakeArgs {
  final File file;
  final String source;
  OrderIntakeArgs({required this.file, this.source = 'share_sheet'});
}

Future<void> startOrderIntake(BuildContext context) async {
  final file = await _pickFile(context);
  if (file == null || !context.mounted) return;
  context.push('/sales/orders/processing', extra: OrderIntakeArgs(file: file, source: 'share_sheet'));
}

void openOrderProcessing(BuildContext context, File file, {String source = 'share_sheet'}) {
  context.push('/sales/orders/processing', extra: OrderIntakeArgs(file: file, source: source));
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
