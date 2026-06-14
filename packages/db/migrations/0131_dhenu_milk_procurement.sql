-- 0131_dhenu_milk_procurement.sql
--
-- Dhenu (milk procurement) module — initial schema.
-- Spec: docs/dhenu-schema-spec.md · architecture docs/dairy-sme-plan.md §3.7.
--
-- 16 `mp_`-prefixed tables: collection network (nodes), farmers + memberships,
-- rate charts (matrix/flat), the append-only pour ledger, tier consignments,
-- QC, payout cycles/lines/deductions + farmer ledger, operator comp, numbering,
-- and GL settings. Reuses existing tables by FK only (vendors, users, accounts,
-- journal_entries, payments, stock_ledger, document_attachments) — no rebuild.
--
-- Mirrors packages/db/src/schema/milk-procurement/*. Apply in native dev via
-- scripts/run-sql.ts (drizzle-kit push is the prod path).

BEGIN;

-- ─── enums ──────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mp_node_type') THEN
    CREATE TYPE mp_node_type AS ENUM ('vmcc', 'cc', 'pp');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mp_payout_mode') THEN
    CREATE TYPE mp_payout_mode AS ENUM ('direct_to_farmer', 'via_vmcc');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mp_milk_type') THEN
    CREATE TYPE mp_milk_type AS ENUM ('cow', 'buffalo', 'mixed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mp_pricing_mode') THEN
    CREATE TYPE mp_pricing_mode AS ENUM ('matrix', 'flat');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mp_grade') THEN
    CREATE TYPE mp_grade AS ENUM ('a', 'b', 'c');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mp_rate_rule') THEN
    CREATE TYPE mp_rate_rule AS ENUM ('quality_bonus', 'volume_slab');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mp_shift') THEN
    CREATE TYPE mp_shift AS ENUM ('am', 'pm');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mp_capture_src') THEN
    CREATE TYPE mp_capture_src AS ENUM ('manual', 'device');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mp_pour_status') THEN
    CREATE TYPE mp_pour_status AS ENUM ('recorded', 'reversed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mp_consignment_kind') THEN
    CREATE TYPE mp_consignment_kind AS ENUM ('vmcc_to_cc', 'cc_to_pp');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mp_consignment_status') THEN
    CREATE TYPE mp_consignment_status AS ENUM ('in_transit', 'received', 'reversed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mp_qc_verdict') THEN
    CREATE TYPE mp_qc_verdict AS ENUM ('pass', 'fail', 'conditional');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mp_cycle_status') THEN
    CREATE TYPE mp_cycle_status AS ENUM ('open', 'locked', 'paid', 'reversed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mp_deduction') THEN
    CREATE TYPE mp_deduction AS ENUM ('advance', 'cattle_feed_loan', 'other');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mp_ledger_entry') THEN
    CREATE TYPE mp_ledger_entry AS ENUM ('advance_given', 'feed_loan_given', 'repayment', 'adjustment');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mp_operator_role') THEN
    CREATE TYPE mp_operator_role AS ENUM ('operator', 'owner');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mp_comp_type') THEN
    CREATE TYPE mp_comp_type AS ENUM ('per_litre_commission', 'fixed_salary');
  END IF;
END $$;

-- ─── mp_nodes (VMCC / CC / PP tree) ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS mp_nodes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id),
  code              varchar(40) NOT NULL,
  name              varchar(255) NOT NULL,
  node_type         mp_node_type NOT NULL,
  parent_node_id    uuid REFERENCES mp_nodes(id),
  has_bmc           boolean NOT NULL DEFAULT false,
  capacity_litres   numeric(12, 1),
  payout_mode       mp_payout_mode,
  payee_vendor_id   uuid REFERENCES vendors(id),
  address_line1     varchar(255),
  address_line2     varchar(255),
  city              varchar(100),
  state             varchar(100),
  pincode           varchar(10),
  lat               numeric(10, 7),
  lng               numeric(10, 7),
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mp_nodes_tenant_code ON mp_nodes (tenant_id, code);
CREATE INDEX IF NOT EXISTS idx_mp_nodes_tenant_type   ON mp_nodes (tenant_id, node_type);
CREATE INDEX IF NOT EXISTS idx_mp_nodes_tenant_parent ON mp_nodes (tenant_id, parent_node_id);

-- ─── mp_farmers + memberships ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mp_farmers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id),
  vendor_id         uuid NOT NULL REFERENCES vendors(id),
  code              varchar(40) NOT NULL,
  name              varchar(255) NOT NULL,
  phone             varchar(20),
  is_society        boolean NOT NULL DEFAULT false,
  default_milk_type mp_milk_type NOT NULL DEFAULT 'cow',
  cattle_count      integer,
  kyc_doc_id        uuid REFERENCES document_attachments(id),
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mp_farmers_tenant_code ON mp_farmers (tenant_id, code);
CREATE INDEX IF NOT EXISTS idx_mp_farmers_tenant_vendor ON mp_farmers (tenant_id, vendor_id);
CREATE INDEX IF NOT EXISTS idx_mp_farmers_tenant_phone  ON mp_farmers (tenant_id, phone);

CREATE TABLE IF NOT EXISTS mp_farmer_memberships (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  farmer_id   uuid NOT NULL REFERENCES mp_farmers(id),
  node_id     uuid NOT NULL REFERENCES mp_nodes(id),
  is_primary  boolean NOT NULL DEFAULT true,
  joined_on   date,
  left_on     date,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mp_membership_active
  ON mp_farmer_memberships (tenant_id, farmer_id, node_id) WHERE left_on IS NULL;
CREATE INDEX IF NOT EXISTS idx_mp_membership_node ON mp_farmer_memberships (tenant_id, node_id);

-- ─── rate charts (matrix or flat) ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS mp_rate_charts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  name                varchar(120) NOT NULL,
  scope_node_id       uuid REFERENCES mp_nodes(id),
  milk_type           mp_milk_type NOT NULL,
  pricing_mode        mp_pricing_mode NOT NULL DEFAULT 'matrix',
  flat_rate_per_litre numeric(8, 2),
  season              varchar(20),
  effective_from      date NOT NULL,
  effective_to        date,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mp_rate_charts_type_eff ON mp_rate_charts (tenant_id, milk_type, effective_from);
CREATE INDEX IF NOT EXISTS idx_mp_rate_charts_scope    ON mp_rate_charts (tenant_id, scope_node_id);

CREATE TABLE IF NOT EXISTS mp_rate_chart_cells (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  rate_chart_id   uuid NOT NULL REFERENCES mp_rate_charts(id),
  fat             numeric(5, 2) NOT NULL,
  snf             numeric(5, 2) NOT NULL,
  rate_per_litre  numeric(8, 2) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mp_rate_cells ON mp_rate_chart_cells (rate_chart_id, fat, snf);

CREATE TABLE IF NOT EXISTS mp_rate_chart_rules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  rate_chart_id   uuid NOT NULL REFERENCES mp_rate_charts(id),
  rule_type       mp_rate_rule NOT NULL,
  grade           mp_grade,
  min_qty         numeric(12, 3),
  max_qty         numeric(12, 3),
  bonus_per_litre numeric(8, 2) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mp_rate_rules_chart ON mp_rate_chart_rules (tenant_id, rate_chart_id);

-- ─── mp_pours (append-only collection ledger) ───────────────────────────

CREATE TABLE IF NOT EXISTS mp_pours (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  node_id         uuid NOT NULL REFERENCES mp_nodes(id),
  farmer_id       uuid NOT NULL REFERENCES mp_farmers(id),
  collection_date date NOT NULL,
  shift           mp_shift NOT NULL,
  milk_type       mp_milk_type NOT NULL,
  qty_litres      numeric(12, 3) NOT NULL,
  fat             numeric(5, 2),
  snf             numeric(5, 2),
  clr             numeric(5, 2),
  temp_c          numeric(4, 1),
  quality_grade   mp_grade,
  rate_chart_id   uuid REFERENCES mp_rate_charts(id),
  rate_per_litre  numeric(8, 2) NOT NULL,
  base_amount     numeric(15, 2) NOT NULL DEFAULT 0,
  bonus_amount    numeric(15, 2) NOT NULL DEFAULT 0,
  line_amount     numeric(15, 2) NOT NULL DEFAULT 0,
  capture_source  mp_capture_src NOT NULL DEFAULT 'manual',
  receipt_no      varchar(40),
  status          mp_pour_status NOT NULL DEFAULT 'recorded',
  reversal_of     uuid REFERENCES mp_pours(id),
  device_local_id varchar(64),
  recorded_by     uuid REFERENCES users(id),
  recorded_at     timestamptz NOT NULL DEFAULT now(),
  synced_at       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_mp_pours_qty_positive CHECK (qty_litres > 0)
);
CREATE INDEX IF NOT EXISTS idx_mp_pours_node_date_shift ON mp_pours (tenant_id, node_id, collection_date, shift);
CREATE INDEX IF NOT EXISTS idx_mp_pours_farmer_date     ON mp_pours (tenant_id, farmer_id, collection_date);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mp_pours_device
  ON mp_pours (tenant_id, node_id, device_local_id) WHERE device_local_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_mp_pours_active_slot
  ON mp_pours (tenant_id, farmer_id, collection_date, shift) WHERE status = 'recorded';

-- ─── mp_consignments (tier transfers) ───────────────────────────────────

CREATE TABLE IF NOT EXISTS mp_consignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  consignment_no  varchar(40) NOT NULL,
  kind            mp_consignment_kind NOT NULL,
  from_node_id    uuid NOT NULL REFERENCES mp_nodes(id),
  to_node_id      uuid NOT NULL REFERENCES mp_nodes(id),
  collection_date date NOT NULL,
  shift           mp_shift,
  container_no    varchar(40),
  dispatch_qty    numeric(12, 3),
  dispatch_fat    numeric(5, 2),
  dispatch_snf    numeric(5, 2),
  dispatched_at   timestamptz,
  dispatched_by   uuid REFERENCES users(id),
  receipt_qty     numeric(12, 3),
  receipt_fat     numeric(5, 2),
  receipt_snf     numeric(5, 2),
  received_at     timestamptz,
  received_by     uuid REFERENCES users(id),
  variance_qty    numeric(12, 3),
  variance_pct    numeric(6, 3),
  stock_ledger_id uuid REFERENCES stock_ledger(id),
  status          mp_consignment_status NOT NULL DEFAULT 'in_transit',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mp_consignment_no ON mp_consignments (tenant_id, consignment_no);
CREATE INDEX IF NOT EXISTS idx_mp_consignment_to          ON mp_consignments (tenant_id, to_node_id, collection_date);
CREATE INDEX IF NOT EXISTS idx_mp_consignment_kind_status ON mp_consignments (tenant_id, kind, status);

-- ─── mp_qc_tests ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mp_qc_tests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id),
  subject_type varchar(20) NOT NULL,
  subject_id   uuid NOT NULL,
  test_code    varchar(40) NOT NULL,
  value        varchar(60),
  uom          varchar(20),
  verdict      mp_qc_verdict,
  tested_at    timestamptz,
  tested_by    uuid REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mp_qc_subject ON mp_qc_tests (tenant_id, subject_type, subject_id);

-- ─── payout (cycles, lines, ledger, deductions) ─────────────────────────

CREATE TABLE IF NOT EXISTS mp_payout_cycles (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id),
  cycle_no         varchar(40) NOT NULL,
  scope_node_id    uuid REFERENCES mp_nodes(id),
  period_start     date NOT NULL,
  period_end       date NOT NULL,
  status           mp_cycle_status NOT NULL DEFAULT 'open',
  total_qty        numeric(12, 3) NOT NULL DEFAULT 0,
  total_gross      numeric(15, 2) NOT NULL DEFAULT 0,
  total_deductions numeric(15, 2) NOT NULL DEFAULT 0,
  total_net        numeric(15, 2) NOT NULL DEFAULT 0,
  journal_entry_id uuid REFERENCES journal_entries(id),
  locked_at        timestamptz,
  paid_at          timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mp_cycle_no ON mp_payout_cycles (tenant_id, cycle_no);
CREATE INDEX IF NOT EXISTS idx_mp_cycle_status ON mp_payout_cycles (tenant_id, status);

CREATE TABLE IF NOT EXISTS mp_payout_lines (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  payout_cycle_id     uuid NOT NULL REFERENCES mp_payout_cycles(id),
  farmer_id           uuid NOT NULL REFERENCES mp_farmers(id),
  qty_litres          numeric(12, 3) NOT NULL DEFAULT 0,
  gross_amount        numeric(15, 2) NOT NULL DEFAULT 0,
  bonus_amount        numeric(15, 2) NOT NULL DEFAULT 0,
  deduction_total     numeric(15, 2) NOT NULL DEFAULT 0,
  net_amount          numeric(15, 2) NOT NULL DEFAULT 0,
  payment_id          uuid REFERENCES payments(id),
  settled_via_node_id uuid REFERENCES mp_nodes(id),
  statement_no        varchar(40),
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mp_payout_lines_cycle  ON mp_payout_lines (tenant_id, payout_cycle_id);
CREATE INDEX IF NOT EXISTS idx_mp_payout_lines_farmer ON mp_payout_lines (tenant_id, farmer_id);

CREATE TABLE IF NOT EXISTS mp_farmer_ledger (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id),
  farmer_id     uuid NOT NULL REFERENCES mp_farmers(id),
  entry_type    mp_ledger_entry NOT NULL,
  amount        numeric(15, 2) NOT NULL,
  balance_after numeric(15, 2) NOT NULL,
  ref_type      varchar(40),
  ref_id        uuid,
  occurred_on   date NOT NULL,
  created_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mp_ledger_farmer ON mp_farmer_ledger (tenant_id, farmer_id, occurred_on);

CREATE TABLE IF NOT EXISTS mp_payout_deductions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  payout_line_id  uuid NOT NULL REFERENCES mp_payout_lines(id),
  deduction_type  mp_deduction NOT NULL,
  ledger_entry_id uuid REFERENCES mp_farmer_ledger(id),
  amount          numeric(15, 2) NOT NULL,
  note            varchar(255),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mp_deductions_line ON mp_payout_deductions (tenant_id, payout_line_id);

-- ─── operations (operator comp, numbering, GL settings) ─────────────────

CREATE TABLE IF NOT EXISTS mp_node_operators (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  node_id         uuid NOT NULL REFERENCES mp_nodes(id),
  user_id         uuid REFERENCES users(id),
  payee_vendor_id uuid REFERENCES vendors(id),
  role            mp_operator_role NOT NULL DEFAULT 'operator',
  comp_type       mp_comp_type NOT NULL,
  rate_per_litre  numeric(15, 2),
  monthly_salary  numeric(15, 2),
  rent_amount     numeric(15, 2),
  effective_from  date NOT NULL,
  effective_to    date,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mp_node_operators_node ON mp_node_operators (tenant_id, node_id);

CREATE TABLE IF NOT EXISTS mp_sequences (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id),
  doc_type       varchar(20) NOT NULL,
  financial_year varchar(10) NOT NULL,
  last_sequence  integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mp_sequences ON mp_sequences (tenant_id, doc_type, financial_year);

CREATE TABLE IF NOT EXISTS mp_gl_settings (
  id                           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                    uuid NOT NULL REFERENCES tenants(id),
  default_payout_mode          mp_payout_mode NOT NULL DEFAULT 'direct_to_farmer',
  milk_purchase_account_id     uuid REFERENCES accounts(id),
  farmer_payable_account_id    uuid REFERENCES accounts(id),
  quality_bonus_account_id     uuid REFERENCES accounts(id),
  advance_account_id           uuid REFERENCES accounts(id),
  feed_loan_account_id         uuid REFERENCES accounts(id),
  raw_milk_inventory_account_id uuid REFERENCES accounts(id),
  variance_account_id          uuid REFERENCES accounts(id),
  created_at                   timestamptz NOT NULL DEFAULT now(),
  updated_at                   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mp_gl_settings_tenant ON mp_gl_settings (tenant_id);

COMMIT;
