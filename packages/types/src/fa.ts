export type DepreciationMethod = 'slm' | 'wdv';
export type DepreciationType = 'companies_act' | 'it_act';
export type AssetStatus = 'active' | 'disposed' | 'written_off' | 'cwip';

export interface AssetCategory {
  id: string;
  tenantId: string;
  name: string;
  parentId: string | null;
  depMethodCompaniesAct: DepreciationMethod;
  depRateCompaniesAct: number;
  usefulLifeYears: number | null;
  depMethodItAct: DepreciationMethod;
  depRateItAct: number;
  assetAccountCode: string;
  depExpenseAccountCode: string;
  accumDepAccountCode: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FixedAsset {
  id: string;
  tenantId: string;
  assetCode: string;
  name: string;
  description: string | null;
  categoryId: string;
  categoryName?: string;
  acquisitionDate: string;
  acquisitionCost: number;
  residualValue: number;
  putToUseDate: string | null;
  location: string | null;
  serialNumber: string | null;
  status: AssetStatus;
  purchaseInvoiceId: string | null;
  vendorId: string | null;
  vendorName?: string | null;
  gstCreditClaimed: boolean;
  gstAmount: number;
  disposalDate: string | null;
  disposalAmount: number | null;
  disposalNotes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FixedAssetWithDepreciation extends FixedAsset {
  depreciationEntries: DepreciationEntry[];
  accumulatedDepreciation: number;
  currentWdv: number;
}

export interface DepreciationEntry {
  id: string;
  tenantId: string;
  assetId: string;
  periodStart: string;
  periodEnd: string;
  depreciationType: DepreciationType;
  method: DepreciationMethod;
  rate: number;
  openingWdv: number;
  depreciationAmount: number;
  closingWdv: number;
  journalEntryId: string | null;
  isPosted: boolean;
  createdAt: string;
}

export interface DepreciationPreviewLine {
  assetId: string;
  assetCode: string;
  assetName: string;
  categoryName: string;
  openingWdv: number;
  rate: number;
  method: DepreciationMethod;
  depreciationAmount: number;
  closingWdv: number;
}

export interface DepreciationRunResult {
  periodStart: string;
  periodEnd: string;
  depreciationType: DepreciationType;
  entriesCreated: number;
  totalDepreciation: number;
  journalEntryId: string;
}
