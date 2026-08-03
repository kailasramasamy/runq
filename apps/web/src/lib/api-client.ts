import type { ApiError } from '@runq/types';

const BASE_URL = '/api/v1';

/**
 * Error thrown for any non-OK API response. Carries the server's structured
 * payload (statusCode, error, message, details) and is a real Error subclass
 * so `instanceof Error` checks work across the app.
 */
export class ApiClientError extends Error {
  statusCode: number;
  error: string;
  details?: { field: string; message: string }[];
  constructor(payload: ApiError) {
    super(payload.message || payload.error || `Request failed: ${payload.statusCode}`);
    this.name = 'ApiClientError';
    this.statusCode = payload.statusCode;
    this.error = payload.error;
    this.details = payload.details;
  }
}

class ApiClient {
  private token: string | null = null;
  private tenantId: string | null = null;
  private onUnauthorized: (() => void) | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  setTenantId(tenantId: string | null) {
    this.tenantId = tenantId;
  }

  setOnUnauthorized(cb: (() => void) | null) {
    this.onUnauthorized = cb;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      ...((options.headers as Record<string, string>) || {}),
    };

    // FormData sets its own multipart boundary — forcing JSON breaks uploads.
    if (options.body && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const sentToken = this.token;
    if (sentToken) {
      headers['Authorization'] = `Bearer ${sentToken}`;
    }

    if (this.tenantId) {
      headers['X-Tenant-Id'] = this.tenantId;
    }

    const response = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers,
    });

    // Expired/invalid token — clear it and redirect to login.
    // Only when we actually sent a token (login attempts also return 401).
    if (response.status === 401 && sentToken) {
      localStorage.removeItem('runq-token');
      this.token = null;
      if (this.onUnauthorized) {
        this.onUnauthorized();
      } else if (!window.location.pathname.endsWith('/login')) {
        const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
        window.location.replace(`${base}/login?session=expired`);
      }
    }

    if (!response.ok) {
      let payload: ApiError;
      try {
        payload = await response.json();
      } catch {
        payload = {
          statusCode: response.status,
          error: response.statusText || 'Error',
          message: response.statusText || `Request failed: ${response.status}`,
        };
      }
      throw new ApiClientError(payload);
    }

    // 204 No Content has no body — calling .json() on it throws
    // "Unexpected end of JSON input". DELETE endpoints use this.
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  get<T>(path: string) {
    return this.request<T>(path);
  }

  post<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  put<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  patch<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * Auth + tenant headers for the few callers that must use raw `fetch`
   * (blob/image streams that need an object URL rather than a download).
   */
  authHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    if (this.tenantId) headers['X-Tenant-Id'] = this.tenantId;
    return headers;
  }

  /** Multipart upload. Goes through `request` so auth + X-Tenant-Id are sent. */
  upload<T>(path: string, form: FormData) {
    return this.request<T>(path, { method: 'POST', body: form });
  }

  delete<T>(path: string) {
    return this.request<T>(path, { method: 'DELETE' });
  }

  async download(path: string, filename: string): Promise<void> {
    const headers: Record<string, string> = {};
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    if (this.tenantId) headers['X-Tenant-Id'] = this.tenantId;
    const res = await fetch(`${BASE_URL}${path}`, { headers });
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

export const api = new ApiClient();
