import { useEffect, useRef, useState } from 'react';

export interface SectionNavItem {
  id: string;
  label: string;
}

/**
 * Sticky pill nav for jumping between page sections. Binds to the closest
 * scrollable ancestor (the dashboard shell uses <main> with overflow-auto;
 * not window) for both scrollspy and click-to-scroll.
 */
export function SectionNav({ sections }: { sections: SectionNavItem[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string>(sections[0]?.id ?? '');

  useEffect(() => {
    const scroller = findScroller(wrapRef.current);
    if (!scroller) return;

    const els = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target.id) setActive(visible[0].target.id);
      },
      { root: scroller, rootMargin: '-80px 0px -60% 0px', threshold: 0 },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections]);

  function scrollTo(id: string) {
    const el = document.getElementById(id);
    const scroller = findScroller(wrapRef.current);
    if (!el || !scroller) return;
    const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 56;
    scroller.scrollTo({ top, behavior: 'smooth' });
  }

  return (
    <div
      ref={wrapRef}
      className="sticky z-20 -mx-4 -mt-4 px-4 md:-mx-6 md:-mt-6 md:px-6"
      style={{
        top: 0,
        height: 44,
        background: 'var(--bg)',
        borderBottom: '1px solid var(--border-soft)',
      }}
    >
      <div className="flex h-full items-center gap-1 overflow-x-auto">
        {sections.map((s) => {
          const isActive = s.id === active;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => scrollTo(s.id)}
              className="whitespace-nowrap transition-colors"
              style={{
                fontSize: 12,
                fontWeight: 500,
                padding: '4px 12px',
                borderRadius: 6,
                background: isActive ? 'var(--accent-soft)' : 'transparent',
                color: isActive ? 'var(--accent-text)' : 'var(--text-2)',
              }}
            >
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Walk up to the nearest scrollable ancestor (dashboard shell uses <main>). */
function findScroller(start: HTMLElement | null): HTMLElement | null {
  let el: HTMLElement | null = start;
  while (el) {
    const overflow = getComputedStyle(el).overflowY;
    if ((overflow === 'auto' || overflow === 'scroll') && el.scrollHeight > el.clientHeight) return el;
    el = el.parentElement;
  }
  return null;
}
