# PlatCloude - Sistema de Permissões Dinâmicas

## Visão Geral

Sistema completo e integrado de permissões que funciona em tempo real. Quando o admin altera as permissões de um utilizador, as mudanças aparecem imediatamente no menu e no acesso às páginas.

## Arquitetura

### 1. **Definição de Permissões** (`src/config/permissions.js`)

Todas as permissões são definidas em um único lugar:

```javascript
PERMISSIONS = {
  'clients.view': 'Ver clientes',
  'clients.edit': 'Editar clientes',
  'orders.view': 'Ver encomendas',
  // ... mais permissões
}

ROLE_TEMPLATES = {
  admin: ['*'], // Acesso total
  gestor: ['dashboard.*', 'orders.*', 'clients.*', ...],
  cliente: ['orders.view', 'orders.create'],
  // ... mais roles
}
```

**Importante**: O sistema usa **wildcard matching**:
- `orders.*` = acesso a `orders.view`, `orders.edit`, `orders.create`, etc.
- `*` = acesso a TUDO

### 2. **Carregamento em Tempo Real** (`src/contexts/AuthProvider.jsx`)

O perfil do utilizador é carregado com um **real-time listener**:

```javascript
onSnapshot(doc(db,'users', u.uid), (doc) => {
  setProfile(doc.exists() ? doc.data() : null)
})
```

**Por isso funciona em tempo real**: Quando o admin muda as permissões no Firestore, o profile do utilizador é atualizado automaticamente.

### 3. **Hook de Permissões** (`src/hooks/usePermissions.js`)

```javascript
const { can, canAny, canAll, canFull, isReadOnly, getLevel } = usePermissions()

// Uso:
if (can('orders.create')) { /* mostrar botão */ }
if (canFull('orders.edit')) { /* edição completa */ }
```

O hook lê do profile e aplica a lógica de **override**:
- **Se tem customPermissions**: Elas são as ÚNICAS permissões (ignora role template)
- **Se NÃO tem customPermissions**: Usa as permissões do role template

### 4. **Componentes de Gating** (`src/components/PermissionGate.jsx`)

#### Componente `<Can>`
```javascript
<Can permission="clients.view">
  <ClientsPage />
</Can>
```

#### Componente `<CanAny>`
```javascript
<CanAny permissions={['orders.edit', 'orders.delete']}>
  <button>Ações Avançadas</button>
</CanAny>
```

#### Componente `<PermissionButton>`
```javascript
<PermissionButton permission="orders.create">
  Criar Encomenda
</PermissionButton>
```

Desabilita automaticamente se não tiver permissão.

### 5. **Page Guard** (`src/components/PageGuard.jsx`)

Protege páginas inteiras:

```javascript
<PageGuard requiredPermission="clients.view">
  <ClientsPage />
</PageGuard>
```

Se o utilizador não tiver a permissão:
- ✅ Redireciona para `/dashboard`
- ✅ Mostra mensagem de acesso negado
- ✅ O menu não mostra a página

### 6. **Filtragem do Menu** (`src/config/navigation.js`)

O menu lateral é gerado dinamicamente:

```javascript
const navigation = getNavigationForUser(role, customPermissions)
```

**Resultado**: Se o utilizador não tem `clients.view`, o item "Clientes" não aparece no menu.

## Fluxo Completo

### Cenário: Admin remove permissão "clients.view" de um utilizador

1. **Admin clica em Permissões → seleciona utilizador → desmarca checkbox `clients.view` → clica Guardar**
   - Mutação enviada para Firestore
   - Campo `customPermissions` do utilizador é atualizado

2. **Utilizador está logado em outra janela**
   - Real-time listener do AuthProvider detecta mudança no Firestore
   - `profile` é atualizado automaticamente
   - `usePermissions()` recalcula as permissões

3. **Componentes reagem automaticamente**
   - ✅ `<Can permission="clients.view">` retorna false → conteúdo escondido
   - ✅ Menu Sidebar filtra e remove item "Clientes"
   - ✅ Se o utilizador tentar ir direto a `/clientes`, o PageGuard redireciona para `/dashboard`

## Estrutura de Dados

### Utilizador no Firestore

```javascript
{
  id: "user123",
  name: "João Silva",
  role: "gestor",
  
  // Permissões personalizadas (adicionadas pelo admin)
  customPermissions: [
    "orders.view",
    "orders.create",
    // Nota: NÃO tem orders.edit, orders.delete, etc
  ]
}
```

### Permissões Efetivas: Lógica de Override (IMPORTANTE)

