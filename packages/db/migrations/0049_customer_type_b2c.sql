-- Add 'b2c' to customer_type enum.
--
-- Context: April 2026 GSTR-1 filing surfaced that an aggregated end-consumer
-- customer ("Vrindavan Platform Customers") had to be classified as
-- payment_gateway because the schema only had b2b + payment_gateway. b2c is
-- the semantically correct bucket — it lets the readiness check distinguish
-- real payment-gateway aggregators (Razorpay, etc.) from B2C platforms.
ALTER TYPE customer_type ADD VALUE IF NOT EXISTS 'b2c';
