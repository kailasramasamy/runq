import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:path_provider/path_provider.dart';
import 'package:receive_sharing_intent/receive_sharing_intent.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../providers/auth_provider.dart';
import '../router.dart';
import '../widgets/open_po_picker_sheet.dart';
import '../widgets/runq_snack.dart';
import '../widgets/share_destination_sheet.dart';
import 'order_intake.dart';
import 'scan_compiler.dart';

/// Listens for files shared into runQ from other apps (Files, Photos, Mail,
/// WhatsApp, etc.) and routes them through the PO processing flow.
///
/// Wraps the app shell so we can keep one subscription for the process lifetime.
/// Cold-start shares (app was launched by the share action) come in via
/// `getInitialMedia()`; warm-start shares come through the stream.
class ShareIntakeHost extends ConsumerStatefulWidget {
  final Widget child;
  const ShareIntakeHost({super.key, required this.child});

  @override
  ConsumerState<ShareIntakeHost> createState() => _ShareIntakeHostState();
}

class _ShareIntakeHostState extends ConsumerState<ShareIntakeHost> {
  static const _iosChannel = MethodChannel('runq.in/share-files');

  StreamSubscription<List<SharedMediaFile>>? _sub;

  /// Paths handled recently, used to swallow duplicate deliveries of a single
  /// cold-start share (see [_handlePath]).
  final Map<String, DateTime> _recentShares = {};
  static const _shareDedupeWindow = Duration(seconds: 10);

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

    // Hold the share across sign-in when the session isn't ready — cold start
    // still restoring, logged out, or expired. Otherwise the destination
    // screen 401s and the shared file (the whole point) is silently lost. The
    // authProvider listener in build() replays it once the session is valid.
    // Stashing is idempotent, so it needs no de-dupe (and the replay re-enters
    // _handlePath with the same path — de-duping here would drop it).
    final auth = ref.read(authProvider);
    if (auth.isLoading || !auth.isAuthenticated) {
      _PendingShare.stash(path);
      return;
    }

    // Cold-start shares get delivered more than once: getInitialMedia() and the
    // media stream both fire for the same file, and iOS can re-forward it. A
    // duplicate would pop a SECOND destination sheet over the user's first pick
    // — wiping their selection and forcing them to re-share. Drop repeats of the
    // same file within a short window; a deliberate re-share later still passes
    // once the entry ages out.
    final now = DateTime.now();
    _recentShares.removeWhere((_, t) => now.difference(t) > _shareDedupeWindow);
    if (_recentShares.containsKey(path)) return;
    _recentShares[path] = now;

