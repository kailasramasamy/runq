part of '../hr_employee_detail_screen.dart';

// Documents tab: grouped document list, per-kind section, and the
// document row (open/share/delete menu).

// ─── Documents tab ────────────────────────────────────────────────────────

class _DocsTab extends ConsumerWidget {
  final String employeeId;
  final String employeeName;
  const _DocsTab({required this.employeeId, required this.employeeName});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final docsAsync = ref.watch(hrEmployeeDocumentsProvider(employeeId));

    Future<void> upload() async {
      final ok = await startHrDocumentIntake(context, employeeId: employeeId);
      if (ok) ref.invalidate(hrEmployeeDocumentsProvider(employeeId));
    }

    return Stack(
      children: [
        RefreshIndicator(
          color: HrColors.brand(context),
          onRefresh: () async {
            ref.invalidate(hrEmployeeDocumentsProvider(employeeId));
            await Future<void>.delayed(const Duration(milliseconds: 250));
          },
          child: docsAsync.when(
            loading: () => const Center(child: CircularProgressIndicator(color: HrColors.teal)),
            error: (e, _) => ListView(children: [
              const SizedBox(height: 40),
              Center(child: Text('$e', style: RunqText.body.copyWith(color: t.muted))),
            ]),
            data: (docs) {
              if (docs.isEmpty) {
                return ListView(
                  physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
                  padding: const EdgeInsets.fromLTRB(16, 32, 16, 140),
                  children: const [
                    SizedBox(height: 30),
                    _EmptyState(
                      icon: Icons.folder_open_outlined,
                      title: 'No documents yet',
                      subtitle: 'Tap the + button to scan or upload a document.',
                    ),
                  ],
                );
              }
              return _DocsList(docs: docs, employeeName: employeeName);
            },
          ),
        ),
        // Floating upload button — matches the home FAB color/elevation so
        // the action is discoverable but doesn't intrude on the list.
        Positioned(
          right: 16, bottom: 28,
          child: FloatingActionButton.extended(
            heroTag: 'docs-upload',
            backgroundColor: HrColors.teal,
            foregroundColor: Colors.white,
            onPressed: upload,
            icon: const Icon(Icons.add_rounded),
            label: const Text('Add document'),
          ),
        ),
      ],
    );
  }
}

class _DocsList extends StatelessWidget {
  final List<HrDocument> docs;
  final String employeeName;
  const _DocsList({required this.docs, required this.employeeName});

  @override
  Widget build(BuildContext context) {
    // Group documents by kind for at-a-glance browsing. "Other" + nulls
    // sink to the bottom of the list.
    final grouped = <HrDocumentKind?, List<HrDocument>>{};
    for (final d in docs) {
      grouped.putIfAbsent(d.kind, () => []).add(d);
    }
    final orderedKeys = grouped.keys.toList()
      ..sort((a, b) {
        if (a == b) return 0;
        if (a == null || a == HrDocumentKind.other) return 1;
        if (b == null || b == HrDocumentKind.other) return -1;
        return a.label.toLowerCase().compareTo(b.label.toLowerCase());
      });

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 140),
      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
      children: [
        for (final k in orderedKeys) ...[
          _DocSection(
            title: k?.label ?? 'Uncategorised',
            docs: grouped[k]!,
            employeeName: employeeName,
          ),
          const SizedBox(height: 12),
        ],
      ],
    );
  }
}

