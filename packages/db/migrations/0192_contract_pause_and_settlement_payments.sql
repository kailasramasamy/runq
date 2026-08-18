-- Labour contracts, two gaps:
--
-- 1. Work stops for a stretch (monsoon, a stalled site, a festival) and
--    nothing should accrue meanwhile. Stored as windows rather than a status
--    flag so a pause can be booked ahead without a scheduler flipping it.
-- 2. A settlement was a single all-or-nothing `pay`, which no client ever
--    called. Crews are paid as the cash comes in, so disbursement becomes a
--    ledger of instalments and the settlement carries a running paid figure.

CREATE TABLE IF NOT EXISTS contract_pauses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id),
  contract_id  uuid NOT NULL REFERENCES labour_contracts(id) ON DELETE CASCADE,
  from_date    date NOT NULL,
  to_date      date,
  reason       varchar(200),
  created_by   uuid REFERENCES users(id),
  resumed_by   uuid REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_contract_pause_dates CHECK (to_date IS NULL OR to_date >= from_date)
);
CREATE INDEX IF NOT EXISTS idx_contract_pause_contract
  ON contract_pauses (contract_id, from_date);

-- Overlap and "one open pause at a time" are enforced in the service, not by
-- an exclusion/partial index: expression indexes break `drizzle-kit push`,
-- which is what deploys the schema.

ALTER TABLE labour_settlements
  ADD COLUMN IF NOT EXISTS amount_paid numeric(15,2) NOT NULL DEFAULT 0;

-- Settlements already marked paid predate the instalment ledger; treat them
-- as fully disbursed so their due reads zero rather than the whole net.
UPDATE labour_settlements
   SET amount_paid = net_payable
 WHERE status = 'paid' AND amount_paid = 0;

CREATE TABLE IF NOT EXISTS labour_settlement_payments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id),
  settlement_id         uuid NOT NULL REFERENCES labour_settlements(id) ON DELETE CASCADE,
  contract_id           uuid NOT NULL REFERENCES labour_contracts(id),
  amount                numeric(15,2) NOT NULL,
  payment_date          date NOT NULL,
  payment_method        varchar(30) NOT NULL DEFAULT 'bank_transfer',
  bank_account_id       uuid,
  reference             varchar(100),
  notes                 text,
  journal_entry_id      uuid,
  voided_at             timestamptz,
  void_journal_entry_id uuid,
  created_by            uuid REFERENCES users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_labour_settlement_payment_amount CHECK (amount > 0)
);
CREATE INDEX IF NOT EXISTS idx_labour_settlement_payment_settlement
  ON labour_settlement_payments (settlement_id);
CREATE INDEX IF NOT EXISTS idx_labour_settlement_payment_contract
  ON labour_settlement_payments (contract_id);
