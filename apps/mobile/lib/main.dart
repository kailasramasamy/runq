import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'providers/theme_mode_provider.dart';
import 'router.dart';
import 'services/share_intake.dart';
import 'theme/runq_theme.dart';
import 'utils/app_info.dart';
import 'widgets/app_update_gate.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await loadAppInfo();
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
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final scaffoldBg = Theme.of(context).scaffoldBackgroundColor;
    final overlay = SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: isDark ? Brightness.light : Brightness.dark,
      statusBarBrightness: isDark ? Brightness.dark : Brightness.light,
      systemNavigationBarColor: scaffoldBg,
      systemNavigationBarIconBrightness: isDark ? Brightness.light : Brightness.dark,
    );
    return AnnotatedRegion<SystemUiOverlayStyle>(value: overlay, child: child);
  }
}
