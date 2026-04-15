-- Seed depreciation expense and per-category accumulated depreciation accounts
-- for all tenants that have the Fixed Assets parent account (1200)

-- Depreciation Expense account
INSERT INTO accounts (tenant_id, code, name, type, is_system_account)
SELECT tenant_id, '5010', 'Depreciation Expense', 'expense', true
FROM accounts WHERE code = '1200'
ON CONFLICT (tenant_id, code) DO NOTHING;

-- Per-category accumulated depreciation accounts (contra-asset)
INSERT INTO accounts (tenant_id, code, name, type, is_system_account)
SELECT tenant_id, '1210', 'Accum Dep - Plant & Machinery', 'asset', true
FROM accounts WHERE code = '1201'
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO accounts (tenant_id, code, name, type, is_system_account)
SELECT tenant_id, '1211', 'Accum Dep - Furniture & Fixtures', 'asset', true
FROM accounts WHERE code = '1202'
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO accounts (tenant_id, code, name, type, is_system_account)
SELECT tenant_id, '1212', 'Accum Dep - Office Equipment', 'asset', true
FROM accounts WHERE code = '1203'
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO accounts (tenant_id, code, name, type, is_system_account)
SELECT tenant_id, '1213', 'Accum Dep - Computer & IT', 'asset', true
FROM accounts WHERE code = '1204'
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO accounts (tenant_id, code, name, type, is_system_account)
SELECT tenant_id, '1214', 'Accum Dep - Vehicles', 'asset', true
FROM accounts WHERE code = '1205'
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO accounts (tenant_id, code, name, type, is_system_account)
SELECT tenant_id, '1215', 'Accum Dep - Leasehold Improvements', 'asset', true
FROM accounts WHERE code = '1206'
ON CONFLICT (tenant_id, code) DO NOTHING;

-- Profit/Loss on Disposal of Assets (for Phase 2)
INSERT INTO accounts (tenant_id, code, name, type, is_system_account)
SELECT tenant_id, '4010', 'Profit on Sale of Assets', 'revenue', true
FROM accounts WHERE code = '1200'
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO accounts (tenant_id, code, name, type, is_system_account)
SELECT tenant_id, '5011', 'Loss on Sale of Assets', 'expense', true
FROM accounts WHERE code = '1200'
ON CONFLICT (tenant_id, code) DO NOTHING;
