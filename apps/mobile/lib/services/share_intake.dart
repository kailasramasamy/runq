import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:receive_sharing_intent/receive_sharing_intent.dart';
import '../router.dart';
import '../widgets/open_po_picker_sheet.dart';
import '../widgets/runq_snack.dart';
import '../widgets/share_destination_sheet.dart';
import 'po_intake.dart';
import 'scan_compiler.dart';

/// Listens for files shared into runQ from other apps (Files, Photos, Mail,
/// WhatsApp, etc.) and routes them through the PO processing flow.
///
/// Wraps the app shell so we can keep one subscription for the process lifetime.
/// Cold-start shares (app was launched by the share action) come in via
/// `getInitialMedia()`; warm-start shares come through the stream.
class ShareIntakeHost extends StatefulWidget {
  final Widget child;
  const ShareIntakeHost({super.key, required this.child});

  @override
  State<ShareIntakeHost> createState() => _ShareIntakeHostState();
}

class _ShareIntakeHostState extends State<ShareIntakeHost> {
  static const _iosChannel = MethodChannel('runq.in/share-files');

  StreamSubscription<List<SharedMediaFile>>? _sub;

  @override
  void initState() {
    super.initState();

    // Stream-based source — Android ACTION_SEND, iOS Share Extension (if added).
    _sub = ReceiveSharingIntent.instance.getMediaStream().listen(
      (files) => _handlePath(files.firstOrNull?.path),
    );
    ReceiveSharingIntent.instance.getInitialMedia().then((files) {
      _handlePath(files.firstOrNull?.path);
      ReceiveSharingIntent.instance.reset();
    });

    // iOS "Open in runQ" — a file:// URL that AppDelegate forwards over a
    // method channel after intercepting it (so go_router doesn't see it).
    if (Platform.isIOS) {
      _iosChannel.setMethodCallHandler((call) async {
        if (call.method == 'onFile') {
          _handlePath(call.arguments as String?);
        }
        return null;
      });
      _iosChannel.invokeMethod<String?>('getInitialFile').then(_handlePath);
    }
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  void _handlePath(String? path) {
    if (path == null || path.isEmpty) return;
    final file = File(path);
    if (!file.existsSync()) return;

    // Defer until the navigator is mounted — covers the cold-start case where
    // initial media arrives before the splash → home redirect lands.
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final ctx = rootKey.currentContext;
      if (ctx == null) return;

      // Bills (AP) and customer POs (AR) use completely different
      // pipelines — items master matching, GL posting, document type. Ask
      // the user which one they shared rather than guessing.
      final dest = await showShareDestinationSheet(ctx);
      if (dest == null) return; // user dismissed
      if (!ctx.mounted) return;

      switch (dest) {
        case ShareDestination.vendorBill:
          final prepared = await _prepareForBill(ctx, file);
          if (!ctx.mounted || prepared == null) return;
          ctx.push('/bills/extract', extra: prepared);
          break;
        case ShareDestination.customerPo:
          openPoProcessing(ctx, file, source: 'share_sheet');
          break;
        case ShareDestination.quickPayment:
          // Pass the original file (colour screenshot) straight through — the
          // payment-made screen OCRs it to pre-fill, and keeps it as proof.
          ctx.push('/payment-made', extra: file);
          break;
        case ShareDestination.receiveAgainstPo:
          // Compress images the same way the bill flow does — the scan
          // endpoint accepts both PDF and JPEG, so this just keeps
          // uploads small.
          final prepared = await _prepareForBill(ctx, file);
          if (!ctx.mounted || prepared == null) return;
          final poId = await showOpenPoPickerSheet(ctx);
          if (poId == null || !ctx.mounted) return;
          ctx.push('/purchase/pos/$poId/scan-receive', extra: prepared);
          break;
      }
    });
  }

  /// Shared images (WhatsApp, Photos, etc.) come in as full-resolution colour
  /// JPEG/PNG/HEIC and bloat attachment storage. Run them through the same
  /// grayscale + JPEG-q75 PDF compiler the camera scan path uses. PDFs pass
  /// through untouched — they're already compact and AI handles them natively.
  Future<File?> _prepareForBill(BuildContext context, File file) async {
    if (!_isImage(file.path)) return file;
    try {
      return await compileScansToPdf([file], grayscale: true);
    } catch (e) {
      debugPrint('[share-intake] PDF compile failed: $e');
      if (context.mounted) {
        showRunqSnack(context, 'Could not compress image. Uploading as-is.', kind: SnackKind.error);
      }
      return file;
    }
  }

  bool _isImage(String path) {
    final ext = path.toLowerCase().split('.').last;
    return const {'jpg', 'jpeg', 'png', 'heic', 'heif', 'webp'}.contains(ext);
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
