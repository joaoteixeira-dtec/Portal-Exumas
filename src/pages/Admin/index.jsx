/**
 * Admin.jsx
 * Dashboard operacional completo para o diretor da empresa.
 * Permite monitorizar toda a operação e intervir quando necessário.
 */

import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { collection, getDocs, addDoc, updateDoc, doc, query, where, orderBy } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useOrders } from '../../hooks/useOrders'
import {
  Modal, StatCard, Badge, Tabs, Pagination, EmptyState, ProgressBar
} from '../../components/ui/index.jsx'
import {
  ORDER_STATUS, statusBadge, fmtDate, CARRIERS, ROLES
} from '../../lib/utils'
import {
  isCancelledStatus, isDeliveredStatus, isInTransitStatus, isInWarehouseStatus,
  getClientName, orderNoLabel, orderTotalValue, getOrderDate, itemsOf,
  fmtDateShort, fmtDateFull
} from '../../lib/orderHelpers'
import { useLocationsIndex, useContractsIndex } from '../../lib/useFirestoreIndexes'
import { PERMISSION_GROUPS } from '../../config/permissions'

// ==================== CONSTANTS ====================

const STATUS_COLORS = {
  ESPERA: '#f59e0b',
  PREP: '#3b82f6',
  FALTAS: '#ef4444',
  A_FATURAR: '#8b5cf6',
  A_EXPEDIR: '#06b6d4',
  EMROTA: '#10b981',
  EXPEDIDA: '#10b981',
  ENTREGUE: '#22c55e',
  NAOENTREGUE: '#ef4444',
  CANCELADA: '#6b7280'
}

const TAB_CONFIG = [
  { id: 'overview', label: '📊 Visão Geral' },
  { id: 'pipeline', label: '📦 Pipeline' },
  { id: 'warehouse', label: '🏭 Armazém' },
  { id: 'delivery', label: '🚚 Entregas' },
  { id: 'users', label: '👥 Utilizadores' },
  { id: 'permissions', label: '🔐 Permissões' },
]

// ==================== MAIN COMPONENT ====================

export default function Admin() {
  const qc = useQueryClient()
  const [tab, setTab] = useState('overview')

  // Data
  const ordersQ = useOrders()
  const allOrders = useMemo(() => ordersQ.data || [], [ordersQ.data])
  const locationsIndex = useLocationsIndex().data || {}
  const contractsIndex = useContractsIndex().data || {}

  // Users
  const usersQ = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const s = await getDocs(collection(db, 'users'))
      return s.docs.map(d => ({ id: d.id, ...d.data() }))
    }
  })
  const allUsers = useMemo(() => usersQ.data || [], [usersQ.data])

  // Routes
  const routesQ = useQuery({
    queryKey: ['routes-today'],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10)
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      const snap = await getDocs(query(
        collection(db, 'routes'),
        where('date', '>=', weekAgo),
        orderBy('date', 'desc')
      ))
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    }
  })
  const routes = useMemo(() => routesQ.data || [], [routesQ.data])

  return (
    <div className="admin-dashboard" style={{ padding: '24px', maxWidth: '1600px', margin: '0 auto' }}>
      {/* Header moderno */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px'
      }}>
        <div>
          <h1 style={{ 
            margin: 0, 
            fontSize: '28px', 
            fontWeight: 700,
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            Painel de Controlo
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '14px', color: 'var(--ui-text-dim)' }}>
            Monitorização e gestão operacional
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: '24px'
          }}>
            <span style={{ 
              width: '8px', height: '8px', 
              background: '#10b981', 
              borderRadius: '50%',
              animation: 'pulse 2s infinite'
            }} />
            <span style={{ fontWeight: 600, color: '#10b981' }}>
              {allOrders.filter(o => !isCancelledStatus(o.status) && !isDeliveredStatus(o.status)).length} ativas
            </span>
          </div>
          <button 
            className="btn-ghost" 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '8px',
              background: 'var(--ui-card)',
              border: '1px solid var(--ui-border)'
            }}
            onClick={() => {
              qc.invalidateQueries({ queryKey: ['orders'] })
              qc.invalidateQueries({ queryKey: ['users'] })
              qc.invalidateQueries({ queryKey: ['routes-today'] })
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
            Atualizar
          </button>
        </div>
      </div>

      {/* Tabs modernos */}
      <div style={{
        display: 'flex',
        gap: '4px',
        padding: '4px',
        background: 'var(--ui-card)',
        borderRadius: '12px',
        marginBottom: '24px',
        border: '1px solid var(--ui-border)'
      }}>
        {TAB_CONFIG.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1,
              padding: '12px 16px',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500,
              transition: 'all 0.2s',
              background: tab === t.id 
                ? 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)' 
                : 'transparent',
              color: tab === t.id ? 'white' : 'var(--ui-text-dim)',
              boxShadow: tab === t.id ? '0 4px 12px rgba(59, 130, 246, 0.3)' : 'none'
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <OverviewTab
          orders={allOrders}
          users={allUsers}
          routes={routes}
          locationsIndex={locationsIndex}
          contractsIndex={contractsIndex}
        />
      )}

      {tab === 'pipeline' && (
        <PipelineTab
          orders={allOrders}
          locationsIndex={locationsIndex}
          contractsIndex={contractsIndex}
        />
      )}

      {tab === 'warehouse' && (
        <WarehouseTab
          orders={allOrders}
          locationsIndex={locationsIndex}
          contractsIndex={contractsIndex}
        />
      )}

      {tab === 'delivery' && (
        <DeliveryTab
          orders={allOrders}
          routes={routes}
          locationsIndex={locationsIndex}
          contractsIndex={contractsIndex}
        />
      )}

      {tab === 'users' && (
        <UsersTab users={allUsers} />
      )}

      {tab === 'permissions' && (
        <PermissionsTab users={allUsers} />
      )}
    </div>
  )
}

// ==================== OVERVIEW TAB ====================

