-- Add new columns to items table
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "mrp" numeric(15, 2);--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "cost_price" numeric(15, 2);--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "subcategory" varchar(50);--> statement-breakpoint

-- Create price list enums
DO $$ BEGIN
  CREATE TYPE "public"."price_list_type" AS ENUM('selling', 'buying');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "public"."price_list_apply_to" AS ENUM('all', 'customer_group', 'vendor_group', 'customer', 'vendor');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

-- Create price_lists table
CREATE TABLE IF NOT EXISTS "price_lists" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "name" varchar(255) NOT NULL,
  "type" "price_list_type" NOT NULL,
  "currency" varchar(3) DEFAULT 'INR' NOT NULL,
  "apply_to" "price_list_apply_to" DEFAULT 'all' NOT NULL,
  "apply_to_value" varchar(255),
  "customer_id" uuid,
  "vendor_id" uuid,
  "valid_from" date,
  "valid_to" date,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

-- Create price_list_items table
CREATE TABLE IF NOT EXISTS "price_list_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "price_list_id" uuid NOT NULL,
  "item_id" uuid NOT NULL,
  "rate" numeric(15, 2) NOT NULL,
  "margin_percent" numeric(5, 2),
  "discount_percent" numeric(5, 2),
  "min_quantity" numeric(12, 3),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

-- Foreign keys
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_price_list_id_price_lists_id_fk" FOREIGN KEY ("price_list_id") REFERENCES "public"."price_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- Indexes
CREATE INDEX IF NOT EXISTS "idx_price_lists_tenant_active" ON "price_lists" USING btree ("tenant_id","is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_price_lists_tenant_type" ON "price_lists" USING btree ("tenant_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_price_list_items_list_item" ON "price_list_items" USING btree ("price_list_id","item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_price_list_items_item" ON "price_list_items" USING btree ("item_id");
