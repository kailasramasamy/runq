import { createContext, useContext, useState, useEffect, createElement, type ReactNode } from 'react';

interface RouterContextValue {
  path: string;
  navigate: (to: string) => void;
}

const RouterContext = createContext<RouterContextValue>({
  path: '/',
  navigate: () => {},
});

export function useRouter() {
  return useContext(RouterContext);
}

export function Router({ children }: { children: ReactNode }) {
  const [path, setPath] = useState(window.location.pathname);

  function navigate(to: string) {
    window.history.pushState({}, '', to);
    setPath(to);
    window.scrollTo(0, 0);
  }

  useEffect(() => {
    function onPop() { setPath(window.location.pathname); }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  return createElement(RouterContext.Provider, { value: { path, navigate } }, children);
}

interface NavLinkProps {
  to: string;
  children: ReactNode;
  className?: string | ((isActive: boolean) => string);
  onClick?: () => void;
}

export function NavLink({ to, children, className, onClick }: NavLinkProps) {
  const { navigate, path } = useRouter();
  const isActive = to === '/' ? path === '/' : path.startsWith(to);
  const resolvedClass = typeof className === 'function' ? className(isActive) : className;

  return createElement('a', {
    href: to,
    onClick: (e: { preventDefault: () => void }) => { e.preventDefault(); navigate(to); onClick?.(); },
    className: resolvedClass,
    'data-active': isActive || undefined,
  }, children);
}
