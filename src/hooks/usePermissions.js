/**
 * usePermissions.js
 * Hook para verificar permissões do utilizador atual.
 * 
 * Uso:
 *   const { can, canAny, canAll, isReadOnly } = usePermissions()
 *   
 *   if (can('orders.create')) { ... }
 *   if (canAny('orders.edit', 'orders.delete')) { ... }
 */

import { useMemo } from 'react'
import { useAuth } from '../contexts/AuthProvider'
import { createPermissionChecker } from '../config/permissions'

/**
 * Hook principal para verificar permissões.
 */
export function usePermissions() {
  const { profile } = useAuth()

  const checker = useMemo(() => {
    const role = profile?.role || null
    // Custom permissions podem vir do profile (se existirem no Firestore)
    const customPermissions = profile?.customPermissions || []
    
    return createPermissionChecker(role, customPermissions)
  }, [profile?.role, profile?.customPermissions])

  return {
    /**
     * Verifica se tem a permissão
     */
    can: checker.can,

    /**
     * Verifica se tem pelo menos uma das permissões
     */
    canAny: checker.canAny,

    /**
     * Verifica se tem todas as permissões
     */
    canAll: checker.canAll,

    /**
     * Verifica se tem permissão full (para editar)
     */
    canFull: checker.canFull,

    /**
     * Verifica se é read-only
     */
    isReadOnly: checker.isReadOnly,

    /**
     * Retorna o nível de acesso
     */
    getLevel: checker.getLevel,

    /**
     * Retorna todas as permissões do utilizador
     */
    getAllPermissions: checker.getAllPermissions,

    /**
     * Role atual
     */
    role: profile?.role || null,

    /**
     * Se está autenticado
     */
    isAuthenticated: !!profile,
  }
}

/**
 * Hook simplificado para uma única permissão
 */
export function usePermission(permission) {
  const { can, isReadOnly, getLevel } = usePermissions()

  return useMemo(() => ({
    allowed: can(permission),
    readOnly: isReadOnly(permission),
    level: getLevel(permission),
  }), [can, isReadOnly, getLevel, permission])
}

export default usePermissions
