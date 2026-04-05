const API_BASE = process.env.API_BASE || 'http://localhost:3003/api/v1';

let authToken: string | null = null;
let authUserId: string | null = null;

/** Short unique suffix for test data to avoid collisions across runs */
export const testSuffix = `_t${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

export async function getAuthToken(): Promise<string> {
  if (authToken) return authToken;

  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@demo.com',
      password: 'admin123',
      tenant: 'demo-company',
    }),
  });

  if (!res.ok) throw new Error(`Login failed: ${res.status}`);
  const data = await res.json();
  authToken = data.data?.token || data.token;
  authUserId = data.data?.user?.id || null;
  return authToken!;
}

export async function getAuthUserId(): Promise<string> {
  if (authUserId) return authUserId;
  await getAuthToken();
  return authUserId || '4d3eb96f-b5f9-4d40-814b-5fef1329ae50';
}

export async function api(
  method: string,
  path: string,
  body?: unknown,
) {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  const options: RequestInit = { method, headers };
  if (body) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  const res = await fetch(`${API_BASE}${path}`, options);
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

export function get(path: string) {
  return api('GET', path);
}

export function post(path: string, body?: unknown) {
  return api('POST', path, body);
}

export function put(path: string, body?: unknown) {
  return api('PUT', path, body);
}

export function del(path: string) {
  return api('DELETE', path);
}
