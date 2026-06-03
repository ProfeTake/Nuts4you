/**
 * Wrapper para fetch con auth headers.
 * Base URL se resuelve desde VITE_API_URL o el proxy de Vite.
 */

const BASE_URL = import.meta.env.VITE_API_URL ?? ''

interface ApiOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
}

export async function api<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const { body, headers: customHeaders, ...rest } = options

  // TODO: Obtener token del store de auth cuando se implemente
  const token = localStorage.getItem('token')

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...customHeaders as Record<string, string>,
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(`${BASE_URL}/api${endpoint}`, {
    headers,
    body: body ? JSON.stringify(body) : undefined,
    ...rest,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Error de conexión' }))
    throw new Error(error.error ?? `Error ${response.status}`)
  }

  return response.json()
}

// Atajos
export const apiGet = <T>(endpoint: string) => api<T>(endpoint)
export const apiPost = <T>(endpoint: string, body: unknown) => api<T>(endpoint, { method: 'POST', body })
export const apiPatch = <T>(endpoint: string, body: unknown) => api<T>(endpoint, { method: 'PATCH', body })
export const apiDelete = <T>(endpoint: string) => api<T>(endpoint, { method: 'DELETE' })
