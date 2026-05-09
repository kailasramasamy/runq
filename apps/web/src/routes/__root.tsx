import { createRootRoute, createRoute, createRouter, Outlet, Link, useRouterState, Navigate } from '@tanstack/react-router';
import { Sidebar, MobileHeader, MobileBottomNav } from '../components/layout/sidebar';
import { Topbar } from '../components/layout/topbar';
import { FinanceAgent } from '../components/agent/finance-agent';
import { AgentActivityPage } from './agent/activity';
import { SupportWidget } from '../components/support/support-widget';
import { ImpersonationBanner } from '../components/admin/impersonation-banner';
import { LoginPage } from './login';
import { DashboardPage } from './dashboard';
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
import { InvoiceDetailPage } from './ar/invoices/detail';
import { EditInvoicePage } from './ar/invoices/edit';
import { InvoiceImportPage } from './ar/invoices/import';
import { ReceiptListPage } from './ar/receipts/index';
import { NewReceiptPage } from './ar/receipts/new';
import { ReceiptDetailPage } from './ar/receipts/detail';
import { CreditNoteListPage } from './ar/credit-notes/index';
import { NewCreditNotePage } from './ar/credit-notes/new';
import { CreditNoteDetailPage } from './ar/credit-notes/detail';
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
import { WebhooksPage } from './settings/webhooks';
import { VendorPortalPage } from './vendor-portal/index';
import { QuickTemplatesPage } from './ar/quick-templates';
import { SetupPage } from './settings/setup';
import { HelpIndexPage } from './help/index';
import { GapScanPage } from './audit/gap-scan';
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

const dashboardLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'dashboard-layout',
  component: () => (
    <div className="flex h-screen flex-col overflow-hidden">
      <ImpersonationBanner />
      <div className="flex flex-1 flex-col md:flex-row overflow-hidden">
        <MobileHeader />
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar />
          <main
            className="flex-1 overflow-auto p-4 pb-20 md:p-6 md:pb-6"
            style={{ background: 'var(--bg)', color: 'var(--text-1)' }}
          >
            <Outlet />
          </main>
        </div>
        <MobileBottomNav />
        <FinanceAgent />
        <SupportWidget />
        <HelpDrawer />
      </div>
    </div>
  ),
});

// ─── Dashboard ───────────────────────────────────────────────────────────────

const dashboardRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: '/',
  component: DashboardPage,
});

// ─── AP Routes ───────────────────────────────────────────────────────────────

const apRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: '/ap',
  component: () => <Outlet />,
});

const apIndexRoute = createRoute({
  getParentRoute: () => apRoute,
  path: '/',
  component: () => <Navigate to="/ap/vendors" />,
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
  component: () => <Navigate to="/ap/pay-runs" />,
});

