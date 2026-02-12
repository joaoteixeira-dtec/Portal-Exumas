import { useState, useMemo, useEffect, Component } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { db } from '../../lib/firebase'
import {
  collection, addDoc, updateDoc, doc, getDocs, query, where, orderBy, deleteDoc,
} from 'firebase/firestore'
import { useOrders } from '../../hooks/useOrders'
import { usePermissions } from '../../hooks/usePermissions'
import { useRouteCreation, useRouteEdit, usePickupCreation } from '../../hooks/useRoutes'
import { fmtDate } from '../../lib/utils'
import { toISODate, addDays, startOfWeek, getClientName, getContractName, getLocationInfo, joinNice, getOrderLinesGeneric } from '../../lib/orderHelpers'
import { useLocationsIndex, useContractsIndex } from '../../lib/useFirestoreIndexes'
import { FLEET, CARRIERS, CARRIER_NAMES } from '../../config/routes'
import { useWarehouse } from '../../contexts/WarehouseContext'
import { CreateRoutePanel } from './CreateRoutePanel'
import { DayColumn } from './DayColumn'
import { ViewRouteModal } from './ViewRouteModal'
import { EditRouteModal } from './EditRouteModal'
import { CreatePickupPanel } from './CreatePickupPanel'

const weekdays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

// useLocations e useContracts
const useLocations = () => useLocationsIndex()
const useContracts = () => useContractsIndex()

function useMotoristas() {
  return useQuery({
    queryKey: ['motoristas'],
    queryFn: async () => {
      const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'motorista')))
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    }
  })
}

function useRoutesRange(startISO, endISO) {
  return useQuery({
    queryKey: ['routes', startISO, endISO],
    queryFn: async () => {
      const qRef = query(
        collection(db, 'routes'),
        where('date', '>=', startISO),
        where('date', '<=', endISO),
        orderBy('date', 'asc')
      )
      const snap = await getDocs(qRef)
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    },
    enabled: !!startISO && !!endISO
  })
}

function usePickupsRange(startISO, endISO) {
  return useQuery({
    queryKey: ['pickups', startISO, endISO],
    queryFn: async () => {
      const qRef = query(
        collection(db, 'pickups'),
        where('date', '>=', startISO),
        where('date', '<=', endISO),
        orderBy('date', 'asc')
      )
      const snap = await getDocs(qRef)
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    },
    enabled: !!startISO && !!endISO
  })
}

