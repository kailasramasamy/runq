-- Allow `'alias'` as a valid customer match source on po_drafts so we can
-- distinguish "matched via past correction" from "matched via raw GSTIN
-- lookup". Helps the review UI show different confidence treatments.
ALTER TYPE po_customer_match_source ADD VALUE IF NOT EXISTS 'alias';
