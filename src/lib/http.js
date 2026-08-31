const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

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
