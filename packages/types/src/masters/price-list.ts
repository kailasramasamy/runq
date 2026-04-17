export type PriceListType = 'selling' | 'buying';
export type PriceListApplyTo = 'all' | 'customer_group' | 'vendor_group' | 'customer' | 'vendor';

export interface PriceListItem {
  id: string;
  priceListId: string;
  itemId: string;
  itemName?: string;
  itemSku?: string | null;
  // Any combination of rate / marginPercent / mrp may be set; at least one is
  // guaranteed by the price_list_items_at_least_one_value CHECK constraint.
  rate: number | null;
  marginPercent: number | null;
  mrp: number | null;
  discountPercent: number | null;
  minQuantity: number | null;
  createdAt: string;
  updatedAt: string;
  // Joined from items master (detail view only)
  itemMrp?: number | null;
  itemCostPrice?: number | null;
  itemMargin?: number | null;
  itemGstRate?: number | null;
  itemBasicPrice?: number | null;
  itemUnit?: string | null;
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
