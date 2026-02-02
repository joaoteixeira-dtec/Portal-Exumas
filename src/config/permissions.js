/**
 * permissions.js
 * Sistema de permissões granulares com override dinâmico.
 * 
 * MODELO DE FUNCIONAMENTO:
 * 1. Role Templates: Permissões base para cada tipo de utilizador
 * 2. Custom Permissions: Definidas pelo admin para OVERRIDE do template
 * 
 * LÓGICA CRUCIAL:
 * Se um utilizador tem customPermissions > elas SUBSTITUEM o template completamente
 * 
 * Exemplos:
 * - Gestor normal: template gestor (orders.*, clients.*, etc) → SEM custom
 * - Gestor restrito: template gestor IGNORADO → custom = ["orders.view"] → SÓ vê orders
 * - Cliente estendido: template cliente + custom = ["contracts.view"] → vê orders + contracts
 * 
 * Estrutura:
 * - PERMISSIONS: lista de todas as permissões disponíveis (para documentação/UI)
 * - ROLE_TEMPLATES: permissões base por role (usadas SÓ se SEM customPermissions)
 * - Funções helper para verificação de permissões
 */

// ==================== LISTA DE PERMISSÕES ====================

export const PERMISSIONS = {
  // Dashboard
  'dashboard.view': 'Ver dashboard',
  'dashboard.export': 'Exportar dashboard',

  // Encomendas
  'orders.view': 'Ver encomendas',
  'orders.create': 'Criar encomendas',
  'orders.edit': 'Editar encomendas',
  'orders.cancel': 'Cancelar encomendas',
  'orders.delete': 'Eliminar encomendas',
  'orders.status': 'Alterar estado',

  // Clientes
  'clients.view': 'Ver clientes',
  'clients.create': 'Criar clientes',
  'clients.edit': 'Editar clientes',
  'clients.delete': 'Eliminar clientes',

  // Contratos
  'contracts.view': 'Ver contratos',
  'contracts.create': 'Criar contratos',
  'contracts.edit': 'Editar contratos',
  'contracts.delete': 'Eliminar contratos',

  // Armazém
  'warehouse.view': 'Ver preparação',
  'warehouse.prepare': 'Preparar encomendas',
  'warehouse.close': 'Fechar preparação',

  // Compras/Faltas
  'purchases.view': 'Ver compras/faltas',
  'purchases.manage': 'Gerir compras',
  'purchases.restock': 'Registar reposição',

  // Rotas
  'routes.view': 'Ver rotas',
  'routes.create': 'Criar rotas',
  'routes.edit': 'Editar rotas',
  'routes.assign': 'Atribuir motorista',

  // Entregas
  'deliveries.view': 'Ver entregas',
  'deliveries.register': 'Registar entrega',

  // Faturação
  'invoicing.view': 'Ver faturação',
  'invoicing.create': 'Criar faturas',
  'invoicing.edit': 'Editar faturas',
  'invoicing.export': 'Exportar faturação',

  // Admin
  'admin.users.view': 'Ver utilizadores',
  'admin.users.create': 'Criar utilizadores',
  'admin.users.edit': 'Editar utilizadores',
  'admin.users.delete': 'Eliminar utilizadores',
  'admin.permissions': 'Gerir permissões',
  'admin.settings': 'Definições do sistema',
}

// ==================== TEMPLATES POR ROLE ====================

export const ROLE_TEMPLATES = {
  admin: ['*'], // Acesso total

  gestor: [
    'dashboard.*',
    'orders.*',
    'clients.*',
    'contracts.*',
    'warehouse.view',
    'purchases.view',
    'routes.view',
    'deliveries.view',
    'invoicing.view',
  ],

  armazem: [
    'dashboard.view',
    'orders.view',
    'warehouse.*',
    'purchases.view',
    'routes.view',
  ],

  compras: [
    'dashboard.view',
    'orders.view',
    'warehouse.view',
    'purchases.*',
  ],

  faturacao: [
    'dashboard.view',
    'orders.view',
    'clients.view',
    'invoicing.*',
  ],

  rotas: [
    'dashboard.view',
    'orders.view',
    'warehouse.view',
    'routes.*',
    'deliveries.view',
  ],

  motorista: [
    'routes.view',
    'deliveries.*',
  ],

  cliente: [
    'orders.view',
    'orders.create',
  ],
}

// ==================== FUNÇÕES DE VERIFICAÇÃO ====================

/**
 * Verifica se uma permissão corresponde a um padrão.
 * Suporta wildcards: 'orders.*' inclui 'orders.view', 'orders.edit', etc.
 */
function matchPattern(permission, pattern) {
  if (pattern === '*') return true
  if (pattern === permission) return true
  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -2)
    return permission.startsWith(prefix + '.')
  }
  return false
}

