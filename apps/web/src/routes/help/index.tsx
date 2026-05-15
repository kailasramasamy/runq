import { HelpHome } from '@/components/help/help-home';
import type { ModuleKey } from '@/lib/help-recipes';

export function HelpIndexPage({ module }: { module: ModuleKey }) {
  return <HelpHome module={module} />;
}
