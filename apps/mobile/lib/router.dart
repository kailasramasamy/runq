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
import 'screens/purchase/po_list_screen.dart';
import 'screens/purchase/po_detail_screen.dart';
import 'screens/purchase/po_create_screen.dart';
import 'screens/purchase/po_receive_screen.dart';
import 'screens/purchase/po_scan_receive_screen.dart';
import 'screens/purchase/direct_receipt_screen.dart';
import 'screens/purchase/direct_receipt_create_screen.dart';
import 'screens/purchase/purchase_home_screen.dart';
import 'screens/purchase/po_match_screen.dart';
import 'screens/purchase/po_edit_screen.dart';
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
import 'screens/language_screen.dart';
import 'screens/help_screen.dart';
import 'screens/support_chat_screen.dart';
import 'screens/support_inbox_screen.dart';
import 'screens/po_draft_review_screen.dart';
import 'screens/po_processing_screen.dart';
import 'screens/search_screen.dart';
import 'screens/signin_screen.dart';
import 'screens/splash_screen.dart';
import 'screens/hr/hr_home_screen.dart';
import 'screens/inventory/inventory_home_screen.dart';
import 'screens/inventory/inventory_on_hand_screen.dart';
import 'screens/inventory/inventory_moves_screen.dart';
import 'screens/inventory/inventory_grn_screen.dart';
import 'screens/inventory/inventory_grn_new_screen.dart';
import 'screens/inventory/inventory_grn_detail_screen.dart';
import 'screens/inventory/inventory_delivery_detail_screen.dart';
import 'screens/inventory/inventory_delivery_edit_screen.dart';
import 'screens/inventory/inventory_delivery_screen.dart';
import 'screens/inventory/inventory_item_detail_screen.dart';
import 'screens/inventory/inventory_transfer_screen.dart';
import 'screens/inventory/inventory_adjustment_screen.dart';
import 'screens/inventory/inventory_stock_take_screen.dart';
import 'screens/inventory/inventory_expiry_screen.dart';
import 'screens/inventory/inventory_reorder_screen.dart';
import 'screens/inventory/inventory_activity_screen.dart';
import 'screens/hr/hr_people_screen.dart';
import 'screens/hr/hr_employee_detail_screen.dart';
import 'screens/hr/hr_time_screen.dart';
import 'screens/hr/hr_pay_screen.dart';
import 'screens/hr/hr_payslip_detail_screen.dart';
import 'screens/hr/hr_more_screen.dart';
import 'screens/hr/hr_my_resume_screen.dart';
import 'screens/hr/hr_holidays_screen.dart';
import 'screens/hr/hr_activity_screen.dart';
import 'screens/hr/hr_leave_types_screen.dart';
import 'screens/hr/hr_departments_screen.dart';
import 'screens/hr/hr_designations_screen.dart';
import 'screens/hr/hr_shifts_screen.dart';
import 'screens/hr/hr_leave_balance_adjust_screen.dart';
import 'screens/hr/hr_directory_screen.dart';
import 'screens/hr/hr_directory_browse_screen.dart';
import 'screens/hr/hr_directory_profile_screen.dart';
import 'screens/hr/hr_org_chart_screen.dart';
import 'screens/hr/hr_leave_screen.dart';
import 'screens/hr/hr_announcements_screen.dart';
import 'screens/hr/hr_employee_form_screen.dart';
import 'screens/hr/hr_expense_claims_screen.dart';
import 'screens/hr/hr_salary_components_screen.dart';
import 'screens/hr/hr_salary_structures_screen.dart';
import 'screens/hr/hr_payroll_runs_screen.dart';
import 'screens/hr/hr_check_in_screen.dart';
import 'screens/hr/hr_regularizations_screen.dart';
import 'screens/hr/hr_tax_declaration_screen.dart';
import 'screens/hr/hr_loans_screen.dart';
import 'screens/hr/hr_onboarding_screen.dart';
import 'screens/hr/hr_letters_screen.dart';
import 'screens/hr/hr_helpdesk_screen.dart';
import 'screens/hr/hr_performance_screen.dart';
import 'screens/hr/hr_rewards_screen.dart';
import 'screens/manufacturing/manufacturing_home_screen.dart';
import 'screens/manufacturing/bom_list_screen.dart';
import 'screens/manufacturing/bom_detail_screen.dart';
import 'screens/manufacturing/bom_create_screen.dart';
import 'screens/manufacturing/wo_list_screen.dart';
import 'screens/manufacturing/wo_detail_screen.dart';
import 'screens/manufacturing/wo_create_screen.dart';
import 'screens/manufacturing/wo_run_screen.dart';
import 'screens/manufacturing/reports/wo_summary_screen.dart';
import 'screens/manufacturing/reports/yield_trend_screen.dart';
import 'screens/notifications_screen.dart';
import 'api/hr_models.dart' show HrEmployee, HrExpenseClaim;
import 'providers/app_role_provider.dart';
import 'services/po_intake.dart';