    _present(file);
  }

  /// Present the sheet once the app has settled on a real screen.
  ///
  /// Splash navigates to /home with context.go only after auth AND a role
  /// network call resolve — the same auth-ready trigger that replays the share.
  /// Presenting before that lands lets the go() replace the route stack and
  /// dismiss the sheet a frame after it opens (flash, then home). The role
  /// fetch makes the wait variable, so we drive off router navigation events
  /// rather than racing or polling: present the moment we leave splash/sign-in.
  void _present(File file) {
    final info = ref.read(routerProvider).routeInformationProvider;
    var done = false;
    Timer? poll;

    void check() {
      if (done) return;
      if (!mounted) {
        done = true;
        poll?.cancel();
        info.removeListener(check);
        return;
      }
      // info.value updates synchronously on context.go, so this reads the live
      // location whether we're driven by the listener or the poll.
      final loc = info.value.uri.path;
      if (loc == '/splash' || loc == '/signin') return; // not landed yet
      done = true;
      poll?.cancel();
      info.removeListener(check);
      // Defer one frame: the router notification fires mid-navigation, before
      // the destination page is built — showing a sheet there is a silent
      // no-op (the bug). A postFrame guarantees a stable navigator to host it.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        final ctx = rootKey.currentContext;
        if (mounted && ctx != null) unawaited(_showDestination(ctx, file));
      });
    }

    info.addListener(check);
    // Poll as a fallback in case the navigation notification is missed; capped
    // so a user who never gets past sign-in doesn't spin forever.
    poll = Timer.periodic(const Duration(milliseconds: 250), (t) {
      if (done || t.tick > 80) t.cancel(); // ~20s ceiling
      check();
    });
    check();
  }

  /// Bills (AP) and customer POs (AR) use completely different pipelines —
  /// items master matching, GL posting, document type. Ask which one they
  /// shared rather than guessing, then route.
  Future<void> _showDestination(BuildContext ctx, File file) async {
    final dest = await showShareDestinationSheet(ctx);
    if (dest == null || !ctx.mounted) return; // user dismissed

    switch (dest) {
      case ShareDestination.vendorBill:
        final prepared = await _prepareForBill(ctx, file);
        if (!ctx.mounted || prepared == null) return;
        ctx.push('/bills/extract', extra: prepared);
        break;
      case ShareDestination.customerPo:
        openOrderProcessing(ctx, file, source: 'share_sheet');
        break;
      case ShareDestination.quickPayment:
        // Pass the original file (colour screenshot) straight through — the
        // payment-made screen OCRs it to pre-fill, and keeps it as proof.
        ctx.push('/payment-made', extra: file);
        break;
      case ShareDestination.receiveAgainstPo:
        // Compress images the same way the bill flow does — the scan endpoint
        // accepts both PDF and JPEG, so this just keeps uploads small.
        final prepared = await _prepareForBill(ctx, file);
        if (!ctx.mounted || prepared == null) return;
        final poId = await showOpenPoPickerSheet(ctx);
        if (poId == null || !ctx.mounted) return;
        ctx.push('/purchase/pos/$poId/scan-receive', extra: prepared);
        break;
    }
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

  /// Replay a share that was stashed while the session wasn't ready. Safe to
  /// call repeatedly — [_PendingShare.take] clears the store, so extra calls
  /// no-op.
  Future<void> _maybeReplay() async {
    if (!ref.read(authProvider).isAuthenticated) return;
    final path = await _PendingShare.take();
    if (path != null) _handlePath(path);
  }

  @override
  Widget build(BuildContext context) {
    // Replay the moment sign-in completes — covers cold start and re-login
    // after expiry. Because the store is durable, this also fires on the first
    // authenticated state of a fresh process, so a share whose login was
    // interrupted by an OS kill still lands.
    ref.listen<AuthState>(authProvider, (_, next) {
      if (next.isAuthenticated) unawaited(_maybeReplay());
    });
    return widget.child;
  }
}

/// A file shared into runQ while the session wasn't ready (cold start mid-load,
/// logged out, or expired). Held across sign-in — in memory for the common
/// same-process case, and mirrored to the documents dir (+ a prefs pointer) so
/// it also survives the OS killing the app mid-login. Replayed once auth
/// succeeds, so the share is never silently dropped.
class _PendingShare {
  static const _prefKey = 'pending_share_path';
  static String? _memPath; // original shared path, valid within this process

  /// Remember [srcPath]: synchronous in-memory set (wins the common case and
  /// sidesteps any copy race) plus a best-effort durable mirror on disk.
  static void stash(String srcPath) {
    _memPath = srcPath;
    unawaited(_persist(srcPath));
  }

  /// Only ever called while logged out, so no open screen can be holding the
  /// previous copy — safe to wipe the dir and keep just one pending file.
  static Future<void> _persist(String srcPath) async {
    try {
      final base = await getApplicationDocumentsDirectory();
      final dir = Directory('${base.path}/pending_share');
      if (dir.existsSync()) {
        try { await dir.delete(recursive: true); } catch (_) {}
      }
      await dir.create(recursive: true);
      final dest = '${dir.path}/${srcPath.split(Platform.pathSeparator).last}';
      await File(srcPath).copy(dest);
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_prefKey, dest);
    } catch (_) {
      // Durability is best-effort; the in-memory path still covers a login
      // completed within the same process.
    }
  }

  /// Return the pending share (in-memory original first, else the durable copy)
  /// and clear both pointers. The file is left on disk for the destination
  /// screen to read; the durable copy is reclaimed by the next [stash].
  static Future<String?> take() async {
    final mem = _memPath;
    _memPath = null;
    final prefs = await SharedPreferences.getInstance();
    final disk = prefs.getString(_prefKey);
    await prefs.remove(_prefKey);
    if (mem != null && File(mem).existsSync()) return mem;
    if (disk != null && File(disk).existsSync()) return disk;
    return null;
  }
}
