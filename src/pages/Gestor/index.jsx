/**
 * Gestor/index.jsx
 * Componente principal refatorizado - gerencia tabs e estado global.
 * Sub-componentes: Pipeline, ClientHub, OrderForm
 */

import { useState, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useOrders } from '../../hooks/useOrders'
import { useClients } from '../../hooks/useCommon'
import { useAuth } from '../../contexts/AuthProvider'
import { useWarehouse } from '../../contexts/WarehouseContext'
import { Tabs } from '../../components/ui/index.jsx'

// Sub-componentes
import Pipeline from './components/Pipeline'
import ClientHub from './components/ClientHub'
import OrderForm from './components/OrderForm'

// ==================== MAIN COMPONENT ====================

export default function Gestor() {
  const qc = useQueryClient()
  const [tab, setTab] = useState('pipeline')
  const { profile, user } = useAuth()

  // Data global
  const { filterByWarehouse } = useWarehouse() || {}
  const ordersQ = useOrders()
  const allRaw = useMemo(() => ordersQ.data || [], [ordersQ.data])
  const all = useMemo(() => filterByWarehouse ? filterByWarehouse(allRaw) : allRaw, [allRaw, filterByWarehouse])
  const clientsAll = useClients().data || []

  // Map clientId -> username para mostrar nome curto no Pipeline
  const clientUsernameById = useMemo(() => {
    const map = {}
    for (const c of (clientsAll || [])) {
      if (!c?.id) continue
      map[c.id] = c.username || ''
    }
    return map
  }, [clientsAll])

  // Tabs config
  const tabs = [
    { id: 'pipeline', label: '📦 Pipeline' },
    { id: 'clientes', label: '👥 Clientes' },
    { id: 'nova', label: '➕ Nova Encomenda' },
  ]

  return (
    <div className="gestor-page">
      <div className="toolbar">
        <h2>🎯 Gestão</h2>
        <button className="btn-ghost" onClick={() => qc.invalidateQueries({ queryKey: ['orders'] })}>
          🔄 Atualizar
        </button>
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'pipeline' && (
        <Pipeline
          orders={all}
          clientUsernameById={clientUsernameById}
          profile={profile}
        />
      )}

      {tab === 'clientes' && (
        <ClientHub
          clients={clientsAll.filter(u => u.role === 'cliente' && String(u.active) !== 'false')}
          orders={all}
        />
      )}

      {tab === 'nova' && (
        <OrderForm
          clients={clientsAll.filter(u => u.role === 'cliente' && String(u.active) !== 'false')}
          profile={profile}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ['orders'] })
            setTab('pipeline')
          }}
        />
      )}
    </div>
  )
}
