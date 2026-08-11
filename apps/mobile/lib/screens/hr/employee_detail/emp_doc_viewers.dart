part of '../hr_employee_detail_screen.dart';

// In-app document viewers: full-screen image viewer and in-app PDF
// viewer used when a document row is opened.

/// Full-screen image viewer for HR document attachments. Pulls bytes via
/// the auth'd /common/attachments/:id/download endpoint, then renders them
/// from memory so the same image survives Hero / pinch interactions.
class _DocImageViewer extends StatefulWidget {
  final HrDocument doc;
  const _DocImageViewer({required this.doc});
  @override
  State<_DocImageViewer> createState() => _DocImageViewerState();
}

class _DocImageViewerState extends State<_DocImageViewer> {
  List<int>? _bytes;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final b = await hrRepo.downloadDocument(widget.doc.id);
      if (!mounted) return;
      setState(() => _bytes = b);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = '$e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: GestureDetector(
        onTap: () => Navigator.of(context).maybePop(),
        onVerticalDragEnd: (d) {
          if ((d.primaryVelocity ?? 0).abs() > 200) Navigator.of(context).maybePop();
        },
        child: SafeArea(
          child: Stack(
            children: [
              Center(child: _body()),
              Positioned(
                top: 8, right: 8,
                child: IconButton(
                  onPressed: () => Navigator.of(context).maybePop(),
                  icon: const Icon(Icons.close_rounded, color: Colors.white, size: 28),
                ),
              ),
              Positioned(
                left: 0, right: 0, bottom: 24,
                child: Center(
                  child: Text(
                    widget.doc.fileName,
                    style: RunqText.bodyStrong.copyWith(color: Colors.white),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _body() {
    if (_error != null) {
      return Text(_error!, style: const TextStyle(color: Colors.white));
    }
    if (_bytes == null) {
      return const CircularProgressIndicator(color: Colors.white);
    }
    return InteractiveViewer(
      maxScale: 4,
      child: Image.memory(
        Uint8List.fromList(_bytes!),
        fit: BoxFit.contain,
      ),
    );
  }
}

/// In-app PDF preview for an HR document. Downloads bytes via the auth'd
/// document endpoint, writes them to the app-sandboxed temp dir (PDFView's
/// native iOS renderer won't accept the system temp), then renders inline.
/// The app-bar's Share action hands the same file off to the OS share sheet
/// only when the user asks for it.
class _DocPdfViewer extends StatefulWidget {
  final HrDocument doc;
  const _DocPdfViewer({required this.doc});
  @override
  State<_DocPdfViewer> createState() => _DocPdfViewerState();
}

class _DocPdfViewerState extends State<_DocPdfViewer> {
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
      final bytes = await hrRepo.downloadDocument(widget.doc.id);
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/${widget.doc.fileName}');
      await file.writeAsBytes(bytes, flush: true);
      if (!mounted) return;
      setState(() {
        _file = file;
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
        [XFile(f.path, mimeType: widget.doc.mimeType, name: widget.doc.fileName)],
        sharePositionOrigin: Rect.fromLTWH(size.width - 60, 0, 40, 40),
      );
    } catch (e) {
      if (mounted) {
        showRunqSnack(context, 'Share failed: $e', kind: SnackKind.error);
      }
    }
  }

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
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              widget.doc.fileName,
              style: RunqText.bodyStrong,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 1),
            Text(
              _pages > 0 ? 'Page ${_currentPage + 1} of $_pages' : 'PDF',
              style: RunqText.caption.copyWith(color: t.muted),
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
    final t = RT(context);
    if (_loading) {
      return Center(
        child: SizedBox(
          width: 28, height: 28,
          child: CircularProgressIndicator(strokeWidth: 2.5, color: t.brand),
        ),
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
                style: RunqText.caption.copyWith(color: t.muted),
              ),
            ],
          ),
        ),
      );
    }
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
}
