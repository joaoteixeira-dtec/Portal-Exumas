/**
 * PermissionGate.jsx
 * Componentes para renderização condicional baseada em permissões.
 * 
 * Uso:
 *   <Can permission="orders.create">
 *     <button>Criar Encomenda</button>
 *   </Can>
 *   
 *   <Can permission="orders.edit" fallback={<span>Sem acesso</span>}>
 *     <button>Editar</button>
 *   </Can>
 *   
 *   <CanAny permissions={['orders.edit', 'orders.delete']}>
 *     <button>Ações</button>
 *   </CanAny>
 */

import { usePermissions } from '../hooks/usePermissions'

/**
 * Renderiza children apenas se o utilizador tiver a permissão.
 * 
 * @param {string} permission - Permissão a verificar
 * @param {boolean} requireFull - Se true, requer nível 'full' (não apenas 'view')
 * @param {React.ReactNode} fallback - Elemento a mostrar se não tiver permissão
 * @param {React.ReactNode} children - Conteúdo a renderizar se tiver permissão
 */
export function Can({ permission, requireFull = false, fallback = null, children }) {
  const { can, canFull } = usePermissions()

  const hasPermission = requireFull ? canFull(permission) : can(permission)

  if (!hasPermission) {
    return fallback
  }

  return children
}

/**
 * Renderiza children apenas se o utilizador tiver pelo menos uma das permissões.
 * 
 * @param {string[]} permissions - Lista de permissões (basta ter uma)
 * @param {boolean} requireFull - Se true, requer nível 'full'
 * @param {React.ReactNode} fallback - Elemento a mostrar se não tiver nenhuma permissão
 * @param {React.ReactNode} children - Conteúdo a renderizar
 */
export function CanAny({ permissions = [], requireFull = false, fallback = null, children }) {
  const { can, canFull } = usePermissions()

  const checker = requireFull ? canFull : can
  const hasAny = permissions.some(p => checker(p))

  if (!hasAny) {
    return fallback
  }

  return children
}

/**
 * Renderiza children apenas se o utilizador tiver TODAS as permissões.
 * 
 * @param {string[]} permissions - Lista de permissões (precisa de todas)
 * @param {boolean} requireFull - Se true, requer nível 'full' em todas
 * @param {React.ReactNode} fallback - Elemento a mostrar se faltar alguma permissão
 * @param {React.ReactNode} children - Conteúdo a renderizar
 */
export function CanAll({ permissions = [], requireFull = false, fallback = null, children }) {
  const { can, canFull } = usePermissions()

  const checker = requireFull ? canFull : can
  const hasAll = permissions.every(p => checker(p))

  if (!hasAll) {
    return fallback
  }

  return children
}

/**
 * Renderiza children com informação sobre se é read-only.
 * Útil para desabilitar botões ou mostrar indicadores visuais.
 * 
 * Uso:
 *   <WithPermission permission="orders.edit">
 *     {({ allowed, readOnly }) => (
 *       <button disabled={readOnly || !allowed}>
 *         Editar {readOnly && '👁'}
 *       </button>
 *     )}
 *   </WithPermission>
 * 
 * @param {string} permission - Permissão a verificar
 * @param {function} children - Render prop que recebe { allowed, readOnly, level }
 */
export function WithPermission({ permission, children }) {
  const { can, isReadOnly, getLevel } = usePermissions()

  if (typeof children !== 'function') {
    console.warn('WithPermission expects a function as children')
    return null
  }

  return children({
    allowed: can(permission),
    readOnly: isReadOnly(permission),
    level: getLevel(permission),
  })
}

/**
 * Botão que se desabilita automaticamente baseado em permissões.
 * 
 * @param {string} permission - Permissão necessária para o botão estar ativo
 * @param {boolean} showReadOnlyIndicator - Se true, mostra 👁 quando read-only
 * @param {boolean} hideWhenDenied - Se true, esconde completamente sem permissão
 * @param {object} props - Outras props do button (onClick, className, etc.)
 */
export function PermissionButton({ 
  permission, 
  showReadOnlyIndicator = true,
  hideWhenDenied = false,
  children, 
  disabled,
  ...props 
}) {
  const { can, isReadOnly } = usePermissions()

  const allowed = can(permission)
  const readOnly = isReadOnly(permission)

  // Se não tem permissão nenhuma e hideWhenDenied, não mostra
  if (!allowed && hideWhenDenied) {
    return null
  }

  // Desabilita se: já estava disabled, ou é read-only, ou não tem permissão
  const isDisabled = disabled || readOnly || !allowed

  return (
    <button {...props} disabled={isDisabled}>
      {children}
      {readOnly && showReadOnlyIndicator && ' 👁'}
    </button>
  )
}

/**
 * HOC para envolver componentes com verificação de permissão.
 * 
 * Uso:
 *   const ProtectedButton = withPermission(Button, 'orders.create')
 *   <ProtectedButton onClick={...}>Criar</ProtectedButton>
 */
export function withPermission(Component, permission, options = {}) {
  const { requireFull = false, fallback = null } = options

  return function PermissionWrapped(props) {
    const { can, canFull } = usePermissions()
    const checker = requireFull ? canFull : can

    if (!checker(permission)) {
      return fallback
    }

    return <Component {...props} />
  }
}

export default Can
