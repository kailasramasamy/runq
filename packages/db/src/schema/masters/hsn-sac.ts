import { pgTable, uuid, varchar, decimal, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';

export const hsnSacTypeEnum = pgEnum('hsn_sac_type', ['hsn', 'sac']);

export const hsnSacCodes = pgTable(
  'hsn_sac_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: varchar('code', { length: 8 }).notNull().unique(),
    type: hsnSacTypeEnum('type').notNull(),
    description: varchar('description', { length: 500 }).notNull(),
    gstRate: decimal('gst_rate', { precision: 5, scale: 2 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_hsn_sac_code').on(table.code),
    index('idx_hsn_sac_type').on(table.type),
  ],
);
