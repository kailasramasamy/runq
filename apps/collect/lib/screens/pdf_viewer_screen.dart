import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:printing/printing.dart';
import '../theme/dhenu_theme.dart';
import '../theme/dhenu_tokens.dart';

/// In-app PDF viewer for an already-fetched document. Share and print live in
/// its toolbar, so a statement opens for reading first and leaves only when the
/// user asks — the share sheet used to be the only way to see it at all.
///
/// [PdfPreview]'s page-format and orientation controls are desktop affordances
/// and are turned off: these documents are server-rendered A4, and the buttons
/// would imply a choice that changes nothing.
class PdfViewerScreen extends StatelessWidget {
  const PdfViewerScreen({
    super.key,
    required this.title,
    required this.bytes,
    required this.filename,
  });

  final String title;
  final Uint8List bytes;

  /// Also the name the share sheet offers.
  final String filename;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    return Scaffold(
      backgroundColor: t.surface,
      appBar: AppBar(title: Text(title, style: DhenuText.h2.copyWith(color: t.ink))),
      body: PdfPreview(
        build: (_) => bytes,
        pdfFileName: filename,
        canChangePageFormat: false,
        canChangeOrientation: false,
        canDebug: false,
        loadingWidget: const Center(child: CircularProgressIndicator()),
      ),
    );
  }
}
