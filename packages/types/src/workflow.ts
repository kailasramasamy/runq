export interface ApprovalWorkflow {
  id: string;
  tenantId: string;
  name: string;
  entityType: string;
  isActive: boolean;
  rules: ApprovalRule[];
}

export interface ApprovalRule {
  id: string;
  stepOrder: number;
  approverRole: string;
  minAmount: number | null;
  maxAmount: number | null;
}

export interface ApprovalInstance {
  id: string;
  tenantId: string;
  workflowId: string;
  entityType: string;
  entityId: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedBy: string;
  requestedAt: string;
  completedAt: string | null;
  steps: ApprovalStep[];
}

export interface ApprovalStep {
  id: string;
  stepOrder: number;
  status: 'pending' | 'approved' | 'rejected' | 'skipped';
  assignedRole: string;
  assignedTo: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  comment: string | null;
}

export interface TransactionComment {
  id: string;
  entityType: string;
  entityId: string;
  userId: string;
  userName?: string;
  content: string;
  createdAt: string;
}

export interface TaskAssignment {
  id: string;
  entityType: string;
  entityId: string;
  title: string;
  description: string | null;
  assignedTo: string;
  assignedToName?: string;
  assignedBy: string;
  assignedByName?: string;
  dueDate: string | null;
  status: 'open' | 'in_progress' | 'completed' | 'cancelled';
  completedAt: string | null;
  createdAt: string;
}

export interface ActivityLogEntry {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  description: string;
  userId: string | null;
  userName?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}
