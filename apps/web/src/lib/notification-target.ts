// Notification `targetUrl` values are a shared vocabulary across web and
// mobile, but a few are mobile-style paths with no matching web route.
// This maps those to the closest web destination; every other path passes
// through unchanged. Mirrors `resolveNotificationTarget` in
// apps/mobile/lib/router.dart so a deep link resolves on either platform.
const WEB_ALIASES: Record<string, string> = {
  '/hr/pay': '/hr',                 // no employee self-pay route on web — HR home shows payslips
  '/hr/directory': '/hr/employees', // mobile's directory screen → web employees list
};

export function resolveNotificationTarget(path: string): string {
  const [bare, query] = path.split('?');
  const resolved = WEB_ALIASES[bare] ?? bare;
  return query ? `${resolved}?${query}` : resolved;
}
