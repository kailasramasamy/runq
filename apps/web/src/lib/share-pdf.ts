const BASE_URL = '/api/v1';

interface SharePdfOptions {
  path: string;          // e.g. /milk-procurement/farmers/:id/pour-statement
  params: Record<string, string | undefined>;
  filename: string;      // e.g. pour-statement-F001-2026-06-01.pdf
  title: string;         // shown in Web Share sheet
}

/** Fetch an authenticated PDF blob and share (if supported) or download it. */
export async function sharePdf({ path, params, filename, title }: SharePdfOptions): Promise<void> {
  const token = localStorage.getItem('runq-token');
  const tenantId = localStorage.getItem('runq-active-tenant-id');

  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (tenantId) headers['X-Tenant-Id'] = tenantId;

  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') sp.set(k, v);
  }
  const query = sp.toString() ? `?${sp.toString()}` : '';

  const res = await fetch(`${BASE_URL}${path}${query}`, { headers });
  if (!res.ok) throw new Error(`Statement fetch failed: ${res.status}`);

  const blob = await res.blob();

  const file = new File([blob], filename, { type: 'application/pdf' });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title });
    return;
  }

  // Fallback: trigger a browser download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
