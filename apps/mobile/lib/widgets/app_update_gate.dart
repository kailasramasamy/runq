import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import '../services/app_version_service.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';

/// Wraps the app's content and shows an update prompt when the manifest
/// from `/public/app/version` says the running version is behind. Designed
/// to be mounted once near the root of the widget tree (above the
/// router) so the dialog survives navigation.
///
/// - `forced` requirement → blocking AlertDialog with no dismiss path; the
///   only action launches the platform store URL.
/// - `optional` requirement → dismissable dialog ("Later" / "Update now").
///   Per-session: once dismissed, we don't nag again until the next launch.
/// - `none` → no UI.
///
/// Failures fetching the manifest are silent — we never block the app over
/// a network error or missing config.
class AppUpdateGate extends ConsumerStatefulWidget {
  final Widget child;
  const AppUpdateGate({super.key, required this.child});

  @override
  ConsumerState<AppUpdateGate> createState() => _AppUpdateGateState();
}

class _AppUpdateGateState extends ConsumerState<AppUpdateGate> {
  bool _shown = false;
  bool _dismissedThisSession = false;

  @override
  Widget build(BuildContext context) {
    // Skip the entire flow on web/desktop — the manifest assumes mobile.
    if (kIsWeb) return widget.child;

    ref.listen<AsyncValue<UpdateCheck>>(appVersionCheckProvider, (_, next) {
      next.whenData((check) {
        if (_shown) return;
        // Maintenance mode short-circuits everything else — show the blocker.
        if (check.config.maintenance.enabled) {
          // Maintenance is rendered in build() below via a synchronous overlay,
          // not a dialog, so no work needed here.
          return;
        }
        if (check.requirement == UpdateRequirement.none) return;
        if (check.requirement == UpdateRequirement.optional && _dismissedThisSession) return;
        final url = check.storeUrlForPlatform;
        if (url.isEmpty) return; // Not configured for this platform — skip.

        _shown = true;
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (!mounted) return;
          _show(check);
        });
      });
    });

    // Maintenance overlay: full-screen blocking message, no escape. Synchronous
    // rendering so it survives navigation and works even before the dialog
    // system is ready.
    final asyncCheck = ref.watch(appVersionCheckProvider);
    final maintenance = asyncCheck.maybeWhen(
      data: (c) => c.config.maintenance.enabled ? c.config.maintenance : null,
      orElse: () => null,
    );
    if (maintenance != null) {
      return _MaintenanceScreen(message: maintenance.message);
    }

    return widget.child;
  }

  Future<void> _show(UpdateCheck check) async {
    final isForced = check.requirement == UpdateRequirement.forced;
    final res = await showDialog<bool>(
      context: context,
      barrierDismissible: !isForced,
      builder: (ctx) => PopScope(
        canPop: !isForced,
        child: _UpdateDialog(check: check),
      ),
    );

    if (res == true) {
      final url = check.storeUrlForPlatform;
      final uri = Uri.parse(url);
      // External application launch so the user lands directly on the store
      // listing instead of an in-app web view.
      await launchUrl(uri, mode: LaunchMode.externalApplication);
      // For forced updates, the dialog re-mounts on next frame because
      // _shown stays true until the user actually updates. Keep it open
      // so they can't dodge.
      if (isForced && mounted) {
        _shown = false; // allow re-trigger next listen tick
        // Re-show synchronously rather than waiting for the listen
        // callback — the listen only fires when state actually changes.
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) _show(check);
        });
      }
    } else if (!isForced) {
      _dismissedThisSession = true;
    }
    // Reset the latch for forced flows so we'll re-prompt next change. For
    // optional, _dismissedThisSession blocks reopen anyway.
    if (!isForced) _shown = false;
  }
}

class _UpdateDialog extends StatelessWidget {
  final UpdateCheck check;
  const _UpdateDialog({required this.check});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final isForced = check.requirement == UpdateRequirement.forced;
    final title = isForced ? 'Update required' : 'Update available';
    // Prefer the server-provided message for forced updates so admins can
    // tailor the copy per release; fall back to a sensible default.
    final body = isForced
        ? (check.config.forceUpdateMessage.isNotEmpty
            ? check.config.forceUpdateMessage
            : "This version of runQ is out of date and can't be used until you update. The new version has important fixes.")
        : 'A newer version of runQ is available with improvements and fixes.';

    return AlertDialog(
      title: Text(title),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(body),
          const SizedBox(height: 12),
          Text(
            'You have ${check.runningVersion}. Latest is ${check.config.currentVersion}.',
            style: RunqText.caption.copyWith(color: t.muted, fontSize: 12),
          ),
        ],
      ),
      actions: [
        if (!isForced)
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Later'),
          ),
        FilledButton(
          onPressed: () => Navigator.of(context).pop(true),
          style: FilledButton.styleFrom(backgroundColor: RunqColors.indigo),
          child: const Text('Update now'),
        ),
      ],
    );
  }
}

/// Full-screen blocker shown while the platform is in maintenance mode.
/// Replaces the entire app tree — there is intentionally no way to bypass.
class _MaintenanceScreen extends StatelessWidget {
  final String message;
  const _MaintenanceScreen({required this.message});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: Theme.of(context),
      home: Scaffold(
        backgroundColor: t.surface,
        body: SafeArea(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 32),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.construction, size: 64, color: RT(context).brand),
                  const SizedBox(height: 24),
                  Text(
                    "We'll be right back",
                    textAlign: TextAlign.center,
                    style: RunqText.h1.copyWith(color: t.ink),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    message.isNotEmpty
                        ? message
                        : 'runQ is undergoing scheduled maintenance. Please try again in a few minutes.',
                    textAlign: TextAlign.center,
                    style: RunqText.body.copyWith(color: t.muted),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
