import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { db } from '../../lib/firebase'
import {
  collection, addDoc, updateDoc, doc, getDocs, query, where, orderBy, deleteDoc,
} from 'firebase/firestore'
import { useOrders } from '../../hooks/useOrders'
import { usePermissions } from '../../hooks/usePermissions'
import { useRouteCreation, useRouteEdit, usePickupCreation } from '../../hooks/useRoutes'
import { fmtDate } from '../../lib/utils'
import { fmtDate as fmtDateHelpers, toISODate, addDays, startOfWeek, getClientName, getContractName, getLocationInfo, joinNice, getOrderLinesGeneric } from '../../lib/orderHelpers'
import { useLocationsIndex, useContractsIndex } from '../../lib/useFirestoreIndexes'
import { FLEET, CARRIERS, CARRIER_NAMES } from '../../config/routes'
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

/* =============================================================== */
export default function Rotas() {
  const qc = useQueryClient()
  const { can } = usePermissions()

  // Permissões
  const canCreate = can('routes.create')
  const canEdit = can('routes.edit')

  // índices auxiliares
  const locationsIndex = useLocations().data || {}
  const contractsIndex = useContracts().data || {}

  // Encomendas expedidas
  const exp = useOrders('A_EXPEDIR').data || []
  const internals = exp.filter(o => o.carrier === CARRIERS.INTERNO && !o.routeId)
  const externals = exp.filter(o => (o.carrier === CARRIERS.SANTOS || o.carrier === CARRIERS.STEFF) && !o.pickupId)

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
  const [viewOrder, setViewOrder] = useState(null)

  /* ===== Semana (apenas dias com rotas) ===== */
  const routesByDay = useMemo(() => {
    const map = Object.fromEntries(weekDays.map(d => [d, []]))
    routes.forEach(r => { if (map[r.date]) map[r.date].push(r) })
    return map
  }, [routes, weekDays])

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
    <div className="grid">
      {/* topo */}
      <div className="span-12 card">
        <div className="toolbar">
          <h3 style={{ margin: 0 }}>Rotas & Recolhas</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className="btn"
              onClick={() => routeCreation.setShowCreate(s => !s)}
              disabled={!canCreate}
              title={!canCreate ? 'Sem permissão para criar rotas' : undefined}
            >
              {routeCreation.showCreate ? 'Fechar criador de rota' : 'Criar rota (visual)'}
            </button>
            <button
              className="btn-secondary"
              onClick={() => pickupCreation.setShowCreate(s => !s)}
              disabled={!canCreate}
              title={!canCreate ? 'Sem permissão para criar recolhas' : undefined}
            >
              {pickupCreation.showCreate ? 'Fechar criador de recolha' : 'Criar recolha (transportadora)'}
            </button>
            <div className="badge blue">
              Disponíveis: {internals.length} internas • {externals.length} externas
            </div>
          </div>
        </div>

        {/* criador de rota */}
        {routeCreation.showCreate && (
          <CreateRoutePanel
            routeCreation={routeCreation}
            motoristas={motoristas}
            locationsIndex={locationsIndex}
            contractsIndex={contractsIndex}
            internals={internals}
          />
        )}

        {/* criador de recolha */}
        {pickupCreation.showCreate && (
          <CreatePickupPanel
            pickupCreation={pickupCreation}
            externals={externals}
            locationsIndex={locationsIndex}
            contractsIndex={contractsIndex}
          />
        )}
      </div>

      {/* navegação semanal */}
      <div className="span-12 card">
        <div className="toolbar">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn-secondary" onClick={() => setBaseDate(toISODate(addDays(weekStart, -7)))}>
              &larr; Semana anterior
            </button>
            <button className="btn-secondary" onClick={() => setBaseDate(toISODate(new Date()))}>
              Hoje
            </button>
            <button className="btn-secondary" onClick={() => setBaseDate(toISODate(addDays(weekStart, 7)))}>
              Próxima semana &rarr;
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="badge blue">
              {fmtDate(startISO)} — {fmtDate(endISO)}
            </span>
            <label className="field" style={{ margin: 0 }}>
              <span>Ir para</span>
              <input type="date" value={baseDate} onChange={e => setBaseDate(e.target.value)} />
            </label>
          </div>
        </div>
      </div>

      {/* dias visíveis (só com rotas) */}
      {visibleDays.map((d, idx) => (
        <DayColumn
          key={d}
          dayISO={d}
          idx={weekDays.indexOf(d)}
          weekdays={weekdays}
          routesByDay={routesByDay}
          onSelectRoute={setViewRoute}
        />
      ))}

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
