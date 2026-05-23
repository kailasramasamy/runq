/**
 * Inventory Module — Cross-surface manifest (single source of truth)
 *
 * Every {endpoint, web route, mobile screen} for the Inventory module is
 * listed here. The parity script (apps/web/scripts/check-inventory-parity.ts)
 * reads this and asserts each row has a corresponding file on every surface.
 *
 * Add a row → run `pnpm check:inventory-parity` → fix the surfaces it
 * complains about. That is the entire drift-prevention mechanism.
 *
 * Capability flags are advisory: they document which surfaces are expected
 * to ship the feature. Parity script only checks files for surfaces marked
 * `true`. Set a flag to `false` when a capability is intentionally web-only
 * (e.g. CSV import) or mobile-only (e.g. barcode scan loop).
 */

export interface InventoryCapability {
  /** Stable key, kebab-case. Used in logs + future telemetry. */
  key: string;
  /** Human description. */
  title: string;
  /** API: { method, path } pairs, paths under /api/v1/inventory */
  api: ReadonlyArray<{ method: 'GET' | 'POST' | 'PUT' | 'DELETE'; path: string }>;
  /** Web route paths (under /inventory). Empty if this capability is API-only. */
  web: ReadonlyArray<string>;
  /** Web route file paths relative to apps/web/src/routes/inventory/ */
  webFiles: ReadonlyArray<string>;
  /** Mobile screen file paths relative to apps/mobile/lib/screens/inventory/ */
  mobileFiles: ReadonlyArray<string>;
  /** Phase from docs/inventory-plan.md §9 */
  phase: 1 | 2 | 3 | 4;
}

