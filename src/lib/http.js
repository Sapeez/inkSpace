// Optional chaining on `import.meta.env` itself, not just the property below
// it: Vite injects `import.meta.env` via its own build-time transform, but a
// component test run directly under `node --import tsx --test` (no Vite) has
// no such transform, so `import.meta.env` is `undefined` there — reading
// `.VITE_API_BASE_URL` off it directly throws before any test body runs.
const API_BASE = import.meta.env?.VITE_API_BASE_URL ?? '';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message ?? `Request failed: ${response.status}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

export { request, API_BASE };
