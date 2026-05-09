import { RecipeStepperPage } from '@/components/help/recipe-stepper';

export function HelpRecipePage({ recipeId }: { recipeId: string }) {
  return <RecipeStepperPage recipeId={recipeId} />;
}