export const INVENTORY_CAPABILITIES: ReadonlyArray<InventoryCapability> = [
  // ─── Phase 1: Items extension ──────────────────────────────────────
  {
    key: 'items-stock-tab',
    title: 'Item stock-on-hand + ledger tab',
    api: [
      { method: 'GET', path: '/items/:id/stock' },
      { method: 'GET', path: '/items/:id/ledger' },
      { method: 'GET', path: '/items/barcode/:code' },
    ],
    web: [],
    webFiles: [],
    mobileFiles: ['inventory_item_detail_screen.dart'],
    phase: 1,
  },

  // ─── Phase 1: Warehouses ───────────────────────────────────────────
  {
    key: 'warehouses-crud',
    title: 'Warehouse master CRUD',
    api: [
      { method: 'GET', path: '/warehouses' },
      { method: 'POST', path: '/warehouses' },
      { method: 'GET', path: '/warehouses/:id' },
      { method: 'PUT', path: '/warehouses/:id' },
      { method: 'DELETE', path: '/warehouses/:id' },
      { method: 'GET', path: '/warehouses/:id/stock' },
    ],
    web: [
      '/inventory/warehouses',
      '/inventory/warehouses/new',
      '/inventory/warehouses/$id',
    ],
    webFiles: [
      'warehouses/index.tsx',
      'warehouses/new.tsx',
      'warehouses/detail.tsx',
    ],
    mobileFiles: [],
    phase: 1,
  },

  // ─── Phase 1: Stock visibility ─────────────────────────────────────
  {
    key: 'stock-on-hand',
    title: 'On-hand stock query',
    api: [{ method: 'GET', path: '/stock/on-hand' }],
    web: ['/inventory/stock/on-hand'],
    webFiles: ['stock/on-hand.tsx'],
    mobileFiles: ['inventory_on_hand_screen.dart'],
    phase: 1,
  },
  {
    key: 'stock-ledger',
    title: 'Stock movement ledger',
    api: [{ method: 'GET', path: '/stock/ledger' }],
    web: ['/inventory/stock/ledger'],
    webFiles: ['stock/ledger.tsx'],
    mobileFiles: [],
    phase: 1,
  },

  // ─── Phase 1: GRN ──────────────────────────────────────────────────
  {
    key: 'grn',
    title: 'Goods Receipt Note',
    api: [
      { method: 'GET', path: '/grn' },
      { method: 'POST', path: '/grn' },
      { method: 'GET', path: '/grn/:id' },
      { method: 'PUT', path: '/grn/:id' },
      { method: 'POST', path: '/grn/:id/post' },
      { method: 'POST', path: '/grn/:id/cancel' },
    ],
    web: [
      '/inventory/grn',
      '/inventory/grn/new',
      '/inventory/grn/$id',
    ],
    webFiles: [
      'grn/index.tsx',
      'grn/new.tsx',
      'grn/detail.tsx',
    ],
    mobileFiles: ['inventory_grn_screen.dart'],
    phase: 1,
  },

  // ─── Phase 1: Delivery Note ────────────────────────────────────────
  {
    key: 'delivery',
    title: 'Delivery Note (stock-out)',
    api: [
      { method: 'GET', path: '/delivery-notes' },
      { method: 'POST', path: '/delivery-notes' },
      { method: 'GET', path: '/delivery-notes/:id' },
      { method: 'PUT', path: '/delivery-notes/:id' },
      { method: 'POST', path: '/delivery-notes/:id/dispatch' },
      { method: 'POST', path: '/delivery-notes/:id/cancel' },
    ],
    web: [
      '/inventory/delivery',
      '/inventory/delivery/new',
      '/inventory/delivery/$id',
    ],
    webFiles: [
      'delivery/index.tsx',
      'delivery/new.tsx',
      'delivery/detail.tsx',
    ],
    mobileFiles: ['inventory_delivery_screen.dart'],
    phase: 1,
  },

  // ─── Phase 1: Dashboard ────────────────────────────────────────────
  {
    key: 'dashboard',
    title: 'Inventory dashboard',
    api: [{ method: 'GET', path: '/dashboard' }],
    web: ['/inventory'],
    webFiles: ['index.tsx'],
    mobileFiles: ['inventory_home_screen.dart'],
    phase: 1,
  },

  // ─── Phase 2: Transfers ────────────────────────────────────────────
  {
    key: 'transfers',
    title: 'Inter-warehouse transfers',
    api: [
      { method: 'GET', path: '/transfers' },
      { method: 'POST', path: '/transfers' },
      { method: 'GET', path: '/transfers/:id' },
      { method: 'PUT', path: '/transfers/:id' },
      { method: 'POST', path: '/transfers/:id/dispatch' },
      { method: 'POST', path: '/transfers/:id/receive' },
      { method: 'POST', path: '/transfers/:id/cancel' },
    ],
    web: [
      '/inventory/transfers',
      '/inventory/transfers/new',
      '/inventory/transfers/$id',
    ],
    webFiles: [
      'transfers/index.tsx',
      'transfers/new.tsx',
      'transfers/detail.tsx',
    ],
    mobileFiles: ['inventory_transfer_screen.dart'],
    phase: 2,
  },

  // ─── Phase 2: Adjustments ──────────────────────────────────────────
  {
    key: 'adjustments',
    title: 'Stock adjustments (damage / found / expiry / revaluation)',
    api: [
      { method: 'GET', path: '/adjustments' },
      { method: 'POST', path: '/adjustments' },
      { method: 'GET', path: '/adjustments/:id' },
      { method: 'PUT', path: '/adjustments/:id' },
      { method: 'POST', path: '/adjustments/:id/approve' },
      { method: 'POST', path: '/adjustments/:id/post' },
      { method: 'POST', path: '/adjustments/:id/cancel' },
    ],
    web: [
      '/inventory/adjustments',
      '/inventory/adjustments/new',
      '/inventory/adjustments/$id',
    ],
    webFiles: [
      'adjustments/index.tsx',
      'adjustments/new.tsx',
      'adjustments/detail.tsx',
    ],
    mobileFiles: ['inventory_adjustment_screen.dart'],
    phase: 2,
  },

  // ─── Phase 2: Stock take ───────────────────────────────────────────
  {
    key: 'stock-take',
    title: 'Stock take sessions',
    api: [
      { method: 'GET', path: '/stock-takes' },
      { method: 'POST', path: '/stock-takes' },
      { method: 'GET', path: '/stock-takes/:id' },
      { method: 'POST', path: '/stock-takes/:id/lines' },
      { method: 'PUT', path: '/stock-takes/:id/lines/:lineId' },
      { method: 'POST', path: '/stock-takes/:id/recount' },
      { method: 'POST', path: '/stock-takes/:id/post' },
      { method: 'POST', path: '/stock-takes/:id/cancel' },
    ],
    web: [
      '/inventory/stock-take',
      '/inventory/stock-take/new',
      '/inventory/stock-take/$id',
    ],
    webFiles: [
      'stock-take/index.tsx',
      'stock-take/new.tsx',
      'stock-take/detail.tsx',
    ],
    mobileFiles: ['inventory_stock_take_screen.dart'],
    phase: 2,
  },

  // ─── Phase 2: Reorder + expiry ─────────────────────────────────────
  {
    key: 'reorder-alerts',
    title: 'Reorder alerts + rules + expiry',
    api: [
      { method: 'GET', path: '/reorder-rules' },
      { method: 'POST', path: '/reorder-rules' },
      { method: 'DELETE', path: '/reorder-rules/:itemId/:warehouseId' },
      { method: 'GET', path: '/stock/reorder-alerts' },
      { method: 'GET', path: '/stock/expiring' },
    ],
    web: [
      '/inventory/reports/reorder',
      '/inventory/reports/expiry',
    ],
    webFiles: [
      'reports/reorder.tsx',
      'reports/expiry.tsx',
    ],
    mobileFiles: [],
    phase: 2,
  },
];

/** Flatten API rows for the parity script. */
export function flatApi(): ReadonlyArray<{ key: string; method: string; path: string }> {
  return INVENTORY_CAPABILITIES.flatMap((c) =>
    c.api.map((e) => ({ key: c.key, method: e.method, path: e.path })),
  );
}

/** Surfaces required for the given phase. */
export function capabilitiesForPhase(phase: number) {
  return INVENTORY_CAPABILITIES.filter((c) => c.phase <= phase);
}
