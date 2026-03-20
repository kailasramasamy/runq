export type POStatus = 'draft' | 'confirmed' | 'partially_received' | 'fully_received' | 'cancelled';

export interface PurchaseOrder {
  id: string;
  tenantId: string;
  poNumber: string;
  vendorId: string;
  orderDate: string;
  expectedDeliveryDate: string | null;
  status: POStatus;
  totalAmount: number;
  notes: string | null;
  wmsPoId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrderItem {
  id: string;
  tenantId: string;
  poId: string;
  itemName: string;
  sku: string | null;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface PurchaseOrderWithItems extends PurchaseOrder {
  items: PurchaseOrderItem[];
  vendorName: string;
}
