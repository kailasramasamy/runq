import { z } from 'zod';

export const dunningRuleSchema = z.object({
  name: z.string().min(1).max(100),
  daysAfterDue: z.number().int().positive(),
  channel: z.enum(['email', 'sms', 'whatsapp']).default('email'),
  action: z.enum(['send_reminder', 'stop_supply', 'escalate_to_manager']).default('send_reminder'),
  escalationLevel: z.number().int().min(1).max(10).default(1),
  subjectTemplate: z.string().max(500).nullish(),
  bodyTemplate: z.string().min(1, 'Template body is required'),
  isActive: z.boolean().default(true),
});

export const sendRemindersSchema = z.object({
  invoiceIds: z.array(z.string().uuid()).min(1, 'Select at least one invoice'),
  channel: z.enum(['email', 'sms', 'whatsapp']).default('email'),
  templateId: z.string().uuid().nullish(),
});

export const dunningLogFilterSchema = z.object({
  invoiceId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
});

export type DunningRuleInput = z.infer<typeof dunningRuleSchema>;
export type SendRemindersInput = z.infer<typeof sendRemindersSchema>;
export type DunningLogFilter = z.infer<typeof dunningLogFilterSchema>;
