export type PriceListType = 'selling' | 'buying';
export type PriceListApplyTo = 'all' | 'customer_group' | 'vendor_group' | 'customer' | 'vendor';

export interface PriceListItem {
  id: string;
  priceListId: string;
  itemId: string;
  itemName?: string;
  itemSku?: string | null;
  rate: number;
  marginPercent: number | null;
  discountPercent: number | null;
  minQuantity: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PriceList {
  id: string;
  tenantId: string;
  name: string;
  type: PriceListType;
  currency: string;
  applyTo: PriceListApplyTo;
  applyToValue: string | null;
  customerId: string | null;
  customerName?: string | null;
  vendorId: string | null;
  vendorName?: string | null;
  validFrom: string | null;
  validTo: string | null;
  isActive: boolean;
  items: PriceListItem[];
  itemCount?: number;
  createdAt: string;
  updatedAt: string;
}
