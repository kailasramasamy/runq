import { useEffect } from 'react';
import { createRootRoute, createRoute, createRouter, Outlet, Link, useRouterState, Navigate } from '@tanstack/react-router';
import { Sidebar, MobileHeader, MobileBottomNav } from '../components/layout/sidebar';
import { Topbar } from '../components/layout/topbar';
import { useAuth, canAccessFinanceModule, canManageHrModule } from '../providers/auth-provider';
import { FinanceAgent } from '../components/agent/finance-agent';
import { AgentActivityPage } from './agent/activity';
import { SupportWidget } from '../components/support/support-widget';
import { ImpersonationBanner } from '../components/admin/impersonation-banner';
import { PageWidthProvider, usePageWidth } from '../lib/page-width';
import { LoginPage } from './login';
import { ProfilePage } from './profile';
import { DashboardPage } from './dashboard';
import { InboxPage } from './inbox';
import { AnalyticsPage } from './analytics';
import { CompanySettingsPage } from './settings/company';
import { InvoiceNumberingPage } from './settings/invoice-numbering';
import { OpeningBalancesPage } from './settings/opening-balances';
import { ItemAttributesPage } from './settings/item-attributes';
import { UsersPage } from './settings/users';
import { ClientInvitesPage } from './settings/client-invites';
import { TallyExportPage } from './settings/tally-export';
import { NotificationsPage } from './settings/notifications';
import { VendorListPage } from './ap/vendors/index';
import { NewVendorPage } from './ap/vendors/new';
import { VendorDetailPage } from './ap/vendors/detail';
import { ImportVendorsPage } from './ap/vendors/import';
import { DebitNoteListPage } from './ap/debit-notes/index';
import { NewDebitNotePage } from './ap/debit-notes/new';
import { DebitNoteDetailPage } from './ap/debit-notes/detail';
import { PurchaseOrderListPage } from './purchase/pos/index';
import { NewPurchaseOrderPage } from './purchase/pos/new';
import { PurchaseOrderDetailPage } from './purchase/pos/detail';
import { EditPurchaseOrderPage } from './purchase/pos/edit';
import { ReceiveAgainstPoPage } from './purchase/pos/receive';
import { DirectReceiptListPage } from './purchase/direct/index';
import { NewDirectReceiptPage } from './purchase/direct/new';
import { PurchaseDashboardPage } from './purchase/index';
import { BillListPage } from './ap/bills/index';
import { NewBillPage } from './ap/bills/new';
import { BillDetailPage } from './ap/bills/detail';
import { EditBillPage } from './ap/bills/edit';
import { ImportBillsPage } from './ap/bills/import';
import { ScanBillPage } from './ap/bills/scan';
import { PaymentListPage } from './ap/payments/index';
import { NewPaymentPage } from './ap/payments/new';
import { AdvancePaymentPage } from './ap/payments/advance';
import { DirectPaymentPage } from './ap/payments/direct';
import { PaymentDetailPage } from './ap/payments/detail';
import { BulkPaymentPage } from './ap/payments/bulk';
import { PayRunsListPage } from './ap/pay-runs/index';
import { PayRunDetailPage } from './ap/pay-runs/detail';
import { CustomerListPage } from './ar/customers/index';
import { NewCustomerPage } from './ar/customers/new';
import { CustomerDetailPage } from './ar/customers/detail';
import { ImportCustomersPage } from './ar/customers/import';
import { InvoiceListPage } from './ar/invoices/index';
import { NewInvoicePage } from './ar/invoices/new';
import { NewQuotePage } from './ar/quotes/new';
import { NewSalesOrderPage } from './ar/sales-orders/new';
import { InvoiceDetailPage } from './ar/invoices/detail';
import { EditInvoicePage } from './ar/invoices/edit';
import { InvoiceImportPage } from './ar/invoices/import';
import { ReceiptListPage } from './ar/receipts/index';
import { NewReceiptPage } from './ar/receipts/new';
import { ReceiptDetailPage } from './ar/receipts/detail';
import { CreditNoteListPage } from './ar/credit-notes/index';
import { NewCreditNotePage } from './ar/credit-notes/new';
import { CreditNoteDetailPage } from './ar/credit-notes/detail';
import { CustomerDebitNoteListPage } from './ar/customer-debit-notes/index';
import { NewCustomerDebitNotePage } from './ar/customer-debit-notes/new';
import { CustomerDebitNoteDetailPage } from './ar/customer-debit-notes/detail';
import { PaymentClaimListPage } from './ar/payment-claims/index';
import { PoInboxPage } from './ar/po-inbox/index';
import { PoDraftReviewPage } from './ar/po-inbox/detail';
import { DunningPage } from './ar/dunning/index';
import { CollectionsPage } from './ar/collections/index';
import { BankingHubPage } from './banking/index';
import { BankAccountListPage } from './banking/accounts/index';
import { NewBankAccountPage } from './banking/accounts/new';
import { BankAccountDetailPage } from './banking/accounts/detail';
import { TransactionsPage } from './banking/transactions/index';
import { ImportTransactionsPage } from './banking/transactions/import';
import { ReconciliationPage } from './banking/reconciliation/index';
import { PettyCashPage } from './banking/petty-cash/index';
import { ChequesPage } from './banking/cheques/index';
import { PGReconciliationPage } from './banking/pg-recon/index';
import { ImportPGSettlementPage } from './banking/pg-recon/import';
import { PGSettlementDetailPage } from './banking/pg-recon/detail';
import { ChartOfAccountsPage } from './gl/accounts';
import { JournalEntriesPage } from './gl/journal-entries';
import { JournalEntryDetailPage } from './gl/journal-entry-detail';
import { TrialBalancePage } from './gl/trial-balance';
import { AssetCategoriesPage } from './fa/categories';
import { AssetListPage } from './fa/assets/index';
import { NewAssetPage } from './fa/assets/new';
import { AssetDetailPage } from './fa/assets/detail';
import { DepreciationRunPage } from './fa/depreciation-run';
import { BlockOfAssetsPage } from './fa/block-of-assets';
import { AssetImportPage } from './fa/import';
// GST Filing
import { GstReturnsPage } from './gst/returns';
import { GstReturnDetailPage } from './gst/return-detail';
import { Gstr3bDetailPage } from './gst/return-3b-detail';
import { ReconciliationPage as Gstr2bReconciliationPage } from './gst/reconciliation';
import { GstReadinessPage } from './gst/readiness';
import { PortalPage } from './portal/index';
// Phase 4: Reports
import { ProfitAndLossPage } from './reports/profit-and-loss';
import { BalanceSheetPage } from './reports/balance-sheet';
import { TrialBalancePage as ReportsTrialBalancePage } from './reports/trial-balance';
import { CashFlowPage } from './reports/cash-flow';
import { ExpenseAnalyticsPage } from './reports/expense-analytics';
import { RevenueAnalyticsPage } from './reports/revenue-analytics';
import { ComparisonPage } from './reports/comparison';
import { CashFlowForecastPage } from './reports/cash-flow-forecast';
import { FiscalPeriodsPage } from './reports/fiscal-periods';
// Phase 4: Workflows
import { WorkflowsPage } from './workflows/index';
import { TasksPage } from './workflows/tasks';
import { ApprovalsPage } from './workflows/approvals';
// Phase 4: Vendor Management
import { VendorContractsPage } from './vendor-management/contracts';
import { VendorRatingsPage } from './vendor-management/ratings';
import { RequisitionsPage } from './vendor-management/requisitions';
import { PaymentSchedulesPage } from './vendor-management/payment-schedules';
import { EarlyDiscountsPage } from './vendor-management/early-discounts';
// Phase 4: Settings additions
import { IntegrationsPage } from './settings/integrations';
import { BillSyncSettingsPage } from './settings/bill-sync';
import { BillSyncSourceDetailPage } from './settings/bill-sync-detail';
import { ScheduledReportsPage } from './settings/scheduled-reports';
import { EmailProviderPage } from './settings/email-provider';
import { CAPortalSettingsPage } from './settings/ca-portal';
import { TallyImportPage } from './settings/tally-import';
import { CAPortalPage } from './ca-portal/index';
import { ItemsPage } from './masters/items';
import { ImportItemsPage } from './masters/items/import';
import { ItemAnalysisPage } from './masters/items/analysis';
import { ItemEditPage } from './masters/items/edit';
import { ItemProfitabilityPage } from './masters/items/profitability';
import { PriceListsPage } from './masters/price-lists';
import { PriceListDetailPage } from './masters/price-lists/detail';
import { PriceListEditPage } from './masters/price-lists/edit';
import { CategoriesPage } from './masters/categories';
import { QuotesAndOrdersPage } from './ar/quotes-orders/index';
import { ExpenseClaimsPage } from './hr/expense-claims';
import { HRDashboardPage } from './hr/index';
import { EmployeeListPage } from './hr/employees/index';
import { NewEmployeePage } from './hr/employees/new';
import { EmployeeDetailPage } from './hr/employees/detail';
import { DepartmentsPage } from './hr/departments';
import { OrgChartPage } from './hr/org-chart';
import { DesignationsPage } from './hr/designations';
import { ShiftsPage } from './hr/shifts';
import { HolidaysPage } from './hr/holidays';
import { GeoFencesPage } from './hr/geo-fences';
import { AttendancePunchesPage } from './hr/attendance-punches';
import { RegularizationsPage } from './hr/regularizations';
import { TaxDeclarationsPage } from './hr/tax-declarations';
import { LoansPage } from './hr/loans';
import { LoanPolicyPage } from './hr/loan-policy';
import { FnfPage } from './hr/fnf';
import { OnboardingPage } from './hr/onboarding';
import { LettersPage } from './hr/letters';
import { HelpdeskPage } from './hr/helpdesk';
import { PerformancePage } from './hr/performance';
import { AnnouncementsPage } from './hr/announcements';
import { AttendancePage } from './hr/attendance';
import { LeaveTypesPage } from './hr/leave-types';
import { LeaveRequestsPage } from './hr/leave-requests';
import { LeaveBalancesPage } from './hr/leave-balances';
import { SalaryComponentsPage } from './hr/salary-components';
import { SalaryStructuresPage } from './hr/salary-structures';
import { PayrollRunsListPage } from './hr/payroll-runs/index';
import { PayrollRunDetailPage } from './hr/payroll-runs/detail';
import { Form24QPage } from './hr/form-24q';
import { Form16Page } from './hr/form-16';
import { TdsChallansPage } from './hr/tds-challans';
import { ContractLabourPage } from './hr/contract-labour';
import { RewardsPage } from './hr/rewards';
import { RewardTypesPage } from './hr/reward-types';
import { WebhooksPage } from './settings/webhooks';
import { VendorPortalPage } from './vendor-portal/index';
import {
  QuickTemplatesPage,
  QuickTemplateNewPage,
  QuickTemplateEditPage,
  QuickTemplateGeneratePage,
} from './ar/quick-templates';
import { SetupPage } from './settings/setup';
import { HelpIndexPage } from './help/index';
import { GapScanPage } from './audit/gap-scan';
import { CustomerSplitPage } from './audit/customer-split';
import { HelpRecipePage } from './help/recipe';
import { HelpDrawer } from '@/components/help/help-drawer';
import { AdminShell } from '@/components/admin/admin-shell';
import { AdminOverviewPage } from './admin/overview';
import { AdminAuditLogPage } from './admin/audit-log';
import { AdminSupportPage } from './admin/support';
import { AdminTenantsPage } from './admin/tenants';
import { AdminTenantDetailPage } from './admin/tenant-detail';
import {
  AdminBillingPage,
  AdminBillingPlansPage,
  AdminBillingSubscriptionsPage,
  AdminBillingInvoicesPage,
} from './admin/billing';
import { AdminUsersPage, AdminPlatformUsersPage } from './admin/users';
import { AdminObservabilityPage } from './admin/observability';
import { AdminFeatureFlagsPage } from './admin/feature-flags';
import { AdminAppConfigPage } from './admin/app-config';
import { AdminAnnouncementsPage } from './admin/announcements';
import { AdminSettingsPage } from './admin/settings';
// Manufacturing module
import { ManufacturingHomePage } from './manufacturing/index';
import { BomListPage } from './manufacturing/boms/index';
import { NewBomPage } from './manufacturing/boms/new';
import { EditBomPage } from './manufacturing/boms/edit';
import { BomDetailPage } from './manufacturing/boms/detail';
import { WorkOrderListPage } from './manufacturing/wos/index';
import { NewWorkOrderPage } from './manufacturing/wos/new';
import { EditWorkOrderPage } from './manufacturing/wos/edit';
import { WorkOrderDetailPage } from './manufacturing/wos/detail';
import { WorkOrderRunPage } from './manufacturing/wos/run';
import { WoSummaryReportPage } from './manufacturing/reports/wo-summary';
import { YieldTrendReportPage } from './manufacturing/reports/yield-trend';
import { BomUsageReportPage } from './manufacturing/reports/bom-usage';
import { WoPendingCloseReportPage } from './manufacturing/reports/wo-pending-close';
// Inventory module
import { InventoryDashboardPage } from './inventory/index';
import { WarehouseListPage } from './inventory/warehouses/index';
import { NewWarehousePage } from './inventory/warehouses/new';
import { WarehouseDetailPage } from './inventory/warehouses/detail';
import { EditWarehousePage } from './inventory/warehouses/edit';
import { OnHandPage } from './inventory/stock/on-hand';
import { StockLedgerPage } from './inventory/stock/ledger';
import { GrnListPage } from './inventory/grn/index';
import { NewGrnPage } from './inventory/grn/new';
import { GrnDetailPage } from './inventory/grn/detail';
import { DeliveryListPage } from './inventory/delivery/index';
import { NewDeliveryNotePage } from './inventory/delivery/new';
import { DeliveryNoteDetailPage } from './inventory/delivery/detail';
import { EditDeliveryNotePage } from './inventory/delivery/edit';
import { TransferListPage } from './inventory/transfers/index';
import { NewTransferPage } from './inventory/transfers/new';
import { TransferDetailPage } from './inventory/transfers/detail';
import { AdjustmentListPage } from './inventory/adjustments/index';
import { NewAdjustmentPage } from './inventory/adjustments/new';
import { AdjustmentDetailPage } from './inventory/adjustments/detail';
import { StockTakeListPage } from './inventory/stock-take/index';
import { NewStockTakePage } from './inventory/stock-take/new';
import { StockTakeDetailPage } from './inventory/stock-take/detail';
import { ReorderReportPage } from './inventory/reports/reorder';
import { ExpiryReportPage } from './inventory/reports/expiry';
import { StockSummaryReportPage } from './inventory/reports/summary';
import { ValuationReportPage } from './inventory/reports/valuation';
import { AgeingReportPage } from './inventory/reports/ageing';
import { MovementReportPage } from './inventory/reports/movement';
import { DeadStockReportPage } from './inventory/reports/dead-stock';
import { SerialListPage } from './inventory/serials/index';

