-- Per-customer opt-out of auto-allocation. When true, AutoReceiptService receives
-- incoming bank credits on-account instead of blind-FIFO allocating them onto the
-- oldest open invoices, so the cash can be applied to the exact invoices from the
-- customer's remittance advice. Defaults false → existing behaviour unchanged.

ALTER TABLE customers ADD COLUMN IF NOT EXISTS hold_receipts_on_account boolean NOT NULL DEFAULT false;
