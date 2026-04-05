export type SalesOrderStatus = 'draft' | 'confirmed' | 'partially_invoiced' | 'fully_invoiced' | 'cancelled';

export interface SalesOrder {
  id: string;
  tenantId: string;
  customerId: string;
  orderNumber: string;
  orderDate: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  status: SalesOrderStatus;
  notes: string | null;
  quoteId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SalesOrderItem {
  id: string;
  tenantId: string;
  orderId: string;
  itemId: string | null;
  description: string;
  hsnSacCode: string | null;
  quantity: number;
  unitPrice: number;
  amount: number;
  taxRate: number | null;
  taxAmount: number;
  quantityInvoiced: number;
}

export interface SalesOrderWithDetails extends SalesOrder {
  items: SalesOrderItem[];
  customerName: string;
}