/* ---------- Error Boundary para capturar crashes ---------- */
class RotasErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true }
  }
  componentDidCatch(error, errorInfo) {
    console.error('[RotasErrorBoundary] Erro capturado:', error, errorInfo)
    this.setState({ error, errorInfo })
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="card" style={{ padding: 40, margin: 20, background: '#1a0a0a', border: '2px solid #ef4444' }}>
          <h2 style={{ color: '#ef4444', margin: '0 0 16px' }}>❌ Erro nas Rotas</h2>
          <p style={{ color: '#fca5a5' }}>Ocorreu um erro ao renderizar esta página.</p>
          <pre style={{ 
            background: '#0a0a0a', 
            padding: 16, 
            borderRadius: 8, 
            overflow: 'auto',
            fontSize: 12,
            color: '#f97316',
            maxHeight: 300
          }}>
            {this.state.error?.toString()}
            {'\n\n'}
            {this.state.errorInfo?.componentStack}
          </pre>
          <button className="btn-primary" style={{ marginTop: 16 }} onClick={() => window.location.reload()}>
            Recarregar Página
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

/* =============================================================== */
export default function Rotas() {
  return (
    <RotasErrorBoundary>
      <RotasInner />
    </RotasErrorBoundary>
  )
}

function RotasInner() {
  const qc = useQueryClient()
  const { can } = usePermissions()

  // Permissões
  const canCreate = can('routes.create')
  const canEdit = can('routes.edit')

  // índices auxiliares
  const locationsIndex = useLocations().data || {}
  const contractsIndex = useContracts().data || {}

  // Filtro de armazém
  const { filterByWarehouse } = useWarehouse() || {}

  // Encomendas expedidas (filtradas por armazem)
  const expRaw = useOrders('A_EXPEDIR').data || []
  const exp = useMemo(() => filterByWarehouse ? filterByWarehouse(expRaw) : expRaw, [expRaw, filterByWarehouse])
  const internals = exp.filter(o => o.carrier === CARRIERS.INTERNO && !o.routeId)
  const externals = exp.filter(o => (o.carrier === CARRIERS.SANTOSVALE || o.carrier === CARRIERS.STEFF) && !o.pickupId)

  // Semana
  const [baseDate, setBaseDate] = useState(() => toISODate(new Date()))
  const weekStart = startOfWeek(baseDate)
  const weekDays = Array.from({ length: 7 }, (_, i) => toISODate(addDays(weekStart, i)))
  const startISO = weekDays[0], endISO = weekDays[6]

  const routes = useRoutesRange(startISO, endISO).data || []
  const pickups = usePickupsRange(startISO, endISO).data || []
  const motoristas = useMotoristas().data || []

  // Hooks personalizados para criação/edição
  const routeCreation = useRouteCreation(motoristas, internals, exp)
  const routeEdit = useRouteEdit(motoristas, internals, exp)
  const pickupCreation = usePickupCreation(externals)

  // Modais
  const [viewRoute, setViewRoute] = useState(null)
  const [viewPickup, setViewPickup] = useState(null)
  const [viewOrder, setViewOrder] = useState(null)

  /* ===== Semana (dias com rotas e/ou recolhas) ===== */
  const routesByDay = useMemo(() => {
    const map = Object.fromEntries(weekDays.map(d => [d, []]))
    routes.forEach(r => { if (map[r.date]) map[r.date].push(r) })
    return map
  }, [routes, weekDays])

  const pickupsByDay = useMemo(() => {
    const map = Object.fromEntries(weekDays.map(d => [d, []]))
    pickups.forEach(p => { if (map[p.date]) map[p.date].push(p) })
    return map
  }, [pickups, weekDays])

  const visibleDays = useMemo(
    () => weekDays.filter(d => (routesByDay[d]?.length || 0) > 0),
    [weekDays, routesByDay]
  )

  /* ===== PDF ===== */
  const escapeHTML = (s = '') => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

  const buildRoutePdfHtml = (route) => {
    const orders = (route.orderIds || []).map(id => exp.find(x => x.id === id)).filter(Boolean)
    const rows = orders.map((o, i) => {
      const client = getClientName(o) || 'Cliente'
      const L = getLocationInfo(o, { locationsIndex, contractsIndex })
      const headSub = joinNice([L.name, L.addr, L.contract ? `Contrato: ${L.contract}` : ''])
      const lines = getOrderLinesGeneric(o)
      const linesHtml = lines.length
        ? lines.map(l => `<tr><td>${escapeHTML(l.name)}</td><td class="num">${escapeHTML(l.qty)}</td><td>${escapeHTML(l.unit || '')}</td></tr>`).join('')
        : `<tr><td colspan="3" class="muted">Sem detalhes de itens</td></tr>`
      return `
      <section class="order">
        <div class="order-head">
          <div class="idx">${i + 1}</div>
          <div>
            <div class="client">${escapeHTML(client)}</div>
            <div class="sub">${escapeHTML(headSub || '')}</div>
          </div>
        </div>
        <table class="lines">
          <thead><tr><th>Produto</th><th class="num">Qtd</th><th>Un.</th></tr></thead>
          <tbody>${linesHtml}</tbody>
        </table>
      </section>`
    }).join('')

    return `
<!doctype html><html><head><meta charset="utf-8" />
<title>Rota ${fmtDate(route.date)} - ${escapeHTML(route.vehicle)}</title>
<style>
@page{ margin:14mm } body{ font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Arial; color:#111 }
.muted{ color:#666 } .header{ display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #111; padding-bottom:6px; margin-bottom:12px }
.title{ font-size:20px; font-weight:800 } .meta{ display:flex; gap:10px; flex-wrap:wrap }
.chip{ border:1px solid #111; border-radius:999px; padding:2px 10px; font-size:12px }
.order{ page-break-inside:avoid; border-bottom:1px dashed #bbb; padding:10px 0 }
.order-head{ display:flex; gap:10px; align-items:flex-start; margin-bottom:6px }
.idx{ width:24px; height:24px; border:1px solid #111; border-radius:999px; display:grid; place-items:center; font-weight:700 }
.client{ font-weight:700 } .sub{ font-size:12px }
table.lines{ width:100%; border-collapse:collapse } table.lines thead th{ text-align:left; border-bottom:1px solid #111; padding:4px 0; font-size:12px }
table.lines td{ padding:3px 0; border-bottom:1px dotted #ccc; font-size:12px } .num{text-align:right; width:60px}
.footer{ margin-top:12px; font-size:12px; color:#555 }
</style></head><body>
  <div class="header">
    <div><div class="title">Resumo de Rota</div><div class="muted">Impresso em ${new Date().toLocaleString()}</div></div>
    <div class="meta">
      <div class="chip">Data: ${fmtDate(route.date)}</div>
      <div class="chip">Veículo: ${escapeHTML(route.vehicle || '')}</div>
      <div class="chip">Motorista: ${escapeHTML(route.driverName || '')}</div>
      <div class="chip">Hora: ${escapeHTML(route.startTime || '—:—')}</div>
      <div class="chip">Paragens: ${(route.orderIds || []).length}</div>
    </div>
  </div>
  ${rows}
  ${route.notes ? `<div class="footer"><b>Obs:</b> ${escapeHTML(route.notes)}</div>` : ''}
</body></html>`
  }

  const printRoutePdf = (route) => {
    const html = buildRoutePdfHtml(route)
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    iframe.src = url
    iframe.onload = () => {
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus()
          iframe.contentWindow?.print()
        } catch { }
      }, 200)
    }
    document.body.appendChild(iframe)
    setTimeout(() => {
      URL.revokeObjectURL(url)
      setTimeout(() => document.body.removeChild(iframe), 1000)
    }, 10000)
  }

  /* =============================================================== */
  return (
    <div className="rotas-page">
      {/* Header Hero */}
      <div className="rotas-hero">
        <div className="rotas-hero-content">
          <div className="rotas-hero-title">
            <span className="rotas-icon">🚚</span>
            <div>
              <h1>Rotas & Recolhas</h1>
              <p className="rotas-subtitle">Gestão de entregas e recolhas</p>
            </div>
          </div>
          
          <div className="rotas-hero-stats">
            <div className="rotas-stat">
              <span className="rotas-stat-value">{internals.length}</span>
              <span className="rotas-stat-label">Internas</span>
            </div>
            <div className="rotas-stat">
              <span className="rotas-stat-value">{externals.length}</span>
              <span className="rotas-stat-label">Externas</span>
            </div>
            <div className="rotas-stat">
              <span className="rotas-stat-value">{routes.length}</span>
              <span className="rotas-stat-label">Rotas esta semana</span>
            </div>
          </div>
        </div>
        
        <div className="rotas-hero-actions">
          <button
            className={`rotas-btn-primary ${routeCreation.showCreate ? 'active' : ''}`}
            onClick={() => { routeCreation.setShowCreate(s => !s); pickupCreation.setShowCreate(false) }}
            disabled={!canCreate}
          >
            {routeCreation.showCreate ? '✕ Fechar' : '+ Nova Rota'}
          </button>
          <button
            className={`rotas-btn-secondary ${pickupCreation.showCreate ? 'active' : ''}`}
            onClick={() => { pickupCreation.setShowCreate(s => !s); routeCreation.setShowCreate(false) }}
            disabled={!canCreate}
          >
            {pickupCreation.showCreate ? '✕ Fechar' : '📦 Nova Recolha'}
          </button>
        </div>
      </div>

      {/* Painel de Criação de Rota */}
      {routeCreation.showCreate && (
        <div className="rotas-create-panel">
          <CreateRoutePanel
            routeCreation={routeCreation}
            motoristas={motoristas}
            locationsIndex={locationsIndex}
            contractsIndex={contractsIndex}
            internals={internals}
          />
        </div>
      )}

      {/* Painel de Criação de Recolha */}
      {pickupCreation.showCreate && (
        <div className="rotas-create-panel">
          <CreatePickupPanel
            pickupCreation={pickupCreation}
            externals={externals}
            locationsIndex={locationsIndex}
            contractsIndex={contractsIndex}
          />
        </div>
      )}

      {/* Navegação Semanal */}
      <div className="rotas-week-nav">
        <div className="rotas-week-buttons">
          <button className="rotas-nav-btn" onClick={() => setBaseDate(toISODate(addDays(weekStart, -7)))}>
            ← Anterior
          </button>
          <button className="rotas-nav-btn today" onClick={() => setBaseDate(toISODate(new Date()))}>
            Hoje
          </button>
          <button className="rotas-nav-btn" onClick={() => setBaseDate(toISODate(addDays(weekStart, 7)))}>
            Próxima →
          </button>
        </div>
        
        <div className="rotas-week-info">
          <span className="rotas-week-range">{fmtDate(startISO)} — {fmtDate(endISO)}</span>
          <input 
            type="date" 
            className="rotas-date-picker"
            value={baseDate} 
            onChange={e => setBaseDate(e.target.value)} 
          />
        </div>
      </div>

      {/* Calendário Semanal */}
      <div className="rotas-calendar">
        {weekDays.map((d, idx) => {
          const dayRoutes = routesByDay[d] || []
          const dayPickups = pickupsByDay[d] || []
          const totalItems = dayRoutes.length + dayPickups.length
          const isToday = d === toISODate(new Date())
          const dayName = weekdays[idx]
          const dayNum = new Date(d).getDate()
          
          return (
            <div key={d} className={`rotas-day ${isToday ? 'today' : ''} ${totalItems ? 'has-routes' : ''}`}>
              <div className="rotas-day-header">
                <span className="rotas-day-name">{dayName}</span>
                <span className="rotas-day-num">{dayNum}</span>
                {totalItems > 0 && (
                  <span className="rotas-day-count">{totalItems}</span>
                )}
              </div>
              
              <div className="rotas-day-content">
                {totalItems === 0 ? (
                  <div className="rotas-day-empty">
                    <span>—</span>
                  </div>
                ) : (
                  <>
                    {dayRoutes.map(route => (
                      <div 
                        key={route.id} 
                        className="rotas-route-card"
                        onClick={() => setViewRoute(route)}
                      >
                        <div className="rotas-route-badge">🚚 Rota</div>
                        <div className="rotas-route-vehicle">{route.vehicle || 'Veículo'}</div>
                        <div className="rotas-route-info">
                          <span className="rotas-route-time">{route.startTime || '—:—'}</span>
                          <span className="rotas-route-stops">{(route.orderIds || []).length} paragens</span>
                        </div>
                        <div className="rotas-route-driver">{route.driverName || 'Sem motorista'}</div>
                      </div>
                    ))}
                    {dayPickups.map(pickup => (
                      <div 
                        key={pickup.id} 
                        className="rotas-pickup-card"
                        onClick={() => setViewPickup(pickup)}
                      >
                        <div className="rotas-pickup-badge">📦 Recolha</div>
                        <div className="rotas-pickup-carrier">
                          {CARRIER_NAMES[pickup.carrier] || pickup.carrier || 'Transportadora'}
                        </div>
                        <div className="rotas-route-info">
                          <span className="rotas-pickup-time">{pickup.pickupTime || '—:—'}</span>
                          <span className="rotas-route-stops">{(pickup.orderIds || []).length} encomendas</span>
                        </div>
                        <div className="rotas-pickup-location">{pickup.pickupLocation || '—'}</div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Mensagem quando não há rotas nem recolhas */}
      {routes.length === 0 && pickups.length === 0 && !routeCreation.showCreate && !pickupCreation.showCreate && (
        <div className="rotas-empty-state">
          <div className="rotas-empty-icon">🗓️</div>
          <h3>Sem rotas nem recolhas esta semana</h3>
          <p>Clique em "Nova Rota" ou "Nova Recolha" para começar.</p>
        </div>
      )}

      {/* MODAL: VER RECOLHA */}
      {viewPickup && (
        <div className="modal-overlay" onClick={() => setViewPickup(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h3>📦 Recolha</h3>
              <button className="icon-btn" onClick={() => setViewPickup(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ padding: '16px 20px' }}>
              {/* Info chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                <div className="vrm-chip vrm-chip--purple">🚛 {CARRIER_NAMES[viewPickup.carrier] || viewPickup.carrier || '—'}</div>
                <div className="vrm-chip">📅 {fmtDate(viewPickup.date)}</div>
                <div className="vrm-chip">⏰ {viewPickup.pickupTime || '—'}</div>
                <div className="vrm-chip">📍 {viewPickup.pickupLocation || '—'}</div>
                <div className="vrm-chip vrm-chip--purple-accent">{(viewPickup.orderIds || []).length} encomendas</div>
                <span style={{
                  padding: '4px 12px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 600,
                  background: viewPickup.status === 'PICKED_UP' ? 'rgba(16,185,129,0.15)' : viewPickup.status === 'CANCELLED' ? 'rgba(239,68,68,0.15)' : 'rgba(139,92,246,0.15)',
                  color: viewPickup.status === 'PICKED_UP' ? '#10b981' : viewPickup.status === 'CANCELLED' ? '#ef4444' : '#a78bfa'
                }}>{viewPickup.status === 'PICKED_UP' ? '✅ Recolhida' : viewPickup.status === 'CANCELLED' ? '❌ Cancelada' : '🕐 Agendada'}</span>
              </div>

              {/* Encomendas */}
              <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>
                Encomendas nesta recolha
              </h4>
              {(viewPickup.orderIds || []).length === 0 ? (
                <p className="muted">Nenhuma encomenda associada.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(viewPickup.orderIds || []).map((oid, i) => {
                    const o = exp.find(x => x.id === oid)
                    if (!o) return <div key={oid} className="muted" style={{ fontSize: 12 }}>Encomenda {oid.slice(0, 8)}… (não encontrada)</div>
                    const L = getLocationInfo(o, { locationsIndex, contractsIndex })
                    const lines = getOrderLinesGeneric(o)
                    const sub = joinNice([
                      L.name,
                      L.contract ? `Contrato: ${L.contract}` : '',
                    ])
                    return (
                      <div
                        key={oid}
                        className="vrm-delivery-card vrm-delivery-card--purple"
                        onClick={() => { setViewOrder(o) }}
                      >
                        <div className="vrm-delivery-index vrm-delivery-index--purple">{i + 1}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="vrm-delivery-client">{getClientName(o) || 'Cliente'}</div>
                          {sub && <div className="vrm-delivery-location">{sub}</div>}
                          {L.addr && <div className="vrm-delivery-addr">{L.addr}</div>}
                          <div className="vrm-delivery-date" style={{ color: '#a78bfa' }}>{fmtDate(o.date)}</div>
                          {lines.length > 0 && (
                            <div className="vrm-delivery-items">
                              {lines.slice(0, 3).map((l, idx) => (
                                <span key={idx} className="vrm-item-chip">{l.name} ×{l.qty}</span>
                              ))}
                              {lines.length > 3 && <span className="vrm-item-chip vrm-item-more" style={{ color: '#a78bfa', borderColor: 'rgba(139,92,246,0.2)', background: 'rgba(139,92,246,0.08)' }}>+{lines.length - 3} mais</span>}
                            </div>
                          )}
                        </div>
                        <div className="vrm-delivery-arrow vrm-delivery-arrow--purple">›</div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="modal-actions" style={{ padding: '12px 20px' }}>
              <button className="btn" onClick={() => setViewPickup(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: VER ROTA */}
      {viewRoute && (
        <ViewRouteModal
          route={viewRoute}
          onClose={() => setViewRoute(null)}
          onViewOrder={(o) => { setViewOrder(o) }}
          onEdit={() => { routeEdit.setEditRoute(viewRoute); setViewRoute(null) }}
          onDelete={() => {
            if (confirm('Eliminar rota? Todas as encomendas voltam às disponíveis.')) {
              routeEdit.deleteRoute.mutate(viewRoute)
            }
            setViewRoute(null)
          }}
          onPrint={() => printRoutePdf(viewRoute)}
          canEdit={canEdit}
          exp={exp}
          locationsIndex={locationsIndex}
          contractsIndex={contractsIndex}
          deleteLoading={routeEdit.deleteRoute.isPending}
        />
      )}

      {/* MODAL: DETALHE ENCOMENDA */}
      {viewOrder && (
        <ViewOrderModal
          order={viewOrder}
          onClose={() => setViewOrder(null)}
          locationsIndex={locationsIndex}
          contractsIndex={contractsIndex}
        />
      )}

      {/* MODAL: EDITAR ROTA */}
      {routeEdit.editRoute && (
        <EditRouteModal
          routeEdit={routeEdit}
          motoristas={motoristas}
          locationsIndex={locationsIndex}
          contractsIndex={contractsIndex}
          internals={internals}
          canEdit={canEdit}
        />
      )}
    </div>
  )
}

/* Sub-componentes de Modal */
const ViewOrderModal = ({ order, onClose, locationsIndex, contractsIndex }) => {
  const L = getLocationInfo(order, { locationsIndex, contractsIndex })
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Encomenda</h3>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="grid" style={{ gap: 8, gridTemplateColumns: 'repeat(12,1fr)' }}>
            <div className="span-6">
              <div><strong>Cliente:</strong> {getClientName(order) || '—'}</div>
              <div className="muted" style={{ marginTop: 4 }}>
                <div><strong>Data:</strong> {fmtDate(order.date)}</div>
                {getContractName(order, contractsIndex) && (
                  <div><strong>Contrato:</strong> {getContractName(order, contractsIndex)}</div>
                )}
              </div>
            </div>
            <div className="span-6">
              <div><strong>Entrega:</strong> {L.name || L.addr || '—'}</div>
              {L.name && L.addr && <div className="muted">{L.addr}</div>}
            </div>
          </div>

          <div className="hr"></div>

          <h4>O que vai na encomenda</h4>
          <table className="lines-table">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Qtd</th>
                <th>Un.</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const lines = getOrderLinesGeneric(order)
                if (!lines.length) return <tr><td colSpan="3"><span className="muted">Sem detalhes de itens.</span></td></tr>
                return lines.map((l, idx) => <tr key={idx}><td>{l.name}</td><td>{l.qty}</td><td>{l.unit}</td></tr>)
              })()}
            </tbody>
          </table>
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  )
}
