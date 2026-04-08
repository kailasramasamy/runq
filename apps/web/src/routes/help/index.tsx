import { HelpLayout } from '@/components/help/help-layout';
import { MarkdownRenderer } from '@/components/help/markdown-renderer';
import { getTopic } from '@/lib/help-content';
import { EmptyState } from '@/components/ui';
import { BookOpen } from 'lucide-react';

export function HelpIndexPage() {
  const topic = getTopic('README');
  if (!topic) {
    return (
      <HelpLayout>
        <EmptyState
          icon={BookOpen}
          title="User guide not found"
          description="The user-guide markdown files could not be loaded. Contact your runQ admin."
        />
      </HelpLayout>
    );
  }
  return (
    <HelpLayout>
      <MarkdownRenderer content={topic.content} />
    </HelpLayout>
  );
}
