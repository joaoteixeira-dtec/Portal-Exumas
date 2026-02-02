# Gestão Dinâmica de Permissões

## 📋 O que foi implementado?

Um novo sistema dinâmico de permissões que permite ao Admin:
- ✅ Atribuir/retirar permissões individuais a utilizadores
- ✅ Combinar permissões de role + personalizadas
- ✅ Visualizar todas as permissões disponíveis por grupo

## 🎯 Como usar?

### 1. **Admin → Aba Permissões**
- Acede a `/admin` → clica em **🔐 Permissões**
- Seleciona um utilizador da lista
- Vê todas as permissões organizadas por grupos:
  - 📊 Dashboard
  - 📦 Encomendas
  - 👥 Clientes
  - 📄 Contratos
  - 🏭 Armazém
  - 🛒 Compras
  - 🚚 Rotas
  - 📬 Entregas
  - 💰 Faturação
  - ⚙️ Administração

### 2. **Selecionar/Desselecionar Permissões**
- Expande cada grupo clicando no botão
- Marca/desm arca as checkboxes para dar/retirar acesso
- **Automático**: As alterações são guardadas imediatamente no Firestore

## 🔧 Estrutura de Permissões

### Três níveis:

1. **Role Base** (Automático)
   - Admin: Acesso total (`*`)
   - Gestor: Múltiplas permissões
   - Motorista: Apenas rotas
   - Etc.

2. **Custom Permissions** (Dinâmico)
   - Adicionadas/removidas pelo Admin
   - Guardadas no campo `customPermissions` no Firestore

3. **Combinado**
   - O sistema mescla ambas automaticamente
   - Um utilizador com `gestor` + `invoicing.edit` tem ambas as permissões

## 📝 Exemplos de Uso no Código

```javascript
// Verificar permissão
const { can, canAny } = usePermissions()

if (can('orders.create')) {
  // Mostra botão de criar encomenda
}

if (canAny('orders.edit', 'orders.delete')) {
  // Mostra ações avançadas
}
```

## 🗄️ Dados no Firestore

```javascript
// users/{userId}
{
  name: "João Silva",
  role: "gestor",
  customPermissions: [
    "invoicing.edit",      // Adicionado dinamicamente
    "orders.delete",       // Adicionado dinamicamente
    "admin.settings"       // Acesso excepcional
  ]
}
```

## 🎨 Interface em Uso

```
┌─────────────────────────────────────┐
│ Permissões de: João Silva           │
│ Role: gestor | Personalizações: 3   │
├─────────────────────────────────────┤
│                                     │
│ ▼ 📊 Dashboard                      │
│   ☐ dashboard.view                  │
│   ☑ dashboard.export                │
│                                     │
│ ▶ 📦 Encomendas                     │
│                                     │
│ ▼ ⚙️ Administração                  │
│   ☑ admin.users.edit                │
│   ☑ admin.permissions               │
│   ☐ admin.settings                  │
│                                     │
└─────────────────────────────────────┘
```

## 🚀 Casos de Uso Comuns

### Dar acesso a Faturação a um Gestor
1. Admin → Permissões
2. Seleciona utilizador
3. Expande 💰 Faturação
4. Marca `invoicing.create` + `invoicing.edit`

### Retirar acesso de Administração
1. Desseleciona `admin.settings`
2. Automático, sem confirmação

### Negar Acesso Completo
- Remover o `role` (fazer `null`)
- Remover todas as `customPermissions`
- Utilizador fica com `role: 'blocked'` ou similar

## ⚙️ Estrutura de Ficheiros

- `src/config/permissions.js` - Lista de permissões, roles, groups
- `src/hooks/usePermissions.js` - Hook para verificar permissões
- `src/pages/Admin/index.jsx` - aba de Permissões (nova)
- `src/components/PermissionGate.jsx` - Componentes de controlo

## 📌 Próximas Melhorias Possíveis

- [ ] Histórico de alterações de permissões
- [ ] Bulk assign (dar permissão a vários utilizadores)
- [ ] Templates personalizados (e.g., "Supervisor de Armazém")
- [ ] Auditoria de acessos
- [ ] Expiração temporária de permissões