// ─── Root & Layout ──────────────────────────────────────────────────────────

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

// ─── Login Route (no sidebar) ────────────────────────────────────────────────

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
});

// ─── Portal Route (public, no sidebar) ───────────────────────────────────────

const portalRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/portal',
  component: PortalPage,
});

const portalSlugRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/portal/s/$slug',
  component: PortalPage,
});

// ─── Dashboard Layout ────────────────────────────────────────────────────────

function DashboardMain() {
  // Pages declare their own width via `<PageHeader fullWidth />`. The
  // shell just reads the active value and swaps the max-width class.
  // Default is 'capped' (1280px) for forms / dashboards; table-heavy
  // pages opt into 'full' next to their title.
  const width = usePageWidth();
  return (
    <main
      className="flex-1 overflow-auto"
      style={{ background: 'var(--bg)', color: 'var(--text-1)' }}
    >
      <div
        className={
          'p-4 pb-20 md:p-6 md:pb-6 ' +
          (width === 'full' ? '' : 'mx-auto max-w-7xl')
        }
      >
        <Outlet />
      </div>
    </main>
  );
}

function DashboardLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const module =
    pathname === '/hr' || pathname.startsWith('/hr/')
      ? 'hr'
      : pathname === '/inventory' || pathname.startsWith('/inventory/')
        ? 'inventory'
        : pathname === '/purchase' || pathname.startsWith('/purchase/')
          ? 'purchase'
          : pathname === '/manufacturing' || pathname.startsWith('/manufacturing/')
            ? 'manufacturing'
            : 'finance';
  // Set on <html> rather than a layout div so portalled dropdowns and modals
  // (rendered outside the layout subtree) still inherit the module accent.
  useEffect(() => {
    document.documentElement.dataset.module = module;
  }, [module]);
  return (
    <PageWidthProvider>
      <div className="flex h-screen flex-col overflow-hidden">
        <ImpersonationBanner />
        <div className="flex flex-1 flex-col md:flex-row overflow-hidden">
          <MobileHeader />
          <Sidebar />
          <div className="flex flex-1 flex-col overflow-hidden">
            <Topbar />
            <DashboardMain />
          </div>
        <MobileBottomNav />
        <FinanceAgent />
        <SupportWidget />
        <HelpDrawer />
      </div>
    </div>
    </PageWidthProvider>
  );
}

const dashboardLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'dashboard-layout',
  component: DashboardLayout,
});

// ─── Finance module — namespaced under /finance ──────────────────────────────

// Hard module lock: hr / viewer typing a /finance URL are bounced to HR.
function FinanceModuleGuard() {
  const { user, isLoading } = useAuth();
  if (!isLoading && !canAccessFinanceModule(user?.role)) {
    return <Navigate to="/hr" replace />;
  }
  return <Outlet />;
}

const financeRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: '/finance',
  component: FinanceModuleGuard,
});

// Bare "/" lands on the user's home module. Only owner / accountant /
// client_owner have the Finance module; hr + viewer go to HR.
function RootRedirect() {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  return <Navigate to={canAccessFinanceModule(user?.role) ? '/finance' : '/hr'} />;
}
const rootRedirectRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: '/',
  component: RootRedirect,
});

// ─── Dashboard ───────────────────────────────────────────────────────────────

const dashboardRoute = createRoute({
  getParentRoute: () => financeRoute,
  path: '/',
  component: DashboardPage,
});

const inboxRoute = createRoute({
  getParentRoute: () => financeRoute,
  path: '/inbox',
  component: InboxPage,
});

const analyticsRoute = createRoute({
  getParentRoute: () => financeRoute,
  path: '/analytics',
  component: AnalyticsPage,
});

// ─── AP Routes ───────────────────────────────────────────────────────────────

const apRoute = createRoute({
  getParentRoute: () => financeRoute,
  path: '/ap',
  component: () => <Outlet />,
});

const apIndexRoute = createRoute({
  getParentRoute: () => apRoute,
  path: '/',
  component: () => <Navigate to="/finance/ap/vendors" />,
});

const vendorsRoute = createRoute({
  getParentRoute: () => apRoute,
  path: '/vendors',
  component: VendorListPage,
});

const vendorNewRoute = createRoute({
  getParentRoute: () => apRoute,
  path: '/vendors/new',
  component: NewVendorPage,
});

const vendorImportRoute = createRoute({
  getParentRoute: () => apRoute,
  path: '/vendors/import',
  component: ImportVendorsPage,
});

const vendorDetailRoute = createRoute({
  getParentRoute: () => apRoute,
  path: '/vendors/$vendorId',
  component: () => {
    const { vendorId } = vendorDetailRoute.useParams();
    return <VendorDetailPage vendorId={vendorId} />;
  },
});

type BillStatusFilter = 'draft' | 'pending_match' | 'matched' | 'approved' | 'partially_paid' | 'paid' | 'cancelled';
const BILL_STATUS_VALUES: readonly BillStatusFilter[] = ['draft', 'pending_match', 'matched', 'approved', 'partially_paid', 'paid', 'cancelled'];

const billsRoute = createRoute({
  getParentRoute: () => apRoute,
  path: '/bills',
  validateSearch: (search: Record<string, unknown>): {
    vendor?: string;
    status?: BillStatusFilter;
    category?: string;
    q?: string;
    from?: string;
    to?: string;
    page?: number;
  } => ({
    vendor: typeof search.vendor === 'string' ? search.vendor : undefined,
    status: BILL_STATUS_VALUES.includes(search.status as BillStatusFilter) ? (search.status as BillStatusFilter) : undefined,
    category: typeof search.category === 'string' ? search.category : undefined,
    q: typeof search.q === 'string' ? search.q : undefined,
    from: typeof search.from === 'string' ? search.from : undefined,
    to: typeof search.to === 'string' ? search.to : undefined,
    page: typeof search.page === 'number' && search.page > 1 ? search.page : undefined,
  }),
  component: BillListPage,
});

const billNewRoute = createRoute({
  getParentRoute: () => apRoute,
  path: '/bills/new',
  component: NewBillPage,
});

const billImportRoute = createRoute({
  getParentRoute: () => apRoute,
  path: '/bills/import',
  component: ImportBillsPage,
});

const billScanRoute = createRoute({
  getParentRoute: () => apRoute,
  path: '/bills/scan',
  component: ScanBillPage,
});

const billDetailRoute = createRoute({
  getParentRoute: () => apRoute,
  path: '/bills/$billId',
  component: () => {
    const { billId } = billDetailRoute.useParams();
    return <BillDetailPage billId={billId} />;
  },
});

const billEditRoute = createRoute({
  getParentRoute: () => apRoute,
  path: '/bills/$billId/edit',
  component: () => {
    const { billId } = billEditRoute.useParams();
    return <EditBillPage billId={billId} />;
  },
});

const paymentsRoute = createRoute({
  getParentRoute: () => apRoute,
  path: '/payments',
  component: PaymentListPage,
});

const paymentNewRoute = createRoute({
  getParentRoute: () => apRoute,
  path: '/payments/new',
  component: NewPaymentPage,
});

const paymentAdvanceRoute = createRoute({
  getParentRoute: () => apRoute,
  path: '/payments/advance',
  component: AdvancePaymentPage,
});

const paymentDirectRoute = createRoute({
  getParentRoute: () => apRoute,
  path: '/payments/direct',
  component: DirectPaymentPage,
});

