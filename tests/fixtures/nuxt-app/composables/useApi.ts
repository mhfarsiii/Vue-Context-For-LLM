export async function apiFetch<T = unknown>(
  endpoint: string,
  options?: { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown },
): Promise<T> {
  return $fetch<T>(`/api/proxy${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`, {
    method: options?.method || 'GET',
    body: options?.body,
  })
}
