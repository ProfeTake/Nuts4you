/**
 * Wrapper para fetch con auth headers.
 * Base URL se resuelve desde VITE_API_URL o el proxy de Vite.
 */

import { esRutaDemo, resolverFixtureDemo } from './demoFixtures'

const BASE_URL = import.meta.env.VITE_API_URL ?? ''

interface ApiOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
}

export async function api<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const { body, headers: customHeaders, method, ...rest } = options
  const metodo = (method ?? 'GET').toUpperCase()

  // Modo demo: los datos son ficticios y viven solo en memoria del navegador,
  // nunca tocan el backend real (ver lib/demoFixtures.ts).
  if (localStorage.getItem('esDemo') === '1' && esRutaDemo(endpoint)) {
    const fixture = resolverFixtureDemo(metodo, endpoint, body)
    if (fixture) return fixture as Promise<T>
    throw new Error('No disponible en modo demo')
  }

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
    method: metodo,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    ...rest,
  })

  // Token expirado o inválido: limpiar sesión y redirigir al login en vez de
  // dejar la UI en un estado roto con un error críptico.
  if (response.status === 401 && token) {
    localStorage.removeItem('token')
    if (window.location.pathname !== '/login') {
      window.location.href = '/login'
    }
    throw new Error('Sesión expirada. Vuelve a iniciar sesión.')
  }

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
