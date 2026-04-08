CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"parent_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quick_invoice_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"payment_terms_days" integer DEFAULT 30 NOT NULL,
	"notes" text,
	"items" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sales_quotes" ALTER COLUMN "customer_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_quotes" ADD COLUMN "prospect_name" varchar(255);--> statement-breakpoint
ALTER TABLE "sales_quotes" ADD COLUMN "prospect_email" varchar(255);--> statement-breakpoint
ALTER TABLE "sales_quotes" ADD COLUMN "prospect_phone" varchar(20);--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quick_invoice_templates" ADD CONSTRAINT "quick_invoice_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quick_invoice_templates" ADD CONSTRAINT "quick_invoice_templates_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_categories_tenant" ON "categories" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_categories_parent" ON "categories" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_categories_tenant_name_parent" ON "categories" USING btree ("tenant_id","name","parent_id");--> statement-breakpoint
CREATE INDEX "idx_qit_tenant_customer" ON "quick_invoice_templates" USING btree ("tenant_id","customer_id");--> statement-breakpoint
CREATE INDEX "idx_qit_tenant_active" ON "quick_invoice_templates" USING btree ("tenant_id","is_active");--> statement-breakpoint
CREATE INDEX "idx_pii_invoice_id" ON "purchase_invoice_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "idx_adv_adj_advance" ON "advance_adjustments" USING btree ("advance_id");--> statement-breakpoint
CREATE INDEX "idx_adv_adj_invoice" ON "advance_adjustments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "idx_adv_pay_tenant_vendor" ON "advance_payments" USING btree ("tenant_id","vendor_id");--> statement-breakpoint
CREATE INDEX "idx_pa_payment_id" ON "payment_allocations" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "idx_pa_invoice_id" ON "payment_allocations" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "idx_sii_invoice_id" ON "sales_invoice_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "idx_rm_bank_transaction_id" ON "reconciliation_matches" USING btree ("bank_transaction_id");--> statement-breakpoint
CREATE INDEX "idx_rm_payment_id" ON "reconciliation_matches" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "idx_rm_receipt_id" ON "reconciliation_matches" USING btree ("receipt_id");--> statement-breakpoint
CREATE INDEX "idx_audit_tenant_entity" ON "audit_log" USING btree ("tenant_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_audit_tenant_created" ON "audit_log" USING btree ("tenant_id","created_at");