const paymentDetailRoute = createRoute({
  getParentRoute: () => apRoute,
  path: '/payments/$paymentId',
  component: () => {
    const { paymentId } = paymentDetailRoute.useParams();
    return <PaymentDetailPage paymentId={paymentId} />;
  },
});

const paymentBulkRoute = createRoute({
  getParentRoute: () => apRoute,
  path: '/payments/bulk',
  component: BulkPaymentPage,
});

const payRunsRoute = createRoute({
  getParentRoute: () => apRoute,
  path: '/pay-runs',
  component: PayRunsListPage,
});

const payRunDetailRoute = createRoute({
  getParentRoute: () => apRoute,
  path: '/pay-runs/$runId',
  component: () => {
    const { runId } = payRunDetailRoute.useParams();
    return <PayRunDetailPage runId={runId} />;
  },
});

// Legacy redirect — old /ap/queue links keep working
const paymentQueueRedirectRoute = createRoute({
  getParentRoute: () => apRoute,
  path: '/queue',
  component: () => <Navigate to="/finance/ap/pay-runs" />,
});

const paymentQueueDetailRedirectRoute = createRoute({
  getParentRoute: () => apRoute,
  path: '/queue/$batchId',
  component: () => {
    const { batchId } = paymentQueueDetailRedirectRoute.useParams();
    return <Navigate to="/finance/ap/pay-runs/$runId" params={{ runId: batchId }} />;
  },
});

const debitNotesRoute = createRoute({
  getParentRoute: () => apRoute,
  path: '/debit-notes',
  component: DebitNoteListPage,
});

const debitNoteNewRoute = createRoute({
  getParentRoute: () => apRoute,
  path: '/debit-notes/new',
  component: NewDebitNotePage,
});

const debitNoteDetailRoute = createRoute({
  getParentRoute: () => apRoute,
  path: '/debit-notes/$debitNoteId',
  component: () => {
    const { debitNoteId } = debitNoteDetailRoute.useParams();
    return <DebitNoteDetailPage debitNoteId={debitNoteId} />;
  },
});

// ─── Purchase & Procurement Routes ───────────────────────────────────────────
// PP Phase 1 — PO core only. Receive, match, direct-receipt, PR, reports,
// and home dashboard land in later phases. See docs/purchase-procurement-plan.md.

// Hoisted to dashboardLayoutRoute so /purchase is a top-level module
// (mirrors /finance, /hr, /inventory) and the module switcher can land
// on it directly. Same role gating as Finance — procurement users are
// the owner/accountant/client_owner set.
const purchaseRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: '/purchase',
  component: FinanceModuleGuard,
});

const purchaseIndexRoute = createRoute({
  getParentRoute: () => purchaseRoute,
  path: '/',
  component: PurchaseDashboardPage,
});

const purchaseOrderListRoute = createRoute({
  getParentRoute: () => purchaseRoute,
  path: '/pos',
  component: PurchaseOrderListPage,
});

const purchaseOrderNewRoute = createRoute({
  getParentRoute: () => purchaseRoute,
  path: '/pos/new',
  component: NewPurchaseOrderPage,
});

const purchaseOrderDetailRoute = createRoute({
  getParentRoute: () => purchaseRoute,
  path: '/pos/$poId',
  component: () => {
    const { poId } = purchaseOrderDetailRoute.useParams();
    return <PurchaseOrderDetailPage poId={poId} />;
  },
});

const purchaseOrderEditRoute = createRoute({
  getParentRoute: () => purchaseRoute,
  path: '/pos/$poId/edit',
  component: () => {
    const { poId } = purchaseOrderEditRoute.useParams();
    return <EditPurchaseOrderPage poId={poId} />;
  },
});

// PP Phase 2 — receive flow
const purchaseOrderReceiveRoute = createRoute({
  getParentRoute: () => purchaseRoute,
  path: '/pos/$poId/receive',
  component: () => {
    const { poId } = purchaseOrderReceiveRoute.useParams();
    return <ReceiveAgainstPoPage poId={poId} />;
  },
});

// PP Phase 4 — Direct Receipt (memo qty entry, no JE)
const directReceiptListRoute = createRoute({
  getParentRoute: () => purchaseRoute,
  path: '/direct',
  component: DirectReceiptListPage,
});

const directReceiptNewRoute = createRoute({
  getParentRoute: () => purchaseRoute,
  path: '/direct/new',
  component: NewDirectReceiptPage,
});

// Items master mirror — Purchase users live in raw-materials / packaging
// (catalog growth happens here as they receive stock). Same ItemsPage as
// finance + inventory, just mounted with a /purchase prefix so the active
// module + sidebar stay correct. The page defaults to the Inputs tab when
// rendered under /purchase.
const purchaseItemsRoute = createRoute({
  getParentRoute: () => purchaseRoute,
  path: '/items',
  component: ItemsPage,
});
const purchaseItemsNewRoute = createRoute({
  getParentRoute: () => purchaseRoute,
  path: '/items/new',
  validateSearch: (search: Record<string, unknown>): { duplicateOf?: string } => ({
    duplicateOf: typeof search.duplicateOf === 'string' ? search.duplicateOf : undefined,
  }),
  component: () => {
    const { duplicateOf } = purchaseItemsNewRoute.useSearch();
    return <ItemEditPage duplicateOf={duplicateOf} />;
  },
});
const purchaseItemsEditRoute = createRoute({
  getParentRoute: () => purchaseRoute,
  path: '/items/$itemId/edit',
  component: () => {
    const { itemId } = purchaseItemsEditRoute.useParams();
    return <ItemEditPage itemId={itemId} />;
  },
});

// Purchase-scoped vendor pages reuse AP components but keep the user inside
// the Purchase module. Navigation inside those components is prefix-aware
// (see apps/web/src/lib/vendor-nav.ts).
const purchaseVendorListRoute = createRoute({
  getParentRoute: () => purchaseRoute,
  path: '/vendors',
  component: VendorListPage,
});

const purchaseVendorNewRoute = createRoute({
  getParentRoute: () => purchaseRoute,
  path: '/vendors/new',
  component: NewVendorPage,
});

const purchaseVendorImportRoute = createRoute({
  getParentRoute: () => purchaseRoute,
  path: '/vendors/import',
  component: ImportVendorsPage,
});

const purchaseVendorDetailRoute = createRoute({
  getParentRoute: () => purchaseRoute,
  path: '/vendors/$vendorId',
  component: () => {
    const { vendorId } = purchaseVendorDetailRoute.useParams();
    return <VendorDetailPage vendorId={vendorId} />;
  },
});

// ─── AR Routes ───────────────────────────────────────────────────────────────

const arRoute = createRoute({
  getParentRoute: () => financeRoute,
  path: '/ar',
  component: () => <Outlet />,
});

const arIndexRoute = createRoute({
  getParentRoute: () => arRoute,
  path: '/',
  component: () => <Navigate to="/finance/ar/customers" />,
});

const customersRoute = createRoute({
  getParentRoute: () => arRoute,
  path: '/customers',
  component: CustomerListPage,
});

const customerNewRoute = createRoute({
  getParentRoute: () => arRoute,
  path: '/customers/new',
  component: NewCustomerPage,
});

const customerImportRoute = createRoute({
  getParentRoute: () => arRoute,
  path: '/customers/import',
  component: ImportCustomersPage,
});

const customerDetailRoute = createRoute({
  getParentRoute: () => arRoute,
  path: '/customers/$customerId',
  component: () => {
    const { customerId } = customerDetailRoute.useParams();
    return <CustomerDetailPage customerId={customerId} />;
  },
});

