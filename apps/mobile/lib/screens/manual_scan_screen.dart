import 'dart:async';
import 'dart:io';
import 'package:cunning_document_scanner/cunning_document_scanner.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../services/scan_compiler.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../widgets/runq_snack.dart';

/// Manual page-by-page capture flow used on iOS in place of VNDocumentCamera,
/// which auto-captures and gives no real way to refuse a bad scan. Each tap
/// on "Add page" opens the system camera; iOS's own "Retake / Use Photo"
/// gate handles the retake requirement. The user explicitly hits "Done" when
/// they've captured everything they want.
class ManualScanScreen extends StatefulWidget {
  const ManualScanScreen({super.key});

  @override
  State<ManualScanScreen> createState() => _ManualScanScreenState();
}

class _ManualScanScreenState extends State<ManualScanScreen> {
  final List<File> _pages = [];
  bool _busy = false;
  bool _finalizing = false;

  @override
  void initState() {
    super.initState();
    // Open the camera immediately on first frame so the user lands directly
    // in capture mode rather than on an empty review screen.
    WidgetsBinding.instance.addPostFrameCallback((_) => _capture());
  }

  Future<void> _capture() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      // Use VisionKit per page (noOfPages: 1) so we get edge-detection,
      // perspective correction and the native Retake / Use Photo buttons,
      // but the "another page?" decision lives in this screen — not inside
      // the scanner's auto-loop.
      final paths = await CunningDocumentScanner.getPictures(
        noOfPages: 1,
        isGalleryImportAllowed: false,
      );
      if (paths == null || paths.isEmpty) return; // user cancelled
      if (!mounted) return;
      setState(() => _pages.addAll(paths.map(File.new)));
    } on PlatformException catch (e) {
      if (mounted) showRunqSnack(context, e.message ?? 'Could not capture page.', kind: SnackKind.error);
    } catch (e) {
      if (mounted) showRunqSnack(context, 'Could not capture page.', kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _remove(int index) {
    setState(() => _pages.removeAt(index));
  }

  Future<void> _done() async {
    if (_pages.isEmpty || _finalizing) return;
    // Compile here (rather than in the caller) so this screen stays on top
    // while the PDF is built. Otherwise pop+stitch+push briefly reveals the
    // screen below — the home tab — between captures and AI extraction.
    setState(() => _finalizing = true);
    try {
      final pdf = await compileScansToPdf(_pages, grayscale: true);
      if (!mounted) return;
      Navigator.of(context).pop<File>(pdf);
    } catch (e) {
      if (!mounted) return;
      setState(() => _finalizing = false);
      showRunqSnack(context, 'Could not build the document.', kind: SnackKind.error);
    }
  }

  void _cancel() {
    if (_finalizing) return;
    Navigator.of(context).pop<File>(null);
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Scaffold(
      backgroundColor: t.surface,
      appBar: AppBar(
        title: Text('Scan bill'),
        leading: IconButton(
          icon: Icon(Icons.close_rounded),
          onPressed: _cancel,
        ),
      ),
      body: SafeArea(
        child: Stack(
          children: [
            Column(
              children: [
                Expanded(
                  child: _pages.isEmpty
                      ? _EmptyState()
                      : _PageGrid(pages: _pages, onRemove: _remove),
                ),
                _BottomBar(
                  pageCount: _pages.length,
                  busy: _busy || _finalizing,
                  onAddPage: _capture,
                  onDone: _pages.isEmpty ? null : _done,
                ),
              ],
            ),
            if (_finalizing)
              Positioned.fill(
                child: ColoredBox(
                  color: Color(0x80FFFFFF),
                  child: Center(
                    child: SizedBox(
                      width: 28,
                      height: 28,
                      child: CircularProgressIndicator(strokeWidth: 2.5, color: RT(context).brand),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.document_scanner_outlined, size: 56, color: t.muted),
            const SizedBox(height: 16),
            Text(
              'Capture each page of the bill',
              style: RunqText.h3.copyWith(color: t.ink, fontSize: 18),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 6),
            Text(
              'Use Retake in the camera if a shot is blurry or crooked. Tap Add page for the next page.',
              style: RunqText.caption.copyWith(color: t.muted2, fontSize: 13),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

class _PageGrid extends StatelessWidget {
  final List<File> pages;
  final void Function(int) onRemove;
  const _PageGrid({required this.pages, required this.onRemove});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: GridView.builder(
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          mainAxisSpacing: 12,
          crossAxisSpacing: 12,
          childAspectRatio: 0.72,
        ),
        itemCount: pages.length,
        itemBuilder: (ctx, i) {
          return Stack(
            children: [
              Positioned.fill(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(10),
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      border: Border.all(color: t.hairline, width: 0.5),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Image.file(pages[i], fit: BoxFit.cover),
                  ),
                ),
              ),
              Positioned(
                left: 8,
                top: 8,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.55),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    'Page ${i + 1}',
                    style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600),
                  ),
                ),
              ),
              Positioned(
                right: 6,
                top: 6,
                child: InkWell(
                  onTap: () => onRemove(i),
                  customBorder: const CircleBorder(),
                  child: Container(
                    width: 28,
                    height: 28,
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.55),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.close_rounded, color: Colors.white, size: 18),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _BottomBar extends StatelessWidget {
  final int pageCount;
  final bool busy;
  final VoidCallback onAddPage;
  final VoidCallback? onDone;
  const _BottomBar({
    required this.pageCount,
    required this.busy,
    required this.onAddPage,
    required this.onDone,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      decoration: BoxDecoration(
        color: t.surface,
        border: Border(top: BorderSide(color: t.hairline, width: 0.5)),
      ),
      child: Row(
        children: [
          Expanded(
            child: SizedBox(
              height: 48,
              child: OutlinedButton.icon(
                onPressed: busy ? null : onAddPage,
                icon: const Icon(Icons.add_a_photo_outlined, size: 18),
                label: Text(pageCount == 0 ? 'Take photo' : 'Add page',
                    style: const TextStyle(height: 1.0)),
                style: OutlinedButton.styleFrom(
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: SizedBox(
              height: 48,
              child: FilledButton.icon(
                onPressed: onDone,
                icon: const Icon(Icons.check_rounded, size: 18),
                label: Text(
                  pageCount == 0 ? 'Done' : 'Done · $pageCount',
                  style: const TextStyle(height: 1.0),
                ),
                style: FilledButton.styleFrom(
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
