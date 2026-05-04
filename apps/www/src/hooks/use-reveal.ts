import { useEffect } from 'react';

/**
 * Observes elements with `.reveal` class and adds `.in` when they
 * intersect the viewport. Re-runs whenever `key` changes (e.g. path)
 * so newly-mounted route content gets observed.
 */
export function useReveal(key?: unknown) {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>('.reveal:not(.in)');
    if (els.length === 0) return;

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [key]);
}