type InvoiceStatusFilter = 'draft' | 'sent' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled' | 'unpaid';
const INVOICE_STATUS_VALUES: readonly InvoiceStatusFilter[] = ['draft', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled', 'unpaid'];

const invoicesRoute = createRoute({
  getParentRoute: () => arRoute,
  path: '/invoices',
  validateSearch: (search: Record<string, unknown>): {
    customer?: string;
    status?: InvoiceStatusFilter;
    q?: string;
    from?: string;
    to?: string;
    page?: number;
  } => ({
    customer: typeof search.customer === 'string' ? search.customer : undefined,
    status: INVOICE_STATUS_VALUES.includes(search.status as InvoiceStatusFilter) ? (search.status as InvoiceStatusFilter) : undefined,
    q: typeof search.q === 'string' ? search.q : undefined,
    from: typeof search.from === 'string' ? search.from : undefined,
    to: typeof search.to === 'string' ? search.to : undefined,
    page: typeof search.page === 'number' && search.page > 1 ? search.page : undefined,
  }),
  component: InvoiceListPage,
});

const invoiceNewRoute = createRoute({
  getParentRoute: () => arRoute,
  path: '/invoices/new',
  component: NewInvoicePage,
});

const invoiceImportRoute = createRoute({
  getParentRoute: () => arRoute,
  path: '/invoices/import',
  component: InvoiceImportPage,
});

const invoiceDetailRoute = createRoute({
  getParentRoute: () => arRoute,
  path: '/invoices/$invoiceId',
  component: () => {
    const { invoiceId } = invoiceDetailRoute.useParams();
    return <InvoiceDetailPage invoiceId={invoiceId} />;
  },
});

const invoiceEditRoute = createRoute({
  getParentRoute: () => arRoute,
  path: '/invoices/$invoiceId/edit',
  component: () => {
    const { invoiceId } = invoiceEditRoute.useParams();
    return <EditInvoicePage invoiceId={invoiceId} />;
  },
});

const receiptsRoute = createRoute({
  getParentRoute: () => arRoute,
  path: '/receipts',
  component: ReceiptListPage,
});

const paymentClaimsRoute = createRoute({
  getParentRoute: () => arRoute,
  path: '/payment-claims',
  component: PaymentClaimListPage,
});

const receiptNewRoute = createRoute({
  getParentRoute: () => arRoute,
  path: '/receipts/new',
  component: NewReceiptPage,
});

const receiptDetailRoute = createRoute({
  getParentRoute: () => arRoute,
  path: '/receipts/$receiptId',
  component: () => {
    const { receiptId } = receiptDetailRoute.useParams();
    return <ReceiptDetailPage receiptId={receiptId} />;
  },
});

const creditNotesRoute = createRoute({
  getParentRoute: () => arRoute,
  path: '/credit-notes',
  component: CreditNoteListPage,
});

const creditNoteNewRoute = createRoute({
  getParentRoute: () => arRoute,
  path: '/credit-notes/new',
  component: NewCreditNotePage,
});

const creditNoteDetailRoute = createRoute({
  getParentRoute: () => arRoute,
  path: '/credit-notes/$creditNoteId',
  component: () => {
    const { creditNoteId } = creditNoteDetailRoute.useParams();
    return <CreditNoteDetailPage creditNoteId={creditNoteId} />;
  },
});

const customerDebitNotesRoute = createRoute({
  getParentRoute: () => arRoute,
  path: '/customer-debit-notes',
  component: CustomerDebitNoteListPage,
});

const customerDebitNoteNewRoute = createRoute({
  getParentRoute: () => arRoute,
  path: '/customer-debit-notes/new',
  component: NewCustomerDebitNotePage,
});

const customerDebitNoteDetailRoute = createRoute({
  getParentRoute: () => arRoute,
  path: '/customer-debit-notes/$customerDebitNoteId',
  component: () => {
    const { customerDebitNoteId } = customerDebitNoteDetailRoute.useParams();
    return <CustomerDebitNoteDetailPage customerDebitNoteId={customerDebitNoteId} />;
  },
});

const poInboxRoute = createRoute({
  getParentRoute: () => arRoute,
  path: '/po-inbox',
  component: PoInboxPage,
});

const poInboxDetailRoute = createRoute({
  getParentRoute: () => arRoute,
  path: '/po-inbox/$uploadId',
  component: () => {
    const { uploadId } = poInboxDetailRoute.useParams();
    return <PoDraftReviewPage uploadId={uploadId} />;
  },
});

const dunningRoute = createRoute({
  getParentRoute: () => arRoute,
  path: '/dunning',
  component: DunningPage,
});

const collectionsRoute = createRoute({
  getParentRoute: () => arRoute,
  path: '/collections',
  component: CollectionsPage,
});

const quotesRoute = createRoute({
  getParentRoute: () => arRoute,
  path: '/quotes',
  component: () => <QuotesAndOrdersPage initialTab="quotes" />,
});

const salesOrdersRoute = createRoute({
  getParentRoute: () => arRoute,
  path: '/sales-orders',
  component: () => <QuotesAndOrdersPage initialTab="orders" />,
});

const quoteNewRoute = createRoute({
  getParentRoute: () => arRoute,
  path: '/quotes/new',
  component: NewQuotePage,
});

const salesOrderNewRoute = createRoute({
  getParentRoute: () => arRoute,
  path: '/sales-orders/new',
  component: NewSalesOrderPage,
});

const quickTemplatesRoute = createRoute({
  getParentRoute: () => arRoute,
  path: '/quick-templates',
  component: QuickTemplatesPage,
});

const quickTemplateNewRoute = createRoute({
  getParentRoute: () => arRoute,
  path: '/quick-templates/new',
  component: QuickTemplateNewPage,
});

const quickTemplateEditRoute = createRoute({
  getParentRoute: () => arRoute,
  path: '/quick-templates/$templateId/edit',
  component: () => {
    const { templateId } = quickTemplateEditRoute.useParams();
    return <QuickTemplateEditPage templateId={templateId} />;
  },
});

const quickTemplateGenerateRoute = createRoute({
  getParentRoute: () => arRoute,
  path: '/quick-templates/$templateId/generate',
  component: () => {
    const { templateId } = quickTemplateGenerateRoute.useParams();
    return <QuickTemplateGeneratePage templateId={templateId} />;
  },
});

// ─── Banking Routes ───────────────────────────────────────────────────────────

const bankingRoute = createRoute({
  getParentRoute: () => financeRoute,
  path: '/banking',
  component: () => <Outlet />,
});

const bankingIndexRoute = createRoute({
  getParentRoute: () => bankingRoute,
  path: '/',
  component: BankingHubPage,
});

const bankAccountsRoute = createRoute({
  getParentRoute: () => bankingRoute,
  path: '/accounts',
  component: BankAccountListPage,
});

const bankAccountNewRoute = createRoute({
  getParentRoute: () => bankingRoute,
  path: '/accounts/new',
  component: NewBankAccountPage,
});

const bankAccountDetailRoute = createRoute({
  getParentRoute: () => bankingRoute,
  path: '/accounts/$accountId',
  component: () => {
    const { accountId } = bankAccountDetailRoute.useParams();
    return <BankAccountDetailPage accountId={accountId} />;
  },
});

const bankTransactionsRoute = createRoute({
  getParentRoute: () => bankingRoute,
  path: '/transactions',
  component: TransactionsPage,
});

const bankTransactionsImportRoute = createRoute({
  getParentRoute: () => bankingRoute,
  path: '/transactions/import',
  component: ImportTransactionsPage,
});

const bankReconciliationRoute = createRoute({
  getParentRoute: () => bankingRoute,
  path: '/reconciliation',
  component: ReconciliationPage,
});

const bankChequesRoute = createRoute({
  getParentRoute: () => bankingRoute,
  path: '/cheques',
  component: ChequesPage,
});

const pettyCashRoute = createRoute({
  getParentRoute: () => bankingRoute,
  path: '/petty-cash',
  component: PettyCashPage,
});

const pgReconRoute = createRoute({
  getParentRoute: () => bankingRoute,
  path: '/pg-recon',
  component: PGReconciliationPage,
});

const pgReconImportRoute = createRoute({
  getParentRoute: () => bankingRoute,
  path: '/pg-recon/import',
  component: ImportPGSettlementPage,
});

const pgReconDetailRoute = createRoute({
  getParentRoute: () => bankingRoute,
  path: '/pg-recon/$settlementId',
  component: () => {
    const { settlementId } = pgReconDetailRoute.useParams();
    return <PGSettlementDetailPage settlementId={settlementId} />;
  },
});

// ─── General Ledger Sub-navigation ───────────────────────────────────────────

const GL_TABS = [
  { label: 'Chart of Accounts', path: '/finance/gl/accounts' },
  { label: 'Journal Entries', path: '/finance/gl/journal-entries' },
  { label: 'Trial Balance', path: '/finance/gl/trial-balance' },
  { label: 'Fiscal Periods', path: '/finance/gl/fiscal-periods' },
];

function GlNav() {
  const routerState = useRouterState();
  const current = routerState.location.pathname;

  return (
    <div className="mb-6 border-b border-zinc-200 dark:border-zinc-800">
      <div className="mb-4">
        <h1 className="text-lg sm:text-2xl font-semibold">General Ledger</h1>
      </div>
      <nav className="flex gap-1 overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
        {GL_TABS.map(({ label, path }) => (
          <Link
            key={label}
            to={path as '/finance/gl/accounts' | '/finance/gl/journal-entries' | '/finance/gl/trial-balance'}
            className={[
              'px-3 py-2 text-xs sm:text-sm sm:px-4 font-medium whitespace-nowrap border-b-2 -mb-px transition-colors',
              current.startsWith(path)
                ? 'border-primary-500 text-primary-500'
                : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200',
            ].join(' ')}
          >
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function GlLayout() {
  return (
    <div>
      <GlNav />
      <Outlet />
    </div>
  );
}

// ─── GL Routes ────────────────────────────────────────────────────────────────

const glRoute = createRoute({
  getParentRoute: () => financeRoute,
  path: '/gl',
  component: GlLayout,
});

const glIndexRoute = createRoute({
  getParentRoute: () => glRoute,
  path: '/',
  component: () => <Navigate to="/finance/gl/accounts" />,
});

const glAccountsRoute = createRoute({
  getParentRoute: () => glRoute,
  path: '/accounts',
  component: ChartOfAccountsPage,
});

const glJournalEntriesRoute = createRoute({
  getParentRoute: () => glRoute,
  path: '/journal-entries',
  component: JournalEntriesPage,
});

const glJournalEntryDetailRoute = createRoute({
  getParentRoute: () => glRoute,
  path: '/journal-entries/$journalEntryId',
  component: () => {
    const { journalEntryId } = glJournalEntryDetailRoute.useParams();
    return <JournalEntryDetailPage journalEntryId={journalEntryId} />;
  },
});

const glTrialBalanceRoute = createRoute({
  getParentRoute: () => glRoute,
  path: '/trial-balance',
  component: TrialBalancePage,
});

// ─── Fixed Assets Sub-navigation ─────────────────────────────────────────────

const FA_TABS = [
  { label: 'Asset Register', path: '/fa/assets' },
  { label: 'Categories', path: '/fa/categories' },
  { label: 'Run Depreciation', path: '/fa/depreciation' },
  { label: 'Block of Assets', path: '/fa/block-of-assets' },
  { label: 'Import', path: '/fa/import' },
];

function FaNav() {
  const routerState = useRouterState();
  const current = routerState.location.pathname;
  return (
    <div className="mb-6 border-b border-zinc-200 dark:border-zinc-800">
      <div className="mb-4">
        <h1 className="text-lg sm:text-2xl font-semibold">Fixed Assets</h1>
      </div>
      <nav className="flex gap-1 overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
        {FA_TABS.map(({ label, path }) => (
          <Link
            key={label}
            to={path as '/'}
            className={[
              'px-3 py-2 text-xs sm:text-sm sm:px-4 font-medium whitespace-nowrap border-b-2 -mb-px transition-colors',
              current.startsWith(path)
                ? 'border-primary-500 text-primary-500'
                : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200',
            ].join(' ')}
          >
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function FaLayout() {
  return (
    <div>
      <FaNav />
      <Outlet />
    </div>
  );
}

// ─── Fixed Assets Routes ─────────────────────────────────────────────────────

const faRoute = createRoute({
  getParentRoute: () => financeRoute,
  path: '/fa',
  component: FaLayout,
});

const faIndexRoute = createRoute({
  getParentRoute: () => faRoute,
  path: '/',
  component: () => <Navigate to="/finance/fa/assets" />,
});

const faCategoriesRoute = createRoute({
  getParentRoute: () => faRoute,
  path: '/categories',
  component: AssetCategoriesPage,
});

const faAssetsRoute = createRoute({
  getParentRoute: () => faRoute,
  path: '/assets',
  component: AssetListPage,
});

const faNewAssetRoute = createRoute({
  getParentRoute: () => faRoute,
  path: '/assets/new',
  component: NewAssetPage,
});

const faAssetDetailRoute = createRoute({
  getParentRoute: () => faRoute,
  path: '/assets/$assetId',
  component: () => {
    const { assetId } = faAssetDetailRoute.useParams();
    return <AssetDetailPage assetId={assetId} />;
  },
});

const faDepreciationRoute = createRoute({
  getParentRoute: () => faRoute,
  path: '/depreciation',
  component: DepreciationRunPage,
});

const faBlockOfAssetsRoute = createRoute({
  getParentRoute: () => faRoute,
  path: '/block-of-assets',
  component: BlockOfAssetsPage,
});

const faImportRoute = createRoute({
  getParentRoute: () => faRoute,
  path: '/import',
  component: AssetImportPage,
});

// ─── GST Filing Routes ───────────────────────────────────────────────────────

const gstRoute = createRoute({
  getParentRoute: () => financeRoute,
  path: '/gst',
  component: () => <Outlet />,
});

const gstIndexRoute = createRoute({
  getParentRoute: () => gstRoute,
  path: '/',
  component: () => <Navigate to="/finance/gst/returns" />,
});

const gstReturnsRoute = createRoute({
  getParentRoute: () => gstRoute,
  path: '/returns',
  component: GstReturnsPage,
});

const gstReturnDetailRoute = createRoute({
  getParentRoute: () => gstRoute,
  path: '/returns/$returnId',
  component: () => {
    const { returnId } = gstReturnDetailRoute.useParams();
    return <GstReturnDetailPage returnId={returnId} />;
  },
});

const gst3bDetailRoute = createRoute({
  getParentRoute: () => gstRoute,
  path: '/returns/$returnId/3b',
  component: () => {
    const { returnId } = gst3bDetailRoute.useParams();
    return <Gstr3bDetailPage returnId={returnId} />;
  },
});

const gstReconciliationRoute = createRoute({
  getParentRoute: () => gstRoute,
  path: '/reconciliation',
  component: Gstr2bReconciliationPage,
});

const gstReadinessRoute = createRoute({
  getParentRoute: () => gstRoute,
  path: '/readiness',
  component: GstReadinessPage,
});

// ─── Settings Routes ──────────────────────────────────────────────────────────

const settingsRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: '/settings',
  component: () => <Outlet />,
});

// Self-service profile — cross-module, available to every authenticated user
// (no finance/HR module guard). Reached from the top-right avatar menu.
const profileRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: '/profile',
  component: ProfilePage,
});

const settingsIndexRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/',
  component: () => <Navigate to="/settings/setup" />,
});

const settingsSetupRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/setup',
  component: SetupPage,
});

const settingsCompanyRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/company',
  component: CompanySettingsPage,
});

const settingsInvoiceNumberingRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/invoice-numbering',
  component: InvoiceNumberingPage,
});

const settingsItemAttributesRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/item-attributes',
  component: ItemAttributesPage,
});

const settingsUsersRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/users',
  component: UsersPage,
});

const settingsClientInvitesRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/client-invites',
  component: ClientInvitesPage,
});

const settingsTallyExportRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/tally-export',
  component: TallyExportPage,
});

const settingsNotificationsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/notifications',
  component: NotificationsPage,
});

const settingsOpeningBalancesRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/opening-balances',
  component: OpeningBalancesPage,
});

// ─── Reports Sub-navigation ──────────────────────────────────────────────────

const REPORTS_TABS = [
  { label: 'P&L', path: '/finance/reports/profit-and-loss' },
  { label: 'Balance Sheet', path: '/finance/reports/balance-sheet' },
  { label: 'Trial Balance', path: '/finance/reports/trial-balance' },
  { label: 'Cash Flow', path: '/finance/reports/cash-flow' },
  { label: 'Expenses', path: '/finance/reports/expense-analytics' },
  { label: 'Revenue', path: '/finance/reports/revenue-analytics' },
  { label: 'Comparison', path: '/finance/reports/comparison' },
  { label: 'Forecast', path: '/finance/reports/cash-flow-forecast' },
];

function ReportsNav() {
  const routerState = useRouterState();
  const current = routerState.location.pathname;

  return (
    <div className="mb-6 border-b border-zinc-200 dark:border-zinc-800">
      <div className="mb-4">
        <h1 className="text-lg sm:text-2xl font-semibold">Reports</h1>
      </div>
      <nav className="flex gap-1 overflow-x-auto">
        {REPORTS_TABS.map(({ label, path }) => (
          <Link
            key={label}
            to={path as '/finance/reports/profit-and-loss'}
            className={[
              'px-3 py-2 text-xs sm:text-sm sm:px-4 font-medium whitespace-nowrap border-b-2 -mb-px transition-colors whitespace-nowrap',
              current.startsWith(path)
                ? 'border-primary-500 text-primary-500'
                : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200',
            ].join(' ')}
          >
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function ReportsLayout() {
  return (
    <div>
      <ReportsNav />
      <Outlet />
    </div>
  );
}

// ─── Reports Routes ──────────────────────────────────────────────────────────

const reportsRoute = createRoute({
  getParentRoute: () => financeRoute,
  path: '/reports',
  component: ReportsLayout,
});

const reportsIndexRoute = createRoute({
  getParentRoute: () => reportsRoute,
  path: '/',
  component: () => <Navigate to="/finance/reports/profit-and-loss" />,
});

const reportsPnlRoute = createRoute({
  getParentRoute: () => reportsRoute,
  path: '/profit-and-loss',
  component: ProfitAndLossPage,
});

const reportsBsRoute = createRoute({
  getParentRoute: () => reportsRoute,
  path: '/balance-sheet',
  component: BalanceSheetPage,
});

const reportsTbRoute = createRoute({
  getParentRoute: () => reportsRoute,
  path: '/trial-balance',
  component: ReportsTrialBalancePage,
});

const reportsCfRoute = createRoute({
  getParentRoute: () => reportsRoute,
  path: '/cash-flow',
  component: CashFlowPage,
});

const reportsExpenseRoute = createRoute({
  getParentRoute: () => reportsRoute,
  path: '/expense-analytics',
  component: ExpenseAnalyticsPage,
});

const reportsRevenueRoute = createRoute({
  getParentRoute: () => reportsRoute,
  path: '/revenue-analytics',
  component: RevenueAnalyticsPage,
});

const reportsComparisonRoute = createRoute({
  getParentRoute: () => reportsRoute,
  path: '/comparison',
  component: ComparisonPage,
});

const reportsForecastRoute = createRoute({
  getParentRoute: () => reportsRoute,
  path: '/cash-flow-forecast',
  component: CashFlowForecastPage,
});

// ─── Workflows Routes ────────────────────────────────────────────────────────

const workflowsRoute = createRoute({
  getParentRoute: () => financeRoute,
  path: '/workflows',
  component: () => <Outlet />,
});

const workflowsIndexRoute = createRoute({
  getParentRoute: () => workflowsRoute,
  path: '/',
  component: WorkflowsPage,
});

const workflowsApprovalsRoute = createRoute({
  getParentRoute: () => workflowsRoute,
  path: '/approvals',
  component: ApprovalsPage,
});

const workflowsTasksRoute = createRoute({
  getParentRoute: () => workflowsRoute,
  path: '/tasks',
  component: TasksPage,
});

// ─── Vendor Management Sub-navigation ────────────────────────────────────────

const VM_TABS = [
  { label: 'Contracts', path: '/finance/vendor-management/contracts' },
  { label: 'Ratings', path: '/finance/vendor-management/ratings' },
  { label: 'Requisitions', path: '/finance/vendor-management/requisitions' },
  { label: 'Payment Schedules', path: '/finance/vendor-management/payment-schedules' },
  { label: 'Early Discounts', path: '/finance/vendor-management/early-discounts' },
];

function VmNav() {
  const routerState = useRouterState();
  const current = routerState.location.pathname;

  return (
    <div className="mb-6 border-b border-zinc-200 dark:border-zinc-800">
      <div className="mb-4">
        <h1 className="text-lg sm:text-2xl font-semibold">Vendor Management</h1>
      </div>
      <nav className="flex gap-1 overflow-x-auto">
        {VM_TABS.map(({ label, path }) => (
          <Link
            key={label}
            to={path as '/finance/vendor-management/contracts'}
            className={[
              'px-3 py-2 text-xs sm:text-sm sm:px-4 font-medium whitespace-nowrap border-b-2 -mb-px transition-colors whitespace-nowrap',
              current.startsWith(path)
                ? 'border-primary-500 text-primary-500'
                : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200',
            ].join(' ')}
          >
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function VmLayout() {
  return (
    <div>
      <VmNav />
      <Outlet />
    </div>
  );
}

// ─── Vendor Management Routes ────────────────────────────────────────────────

const vmRoute = createRoute({
  getParentRoute: () => financeRoute,
  path: '/vendor-management',
  component: VmLayout,
});

const vmIndexRoute = createRoute({
  getParentRoute: () => vmRoute,
  path: '/',
  component: () => <Navigate to="/finance/vendor-management/contracts" />,
});

const vmContractsRoute = createRoute({
  getParentRoute: () => vmRoute,
  path: '/contracts',
  component: VendorContractsPage,
});

const vmRatingsRoute = createRoute({
  getParentRoute: () => vmRoute,
  path: '/ratings',
  component: VendorRatingsPage,
});

const vmRequisitionsRoute = createRoute({
  getParentRoute: () => vmRoute,
  path: '/requisitions',
  component: RequisitionsPage,
});

const vmPaymentSchedulesRoute = createRoute({
  getParentRoute: () => vmRoute,
  path: '/payment-schedules',
  component: PaymentSchedulesPage,
});

const vmEarlyDiscountsRoute = createRoute({
  getParentRoute: () => vmRoute,
  path: '/early-discounts',
  component: EarlyDiscountsPage,
});

// ─── Additional GL Route ─────────────────────────────────────────────────────

const glFiscalPeriodsRoute = createRoute({
  getParentRoute: () => glRoute,
  path: '/fiscal-periods',
  component: FiscalPeriodsPage,
});

// ─── Additional Settings Routes ──────────────────────────────────────────────

const settingsIntegrationsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/integrations',
  component: IntegrationsPage,
});

const settingsBillSyncRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/bill-sync',
  component: BillSyncSettingsPage,
});

const settingsBillSyncDetailRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/bill-sync/$id',
  component: () => {
    const { id } = settingsBillSyncDetailRoute.useParams();
    return <BillSyncSourceDetailPage id={id} />;
  },
});

const settingsScheduledReportsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/scheduled-reports',
  component: ScheduledReportsPage,
});

const settingsEmailProviderRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/email-provider',
  component: EmailProviderPage,
});

const settingsCAPortalRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/ca-portal',
  component: CAPortalSettingsPage,
});

const settingsTallyImportRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/tally-import',
  component: TallyImportPage,
});

const settingsWebhooksRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/webhooks',
  component: WebhooksPage,
});

// Masters routes
const mastersRoute = createRoute({
  getParentRoute: () => financeRoute,
  path: '/masters',
  component: () => <Outlet />,
});

const mastersIndexRoute = createRoute({
  getParentRoute: () => mastersRoute,
  path: '/',
  component: () => <Navigate to="/finance/masters/items" />,
});

const mastersItemsRoute = createRoute({
  getParentRoute: () => mastersRoute,
  path: '/items',
  component: ItemsPage,
});

const mastersItemsImportRoute = createRoute({
  getParentRoute: () => mastersRoute,
  path: '/items/import',
  component: ImportItemsPage,
});

const mastersItemsProfitabilityRoute = createRoute({
  getParentRoute: () => mastersRoute,
  path: '/items/profitability',
  component: ItemProfitabilityPage,
});

const mastersItemsAnalysisRoute = createRoute({
  getParentRoute: () => mastersRoute,
  path: '/items/$itemId/analysis',
  validateSearch: (search: Record<string, unknown>): { from?: 'list' | 'edit' } => ({
    from: search.from === 'edit' ? 'edit' : search.from === 'list' ? 'list' : undefined,
  }),
  component: () => {
    const { itemId } = mastersItemsAnalysisRoute.useParams();
    const { from } = mastersItemsAnalysisRoute.useSearch();
    return <ItemAnalysisPage itemId={itemId} from={from} />;
  },
});

const mastersItemsNewRoute = createRoute({
  getParentRoute: () => mastersRoute,
  path: '/items/new',
  validateSearch: (search: Record<string, unknown>): { duplicateOf?: string } => ({
    duplicateOf: typeof search.duplicateOf === 'string' ? search.duplicateOf : undefined,
  }),
  component: () => {
    const { duplicateOf } = mastersItemsNewRoute.useSearch();
    return <ItemEditPage duplicateOf={duplicateOf} />;
  },
});

const mastersItemsEditRoute = createRoute({
  getParentRoute: () => mastersRoute,
  path: '/items/$itemId/edit',
  component: () => {
    const { itemId } = mastersItemsEditRoute.useParams();
    return <ItemEditPage itemId={itemId} />;
  },
});

const mastersCategoriesRoute = createRoute({
  getParentRoute: () => mastersRoute,
  path: '/categories',
  component: CategoriesPage,
});