function OverviewTab({ orders, users, routes, locationsIndex, contractsIndex }) {
  // Estatísticas globais
  const stats = useMemo(() => {
    const active = orders.filter(o => !isCancelledStatus(o.status) && !isDeliveredStatus(o.status))
    const delivered = orders.filter(o => isDeliveredStatus(o.status))
    const cancelled = orders.filter(o => isCancelledStatus(o.status))

    // Por status
    const byStatus = {}
    for (const o of orders) {
      const s = o.status || 'UNKNOWN'
      byStatus[s] = (byStatus[s] || 0) + 1
    }

    // Hoje
    const today = new Date().toISOString().slice(0, 10)
    const todayOrders = orders.filter(o => (o.date || '').slice(0, 10) === today)
    const todayDelivered = todayOrders.filter(o => isDeliveredStatus(o.status))

    // Esta semana
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const weekOrders = orders.filter(o => (o.date || '').slice(0, 10) >= weekAgo)

    // Faturação
    const totalValue = delivered.reduce((s, o) => s + orderTotalValue(o), 0)
    const weekValue = weekOrders.filter(o => isDeliveredStatus(o.status)).reduce((s, o) => s + orderTotalValue(o), 0)

    // Tempo médio de preparação (mock - seria calculado com eventos reais)
    const avgPrepTime = '2.5h'

    return {
      total: orders.length,
      active: active.length,
      delivered: delivered.length,
      cancelled: cancelled.length,
      byStatus,
      todayOrders: todayOrders.length,
      todayDelivered: todayDelivered.length,
      weekOrders: weekOrders.length,
      totalValue,
      weekValue,
      avgPrepTime
    }
  }, [orders])

  // Alertas
  const alerts = useMemo(() => {
    const list = []
    const now = Date.now()
    const dayMs = 24 * 60 * 60 * 1000

    // Encomendas paradas há mais de 24h em ESPERA
    const stuckEspera = orders.filter(o => {
      if (o.status !== 'ESPERA') return false
      const d = getOrderDate(o)
      return d && (now - d.getTime()) > dayMs
    })
    if (stuckEspera.length > 0) {
      list.push({
        type: 'warning',
        title: `${stuckEspera.length} encomenda(s) parada(s) há +24h`,
        message: 'Existem encomendas em espera há mais de 24 horas.'
      })
    }

    // Faltas pendentes
    const faltas = orders.filter(o => o.status === 'FALTAS')
    if (faltas.length > 0) {
      list.push({
        type: 'error',
        title: `${faltas.length} encomenda(s) com faltas`,
        message: 'Aguardam reposição de produto.'
      })
    }

    // Rotas de hoje sem motorista
    const today = new Date().toISOString().slice(0, 10)
    const todayRoutes = routes.filter(r => r.date === today)
    const unassignedRoutes = todayRoutes.filter(r => !r.driverId)
    if (unassignedRoutes.length > 0) {
      list.push({
        type: 'warning',
        title: `${unassignedRoutes.length} rota(s) de hoje sem motorista`,
        message: 'Atribua motoristas às rotas.'
      })
    }

    return list
  }, [orders, routes])

  // Top clientes (por volume)
  const topClients = useMemo(() => {
    const byClient = {}
    for (const o of orders.filter(o => isDeliveredStatus(o.status))) {
      const name = o.clientName || 'Desconhecido'
      byClient[name] = (byClient[name] || 0) + orderTotalValue(o)
    }
    return Object.entries(byClient)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, value]) => ({ name, value }))
  }, [orders])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Alertas modernos */}
      {alerts.length > 0 && (
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {alerts.map((alert, i) => (
            <div
              key={i}
              style={{
                flex: '1 1 280px',
                padding: '16px 20px',
                borderRadius: '12px',
                background: alert.type === 'error' 
                  ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(239, 68, 68, 0.05))'
                  : 'linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(245, 158, 11, 0.05))',
                border: `1px solid ${alert.type === 'error' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px'
              }}
            >
              <span style={{ 
                fontSize: '20px',
                width: '36px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '10px',
                background: alert.type === 'error' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)'
              }}>
                {alert.type === 'error' ? '⚠️' : '⏰'}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ 
                  fontWeight: 600, 
                  fontSize: '14px',
                  color: alert.type === 'error' ? '#f87171' : '#fbbf24',
                  marginBottom: '4px'
                }}>
                  {alert.title}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--ui-text-dim)' }}>
                  {alert.message}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* KPIs principais - Grid moderno */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', 
        gap: '16px' 
      }}>
        {/* Encomendas Ativas */}
        <div style={{
          background: 'var(--ui-card)',
          border: '1px solid var(--ui-border)',
          borderRadius: '16px',
          padding: '20px',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{
            position: 'absolute',
            top: '-20px',
            right: '-20px',
            width: '100px',
            height: '100px',
            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2), transparent)',
            borderRadius: '50%'
          }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px'
            }}>📦</div>
            <span style={{ fontSize: '13px', color: 'var(--ui-text-dim)', fontWeight: 500 }}>
              Encomendas Ativas
            </span>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: '#3b82f6' }}>
            {stats.active}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--ui-text-dim)', marginTop: '4px' }}>
            <span style={{ color: '#10b981' }}>+{stats.todayOrders}</span> novas hoje
          </div>
        </div>

        {/* Entregues */}
        <div style={{
          background: 'var(--ui-card)',
          border: '1px solid var(--ui-border)',
          borderRadius: '16px',
          padding: '20px',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{
            position: 'absolute',
            top: '-20px',
            right: '-20px',
            width: '100px',
            height: '100px',
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), transparent)',
            borderRadius: '50%'
          }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #10b981, #059669)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px'
            }}>✅</div>
            <span style={{ fontSize: '13px', color: 'var(--ui-text-dim)', fontWeight: 500 }}>
              Entregues
            </span>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: '#10b981' }}>
            {stats.delivered}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--ui-text-dim)', marginTop: '4px' }}>
            <span style={{ color: '#10b981' }}>{stats.todayDelivered}</span> concluídas hoje
          </div>
        </div>

        {/* Faturação */}
        <div style={{
          background: 'var(--ui-card)',
          border: '1px solid var(--ui-border)',
          borderRadius: '16px',
          padding: '20px',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{
            position: 'absolute',
            top: '-20px',
            right: '-20px',
            width: '100px',
            height: '100px',
            background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), transparent)',
            borderRadius: '50%'
          }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px'
            }}>💰</div>
            <span style={{ fontSize: '13px', color: 'var(--ui-text-dim)', fontWeight: 500 }}>
              Faturação Semanal
            </span>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: '#8b5cf6' }}>
            {stats.weekValue.toLocaleString('pt-PT')}€
          </div>
          <div style={{ fontSize: '12px', color: 'var(--ui-text-dim)', marginTop: '4px' }}>
            {stats.weekOrders} encomendas
          </div>
        </div>

        {/* Taxa de Sucesso */}
        <div style={{
          background: 'var(--ui-card)',
          border: '1px solid var(--ui-border)',
          borderRadius: '16px',
          padding: '20px',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{
            position: 'absolute',
            top: '-20px',
            right: '-20px',
            width: '100px',
            height: '100px',
            background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.2), transparent)',
            borderRadius: '50%'
          }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #06b6d4, #0891b2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px'
            }}>📈</div>
            <span style={{ fontSize: '13px', color: 'var(--ui-text-dim)', fontWeight: 500 }}>
              Taxa de Sucesso
            </span>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: '#06b6d4' }}>
            {stats.total > 0 ? ((stats.delivered / (stats.delivered + stats.cancelled)) * 100).toFixed(0) : 0}%
          </div>
          <div style={{ fontSize: '12px', color: 'var(--ui-text-dim)', marginTop: '4px' }}>
            {stats.cancelled} canceladas
          </div>
        </div>
      </div>

      {/* Charts e Top Clientes */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '20px' }}>
        {/* Distribuição por Estado */}
        <div style={{
          background: 'var(--ui-card)',
          border: '1px solid var(--ui-border)',
          borderRadius: '16px',
          padding: '24px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
              📊 Distribuição por Estado
            </h3>
            <span style={{ fontSize: '12px', color: 'var(--ui-text-dim)' }}>
              {stats.total - stats.cancelled} encomendas
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {Object.entries(stats.byStatus)
              .filter(([s]) => !isCancelledStatus(s))
              .sort((a, b) => b[1] - a[1])
              .map(([status, count]) => {
                const pct = ((count / (stats.total - stats.cancelled)) * 100).toFixed(0)
                const color = STATUS_COLORS[status] || '#6b7280'
                return (
                  <div key={status}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span dangerouslySetInnerHTML={{ __html: statusBadge({ status }) }} />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '13px', color: 'var(--ui-text-dim)' }}>{pct}%</span>
                        <span style={{ fontWeight: 600, fontSize: '15px', minWidth: '30px', textAlign: 'right' }}>{count}</span>
                      </div>
                    </div>
                    <div style={{
                      height: '8px',
                      background: 'rgba(255,255,255,0.05)',
                      borderRadius: '4px',
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        width: `${pct}%`,
                        height: '100%',
                        background: `linear-gradient(90deg, ${color}, ${color}88)`,
                        borderRadius: '4px',
                        transition: 'width 0.5s ease'
                      }} />
                    </div>
                  </div>
                )
              })}
          </div>
        </div>

        {/* Top Clientes */}
        <div style={{
          background: 'var(--ui-card)',
          border: '1px solid var(--ui-border)',
          borderRadius: '16px',
          padding: '24px'
        }}>
          <h3 style={{ margin: '0 0 20px', fontSize: '16px', fontWeight: 600 }}>
            🏆 Top 5 Clientes
          </h3>
          {topClients.length === 0 ? (
            <p style={{ color: 'var(--ui-text-dim)', textAlign: 'center', padding: '20px' }}>Sem dados</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {topClients.map((c, i) => (
                <div 
                  key={i} 
                  style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    padding: '12px 16px',
                    background: i === 0 ? 'rgba(251, 191, 36, 0.1)' : 'rgba(255,255,255,0.02)',
                    borderRadius: '10px',
                    border: i === 0 ? '1px solid rgba(251, 191, 36, 0.3)' : '1px solid transparent'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ 
                      width: '28px',
                      height: '28px',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      fontWeight: 700,
                      background: i === 0 ? 'linear-gradient(135deg, #fbbf24, #f59e0b)' :
                                 i === 1 ? 'linear-gradient(135deg, #9ca3af, #6b7280)' :
                                 i === 2 ? 'linear-gradient(135deg, #d97706, #b45309)' :
                                 'rgba(255,255,255,0.1)',
                      color: i < 3 ? 'white' : 'var(--ui-text-dim)'
                    }}>
                      {i + 1}
                    </span>
                    <span style={{ fontSize: '14px', fontWeight: 500 }}>{c.name}</span>
                  </div>
                  <span style={{ 
                    fontWeight: 600, 
                    color: '#10b981',
                    fontSize: '14px'
                  }}>
                    {c.value.toLocaleString('pt-PT')}€
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Equipa */}
      <div style={{
        background: 'var(--ui-card)',
        border: '1px solid var(--ui-border)',
        borderRadius: '16px',
        padding: '24px'
      }}>
        <h3 style={{ margin: '0 0 20px', fontSize: '16px', fontWeight: 600 }}>
          👥 Equipa Ativa
        </h3>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', 
          gap: '12px' 
        }}>
          {Object.entries(ROLES).map(([key, role]) => {
            const count = users.filter(u => u.role === role && u.active !== false).length
            const colors = {
              admin: '#8b5cf6',
              gestor: '#3b82f6',
              armazem: '#f59e0b',
              compras: '#10b981',
              rotas: '#06b6d4',
              faturacao: '#ec4899',
              cliente: '#6366f1',
              motorista: '#ef4444'
            }
            return (
              <div 
                key={key} 
                style={{ 
                  textAlign: 'center', 
                  padding: '16px 12px',
                  background: `linear-gradient(135deg, ${colors[role] || '#6b7280'}15, transparent)`,
                  borderRadius: '12px',
                  border: `1px solid ${colors[role] || '#6b7280'}30`
                }}
              >
                <div style={{ 
                  fontSize: '28px', 
                  fontWeight: 700,
                  color: colors[role] || '#6b7280'
                }}>{count}</div>
                <div style={{ 
                  fontSize: '12px', 
                  color: 'var(--ui-text-dim)', 
                  textTransform: 'capitalize',
                  marginTop: '4px',
                  fontWeight: 500
                }}>{role}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ==================== PIPELINE TAB ====================

function PipelineTab({ orders, locationsIndex, contractsIndex }) {
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [detailOrder, setDetailOrder] = useState(null)

  const qc = useQueryClient()

  // Filtrar encomendas
  const filtered = useMemo(() => {
    let list = orders.filter(o => !isCancelledStatus(o.status))

    if (statusFilter !== 'all') {
      list = list.filter(o => o.status === statusFilter)
    }

    if (search.trim()) {
      const s = search.toLowerCase()
      list = list.filter(o => {
        const cName = contractsIndex[o.contractId]?.nome || ''
        const lName = locationsIndex[o.locationId]?.nome || ''
        const no = orderNoLabel(o)
        return `${o.clientName} ${cName} ${lName} ${no}`.toLowerCase().includes(s)
      })
    }

    return list.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  }, [orders, statusFilter, search, contractsIndex, locationsIndex])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize)

  useEffect(() => { setPage(1) }, [statusFilter, search])

  // Status counts
  const statusCounts = useMemo(() => {
    const counts = { all: 0 }
    for (const o of orders) {
      if (isCancelledStatus(o.status)) continue
      counts.all++
      counts[o.status] = (counts[o.status] || 0) + 1
    }
    return counts
  }, [orders])

  // Mutations para intervenção
  const moveMut = useMutation({
    mutationFn: async ({ id, to }) => updateDoc(doc(db, 'orders', id), { status: to }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] })
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Filtros modernos */}
      <div style={{
        background: 'var(--ui-card)',
        border: '1px solid var(--ui-border)',
        borderRadius: '16px',
        padding: '20px'
      }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <select 
            value={statusFilter} 
            onChange={e => setStatusFilter(e.target.value)}
            style={{
              padding: '10px 16px',
              borderRadius: '10px',
              border: '1px solid var(--ui-border)',
              background: 'var(--ui-bg)',
              color: 'var(--ui-text)',
              fontSize: '14px',
              minWidth: '200px'
            }}
          >
            <option value="all">Todos os estados ({statusCounts.all})</option>
            {Object.keys(ORDER_STATUS).map(s => (
              <option key={s} value={s}>
                {s} ({statusCounts[s] || 0})
              </option>
            ))}
          </select>
          <div style={{ 
            flex: 1, 
            minWidth: '250px',
            position: 'relative'
          }}>
            <svg 
              width="18" 
              height="18" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2"
              style={{
                position: 'absolute',
                left: '14px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--ui-text-dim)'
              }}
            >
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Pesquisar cliente, contrato, local..."
              style={{ 
                width: '100%',
                padding: '10px 16px 10px 44px',
                borderRadius: '10px',
                border: '1px solid var(--ui-border)',
                background: 'var(--ui-bg)',
                color: 'var(--ui-text)',
                fontSize: '14px'
              }}
            />
          </div>
          <div style={{ 
            padding: '10px 16px',
            background: 'rgba(59, 130, 246, 0.1)',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: 500,
            color: '#3b82f6'
          }}>
            {filtered.length} encomenda(s)
          </div>
        </div>
      </div>

      {/* Tabela moderna */}
      <div style={{
        background: 'var(--ui-card)',
        border: '1px solid var(--ui-border)',
        borderRadius: '16px',
        overflow: 'hidden'
      }}>
        <table className="table" style={{ marginBottom: 0 }}>
          <thead>
            <tr style={{ background: 'rgba(0,0,0,0.2)' }}>
              <th style={{ padding: '14px 16px', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ui-text-dim)' }}>N.º</th>
              <th style={{ padding: '14px 16px', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ui-text-dim)' }}>Data</th>
              <th style={{ padding: '14px 16px', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ui-text-dim)' }}>Cliente</th>
              <th style={{ padding: '14px 16px', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ui-text-dim)' }}>Contrato</th>
              <th style={{ padding: '14px 16px', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ui-text-dim)' }}>Local</th>
              <th style={{ padding: '14px 16px', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ui-text-dim)' }}>Estado</th>
              <th style={{ padding: '14px 16px', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ui-text-dim)', textAlign: 'right' }}>Valor</th>
              <th style={{ padding: '14px 16px', width: '60px' }}></th>
            </tr>
          </thead>
          <tbody>
            {paged.map((o, idx) => (
              <tr 
                key={o.id}
                style={{ 
                  background: idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.1)',
                  transition: 'background 0.2s'
                }}
              >
                <td style={{ padding: '14px 16px', fontFamily: 'monospace', fontSize: '13px' }}>{orderNoLabel(o)}</td>
                <td style={{ padding: '14px 16px', fontSize: '13px' }}>{fmtDateShort(o.date)}</td>
                <td style={{ padding: '14px 16px', fontSize: '13px', fontWeight: 500 }}>{o.clientName || '—'}</td>
                <td style={{ padding: '14px 16px', fontSize: '13px', color: 'var(--ui-text-dim)' }}>{contractsIndex[o.contractId]?.nome || '—'}</td>
                <td style={{ padding: '14px 16px', fontSize: '13px', color: 'var(--ui-text-dim)' }}>{locationsIndex[o.locationId]?.nome || '—'}</td>
                <td style={{ padding: '14px 16px' }} dangerouslySetInnerHTML={{ __html: statusBadge(o) }} />
                <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 600, color: '#10b981' }}>{orderTotalValue(o).toFixed(2)}€</td>
                <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                  <button 
                    className="btn-ghost" 
                    onClick={() => setDetailOrder(o)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      background: 'rgba(59, 130, 246, 0.1)',
                      color: '#3b82f6',
                      border: '1px solid rgba(59, 130, 246, 0.3)'
                    }}
                  >
                    Ver
                  </button>
                </td>
              </tr>
            ))}
            {paged.length === 0 && (
              <tr>
                <td colSpan="8" style={{ padding: '40px', textAlign: 'center', color: 'var(--ui-text-dim)' }}>
                  Nenhuma encomenda encontrada
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div style={{ padding: '16px', borderTop: '1px solid var(--ui-border)' }}>
          <Pagination
            page={page}
            totalPages={totalPages}
            onChange={setPage}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
          />
        </div>
      </div>

      {/* Modal de detalhe */}
      <Modal open={!!detailOrder} onClose={() => setDetailOrder(null)} title={`Encomenda ${orderNoLabel(detailOrder)}`}>
        {detailOrder && (
          <div>
            <div className="grid" style={{ marginBottom: '16px' }}>
              <div className="span-6">
                <strong>Cliente:</strong> {detailOrder.clientName || '—'}
              </div>
              <div className="span-6">
                <strong>Data:</strong> {fmtDateFull(detailOrder.date)}
              </div>
              <div className="span-6">
                <strong>Contrato:</strong> {contractsIndex[detailOrder.contractId]?.nome || '—'}
              </div>
              <div className="span-6">
                <strong>Local:</strong> {locationsIndex[detailOrder.locationId]?.nome || '—'}
              </div>
            </div>

            <h4>Produtos</h4>
            <table className="table">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Un.</th>
                  <th style={{ textAlign: 'right' }}>Qtd</th>
                  <th style={{ textAlign: 'right' }}>Preço</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {itemsOf(detailOrder).map((it, i) => (
                  <tr key={i}>
                    <td>{it.productName || it.nome || '—'}</td>
                    <td>{it.unidade || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{(+it.qty || 0).toFixed(2)}</td>
                    <td style={{ textAlign: 'right' }}>{(+it.preco || 0).toFixed(2)}€</td>
                    <td style={{ textAlign: 'right' }}>{((+it.qty || 0) * (+it.preco || 0)).toFixed(2)}€</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan="4" style={{ textAlign: 'right', fontWeight: '600' }}>Total:</td>
                  <td style={{ textAlign: 'right', fontWeight: '600' }}>{orderTotalValue(detailOrder).toFixed(2)}€</td>
                </tr>
              </tfoot>
            </table>

            <h4>Intervenção</h4>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {detailOrder.status !== 'ESPERA' && (
                <button className="btn-secondary" onClick={() => {
                  moveMut.mutate({ id: detailOrder.id, to: 'ESPERA' })
                  setDetailOrder(null)
                }}>
                  ← Voltar a ESPERA
                </button>
              )}
              {detailOrder.status === 'FALTAS' && (
                <button className="btn" onClick={() => {
                  moveMut.mutate({ id: detailOrder.id, to: 'PREP' })
                  setDetailOrder(null)
                }}>
                  Forçar para PREP
                </button>
              )}
              {!isDeliveredStatus(detailOrder.status) && (
                <button className="btn-danger" onClick={() => {
                  if (confirm('Cancelar esta encomenda?')) {
                    moveMut.mutate({ id: detailOrder.id, to: 'CANCELADA' })
                    setDetailOrder(null)
                  }
                }}>
                  Cancelar Encomenda
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

// ==================== WAREHOUSE TAB ====================

function WarehouseTab({ orders, locationsIndex, contractsIndex }) {
  // Encomendas no armazém
  const warehouseOrders = useMemo(() => {
    return orders.filter(o => isInWarehouseStatus(o.status))
  }, [orders])

  const byStatus = useMemo(() => {
    return {
      ESPERA: warehouseOrders.filter(o => o.status === 'ESPERA'),
      PREP: warehouseOrders.filter(o => o.status === 'PREP'),
      FALTAS: warehouseOrders.filter(o => o.status === 'FALTAS'),
      A_FATURAR: warehouseOrders.filter(o => o.status === 'A_FATURAR'),
    }
  }, [warehouseOrders])

  // Produtos com faltas
  const faltasProducts = useMemo(() => {
    const map = new Map()
    for (const o of byStatus.FALTAS) {
      for (const it of itemsOf(o)) {
        const missing = Math.max(0, (+it.qty || 0) - (+it.preparedQty || 0))
        if (missing > 0) {
          const key = it.productName || it.nome || 'Unknown'
          const prev = map.get(key) || { name: key, qty: 0, orders: 0 }
          prev.qty += missing
          prev.orders++
          map.set(key, prev)
        }
      }
    }
    return [...map.values()].sort((a, b) => b.qty - a.qty)
  }, [byStatus.FALTAS])

  return (
    <div>
      {/* KPIs */}
      <div className="grid" style={{ marginBottom: '24px' }}>
        <div className="span-3">
          <StatCard
            title="Em Espera"
            value={byStatus.ESPERA.length}
            color="#f59e0b"
            icon="⏳"
          />
        </div>
        <div className="span-3">
          <StatCard
            title="Em Preparação"
            value={byStatus.PREP.length}
            color="#3b82f6"
            icon="📦"
          />
        </div>
        <div className="span-3">
          <StatCard
            title="Com Faltas"
            value={byStatus.FALTAS.length}
            color="#ef4444"
            icon="⚠️"
          />
        </div>
        <div className="span-3">
          <StatCard
            title="A Faturar"
            value={byStatus.A_FATURAR.length}
            color="#8b5cf6"
            icon="📄"
          />
        </div>
      </div>

      <div className="grid">
        {/* Kanban simplificado */}
        <div className="span-8">
          <div className="card">
            <h4 style={{ margin: '0 0 16px' }}>📋 Encomendas no Armazém</h4>
            <table className="table">
              <thead>
                <tr>
                  <th>N.º</th>
                  <th>Cliente</th>
                  <th>Data</th>
                  <th>Estado</th>
                  <th>Itens</th>
                </tr>
              </thead>
              <tbody>
                {warehouseOrders.slice(0, 20).map(o => (
                  <tr key={o.id}>
                    <td style={{ fontFamily: 'monospace' }}>{orderNoLabel(o)}</td>
                    <td>{o.clientName || '—'}</td>
                    <td>{fmtDateShort(o.date)}</td>
                    <td dangerouslySetInnerHTML={{ __html: statusBadge(o) }} />
                    <td>{itemsOf(o).length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {warehouseOrders.length > 20 && (
              <p style={{ textAlign: 'center', color: '#666', margin: '16px 0 0' }}>
                +{warehouseOrders.length - 20} mais...
              </p>
            )}
          </div>
        </div>

        {/* Produtos com faltas */}
        <div className="span-4">
          <div className="card">
            <h4 style={{ margin: '0 0 16px' }}>⚠️ Produtos em Falta</h4>
            {faltasProducts.length === 0 ? (
              <EmptyState
                title="Sem faltas"
                message="Todos os produtos estão disponíveis."
                icon="✅"
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {faltasProducts.slice(0, 10).map((p, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '8px',
                    background: '#fef2f2',
                    borderRadius: '4px'
                  }}>
                    <span style={{ fontSize: '13px' }}>{p.name}</span>
                    <Badge color="red">{p.qty.toFixed(1)} un ({p.orders})</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ==================== DELIVERY TAB ====================

function DeliveryTab({ orders, routes, locationsIndex, contractsIndex }) {
  const today = new Date().toISOString().slice(0, 10)

  // Encomendas em entrega
  const inTransit = useMemo(() => {
    return orders.filter(o => isInTransitStatus(o.status))
  }, [orders])

  const aExpedir = useMemo(() => {
    return orders.filter(o => o.status === 'A_EXPEDIR')
  }, [orders])

  // Rotas de hoje
  const todayRoutes = useMemo(() => {
    return routes.filter(r => r.date === today)
  }, [routes, today])

  // Entregas de hoje
  const todayDelivered = useMemo(() => {
    return orders.filter(o => {
      if (!isDeliveredStatus(o.status)) return false
      // Verificar se foi entregue hoje (pelo deliveredAt ou updatedAt)
      const dAt = o.deliveredAt || o.updatedAt || ''
      return dAt.slice(0, 10) === today
    })
  }, [orders, today])

  return (
    <div>
      {/* KPIs */}
      <div className="grid" style={{ marginBottom: '24px' }}>
        <div className="span-3">
          <StatCard
            title="A Expedir"
            value={aExpedir.length}
            subtitle="Aguardam atribuição de rota"
            color="#06b6d4"
            icon="📤"
          />
        </div>
        <div className="span-3">
          <StatCard
            title="Em Entrega"
            value={inTransit.length}
            subtitle="Motoristas na estrada"
            color="#10b981"
            icon="🚚"
          />
        </div>
        <div className="span-3">
          <StatCard
            title="Rotas Hoje"
            value={todayRoutes.length}
            color="#8b5cf6"
            icon="🗓️"
          />
        </div>
        <div className="span-3">
          <StatCard
            title="Entregues Hoje"
            value={todayDelivered.length}
            color="#22c55e"
            icon="✅"
          />
        </div>
      </div>

      <div className="grid">
        {/* Rotas de hoje */}
        <div className="span-6 card">
          <h4 style={{ margin: '0 0 16px' }}>🗓️ Rotas de Hoje</h4>
          {todayRoutes.length === 0 ? (
            <EmptyState
              title="Sem rotas"
              message="Não há rotas planeadas para hoje."
              icon="📅"
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {todayRoutes.map(r => (
                <div key={r.id} style={{
                  padding: '12px',
                  background: 'var(--ui-bg)',
                  borderRadius: '8px',
                  border: '1px solid var(--ui-border)',
                  borderLeft: `4px solid ${r.status === 'started' ? '#10b981' : '#3b82f6'}`
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <strong style={{ color: 'var(--ui-text)' }}>{r.vehicle || 'Veículo não definido'}</strong>
                    <Badge color={r.status === 'started' ? 'green' : 'blue'}>
                      {r.status === 'started' ? 'Em curso' : 'Planeada'}
                    </Badge>
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--ui-text-dim)' }}>
                    Motorista: {r.driverName || 'Não atribuído'}
                    {r.time && ` • ${r.time}`}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--ui-text-dim)', opacity: 0.7, marginTop: '4px' }}>
                    {(r.orderIds || []).length} encomenda(s)
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Encomendas em entrega */}
        <div className="span-6 card">
          <h4 style={{ margin: '0 0 16px' }}>🚚 Em Entrega</h4>
          {inTransit.length === 0 ? (
            <EmptyState
              title="Nenhuma em entrega"
              message="Não há encomendas em trânsito."
              icon="📦"
            />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>N.º</th>
                  <th>Cliente</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {inTransit.slice(0, 10).map(o => (
                  <tr key={o.id}>
                    <td style={{ fontFamily: 'monospace' }}>{orderNoLabel(o)}</td>
                    <td>{o.clientName || '—'}</td>
                    <td dangerouslySetInnerHTML={{ __html: statusBadge(o) }} />
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

// ==================== USERS TAB ====================

function UsersTab({ users }) {
  const qc = useQueryClient()
  const [tab, setTab] = useState('staff')
  const [search, setSearch] = useState('')
  const [newUser, setNewUser] = useState({ name: '', username: '', role: 'gestor', active: true })
  const [editUser, setEditUser] = useState(null)

  // Separar clientes de funcionários
  const staff = useMemo(() => users.filter(u => u.role !== 'cliente'), [users])
  const clients = useMemo(() => users.filter(u => u.role === 'cliente'), [users])

  const filtered = useMemo(() => {
    const list = tab === 'staff' ? staff : clients
    if (!search.trim()) return list
    const s = search.toLowerCase()
    return list.filter(u =>
      `${u.name} ${u.username} ${u.email}`.toLowerCase().includes(s)
    )
  }, [tab, staff, clients, search])

  // Mutations
  const addUserMut = useMutation({
    mutationFn: async () => addDoc(collection(db, 'users'), { ...newUser, createdAt: new Date().toISOString() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      setNewUser({ name: '', username: '', role: 'gestor', active: true })
    }
  })

  const updateUserMut = useMutation({
    mutationFn: async ({ id, data }) => updateDoc(doc(db, 'users', id), data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      setEditUser(null)
    }
  })

  const toggleActiveMut = useMutation({
    mutationFn: async ({ id, active }) => updateDoc(doc(db, 'users', id), { active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] })
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Sub-tabs */}
      <div style={{ 
        display: 'flex', 
        gap: '8px',
        padding: '4px',
        background: 'var(--ui-card)',
        borderRadius: '10px',
        border: '1px solid var(--ui-border)',
        width: 'fit-content'
      }}>
        <button
          onClick={() => setTab('staff')}
          style={{
            padding: '10px 20px',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 500,
            transition: 'all 0.2s',
            background: tab === 'staff' ? 'rgba(255,255,255,0.1)' : 'transparent',
            color: tab === 'staff' ? 'var(--ui-text)' : 'var(--ui-text-dim)'
          }}
        >
          Funcionários ({staff.length})
        </button>
        <button
          onClick={() => setTab('clients')}
          style={{
            padding: '10px 20px',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 500,
            transition: 'all 0.2s',
            background: tab === 'clients' ? 'rgba(255,255,255,0.1)' : 'transparent',
            color: tab === 'clients' ? 'var(--ui-text)' : 'var(--ui-text-dim)'
          }}
        >
          Clientes ({clients.length})
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '20px' }}>
        {/* Lista */}
        <div style={{
          background: 'var(--ui-card)',
          border: '1px solid var(--ui-border)',
          borderRadius: '12px',
          overflow: 'hidden'
        }}>
          <div style={{ padding: '16px', borderBottom: '1px solid var(--ui-border)' }}>
            <div style={{ position: 'relative' }}>
              <svg 
                width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--ui-text-dim)', opacity: 0.5 }}
              >
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Pesquisar..."
                style={{ 
                  width: '100%',
                  padding: '8px 12px 8px 38px',
                  borderRadius: '8px',
                  border: '1px solid var(--ui-border)',
                  background: 'var(--ui-bg)',
                  color: 'var(--ui-text)',
                  fontSize: '13px'
                }}
              />
            </div>
          </div>

          <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
            {filtered.map((u, idx) => (
              <div 
                key={u.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--ui-border)',
                  background: idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.15)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid var(--ui-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '14px',
                    color: 'var(--ui-text-dim)',
                    fontWeight: 500
                  }}>
                    {(u.name || u.username || '?')[0].toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: '13px' }}>{u.name || '—'}</div>
                    <div style={{ fontSize: '11px', color: 'var(--ui-text-dim)' }}>{u.username || '—'}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    padding: '3px 8px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    fontWeight: 500,
                    textTransform: 'uppercase',
                    letterSpacing: '0.03em',
                    background: 'rgba(255,255,255,0.05)',
                    color: 'var(--ui-text-dim)',
                    border: '1px solid var(--ui-border)'
                  }}>
                    {u.role}
                  </span>
                  {u.active === false && (
                    <span style={{
                      padding: '3px 8px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontWeight: 500,
                      background: 'rgba(239, 68, 68, 0.1)',
                      color: '#ef4444'
                    }}>
                      Inativo
                    </span>
                  )}
                  <button 
                    onClick={() => setEditUser(u)}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      background: 'transparent',
                      color: 'var(--ui-text-dim)',
                      border: '1px solid var(--ui-border)',
                      cursor: 'pointer'
                    }}
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => toggleActiveMut.mutate({ id: u.id, active: u.active === false })}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      background: 'transparent',
                      color: u.active !== false ? 'var(--ui-text-dim)' : '#10b981',
                      border: '1px solid var(--ui-border)',
                      cursor: 'pointer'
                    }}
                  >
                    {u.active !== false ? 'Desativar' : 'Ativar'}
                  </button>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ui-text-dim)' }}>
                Nenhum utilizador encontrado
              </div>
            )}
          </div>
        </div>

        {/* Novo utilizador */}
        <div style={{
          background: 'var(--ui-card)',
          border: '1px solid var(--ui-border)',
          borderRadius: '12px',
          padding: '20px',
          height: 'fit-content'
        }}>
          <h4 style={{ margin: '0 0 16px', fontSize: '14px', fontWeight: 500, color: 'var(--ui-text-dim)' }}>
            Novo {tab === 'staff' ? 'Funcionário' : 'Cliente'}
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <input
              placeholder="Nome"
              value={newUser.name}
              onChange={e => setNewUser({ ...newUser, name: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid var(--ui-border)',
                background: 'var(--ui-bg)',
                color: 'var(--ui-text)',
                fontSize: '13px'
              }}
            />
            <input
              placeholder="Username"
              value={newUser.username}
              onChange={e => setNewUser({ ...newUser, username: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid var(--ui-border)',
                background: 'var(--ui-bg)',
                color: 'var(--ui-text)',
                fontSize: '13px'
              }}
            />
            {tab === 'staff' && (
              <select
                value={newUser.role}
                onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--ui-border)',
                  background: 'var(--ui-bg)',
                  color: 'var(--ui-text)',
                  fontSize: '13px'
                }}
              >
                <option value="admin">Admin</option>
                <option value="gestor">Gestor</option>
                <option value="armazem">Armazém</option>
                <option value="faturacao">Faturação</option>
                <option value="compras">Compras</option>
                <option value="rotas">Rotas</option>
                <option value="motorista">Motorista</option>
              </select>
            )}
            <button
              onClick={() => {
                if (tab === 'clients') {
                  addUserMut.mutate({ ...newUser, role: 'cliente' })
                } else {
                  addUserMut.mutate()
                }
              }}
              disabled={!newUser.name || !newUser.username}
              style={{
                padding: '10px 16px',
                borderRadius: '8px',
                border: '1px solid var(--ui-border)',
                cursor: !newUser.name || !newUser.username ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                fontWeight: 500,
                background: !newUser.name || !newUser.username 
                  ? 'rgba(255,255,255,0.02)'
                  : 'rgba(255,255,255,0.05)',
                color: !newUser.name || !newUser.username ? 'var(--ui-text-dim)' : 'var(--ui-text)',
                marginTop: '4px'
              }}
            >
              Criar
            </button>
          </div>
        </div>
      </div>

      {/* Modal editar */}
      <Modal open={!!editUser} onClose={() => setEditUser(null)} title="Editar Utilizador" maxWidth={400}>
        {editUser && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <input
              placeholder="Nome"
              value={editUser.name || ''}
              onChange={e => setEditUser({ ...editUser, name: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid var(--ui-border)',
                background: 'var(--ui-bg)',
                color: 'var(--ui-text)',
                fontSize: '13px'
              }}
            />
            <input
              placeholder="Username"
              value={editUser.username || ''}
              onChange={e => setEditUser({ ...editUser, username: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid var(--ui-border)',
                background: 'var(--ui-bg)',
                color: 'var(--ui-text)',
                fontSize: '13px'
              }}
            />
            <input
              placeholder="Email"
              value={editUser.email || ''}
              onChange={e => setEditUser({ ...editUser, email: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid var(--ui-border)',
                background: 'var(--ui-bg)',
                color: 'var(--ui-text)',
                fontSize: '13px'
              }}
            />
            <select
              value={editUser.role}
              onChange={e => setEditUser({ ...editUser, role: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid var(--ui-border)',
                background: 'var(--ui-bg)',
                color: 'var(--ui-text)',
                fontSize: '13px'
              }}
            >
              <option value="admin">Admin</option>
              <option value="gestor">Gestor</option>
              <option value="cliente">Cliente</option>
              <option value="armazem">Armazém</option>
              <option value="faturacao">Faturação</option>
              <option value="compras">Compras</option>
              <option value="rotas">Rotas</option>
              <option value="motorista">Motorista</option>
            </select>
            <button
              onClick={() => updateUserMut.mutate({
                id: editUser.id,
                data: {
                  name: editUser.name,
                  username: editUser.username,
                  email: editUser.email,
                  role: editUser.role
                }
              })}
              style={{
                padding: '10px 16px',
                borderRadius: '8px',
                border: '1px solid var(--ui-border)',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
                background: 'rgba(255,255,255,0.05)',
                color: 'var(--ui-text)',
                marginTop: '4px'
              }}
            >
              Guardar
            </button>
          </div>
        )}
      </Modal>
    </div>
  )
}
// ==================== PERMISSIONS TAB ====================

function PermissionsTab({ users }) {
  const qc = useQueryClient()
  const [selectedUser, setSelectedUser] = useState(null)
  const [expanded, setExpanded] = useState({})
  const [userType, setUserType] = useState('staff') // 'staff' ou 'clients'
  const [pendingPermissions, setPendingPermissions] = useState(null) // Track unsaved changes

  const updatePermissionsMut = useMutation({
    mutationFn: async ({ userId, customPermissions }) => 
      updateDoc(doc(db, 'users', userId), { customPermissions }),
    onSuccess: (_, { userId, customPermissions }) => {
      setPendingPermissions(null) // Clear pending changes
      
      // Update the selectedUser immediately with new permissions
      setSelectedUser(prev => prev && prev.id === userId 
        ? { ...prev, customPermissions } 
        : prev
      )
      
      // Refetch users list
      qc.invalidateQueries({ queryKey: ['users'] })
    }
  })

  // Reset pending changes when switching users
  useEffect(() => {
    setPendingPermissions(null)
  }, [selectedUser?.id])

  const togglePermission = (userId, permission) => {
    const currentPerms = pendingPermissions || selectedUser.customPermissions || []
    const updated = currentPerms.includes(permission) 
      ? currentPerms.filter(p => p !== permission)
      : [...currentPerms, permission]
    
    setPendingPermissions(updated)
  }

  const savePermissions = async () => {
    if (!selectedUser || pendingPermissions === null) return
    
    updatePermissionsMut.mutate({ 
      userId: selectedUser.id, 
      customPermissions: pendingPermissions 
    })
  }

  const cancelChanges = () => {
    setPendingPermissions(null)
  }

  const hasChanges = pendingPermissions !== null &&
    JSON.stringify(pendingPermissions) !== JSON.stringify(selectedUser.customPermissions || [])

  const toggleGroup = (groupId) => {
    setExpanded(prev => ({ ...prev, [groupId]: !prev[groupId] }))
  }

  // Separar clientes de funcionários
  const staffUsers = users.filter(u => u.role !== 'cliente')
  const clientUsers = users.filter(u => u.role === 'cliente')
  const activeUsers = userType === 'staff' ? staffUsers : clientUsers

  if (!selectedUser) {
    return (
      <div>
        {/* Filtro de Tipo de Utilizador */}
        <div className="card" style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontWeight: 600 }}>Filtrar por:</span>
            <button
              className={userType === 'staff' ? 'btn' : 'btn-secondary'}
              onClick={() => setUserType('staff')}
              style={{ flex: 1 }}
            >
              👷 Funcionários ({staffUsers.length})
            </button>
            <button
              className={userType === 'clients' ? 'btn' : 'btn-secondary'}
              onClick={() => setUserType('clients')}
              style={{ flex: 1 }}
            >
              🛍️ Clientes ({clientUsers.length})
            </button>
          </div>
        </div>

        {/* Lista de Utilizadores */}
        <div className="card">
          {activeUsers.length === 0 ? (
            <div className="muted" style={{ textAlign: 'center', padding: '20px' }}>
              Nenhum utilizador neste grupo
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '8px' }}>
              {activeUsers.map(u => (
                <button
                  key={u.id}
                  className="btn-secondary"
                  onClick={() => setSelectedUser(u)}
                  style={{
                    padding: '12px',
                    textAlign: 'left',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderRadius: '8px',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.transform = 'translateX(4px)'}
                  onMouseLeave={(e) => e.currentTarget.style.transform = 'translateX(0)'}
                >
                  <div>
                    <strong>{u.name || u.username}</strong>
                    <div className="muted" style={{ fontSize: '12px', marginTop: '2px' }}>
                      {u.email || u.username}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="badge" style={{ fontSize: '11px' }}>
                      {u.role}
                    </span>
                    {(u.customPermissions?.length || 0) > 0 && (
                      <span className="badge" style={{ fontSize: '11px', background: '#8b5cf6', color: 'white' }}>
                        +{u.customPermissions.length}
                      </span>
                    )}
                    <span style={{ color: '#999', fontSize: '12px' }}>→</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  const isClient = selectedUser.role === 'cliente'

  return (
    <div>
      <div className="toolbar">
        <div>
          <h3 style={{ margin: 0, marginBottom: '4px' }}>
            {isClient ? '🛍️' : '👷'} {selectedUser.name || selectedUser.username}
          </h3>
          <p className="muted" style={{ margin: 0, fontSize: '12px' }}>
            {selectedUser.email || selectedUser.username}
          </p>
        </div>
        <button className="btn-secondary" onClick={() => setSelectedUser(null)}>
          ← Voltar
        </button>
      </div>

      <div className="card" style={{ marginTop: '12px' }}>
        <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--ui-border)' }}>
          <div>
            <span className="muted" style={{ fontSize: '12px' }}>Tipo:</span>
            <div style={{ fontWeight: 600, marginTop: '2px', color: 'var(--ui-text)' }}>
              {isClient ? '🛍️ Cliente' : '👷 Funcionário'}
            </div>
          </div>
          <div>
            <span className="muted" style={{ fontSize: '12px' }}>Role:</span>
            <div style={{ fontWeight: 600, marginTop: '2px', color: 'var(--ui-text)' }}>
              {selectedUser.role}
            </div>
          </div>
          <div>
            <span className="muted" style={{ fontSize: '12px' }}>Personalizações:</span>
            <div style={{ fontWeight: 600, marginTop: '2px', color: 'var(--ui-text)' }}>
              {selectedUser.customPermissions?.length || 0}
            </div>
          </div>
        </div>

        <div style={{ padding: '16px', background: 'rgba(59,130,246,0.1)', borderRadius: '8px', marginBottom: '16px', border: '1px solid rgba(59,130,246,0.2)' }}>
          <p style={{ margin: 0, color: 'var(--ui-text-dim)', fontSize: '13px' }}>
            ℹ️ {isClient 
              ? 'Clientes normalmente têm permissões limitadas. Personalize conforme necessário.'
              : 'As permissões são combinadas com as do role + personalizações.'}
          </p>
        </div>

        {PERMISSION_GROUPS?.map(group => (
          <div key={group.id} style={{ marginBottom: '12px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--ui-border)' }}>
            <button
              className="btn-ghost"
              onClick={() => toggleGroup(group.id)}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '10px 12px',
                marginBottom: 0,
                background: 'var(--ui-bg)',
                borderBottom: expanded[group.id] ? '1px solid var(--ui-border)' : 'none',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontWeight: 500,
                color: 'var(--ui-text)'
              }}
            >
              <span>
                {expanded[group.id] ? '▼' : '▶'} {group.icon} {group.label}
              </span>
              <span className="badge" style={{ fontSize: '11px', background: 'rgba(255,255,255,0.1)', color: 'var(--ui-text-dim)' }}>
                {group.permissions?.length || 0}
              </span>
            </button>

            {expanded[group.id] && (
              <div style={{ padding: '12px', display: 'grid', gap: '8px', background: 'var(--ui-card)' }}>
                {group.permissions?.map(perm => (
                  <label
                    key={perm}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      cursor: 'pointer',
                      padding: '8px',
                      borderRadius: '6px',
                      transition: 'background 0.2s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <input
                      type="checkbox"
                      checked={(pendingPermissions || selectedUser.customPermissions || []).includes(perm)}
                      onChange={() => togglePermission(selectedUser.id, perm)}
                      disabled={updatePermissionsMut.isPending}
                      style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                    />
                    <span style={{ fontSize: '13px', fontFamily: 'monospace', color: '#a78bfa' }}>
                      {perm}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}

        {updatePermissionsMut.isPending && (
          <div style={{ marginTop: '12px', padding: '8px', background: 'rgba(59,130,246,0.15)', borderRadius: '6px', border: '1px solid rgba(59,130,246,0.3)' }}>
            <p style={{ margin: 0, fontSize: '12px', color: '#93c5fd' }}>💾 A guardar alterações...</p>
          </div>
        )}

        {hasChanges && (
          <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(251,191,36,0.1)', borderRadius: '8px', border: '1px solid rgba(251,191,36,0.3)' }}>
            <p style={{ margin: 0, fontSize: '12px', marginBottom: '10px', color: '#fbbf24' }}>
              ⚠️ Tem alterações não guardadas
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                className="btn" 
                onClick={savePermissions}
                disabled={updatePermissionsMut.isPending}
                style={{ flex: 1 }}
              >
                {updatePermissionsMut.isPending ? '💾 A guardar...' : '✓ Guardar Alterações'}
              </button>
              <button 
                className="btn-secondary" 
                onClick={cancelChanges}
                disabled={updatePermissionsMut.isPending}
              >
                ✕ Cancelar
              </button>
            </div>
          </div>
        )}

        {updatePermissionsMut.isError && (
          <div style={{ marginTop: '12px', padding: '12px', background: '#fee2e2', borderRadius: '8px', border: '1px solid #fca5a5' }}>
            <p className="muted" style={{ margin: 0, fontSize: '12px', color: '#991b1b' }}>
              ❌ Erro ao guardar: {updatePermissionsMut.error?.message || 'Tente novamente'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}