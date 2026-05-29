import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import './index.css'
import App from './App.tsx'
import { useAuthStore } from '@/store/auth.store'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

// Intenta restaurar sesión desde el token en localStorage al cargar la app
function AppConSesion() {
  const restaurarSesion = useAuthStore((s) => s.restaurarSesion)
  const inicializando   = useAuthStore((s) => s.inicializando)

  useEffect(() => {
    restaurarSesion()
  }, [restaurarSesion])

  // Mientras verifica el token existente, no renderizar para evitar flash
  if (inicializando) return null

  return <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppConSesion />
        <Toaster position="bottom-center" richColors duration={2000} />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
