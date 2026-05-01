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
import 'screens/sales_hub_screen.dart';
import 'screens/purchases_hub_screen.dart';
import 'screens/money_hub_screen.dart';
import 'screens/cash_flow_screen.dart';
import 'screens/reports_screen.dart';
import 'screens/collections_screen.dart';
import 'screens/pay_runs_screen.dart';
import 'screens/pay_run_detail_screen.dart';
import 'screens/approvals_screen.dart';
import 'screens/activity_screen.dart';
import 'screens/gst_hub_screen.dart';
import 'screens/gst_returns_screen.dart';
import 'screens/gst_return_detail_screen.dart';
import 'screens/gst_2b_screen.dart';
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
import 'screens/support_chat_screen.dart';
import 'screens/support_inbox_screen.dart';
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
        // Aliases from the old feature-tab nav. Keeps any cached deep-link or
        // share-extension target valid after the section-hub redesign.
        const aliases = {
          '/invoices': '/sales/invoices',
          '/bills': '/purchases/bills',
          '/banking': '/money/banking',
        };
        final aliased = aliases[loc];
        if (aliased != null) return aliased;
        const protected = {
          '/home', '/sales', '/purchases', '/money',
          '/invoices', '/bills', '/banking',
          '/approvals', '/agent', '/po', '/profile',
        };
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
            GoRoute(path: '/sales', pageBuilder: _fadePage((_) => const SalesHubScreen())),
            GoRoute(path: '/purchases', pageBuilder: _fadePage((_) => const PurchasesHubScreen())),
            GoRoute(path: '/money', pageBuilder: _fadePage((_) => const MoneyHubScreen())),
          ],
        ),
        // Section-hub sub-screens. Existing list/detail screens live under
        // their hub's URL space. Old paths (/invoices, /bills, /banking) are
        // redirected to these by the alias map at the top of the router.
        GoRoute(
          path: '/sales/invoices',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(
            InvoicesScreen(initialTab: state.uri.queryParameters['tab']),
            key: state.pageKey,
          ),
        ),
        GoRoute(
          path: '/sales/collections',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const CollectionsScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/purchases/bills',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(
            BillsScreen(initialTab: state.uri.queryParameters['tab']),
            key: state.pageKey,
          ),
        ),
        GoRoute(
          path: '/purchases/pay-runs',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const PayRunsScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/purchases/pay-runs/:id',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) =>
              _slidePage(PayRunDetailScreen(id: state.pathParameters['id']!), key: state.pageKey),
        ),
        GoRoute(
          path: '/money/banking',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const BankingScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/money/cash-flow',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const CashFlowScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/money/reports',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const ReportsScreen(), key: state.pageKey),
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
          path: '/gst',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const GstHubScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/gst/returns',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const GstReturnsScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/gst/returns/:id',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(
              GstReturnDetailScreen(id: state.pathParameters['id']!),
              key: state.pageKey),
        ),
        GoRoute(
          path: '/gst/2b',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const Gst2bScreen(), key: state.pageKey),
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
          path: '/profile/support',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const SupportInboxScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/profile/help',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(
            SupportChatScreen(initialConversationId: state.uri.queryParameters['id']),
            key: state.pageKey,
          ),
        ),
        GoRoute(
          path: '/profile/help/contact',
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
