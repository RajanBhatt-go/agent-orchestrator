const API_BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const tenantId = localStorage.getItem('tenantId');
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'API request failed');
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ─── Tenants ────────────────────────────────────────────
export const tenants = {
  create: (name: string, slug: string) =>
    request<{ id: string; name: string; slug: string; apiKey: string }>('/tenants', {
      method: 'POST',
      body: JSON.stringify({ name, slug }),
    }),
};

// ─── Workflows ──────────────────────────────────────────
export const workflows = {
  list: () => request<any[]>('/workflows'),

  get: (id: string) => request<any>(`/workflows/${id}`),

  create: (data: { name: string; description?: string; graph: any }) =>
    request<any>('/workflows', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Partial<{ name: string; description: string; graph: any }>) =>
    request<any>(`/workflows/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    request<void>(`/workflows/${id}`, { method: 'DELETE' }),

  run: (id: string, input?: Record<string, any>) =>
    request<any>(`/workflows/${id}/run`, {
      method: 'POST',
      body: JSON.stringify({ input }),
    }),

  runs: (id: string) => request<any[]>(`/workflows/${id}/runs`),
};

// ─── Runs ───────────────────────────────────────────────
export const runs = {
  get: (id: string) => request<any>(`/runs/${id}`),
};