final rootKey = GlobalKey<NavigatorState>();
final shellKey = GlobalKey<NavigatorState>();

/// Maps web-style HR notification paths that have no direct mobile route to
/// the closest available screen. Paths that already match a registered route
/// pass through unchanged. Shared by the in-app notifications list and the
/// FCM push-tap handler so a deep link resolves the same way either way.
String resolveNotificationTarget(String path) {
  final uri = Uri.parse(path);
  var basePath = uri.path;

  // Notification deep links point at a single record (e.g. /hr/rewards/<id>),
  // but mobile has no detail screen for these — only a list. Collapse such a
  // "<base>/<id>" path to its list base. Bases that *do* have a mobile :id
  // route (e.g. /hr/payroll-runs, /hr/people, /hr/payslips) are excluded on
  // purpose so their detail deep links still resolve.
  const detailBases = <String>['/hr/rewards', '/hr/expense-claims'];
  for (final base in detailBases) {
    if (basePath.startsWith('$base/')) {
      basePath = base;
      break;
    }
  }

  const aliases = <String, String>{
    '/hr/leave-requests':     '/hr/leaves',           // HrLeaveScreen
    '/hr/expense-claims':     '/hr/pay?tab=expenses', // list folded into Pay's Expenses sub-tab
    '/hr/attendance-punches': '/hr/check-in',         // HrCheckInScreen
    '/hr/fnf':                '/hr/more',             // no FnF screen yet
    '/hr/tds-challans':       '/hr/more',             // no TDS screen yet
  };
  final resolved = aliases[basePath] ?? basePath;
  if (!uri.hasQuery) return resolved;
  // An alias may already carry its own query (e.g. ?tab=expenses); merge
  // rather than appending a second '?'.
  return resolved.contains('?')
      ? '$resolved&${uri.query}'
      : '$resolved?${uri.query}';
}

