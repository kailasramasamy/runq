import { Link } from '@tanstack/react-router';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { HelpLayout } from '@/components/help/help-layout';
import { MarkdownRenderer } from '@/components/help/markdown-renderer';
import { getTopic } from '@/lib/help-content';
import { EmptyState, Button } from '@/components/ui';

interface Props {
  slug: string;
}

export function HelpTopicPage({ slug }: Props) {
  const topic = getTopic(slug);

  return (
    <HelpLayout>
      <div className="mb-4">
        <Link
          to="/help"
          className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          <ArrowLeft size={12} /> All topics
        </Link>
      </div>
      {topic ? (
        <MarkdownRenderer content={topic.content} />
      ) : (
        <EmptyState
          icon={BookOpen}
          title="Topic not found"
          description={`No help topic exists for "${slug}".`}
          action={
            <Link to="/help">
              <Button size="sm">Back to user guide</Button>
            </Link>
          }
        />
      )}
    </HelpLayout>
  );
}
