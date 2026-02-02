# Refatoração do Gestor.jsx

## Problema Original
- **Gestor.jsx**: ~2900 linhas num único componente
- Mistura lógica de negócio, UI, e state management
- Código duplicado entre Rotas.jsx, Motorista.jsx, Armazem.jsx
- Queries N+1 (carregamento individual de contratos/locais)

---

## Nova Arquitetura

```
src/
├── lib/
│   ├── orderHelpers.js      # 330 linhas - Helpers centralizados
│   └── useFirestoreIndexes.js # 249 linhas - Queries otimizadas
├── components/
│   └── ui/
│       └── index.jsx        # 382 linhas - Componentes reutilizáveis
└── pages/
    ├── Gestor/
    │   ├── index.jsx        # 86 linhas - Routing e estado global
    │   └── components/
    │       ├── Pipeline.jsx # 564 linhas - Gestão de encomendas
    │       ├── ClientHub.jsx # 631 linhas - Clientes/Contratos/Locais
    │       └── OrderForm.jsx # 947 linhas - Criação de encomendas
    └── Admin/
        └── index.jsx        # 1080 linhas - Dashboard operacional
```

---

## 1. Bibliotecas Partilhadas

### `src/lib/orderHelpers.js`
Centraliza helpers usados em múltiplas páginas:

```javascript
// String utils
pickText, clean, safe, joinNice, cap, isLikelyId

// Date utils
toISODate, addDays, startOfWeek, asDate, fmtTime, fmtDateShort, fmtDateFull

// Order status
isCancelledStatus, isDeliveredStatus, isInTransitStatus, isInWarehouseStatus, STATE_WEIGHT

// Order data
getOrderClientId, getOrderDate, orderNoLabel, orderTotalValue, itemsArray, itemsOf

// Bulk orders
orderKind, isBulkSubOrder, isBulkBatchOrder

// Client/Contract/Location
getClientName, getContractName, getLocationInfo, formatAddress, getPreparedBy

// Email/Contacts
parseEmailList, formatEmailList, normalizeContacts, contactsToText, contactsFromText

// Array utils
chunk

// Constants
FLEET, CARRIERS_MAP, weekdays
```

**Elimina duplicação**: `getClientName`, `formatAddress`, `getLocationInfo` estavam duplicados em Rotas.jsx (linhas 11-122) e Motorista.jsx (linhas 9-114).

### `src/lib/useFirestoreIndexes.js`
Resolve o problema N+1 com batch loading:

```javascript
// Índices globais (carregados uma vez, cache 5min)
useLocationsIndex()  // { [id]: location }
useContractsIndex()  // { [id]: contract }
useUsersIndex()      // { [id]: user }
useMotoristas()      // Lista de motoristas

// Queries otimizadas
useNamesForOrders(orders)  // Batch load de nomes por IDs (chunks de 10)
useRoutesRange(startISO, endISO)  // Rotas por data
useContractProducts(contractId)  // Produtos de um contrato

// Analytics
computeOrderStats(orders)  // KPIs agregados
```

**Antes**: Armazem.jsx fazia getDocs individual para cada contrato/local → 100 orders = 100+ queries
**Depois**: useNamesForOrders agrupa IDs e faz queries em chunks de 10 → 100 orders = ~10 queries

---

## 2. Componentes UI Reutilizáveis

### `src/components/ui/index.jsx`

| Componente | Uso |
|------------|-----|
| `Modal` | Modais genéricos com overlay |
| `ConfirmDialog` | Confirmação de ações destrutivas |
| `Tabs` | Navegação por tabs com badges |
| `StatCard` | Cards KPI com cor, ícone, trend |
| `ProgressBar` | Visualização de progresso |
| `Badge` | Etiquetas coloridas |
| `EmptyState` | Estado vazio com ícone e ação |
| `LoadingSpinner` | Indicador de loading |
| `SearchInput` | Pesquisa com debounce |
| `Pagination` | Paginação com selector de tamanho |
| `Table` | Tabela genérica com config de colunas |

---

## 3. Gestor Refatorado