const mastersPriceListsRoute = createRoute({
  getParentRoute: () => mastersRoute,
  path: '/price-lists',
  component: PriceListsPage,
});

const mastersPriceListDetailRoute = createRoute({
  getParentRoute: () => mastersRoute,
  path: '/price-lists/$priceListId',
  component: () => {
    const { priceListId } = mastersPriceListDetailRoute.useParams();
    return <PriceListDetailPage priceListId={priceListId} />;
  },
});

const mastersPriceListEditRoute = createRoute({
  getParentRoute: () => mastersRoute,
  path: '/price-lists/$priceListId/edit',
  component: () => {
    const { priceListId } = mastersPriceListEditRoute.useParams();
    return <PriceListEditPage priceListId={priceListId} />;
  },
});

// Expenses routes
const expensesRoute = createRoute({
  getParentRoute: () => financeRoute,
  path: '/expenses',
  component: () => <Outlet />,
});

const expensesIndexRoute = createRoute({
  getParentRoute: () => expensesRoute,
  path: '/',
  component: () => <Navigate to="/finance/expenses/claims" />,
});

const expenseClaimsRoute = createRoute({
  getParentRoute: () => expensesRoute,
  path: '/claims',
  component: ExpenseClaimsPage,
});

// ─── HR Module Routes ────────────────────────────────────────────────────────

// HR-admin paths (setup, payroll, TDS, onboarding, lifecycle…) are owner/
// accountant/hr only. A `viewer` keeps the self-service + manager-scoped
// subset; anything else redirects back to the HR dashboard.
const VIEWER_HR_PATHS = [
  '/hr/announcements', '/hr/employees', '/hr/org-chart', '/hr/attendance',
  '/hr/regularizations', '/hr/holidays', '/hr/leave-requests',
  '/hr/leave-balances', '/hr/expense-claims',
];
function HrModuleGuard() {
  const { user, isLoading } = useAuth();
  const { location } = useRouterState();
  const path = location.pathname;
  // Only police paths *inside* the HR module. This guard reads the global
  // router location, and while the user navigates away (e.g. to /profile)
  // it is still briefly mounted — without the `inHrModule` check it would
  // see the new path, decide it's "not allowed", and bounce back to /hr.
  const inHrModule = path === '/hr' || path.startsWith('/hr/');
  if (!isLoading && !canManageHrModule(user?.role) && inHrModule) {
    const allowed = path === '/hr'
      || VIEWER_HR_PATHS.some((p) => path === p || path.startsWith(p + '/'));
    if (!allowed) return <Navigate to="/hr" replace />;
  }
  return <Outlet />;
}

const hrRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: '/hr',
  component: HrModuleGuard,
});
const hrIndexRoute = createRoute({
  getParentRoute: () => hrRoute,
  path: '/',
  component: HRDashboardPage,
});
const hrEmployeesRoute = createRoute({
  getParentRoute: () => hrRoute,
  path: '/employees',
  component: EmployeeListPage,
});
const hrEmployeeNewRoute = createRoute({
  getParentRoute: () => hrRoute,
  path: '/employees/new',
  component: NewEmployeePage,
});
const hrEmployeeDetailRoute = createRoute({
  getParentRoute: () => hrRoute,
  path: '/employees/$employeeId',
  component: () => {
    const { employeeId } = hrEmployeeDetailRoute.useParams();
    return <EmployeeDetailPage employeeId={employeeId} />;
  },
});
const hrDepartmentsRoute = createRoute({
  getParentRoute: () => hrRoute,
  path: '/departments',
  component: DepartmentsPage,
});
const hrOrgChartRoute = createRoute({
  getParentRoute: () => hrRoute,
  path: '/org-chart',
  component: OrgChartPage,
});
const hrDesignationsRoute = createRoute({
  getParentRoute: () => hrRoute,
  path: '/designations',
  component: DesignationsPage,
});
const hrShiftsRoute = createRoute({
  getParentRoute: () => hrRoute,
  path: '/shifts',
  component: ShiftsPage,
});
const hrHolidaysRoute = createRoute({
  getParentRoute: () => hrRoute,
  path: '/holidays',
  component: HolidaysPage,
});
const hrGeoFencesRoute = createRoute({ getParentRoute: () => hrRoute, path: '/geo-fences', component: GeoFencesPage });
const hrAttPunchesRoute = createRoute({ getParentRoute: () => hrRoute, path: '/attendance-punches', component: AttendancePunchesPage });
const hrRegularizationsRoute = createRoute({ getParentRoute: () => hrRoute, path: '/regularizations', component: RegularizationsPage });
const hrTaxDeclRoute = createRoute({ getParentRoute: () => hrRoute, path: '/tax-declarations', component: TaxDeclarationsPage });
const hrLoansRoute = createRoute({ getParentRoute: () => hrRoute, path: '/loans', component: LoansPage });
const hrLoanPolicyRoute = createRoute({ getParentRoute: () => hrRoute, path: '/loan-policy', component: LoanPolicyPage });
const hrFnfRoute = createRoute({ getParentRoute: () => hrRoute, path: '/fnf', component: FnfPage });
const hrOnboardingRoute = createRoute({ getParentRoute: () => hrRoute, path: '/onboarding', component: OnboardingPage });
const hrLettersRoute = createRoute({ getParentRoute: () => hrRoute, path: '/letters', component: LettersPage });
const hrHelpdeskRoute = createRoute({ getParentRoute: () => hrRoute, path: '/helpdesk', component: HelpdeskPage });
const hrPerformanceRoute = createRoute({ getParentRoute: () => hrRoute, path: '/performance', component: PerformancePage });
const hrAnnouncementsRoute = createRoute({
  getParentRoute: () => hrRoute,
  path: '/announcements',
  component: AnnouncementsPage,
});
const hrAttendanceRoute = createRoute({
  getParentRoute: () => hrRoute,
  path: '/attendance',
  component: AttendancePage,
});
const hrLeaveTypesRoute = createRoute({
  getParentRoute: () => hrRoute,
  path: '/leave-types',
  component: LeaveTypesPage,
});
const hrLeaveRequestsRoute = createRoute({
  getParentRoute: () => hrRoute,
  path: '/leave-requests',
  validateSearch: (s: Record<string, unknown>): { status?: string } => ({
    status: typeof s.status === 'string' ? s.status : undefined,
  }),
  component: () => {
    const { status } = hrLeaveRequestsRoute.useSearch();
    return <LeaveRequestsPage initialStatus={status} />;
  },
});
const hrLeaveBalancesRoute = createRoute({
  getParentRoute: () => hrRoute,
  path: '/leave-balances',
  component: LeaveBalancesPage,
});
const hrSalaryComponentsRoute = createRoute({
  getParentRoute: () => hrRoute,
  path: '/salary-components',
  component: SalaryComponentsPage,
});
const hrSalaryStructuresRoute = createRoute({
  getParentRoute: () => hrRoute,
  path: '/salary-structures',
  component: SalaryStructuresPage,
});
const hrPayrollRunsRoute = createRoute({
  getParentRoute: () => hrRoute,
  path: '/payroll-runs',
  component: PayrollRunsListPage,
});
const hrPayrollRunDetailRoute = createRoute({
  getParentRoute: () => hrRoute,
  path: '/payroll-runs/$runId',
  component: () => {
    const { runId } = hrPayrollRunDetailRoute.useParams();
    return <PayrollRunDetailPage runId={runId} />;
  },
});
const hrForm24QRoute = createRoute({
  getParentRoute: () => hrRoute,
  path: '/form-24q',
  component: Form24QPage,
});
const hrTdsChallansRoute = createRoute({
  getParentRoute: () => hrRoute,
  path: '/tds-challans',
  component: TdsChallansPage,
});
const hrForm16Route = createRoute({
  getParentRoute: () => hrRoute,
  path: '/form-16',
  component: Form16Page,
});
const hrContractLabourRoute = createRoute({
  getParentRoute: () => hrRoute,
  path: '/contract-labour',
  component: ContractLabourPage,
});
// Expense claims spans both modules — employees raise + HR approves here,
// Finance posts + reimburses. Mounted under HR too so HR-only roles reach
// it without crossing into the Finance-guarded route tree.
const hrExpenseClaimsRoute = createRoute({
  getParentRoute: () => hrRoute,
  path: '/expense-claims',
  component: ExpenseClaimsPage,
});
const hrRewardsRoute = createRoute({
  getParentRoute: () => hrRoute,
  path: '/rewards',
  component: RewardsPage,
});
const hrRewardTypesRoute = createRoute({
  getParentRoute: () => hrRoute,
  path: '/reward-types',
  component: RewardTypesPage,
});

// ─── Inventory Module Routes ─────────────────────────────────────────────────
//
// Inventory is its own top-level module (mirrors /finance, /hr). All routes
// nest under /inventory and the sidebar / module switcher picks them up via
// the module dataset attribute set in DashboardLayout above.

const inventoryRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: '/inventory',
  component: () => <Outlet />,
});

const inventoryIndexRoute = createRoute({
  getParentRoute: () => inventoryRoute,
  path: '/',
  component: InventoryDashboardPage,
});

const invWarehousesRoute = createRoute({
  getParentRoute: () => inventoryRoute,
  path: '/warehouses',
  component: WarehouseListPage,
});
const invWarehouseNewRoute = createRoute({
  getParentRoute: () => inventoryRoute,
  path: '/warehouses/new',
  component: NewWarehousePage,
});
const invWarehouseDetailRoute = createRoute({
  getParentRoute: () => inventoryRoute,
  path: '/warehouses/$id',
  component: WarehouseDetailPage,
});
const invWarehouseEditRoute = createRoute({
  getParentRoute: () => inventoryRoute,
  path: '/warehouses/$id/edit',
  component: EditWarehousePage,
});

const invStockOnHandRoute = createRoute({
  getParentRoute: () => inventoryRoute,
  path: '/stock/on-hand',
  component: OnHandPage,
});
const invStockLedgerRoute = createRoute({
  getParentRoute: () => inventoryRoute,
  path: '/stock/ledger',
  component: StockLedgerPage,
});

const invGrnRoute = createRoute({
  getParentRoute: () => inventoryRoute,
  path: '/grn',
  component: GrnListPage,
});
const invGrnNewRoute = createRoute({
  getParentRoute: () => inventoryRoute,
  path: '/grn/new',
  component: NewGrnPage,
});
const invGrnDetailRoute = createRoute({
  getParentRoute: () => inventoryRoute,
  path: '/grn/$id',
  component: GrnDetailPage,
});

const invDeliveryRoute = createRoute({
  getParentRoute: () => inventoryRoute,
  path: '/delivery',
  component: DeliveryListPage,
});
const invDeliveryNewRoute = createRoute({
  getParentRoute: () => inventoryRoute,
  path: '/delivery/new',
  component: NewDeliveryNotePage,
});
const invDeliveryDetailRoute = createRoute({
  getParentRoute: () => inventoryRoute,
  path: '/delivery/$id',
  component: DeliveryNoteDetailPage,
});
const invDeliveryEditRoute = createRoute({
  getParentRoute: () => inventoryRoute,
  path: '/delivery/$id/edit',
  component: EditDeliveryNotePage,
});

