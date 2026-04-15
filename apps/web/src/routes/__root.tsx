import { createRootRoute, createRoute, createRouter, Outlet, Link, useRouterState, Navigate } from '@tanstack/react-router';
import { Sidebar, MobileHeader, MobileBottomNav } from '../components/layout/sidebar';
import { LoginPage } from './login';
import { DashboardPage } from './dashboard';
import { CompanySettingsPage } from './settings/company';
import { InvoiceNumberingPage } from './settings/invoice-numbering';
import { OpeningBalancesPage } from './settings/opening-balances';
import { ItemAttributesPage } from './settings/item-attributes';
import { UsersPage } from './settings/users';
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
import { CategoriesPage } from './masters/categories';
import { QuotesPage } from './ar/quotes/index';
import { SalesOrdersPage } from './ar/sales-orders/index';
import { ExpenseClaimsPage } from './hr/expense-claims';
import { WebhooksPage } from './settings/webhooks';
import { VendorPortalPage } from './vendor-portal/index';
import { QuickTemplatesPage } from './ar/quick-templates';
import { SetupPage } from './settings/setup';
import { HelpIndexPage } from './help/index';
import { GapScanPage } from './audit/gap-scan';
import { HelpTopicPage } from './help/topic';

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
    <div className="flex h-screen flex-col md:flex-row overflow-hidden">
      <MobileHeader />
      <Sidebar />
      <main className="flex-1 overflow-auto bg-zinc-50 dark:bg-zinc-950 p-4 pb-20 md:p-6 md:pb-6 text-zinc-900 dark:text-zinc-100">
        <Outlet />
      </main>
      <MobileBottomNav />
    </div>
  ),
});

// ─── Dashboard ───────────────────────────────────────────────────────────────

const dashboardRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: '/',
  component: DashboardPage,
});

// ─── AP Sub-navigation ────────────────────────────────────────────────────────

const AP_TABS = [
  { label: 'Vendors', path: '/ap/vendors' },
  { label: 'Bills', path: '/ap/bills' },
  { label: 'Pay Runs', path: '/ap/pay-runs' },
  { label: 'Payments', path: '/ap/payments' },
  { label: 'Debit Notes', path: '/ap/debit-notes' },
];

function ApNav() {
  const routerState = useRouterState();
  const current = routerState.location.pathname;

  return (
    <div className="mb-6 border-b border-zinc-200 dark:border-zinc-800">
      <div className="mb-4">
        <h1 className="text-lg sm:text-2xl font-semibold">Accounts Payable</h1>
      </div>
      <nav className="flex gap-1 overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
        {AP_TABS.map(({ label, path }) =>
          path ? (
            <Link
              key={label}
              to={path as '/ap/vendors'}
              className={[
                'px-3 py-2 text-xs sm:text-sm sm:px-4 font-medium whitespace-nowrap border-b-2 -mb-px transition-colors',
                current.startsWith(path)
                  ? 'border-primary-500 text-primary-500'
                  : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200',
              ].join(' ')}
            >
              {label}
            </Link>
          ) : (
            <span
              key={label}
              className="px-4 py-2 text-sm font-medium border-b-2 -mb-px border-transparent text-zinc-400 dark:text-zinc-600 cursor-default"
              title="Coming soon"
            >
              {label}
            </span>
          ),
        )}
      </nav>
    </div>
  );
}

function ApLayout() {
  return (
    <div>
      <ApNav />
      <Outlet />
    </div>
  );
}

// ─── AP Routes ───────────────────────────────────────────────────────────────

const apRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: '/ap',
  component: ApLayout,
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

