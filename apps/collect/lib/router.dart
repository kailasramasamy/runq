import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'providers/auth_provider.dart';
import 'screens/auth/splash_screen.dart';
import 'screens/auth/login_screen.dart';
import 'screens/home_dispatcher.dart';
import 'screens/dev/gallery_screen.dart';

final routerProvider = Provider<GoRouter>((ref) => _build(ref));

/// Root navigator key — lets non-widget code (FCM tap handler) navigate.
final rootNavigatorKey = GlobalKey<NavigatorState>();

/// Route a notification tap. Only follows app-internal paths (starting with
/// `/`); anything else is ignored so an unexpected payload can't crash nav.
void openNotificationTarget(String target) {
  if (!target.startsWith('/')) return;
  rootNavigatorKey.currentState?.context.go(target);
}

GoRouter _build(Ref ref) => GoRouter(
      navigatorKey: rootNavigatorKey,
      initialLocation: '/splash',
      refreshListenable: _AuthListenable(ref),
      redirect: (ctx, state) {
        final auth = ref.read(authProvider);
        final loc = state.matchedLocation;

        if (auth.isLoading) return loc == '/splash' ? null : '/splash';

        if (kDebugMode && loc == '/gallery') return null; // dev-only QA surface
        final atAuth = loc == '/login' || loc == '/splash';
        if (!auth.isAuthenticated) {
          return loc == '/login' ? null : '/login';
        }
        // Authenticated: get them off the auth/splash screens.
        if (atAuth) return '/home';
        return null;
      },
      routes: [
        // Animated in-app splash shown while the session restores. No page
        // transition so it doesn't visibly slide into home/login.
        GoRoute(path: '/splash',
            pageBuilder: (_, _) => const NoTransitionPage(child: SplashScreen())),
        GoRoute(path: '/login', builder: (_, _) => const LoginScreen()),
        GoRoute(path: '/home',
            pageBuilder: (_, _) => const NoTransitionPage(child: HomeDispatcher())),
        if (kDebugMode) GoRoute(path: '/gallery', builder: (_, _) => const GalleryScreen()),
      ],
    );

/// Re-runs the router redirect whenever the auth session changes.
class _AuthListenable extends ChangeNotifier {
  _AuthListenable(Ref ref) {
    _sub = ref.listen<AuthState>(authProvider, (_, _) => notifyListeners());
  }
  late final ProviderSubscription<AuthState> _sub;

  @override
  void dispose() {
    _sub.close();
    super.dispose();
  }
}
