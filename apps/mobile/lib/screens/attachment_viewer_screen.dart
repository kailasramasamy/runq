import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_pdfview/flutter_pdfview.dart';
import 'package:go_router/go_router.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import '../api/api_client.dart';
import '../api/models.dart';
import '../api/repos.dart';
import '../theme/runq_tokens.dart';
import '../theme/runq_theme.dart';

/// In-app preview for a bill attachment. Downloads bytes, writes to the
/// app-sandboxed temp dir, then renders inline:
///   - PDF → PDFView (native page-flipping)
///   - Image → InteractiveViewer (pinch-zoom)
///   - Anything else → fallback share-out
/// AppBar has a share icon that lets the user save to Files / share to
/// WhatsApp / etc., invoked via share_plus.
class AttachmentViewerScreen extends StatefulWidget {
  final BillAttachment attachment;
  const AttachmentViewerScreen({super.key, required this.attachment});

  @override
  State<AttachmentViewerScreen> createState() => _AttachmentViewerScreenState();
}

class _AttachmentViewerScreenState extends State<AttachmentViewerScreen> {
  File? _file;
  String? _error;
  bool _loading = true;
  int _pages = 0;
  int _currentPage = 0;

  @override
  void initState() {
    super.initState();
    _download();
  }

  Future<void> _download() async {
    try {
      final bytes = await billsRepo.downloadAttachment(widget.attachment.id);
      // App-sandboxed temp dir — required for the iOS share extension and
      // for PDFView's native iOS renderer (won't accept system temp).
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/${widget.attachment.fileName}');
      await file.writeAsBytes(bytes);
      if (!mounted) return;
      setState(() {
        _file = file;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = 'Could not load: $e';
        _loading = false;
      });
    }
  }

  Future<void> _share() async {
    final f = _file;
    if (f == null) return;
    final size = MediaQuery.of(context).size;
    try {
      await Share.shareXFiles(
        [XFile(f.path, mimeType: widget.attachment.mimeType)],
        sharePositionOrigin: Rect.fromLTWH(size.width - 60, 0, 40, 40),
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Share failed: $e')));
      }
    }
  }

  bool get _isPdf => widget.attachment.mimeType == 'application/pdf';
  bool get _isImage => widget.attachment.mimeType.startsWith('image/');

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: AppBar(
        backgroundColor: t.surface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
          onPressed: () => context.pop(),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              widget.attachment.fileName,
              style: RunqText.bodyStrong.copyWith(fontSize: 14),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 1),
            Text(
              _isPdf && _pages > 0
                  ? 'Page ${_currentPage + 1} of $_pages · ${widget.attachment.prettySize}'
                  : widget.attachment.prettySize,
              style: RunqText.caption.copyWith(color: t.muted, fontSize: 11),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.ios_share, size: 20),
            tooltip: 'Share',
            onPressed: _file == null ? null : _share,
          ),
          const SizedBox(width: 4),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(0.5),
          child: Container(height: 0.5, color: t.hairline),
        ),
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(
        child: SizedBox(width: 28, height: 28, child: CircularProgressIndicator(strokeWidth: 2.5, color: RunqColors.indigo)),
      );
    }
    if (_error != null || _file == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline_rounded, size: 36, color: RunqColors.redInk),
              const SizedBox(height: 8),
              Text("Couldn't load this document", style: RunqText.bodyStrong),
              const SizedBox(height: 4),
              Text(
                _error ?? 'Unknown error',
                textAlign: TextAlign.center,
                style: RunqText.caption.copyWith(color: RT(context).muted, fontSize: 12),
              ),
            ],
          ),
        ),
      );
    }
    if (_isPdf) {
      return PDFView(
        filePath: _file!.path,
        enableSwipe: true,
        swipeHorizontal: false,
        autoSpacing: true,
        pageSnap: false,
        fitPolicy: FitPolicy.WIDTH,
        onRender: (pages) {
          if (!mounted) return;
          setState(() => _pages = pages ?? 0);
        },
        onPageChanged: (page, _) {
          if (!mounted) return;
          setState(() => _currentPage = page ?? 0);
        },
        onError: (e) {
          if (!mounted) return;
          setState(() => _error = e.toString());
        },
      );
    }
    if (_isImage) {
      return InteractiveViewer(
        minScale: 1,
        maxScale: 5,
        child: Center(
          child: Image.file(_file!, fit: BoxFit.contain),
        ),
      );
    }
    // Unsupported in-app — let the user share out to a viewer.
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.insert_drive_file_outlined, size: 36, color: RT(context).muted),
            const SizedBox(height: 8),
            Text('Preview not available', style: RunqText.bodyStrong),
            const SizedBox(height: 4),
            Text(
              'Tap the share icon above to open in another app.',
              textAlign: TextAlign.center,
              style: RunqText.caption.copyWith(color: RT(context).muted, fontSize: 12),
            ),
          ],
        ),
      ),
    );
  }
}
