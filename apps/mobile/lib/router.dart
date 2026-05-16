import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'providers/auth_provider.dart';
import 'shell/root_shell.dart';
import 'screens/dashboard_screen.dart';
import 'screens/invoices_screen.dart';
import 'screens/invoice_detail_screen.dart';
import 'screens/new_invoice_screen.dart';
import 'screens/expense_detail_screen.dart';
import 'screens/expenses_screen.dart';
import 'screens/new_expense_screen.dart';
import 'screens/inbox_screen.dart';
import 'screens/po_inbox_screen.dart';
import 'screens/quick_invoice_generate_screen.dart';
import 'screens/quick_invoice_templates_screen.dart';
import 'dart:io';
import 'screens/bills_screen.dart';
import 'screens/bill_extract_screen.dart';
import 'screens/banking_screen.dart';
import 'screens/sales_hub_screen.dart';
import 'screens/purchases_hub_screen.dart';
import 'screens/money_hub_screen.dart';
import 'screens/analytics_screen.dart';
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
import 'screens/hr/hr_home_screen.dart';
import 'screens/hr/hr_people_screen.dart';
import 'screens/hr/hr_employee_detail_screen.dart';
import 'screens/hr/hr_time_screen.dart';
import 'screens/hr/hr_pay_screen.dart';
import 'screens/hr/hr_payslip_detail_screen.dart';
import 'screens/hr/hr_more_screen.dart';
import 'screens/hr/hr_holidays_screen.dart';
import 'screens/hr/hr_leave_types_screen.dart';
import 'screens/hr/hr_employee_form_screen.dart';
import 'screens/hr/hr_expense_claims_screen.dart';
import 'screens/hr/hr_salary_components_screen.dart';
import 'screens/hr/hr_salary_structures_screen.dart';
import 'screens/hr/hr_payroll_runs_screen.dart';
import 'api/hr_models.dart' show HrEmployee, HrExpenseClaim;
import 'providers/app_role_provider.dart';
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
          '/hr',
        };
        final isProtected = protected.any(loc.startsWith);
        if (auth.sessionExpired && loc != '/signin' && loc != '/splash') {
          return '/signin?session=expired';
        }
        if (isProtected && !auth.isAuthenticated && !auth.isLoading) {
          return '/signin';
        }

        // Role-based gating. Skip while still on splash/signin — we don't
        // want to bounce a half-authed user around. Also skip when /hr/me
        // is still loading, otherwise an admin flashes /hr/home for a beat
        // before being moved to /home.
        if (!auth.isAuthenticated || loc == '/splash' || loc == '/signin') {
          return null;
        }
        final roleAsync = ref.read(appRoleAsyncProvider);
        final role = roleAsync.asData?.value;
        if (role == null) return null; // wait for /hr/me

        // Finance + sibling surfaces are admin-only. Non-admins land in HR.
        const financeRoots = {
          '/home', '/sales', '/purchases', '/money',
          '/banking', '/invoices', '/bills', '/expenses',
          '/po', '/po-inbox', '/po-drafts',
          '/agent', '/approvals', '/inbox',
          '/quick-invoice',
        };
        final inFinanceRoot = financeRoots.any(loc.startsWith);
        if (inFinanceRoot && !role.canAccessFinance) {
          return '/hr/home';
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
            // HR Home is the only HR surface that keeps the bot nav. The
            // other "tabs" (People/Time/Pay) live outside the shell so
            // any drill-down from Home reads as a focused workspace with
            // a back arrow — no chrome competing for attention.
            GoRoute(path: '/hr/home', pageBuilder: _fadePage((_) => const HrHomeScreen())),
          ],
        ),
        // HR drill-downs — pushed via the root navigator so the bot nav
        // disappears and each screen takes the full viewport. Reachable
        // from Home cards/banners + from the bot nav (which still lists
        // them as convenience entry points while on Home).
        GoRoute(
          path: '/hr/people',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const HrPeopleScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/hr/time',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const HrTimeScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/hr/pay',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(
            HrPayScreen(initialTab: state.uri.queryParameters['tab']),
            key: state.pageKey,
          ),
        ),
        // Push-style routes for HR detail screens — kept outside the shell
        // so the bottom nav doesn't repaint while drilling in.
        GoRoute(
          path: '/hr/people/:id',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(
            HrEmployeeDetailScreen(id: state.pathParameters['id']!),
            key: state.pageKey,
          ),
        ),
        GoRoute(
          path: '/hr/payslips/:runId/:payslipId',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(
            HrPayslipDetailScreen(
              runId: state.pathParameters['runId']!,
              payslipId: state.pathParameters['payslipId']!,
            ),
            key: state.pageKey,
          ),
        ),
        GoRoute(
          path: '/hr/more',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const HrMoreScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/hr/holidays',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const HrHolidaysScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/hr/leave-types',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const HrLeaveTypesScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/hr/employees/new',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) =>
              _slidePage(const HrEmployeeFormScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/hr/employees/edit',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) {
            // Edit takes the existing employee via `extra` so we don't
            // double-fetch from the network — caller already had it loaded.
            final emp = state.extra as HrEmployee?;
            return _slidePage(
              HrEmployeeFormScreen(existing: emp),
              key: state.pageKey,
            );
          },
        ),
        GoRoute(
          path: '/hr/expense-claims',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) =>
              _slidePage(const HrExpenseClaimsScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/hr/expense-claims/new',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) =>
              _slidePage(const HrExpenseClaimFormScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/hr/expense-claims/:id',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(
            HrExpenseClaimDetailScreen(id: state.pathParameters['id']!),
            key: state.pageKey,
          ),
        ),
        GoRoute(
          path: '/hr/expense-claims/:id/edit',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) {
            final claim = state.extra as HrExpenseClaim?;
            return _slidePage(
              HrExpenseClaimFormScreen(existing: claim),
              key: state.pageKey,
            );
          },
        ),
        GoRoute(
          path: '/hr/salary-components',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) =>
              _slidePage(const HrSalaryComponentsScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/hr/salary-structures',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) =>
              _slidePage(const HrSalaryStructuresScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/hr/salary-structures/new',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) =>
              _slidePage(const HrSalaryStructureFormScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/hr/salary-structures/:id/edit',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(
            HrSalaryStructureFormScreen(id: state.pathParameters['id']!),
            key: state.pageKey,
          ),
        ),
        GoRoute(
          path: '/hr/payroll-runs',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) =>
              _slidePage(const HrPayrollRunsScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/hr/payroll-runs/:id',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(
            HrPayrollRunDetailScreen(id: state.pathParameters['id']!),
            key: state.pageKey,
          ),
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
          path: '/money/analytics',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const AnalyticsScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/invoices/new',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const NewInvoiceScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/expenses',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const ExpensesScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/expenses/new',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const NewExpenseScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/expenses/:id',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(
            ExpenseDetailScreen(id: state.pathParameters['id']!),
            key: state.pageKey,
          ),
        ),
        GoRoute(
          path: '/expenses/:id/edit',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(
            NewExpenseScreen(editClaimId: state.pathParameters['id']!),
            key: state.pageKey,
          ),
        ),
        GoRoute(
          path: '/inbox',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const InboxScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/po-inbox',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const PoInboxScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/quick-invoice/templates',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) =>
              _slidePage(const QuickInvoiceTemplatesScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/quick-invoice/templates/:id',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(
            QuickInvoiceGenerateScreen(templateId: state.pathParameters['id']!),
            key: state.pageKey,
          ),
        ),
        GoRoute(
          path: '/invoices/:id',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(InvoiceDetailScreen(id: state.pathParameters['id']!), key: state.pageKey),
        ),
        GoRoute(
          path: '/invoices/:id/edit',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) =>
              _slidePage(NewInvoiceScreen(editInvoiceId: state.pathParameters['id']!), key: state.pageKey),
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
            SupportChatScreen(
              initialConversationId: state.uri.queryParameters['id'],
              forceNew: state.uri.queryParameters['new'] == '1',
            ),
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
    _authSub = _ref.listen<AuthState>(authProvider, (_, __) => notifyListeners());
    // Role flips after /hr/me resolves; the redirect needs to re-run so an
    // admin can be moved off /hr/home back to /home, and a non-admin
    // landing on /home gets bounced to /hr/home.
    _roleSub = _ref.listen<AsyncValue<AppRole>>(
      appRoleAsyncProvider,
      (_, __) => notifyListeners(),
    );
  }
  final Ref _ref;
  late final ProviderSubscription<AuthState> _authSub;
  late final ProviderSubscription<AsyncValue<AppRole>> _roleSub;

  @override
  void dispose() {
    _authSub.close();
    _roleSub.close();
    super.dispose();
  }
}
