/**
 * PageGuard.jsx
 * Componente para proteger páginas inteiras baseado em permissões.
 * Se o utilizador não tiver a permissão, mostra uma página de acesso negado.
 */

import { usePermissions } from '../hooks/usePermissions'
import { useNavigate } from 'react-router-dom'
import { useEffect } from 'react'

export function PageGuard({ 
  requiredPermission, 
  fallback = null, 
  children,
  redirectTo = '/dashboard' 
}) {
  const { can } = usePermissions()
  const navigate = useNavigate()

  const hasPermission = can(requiredPermission)

  // useEffect sempre no top-level (regra dos hooks)
  useEffect(() => {
    if (!hasPermission) {
      navigate(redirectTo, { replace: true })
    }
  }, [hasPermission, navigate, redirectTo])

  // Se não tem permissão, mostra fallback
  if (!hasPermission) {
    return fallback || (
      <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
        <h2>❌ Acesso Negado</h2>
        <p>Não tem permissão para aceder a esta página.</p>
        <p style={{ fontSize: '12px', color: '#999' }}>Permissão necessária: <code>{requiredPermission}</code></p>
      </div>
    )
  }

  return children
}

/**
 * Hook para verificar permissão de página (sem renderizar componente)
 */
export function usePageGuard(requiredPermission) {
  const { can } = usePermissions()
  return can(requiredPermission)
}
