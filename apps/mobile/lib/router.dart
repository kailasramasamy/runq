import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'providers/auth_provider.dart';
import 'shell/root_shell.dart';
import 'screens/dashboard_screen.dart';
import 'screens/invoices_screen.dart';
import 'screens/invoice_detail_screen.dart';
import 'dart:io';
import 'screens/bills_screen.dart';
import 'screens/bill_extract_screen.dart';
import 'screens/banking_screen.dart';
import 'screens/approvals_screen.dart';
import 'screens/activity_screen.dart';
import 'screens/agent_screen.dart';
import 'screens/bill_detail_screen.dart';
import 'screens/bill_edit_screen.dart';
import 'screens/attachment_viewer_screen.dart';
import 'api/models.dart' show BillAttachment;
import 'screens/profile_screen.dart';
import 'screens/about_screen.dart';
import 'screens/personal_info_screen.dart';
import 'screens/notifications_settings_screen.dart';
import 'screens/appearance_screen.dart';
import 'screens/help_screen.dart';
import 'screens/po_draft_review_screen.dart';
import 'screens/po_processing_screen.dart';
import 'screens/search_screen.dart';
import 'screens/signin_screen.dart';
import 'screens/splash_screen.dart';
import 'services/po_intake.dart';

final rootKey = GlobalKey<NavigatorState>();
final shellKey = GlobalKey<NavigatorState>();

final routerProvider = Provider<GoRouter>((ref) => _buildRouter(ref));

GoRouter _buildRouter(Ref ref) => GoRouter(
      navigatorKey: rootKey,
      initialLocation: '/splash',
      refreshListenable: _AuthListenable(ref),
      redirect: (ctx, state) {
        final auth = ref.read(authProvider);
        final loc = state.matchedLocation;
        const protected = {'/home', '/invoices', '/bills', '/banking', '/approvals', '/agent', '/po', '/profile'};
        final isProtected = protected.any(loc.startsWith);
        if (auth.sessionExpired && loc != '/signin' && loc != '/splash') {
          return '/signin?session=expired';
        }
        if (isProtected && !auth.isAuthenticated && !auth.isLoading) {
          return '/signin';
        }
        return null;
      },
      routes: [
        GoRoute(
          path: '/splash',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => CustomTransitionPage(
            child: const SplashScreen(),
            transitionDuration: const Duration(milliseconds: 280),
            transitionsBuilder: (_, anim, __, c) => FadeTransition(opacity: anim, child: c),
          ),
        ),
        GoRoute(
          path: '/signin',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) {
            final expired = state.uri.queryParameters['session'] == 'expired';
            return CustomTransitionPage(
              child: SignInScreen(sessionExpired: expired),
              transitionDuration: const Duration(milliseconds: 320),
              transitionsBuilder: (_, anim, __, c) => FadeTransition(opacity: anim, child: c),
            );
          },
        ),
        ShellRoute(
          navigatorKey: shellKey,
          builder: (context, state, child) => RootShell(state: state, child: child),
          routes: [
            GoRoute(path: '/home', pageBuilder: _fadePage((_) => const DashboardScreen())),
            GoRoute(path: '/invoices', pageBuilder: _fadePage((_) => const InvoicesScreen())),
            GoRoute(path: '/bills', pageBuilder: _fadePage((_) => const BillsScreen())),
            GoRoute(path: '/banking', pageBuilder: _fadePage((_) => const BankingScreen())),
          ],
        ),
        GoRoute(
          path: '/invoices/:id',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(InvoiceDetailScreen(id: state.pathParameters['id']!), key: state.pageKey),
        ),
        GoRoute(
          path: '/bills/extract',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) {
            final file = state.extra as File?;
            if (file == null) {
              return _slidePage(const _MissingFileFallback(), key: state.pageKey);
            }
            return _slidePage(BillExtractScreen(file: file), key: state.pageKey);
          },
        ),
        GoRoute(
          path: '/po/processing',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) {
            final args = state.extra as PoIntakeArgs?;
            if (args == null) {
              return _slidePage(const _MissingFileFallback(), key: state.pageKey);
            }
            return _slidePage(PoProcessingScreen(file: args.file, source: args.source), key: state.pageKey);
          },
        ),
        GoRoute(
          path: '/po-drafts/:id',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) =>
              _slidePage(PoDraftReviewScreen(uploadId: state.pathParameters['id']!), key: state.pageKey),
        ),
        GoRoute(
          path: '/bills/:id',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(BillDetailScreen(id: state.pathParameters['id']!), key: state.pageKey),
        ),
        GoRoute(
          path: '/bills/:id/edit',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(BillEditScreen(billId: state.pathParameters['id']!), key: state.pageKey),
        ),
        GoRoute(
          path: '/attachments/view',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) {
            final att = state.extra as BillAttachment;
            return _slidePage(AttachmentViewerScreen(attachment: att), key: state.pageKey);
          },
        ),
        GoRoute(
          path: '/activity',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const ActivityScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/profile',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const ProfileScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/about',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const AboutScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/profile/personal',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const PersonalInfoScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/profile/notifications',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const NotificationsSettingsScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/profile/appearance',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const AppearanceScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/profile/help',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const HelpScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/search',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const SearchScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/approvals',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const ApprovalsScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/agent',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const AgentScreen(), key: state.pageKey),
        ),
      ],
    );

CustomTransitionPage _slidePage(Widget child, {LocalKey? key}) => CustomTransitionPage(
      key: key,
      child: child,
      transitionDuration: const Duration(milliseconds: 220),
      transitionsBuilder: (_, anim, __, c) => FadeTransition(
        opacity: anim,
        child: SlideTransition(
          position: Tween(begin: const Offset(0, 0.04), end: Offset.zero)
              .chain(CurveTween(curve: Curves.easeOutCubic))
              .animate(anim),
          child: c,
        ),
      ),
    );

GoRouterPageBuilder _fadePage(Widget Function(GoRouterState) build) =>
    (ctx, state) => CustomTransitionPage(
          key: state.pageKey,
          child: build(state),
          transitionDuration: const Duration(milliseconds: 180),
          transitionsBuilder: (_, anim, __, c) => FadeTransition(opacity: anim, child: c),
        );

class _MissingFileFallback extends StatelessWidget {
  const _MissingFileFallback();

  @override
  Widget build(BuildContext context) {
    // Defensive: someone pushed /bills/extract without a File. Just bail.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (Navigator.of(context).canPop()) Navigator.of(context).pop();
    });
    return const Scaffold(body: SizedBox.shrink());
  }
}

class _AuthListenable extends ChangeNotifier {
  _AuthListenable(this._ref) {
    _sub = _ref.listen<AuthState>(authProvider, (_, __) => notifyListeners());
  }
  final Ref _ref;
  late final ProviderSubscription<AuthState> _sub;

  @override
  void dispose() {
    _sub.close();
    super.dispose();
  }
}
