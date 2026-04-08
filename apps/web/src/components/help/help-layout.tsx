import { useEffect } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import { BookOpen } from 'lucide-react';
import { GROUP_LABELS, GROUP_ORDER, getTopicsByGroup } from '@/lib/help-content';
import { cn } from '@/lib/utils';

interface Props {
  children: React.ReactNode;
}

/**
 * Two-column layout for the /help section: a sticky topic list on the left,
 * the rendered markdown on the right. Mobile collapses the sidebar above the
 * content.
 */
export function HelpLayout({ children }: Props) {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  // Strip /finance base prefix if present (vite base = /finance/)
  const normalised = currentPath.replace(/^\/finance/, '');
  const activeSlug = normalised === '/help' ? 'README' : normalised.replace(/^\/help\//, '');

  // Reset scroll position whenever the user navigates to a different topic.
  // The dashboard layout puts overflow-auto on <main>, so scrolling the window
  // is a no-op — we have to scroll the actual scrollable element.
  useEffect(() => {
    const main = document.querySelector('main');
    if (main) main.scrollTop = 0;
    window.scrollTo(0, 0);
  }, [currentPath]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
      <aside className="lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
        <div className="mb-4 flex items-center gap-2">
          <BookOpen size={18} className="text-indigo-500" />
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">User Guide</h2>
        </div>

        <nav className="space-y-5 text-sm">
          {GROUP_ORDER.map((group) => {
            const topics = getTopicsByGroup(group);
            if (topics.length === 0) return null;
            return (
              <div key={group}>
                <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                  {GROUP_LABELS[group]}
                </p>
                <ul className="space-y-0.5">
                  {topics.map((topic) => {
                    const isActive = activeSlug === topic.slug;
                    const href = topic.slug === 'README' ? '/help' : `/help/${topic.slug}`;
                    return (
                      <li key={topic.slug}>
                        <Link
                          to={href as '/help'}
                          className={cn(
                            'block rounded-md px-2 py-1.5 text-zinc-600 transition-colors dark:text-zinc-400',
                            isActive
                              ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                              : 'hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-100',
                          )}
                        >
                          {topic.title.replace(/^Recipe \d+ —\s*/, '')}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>
      </aside>

      <main className="min-w-0">{children}</main>
    </div>
  );
}
