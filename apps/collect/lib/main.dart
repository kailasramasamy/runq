import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:dhenu/l10n/app_localizations.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:firebase_core/firebase_core.dart';
import 'firebase_options.dart';
import 'providers/locale_provider.dart';
import 'providers/theme_mode_provider.dart';
import 'router.dart';
import 'services/pour_queue.dart';
import 'services/push_service.dart';
import 'theme/dhenu_theme.dart';
import 'widgets/app_update_gate.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Social sign-in needs the Firebase app. Never block launch on a misconfig —
  // the phone+DOB path works without it.
  try {
    await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  } on FirebaseException catch (e) {
    debugPrint('Firebase init failed: $e');
  }
  // FCM — non-critical; never block launch on a push misconfig.
  try {
    await initFirebaseMessaging();
  } on FirebaseException catch (e) {
    debugPrint('FCM init failed: $e');
  }
  // Offline pour queue — opens its Hive box + connectivity listeners.
  await PourQueue.instance.init();
  runApp(const ProviderScope(child: DhenuApp()));
}

class DhenuApp extends ConsumerWidget {
  const DhenuApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: 'Dhenu',
      debugShowCheckedModeBanner: false,
      theme: DhenuTheme.light(),
      darkTheme: DhenuTheme.dark(),
      themeMode: ref.watch(themeModeProvider),
      locale: ref.watch(localeProvider),
      // Only locales with an .arb are truly supported; others fall back to English.
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      builder: (ctx, child) => _SystemChromeSync(
        child: AppUpdateGate(child: child ?? const SizedBox()),
      ),
      routerConfig: ref.watch(routerProvider),
    );
  }
}

/// Keeps the status / nav bar styling in step with the active brightness.
class _SystemChromeSync extends StatelessWidget {
  final Widget child;
  const _SystemChromeSync({required this.child});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bg = Theme.of(context).scaffoldBackgroundColor;
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: isDark ? Brightness.light : Brightness.dark,
        statusBarBrightness: isDark ? Brightness.dark : Brightness.light,
        systemNavigationBarColor: bg,
        systemNavigationBarIconBrightness: isDark ? Brightness.light : Brightness.dark,
      ),
      child: child,
    );
  }
}
