ALTER TABLE "vendors" ADD COLUMN "early_payment_discount_percent" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "early_payment_discount_days" integer;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "expense_account_code" varchar(20);