/// Routes a notification tap — FCM push or in-app list — to its target screen.
/// When that screen is already on top, the target is *replaced* rather than
/// pushed: repeated taps on same-target notifications (e.g. several expense
/// decisions) must not stack identical screens, but the tap still has to land
/// on fresh content — replace re-runs the screen's initState so its lists
/// refetch instead of showing whatever a prior visit left cached.
void openNotificationTarget(BuildContext context, String targetUrl) {
  final resolved = resolveNotificationTarget(targetUrl);
  final router = GoRouter.of(context);
  final current = router.routerDelegate.currentConfiguration.uri.toString();
  if (current == resolved) {
    router.replace(resolved);
  } else {
    router.push(resolved);
  }
}

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
          '/hr', '/manufacturing',
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
          '/quick-invoice', '/manufacturing',
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
            // Inventory bot-nav tabs live inside the shell. Detail screens
            // (item / grn / delivery / transfer / adjustment / stock-take
            // detail) push onto the root navigator so they take the full
            // viewport with a back arrow.
            GoRoute(path: '/inventory', pageBuilder: _fadePage((_) => const InventoryHomeScreen())),
            GoRoute(path: '/inventory/on-hand', pageBuilder: _fadePage((_) => const InventoryOnHandScreen())),
            // Moves hub replaces the old Receive + Dispatch tabs — fans out
            // to every transaction type via tile navigation. Kept inside
            // the shell so the bot nav stays visible while pivoting.
            GoRoute(path: '/inventory/moves', pageBuilder: _fadePage((_) => const InventoryMovesScreen())),
            // Alerts tab — reuses the existing reorder screen for now;
            // expanding to include expiry + dead-stock in a later pass.
            GoRoute(path: '/inventory/alerts', pageBuilder: _fadePage((_) => const InventoryReorderScreen())),
            // Batch expiry report — drilled into from the Mfg Perishables
            // tile and from Inventory alerts. Web parity: /inventory/reports/expiry.
            GoRoute(path: '/inventory/reports/expiry', pageBuilder: _fadePage((_) => const InventoryExpiryScreen())),
            // Purchase & Procurement bot-nav tabs. Detail / form screens
            // (PO create, edit, receive) push onto the root navigator so
            // they take the full viewport — same pattern as inventory.
            GoRoute(path: '/purchase', pageBuilder: _fadePage((_) => const PurchaseHomeScreen())),
            GoRoute(path: '/purchase/pos', pageBuilder: _fadePage((_) => const PurchaseOrderListScreen())),
            GoRoute(path: '/purchase/direct', pageBuilder: _fadePage((_) => const DirectReceiptScreen())),
            GoRoute(path: '/purchase/match', pageBuilder: _fadePage((_) => const PoMatchScreen())),
            // Manufacturing bot-nav tab (home). Detail / form screens push
            // onto root navigator so they take the full viewport.
            GoRoute(path: '/manufacturing', pageBuilder: _fadePage((_) => const ManufacturingHomeScreen())),
            GoRoute(path: '/manufacturing/boms', pageBuilder: _fadePage((_) => const BomListScreen())),
            GoRoute(path: '/manufacturing/wos', pageBuilder: (_, state) => CustomTransitionPage(
              key: state.pageKey,
              child: WoListScreen(
                initialStatus: state.uri.queryParameters['status'],
                initialScheduledFrom: state.uri.queryParameters['scheduledFrom'],
                initialScheduledTo: state.uri.queryParameters['scheduledTo'],
              ),
              transitionDuration: const Duration(milliseconds: 180),
              transitionsBuilder: (_, anim, __, c) => FadeTransition(opacity: anim, child: c),
            )),
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
        // ─── Inventory drill-downs (full-screen, push onto root) ──────────
        // The 4 tab destinations (/inventory, /on-hand, /grn, /delivery)
        // live inside the ShellRoute above so the bot nav stays visible
        // while the user pivots between them. Everything below is a
        // drill-down with its own back arrow.
        // GRN + DN are reached from the Moves hub (not the bot nav) under
        // the redesign, so they live as full-screen drill-downs with a
        // back arrow — same treatment as Transfers / Adjustments.
        GoRoute(
          path: '/inventory/grn',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const InventoryGrnScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/inventory/delivery',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const InventoryDeliveryScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/inventory/grn/new',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const InventoryGrnNewScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/inventory/grn/:id',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(
            InventoryGrnDetailScreen(grnId: state.pathParameters['id']!),
            key: state.pageKey,
          ),
        ),
        GoRoute(
          path: '/inventory/delivery/new',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const InventoryDeliveryScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/inventory/delivery/:id',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(
            InventoryDeliveryDetailScreen(dnId: state.pathParameters['id']!),
            key: state.pageKey,
          ),
        ),
        GoRoute(
          path: '/inventory/delivery/:id/edit',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(
            InventoryDeliveryEditScreen(dnId: state.pathParameters['id']!),
            key: state.pageKey,
          ),
        ),
        GoRoute(
          path: '/inventory/items/:id',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(
            InventoryItemDetailScreen(itemId: state.pathParameters['id']!),
            key: state.pageKey,
          ),
        ),
        GoRoute(
          path: '/inventory/transfers',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const InventoryTransferScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/inventory/adjustments',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const InventoryAdjustmentScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/inventory/stock-take',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const InventoryStockTakeScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/inventory/reorder',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const InventoryReorderScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/inventory/activity',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const InventoryActivityScreen(), key: state.pageKey),
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
          path: '/notifications',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(
            NotificationsScreen(scope: state.uri.queryParameters['scope']),
            key: state.pageKey,
          ),
        ),
        GoRoute(
          path: '/hr/holidays',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const HrHolidaysScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/hr/my-resume',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const HrMyResumeScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/hr/activity',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const HrActivityScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/hr/leave-types',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const HrLeaveTypesScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/hr/departments',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const HrDepartmentsScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/hr/designations',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const HrDesignationsScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/hr/shifts',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const HrShiftsScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/hr/adjust-leave-balance',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) =>
              _slidePage(const HrLeaveBalanceAdjustScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/hr/directory',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const HrDirectoryScreen(), key: state.pageKey),
        ),
        // Department browser + drill-down. Registered before `/hr/directory/:id`
        // so "browse" isn't captured as a profile id.
        GoRoute(
          path: '/hr/directory/browse',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) =>
              _slidePage(const HrDirectoryBrowseScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/hr/directory/browse/:deptId',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(
            HrDeptMembersScreen(
              departmentId: state.pathParameters['deptId'] == 'none'
                  ? null
                  : state.pathParameters['deptId'],
              title: state.uri.queryParameters['name'] ?? 'Department',
            ),
            key: state.pageKey,
          ),
        ),
        GoRoute(
          path: '/hr/directory/:id',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(
            HrDirectoryProfileScreen(id: state.pathParameters['id']!),
            key: state.pageKey,
          ),
        ),
        GoRoute(
          path: '/hr/org-chart',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const HrOrgChartScreen(), key: state.pageKey),
        ),
        // Manager-only review surfaces — pushed from the Home quick
        // actions. Bodies are the same widgets the Pay sub-tabs used
        // to mount, but each is now standalone with its own back arrow
        // + title.
        GoRoute(
          path: '/hr/leaves',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const HrLeaveScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/hr/team-expenses',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const HrTeamExpensesScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/hr/announcements',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const HrAnnouncementsScreen(), key: state.pageKey),
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
        // /hr/expense-claims (list) used to live here as its own
        // screen; it was folded into Pay > Expenses. /new and /:id
        // (form + detail) stay as separate routes because they're
        // multi-step flows that need their own back-stack frame.
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
        // Phase-next HR features.
        GoRoute(path: '/hr/check-in', parentNavigatorKey: rootKey,
          pageBuilder: (c, s) => _slidePage(const HrCheckInScreen(), key: s.pageKey)),
        GoRoute(path: '/hr/regularizations', parentNavigatorKey: rootKey,
          pageBuilder: (c, s) => _slidePage(const HrRegularizationsScreen(), key: s.pageKey)),
        GoRoute(path: '/hr/tax-declarations', parentNavigatorKey: rootKey,
          pageBuilder: (c, s) => _slidePage(const HrTaxDeclarationScreen(), key: s.pageKey)),
        GoRoute(path: '/hr/loans', parentNavigatorKey: rootKey,
          pageBuilder: (c, s) => _slidePage(const HrLoansScreen(), key: s.pageKey)),
        GoRoute(path: '/hr/onboarding', parentNavigatorKey: rootKey,
          pageBuilder: (c, s) => _slidePage(const HrOnboardingScreen(), key: s.pageKey)),
        GoRoute(path: '/hr/letters', parentNavigatorKey: rootKey,
          pageBuilder: (c, s) => _slidePage(const HrLettersScreen(), key: s.pageKey)),
        GoRoute(path: '/hr/helpdesk', parentNavigatorKey: rootKey,
          pageBuilder: (c, s) => _slidePage(const HrHelpdeskScreen(), key: s.pageKey)),
        GoRoute(path: '/hr/performance', parentNavigatorKey: rootKey,
          pageBuilder: (c, s) => _slidePage(const HrPerformanceScreen(), key: s.pageKey)),
        GoRoute(path: '/hr/rewards', parentNavigatorKey: rootKey,
          pageBuilder: (c, s) => _slidePage(const HrRewardsScreen(), key: s.pageKey)),
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
        // ─── Manufacturing detail / form screens (full-screen via rootKey) ──
        GoRoute(
          path: '/manufacturing/boms/new',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const BomCreateScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/manufacturing/boms/:id',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(
            BomDetailScreen(bomId: state.pathParameters['id']!),
            key: state.pageKey,
          ),
        ),
        GoRoute(
          path: '/manufacturing/boms/:id/edit',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(
            BomEditScreen(bomId: state.pathParameters['id']!),
            key: state.pageKey,
          ),
        ),
        GoRoute(
          path: '/manufacturing/wos/new',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const WoCreateScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/manufacturing/wos/:id',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(
            WoDetailScreen(woId: state.pathParameters['id']!),
            key: state.pageKey,
          ),
        ),
        GoRoute(
          path: '/manufacturing/wos/:id/edit',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(
            WoEditScreen(woId: state.pathParameters['id']!),
            key: state.pageKey,
          ),
        ),
        GoRoute(
          path: '/manufacturing/wos/:id/run',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(
            WoRunScreen(woId: state.pathParameters['id']!),
            key: state.pageKey,
          ),
        ),
        // ─── Manufacturing Phase 3 report screens ────────────────────────
        GoRoute(
          path: '/manufacturing/reports/wo-summary',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(
            WoSummaryScreen(
              initialStatus: state.uri.queryParameters['status'],
            ),
            key: state.pageKey,
          ),
        ),
        GoRoute(
          path: '/manufacturing/reports/yield-trend',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) =>
              _slidePage(const YieldTrendScreen(), key: state.pageKey),
        ),
        // ─── PP detail / form screens (full-screen via rootKey) ─────────
        // The tab routes (Home, PO list, Direct receipts, Match) live
        // inside the ShellRoute above so the bot nav stays visible.
        GoRoute(
          path: '/purchase/pos/new',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) =>
              _slidePage(const PurchaseOrderCreateScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/purchase/direct/new',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) =>
              _slidePage(const DirectReceiptCreateScreen(), key: state.pageKey),
        ),
        GoRoute(
          path: '/purchase/direct/edit',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(
            DirectReceiptCreateScreen(edit: state.extra as DirectReceiptEditArgs?),
            key: state.pageKey,
          ),
        ),
        GoRoute(
          path: '/purchase/pos/:id',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(
            PurchaseOrderDetailScreen(poId: state.pathParameters['id']!),
            key: state.pageKey,
          ),
        ),
        GoRoute(
          path: '/purchase/pos/:id/receive',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(
            PurchaseOrderReceiveScreen(poId: state.pathParameters['id']!),
            key: state.pageKey,
          ),
        ),
        GoRoute(
          path: '/purchase/pos/:id/scan-receive',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) {
            // Share-intake passes a pre-picked file via `extra` so the
            // scan kicks off without making the user re-pick.
            final extra = state.extra;
            final initialFile = extra is File ? extra : null;
            return _slidePage(
              PoScanReceiveScreen(
                poId: state.pathParameters['id']!,
                initialFile: initialFile,
              ),
              key: state.pageKey,
            );
          },
        ),
        GoRoute(
          path: '/purchase/pos/:id/edit',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(
            PurchaseOrderEditScreen(poId: state.pathParameters['id']!),
            key: state.pageKey,
          ),
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
          path: '/profile/language',
          parentNavigatorKey: rootKey,
          pageBuilder: (ctx, state) => _slidePage(const LanguageScreen(), key: state.pageKey),
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
