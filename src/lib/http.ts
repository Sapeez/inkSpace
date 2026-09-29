// Optional chaining on `import.meta.env` itself, not just the property below
// it: Vite injects `import.meta.env` via its own build-time transform, but a
// component test run directly under `node --import tsx --test` (no Vite) has
// no such transform, so `import.meta.env` is `undefined` there — reading
// `.VITE_API_BASE_URL` off it directly throws before any test body runs.
import { getAccessToken } from './session';

const API_BASE = import.meta.env?.VITE_API_BASE_URL ?? '';

export interface RequestError extends Error {
  status: number;
}

function isRequestError(error: unknown): error is RequestError {
  return error instanceof Error && 'status' in error;
}

function extractErrorMessage(body: unknown, fallbackStatus: number): string {
  if (typeof body === 'object' && body !== null && 'message' in body) {
    const message = (body as { message: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return `Request failed: ${fallbackStatus}`;
}

async function request<T = unknown>(path: string, options: RequestInit = {}): Promise<T | null> {
  // 1.7: identity now comes from the caller's verified Supabase session
  // (`session.ts`), not the `x-user-id` header stub — see `currentUser.ts`'s
  // deletion note.
  const token = await getAccessToken();
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => ({}));
    const requestError = new Error(extractErrorMessage(body, response.status)) as RequestError;
    requestError.status = response.status;
    throw requestError;
  }

  if (response.status === 204) return null;
  return response.json();
}

export { request, API_BASE, isRequestError };
