export interface VendorContract {
  id: string;
  vendorId: string;
  vendorName?: string;
  contractNumber: string;
  title: string;
  startDate: string;
  endDate: string;
  value: number | null;
  terms: string | null;
  status: 'draft' | 'active' | 'expired' | 'cancelled';
  renewalDate: string | null;
  createdAt: string;
}

export interface VendorRating {
  id: string;
  vendorId: string;
  vendorName?: string;
  period: string;
  deliveryScore: number;
  qualityScore: number;
  pricingScore: number;
  overallScore: number;
  notes: string | null;
  ratedBy: string;
  createdAt: string;
}

export interface PurchaseRequisition {
  id: string;
  tenantId: string;
  requisitionNumber: string;
  requestedBy: string;
  requestedByName?: string;
  vendorId: string | null;
  vendorName?: string;
  description: string;
  totalAmount: number;
  status:
    | 'draft'
    | 'pending_approval'
    | 'approved'
    | 'rejected'
    | 'converted';
  approvedBy: string | null;
  approvedAt: string | null;
  poId: string | null;
  items: PurchaseRequisitionItem[];
  createdAt: string;
}

export interface PurchaseRequisitionItem {
  id: string;
  itemName: string;
  quantity: number;
  estimatedUnitPrice: number;
  estimatedAmount: number;
  notes: string | null;
}

export interface PaymentSchedule {
  id: string;
  name: string;
  scheduledDate: string;
  status: 'draft' | 'approved' | 'processing' | 'completed' | 'cancelled';
  totalAmount: number;
  items: PaymentScheduleItem[];
  createdBy: string;
  approvedBy: string | null;
  createdAt: string;
}

export interface PaymentScheduleItem {
  id: string;
  invoiceId: string;
  invoiceNumber?: string;
  vendorId: string;
  vendorName?: string;
  amount: number;
}
