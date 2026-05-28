import { useRouterState } from '@tanstack/react-router';

/**
 * Vendors are shared between Finance/AP and Purchase. To keep the user inside
 * the active module after they tap "Vendors", every vendor page navigates
 * within the prefix it was mounted under.
 */
export function useVendorBase(): '/purchase/vendors' | '/finance/ap/vendors' {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return pathname.startsWith('/purchase') ? '/purchase/vendors' : '/finance/ap/vendors';
}
