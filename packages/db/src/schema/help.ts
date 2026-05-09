import { pgTable, uuid, varchar, integer, timestamp, primaryKey, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenant';
import { users } from './user';

export const helpRecipeProgress = pgTable('help_recipe_progress', {
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  recipeId: varchar('recipe_id', { length: 80 }).notNull(),
  currentStep: integer('current_step').notNull().default(0),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.tenantId, t.userId, t.recipeId] }),
  index('help_recipe_progress_user_idx').on(t.tenantId, t.userId, t.completedAt),
]);