const paymentQueueDetailRedirectRoute = createRoute({
  getParentRoute: () => apRoute,
  path: '/queue/$batchId',
  component: () => {
    const { batchId } = paymentQueueDetailRedirectRoute.useParams();
    return <Navigate to="/ap/pay-runs/$runId" params={{ runId: batchId }} />;
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

// ─── AR Routes ───────────────────────────────────────────────────────────────

const arRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: '/ar',
  component: () => <Outlet />,
});

const arIndexRoute = createRoute({
  getParentRoute: () => arRoute,
  path: '/',
  component: () => <Navigate to="/ar/customers" />,
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

const quickTemplatesRoute = createRoute({
  getParentRoute: () => arRoute,
  path: '/quick-templates',
  component: QuickTemplatesPage,
});

// ─── Banking Routes ───────────────────────────────────────────────────────────

const bankingRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
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
  { label: 'Chart of Accounts', path: '/gl/accounts' },
  { label: 'Journal Entries', path: '/gl/journal-entries' },
  { label: 'Trial Balance', path: '/gl/trial-balance' },
  { label: 'Fiscal Periods', path: '/gl/fiscal-periods' },
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
            to={path as '/gl/accounts' | '/gl/journal-entries' | '/gl/trial-balance'}
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
  getParentRoute: () => dashboardLayoutRoute,
  path: '/gl',
  component: GlLayout,
});

const glIndexRoute = createRoute({
  getParentRoute: () => glRoute,
  path: '/',
  component: () => <Navigate to="/gl/accounts" />,
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
  getParentRoute: () => dashboardLayoutRoute,
  path: '/fa',
  component: FaLayout,
});

const faIndexRoute = createRoute({
  getParentRoute: () => faRoute,
  path: '/',
  component: () => <Navigate to="/fa/assets" />,
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
  getParentRoute: () => dashboardLayoutRoute,
  path: '/gst',
  component: () => <Outlet />,
});

const gstIndexRoute = createRoute({
  getParentRoute: () => gstRoute,
  path: '/',
  component: () => <Navigate to="/gst/returns" />,
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
  { label: 'P&L', path: '/reports/profit-and-loss' },
  { label: 'Balance Sheet', path: '/reports/balance-sheet' },
  { label: 'Cash Flow', path: '/reports/cash-flow' },
  { label: 'Expenses', path: '/reports/expense-analytics' },
  { label: 'Revenue', path: '/reports/revenue-analytics' },
  { label: 'Comparison', path: '/reports/comparison' },
  { label: 'Forecast', path: '/reports/cash-flow-forecast' },
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
            to={path as '/reports/profit-and-loss'}
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
  getParentRoute: () => dashboardLayoutRoute,
  path: '/reports',
  component: ReportsLayout,
});

const reportsIndexRoute = createRoute({
  getParentRoute: () => reportsRoute,
  path: '/',
  component: () => <Navigate to="/reports/profit-and-loss" />,
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
  getParentRoute: () => dashboardLayoutRoute,
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
  { label: 'Contracts', path: '/vendor-management/contracts' },
  { label: 'Ratings', path: '/vendor-management/ratings' },
  { label: 'Requisitions', path: '/vendor-management/requisitions' },
  { label: 'Payment Schedules', path: '/vendor-management/payment-schedules' },
  { label: 'Early Discounts', path: '/vendor-management/early-discounts' },
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
            to={path as '/vendor-management/contracts'}
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
  getParentRoute: () => dashboardLayoutRoute,
  path: '/vendor-management',
  component: VmLayout,
});

const vmIndexRoute = createRoute({
  getParentRoute: () => vmRoute,
  path: '/',
  component: () => <Navigate to="/vendor-management/contracts" />,
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
  getParentRoute: () => dashboardLayoutRoute,
  path: '/masters',
  component: () => <Outlet />,
});

const mastersIndexRoute = createRoute({
  getParentRoute: () => mastersRoute,
  path: '/',
  component: () => <Navigate to="/masters/items" />,
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
  getParentRoute: () => dashboardLayoutRoute,
  path: '/expenses',
  component: () => <Outlet />,
});

const expensesIndexRoute = createRoute({
  getParentRoute: () => expensesRoute,
  path: '/',
  component: () => <Navigate to="/expenses/claims" />,
});

const expenseClaimsRoute = createRoute({
  getParentRoute: () => expensesRoute,
  path: '/claims',
  component: ExpenseClaimsPage,
});

// ─── Agent Activity Route ────────────────────────────────────────────────────

const agentActivityRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: '/agent/activity',
  component: AgentActivityPage,
});

// ─── Help / User Guide Routes ────────────────────────────────────────────────

// Parent is a pure layout (Outlet) so the exact `/help` URL hits the index
// child instead of being captured by the splat.
const helpRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: '/help',
  component: () => <Outlet />,
});

const helpIndexRoute = createRoute({
  getParentRoute: () => helpRoute,
  path: '/',
  component: HelpIndexPage,
});

const helpRecipeRoute = createRoute({
  getParentRoute: () => helpRoute,
  path: '$recipeId',
  component: () => {
    const { recipeId } = helpRecipeRoute.useParams();
    return <HelpRecipePage recipeId={recipeId} />;
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
  getParentRoute: () => dashboardLayoutRoute,
  path: '/audit',
  component: () => <Outlet />,
});


const gapScanRoute = createRoute({
  getParentRoute: () => auditRoute,
  path: '/gap-scan',
  component: GapScanPage,
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
    dashboardRoute,
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
      receiptNewRoute,
      receiptDetailRoute,
      creditNotesRoute,
      creditNoteNewRoute,
      creditNoteDetailRoute,
      poInboxRoute,
      poInboxDetailRoute,
      dunningRoute,
      quotesRoute,
      salesOrdersRoute,
      collectionsRoute,
      quickTemplatesRoute,
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
    helpRoute.addChildren([
      helpIndexRoute,
      helpRecipeRoute,
    ]),
    auditRoute.addChildren([
      gapScanRoute,
    ]),
  ]),
]);
