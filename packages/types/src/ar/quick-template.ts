export interface QuickTemplateItem {
  itemId: string;
  description: string;
  hsnSacCode: string | null;
  unitPrice: number;
  taxRate: number | null;
  taxCategory: string | null;
  defaultQuantity: number;
}

export interface QuickInvoiceTemplate {
  id: string;
  tenantId: string;
  customerId: string;
  customerName?: string;
  name: string;
  paymentTermsDays: number;
  notes: string | null;
  items: QuickTemplateItem[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
