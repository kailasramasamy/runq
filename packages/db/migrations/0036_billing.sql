-- Billing: plans, subscriptions, platform invoices, payment events.

DO $$ BEGIN
  CREATE TYPE billing_interval AS ENUM ('monthly', 'yearly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE subscription_status AS ENUM ('trialing', 'active', 'past_due', 'cancelled', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE platform_invoice_status AS ENUM ('draft', 'issued', 'paid', 'failed', 'refunded', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL,
  interval billing_interval NOT NULL DEFAULT 'monthly',
  modules JSONB NOT NULL DEFAULT '[]'::jsonb,
  features JSONB NOT NULL DEFAULT '{}'::jsonb,
  razorpay_plan_id VARCHAR(80),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  plan_id UUID NOT NULL REFERENCES plans(id),
  status subscription_status NOT NULL DEFAULT 'trialing',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  razorpay_subscription_id VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subs_tenant ON subscriptions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_subs_status ON subscriptions (status);

CREATE TABLE IF NOT EXISTS platform_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  subscription_id UUID REFERENCES subscriptions(id),
  number VARCHAR(40) NOT NULL UNIQUE,
  amount_cents INTEGER NOT NULL,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL,
  status platform_invoice_status NOT NULL DEFAULT 'draft',
  issued_at TIMESTAMPTZ,
  due_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  razorpay_invoice_id VARCHAR(80),
  pdf_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pinv_tenant_created ON platform_invoices (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pinv_status ON platform_invoices (status);

-- Raw payment provider events log (Razorpay webhooks etc).
CREATE TABLE IF NOT EXISTS payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(20) NOT NULL DEFAULT 'razorpay',
  event_type VARCHAR(80) NOT NULL,
  external_id VARCHAR(120),
  tenant_id UUID REFERENCES tenants(id),
  invoice_id UUID REFERENCES platform_invoices(id),
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payevt_tenant ON payment_events (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payevt_external ON payment_events (provider, external_id);

-- Now that plans table exists, link tenants.plan_id properly.
ALTER TABLE tenants
  ADD CONSTRAINT tenants_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE SET NULL;

-- Seed three default plans (Starter / Pro / Enterprise).
INSERT INTO plans (code, name, description, price_cents, interval, modules, features, sort_order)
VALUES
  ('starter', 'Starter', 'For small businesses just getting started with finance and invoicing.',
   49900, 'monthly',
   '["ar","ap","banking"]'::jsonb,
   '{"users": 3, "storage_gb": 5, "ai_extractions": 100}'::jsonb,
   10),
  ('pro', 'Pro', 'For growing businesses that need GST filing, fixed assets, and HR.',
   149900, 'monthly',
   '["ar","ap","banking","gst","fa","hr"]'::jsonb,
   '{"users": 10, "storage_gb": 50, "ai_extractions": 1000}'::jsonb,
   20),
  ('enterprise', 'Enterprise', 'For established companies that need everything plus priority support and custom integrations.',
   499900, 'monthly',
   '["ar","ap","banking","gst","fa","hr","integrations","ca-portal","reports"]'::jsonb,
   '{"users": -1, "storage_gb": 500, "ai_extractions": -1, "priority_support": true}'::jsonb,
   30)
ON CONFLICT (code) DO NOTHING;
