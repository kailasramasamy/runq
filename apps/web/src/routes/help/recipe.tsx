import { RecipeStepperPage } from '@/components/help/recipe-stepper';
import type { ModuleKey } from '@/lib/help-recipes';

export function HelpRecipePage({ recipeId, module }: { recipeId: string; module: ModuleKey }) {
  return <RecipeStepperPage recipeId={recipeId} module={module} />;
}
