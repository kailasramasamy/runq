import { z } from 'zod';

/**
 * Dhenu milk-procurement — quality band validators.
 *
 * Bands define the good / watch / low thresholds per milk type and metric that
 * colour-code FAT/SNF/CLR across the app and derive the per-pour grade. A node
 * scope (`nodeId` set) overrides the tenant-wide default (`nodeId` null).
 */

const milkType = z.enum(['cow', 'buffalo', 'mixed', 'cow_a1', 'cow_a2']);
const metric = z.enum(['fat', 'snf', 'clr']);

const bandRow = z
  .object({
    milkType,
    metric,
    goodMin: z.number().min(0).max(40),
    watchMin: z.number().min(0).max(40),
  })
  .refine((d) => d.goodMin >= d.watchMin, {
    message: 'goodMin must be ≥ watchMin',
    path: ['goodMin'],
  });

export const qualityBandFilterSchema = z.object({
  nodeId: z.string().uuid().optional(),
});

// Replace the whole set of bands for one scope (tenant default or a node).
export const upsertQualityBandsSchema = z.object({
  nodeId: z.string().uuid().nullish(),
  bands: z.array(bandRow),
});

export type QualityBandFilter = z.infer<typeof qualityBandFilterSchema>;
export type UpsertQualityBandsInput = z.infer<typeof upsertQualityBandsSchema>;
