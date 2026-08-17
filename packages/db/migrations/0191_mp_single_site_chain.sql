-- Single-site chain: VMCC, CC and plant operated from one location.
--
-- Some plants run collection, chilling and processing on the same premises with
-- one operator covering all three tiers. The milk never travels, but the ledger
-- still has to record the six steps that a distributed network performs — close
-- the VMCC slot, dispatch, receive at the CC, close, dispatch, receive at the
-- plant — because the payout, the variance report and raw-milk stock all read
-- those rows.
--
-- The flag lives on the PROCESSING PLANT, not the tenant: a dairy can run one
-- integrated plant and separate collection routes side by side, and only the
-- integrated one may fast-track. Every VMCC that chains up to a flagged plant
-- becomes eligible, provided the operator is assigned to all three nodes.
ALTER TABLE mp_nodes
  ADD COLUMN IF NOT EXISTS single_site_chain boolean NOT NULL DEFAULT false;
