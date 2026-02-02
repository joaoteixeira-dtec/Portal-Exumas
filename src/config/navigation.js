/**
 * navigation.js
 * Configuração do menu lateral baseada em permissões.
 * 
 * Cada item define:
 * - requiredPermission: permissão necessária para VER o item
 * - writePermission: permissão para EDITAR (opcional, determina full vs view)
 */

import { checkPermission, getEffectivePermissions } from './permissions'

// ==================== ESTRUTURA DE NAVEGAÇÃO ====================

export const NAVIGATION = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: '📊',
    path: '/dashboard',
    requiredPermission: 'dashboard.view',
  },
  {
    id: 'operations',
    label: 'Operações',
    icon: '📦',
    children: [
      {
        id: 'pipeline',
        label: 'Pipeline',
        path: '/pipeline',
        requiredPermission: 'orders.view',
        writePermission: 'orders.edit',
      },
      {
        id: 'new-order',
        label: 'Nova Encomenda',
        path: '/nova-encomenda',
        requiredPermission: 'orders.create',
      },
    ]
  },
  {
    id: 'warehouse',
    label: 'Armazém',
    icon: '🏭',
    children: [
      {
        id: 'preparation',
        label: 'Preparação',
        path: '/armazem',
        requiredPermission: 'warehouse.view',
        writePermission: 'warehouse.prepare',
      },
      {
        id: 'shortages',
        label: 'Faltas / Compras',
        path: '/compras',
        requiredPermission: 'purchases.view',
        writePermission: 'purchases.manage',
      },
    ]
  },
  {
    id: 'logistics',
    label: 'Logística',
    icon: '🚚',
    children: [
      {
        id: 'routes',
        label: 'Rotas',
        path: '/rotas',
        requiredPermission: 'routes.view',
        writePermission: 'routes.edit',
      },
      {
        id: 'deliveries',
        label: 'Entregas',
        path: '/entregas',
        requiredPermission: 'deliveries.view',
        writePermission: 'deliveries.register',
      },
    ]
  },
  {
    id: 'finance',
    label: 'Financeiro',
    icon: '💰',
    children: [
      {
        id: 'invoicing',
        label: 'Faturação',
        path: '/faturacao',
        requiredPermission: 'invoicing.view',
        writePermission: 'invoicing.edit',
      },
    ]
  },
  {
    id: 'clients',
    label: 'Clientes',
    icon: '👥',
    path: '/clientes',
    requiredPermission: 'clients.view',
    writePermission: 'clients.edit',
  },
  {
    id: 'admin',
    label: 'Administração',
    icon: '⚙️',
    children: [
      {
        id: 'users',
        label: 'Utilizadores',
        path: '/admin/users',
        requiredPermission: 'admin.users.view',
        writePermission: 'admin.users.edit',
      },
    ]
  },
]

// ==================== FUNÇÕES HELPER ====================

/**
 * Verifica se utilizador tem acesso a um item
 */
export function hasAccessToItem(item, userPermissions) {
  if (!item?.requiredPermission) return true
  return checkPermission(userPermissions, item.requiredPermission)
}

/**
 * Retorna o nível de acesso ('full', 'view', ou null)
 */
export function getAccessLevel(item, userPermissions) {
  // Verifica acesso básico
  if (!hasAccessToItem(item, userPermissions)) {
    return null
  }

  // Se não tem writePermission, assume full
  if (!item.writePermission) {
    return 'full'
  }

  // Verifica se tem permissão de escrita
  return checkPermission(userPermissions, item.writePermission) ? 'full' : 'view'
}

/**
 * Filtra navegação para um utilizador específico
 */
export function getNavigationForUser(role, customPermissions = []) {
  if (!role) return []

  const userPermissions = getEffectivePermissions(role, customPermissions)

  return NAVIGATION
    .map(group => {
      // Item simples
      if (!group.children) {
        const accessLevel = getAccessLevel(group, userPermissions)
        if (!accessLevel) return null
        return { ...group, accessLevel }
      }

      // Grupo com children
      const accessibleChildren = group.children
        .map(child => {
          const accessLevel = getAccessLevel(child, userPermissions)
          if (!accessLevel) return null
          return { ...child, accessLevel }
        })
        .filter(Boolean)

      if (accessibleChildren.length === 0) return null

      return { ...group, children: accessibleChildren }
    })
    .filter(Boolean)
}

/**
 * Versão simplificada que usa só o role (retrocompatível)
 */
export function getNavigationForRole(role) {
  return getNavigationForUser(role, [])
}

/**
 * Verifica acesso legacy (retrocompatível)
 */
export function hasAccess(item, role) {
  const userPermissions = getEffectivePermissions(role, [])
  return hasAccessToItem(item, userPermissions)
}

/**
 * Rota padrão por role
 */
export function getDefaultRoute(role) {
  const routes = {
    admin: '/dashboard',
    gestor: '/dashboard',
    armazem: '/armazem',
    compras: '/compras',
    faturacao: '/faturacao',
    rotas: '/rotas',
    motorista: '/entregas',
    cliente: '/cliente',
  }
  return routes[role] || '/dashboard'
}

/**
 * Primeira rota acessível para o utilizador
 */
export function getFirstAccessibleRoute(role, customPermissions = []) {
  const navigation = getNavigationForUser(role, customPermissions)

  for (const item of navigation) {
    if (item.path) return item.path
    if (item.children?.length > 0) {
      return item.children[0].path
    }
  }

  return getDefaultRoute(role)
}
