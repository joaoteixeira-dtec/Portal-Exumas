/**
 * PipelinePage.jsx
 * Página standalone do Pipeline de encomendas.
 * Design moderno com header melhorado e estatísticas.
 */

import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useOrders } from '../hooks/useOrders'
import { useClients } from '../hooks/useCommon'
import { useAuth } from '../contexts/AuthProvider'
import Pipeline from './Gestor/components/Pipeline'
import { isCancelledStatus, isDeliveredStatus, isBulkSubOrder, isBulkBatchOrder } from '../lib/orderHelpers'

export default function PipelinePage() {
  const qc = useQueryClient()
  const { profile } = useAuth()
  const [isRefreshing, setIsRefreshing] = useState(false)
  
  const ordersQ = useOrders()
  const all = useMemo(() => ordersQ.data || [], [ordersQ.data])
  const clientsAll = useClients().data || []

  const clientUsernameById = useMemo(() => {
    const map = {}
    for (const c of (clientsAll || [])) {
      if (!c?.id) continue
      map[c.id] = c.username || ''
    }
    return map
  }, [clientsAll])

  // Quick stats
  const stats = useMemo(() => {
    const active = all.filter(o => 
      !isDeliveredStatus(o.status) && 
      !isCancelledStatus(o.status) && 
      !isBulkSubOrder(o) && 
      !isBulkBatchOrder(o)
    )
    
    const today = new Date().toISOString().slice(0, 10)
    const forToday = active.filter(o => (o.date || '').slice(0, 10) === today).length
    
    const now = Date.now()
    const overdue = active.filter(o => {
      const d = o.date ? new Date(o.date + 'T23:59:59').getTime() : null
      return d && d < now
    }).length
    
    return { total: active.length, forToday, overdue }
  }, [all])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await qc.invalidateQueries({ queryKey: ['orders'] })
    setTimeout(() => setIsRefreshing(false), 600)
  }

  return (
    <div className="pipeline-page">
      {/* Background */}
      <div className="pipeline-bg">
        <div className="pipeline-gradient" />
      </div>

      {/* Header */}
      <header className="pipeline-header">
        <div className="pipeline-header__left">
          <h1>
            <span className="pipeline-header__icon">📦</span>
            Pipeline de Encomendas
          </h1>
          <p>Gestão e acompanhamento de todas as encomendas</p>
        </div>
        
        <div className="pipeline-header__stats">
          <div className="pipeline-stat">
            <span className="pipeline-stat__value">{stats.total}</span>
            <span className="pipeline-stat__label">Ativas</span>
          </div>
          <div className="pipeline-stat">
            <span className="pipeline-stat__value">{stats.forToday}</span>
            <span className="pipeline-stat__label">Para Hoje</span>
          </div>
          {stats.overdue > 0 && (
            <div className="pipeline-stat pipeline-stat--danger">
              <span className="pipeline-stat__value">{stats.overdue}</span>
              <span className="pipeline-stat__label">Atrasadas</span>
            </div>
          )}
        </div>

        <button 
          className={`btn-refresh-modern ${isRefreshing ? 'is-refreshing' : ''}`}
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <svg className="refresh-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/>
            <path d="M21 3v5h-5"/>
          </svg>
          <span>{isRefreshing ? 'Atualizando...' : 'Atualizar'}</span>
        </button>
      </header>

      {/* Pipeline Content */}
      <div className="pipeline-content">
        <Pipeline
          orders={all}
          clientUsernameById={clientUsernameById}
          profile={profile}
        />
      </div>
    </div>
  )
}
