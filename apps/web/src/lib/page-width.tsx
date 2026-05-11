import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type PageWidth = 'capped' | 'full';

interface Ctx {
  width: PageWidth;
  setWidth: (w: PageWidth) => void;
}

const PageWidthCtx = createContext<Ctx | null>(null);

/**
 * Provider used by the dashboard shell. Holds the active page's width
 * preference so the shell can swap its max-width class on the fly.
 */
export function PageWidthProvider({ children }: { children: ReactNode }) {
  const [width, setWidth] = useState<PageWidth>('capped');
  return <PageWidthCtx.Provider value={{ width, setWidth }}>{children}</PageWidthCtx.Provider>;
}

/**
 * Read-only hook for the shell. Returns 'capped' (1280px max) or 'full'
 * (no width cap). Defaults to 'capped' when used outside the provider so
 * standalone routes (login, portal) don't crash.
 */
export function usePageWidth(): PageWidth {
  return useContext(PageWidthCtx)?.width ?? 'capped';
}

/**
 * Declare the current page's width preference. Mounted by `PageHeader`
 * with `fullWidth` so each page owns the decision next to its title —
 * no central pathname registry required. Resets to 'capped' on unmount
 * so navigating to a different (capped) page snaps back automatically
 * even if the new page lacks a PageHeader.
 */
export function useDeclarePageWidth(width: PageWidth) {
  const ctx = useContext(PageWidthCtx);
  useEffect(() => {
    if (!ctx) return;
    ctx.setWidth(width);
    return () => ctx.setWidth('capped');
  }, [ctx, width]);
}