**Se o utilizador tem `customPermissions`, elas SUBSTITUEM o `ROLE_TEMPLATES` completamente!**

#### Cenário 1: Utilizador normal (SEM customPermissions)

```javascript
role: "gestor"
customPermissions: [] // vazio ou não definido

// Resultado: Usa ROLE_TEMPLATES.gestor
permissões efetivas = [
  "dashboard.*",
  "orders.*",
  "clients.*",
  "contracts.*",
  // ... tudo do template gestor
]
```

#### Cenário 2: Utilizador restrito (COM customPermissions)

```javascript
role: "gestor"
customPermissions: ["orders.view"]

// Resultado: IGNORA o template gestor!
// Só tem orders.view, nada mais
permissões efetivas = ["orders.view"]
```

#### Cenário 3: Admin remove warehouse de um gestor

```javascript
role: "gestor"
// Normalmente teria warehouse.view, mas admin removeu:
customPermissions: [
  "dashboard.*",
  "orders.*",
  "clients.*",
  "contracts.*"
  // warehouse NÃO está aqui!
]

// Resultado:
// warehouse desaparece completamente! ✅
```

## Restrição de Permissões (AGORA FUNCIONA!)

### Problema anterior
- Template + Custom = Merge (juntava tudo)
- Não conseguia remover warehouse porque estava no template!

### Solução atual
- Custom = Replace (substitui completamente o template)
- Se define custom, consegue tirar qualquer permissão! ✅

## Exemplos de Uso

### Bloquear página inteira
```jsx
export default function ClientsPage() {
  return (
    <PageGuard requiredPermission="clients.view">
      {/* Conteúdo da página */}
    </PageGuard>
  )
}
```

### Bloquear seção dentro de página
```jsx
function ClientsPage() {
  return (
    <div>
      <Can permission="clients.view">
        <ClientList />
      </Can>
      
      <Can permission="clients.edit" fallback={<p>Sem acesso</p>}>
        <ClientForm />
      </Can>
    </div>
  )
}
```

### Desabilitar botão
```jsx
<PermissionButton permission="clients.create" hideWhenDenied>
  Criar Cliente
</PermissionButton>
```

### Renderização condicional com mais controle
```jsx
<WithPermission permission="orders.edit">
  {({ allowed, readOnly, level }) => (
    <button disabled={readOnly || !allowed}>
      Editar {readOnly && '👁'}
    </button>
  )}
</WithPermission>
```

## Páginas Protegidas

Todas as páginas principais têm `PageGuard`:

| Página | Permissão | Arquivo |
|--------|-----------|---------|
| Clientes | `clients.view` | `ClientsPage.jsx` |
| Rotas | `routes.view` | `Rotas/index.jsx` |
| Compras | `purchases.view` | `Compras.jsx` |
| Faturação | `invoicing.view` | `Faturacao.jsx` |
| Armazém | `warehouse.view` | `Armazem.jsx` |
| Entregas | `deliveries.view` | `Motorista.jsx` |

## Testes

### Teste 1: Remover permissão enquanto logado
1. Utilizador A entra com role `gestor`
2. Pode ver menu "Clientes"
3. Admin remove `clients.view` de A
4. ✅ Menu desaparece em tempo real
5. ✅ Se A tentar ir a `/clientes`, é redirecionado

### Teste 2: Remover e re-adicionar
1. Admin remove uma permissão
2. Utilizador vê a mudança imediatamente
3. Admin re-adiciona a mesma permissão
4. ✅ Acesso é restaurado em tempo real

### Teste 3: Múltiplas abas
1. Utilizador abre 2 abas do mesmo navegador
2. Admin muda permissões
3. ✅ Ambas as abas refletem a mudança

## Limitações Conhecidas

1. **Wildcard negativo**: Não é possível fazer `"!clients.*"` para negar tudo de clients
   - Solução: Implementar "denylist" em customPermissions

2. **Permissões em cache**: Se usar Redux/Context mal configurado, pode não atualizar
   - Solução: Usar React Query para query dos users no admin

3. **Página em branco**: Se PageGuard redireciona, pode causar breve piscada
   - Solução: Adicionar skeleton loading

## Melhorias Futuras

1. ✅ **Wildcard matching** (já implementado)
2. ✅ **Real-time updates** (já implementado)
3. ✅ **Page guards** (já implementado)
4. 🔲 Audit log de mudanças de permissões
5. 🔲 Exportar/importar perfis de permissões
6. 🔲 Templates de permissões personalizados
7. 🔲 Histórico de permissões (quem mudou, quando)
