// Optional chaining on `import.meta.env` itself, not just the property below
// it: Vite injects `import.meta.env` via its own build-time transform, but a
// component test run directly under `node --import tsx --test` (no Vite) has
// no such transform, so `import.meta.env` is `undefined` there — reading
// `.VITE_API_BASE_URL` off it directly throws before any test body runs.
import { getCurrentUserId } from './currentUser.ts';

const API_BASE = import.meta.env?.VITE_API_BASE_URL ?? '';

async function request(path, options = {}) {
  const userId = getCurrentUserId();
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(userId ? { 'x-user-id': userId } : {}),
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const requestError = new Error(error.message ?? `Request failed: ${response.status}`);
    requestError.status = response.status;
    throw requestError;
  }

  if (response.status === 204) return null;
  return response.json();
}

export { request, API_BASE };
