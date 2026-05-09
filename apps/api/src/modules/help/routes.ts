/**
 * Help / learning hub routes — per-user recipe progress.
 *
 * GET  /progress           → all recipe progress for current user + derived stats
 * PUT  /progress/:recipeId → upsert {currentStep, completed}
 */
import { FastifyPluginAsync } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { rbacHook } from '../../hooks/rbac';
import { helpRecipeProgress } from '@runq/db';

const ALL_ROLES = ['owner', 'accountant', 'viewer'] as const;

const upsertSchema = z.object({
  currentStep: z.number().int().min(0).max(100).optional(),
  completed: z.boolean().optional(),
});

function computeStreak(completedDates: Date[]): number {
  if (completedDates.length === 0) return 0;
  const days = new Set(
    completedDates.map((d) => {
      const dt = new Date(d);
      return `${dt.getUTCFullYear()}-${dt.getUTCMonth()}-${dt.getUTCDate()}`;
    }),
  );
  let streak = 0;
  const cursor = new Date();
  for (;;) {
    const key = `${cursor.getUTCFullYear()}-${cursor.getUTCMonth()}-${cursor.getUTCDate()}`;
    if (days.has(key)) {
      streak += 1;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    } else if (streak === 0) {
      // Allow today to be empty — start counting from yesterday
      cursor.setUTCDate(cursor.getUTCDate() - 1);
      const yKey = `${cursor.getUTCFullYear()}-${cursor.getUTCMonth()}-${cursor.getUTCDate()}`;
      if (!days.has(yKey)) return 0;
    } else {
      break;
    }
  }
  return streak;
}

export const helpRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/progress',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const rows = await app.db
        .select({
          recipeId: helpRecipeProgress.recipeId,
          currentStep: helpRecipeProgress.currentStep,
          completedAt: helpRecipeProgress.completedAt,
          updatedAt: helpRecipeProgress.updatedAt,
        })
        .from(helpRecipeProgress)
        .where(and(
          eq(helpRecipeProgress.tenantId, request.tenantId),
          eq(helpRecipeProgress.userId, request.user.userId),
        ));

      const completed = rows.filter((r) => r.completedAt !== null);
      const streak = computeStreak(completed.map((r) => r.completedAt as Date));
      const lastInProgress = rows
        .filter((r) => r.completedAt === null && r.currentStep > 0)
        .sort((a, b) => +b.updatedAt - +a.updatedAt)[0] ?? null;

      return {
        data: {
          progress: rows,
          streak,
          completedCount: completed.length,
          inProgress: lastInProgress
            ? { recipeId: lastInProgress.recipeId, stepIndex: lastInProgress.currentStep }
            : null,
        },
      };
    },
  );

  app.put<{ Params: { recipeId: string } }>(
    '/progress/:recipeId',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const recipeId = request.params.recipeId;
      const body = upsertSchema.parse(request.body);
      const now = new Date();

      const completedAt = body.completed === true ? now : body.completed === false ? null : undefined;

      await app.db
        .insert(helpRecipeProgress)
        .values({
          tenantId: request.tenantId,
          userId: request.user.userId,
          recipeId,
          currentStep: body.currentStep ?? 0,
          completedAt: completedAt ?? null,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            helpRecipeProgress.tenantId,
            helpRecipeProgress.userId,
            helpRecipeProgress.recipeId,
          ],
          set: {
            ...(body.currentStep !== undefined ? { currentStep: body.currentStep } : {}),
            ...(completedAt !== undefined ? { completedAt } : {}),
            updatedAt: now,
          },
        });

      return { data: { ok: true } };
    },
  );
};
