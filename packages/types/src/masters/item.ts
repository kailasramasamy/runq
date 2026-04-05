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
  category: string | null;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
