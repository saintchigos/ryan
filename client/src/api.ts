const rawBase = (import.meta.env.VITE_API_URL as string | undefined) ?? '';
const rawToken = (import.meta.env.VITE_API_TOKEN as string | undefined) ?? '';

export const API_BASE = rawBase.trim() ? rawBase.trim().replace(/\/+$/, '') : '';
export const API_TOKEN = rawToken.trim();

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (API_TOKEN) headers.set('Authorization', `Bearer ${API_TOKEN}`);
  return fetch(apiUrl(path), { ...init, headers });
}

export function jsonInit(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}
