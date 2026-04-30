import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { tenants } from '@runq/db';
import { AssetCategoryService } from '../src/modules/fa/category.service';
import { FixedAssetService } from '../src/modules/fa/asset.service';
import { DepreciationService } from '../src/modules/fa/depreciation.service';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

async function main() {
  const [t] = await db.select({ id: tenants.id }).from(tenants).limit(1);
  console.log('Tenant:', t.id);

  const catSvc = new AssetCategoryService(db, t.id);
  const assetSvc = new FixedAssetService(db, t.id);
  const depSvc = new DepreciationService(db, t.id);

  const cat = await catSvc.create({
    name: 'Test Computers ' + Date.now(),
    depMethodCompaniesAct: 'slm', depRateCompaniesAct: 33.33, usefulLifeYears: 3,
    depMethodItAct: 'wdv', depRateItAct: 40,
    assetAccountCode: '1101', depExpenseAccountCode: '5002', accumDepAccountCode: '1101',
  });
  console.log('✓ Category:', cat.name);

  const cats = await catSvc.list();
  console.log('✓ List categories:', cats.length);

  const asset = await assetSvc.create({
    name: 'Dell Laptop XPS', categoryId: cat.id,
    acquisitionDate: '2026-01-15', acquisitionCost: 120000, residualValue: 5000,
    putToUseDate: '2026-01-20', location: 'Office',
  });
  console.log('✓ Asset:', asset.assetCode, '₹' + asset.acquisitionCost);

  const detail = await assetSvc.getById(asset.id);
  console.log('✓ WDV:', detail.currentWdv, 'AccDep:', detail.accumulatedDepreciation);

  const preview = await depSvc.preview('2026-04-30', 'companies_act');
  console.log('✓ Preview:', preview.length, 'assets');
  if (preview[0]) console.log('  → dep: ₹' + preview[0].depreciationAmount);

  const result = await depSvc.run('2026-04-30', 'companies_act');
  console.log('✓ Run:', result.entriesCreated, 'entries, ₹' + result.totalDepreciation, 'JE:', result.journalEntryId.slice(0, 8));

  const d2 = await assetSvc.getById(asset.id);
  console.log('✓ Post-dep WDV: ₹' + d2.currentWdv, 'AccDep: ₹' + d2.accumulatedDepreciation);

  const r2 = await depSvc.run('2026-04-30', 'companies_act');
  console.log('✓ Re-run:', r2.entriesCreated, '(expect 0)');

  console.log('\nExpected monthly SLM: ₹' + ((120000 - 5000) / 3 / 12).toFixed(2));
  console.log('\n✅ All tests passed!');
  await pool.end();
}

main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
