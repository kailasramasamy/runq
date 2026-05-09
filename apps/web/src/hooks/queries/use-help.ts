import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';

export interface RecipeProgressRow {
  recipeId: string;
  currentStep: number;
  completedAt: string | null;
  updatedAt: string;
}

export interface HelpProgress {
  progress: RecipeProgressRow[];
  streak: number;
  completedCount: number;
  inProgress: { recipeId: string; stepIndex: number } | null;
}

export function useHelpProgress() {
  return useQuery({
    queryKey: ['help', 'progress'],
    queryFn: () => api.get<{ data: HelpProgress }>('/help/progress'),
    staleTime: 30_000,
  });
}

export function useUpsertRecipeProgress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { recipeId: string; currentStep?: number; completed?: boolean }) =>
      api.put(`/help/progress/${input.recipeId}`, {
        currentStep: input.currentStep,
        completed: input.completed,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['help', 'progress'] });
    },
  });
}
