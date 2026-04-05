CREATE TYPE "public"."user_role" AS ENUM('owner', 'accountant', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."po_status" AS ENUM('draft', 'confirmed', 'partially_received', 'fully_received', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."grn_status" AS ENUM('draft', 'confirmed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('unmatched', 'matched', 'mismatch');--> statement-breakpoint
CREATE TYPE "public"."purchase_invoice_status" AS ENUM('draft', 'pending_match', 'matched', 'approved', 'partially_paid', 'paid', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('bank_transfer');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'completed', 'failed', 'reversed');--> statement-breakpoint
CREATE TYPE "public"."instruction_status" AS ENUM('pending', 'approved', 'rejected', 'paid', 'failed');--> statement-breakpoint
CREATE TYPE "public"."payment_batch_status" AS ENUM('pending_approval', 'partially_approved', 'approved', 'rejected', 'executed');--> statement-breakpoint
CREATE TYPE "public"."debit_note_status" AS ENUM('draft', 'issued', 'adjusted', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."customer_type" AS ENUM('b2b', 'payment_gateway');--> statement-breakpoint
CREATE TYPE "public"."sales_invoice_status" AS ENUM('draft', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."tax_category" AS ENUM('taxable', 'exempt', 'nil_rated', 'zero_rated', 'reverse_charge');--> statement-breakpoint
CREATE TYPE "public"."credit_note_status" AS ENUM('draft', 'issued', 'adjusted', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."dunning_action" AS ENUM('send_reminder', 'stop_supply', 'escalate_to_manager');--> statement-breakpoint
CREATE TYPE "public"."dunning_channel" AS ENUM('email', 'sms', 'whatsapp');--> statement-breakpoint
CREATE TYPE "public"."bank_account_type" AS ENUM('current', 'savings', 'overdraft', 'cash_credit');--> statement-breakpoint
CREATE TYPE "public"."bank_txn_type" AS ENUM('credit', 'debit');--> statement-breakpoint
CREATE TYPE "public"."recon_status" AS ENUM('unreconciled', 'matched', 'manually_matched', 'excluded');--> statement-breakpoint
CREATE TYPE "public"."recon_match_type" AS ENUM('auto_utr', 'auto_amount_date', 'manual');--> statement-breakpoint
CREATE TYPE "public"."pg_gateway" AS ENUM('razorpay', 'phonepe', 'paytm');--> statement-breakpoint
CREATE TYPE "public"."pg_match_status" AS ENUM('unmatched', 'matched', 'disputed');--> statement-breakpoint
CREATE TYPE "public"."webhook_event_status" AS ENUM('received', 'processing', 'processed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."webhook_event_type" AS ENUM('vendor.created', 'vendor.updated', 'po.created', 'po.updated', 'grn.created', 'grn.updated', 'invoice.created', 'invoice.updated', 'purchase_invoice.created', 'sales_invoice.created');--> statement-breakpoint
CREATE TYPE "public"."account_type" AS ENUM('asset', 'liability', 'equity', 'revenue', 'expense');--> statement-breakpoint
CREATE TYPE "public"."journal_entry_status" AS ENUM('draft', 'posted', 'reversed');--> statement-breakpoint
CREATE TYPE "public"."hsn_sac_type" AS ENUM('hsn', 'sac');--> statement-breakpoint
CREATE TYPE "public"."attachment_entity_type" AS ENUM('sales_invoice', 'purchase_invoice', 'payment', 'receipt', 'expense');--> statement-breakpoint
CREATE TYPE "public"."recurrence_frequency" AS ENUM('monthly', 'quarterly', 'yearly', 'custom');--> statement-breakpoint
CREATE TYPE "public"."recurring_status" AS ENUM('active', 'paused', 'completed');--> statement-breakpoint
CREATE TYPE "public"."cheque_party_type" AS ENUM('vendor', 'customer');--> statement-breakpoint
CREATE TYPE "public"."cheque_status" AS ENUM('pending', 'deposited', 'cleared', 'bounced', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."cheque_type" AS ENUM('received', 'issued');--> statement-breakpoint
CREATE TYPE "public"."collection_status" AS ENUM('open', 'contacted', 'promised', 'resolved', 'escalated');--> statement-breakpoint
CREATE TYPE "public"."fiscal_period_status" AS ENUM('open', 'closed', 'locked');--> statement-breakpoint
CREATE TYPE "public"."approval_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."approval_step_status" AS ENUM('pending', 'approved', 'rejected', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('open', 'in_progress', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."vendor_contract_status" AS ENUM('draft', 'active', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."requisition_status" AS ENUM('draft', 'pending_approval', 'approved', 'rejected', 'converted');--> statement-breakpoint
CREATE TYPE "public"."report_frequency" AS ENUM('daily', 'weekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."payment_schedule_status" AS ENUM('draft', 'approved', 'processing', 'completed', 'cancelled');--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"role" "user_role" DEFAULT 'viewer' NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"gstin" varchar(15),
	"pan" varchar(10),
	"email" varchar(255),
	"phone" varchar(20),
	"address_line1" varchar(255),
	"address_line2" varchar(255),
	"city" varchar(100),
	"state" varchar(100),
	"pincode" varchar(10),
	"bank_account_name" varchar(255),
	"bank_account_number" varchar(30),
	"bank_ifsc" varchar(11),
	"bank_name" varchar(255),
	"payment_terms_days" integer DEFAULT 30 NOT NULL,
	"wms_vendor_id" varchar(100),
	"category" varchar(50),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "purchase_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"po_id" uuid NOT NULL,
	"item_name" varchar(255) NOT NULL,
	"sku" varchar(100),
	"quantity" numeric(12, 3) NOT NULL,
	"unit_price" numeric(15, 2) NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"po_number" varchar(50) NOT NULL,
	"vendor_id" uuid NOT NULL,
	"order_date" date NOT NULL,
	"expected_delivery_date" date,
	"status" "po_status" DEFAULT 'confirmed' NOT NULL,
	"total_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"wms_po_id" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goods_receipt_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"grn_number" varchar(50) NOT NULL,
	"po_id" uuid NOT NULL,
	"received_date" date NOT NULL,
	"status" "grn_status" DEFAULT 'confirmed' NOT NULL,
	"notes" text,
	"wms_grn_id" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grn_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"grn_id" uuid NOT NULL,
	"po_item_id" uuid,
	"item_name" varchar(255) NOT NULL,
	"sku" varchar(100),
	"ordered_quantity" numeric(12, 3) NOT NULL,
	"received_quantity" numeric(12, 3) NOT NULL,
	"accepted_quantity" numeric(12, 3) NOT NULL,
	"rejected_quantity" numeric(12, 3) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"po_item_id" uuid,
	"item_name" varchar(255) NOT NULL,
	"sku" varchar(100),
	"quantity" numeric(12, 3) NOT NULL,
	"unit_price" numeric(15, 2) NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"hsn_sac_code" varchar(8),
	"tax_category" "tax_category",
	"tax_rate" numeric(5, 2),
	"cgst_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"cgst_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"sgst_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"sgst_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"igst_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"igst_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"cess_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"cess_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"tds_section" varchar(20),
	"tds_rate" numeric(5, 2),
	"tds_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"invoice_number" varchar(50) NOT NULL,
	"vendor_id" uuid NOT NULL,
	"po_id" uuid,
	"grn_id" uuid,
	"invoice_date" date NOT NULL,
	"due_date" date NOT NULL,
	"subtotal" numeric(15, 2) NOT NULL,
	"tax_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"total_amount" numeric(15, 2) NOT NULL,
	"amount_paid" numeric(15, 2) DEFAULT '0' NOT NULL,
	"balance_due" numeric(15, 2) NOT NULL,
	"status" "purchase_invoice_status" DEFAULT 'draft' NOT NULL,
	"match_status" "match_status" DEFAULT 'unmatched' NOT NULL,
	"match_notes" text,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"wms_invoice_id" varchar(100),
	"place_of_supply" varchar(100),
	"place_of_supply_code" varchar(2),
	"is_inter_state" boolean,
	"cgst_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"sgst_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"igst_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"cess_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"reverse_charge" boolean DEFAULT false NOT NULL,
	"tds_section" varchar(20),
	"tds_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "advance_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"advance_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"adjusted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "advance_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"payment_id" uuid,
	"amount" numeric(15, 2) NOT NULL,
	"balance" numeric(15, 2) NOT NULL,
	"advance_date" date NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"bank_account_id" uuid,
	"payment_date" date NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"payment_method" "payment_method" DEFAULT 'bank_transfer' NOT NULL,
	"utr_number" varchar(50),
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"notes" text,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"batch_id" varchar(100) NOT NULL,
	"source" varchar(100) NOT NULL,
	"description" text,
	"status" "payment_batch_status" DEFAULT 'pending_approval' NOT NULL,
	"total_count" integer NOT NULL,
	"total_amount" numeric(15, 2) NOT NULL,
	"approved_count" integer DEFAULT 0 NOT NULL,
	"approved_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_instructions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"vendor_id" uuid,
	"vendor_name" varchar(255) NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"reference" varchar(100),
	"reason" text,
	"due_date" date,
	"status" "instruction_status" DEFAULT 'pending' NOT NULL,
	"payment_id" uuid,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "debit_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"debit_note_number" varchar(50) NOT NULL,
	"vendor_id" uuid NOT NULL,
	"invoice_id" uuid,
	"issue_date" date NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"reason" text NOT NULL,
	"status" "debit_note_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" "customer_type" DEFAULT 'b2b' NOT NULL,
	"email" varchar(255),
	"phone" varchar(20),
	"gstin" varchar(15),
	"pan" varchar(10),
	"address_line1" varchar(255),
	"address_line2" varchar(255),
	"city" varchar(100),
	"state" varchar(100),
	"pincode" varchar(10),
	"credit_limit" numeric(15, 2),
	"payment_terms_days" integer DEFAULT 30 NOT NULL,
	"contact_person" varchar(255),
	"overdue_interest_rate" numeric(5, 2),
	"portal_slug" varchar(32),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "customers_portal_slug_unique" UNIQUE("portal_slug")
);
--> statement-breakpoint
CREATE TABLE "invoice_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"financial_year" varchar(10) NOT NULL,
	"last_sequence" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_sequences_tenant_id_financial_year_unique" UNIQUE("tenant_id","financial_year")
);
--> statement-breakpoint
CREATE TABLE "sales_invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"description" varchar(500) NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"unit_price" numeric(15, 2) NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"hsn_sac_code" varchar(8),
	"tax_category" "tax_category",
	"tax_rate" numeric(5, 2),
	"cgst_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"cgst_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"sgst_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"sgst_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"igst_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"igst_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"cess_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"cess_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"invoice_number" varchar(50) NOT NULL,
	"customer_id" uuid NOT NULL,
	"invoice_date" date NOT NULL,
	"due_date" date NOT NULL,
	"subtotal" numeric(15, 2) NOT NULL,
	"tax_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"total_amount" numeric(15, 2) NOT NULL,
	"amount_received" numeric(15, 2) DEFAULT '0' NOT NULL,
	"balance_due" numeric(15, 2) NOT NULL,
	"status" "sales_invoice_status" DEFAULT 'draft' NOT NULL,
	"discount_percent" numeric(5, 2),
	"discount_days" integer,
	"notes" text,
	"file_url" varchar(500),
	"place_of_supply" varchar(100),
	"place_of_supply_code" varchar(2),
	"is_inter_state" boolean,
	"cgst_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"sgst_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"igst_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"cess_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"reverse_charge" boolean DEFAULT false NOT NULL,
	"wms_invoice_id" varchar(100),
	"irn_number" varchar(100),
	"irn_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"bank_account_id" uuid,
	"receipt_date" date NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"reference_number" varchar(100),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipt_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"receipt_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"credit_note_number" varchar(50) NOT NULL,
	"customer_id" uuid NOT NULL,
	"invoice_id" uuid,
	"issue_date" date NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"reason" text NOT NULL,
	"status" "credit_note_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dunning_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"rule_id" uuid NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"channel" "dunning_channel" NOT NULL,
	"status" varchar(20) DEFAULT 'sent' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dunning_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"days_after_due" integer NOT NULL,
	"channel" "dunning_channel" DEFAULT 'email' NOT NULL,
	"subject_template" varchar(500),
	"body_template" text NOT NULL,
	"escalation_level" integer DEFAULT 1 NOT NULL,
	"action" "dunning_action" DEFAULT 'send_reminder' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"bank_name" varchar(255) NOT NULL,
	"account_number" varchar(30) NOT NULL,
	"ifsc_code" varchar(11) NOT NULL,
	"account_type" "bank_account_type" DEFAULT 'current' NOT NULL,
	"opening_balance" numeric(15, 2) DEFAULT '0' NOT NULL,
	"current_balance" numeric(15, 2) DEFAULT '0' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"transaction_date" date NOT NULL,
	"value_date" date,
	"type" "bank_txn_type" NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"reference" varchar(100),
	"narration" varchar(500),
	"running_balance" numeric(15, 2),
	"recon_status" "recon_status" DEFAULT 'unreconciled' NOT NULL,
	"import_batch_id" uuid,
	"gl_account_id" uuid,
	"gl_confidence" numeric(3, 2),
	"gl_suggested_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_reconciliations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"bank_closing_balance" numeric(15, 2) NOT NULL,
	"book_closing_balance" numeric(15, 2) NOT NULL,
	"difference" numeric(15, 2) NOT NULL,
	"is_completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reconciliation_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"bank_transaction_id" uuid NOT NULL,
	"payment_id" uuid,
	"receipt_id" uuid,
	"match_type" "recon_match_type" NOT NULL,
	"matched_by" uuid,
	"matched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "petty_cash_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"location" varchar(255),
	"cash_limit" numeric(15, 2) NOT NULL,
	"current_balance" numeric(15, 2) DEFAULT '0' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "petty_cash_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"transaction_date" date NOT NULL,
	"type" "bank_txn_type" NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"description" varchar(500) NOT NULL,
	"category" varchar(100),
	"approved_by" uuid,
	"receipt_url" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pg_settlement_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"settlement_id" uuid NOT NULL,
	"order_id" varchar(100) NOT NULL,
	"transaction_id" varchar(100) NOT NULL,
	"transaction_date" timestamp with time zone NOT NULL,
	"gross_amount" numeric(15, 2) NOT NULL,
	"fee" numeric(15, 2) NOT NULL,
	"tax" numeric(15, 2) DEFAULT '0' NOT NULL,
	"net_amount" numeric(15, 2) NOT NULL,
	"match_status" "pg_match_status" DEFAULT 'unmatched' NOT NULL,
	"receipt_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pg_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"gateway" "pg_gateway" NOT NULL,
	"settlement_id" varchar(100) NOT NULL,
	"settlement_date" date NOT NULL,
	"gross_amount" numeric(15, 2) NOT NULL,
	"total_fees" numeric(15, 2) NOT NULL,
	"total_tax" numeric(15, 2) DEFAULT '0' NOT NULL,
	"net_amount" numeric(15, 2) NOT NULL,
	"bank_account_id" uuid,
	"bank_transaction_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" varchar(255) NOT NULL,
	"tenant_id" uuid NOT NULL,
	"event_type" "webhook_event_type" NOT NULL,
	"source" varchar(50) DEFAULT 'wms' NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "webhook_event_status" DEFAULT 'received' NOT NULL,
	"error_message" text,
	"retries" integer DEFAULT 0 NOT NULL,
	"max_retries" integer DEFAULT 3 NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"action" varchar(50) NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" uuid NOT NULL,
	"changes" jsonb,
	"metadata" jsonb,
	"ip_address" varchar(45),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" varchar(20) NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" "account_type" NOT NULL,
	"parent_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_system_account" boolean DEFAULT false NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_tenant_id_code_unique" UNIQUE("tenant_id","code")
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"entry_number" varchar(50) NOT NULL,
	"date" date NOT NULL,
	"description" text NOT NULL,
	"status" "journal_entry_status" DEFAULT 'posted' NOT NULL,
	"source_type" varchar(50),
	"source_id" uuid,
	"total_debit" numeric(15, 2) NOT NULL,
	"total_credit" numeric(15, 2) NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_entries_tenant_id_entry_number_unique" UNIQUE("tenant_id","entry_number")
);
--> statement-breakpoint
CREATE TABLE "journal_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"journal_entry_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"debit" numeric(15, 2) DEFAULT '0' NOT NULL,
	"credit" numeric(15, 2) DEFAULT '0' NOT NULL,
	"description" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"financial_year" varchar(10) NOT NULL,
	"last_sequence" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_sequences_tenant_id_financial_year_unique" UNIQUE("tenant_id","financial_year")
);
--> statement-breakpoint
CREATE TABLE "hsn_sac_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(8) NOT NULL,
	"type" "hsn_sac_type" NOT NULL,
	"description" varchar(500) NOT NULL,
	"gst_rate" numeric(5, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hsn_sac_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "document_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"entity_type" "attachment_entity_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_size" integer NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"storage_key" varchar(500) NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_invoice_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"frequency" "recurrence_frequency" NOT NULL,
	"interval_days" integer,
	"day_of_month" integer NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"next_run_date" date NOT NULL,
	"status" "recurring_status" DEFAULT 'active' NOT NULL,
	"items" jsonb NOT NULL,
	"notes" text,
	"auto_send" boolean DEFAULT false NOT NULL,
	"last_generated_at" timestamp with time zone,
	"total_generated" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cheques" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"cheque_number" varchar(20) NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"type" "cheque_type" NOT NULL,
	"party_type" "cheque_party_type" NOT NULL,
	"party_id" uuid NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"cheque_date" date NOT NULL,
	"deposit_date" date,
	"status" "cheque_status" DEFAULT 'pending' NOT NULL,
	"linked_invoice_id" uuid,
	"bounced_at" timestamp with time zone,
	"bounce_reason" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"assigned_to" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "collection_status" DEFAULT 'open' NOT NULL,
	"notes" text,
	"follow_up_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fiscal_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(50) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" "fiscal_period_status" DEFAULT 'open' NOT NULL,
	"closed_by" uuid,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fiscal_periods_tenant_id_start_date_unique" UNIQUE("tenant_id","start_date")
);
--> statement-breakpoint
CREATE TABLE "approval_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" uuid NOT NULL,
	"status" "approval_status" DEFAULT 'pending' NOT NULL,
	"requested_by" uuid NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"step_order" integer NOT NULL,
	"approver_role" varchar(50) NOT NULL,
	"min_amount" numeric(15, 2),
	"max_amount" numeric(15, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"instance_id" uuid NOT NULL,
	"rule_id" uuid NOT NULL,
	"step_order" integer NOT NULL,
	"status" "approval_step_status" DEFAULT 'pending' NOT NULL,
	"assigned_to" uuid,
	"assigned_role" varchar(50) NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_workflows_tenant_id_name_unique" UNIQUE("tenant_id","name")
);
--> statement-breakpoint
CREATE TABLE "transaction_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"assigned_to" uuid NOT NULL,
	"assigned_by" uuid NOT NULL,
	"due_date" date,
	"status" "task_status" DEFAULT 'open' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" varchar(100) NOT NULL,
	"description" text NOT NULL,
	"user_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"contract_number" varchar(50) NOT NULL,
	"title" varchar(255) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"value" numeric(15, 2),
	"terms" text,
	"status" "vendor_contract_status" DEFAULT 'draft' NOT NULL,
	"renewal_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"period" varchar(10) NOT NULL,
	"delivery_score" integer NOT NULL,
	"quality_score" integer NOT NULL,
	"pricing_score" integer NOT NULL,
	"overall_score" integer NOT NULL,
	"notes" text,
	"rated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendor_ratings_tenant_id_vendor_id_period_unique" UNIQUE("tenant_id","vendor_id","period")
);
--> statement-breakpoint
CREATE TABLE "purchase_requisition_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"requisition_id" uuid NOT NULL,
	"item_name" varchar(255) NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"estimated_unit_price" numeric(15, 2) NOT NULL,
	"estimated_amount" numeric(15, 2) NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_requisitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"requisition_number" varchar(50) NOT NULL,
	"requested_by" uuid NOT NULL,
	"vendor_id" uuid,
	"description" text NOT NULL,
	"total_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"status" "requisition_status" DEFAULT 'draft' NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"po_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dashboard_widgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"widget_type" varchar(50) NOT NULL,
	"position" integer NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"report_type" varchar(50) NOT NULL,
	"frequency" "report_frequency" NOT NULL,
	"recipients" jsonb NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_sent_at" timestamp with time zone,
	"next_run_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"integration_id" uuid NOT NULL,
	"action" varchar(100) NOT NULL,
	"status" varchar(20) NOT NULL,
	"message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider" varchar(50) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_sync_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integrations_tenant_id_provider_unique" UNIQUE("tenant_id","provider")
);
--> statement-breakpoint
CREATE TABLE "payment_schedule_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"schedule_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"scheduled_date" date NOT NULL,
	"status" "payment_schedule_status" DEFAULT 'draft' NOT NULL,
	"total_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"created_by" uuid NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_notes" ADD CONSTRAINT "goods_receipt_notes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_notes" ADD CONSTRAINT "goods_receipt_notes_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grn_items" ADD CONSTRAINT "grn_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grn_items" ADD CONSTRAINT "grn_items_grn_id_goods_receipt_notes_id_fk" FOREIGN KEY ("grn_id") REFERENCES "public"."goods_receipt_notes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grn_items" ADD CONSTRAINT "grn_items_po_item_id_purchase_order_items_id_fk" FOREIGN KEY ("po_item_id") REFERENCES "public"."purchase_order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_invoice_items" ADD CONSTRAINT "purchase_invoice_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_invoice_items" ADD CONSTRAINT "purchase_invoice_items_invoice_id_purchase_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."purchase_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_invoice_items" ADD CONSTRAINT "purchase_invoice_items_po_item_id_purchase_order_items_id_fk" FOREIGN KEY ("po_item_id") REFERENCES "public"."purchase_order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_grn_id_goods_receipt_notes_id_fk" FOREIGN KEY ("grn_id") REFERENCES "public"."goods_receipt_notes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advance_adjustments" ADD CONSTRAINT "advance_adjustments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advance_adjustments" ADD CONSTRAINT "advance_adjustments_advance_id_advance_payments_id_fk" FOREIGN KEY ("advance_id") REFERENCES "public"."advance_payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advance_adjustments" ADD CONSTRAINT "advance_adjustments_invoice_id_purchase_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."purchase_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advance_payments" ADD CONSTRAINT "advance_payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advance_payments" ADD CONSTRAINT "advance_payments_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advance_payments" ADD CONSTRAINT "advance_payments_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoice_id_purchase_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."purchase_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_batches" ADD CONSTRAINT "payment_batches_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_batches" ADD CONSTRAINT "payment_batches_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_instructions" ADD CONSTRAINT "payment_instructions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_instructions" ADD CONSTRAINT "payment_instructions_batch_id_payment_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."payment_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_instructions" ADD CONSTRAINT "payment_instructions_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_instructions" ADD CONSTRAINT "payment_instructions_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_invoice_id_purchase_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."purchase_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_sequences" ADD CONSTRAINT "invoice_sequences_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_invoice_items" ADD CONSTRAINT "sales_invoice_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_invoice_items" ADD CONSTRAINT "sales_invoice_items_invoice_id_sales_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."sales_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_allocations" ADD CONSTRAINT "receipt_allocations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_allocations" ADD CONSTRAINT "receipt_allocations_receipt_id_payment_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."payment_receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_allocations" ADD CONSTRAINT "receipt_allocations_invoice_id_sales_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."sales_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoice_id_sales_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."sales_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunning_log" ADD CONSTRAINT "dunning_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunning_log" ADD CONSTRAINT "dunning_log_invoice_id_sales_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."sales_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunning_log" ADD CONSTRAINT "dunning_log_rule_id_dunning_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."dunning_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunning_rules" ADD CONSTRAINT "dunning_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_gl_account_id_accounts_id_fk" FOREIGN KEY ("gl_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_matches" ADD CONSTRAINT "reconciliation_matches_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_matches" ADD CONSTRAINT "reconciliation_matches_bank_transaction_id_bank_transactions_id_fk" FOREIGN KEY ("bank_transaction_id") REFERENCES "public"."bank_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_matches" ADD CONSTRAINT "reconciliation_matches_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_matches" ADD CONSTRAINT "reconciliation_matches_receipt_id_payment_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."payment_receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_matches" ADD CONSTRAINT "reconciliation_matches_matched_by_users_id_fk" FOREIGN KEY ("matched_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "petty_cash_accounts" ADD CONSTRAINT "petty_cash_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "petty_cash_transactions" ADD CONSTRAINT "petty_cash_transactions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "petty_cash_transactions" ADD CONSTRAINT "petty_cash_transactions_account_id_petty_cash_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."petty_cash_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "petty_cash_transactions" ADD CONSTRAINT "petty_cash_transactions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pg_settlement_lines" ADD CONSTRAINT "pg_settlement_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pg_settlement_lines" ADD CONSTRAINT "pg_settlement_lines_settlement_id_pg_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."pg_settlements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pg_settlement_lines" ADD CONSTRAINT "pg_settlement_lines_receipt_id_payment_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."payment_receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pg_settlements" ADD CONSTRAINT "pg_settlements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pg_settlements" ADD CONSTRAINT "pg_settlements_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pg_settlements" ADD CONSTRAINT "pg_settlements_bank_transaction_id_bank_transactions_id_fk" FOREIGN KEY ("bank_transaction_id") REFERENCES "public"."bank_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_sequences" ADD CONSTRAINT "journal_sequences_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_attachments" ADD CONSTRAINT "document_attachments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_attachments" ADD CONSTRAINT "document_attachments_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_invoice_templates" ADD CONSTRAINT "recurring_invoice_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_invoice_templates" ADD CONSTRAINT "recurring_invoice_templates_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_assignments" ADD CONSTRAINT "collection_assignments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_assignments" ADD CONSTRAINT "collection_assignments_invoice_id_sales_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."sales_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_assignments" ADD CONSTRAINT "collection_assignments_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_periods" ADD CONSTRAINT "fiscal_periods_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_periods" ADD CONSTRAINT "fiscal_periods_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_instances" ADD CONSTRAINT "approval_instances_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_instances" ADD CONSTRAINT "approval_instances_workflow_id_approval_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."approval_workflows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_instances" ADD CONSTRAINT "approval_instances_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_rules" ADD CONSTRAINT "approval_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_rules" ADD CONSTRAINT "approval_rules_workflow_id_approval_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."approval_workflows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_instance_id_approval_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."approval_instances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_rule_id_approval_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."approval_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_workflows" ADD CONSTRAINT "approval_workflows_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_comments" ADD CONSTRAINT "transaction_comments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_comments" ADD CONSTRAINT "transaction_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_contracts" ADD CONSTRAINT "vendor_contracts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_contracts" ADD CONSTRAINT "vendor_contracts_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_ratings" ADD CONSTRAINT "vendor_ratings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_ratings" ADD CONSTRAINT "vendor_ratings_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_ratings" ADD CONSTRAINT "vendor_ratings_rated_by_users_id_fk" FOREIGN KEY ("rated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requisition_items" ADD CONSTRAINT "purchase_requisition_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requisition_items" ADD CONSTRAINT "purchase_requisition_items_requisition_id_purchase_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."purchase_requisitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requisitions" ADD CONSTRAINT "purchase_requisitions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requisitions" ADD CONSTRAINT "purchase_requisitions_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requisitions" ADD CONSTRAINT "purchase_requisitions_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requisitions" ADD CONSTRAINT "purchase_requisitions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requisitions" ADD CONSTRAINT "purchase_requisitions_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_widgets" ADD CONSTRAINT "dashboard_widgets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_widgets" ADD CONSTRAINT "dashboard_widgets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_reports" ADD CONSTRAINT "scheduled_reports_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_reports" ADD CONSTRAINT "scheduled_reports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_logs" ADD CONSTRAINT "integration_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_logs" ADD CONSTRAINT "integration_logs_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_schedule_items" ADD CONSTRAINT "payment_schedule_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_schedule_items" ADD CONSTRAINT "payment_schedule_items_schedule_id_payment_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."payment_schedules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_schedule_items" ADD CONSTRAINT "payment_schedule_items_invoice_id_purchase_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."purchase_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_schedule_items" ADD CONSTRAINT "payment_schedule_items_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_schedules" ADD CONSTRAINT "payment_schedules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_schedules" ADD CONSTRAINT "payment_schedules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_schedules" ADD CONSTRAINT "payment_schedules_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_pi_tenant_status" ON "purchase_invoices" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "idx_pi_tenant_vendor" ON "purchase_invoices" USING btree ("tenant_id","vendor_id");--> statement-breakpoint
CREATE INDEX "idx_pi_tenant_due_date" ON "purchase_invoices" USING btree ("tenant_id","due_date");--> statement-breakpoint
CREATE INDEX "idx_payments_tenant_status" ON "payments" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "idx_payments_tenant_vendor" ON "payments" USING btree ("tenant_id","vendor_id");--> statement-breakpoint
CREATE INDEX "idx_payments_tenant_payment_date" ON "payments" USING btree ("tenant_id","payment_date");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_batches_tenant_batch_id_uniq" ON "payment_batches" USING btree ("tenant_id","batch_id");--> statement-breakpoint
CREATE INDEX "payment_batches_tenant_status_idx" ON "payment_batches" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "payment_instructions_tenant_batch_idx" ON "payment_instructions" USING btree ("tenant_id","batch_id");--> statement-breakpoint
CREATE INDEX "payment_instructions_tenant_status_idx" ON "payment_instructions" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "idx_si_tenant_status" ON "sales_invoices" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "idx_si_tenant_customer" ON "sales_invoices" USING btree ("tenant_id","customer_id");--> statement-breakpoint
CREATE INDEX "idx_si_tenant_due_date" ON "sales_invoices" USING btree ("tenant_id","due_date");--> statement-breakpoint
CREATE INDEX "idx_pr_tenant_customer" ON "payment_receipts" USING btree ("tenant_id","customer_id");--> statement-breakpoint
CREATE INDEX "idx_pr_tenant_receipt_date" ON "payment_receipts" USING btree ("tenant_id","receipt_date");--> statement-breakpoint
CREATE INDEX "idx_bt_tenant_account_date" ON "bank_transactions" USING btree ("tenant_id","bank_account_id","transaction_date");--> statement-breakpoint
CREATE INDEX "idx_bt_tenant_recon_status" ON "bank_transactions" USING btree ("tenant_id","recon_status");--> statement-breakpoint
CREATE INDEX "idx_webhook_event_id_tenant" ON "webhook_events" USING btree ("event_id","tenant_id");--> statement-breakpoint
CREATE INDEX "accounts_tenant_id_type_index" ON "accounts" USING btree ("tenant_id","type");--> statement-breakpoint
CREATE INDEX "journal_entries_tenant_id_date_index" ON "journal_entries" USING btree ("tenant_id","date");--> statement-breakpoint
CREATE INDEX "journal_entries_tenant_id_source_type_source_id_index" ON "journal_entries" USING btree ("tenant_id","source_type","source_id");--> statement-breakpoint
CREATE INDEX "journal_lines_tenant_id_journal_entry_id_index" ON "journal_lines" USING btree ("tenant_id","journal_entry_id");--> statement-breakpoint
CREATE INDEX "journal_lines_tenant_id_account_id_index" ON "journal_lines" USING btree ("tenant_id","account_id");--> statement-breakpoint
CREATE INDEX "idx_hsn_sac_code" ON "hsn_sac_codes" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_hsn_sac_type" ON "hsn_sac_codes" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_da_tenant_entity" ON "document_attachments" USING btree ("tenant_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_rit_tenant_status" ON "recurring_invoice_templates" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "idx_rit_next_run_date" ON "recurring_invoice_templates" USING btree ("next_run_date");--> statement-breakpoint
CREATE INDEX "idx_rit_tenant_customer" ON "recurring_invoice_templates" USING btree ("tenant_id","customer_id");--> statement-breakpoint
CREATE INDEX "idx_cheques_tenant_status" ON "cheques" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "idx_cheques_tenant_date" ON "cheques" USING btree ("tenant_id","cheque_date");--> statement-breakpoint
CREATE INDEX "fiscal_periods_tenant_id_status_index" ON "fiscal_periods" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "approval_instances_tenant_id_entity_type_entity_id_index" ON "approval_instances" USING btree ("tenant_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "approval_instances_tenant_id_status_index" ON "approval_instances" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "approval_rules_tenant_id_workflow_id_index" ON "approval_rules" USING btree ("tenant_id","workflow_id");--> statement-breakpoint
CREATE INDEX "approval_steps_tenant_id_instance_id_index" ON "approval_steps" USING btree ("tenant_id","instance_id");--> statement-breakpoint
CREATE INDEX "transaction_comments_tenant_id_entity_type_entity_id_index" ON "transaction_comments" USING btree ("tenant_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "task_assignments_tenant_id_assigned_to_status_index" ON "task_assignments" USING btree ("tenant_id","assigned_to","status");--> statement-breakpoint
CREATE INDEX "task_assignments_tenant_id_entity_type_entity_id_index" ON "task_assignments" USING btree ("tenant_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "activity_log_tenant_id_entity_type_entity_id_index" ON "activity_log" USING btree ("tenant_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "activity_log_tenant_id_created_at_index" ON "activity_log" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "vendor_contracts_tenant_id_vendor_id_index" ON "vendor_contracts" USING btree ("tenant_id","vendor_id");--> statement-breakpoint
CREATE INDEX "vendor_contracts_tenant_id_status_index" ON "vendor_contracts" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "purchase_requisitions_tenant_id_status_index" ON "purchase_requisitions" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "dashboard_widgets_tenant_id_user_id_index" ON "dashboard_widgets" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "scheduled_reports_tenant_id_is_active_index" ON "scheduled_reports" USING btree ("tenant_id","is_active");--> statement-breakpoint
CREATE INDEX "integration_logs_tenant_id_integration_id_index" ON "integration_logs" USING btree ("tenant_id","integration_id");--> statement-breakpoint
CREATE INDEX "payment_schedule_items_tenant_id_schedule_id_index" ON "payment_schedule_items" USING btree ("tenant_id","schedule_id");--> statement-breakpoint
CREATE INDEX "payment_schedules_tenant_id_status_index" ON "payment_schedules" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "payment_schedules_tenant_id_scheduled_date_index" ON "payment_schedules" USING btree ("tenant_id","scheduled_date");