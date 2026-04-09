export interface CogmComponent {
  label: string;
  amount: number;
  note?: string;
}

export interface Item {
  id: string;
  tenantId: string;
  name: string;
  sku: string | null;
  type: 'product' | 'service';
  hsnSacCode: string | null;
  unit: string | null;
  defaultSellingPrice: number | null;
  defaultPurchasePrice: number | null;
  gstRate: number | null;
  mrp: number | null;
  costPrice: number | null;
  category: string | null;
  subcategory: string | null;
  description: string | null;
  // Extended supplier-catalogue attributes
  ean: string | null;
  margin: number | null;
  brand: string | null;
  grammage: string | null;
  packingType: string | null;
  basicPrice: number | null;
  gstValue: number | null;
  shelfLifeDays: number | null;
  rtvAllowed: boolean | null;
  vendorPackSize: string | null;
  packagingDimension: string | null;
  temperature: string | null;
  cutoffTime: string | null;
  productType: string | null;
  cogmBreakdown: CogmComponent[] | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