class _DocSection extends StatelessWidget {
  final String title;
  final List<HrDocument> docs;
  final String employeeName;
  const _DocSection({required this.title, required this.docs, required this.employeeName});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 0, 4, 6),
          child: Text(
            title.toUpperCase(),
            style: RunqText.label.copyWith(color: t.muted2),
          ),
        ),
        Container(
          decoration: BoxDecoration(
            color: t.surface,
            borderRadius: BorderRadius.circular(RunqRadii.smallCard),
            border: Border.all(color: t.hairline, width: 0.5),
            boxShadow: RunqShadows.card,
          ),
          child: Column(
            children: [
              for (var i = 0; i < docs.length; i++) ...[
                _DocRow(doc: docs[i], employeeName: employeeName),
                if (i < docs.length - 1)
                  Divider(height: 1, thickness: 0.5, color: t.hairlineSoft, indent: 56),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _DocRow extends ConsumerWidget {
  final HrDocument doc;
  final String employeeName;
  const _DocRow({required this.doc, required this.employeeName});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    return InkWell(
      onTap: () => _open(context),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            Container(
              width: 36, height: 36,
              decoration: BoxDecoration(
                color: HrColors.tealSubtle,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(
                doc.isImage
                    ? Icons.image_outlined
                    : (doc.isPdf ? Icons.picture_as_pdf_outlined : Icons.insert_drive_file_outlined),
                size: 18, color: HrColors.brand(context),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    doc.fileName,
                    maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: RunqText.bodyStrong.copyWith(color: t.ink),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '${_size(doc.fileSize)} · ${_date(doc.createdAt)}',
                    style: RunqText.caption.copyWith(color: t.muted),
                  ),
                  if (doc.expiryDate != null) ...[
                    const SizedBox(height: 4),
                    _ExpiryChip(expiry: doc.expiryDate!),
                  ],
                ],
              ),
            ),
            IconButton(
              tooltip: 'More',
              icon: Icon(Icons.more_horiz_rounded, color: t.muted),
              visualDensity: VisualDensity.compact,
              onPressed: () => _showMenu(context, ref),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _open(BuildContext context) async {
    if (doc.isImage) {
      // Images render in-app via the same auth'd-photo path the avatar uses.
      Navigator.of(context, rootNavigator: true).push(PageRouteBuilder(
        opaque: false,
        barrierColor: Colors.black.withValues(alpha: 0.92),
        pageBuilder: (_, __, ___) => _DocImageViewer(doc: doc),
        transitionsBuilder: (_, anim, __, c) => FadeTransition(opacity: anim, child: c),
        transitionDuration: const Duration(milliseconds: 200),
      ));
    } else if (doc.isPdf) {
      // PDFs render in-app via PDFView. The viewer's app-bar carries a
      // Share action so the user can hand off to Files / WhatsApp only when
      // they actually want to — tapping the row no longer jumps to share.
      Navigator.of(context, rootNavigator: true).push(
        MaterialPageRoute(builder: (_) => _DocPdfViewer(doc: doc)),
      );
    } else {
      // Anything else (no in-app renderer): download and hand off to the OS
      // share sheet so the user can open in Files / Drive / etc.
      await _downloadAndShare(context);
    }
  }

  Future<void> _downloadAndShare(BuildContext context) async {
    // Snapshot the tapped row's rect *before* the async download so iPad
    // share_plus has a popover anchor (and iOS doesn't throw the
    // "sharePositionOrigin: argument must be …" PlatformException).
    final box = context.findRenderObject() as RenderBox?;
    final origin = (box != null && box.hasSize)
        ? box.localToGlobal(Offset.zero) & box.size
        : Rect.fromCenter(
            center: Offset(MediaQuery.of(context).size.width / 2, 0),
            width: 1, height: 1,
          );
    try {
      showRunqSnack(context, 'Preparing ${doc.fileName}…');
      final bytes = await hrRepo.downloadDocument(doc.id);
      final dir = await getTemporaryDirectory();
      final f = File('${dir.path}/${doc.fileName}');
      await f.writeAsBytes(bytes, flush: true);
      if (!context.mounted) return;
      await Share.shareXFiles(
        [XFile(f.path, mimeType: doc.mimeType, name: doc.fileName)],
        sharePositionOrigin: origin,
      );
    } catch (e) {
      if (context.mounted) {
        showRunqSnack(context, 'Could not download: $e', kind: SnackKind.error);
      }
    }
  }

  void _showMenu(BuildContext outerContext, WidgetRef ref) {
    showModalBottomSheet<void>(
      context: outerContext,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetCtx) {
        final t = RT(sheetCtx);
        final inset = MediaQuery.of(sheetCtx).viewInsets.bottom;
        return Container(
          padding: EdgeInsets.fromLTRB(8, 12, 8, 12 + inset),
          decoration: BoxDecoration(
            color: t.bgWarmer,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
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
              const SizedBox(height: 14),
              // View + Share — primary actions sit together in one card.
              _SheetGroup(rows: [
                _SheetRow(
                  icon: Icons.visibility_outlined,
                  label: 'View / Open',
                  onTap: () {
                    Navigator.of(sheetCtx).pop();
                    _open(outerContext);
                  },
                ),
                _SheetRow(
                  icon: Icons.ios_share_rounded,
                  label: 'Share',
                  onTap: () {
                    Navigator.of(sheetCtx).pop();
                    _downloadAndShare(outerContext);
                  },
                ),
              ]),
              const SizedBox(height: 8),
              // Destructive action in its own card so it visually separates
              // from the safe actions above.
              _SheetGroup(rows: [
                _SheetRow(
                  icon: Icons.delete_outline_rounded,
                  label: 'Delete',
                  danger: true,
                  onTap: () async {
                    Navigator.of(sheetCtx).pop();
                    try {
                      await hrRepo.deleteDocument(doc.id);
                      ref.invalidate(hrEmployeeDocumentsProvider(doc.entityId));
                      if (outerContext.mounted) {
                        showRunqSnack(outerContext, 'Document deleted', kind: SnackKind.success);
                      }
                    } catch (e) {
                      if (outerContext.mounted) {
                        showRunqSnack(outerContext, 'Delete failed: $e', kind: SnackKind.error);
                      }
                    }
                  },
                ),
              ]),
              const SizedBox(height: 6),
              TextButton(
                onPressed: () => Navigator.of(sheetCtx).maybePop(),
                child: Text('Cancel', style: TextStyle(color: t.muted)),
              ),
            ],
          ),
        );
      },
    );
  }

  static String _size(int bytes) {
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(0)} KB';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }

  static String _date(DateTime d) {
    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return '${d.day} ${m[d.month - 1]} ${d.year}';
  }
}
