import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'providers/theme_mode_provider.dart';
import 'router.dart';
import 'services/push_service.dart';
import 'services/share_intake.dart';
import 'services/wo_run_queue.dart';
import 'theme/runq_theme.dart';
import 'utils/app_info.dart';
import 'widgets/app_update_gate.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await loadAppInfo();
  // Sign-in (Google/Apple) needs the Firebase app, so initialise it up front
  // and independently of FCM. Without it the login screen can't authenticate.
  try {
    await initFirebase();
  } on Exception catch (e) {
    debugPrint('Firebase init failed: $e');
  }
  try {
    await initFirebaseMessaging();
  } on Exception catch (e) {
    // Push is non-critical — never block app launch on a Firebase misconfig.
    debugPrint('FCM init failed: $e');
  }
  try {
    // Manufacturing WO Run offline queue — see services/wo_run_queue.dart.
    // Init is fire-and-forget for app launch; the queue is no-op until ready.
    await WoRunQueue.instance.init();
  } on Exception catch (e) {
    debugPrint('WoRunQueue init failed: $e');
  }
  runApp(const ProviderScope(child: RunqApp()));
}

class RunqApp extends ConsumerWidget {
  const RunqApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: 'runQ',
      debugShowCheckedModeBanner: false,
      theme: RunqTheme.light(),
      darkTheme: RunqTheme.dark(),
      themeMode: ref.watch(themeModeProvider),
      builder: (ctx, child) => ShareIntakeHost(
        child: AppUpdateGate(
          child: _SystemChromeSync(child: child ?? const SizedBox()),
        ),
      ),
      routerConfig: ref.watch(routerProvider),
    );
  }
}

/// Syncs status bar / nav bar styling with the active brightness so the
/// system chrome matches whichever theme the OS picked.
class _SystemChromeSync extends StatelessWidget {
  final Widget child;
  const _SystemChromeSync({required this.child});

  @override
  Widget build(BuildContext context) {
    // Icon brightness only — see [RunqSystemBars] for why no colours. Under
    // edge-to-edge the bars are transparent by construction, so there is
    // nothing left to colour.
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: RunqSystemBars.forBrightness(Theme.of(context).brightness),
      child: child,
    );
  }
}