const billsRoute = createRoute({
  getParentRoute: () => apRoute,
  path: '/bills',
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

// ─── AR Sub-navigation ────────────────────────────────────────────────────────

const AR_TABS: Array<{ label: string; path: string | null }> = [
  { label: 'Customers', path: '/ar/customers' },
  { label: 'Quotes', path: '/ar/quotes' },
  { label: 'Sales Orders', path: '/ar/sales-orders' },
  { label: 'Invoices', path: '/ar/invoices' },
  { label: 'Receipts', path: '/ar/receipts' },
  { label: 'Credit Notes', path: '/ar/credit-notes' },
  { label: 'PO Inbox', path: '/ar/po-inbox' },
  { label: 'Dunning', path: '/ar/dunning' },
  { label: 'Collections', path: '/ar/collections' },
  { label: 'Quick Templates', path: '/ar/quick-templates' },
];

function ArNav() {
  const routerState = useRouterState();
  const current = routerState.location.pathname;

  return (
    <div className="mb-6 border-b border-zinc-200 dark:border-zinc-800">
      <div className="mb-4">
        <h1 className="text-lg sm:text-2xl font-semibold">Accounts Receivable</h1>
      </div>
      <nav className="flex gap-1 overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
        {AR_TABS.map(({ label, path }) =>
          path ? (
            <Link
              key={label}
              to={path as '/ar/customers' | '/ar/invoices' | '/ar/receipts' | '/ar/credit-notes' | '/ar/po-inbox' | '/ar/dunning' | '/ar/collections' | '/ar/quick-templates'}
              className={[
                'px-3 py-2 text-xs sm:text-sm sm:px-4 font-medium whitespace-nowrap border-b-2 -mb-px transition-colors',
                current.startsWith(path)
                  ? 'border-primary-500 text-primary-500'
                  : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200',
              ].join(' ')}
            >
              {label}
            </Link>
          ) : (
            <span
              key={label}
              className="px-4 py-2 text-sm font-medium border-b-2 -mb-px border-transparent text-zinc-400 dark:text-zinc-600 cursor-default"
              title="Coming soon"
            >
              {label}
            </span>
          ),
        )}
      </nav>
    </div>
  );
}

function ArLayout() {
  return (
    <div>
      <ArNav />
      <Outlet />
    </div>
  );
}

// ─── AR Routes ───────────────────────────────────────────────────────────────

const arRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: '/ar',
  component: ArLayout,
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

const invoicesRoute = createRoute({
  getParentRoute: () => arRoute,
  path: '/invoices',
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
  component: QuotesPage,
});

const salesOrdersRoute = createRoute({
  getParentRoute: () => arRoute,
  path: '/sales-orders',
  component: SalesOrdersPage,
});

const quickTemplatesRoute = createRoute({
  getParentRoute: () => arRoute,
  path: '/quick-templates',
  component: QuickTemplatesPage,
});

// ─── Banking Sub-navigation ───────────────────────────────────────────────────

const BANKING_TABS = [
  { label: 'Accounts', path: '/banking/accounts' },
  { label: 'Transactions', path: '/banking/transactions' },
  { label: 'Reconciliation', path: '/banking/reconciliation' },
  { label: 'PG Reconciliation', path: '/banking/pg-recon' },
  { label: 'Cheques', path: '/banking/cheques' },
  { label: 'Petty Cash', path: '/banking/petty-cash' },
];

function BankingNav() {
  const routerState = useRouterState();
  const current = routerState.location.pathname;

  return (
    <div className="mb-6 border-b border-zinc-200 dark:border-zinc-800">
      <div className="mb-4">
        <h1 className="text-lg sm:text-2xl font-semibold">Banking</h1>
      </div>
      <nav className="flex gap-1 overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
        {BANKING_TABS.map(({ label, path }) => (
          <Link
            key={label}
            to={path as '/banking/accounts' | '/banking/transactions' | '/banking/reconciliation' | '/banking/cheques' | '/banking/pg-recon' | '/banking/petty-cash'}
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

function BankingLayout() {
  return (
    <div>
      <BankingNav />
      <Outlet />
    </div>
  );
}

// ─── Banking Routes ───────────────────────────────────────────────────────────

const bankingRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: '/banking',
  component: BankingLayout,
});

const bankingIndexRoute = createRoute({
  getParentRoute: () => bankingRoute,
  path: '/',
  component: () => <Navigate to="/banking/accounts" />,
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

// ─── Settings Layout & Sub-navigation ────────────────────────────────────────

const SETTINGS_TABS = [
  { label: 'Setup', path: '/settings/setup' },
  { label: 'Company', path: '/settings/company' },
  { label: 'Invoice Numbering', path: '/settings/invoice-numbering' },
  { label: 'Catalogue Attributes', path: '/settings/item-attributes' },
  { label: 'Users', path: '/settings/users' },
  { label: 'Tally Export', path: '/settings/tally-export' },
  { label: 'Notifications', path: '/settings/notifications' },
  { label: 'Integrations', path: '/settings/integrations' },
  { label: 'Scheduled Reports', path: '/settings/scheduled-reports' },
  { label: 'Email Provider', path: '/settings/email-provider' },
  { label: 'CA Portal', path: '/settings/ca-portal' },
  { label: 'Migrate from Tally', path: '/settings/tally-import' },
  { label: 'Webhooks', path: '/settings/webhooks' },
  { label: 'Opening Balances', path: '/settings/opening-balances' },
];

function SettingsNav() {
  const routerState = useRouterState();
  const current = routerState.location.pathname;

  return (
    <div className="mb-6 border-b border-zinc-200 dark:border-zinc-800">
      <div className="mb-4">
        <h1 className="text-lg sm:text-2xl font-semibold">Settings</h1>
      </div>
      <nav className="flex gap-1 overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
        {SETTINGS_TABS.map(({ label, path }) => (
          <Link
            key={label}
            to={path as '/settings/company' | '/settings/invoice-numbering' | '/settings/users' | '/settings/tally-export' | '/settings/notifications'}
            className={[
              'px-3 py-2 text-xs sm:text-sm sm:px-4 font-medium whitespace-nowrap border-b-2 -mb-px transition-colors',
              current === path
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

function SettingsLayout() {
  return (
    <div>
      <SettingsNav />
      <Outlet />
    </div>
  );
}

// ─── Settings Routes ──────────────────────────────────────────────────────────

const settingsRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: '/settings',
  component: SettingsLayout,
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

// ─── Workflows Sub-navigation ────────────────────────────────────────────────

const WORKFLOWS_TABS = [
  { label: 'Pending Approvals', path: '/workflows/approvals' },
  { label: 'Workflows', path: '/workflows' },
  { label: 'Tasks', path: '/workflows/tasks' },
];

function WorkflowsNav() {
  const routerState = useRouterState();
  const current = routerState.location.pathname;

  return (
    <div className="mb-6 border-b border-zinc-200 dark:border-zinc-800">
      <div className="mb-4">
        <h1 className="text-lg sm:text-2xl font-semibold">Workflows</h1>
      </div>
      <nav className="flex gap-1 overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
        {WORKFLOWS_TABS.map(({ label, path }) => (
          <Link
            key={label}
            to={path as '/workflows'}
            className={[
              'px-3 py-2 text-xs sm:text-sm sm:px-4 font-medium whitespace-nowrap border-b-2 -mb-px transition-colors',
              (path === '/workflows' ? current === '/workflows' || current === '/workflows/' : current.startsWith(path))
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

function WorkflowsLayout() {
  return (
    <div>
      <WorkflowsNav />
      <Outlet />
    </div>
  );
}

// ─── Workflows Routes ────────────────────────────────────────────────────────

const workflowsRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: '/workflows',
  component: WorkflowsLayout,
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

// ─── Masters Sub-navigation ──────────────────────────────────────────────────

const MASTERS_TABS = [
  { label: 'Items', path: '/masters/items' },
  { label: 'Categories', path: '/masters/categories' },
  { label: 'Price Lists', path: '/masters/price-lists' },
];

function MastersNav() {
  const routerState = useRouterState();
  const current = routerState.location.pathname;

  return (
    <div className="mb-6 border-b border-zinc-200 dark:border-zinc-800">
      <div className="mb-4">
        <h1 className="text-lg sm:text-2xl font-semibold">Masters</h1>
      </div>
      <nav className="flex gap-1 overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
        {MASTERS_TABS.map(({ label, path }) => (
          <Link
            key={label}
            to={path as '/masters/items'}
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

function MastersLayout() {
  return (
    <div>
      <MastersNav />
      <Outlet />
    </div>
  );
}

// Masters routes
const mastersRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: '/masters',
  component: MastersLayout,
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

const helpTopicRoute = createRoute({
  getParentRoute: () => helpRoute,
  path: '$',
  component: () => {
    const params = helpTopicRoute.useParams() as { _splat?: string };
    return <HelpTopicPage slug={params._splat ?? ''} />;
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

// ─── Route Tree ───────────────────────────────────────────────────────────────

export const routeTree = rootRoute.addChildren([
  loginRoute,
  portalRoute,
  portalSlugRoute,
  caPortalRoute,
  vendorPortalRoute,
  dashboardLayoutRoute.addChildren([
    dashboardRoute,
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
      settingsTallyExportRoute,
      settingsNotificationsRoute,
      settingsIntegrationsRoute,
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
    ]),
    expensesRoute.addChildren([
      expensesIndexRoute,
      expenseClaimsRoute,
    ]),
    helpRoute.addChildren([
      helpIndexRoute,
      helpTopicRoute,
    ]),
    auditRoute.addChildren([
      gapScanRoute,
    ]),
  ]),
]);