### `src/pages/Gestor/index.jsx` (86 linhas)
Ponto de entrada minimalista:
- Carrega dados globais (orders, clients)
- Gere tabs (Pipeline, Clientes, Nova Encomenda)
- Delega para sub-componentes

### `src/pages/Gestor/components/Pipeline.jsx` (564 linhas)
Gestão do pipeline de encomendas:
- 3 views: ativas, entregues, massa
- Filtros: status, pesquisa, ordenação
- Paginação: 12/25/50 por página
- Modal de detalhes com produtos e timeline
- Ações: mover status, alterar transportador, cancelar, reativar, eliminar
- Exportação PDF

### `src/pages/Gestor/components/ClientHub.jsx` (631 linhas)
Gestão de clientes:
- Lista com pesquisa (nome, email, NIF)
- KPIs por cliente: pedidos, satisfeitas, faturação, média/semana
- CRUD de contratos com cascade delete
- CRUD de locais por contrato
- Import de produtos (Excel/CSV) com validação
- Gestão de emails e contactos

### `src/pages/Gestor/components/OrderForm.jsx` (947 linhas)
Criação de encomendas:
- Modo normal: cliente → contrato → local → produtos
- Modo em massa: parse de texto livre
- Validação de campos
- Janela de entrega automática/manual
- Produtos extra ad-hoc
- Counter atómico para orderNo

---

## 4. Admin Dashboard

### `src/pages/Admin/index.jsx` (1080 linhas)
Dashboard operacional completo com 5 tabs:

**📊 Visão Geral**
- KPIs globais: encomendas ativas, entregues, receita semanal, canceladas
- Alertas: encomendas bloqueadas >24h, com faltas, rotas não atribuídas
- Distribuição por status com barras de progresso
- Top 5 clientes por receita
- Equipa por função

**📦 Pipeline**
- Todas as encomendas com filtros
- Tabela ordenável
- Modal de intervenção (forçar status, cancelar, reativar, eliminar)

**🏭 Armazém**
- KPIs: ESPERA, PREP, FALTAS, A_FATURAR
- Lista de encomendas em armazém
- Produtos em falta agregados por quantidade

**🚚 Entregas**
- KPIs: A_EXPEDIR, em trânsito, rotas hoje, entregas hoje
- Rotas do dia com estado
- Encomendas em distribuição

**👥 Utilizadores**
- Tabs: Staff vs Clientes
- Pesquisa e CRUD
- Ativar/Desativar contas
- Gestão de roles

---

## Migração

### Ficheiros Renomeados
```bash
src/pages/Gestor.jsx → src/pages/Gestor.OLD.jsx
src/pages/Admin.jsx  → src/pages/Admin.OLD.jsx
```

### App.jsx
Nenhuma alteração necessária - os imports resolvem para as novas pastas:
```javascript
import Admin from './pages/Admin'   // → Admin/index.jsx
import Gestor from './pages/Gestor' // → Gestor/index.jsx
```

### Actualizar Outras Páginas
Rotas.jsx e Motorista.jsx devem importar dos helpers:
```javascript
import {
  getClientName, formatAddress, getLocationInfo, getContractName,
  toISODate, addDays, fmtTime, clean, pickText, joinNice
} from '../lib/orderHelpers'
import { useLocationsIndex, useContractsIndex } from '../lib/useFirestoreIndexes'
```

E remover as definições duplicadas locais.

---

## Métricas

| Métrica | Antes | Depois |
|---------|-------|--------|
| Gestor.jsx | 2908 linhas | 86 linhas (index) |
| Maior ficheiro | 2908 linhas | 1080 linhas (Admin) |
| Duplicação helpers | 3× (~120 linhas cada) | 1× (330 linhas) |
| Queries N+1 | Sim | Batch loading |
| Componentes UI partilhados | 0 | 11 |
| Testabilidade | Baixa | Alta (componentes isolados) |

---

## Benefícios

1. **Manutenção**: Cada ficheiro tem responsabilidade única
2. **Performance**: Queries otimizadas com batch loading
3. **Reutilização**: Helpers e UI components partilhados
4. **Escalabilidade**: Fácil adicionar novas funcionalidades
5. **Testabilidade**: Componentes isolados podem ser testados unitariamente
