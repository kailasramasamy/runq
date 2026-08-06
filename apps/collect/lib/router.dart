import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'providers/auth_provider.dart';
import 'providers/notification_providers.dart';
import 'screens/auth/splash_screen.dart';
import 'screens/auth/login_screen.dart';
import 'screens/home_dispatcher.dart';
import 'screens/dev/gallery_screen.dart';

final routerProvider = Provider<GoRouter>((ref) => _build(ref));

/// Root navigator key — lets non-widget code (FCM tap handler) navigate.
final rootNavigatorKey = GlobalKey<NavigatorState>();

/// Re-read the inbox from non-widget code (the FCM foreground listener), so the
/// bell's unread badge tracks a push that arrives while the app is open.
void refreshNotificationFeed() {
  final ctx = rootNavigatorKey.currentState?.context;
  if (ctx == null) return;
  ProviderScope.containerOf(ctx, listen: false).invalidate(notificationFeedProvider);
}

/// Tab targets a notification may point at. These are NOT GoRouter routes —
/// every persona lives inside one `/home` shell whose tabs differ by role, so
/// the payload names the tab symbolically and the mounted shell maps it to its
/// own index (see RoleShell.deepLinkTabs).
const _shellTargets = {'/receive', '/dispatch'};

/// GoRouter paths this app actually serves. Device tokens are keyed by user, not
/// by app, so a user who is both a dairy operator and an employee receives runq
/// HR pushes on this device too — and those carry HR targets like `/hr/payslips`
/// that GoRouter would answer with an error page. An unknown target opens the
/// app at home instead of breaking navigation.
const _knownRoutes = {'/home', '/login', '/splash', '/gallery'};

/// Route a notification tap. Only follows app-internal paths (starting with
/// `/`); anything else is ignored so an unexpected payload can't crash nav.
void openNotificationTarget(String target) {
  if (!target.startsWith('/')) return;
  final ctx = rootNavigatorKey.currentState?.context;
  if (ctx == null) return;
  if (_shellTargets.contains(target)) {
    // Park it for the shell to consume, then make sure the shell is on screen.
    ProviderScope.containerOf(ctx, listen: false)
        .read(pendingDeepLinkProvider.notifier)
        .state = target.substring(1);
    if (GoRouter.of(ctx).state.matchedLocation != '/home') ctx.go('/home');
    return;
  }
  ctx.go(_knownRoutes.contains(target) ? target : '/home');
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