/**
 * Obtém permissões efetivas para um utilizador.
 * 
 * IMPORTANTE: Se o utilizador tem customPermissions definidas pelo admin,
 * elas SUBSTITUEM completamente o template do role.
 * 
 * Isso permite ao admin:
 * - Remover completamente acessos mesmo que o role tenha
 * - Dar permissões específicas a um utilizador
 * 
 * Exemplo:
 * - Role: gestor (tem warehouse.*, orders.*, etc)
 * - customPermissions: ["orders.view"] (admin deu APENAS acesso a ver orders)
 * - Resultado: Só tem orders.view, NÃO tem warehouse.* do template!
 */
export function getEffectivePermissions(role, customPermissions = []) {
  // Se tem customPermissions, elas são as ÚNICAS permissões (override)
  if (customPermissions.length > 0) {
    return customPermissions
  }
  
  // Senão, usa o template do role
  const template = ROLE_TEMPLATES[role] || []
  return template
}

/**
 * Verifica se um array de permissões inclui uma permissão específica.
 */
export function checkPermission(userPermissions, permission) {
  if (!userPermissions || !permission) return false
  
  return userPermissions.some(p => matchPattern(permission, p))
}

/**
 * Verifica se tem pelo menos uma das permissões.
 */
export function checkAnyPermission(userPermissions, permissions) {
  return permissions.some(p => checkPermission(userPermissions, p))
}

/**
 * Verifica se tem todas as permissões.
 */
export function checkAllPermissions(userPermissions, permissions) {
  return permissions.every(p => checkPermission(userPermissions, p))
}

/**
 * Cria um checker de permissões para um utilizador.
 */
export function createPermissionChecker(role, customPermissions = []) {
  const permissions = getEffectivePermissions(role, customPermissions)

  return {
    can: (perm) => checkPermission(permissions, perm),
    canAny: (...perms) => checkAnyPermission(permissions, perms),
    canAll: (...perms) => checkAllPermissions(permissions, perms),
    
    // Para o sistema de navegação - determina se é full ou view
    canFull: (perm) => checkPermission(permissions, perm),
    isReadOnly: (perm) => {
      // Se tem a permissão exata de view mas não as de edição
      // Ex: tem 'orders.view' mas não 'orders.edit'
      const basePerm = perm.replace(/\.(view|edit|create|delete)$/, '')
      const hasView = checkPermission(permissions, basePerm + '.view')
      const hasEdit = checkPermission(permissions, basePerm + '.edit') || 
                      checkPermission(permissions, basePerm + '.create') ||
                      checkPermission(permissions, basePerm + '.*')
      return hasView && !hasEdit
    },
    
    getLevel: (perm) => {
      if (!checkPermission(permissions, perm)) return null
      // Simplificado: se tem a permissão, retorna 'full'
      return 'full'
    },
    
    getAllPermissions: () => [...permissions],
  }
}

// ==================== GRUPOS PARA UI ====================

export const PERMISSION_GROUPS = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: '📊',
    permissions: ['dashboard.view', 'dashboard.export'],
  },
  {
    id: 'orders',
    label: 'Encomendas',
    icon: '📦',
    permissions: ['orders.view', 'orders.create', 'orders.edit', 'orders.cancel', 'orders.delete', 'orders.status'],
  },
  {
    id: 'clients',
    label: 'Clientes',
    icon: '👥',
    permissions: ['clients.view', 'clients.create', 'clients.edit', 'clients.delete'],
  },
  {
    id: 'contracts',
    label: 'Contratos',
    icon: '📄',
    permissions: ['contracts.view', 'contracts.create', 'contracts.edit', 'contracts.delete'],
  },
  {
    id: 'warehouse',
    label: 'Armazém',
    icon: '🏭',
    permissions: ['warehouse.view', 'warehouse.prepare', 'warehouse.close'],
  },
  {
    id: 'purchases',
    label: 'Compras',
    icon: '🛒',
    permissions: ['purchases.view', 'purchases.manage', 'purchases.restock'],
  },
  {
    id: 'routes',
    label: 'Rotas',
    icon: '🚚',
    permissions: ['routes.view', 'routes.create', 'routes.edit', 'routes.assign'],
  },
  {
    id: 'deliveries',
    label: 'Entregas',
    icon: '📬',
    permissions: ['deliveries.view', 'deliveries.register'],
  },
  {
    id: 'invoicing',
    label: 'Faturação',
    icon: '💰',
    permissions: ['invoicing.view', 'invoicing.create', 'invoicing.edit', 'invoicing.export'],
  },
  {
    id: 'admin',
    label: 'Administração',
    icon: '⚙️',
    permissions: ['admin.users.view', 'admin.users.create', 'admin.users.edit', 'admin.users.delete', 'admin.permissions', 'admin.settings'],
  },
]
