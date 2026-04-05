import { z } from 'zod';

export const createApprovalWorkflowSchema = z.object({
  name: z.string().min(1).max(100),
  entityType: z.string().min(1).max(50),
  rules: z
    .array(
      z.object({
        stepOrder: z.number().int().min(1),
        approverRole: z.string().min(1).max(50),
        minAmount: z.number().min(0).nullable().optional(),
        maxAmount: z.number().min(0).nullable().optional(),
      }),
    )
    .min(1),
});

export const approvalDecisionSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  comment: z.string().max(1000).optional(),
});

export const createCommentSchema = z.object({
  entityType: z.string().min(1).max(50),
  entityId: z.string().uuid(),
  content: z.string().min(1).max(5000),
});

export const createTaskSchema = z.object({
  entityType: z.string().min(1).max(50),
  entityId: z.string().uuid(),
  title: z.string().min(1).max(255),
  description: z.string().max(5000).optional(),
  assignedTo: z.string().uuid(),
  dueDate: z.string().date().optional(),
});

export const updateTaskStatusSchema = z.object({
  status: z.enum(['open', 'in_progress', 'completed', 'cancelled']),
});

export const entityFilterSchema = z.object({
  entityType: z.string().max(50).optional(),
  entityId: z.string().uuid().optional(),
});

export type CreateApprovalWorkflowInput = z.infer<
  typeof createApprovalWorkflowSchema
>;
export type ApprovalDecisionInput = z.infer<typeof approvalDecisionSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskStatusInput = z.infer<typeof updateTaskStatusSchema>;
export type EntityFilterInput = z.infer<typeof entityFilterSchema>;