// Phase 2 additions
const invTransfersRoute = createRoute({
  getParentRoute: () => inventoryRoute,
  path: '/transfers',
  component: TransferListPage,
});
const invTransferNewRoute = createRoute({
  getParentRoute: () => inventoryRoute,
  path: '/transfers/new',
  component: NewTransferPage,
});
const invTransferDetailRoute = createRoute({
  getParentRoute: () => inventoryRoute,
  path: '/transfers/$id',
  component: TransferDetailPage,
});
const invAdjustmentsRoute = createRoute({
  getParentRoute: () => inventoryRoute,
  path: '/adjustments',
  component: AdjustmentListPage,
});
const invAdjustmentNewRoute = createRoute({
  getParentRoute: () => inventoryRoute,
  path: '/adjustments/new',
  component: NewAdjustmentPage,
});
const invAdjustmentDetailRoute = createRoute({
  getParentRoute: () => inventoryRoute,
  path: '/adjustments/$id',
  component: AdjustmentDetailPage,
});
const invStockTakeRoute = createRoute({
  getParentRoute: () => inventoryRoute,
  path: '/stock-take',
  component: StockTakeListPage,
});
const invStockTakeNewRoute = createRoute({
  getParentRoute: () => inventoryRoute,
  path: '/stock-take/new',
  component: NewStockTakePage,
});
const invStockTakeDetailRoute = createRoute({
  getParentRoute: () => inventoryRoute,
  path: '/stock-take/$id',
  component: StockTakeDetailPage,
});
const invReorderRoute = createRoute({
  getParentRoute: () => inventoryRoute,
  path: '/reports/reorder',
  component: ReorderReportPage,
});
const invExpiryRoute = createRoute({
  getParentRoute: () => inventoryRoute,
  path: '/reports/expiry',
  component: ExpiryReportPage,
});
const invSummaryRoute = createRoute({
  getParentRoute: () => inventoryRoute,
  path: '/reports/summary',
  component: StockSummaryReportPage,
});
const invValuationRoute = createRoute({
  getParentRoute: () => inventoryRoute,
  path: '/reports/valuation',
  component: ValuationReportPage,
});
const invAgeingRoute = createRoute({
  getParentRoute: () => inventoryRoute,
  path: '/reports/ageing',
  component: AgeingReportPage,
});
const invMovementRoute = createRoute({
  getParentRoute: () => inventoryRoute,
  path: '/reports/movement',
  component: MovementReportPage,
});
const invDeadStockRoute = createRoute({
  getParentRoute: () => inventoryRoute,
  path: '/reports/dead-stock',
  component: DeadStockReportPage,
});
const invSerialsRoute = createRoute({
  getParentRoute: () => inventoryRoute,
  path: '/serials',
  component: SerialListPage,
});
// Items menu mirror — reuses the existing items pages in place so the URL
// stays under /inventory/ and the amber theme + sidebar group stay
// active. ItemsPage is router-aware (it reads pathname and prefixes its
// internal nav). Same components, mounted under both module roots.
const invItemsRoute = createRoute({
  getParentRoute: () => inventoryRoute,
  path: '/items',
  component: ItemsPage,
});
const invItemsImportRoute = createRoute({
  getParentRoute: () => inventoryRoute,
  path: '/items/import',
  component: ImportItemsPage,
});
const invItemsProfitabilityRoute = createRoute({
  getParentRoute: () => inventoryRoute,
  path: '/items/profitability',
  component: ItemProfitabilityPage,
});
const invItemsNewRoute = createRoute({
  getParentRoute: () => inventoryRoute,
  path: '/items/new',
  validateSearch: (search: Record<string, unknown>): { duplicateOf?: string } => ({
    duplicateOf: typeof search.duplicateOf === 'string' ? search.duplicateOf : undefined,
  }),
  component: () => {
    const { duplicateOf } = invItemsNewRoute.useSearch();
    return <ItemEditPage duplicateOf={duplicateOf} />;
  },
});
const invItemsEditRoute = createRoute({
  getParentRoute: () => inventoryRoute,
  path: '/items/$itemId/edit',
  component: () => {
    const { itemId } = invItemsEditRoute.useParams();
    return <ItemEditPage itemId={itemId} />;
  },
});
const invItemsAnalysisRoute = createRoute({
  getParentRoute: () => inventoryRoute,
  path: '/items/$itemId/analysis',
  validateSearch: (search: Record<string, unknown>): { from?: 'list' | 'edit' } => ({
    from: search.from === 'edit' ? 'edit' : search.from === 'list' ? 'list' : undefined,
  }),
  component: () => {
    const { itemId } = invItemsAnalysisRoute.useParams();
    const { from } = invItemsAnalysisRoute.useSearch();
    return <ItemAnalysisPage itemId={itemId} from={from} />;
  },
});

// Categories mirror — same CategoriesPage mounted under /inventory so the
// inventory sidebar can manage product categories without bouncing the
// user back to /finance. CategoriesPage is module-agnostic (no internal
// nav that would need module-prefix detection).
const invCategoriesRoute = createRoute({
  getParentRoute: () => inventoryRoute,
  path: '/categories',
  component: CategoriesPage,
});

// ─── Manufacturing Module Routes ─────────────────────────────────────────────
//
// Manufacturing is a top-level module (mirrors /finance, /hr, /inventory).
// All routes nest under /manufacturing. Uses FinanceModuleGuard for role gating
// (owner / accountant / production roles).

const manufacturingRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: '/manufacturing',
  component: FinanceModuleGuard,
});

const manufacturingIndexRoute = createRoute({
  getParentRoute: () => manufacturingRoute,
  path: '/',
  component: ManufacturingHomePage,
});

const mfgBomListRoute = createRoute({
  getParentRoute: () => manufacturingRoute,
  path: '/boms',
  component: BomListPage,
});

const mfgBomNewRoute = createRoute({
  getParentRoute: () => manufacturingRoute,
  path: '/boms/new',
  component: NewBomPage,
});

const mfgBomDetailRoute = createRoute({
  getParentRoute: () => manufacturingRoute,
  path: '/boms/$bomId',
  component: () => {
    const { bomId } = mfgBomDetailRoute.useParams();
    return <BomDetailPage bomId={bomId} />;
  },
});

const mfgBomEditRoute = createRoute({
  getParentRoute: () => manufacturingRoute,
  path: '/boms/$bomId/edit',
  component: () => {
    const { bomId } = mfgBomEditRoute.useParams();
    return <EditBomPage bomId={bomId} />;
  },
});

const mfgWoListRoute = createRoute({
  getParentRoute: () => manufacturingRoute,
  path: '/wos',
  component: WorkOrderListPage,
});

const mfgWoNewRoute = createRoute({
  getParentRoute: () => manufacturingRoute,
  path: '/wos/new',
  component: NewWorkOrderPage,
});

const mfgWoDetailRoute = createRoute({
  getParentRoute: () => manufacturingRoute,
  path: '/wos/$woId',
  component: () => {
    const { woId } = mfgWoDetailRoute.useParams();
    return <WorkOrderDetailPage woId={woId} />;
  },
});

const mfgWoEditRoute = createRoute({
  getParentRoute: () => manufacturingRoute,
  path: '/wos/$woId/edit',
  component: () => {
    const { woId } = mfgWoEditRoute.useParams();
    return <EditWorkOrderPage woId={woId} />;
  },
});

const mfgWoRunRoute = createRoute({
  getParentRoute: () => manufacturingRoute,
  path: '/wos/$woId/run',
  component: () => {
    const { woId } = mfgWoRunRoute.useParams();
    return <WorkOrderRunPage woId={woId} />;
  },
});

// ─── Manufacturing Report Routes ─────────────────────────────────────────────

const mfgReportWoSummaryRoute = createRoute({
  getParentRoute: () => manufacturingRoute,
  path: '/reports/wo-summary',
  component: WoSummaryReportPage,
});

const mfgReportYieldTrendRoute = createRoute({
  getParentRoute: () => manufacturingRoute,
  path: '/reports/yield-trend',
  component: YieldTrendReportPage,
});

const mfgReportBomUsageRoute = createRoute({
  getParentRoute: () => manufacturingRoute,
  path: '/reports/bom-usage',
  component: BomUsageReportPage,
});

const mfgReportWoPendingCloseRoute = createRoute({
  getParentRoute: () => manufacturingRoute,
  path: '/reports/wo-pending-close',
  component: WoPendingCloseReportPage,
});

// ─── Agent Activity Route ────────────────────────────────────────────────────

const agentActivityRoute = createRoute({
  getParentRoute: () => financeRoute,
  path: '/agent/activity',
  component: AgentActivityPage,
});

// ─── Help / User Guide Routes ────────────────────────────────────────────────

// Help is namespaced per module: /finance/help and /hr/help. Each parent is a
// pure layout (Outlet) so the exact `/{module}/help` URL hits its index child
// instead of being captured by the $recipeId splat.
const financeHelpRoute = createRoute({
  getParentRoute: () => financeRoute,
  path: '/help',
  component: () => <Outlet />,
});
const financeHelpIndexRoute = createRoute({
  getParentRoute: () => financeHelpRoute,
  path: '/',
  component: () => <HelpIndexPage module="finance" />,
});
const financeHelpRecipeRoute = createRoute({
  getParentRoute: () => financeHelpRoute,
  path: '$recipeId',
  component: () => {
    const { recipeId } = financeHelpRecipeRoute.useParams();
    return <HelpRecipePage recipeId={recipeId} module="finance" />;
  },
});

const hrHelpRoute = createRoute({
  getParentRoute: () => hrRoute,
  path: '/help',
  component: () => <Outlet />,
});
const hrHelpIndexRoute = createRoute({
  getParentRoute: () => hrHelpRoute,
  path: '/',
  component: () => <HelpIndexPage module="hr" />,
});
const hrHelpRecipeRoute = createRoute({
  getParentRoute: () => hrHelpRoute,
  path: '$recipeId',
  component: () => {
    const { recipeId } = hrHelpRecipeRoute.useParams();
    return <HelpRecipePage recipeId={recipeId} module="hr" />;
  },
});

// Public portals
const caPortalRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/ca/$slug',
  component: CAPortalPage,
});

const vendorPortalRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/vendor-portal/s/$slug',
  component: VendorPortalPage,
});

// ─── Audit ────────────────────────────────────────────────────────────────────

const auditRoute = createRoute({
  getParentRoute: () => financeRoute,
  path: '/audit',
  component: () => <Outlet />,
});


const gapScanRoute = createRoute({
  getParentRoute: () => auditRoute,
  path: '/gap-scan',
  component: GapScanPage,
});

const customerSplitRoute = createRoute({
  getParentRoute: () => auditRoute,
  path: '/customer-split',
  component: CustomerSplitPage,
});

// ─── Admin (super-admin) Layout & Routes ─────────────────────────────────────

const adminLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'admin-layout',
  component: AdminShell,
});

const adminIndexRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: '/admin',
  component: AdminOverviewPage,
});

const adminTenantsRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: '/admin/tenants',
  component: AdminTenantsPage,
});

const adminTenantDetailRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: '/admin/tenants/$tenantId',
  component: () => {
    const { tenantId } = adminTenantDetailRoute.useParams();
    return <AdminTenantDetailPage tenantId={tenantId} />;
  },
});

const adminBillingRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: '/admin/billing',
  component: AdminBillingPage,
});

const adminBillingPlansRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: '/admin/billing/plans',
  component: AdminBillingPlansPage,
});

const adminBillingSubsRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: '/admin/billing/subscriptions',
  component: AdminBillingSubscriptionsPage,
});

const adminBillingInvoicesRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: '/admin/billing/invoices',
  component: AdminBillingInvoicesPage,
});

const adminUsersRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: '/admin/users',
  component: AdminUsersPage,
});

const adminPlatformUsersRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: '/admin/users/platform',
  component: AdminPlatformUsersPage,
});

const adminObservabilityRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: '/admin/observability',
  component: AdminObservabilityPage,
});

const adminFeatureFlagsRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: '/admin/feature-flags',
  component: AdminFeatureFlagsPage,
});

const adminAppConfigRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: '/admin/app-config',
  component: AdminAppConfigPage,
});

const adminAnnouncementsRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: '/admin/announcements',
  component: AdminAnnouncementsPage,
});

const adminAuditLogRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: '/admin/audit-log',
  component: AdminAuditLogPage,
});

const adminSupportRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: '/admin/support',
  component: AdminSupportPage,
});

const adminSettingsRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: '/admin/settings',
  component: AdminSettingsPage,
});

// ─── Route Tree ───────────────────────────────────────────────────────────────

export const routeTree = rootRoute.addChildren([
  loginRoute,
  portalRoute,
  portalSlugRoute,
  caPortalRoute,
  vendorPortalRoute,
  adminLayoutRoute.addChildren([
    adminIndexRoute,
    adminTenantsRoute,
    adminTenantDetailRoute,
    adminBillingRoute,
    adminBillingPlansRoute,
    adminBillingSubsRoute,
    adminBillingInvoicesRoute,
    adminUsersRoute,
    adminPlatformUsersRoute,
    adminObservabilityRoute,
    adminFeatureFlagsRoute,
    adminAppConfigRoute,
    adminAnnouncementsRoute,
    adminAuditLogRoute,
    adminSupportRoute,
    adminSettingsRoute,
  ]),
  dashboardLayoutRoute.addChildren([
    rootRedirectRoute,
    profileRoute,
    financeRoute.addChildren([
      dashboardRoute,
      inboxRoute,
      analyticsRoute,
      agentActivityRoute,
      apRoute.addChildren([
        apIndexRoute,
        vendorsRoute,
        vendorNewRoute,
        vendorImportRoute,
        vendorDetailRoute,
        billsRoute,
        billNewRoute,
        billImportRoute,
        billScanRoute,
        billDetailRoute,
        billEditRoute,
        paymentsRoute,
        paymentNewRoute,
        paymentAdvanceRoute,
        paymentDirectRoute,
        paymentBulkRoute,
        paymentDetailRoute,
        payRunsRoute,
        payRunDetailRoute,
        paymentQueueRedirectRoute,
        paymentQueueDetailRedirectRoute,
        debitNotesRoute,
        debitNoteNewRoute,
        debitNoteDetailRoute,
      ]),
      arRoute.addChildren([
        arIndexRoute,
        customersRoute,
        customerNewRoute,
        customerImportRoute,
        customerDetailRoute,
        invoicesRoute,
        invoiceNewRoute,
        invoiceImportRoute,
        invoiceDetailRoute,
        invoiceEditRoute,
        receiptsRoute,
        paymentClaimsRoute,
        receiptNewRoute,
        receiptDetailRoute,
        creditNotesRoute,
        creditNoteNewRoute,
        creditNoteDetailRoute,
        customerDebitNotesRoute,
        customerDebitNoteNewRoute,
        customerDebitNoteDetailRoute,
        poInboxRoute,
        poInboxDetailRoute,
        dunningRoute,
        quotesRoute,
        quoteNewRoute,
        salesOrdersRoute,
        salesOrderNewRoute,
        collectionsRoute,
        quickTemplatesRoute,
        quickTemplateNewRoute,
        quickTemplateEditRoute,
        quickTemplateGenerateRoute,
      ]),
      bankingRoute.addChildren([
        bankingIndexRoute,
        bankAccountsRoute,
        bankAccountNewRoute,
        bankAccountDetailRoute,
        bankTransactionsRoute,
        bankTransactionsImportRoute,
        bankReconciliationRoute,
        bankChequesRoute,
        pettyCashRoute,
        pgReconRoute,
        pgReconImportRoute,
        pgReconDetailRoute,
      ]),
      glRoute.addChildren([
        glIndexRoute,
        glAccountsRoute,
        glJournalEntriesRoute,
        glJournalEntryDetailRoute,
        glTrialBalanceRoute,
        glFiscalPeriodsRoute,
      ]),
      faRoute.addChildren([
        faIndexRoute,
        faCategoriesRoute,
        faAssetsRoute,
        faNewAssetRoute,
        faAssetDetailRoute,
        faDepreciationRoute,
        faBlockOfAssetsRoute,
        faImportRoute,
      ]),
      gstRoute.addChildren([
        gstIndexRoute,
        gstReturnsRoute,
        gstReturnDetailRoute,
        gst3bDetailRoute,
        gstReconciliationRoute,
        gstReadinessRoute,
      ]),
      reportsRoute.addChildren([
        reportsIndexRoute,
        reportsPnlRoute,
        reportsBsRoute,
        reportsTbRoute,
        reportsCfRoute,
        reportsExpenseRoute,
        reportsRevenueRoute,
        reportsComparisonRoute,
        reportsForecastRoute,
      ]),
      workflowsRoute.addChildren([
        workflowsIndexRoute,
        workflowsApprovalsRoute,
        workflowsTasksRoute,
      ]),
      vmRoute.addChildren([
        vmIndexRoute,
        vmContractsRoute,
        vmRatingsRoute,
        vmRequisitionsRoute,
        vmPaymentSchedulesRoute,
        vmEarlyDiscountsRoute,
      ]),
      mastersRoute.addChildren([
        mastersIndexRoute,
        mastersItemsRoute,
        mastersItemsImportRoute,
        mastersItemsProfitabilityRoute,
        mastersItemsNewRoute,
        mastersItemsEditRoute,
        mastersItemsAnalysisRoute,
        mastersCategoriesRoute,
        mastersPriceListsRoute,
        mastersPriceListDetailRoute,
        mastersPriceListEditRoute,
      ]),
      expensesRoute.addChildren([
        expensesIndexRoute,
        expenseClaimsRoute,
      ]),
      auditRoute.addChildren([
        gapScanRoute,
        customerSplitRoute,
      ]),
      financeHelpRoute.addChildren([
        financeHelpIndexRoute,
        financeHelpRecipeRoute,
      ]),
    ]),
    settingsRoute.addChildren([
      settingsIndexRoute,
      settingsSetupRoute,
      settingsCompanyRoute,
      settingsInvoiceNumberingRoute,
      settingsItemAttributesRoute,
      settingsUsersRoute,
      settingsClientInvitesRoute,
      settingsTallyExportRoute,
      settingsNotificationsRoute,
      settingsIntegrationsRoute,
      settingsBillSyncRoute,
      settingsBillSyncDetailRoute,
      settingsScheduledReportsRoute,
      settingsEmailProviderRoute,
      settingsCAPortalRoute,
      settingsTallyImportRoute,
      settingsWebhooksRoute,
      settingsOpeningBalancesRoute,
    ]),
    purchaseRoute.addChildren([
      purchaseIndexRoute,
      purchaseOrderListRoute,
      purchaseOrderNewRoute,
      purchaseOrderDetailRoute,
      purchaseOrderEditRoute,
      purchaseOrderReceiveRoute,
      directReceiptListRoute,
      directReceiptNewRoute,
      purchaseItemsRoute,
      purchaseItemsNewRoute,
      purchaseItemsEditRoute,
      purchaseVendorListRoute,
      purchaseVendorNewRoute,
      purchaseVendorImportRoute,
      purchaseVendorDetailRoute,
    ]),
    manufacturingRoute.addChildren([
      manufacturingIndexRoute,
      mfgBomListRoute,
      mfgBomNewRoute,
      mfgBomDetailRoute,
      mfgBomEditRoute,
      mfgWoListRoute,
      mfgWoNewRoute,
      mfgWoDetailRoute,
      mfgWoEditRoute,
      mfgWoRunRoute,
      mfgReportWoSummaryRoute,
      mfgReportYieldTrendRoute,
      mfgReportBomUsageRoute,
      mfgReportWoPendingCloseRoute,
    ]),
    inventoryRoute.addChildren([
      inventoryIndexRoute,
      invWarehousesRoute,
      invWarehouseNewRoute,
      invWarehouseDetailRoute,
      invWarehouseEditRoute,
      invStockOnHandRoute,
      invStockLedgerRoute,
      invGrnRoute,
      invGrnNewRoute,
      invGrnDetailRoute,
      invDeliveryRoute,
      invDeliveryNewRoute,
      invDeliveryDetailRoute,
      invDeliveryEditRoute,
      invTransfersRoute,
      invTransferNewRoute,
      invTransferDetailRoute,
      invAdjustmentsRoute,
      invAdjustmentNewRoute,
      invAdjustmentDetailRoute,
      invStockTakeRoute,
      invStockTakeNewRoute,
      invStockTakeDetailRoute,
      invReorderRoute,
      invExpiryRoute,
      invSummaryRoute,
      invValuationRoute,
      invAgeingRoute,
      invMovementRoute,
      invDeadStockRoute,
      invSerialsRoute,
      invItemsRoute,
      invItemsImportRoute,
      invItemsProfitabilityRoute,
      invItemsNewRoute,
      invItemsEditRoute,
      invItemsAnalysisRoute,
      invCategoriesRoute,
    ]),
    hrRoute.addChildren([
      hrIndexRoute,
      hrEmployeesRoute,
      hrEmployeeNewRoute,
      hrEmployeeDetailRoute,
      hrDepartmentsRoute,
      hrOrgChartRoute,
      hrDesignationsRoute,
      hrShiftsRoute,
      hrHolidaysRoute,
      hrAnnouncementsRoute,
      hrAttendanceRoute,
      hrLeaveTypesRoute,
      hrLeaveRequestsRoute,
      hrLeaveBalancesRoute,
      hrSalaryComponentsRoute,
      hrSalaryStructuresRoute,
      hrPayrollRunsRoute,
      hrPayrollRunDetailRoute,
      hrForm24QRoute,
      hrTdsChallansRoute,
      hrForm16Route,
      hrContractLabourRoute,
      hrExpenseClaimsRoute,
      hrRewardsRoute,
      hrRewardTypesRoute,
      hrGeoFencesRoute,
      hrAttPunchesRoute,
      hrRegularizationsRoute,
      hrTaxDeclRoute,
      hrLoansRoute,
      hrLoanPolicyRoute,
      hrFnfRoute,
      hrOnboardingRoute,
      hrLettersRoute,
      hrHelpdeskRoute,
      hrPerformanceRoute,
      hrHelpRoute.addChildren([
        hrHelpIndexRoute,
        hrHelpRecipeRoute,
      ]),
    ]),
  ]),
]);
