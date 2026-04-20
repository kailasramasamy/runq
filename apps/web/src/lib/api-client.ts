import type { ApiError } from '@runq/types';

const BASE_URL = '/api/v1';

class ApiClient {
  private token: string | null = null;
  private onUnauthorized: (() => void) | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  setOnUnauthorized(cb: (() => void) | null) {
    this.onUnauthorized = cb;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      ...((options.headers as Record<string, string>) || {}),
    };

    if (options.body) {
      headers['Content-Type'] = 'application/json';
    }

    const sentToken = this.token;
    if (sentToken) {
      headers['Authorization'] = `Bearer ${sentToken}`;
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
      const error: ApiError = await response.json();
      throw error;
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

  delete<T>(path: string) {
    return this.request<T>(path, { method: 'DELETE' });
  }
}

export const api = new ApiClient();
