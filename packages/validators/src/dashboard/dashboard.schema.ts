import { z } from 'zod';

export const updateWidgetSchema = z.object({
  widgetType: z.string().min(1).max(50),
  position: z.number().int().min(0),
  config: z.record(z.unknown()).optional(),
  isVisible: z.boolean().optional(),
});

export const saveWidgetLayoutSchema = z.object({
  widgets: z.array(
    z.object({
      widgetType: z.string().min(1).max(50),
      position: z.number().int().min(0),
      config: z.record(z.unknown()).default({}),
      isVisible: z.boolean().default(true),
    }),
  ),
});

export const createScheduledReportSchema = z.object({
  name: z.string().min(1).max(100),
  reportType: z.string().min(1).max(50),
  frequency: z.enum(['daily', 'weekly', 'monthly']),
  recipients: z.array(z.string().email()).min(1),
  config: z.record(z.unknown()).default({}),
});

export type UpdateWidgetInput = z.infer<typeof updateWidgetSchema>;
export type SaveWidgetLayoutInput = z.infer<typeof saveWidgetLayoutSchema>;
export type CreateScheduledReportInput = z.infer<
  typeof createScheduledReportSchema
>;
