import { apiUrl } from './config';
import {
  getAccessToken,
  setAccessToken,
  loadRefreshToken,
  storeRefreshToken,
  clearRefreshToken,
} from './auth';

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  _retried?: boolean;
}

class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

let inflightRefresh: Promise<string | null> | null = null;

async function performRefresh(): Promise<string | null> {
  const refresh = await loadRefreshToken();
  if (!refresh) return null;

  const res = await fetch(apiUrl('/auth/refresh'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken: refresh }),
  });

  if (!res.ok) {
    await clearRefreshToken();
    return null;
  }

  const body = (await res.json()) as { accessToken: string; refreshToken: string };
  setAccessToken(body.accessToken);
  await storeRefreshToken(body.refreshToken);
  return body.accessToken;
}

async function refreshAccessToken(): Promise<string | null> {
  if (!inflightRefresh) {
    inflightRefresh = performRefresh().finally(() => {
      inflightRefresh = null;
    });
  }
  return inflightRefresh;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  const access = getAccessToken();
  if (access) headers.authorization = `Bearer ${access}`;
  if (options.body !== undefined) headers['content-type'] = 'application/json';

  const res = await fetch(apiUrl(path), {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401 && !options._retried && !path.startsWith('/auth/')) {
    const newAccess = await refreshAccessToken();
    if (newAccess) {
      return request<T>(path, { ...options, _retried: true });
    }
    throw new ApiError('Unauthorized', 401, null);
  }

  if (!res.ok) {
    let body: unknown = null;
    try { body = await res.json(); } catch {}
    throw new ApiError(`HTTP ${res.status}`, res.status, body);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const apiClient = {
  get: <T>(path: string, headers?: Record<string, string>) => request<T>(path, { method: 'GET', headers }),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>(path, { method: 'POST', body, headers }),
  put: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>(path, { method: 'PUT', body, headers }),
};

export { ApiError };
