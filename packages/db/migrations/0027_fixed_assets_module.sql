-- Fixed Assets module: categories, register, depreciation, sequences

DO $$ BEGIN CREATE TYPE depreciation_method AS ENUM ('slm', 'wdv'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE depreciation_type AS ENUM ('companies_act', 'it_act'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE asset_status AS ENUM ('active', 'disposed', 'written_off', 'cwip'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS asset_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name VARCHAR(100) NOT NULL,
  parent_id UUID,
  dep_method_companies_act depreciation_method NOT NULL DEFAULT 'slm',
  dep_rate_companies_act DECIMAL(5,2) NOT NULL,
  useful_life_years INTEGER,
  dep_method_it_act depreciation_method NOT NULL DEFAULT 'wdv',
  dep_rate_it_act DECIMAL(5,2) NOT NULL,
  asset_account_code VARCHAR(20) NOT NULL,
  dep_expense_account_code VARCHAR(20) NOT NULL,
  accum_dep_account_code VARCHAR(20) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_asset_cat_tenant ON asset_categories (tenant_id);

CREATE TABLE IF NOT EXISTS fixed_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  asset_code VARCHAR(30) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category_id UUID NOT NULL REFERENCES asset_categories(id),
  acquisition_date DATE NOT NULL,
  acquisition_cost DECIMAL(15,2) NOT NULL,
  residual_value DECIMAL(15,2) NOT NULL DEFAULT 0,
  put_to_use_date DATE,
  location VARCHAR(255),
  serial_number VARCHAR(100),
  status asset_status NOT NULL DEFAULT 'active',
  purchase_invoice_id UUID REFERENCES purchase_invoices(id),
  vendor_id UUID REFERENCES vendors(id),
  gst_credit_claimed BOOLEAN NOT NULL DEFAULT false,
  gst_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  disposal_date DATE,
  disposal_amount DECIMAL(15,2),
  disposal_notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, asset_code)
);

CREATE INDEX IF NOT EXISTS idx_fa_tenant_category ON fixed_assets (tenant_id, category_id);
CREATE INDEX IF NOT EXISTS idx_fa_tenant_status ON fixed_assets (tenant_id, status);

CREATE TABLE IF NOT EXISTS depreciation_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  asset_id UUID NOT NULL REFERENCES fixed_assets(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  depreciation_type depreciation_type NOT NULL,
  method depreciation_method NOT NULL,
  rate DECIMAL(5,2) NOT NULL,
  opening_wdv DECIMAL(15,2) NOT NULL,
  depreciation_amount DECIMAL(15,2) NOT NULL,
  closing_wdv DECIMAL(15,2) NOT NULL,
  journal_entry_id UUID REFERENCES journal_entries(id),
  is_posted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dep_tenant_asset_period ON depreciation_entries (tenant_id, asset_id, period_end);
CREATE INDEX IF NOT EXISTS idx_dep_tenant_type_period ON depreciation_entries (tenant_id, depreciation_type, period_end);

CREATE TABLE IF NOT EXISTS asset_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  financial_year VARCHAR(10) NOT NULL,
  last_sequence INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, financial_year)
);
