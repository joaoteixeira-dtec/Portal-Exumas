/**
 * Pipeline.jsx
 * Visualização e gestão do pipeline de encomendas.
 */

import { useState, useMemo, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { doc, updateDoc, deleteDoc, getDocs, getDoc, query, collection, where, writeBatch, addDoc } from 'firebase/firestore'
import { db } from '../../../lib/firebase'
import { useOrderEvents } from '../../../hooks/useOrderEvents'
import { usePermissions } from '../../../hooks/usePermissions'
import { Can } from '../../../components/PermissionGate'
import { ORDER_STATUS, statusBadge, fmtDate, CARRIERS } from '../../../lib/utils'
import { logOrderEvent } from '../../../lib/orderEvents'
import { WAREHOUSES, WAREHOUSE_NAMES, WAREHOUSE_SHORT } from '../../../config/routes'
import {
  isCancelledStatus, isDeliveredStatus, isBulkSubOrder, isBulkBatchOrder,
  getOrderClientId, orderNoLabel, orderTotalValue, itemsArray, itemsOf,
  fmtDateShort, STATE_WEIGHT, safe, chunk
} from '../../../lib/orderHelpers'
import { useNamesForOrders } from '../../../lib/useFirestoreIndexes'
import { Modal, Pagination, Badge } from '../../../components/ui/index.jsx'

// ==================== HELPERS ====================

const badgeHtml = (o) => o.status === 'CANCELADA' ? `<span class="badge red">Cancelada</span>` : statusBadge(o)

const fmtTime = (s) => {
  try { const d = new Date(s); return d.toTimeString().slice(0, 5) } catch { return '—:—' }
}

const fmtDuration = (ms) => {
  if (ms < 60000) return '<1m'
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`
  if (ms < 86400000) return `${Math.floor(ms / 3600000)}h ${Math.round((ms % 3600000) / 60000)}m`
  const d = Math.floor(ms / 86400000)
  const h = Math.floor((ms % 86400000) / 3600000)
  return `${d}d ${h}h`
}

// ==================== COMPONENT ====================

export default function Pipeline({ orders, clientUsernameById, profile }) {
  const qc = useQueryClient()
  const { can } = usePermissions()

  // State
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('todos')
  const [pipeView, setPipeView] = useState('ativas')
  const [massFilter, setMassFilter] = useState('pendentes')
  const [sortBy, setSortBy] = useState('data-desc')
  const [pageSize, setPageSize] = useState(12)
  const [page, setPage] = useState(1)
  const [detailOrder, setDetailOrder] = useState(null)
  const [flowOrder, setFlowOrder] = useState(null)
  const [selectedBulkOrders, setSelectedBulkOrders] = useState(new Set())
  const [bulkSummaryModal, setBulkSummaryModal] = useState(null)
  const [forcePartialOrder, setForcePartialOrder] = useState(null)

  // Nomes de contratos/locais
  const relevantOrders = useMemo(() => {
    if (pipeView === 'massa') {
      return orders.filter(o => isBulkSubOrder(o) && !isCancelledStatus(o.status))
    }
    if (pipeView === 'entregues') {
      return orders.filter(o => isDeliveredStatus(o.status) && !isBulkSubOrder(o) && !isBulkBatchOrder(o))
    }
    return orders.filter(o => !isDeliveredStatus(o.status) && !isBulkSubOrder(o) && !isBulkBatchOrder(o))
  }, [orders, pipeView])

  const { data: namesData } = useNamesForOrders(relevantOrders)
  const contractName = namesData?.contractMap || {}
  const locationName = namesData?.locationMap || {}

  // Filtering
  const listBase = useMemo(() => {
    const s = (search || '').toLowerCase()
    let raw = relevantOrders

    if (pipeView === 'massa') {
      raw = raw.filter(o => {
        if (massFilter === 'pendentes') return !o.bulkBatchId && !isDeliveredStatus(o.status)
        if (massFilter === 'em_lote') return !!o.bulkBatchId && !isDeliveredStatus(o.status)
        if (massFilter === 'entregues') return isDeliveredStatus(o.status)
        return true
      })
    }

    if (pipeView === 'ativas' && status !== 'todos') {
      raw = raw.filter(o => o.status === status)
    }

    return raw.filter(o => {
      const c = contractName[o.contractId] || ''
      const l = locationName[o.locationId] || ''
      const u = clientUsernameById[getOrderClientId(o)] || o?.clientName || ''
      const no = orderNoLabel(o)
      const ext = o.externalRef || o.ref || ''
      return `${o.clientName} ${u} ${c} ${l} ${no} ${ext}`.toLowerCase().includes(s)
    })
  }, [relevantOrders, pipeView, status, massFilter, search, contractName, locationName, clientUsernameById])

  // Sorting
  const sorted = useMemo(() => {
    const arr = [...listBase]
    switch (sortBy) {
      case 'data-asc': arr.sort((a, b) => (a.date || '').localeCompare(b.date || '')); break
      case 'data-desc': arr.sort((a, b) => (b.date || '').localeCompare(a.date || '')); break
      case 'estado': arr.sort((a, b) => (STATE_WEIGHT[a.status] || 99) - (STATE_WEIGHT[b.status] || 99)); break
      case 'cliente': arr.sort((a, b) => (a.clientName || '').localeCompare(b.clientName || '')); break
      case 'contrato': arr.sort((a, b) => (contractName[a.contractId] || '').localeCompare(contractName[b.contractId] || '')); break
      case 'local': arr.sort((a, b) => (locationName[a.locationId] || '').localeCompare(locationName[b.locationId] || '')); break
    }
    return arr
  }, [listBase, sortBy, contractName, locationName])

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const paged = sorted.slice((page - 1) * pageSize, page * pageSize)

  useEffect(() => { setPage(1) }, [search, status, pipeView, massFilter, sortBy, pageSize])

  // Counts for bulk
  const massCounts = useMemo(() => {
    if (pipeView !== 'massa') return null
    const base = orders.filter(o => isBulkSubOrder(o) && !isCancelledStatus(o?.status))
    return {
      total: base.length,
      pendentes: base.filter(o => !o?.bulkBatchId && !isDeliveredStatus(o?.status)).length,
      emLote: base.filter(o => !!o?.bulkBatchId && !isDeliveredStatus(o?.status)).length,
      entregues: base.filter(o => isDeliveredStatus(o?.status)).length
    }
  }, [pipeView, orders])

  // Mutations
  const moveMut = useMutation({
    mutationFn: async ({ id, to, fromStatus }) => {
      // Validar carrier antes de enviar para preparação
      if (to === 'PREP') {
        const snap = await getDoc(doc(db, 'orders', id))
        const orderData = snap.data()
        if (!orderData?.carrier) {
          throw new Error('⚠️ Transportadora obrigatória!\n\nDefine primeiro a transportadora antes de enviar para preparação.')
        }
      }
      
      await updateDoc(doc(db, 'orders', id), { status: to })
      await logOrderEvent({
        orderId: id,
        type: 'SEND_TO_PREP',
        role: profile?.role,
        profile,
        meta: {
          fromStatus: fromStatus || 'ESPERA',
          toStatus: to,
        }
      })
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['order-events', id] })
    }
  })

  const carrierMut = useMutation({
    mutationFn: async ({ id, carrier }) => updateDoc(doc(db, 'orders', id), { carrier: carrier || null }),
    onSuccess: (_, { id, carrier }) => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      // Atualizar o detailOrder local para refletir a mudança imediatamente
      setDetailOrder(prev => prev && prev.id === id ? { ...prev, carrier: carrier || null } : prev)
    }
  })

  const armazemMut = useMutation({
    mutationFn: async ({ id, armazem }) => updateDoc(doc(db, 'orders', id), { armazem: armazem || null }),
    onSuccess: (_, { id, armazem }) => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      setDetailOrder(prev => prev && prev.id === id ? { ...prev, armazem: armazem || null } : prev)
    }
  })

  const cancelMut = useMutation({
    mutationFn: async (id) => {
      await updateDoc(doc(db, 'orders', id), { status: 'CANCELADA', cancelledAt: new Date().toISOString() })
      await logOrderEvent({
        orderId: id,
        type: 'CANCELLED',
        role: profile?.role,
        profile,
        meta: { reason: 'Cancelada pelo utilizador' }
      })
    },
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['order-events', id] })
    }
  })

  const reactivateMut = useMutation({
    mutationFn: async (id) => {
      await updateDoc(doc(db, 'orders', id), {
        status: ORDER_STATUS?.ESPERA || 'ESPERA',
        assignedTo: null, routeId: null, pickupId: null, needsWarehouseCompletion: false
      })
      await logOrderEvent({
        orderId: id,
        type: 'REACTIVATED',
        role: profile?.role,
        profile,
        meta: { notes: 'Encomenda reativada' }
      })
    },
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['order-events', id] })
    }
  })

  // Mutation para forçar expedição parcial (saltar faltas)
  const forcePartialMut = useMutation({
    mutationFn: async ({ id, targetStatus, notes }) => {
      // Validar carrier se destino é envio direto (EXPEDIDA salta faturação e rotas)
      if (targetStatus === 'EXPEDIDA' || targetStatus === 'A_EXPEDIR') {
        const snap = await getDoc(doc(db, 'orders', id))
        const orderData = snap.data()
        if (!orderData?.carrier) {
          throw new Error('⚠️ Transportadora obrigatória! Atribui uma transportadora na ficha da encomenda antes de avançar para expedição.')
        }
      }
      
      // Atualizar status e marcar como expedição parcial
      await updateDoc(doc(db, 'orders', id), {
        status: targetStatus,
        forcedPartial: true,
        forcedPartialAt: new Date().toISOString(),
        forcedPartialBy: profile?.uid || 'unknown',
        forcedPartialNotes: notes || 'Expedição parcial autorizada pelo gestor'
      })
      
      // Logar evento
      await logOrderEvent({
        orderId: id,
        type: 'FORCED_PARTIAL',
        role: profile?.role,
        profile,
        meta: {
          targetStatus,
          notes: notes || 'Expedição parcial autorizada pelo gestor',
          reason: 'Encomenda forçada para avançar com produtos disponíveis'
        }
      })
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['order-events', id] })
      setForcePartialOrder(null)
      setDetailOrder(null)
    }
  })

  const deleteMut = useMutation({
    mutationFn: async (id) => {
      const evSnap = await getDocs(query(collection(db, 'orderEvents'), where('orderId', '==', id)))
      if (!evSnap.empty) {
        for (const pack of chunk(evSnap.docs, 400)) {
          const b = writeBatch(db)
          pack.forEach(d => b.delete(d.ref))
          await b.commit()
        }
      }
      await deleteDoc(doc(db, 'orders', id))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['orderEvents'] })
    }
  })

  const bulkSendMut = useMutation({
    mutationFn: async ({ orderIds }) => {
      const selectedOrders = orders.filter(o => orderIds.includes(o.id))
      
      // Validar que todas as encomendas têm carrier
      const semCarrier = selectedOrders.filter(o => !o.carrier)
      if (semCarrier.length > 0) {
        const nomes = semCarrier.map(o => o.clientName || o.id).join(', ')
        throw new Error(`⚠️ Transportadora obrigatória!\n\n${semCarrier.length} encomenda(s) sem transportadora: ${nomes}\n\nDefine a transportadora em cada encomenda antes de enviar para preparação.`)
      }
      
      // 1. Agregar todos os items das subencomendas
      const aggregatedItems = {}
      selectedOrders.forEach(order => {
        const orderItems = itemsArray(order.items)
        orderItems.forEach(item => {
          const key = item.productName || item.nome || 'Desconhecido'
          if (!aggregatedItems[key]) {
            aggregatedItems[key] = { ...item, qty: 0, preparedQty: 0 }
          }
          aggregatedItems[key].qty = (aggregatedItems[key].qty || 0) + (Number(item.qty) || 0)
        })
      })
      
      // 2. Criar encomenda BULK_BATCH no Firestore
      const bulkBatchRef = await addDoc(collection(db, 'orders'), {
        // Identificação
        kind: 'BULK_BATCH',
        bulkBatch: true,
        isBulkBatch: true,
        bulkSubOrderIds: orderIds, // Link para as subencomendas
        
        // Cliente e localização (do primeiro item)
        clientId: selectedOrders[0]?.clientId || null,
        clientName: selectedOrders[0]?.clientName || null,
        contractId: selectedOrders[0]?.contractId || null,
        locationId: selectedOrders[0]?.locationId || null,
        
        // Items agregados
        items: aggregatedItems,
        
        // Status
        status: 'PREP',
        date: new Date().toISOString().slice(0, 10),
        createdAt: new Date().toISOString(),
        sentToPrep: new Date().toISOString(),
        
        // Audit
        createdBy: profile?.uid || 'system',
        createdByName: profile?.name || 'System',
        
        // Meta
        meta: {
          sourceType: 'bulk_batch_aggregated',
          bulkOrderCount: orderIds.length,
          aggregationTime: new Date().toISOString()
        }
      })
      
      const bulkBatchId = bulkBatchRef.id
      
      // 3. Ligar as subencomendas ao bulk batch (marcar como "linkedToBulkBatch")
      const linkBatch = writeBatch(db)
      selectedOrders.forEach(o => {
        linkBatch.update(doc(db, 'orders', o.id), {
          linkedToBulkBatchId: bulkBatchId,
          status: 'PREP', // Também em PREP
          sentToPrep: new Date().toISOString()
        })
      })
      await linkBatch.commit()
      
      // 4. Logar eventos
      for (const order of selectedOrders) {
        await logOrderEvent({
          orderId: order.id,
          type: 'SEND_TO_PREP',
          role: profile?.role,
          profile,
          meta: {
            fromStatus: order.status,
            toStatus: 'PREP',
            bulkBatchId,
            bulkOrderCount: orderIds.length,
            sourceType: 'bulk_batch_aggregated'
          }
        })
      }
      
      return bulkBatchId
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['orderEvents'] })
    }
  })

  // Funções para bulk selection
  const toggleBulkOrder = (orderId) => {
    const newSet = new Set(selectedBulkOrders)
    if (newSet.has(orderId)) newSet.delete(orderId)
    else newSet.add(orderId)
    setSelectedBulkOrders(newSet)
  }

  const toggleSelectAllBulk = () => {
    if (selectedBulkOrders.size === paged.length && paged.length > 0) {
      setSelectedBulkOrders(new Set())
    } else {
      const allIds = new Set(paged.map(o => o.id))
      setSelectedBulkOrders(allIds)
    }
  }

  const calculateBulkSummary = () => {
    const selected = Array.from(orders).filter(o => selectedBulkOrders.has(o.id))
    if (selected.length === 0) return null

    const allItems = selected.flatMap(o => itemsArray(o.items))
    const itemsByProduct = {}
    allItems.forEach(item => {
      const key = item.productName || item.nome || 'Desconhecido'
      if (!itemsByProduct[key]) {
        itemsByProduct[key] = { qty: 0, value: 0 }
      }
      itemsByProduct[key].qty += +item.qty || 0
      itemsByProduct[key].value += (+item.qty || 0) * (+item.preco || 0)
    })

    const totalQty = allItems.reduce((s, it) => s + (+it.qty || 0), 0)
    const totalValue = selected.reduce((s, o) => s + orderTotalValue(o), 0)

    return {
      orders: selected,
      items: itemsByProduct,
      totalQty,
      totalValue,
      count: selected.length
    }
  }

  // Export PDF
  function exportOrderPDF(order) {
    if (!order) return
    const cName = contractName[order.contractId] || '—'
    const lName = locationName[order.locationId] || '—'
    const internalNoStr = order.internalNoStr || (order.internalNo != null ? String(order.internalNo).padStart(6, '0') : '')
    const rows = itemsArray(order.items).map(it => {
      const miss = Math.max(0, (+it.qty || 0) - (+it.preparedQty || 0))
      return `<tr>
        <td>${safe(it.productName)}</td><td>${safe(it.unidade || '')}</td>
        <td style="text-align:right">${(+it.preco || 0).toFixed(2)}€</td>
        <td style="text-align:right">${(+it.qty || 0).toFixed(2)}</td>
        <td style="text-align:right">${(+it.preparedQty || 0).toFixed(2)}</td>
        <td style="text-align:right">${miss.toFixed(2)}</td>
      </tr>`
    }).join('')
    const total = itemsArray(order.items).reduce((s, it) => s + (+it.qty || 0) * (+it.preco || 0), 0)
    const html = `<!doctype html><html><head><meta charset="utf-8"/>
<title>Encomenda</title>
<style>
:root{--txt:#111827;--muted:#6b7280;--line:#e5e7eb}
*{box-sizing:border-box}body{font-family:Inter,system-ui,sans-serif;margin:24px;color:var(--txt)}
h1{font-size:20px;margin:0 0 4px}.muted{color:var(--muted);font-size:12px}
.kpi{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}.chip{border:1px solid var(--line);border-radius:999px;padding:4px 8px;font-size:12px}
table{width:100%;border-collapse:collapse;margin-top:10px}th,td{border-bottom:1px solid var(--line);padding:8px;text-align:left;font-size:13px}
th{background:#fafafa}.tot{display:flex;justify-content:flex-end;margin-top:10px}
@page{size:A4;margin:15mm}@media print{body{margin:0}}
</style></head><body>
<h1>Relatório de Encomenda</h1>
<div class="kpi">
  <div class="chip">Cliente: ${safe(order.clientName || '')}</div>
  <div class="chip">N.º interno: ${safe(internalNoStr || '—')}</div>
  <div class="chip">Contrato: ${safe(cName)}</div>
  <div class="chip">Local: ${safe(lName)}</div>
  <div class="chip">Data: ${safe(fmtDate(order.date || ''))}</div>
  <div class="chip">Estado: ${safe(order.status || '')}</div>
</div>
<table>
<thead><tr><th>Produto</th><th>Un.</th><th style="text-align:right">Preço</th><th style="text-align:right">Pedido</th><th style="text-align:right">Preparado</th><th style="text-align:right">Falta</th></tr></thead>
<tbody>${rows || `<tr><td colspan="6">Sem itens.</td></tr>`}</tbody>
</table>
<div class="tot"><div class="chip">Total estimado: ${total.toFixed(2)}€</div></div>
<script>window.onload=()=>setTimeout(()=>window.print(),60)</script>
</body></html>`
    const w = window.open('', '_blank', 'width=900,height=700')
    if (!w) return
    w.document.open(); w.document.write(html); w.document.close(); w.focus()
  }

  // Flow events
  const { data: flowEvents = [], isLoading: flowLoading } = useOrderEvents(flowOrder?.id)

  // ==================== DASHBOARD KPIs ====================
  const dashboardStats = useMemo(() => {
    const active = orders.filter(o => !isDeliveredStatus(o.status) && !isCancelledStatus(o.status) && !isBulkSubOrder(o) && !isBulkBatchOrder(o))
    const today = new Date().toISOString().slice(0, 10)
    const now = Date.now()
    const h24 = 24 * 60 * 60 * 1000
    const h48 = 48 * 60 * 60 * 1000

    // Por estado
    const byStatus = {}
    for (const o of active) {
      byStatus[o.status] = (byStatus[o.status] || 0) + 1
    }

    // Valor total ativo
    const valorAtivo = active.reduce((s, o) => s + orderTotalValue(o), 0)

    // Entregas hoje
    const entregasHoje = active.filter(o => (o.date || '').slice(0, 10) === today).length

    // Alertas
    const atrasadas = active.filter(o => {
      const d = o.date ? new Date(o.date + 'T23:59:59').getTime() : null
      return d && d < now && !['ENTREGUE', 'CANCELADA'].includes(o.status)
    })

    const emEsperaLonga = active.filter(o => {
      if (o.status !== 'ESPERA') return false
      const created = o.createdAt ? new Date(o.createdAt).getTime() : null
      return created && (now - created) > h24
    })

    const faltasAntigas = active.filter(o => {
      if (o.status !== 'FALTAS') return false
      const updated = o.warehouseClosedAt ? new Date(o.warehouseClosedAt).getTime() : null
      return updated && (now - updated) > h48
    })

    // Entregues esta semana
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const entreguesSemana = orders.filter(o => 
      isDeliveredStatus(o.status) && (o.deliveredAt || o.date || '').slice(0, 10) >= weekAgo
    ).length

    return {
      total: active.length,
      byStatus,
      valorAtivo,
      entregasHoje,
      entreguesSemana,
      alertas: {
        atrasadas: atrasadas.length,
        emEsperaLonga: emEsperaLonga.length,
        faltasAntigas: faltasAntigas.length,
      },
      listaAtrasadas: atrasadas.slice(0, 5),
    }
  }, [orders])

  const [showDashboard, setShowDashboard] = useState(true)
  const totalAlertas = dashboardStats.alertas.atrasadas + dashboardStats.alertas.emEsperaLonga + dashboardStats.alertas.faltasAntigas

  return (
    <div>
      {/* Dashboard KPI */}
      <div className="card" style={{ marginBottom: '16px', color: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showDashboard ? '16px' : 0 }}>
          <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            📊 Painel Operacional
            {totalAlertas > 0 && (
              <span style={{ background: '#ef4444', color: '#fff', padding: '2px 8px', borderRadius: '999px', fontSize: '12px', fontWeight: '600' }}>
                {totalAlertas} alerta{totalAlertas > 1 ? 's' : ''}
              </span>
            )}
          </h4>
          <button 
            className="btn-ghost" 
            onClick={() => setShowDashboard(!showDashboard)}
            style={{ color: '#94a3b8', fontSize: '12px' }}
          >
            {showDashboard ? '▲ Recolher' : '▼ Expandir'}
          </button>
        </div>

        {showDashboard && (
          <>
            {/* KPIs principais */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '16px' }}>
              <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '28px', fontWeight: '700', color: '#60a5fa' }}>{dashboardStats.total}</div>
                <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase' }}>Ativas</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '28px', fontWeight: '700', color: '#34d399' }}>{dashboardStats.entregasHoje}</div>
                <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase' }}>Hoje</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '28px', fontWeight: '700', color: '#a78bfa' }}>{dashboardStats.entreguesSemana}</div>
                <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase' }}>Semana</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '28px', fontWeight: '700', color: '#fbbf24' }}>{dashboardStats.valorAtivo.toFixed(0)}€</div>
                <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase' }}>Em pipeline</div>
              </div>
            </div>

            {/* Estados do pipeline */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: totalAlertas > 0 ? '16px' : 0 }}>
              {Object.entries(dashboardStats.byStatus).map(([st, count]) => (
                <div key={st} style={{ 
                  background: 'rgba(255,255,255,0.05)', 
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '6px', 
                  padding: '6px 12px',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <span style={{ fontWeight: '600' }}>{count}</span>
                  <span style={{ color: '#94a3b8' }}>{st}</span>
                </div>
              ))}
            </div>

            {/* Alertas */}
            {totalAlertas > 0 && (
              <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '12px' }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#fca5a5', marginBottom: '8px' }}>⚠️ Atenção necessária</div>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '13px' }}>
                  {dashboardStats.alertas.atrasadas > 0 && (
                    <span>🔴 <strong>{dashboardStats.alertas.atrasadas}</strong> atrasada{dashboardStats.alertas.atrasadas > 1 ? 's' : ''}</span>
                  )}
                  {dashboardStats.alertas.emEsperaLonga > 0 && (
                    <span>🟡 <strong>{dashboardStats.alertas.emEsperaLonga}</strong> em espera +24h</span>
                  )}
                  {dashboardStats.alertas.faltasAntigas > 0 && (
                    <span>🟠 <strong>{dashboardStats.alertas.faltasAntigas}</strong> com faltas +48h</span>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Filtros */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div className="grid" style={{ rowGap: '12px' }}>
          <div className="span-12" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button className={pipeView === 'ativas' ? 'btn' : 'btn-secondary'} onClick={() => setPipeView('ativas')}>
              📋 Ativas
            </button>
            <button className={pipeView === 'entregues' ? 'btn' : 'btn-secondary'} onClick={() => setPipeView('entregues')}>
              ✅ Entregues
            </button>
            <button className={pipeView === 'massa' ? 'btn' : 'btn-secondary'} onClick={() => setPipeView('massa')}>
              📦 Em massa
            </button>
          </div>

          <div className="span-4">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Pesquisar cliente, contrato, n.º..."
            />
          </div>

          {pipeView === 'ativas' && (
            <div className="span-3">
              <select value={status} onChange={e => setStatus(e.target.value)}>
                <option value="todos">Todos os estados</option>
                {Object.keys(ORDER_STATUS).filter(s => s !== 'CANCELADA' && s !== 'ENTREGUE').map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          )}

          {pipeView === 'massa' && (
            <div className="span-3">
              <select value={massFilter} onChange={e => setMassFilter(e.target.value)}>
                <option value="pendentes">Pendentes ({massCounts?.pendentes})</option>
                <option value="em_lote">Em lote ({massCounts?.emLote})</option>
                <option value="entregues">Entregues ({massCounts?.entregues})</option>
                <option value="todos">Todos ({massCounts?.total})</option>
              </select>
            </div>
          )}

          <div className="span-2">
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
              <option value="data-desc">Data ↓</option>
              <option value="data-asc">Data ↑</option>
              <option value="estado">Estado</option>
              <option value="cliente">Cliente</option>
            </select>
          </div>

          <div className="span-3" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
            <span style={{ fontSize: '13px', color: '#666' }}>
              {sorted.length} encomenda(s)
            </span>
          </div>
        </div>
      </div>

      {/* Tabela */}
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              {pipeView === 'massa' && (
                <th style={{ width: '30px', textAlign: 'center' }}>
                  <input 
                    type="checkbox" 
                    checked={selectedBulkOrders.size > 0 && selectedBulkOrders.size === paged.length && paged.length > 0}
                    onChange={toggleSelectAllBulk}
                    title="Selecionar tudo"
                  />
                </th>
              )}
              <th style={{ width: '20px' }}></th>
              <th>N.º</th>
              <th>Data</th>
              <th>Cliente</th>
              <th>Contrato</th>
              <th>Local</th>
              <th>Estado</th>
              <th>Valor</th>
              <th style={{ width: '150px' }}></th>
            </tr>
          </thead>
          <tbody>
            {paged.map(o => {
              // Calcular urgência
              const now = Date.now()
              const deliveryDate = o.date ? new Date(o.date + 'T23:59:59').getTime() : null
              const isLate = deliveryDate && deliveryDate < now && !['ENTREGUE', 'CANCELADA'].includes(o.status)
              const isToday = o.date === new Date().toISOString().slice(0, 10)
              const createdAt = o.createdAt ? new Date(o.createdAt).getTime() : null
              const isOld = o.status === 'ESPERA' && createdAt && (now - createdAt) > 24 * 60 * 60 * 1000

              let urgencyIcon = null
              let rowStyle = {}
              if (isLate) {
                urgencyIcon = <span title="Atrasada" style={{ color: '#ef4444' }}>🔴</span>
                rowStyle = { background: 'rgba(239,68,68,0.05)' }
              } else if (isOld) {
                urgencyIcon = <span title="Em espera +24h" style={{ color: '#f59e0b' }}>🟡</span>
                rowStyle = { background: 'rgba(245,158,11,0.05)' }
              } else if (isToday) {
                urgencyIcon = <span title="Entrega hoje" style={{ color: '#3b82f6' }}>🔵</span>
              }

              const isSelected = selectedBulkOrders.has(o.id)

              return (
                <tr key={o.id} style={{ ...rowStyle, background: isSelected ? 'rgba(59,130,246,0.1)' : rowStyle.background }}>
                  {pipeView === 'massa' && (
                    <td style={{ textAlign: 'center', padding: '8px 4px' }}>
                      <input 
                        type="checkbox" 
                        checked={isSelected}
                        onChange={() => toggleBulkOrder(o.id)}
                      />
                    </td>
                  )}
                  <td style={{ textAlign: 'center', padding: '8px 4px' }}>{urgencyIcon}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                    <span className="order-no-cell">
                      {orderNoLabel(o)}
                      <button 
                        className="copy-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          navigator.clipboard.writeText(orderNoLabel(o))
                          // Remove copied class from all other buttons
                          document.querySelectorAll('.copy-btn.copied').forEach(btn => btn.classList.remove('copied'))
                          e.currentTarget.classList.add('copied')
                        }}
                        title="Copiar número"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                      </button>
                    </span>
                  </td>
                  <td>{fmtDateShort(o.date)}</td>
                  <td>{clientUsernameById[getOrderClientId(o)] || o.clientName || '—'}</td>
                  <td>{contractName[o.contractId] || '—'}</td>
                  <td>{locationName[o.locationId] || '—'}</td>
                  <td>
                    <span dangerouslySetInnerHTML={{ __html: badgeHtml(o) }} />
                    {o.armazem && <span className="warehouse-mini-badge" title={WAREHOUSE_NAMES[o.armazem] || o.armazem}>{WAREHOUSE_SHORT[o.armazem] || o.armazem}</span>}
                    {o.armazem && o.zona && o.armazem !== o.zona && <span className="cross-warehouse-mini" title="Cross-warehouse">⚠️</span>}
                  </td>
                  <td style={{ textAlign: 'right' }}>{orderTotalValue(o).toFixed(2)}€</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn-ghost" style={{ padding: '4px' }} onClick={() => setDetailOrder(o)} title="Ver detalhes">📋</button>
                    <button className="btn-ghost" style={{ padding: '4px' }} onClick={() => setFlowOrder(o)} title="Timeline">⏱️</button>
                    <button className="btn-ghost" style={{ padding: '4px' }} onClick={() => exportOrderPDF(o)} title="PDF">📄</button>
                  </td>
                </tr>
              )
            })}
            {paged.length === 0 && (
              <tr><td colSpan={pipeView === 'massa' ? 10 : 9} className="muted" style={{ textAlign: 'center' }}>Sem encomendas.</td></tr>
            )}
          </tbody>
        </table>

        {/* Barra de ações em massa */}
        {pipeView === 'massa' && selectedBulkOrders.size > 0 && (
          <div style={{
            padding: '16px',
            background: '#ecf0f1',
            border: '1px solid #cbd5e1',
            borderTop: 'none',
            borderBottomLeftRadius: '8px',
            borderBottomRightRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div>
              <strong>{selectedBulkOrders.size}</strong> encomenda(s) selecionada(s)
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn-secondary" onClick={() => setSelectedBulkOrders(new Set())}>
                Limpar
              </button>
              <button 
                className="btn" 
                onClick={() => {
                  // Verificar se todas têm carrier
                  const selectedArr = orders.filter(o => selectedBulkOrders.has(o.id))
                  const semCarrier = selectedArr.filter(o => !o.carrier)
                  if (semCarrier.length > 0) {
                    const nomes = semCarrier.map(o => o.clientName || o.id).slice(0, 5).join(', ')
                    alert(`⚠️ ${semCarrier.length} encomenda(s) sem transportadora:\n${nomes}${semCarrier.length > 5 ? '...' : ''}\n\nDefine a transportadora em cada encomenda antes de enviar para preparação.`)
                    return
                  }
                  const summary = calculateBulkSummary()
                  if (summary) setBulkSummaryModal(summary)
                }}
              >
                📦 Enviar {selectedBulkOrders.size} para Preparação
              </button>
            </div>
          </div>
        )}

        <Pagination
          page={page}
          totalPages={totalPages}
          onChange={setPage}
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[12, 25, 50]}
        />
      </div>

      {/* Modal de detalhe */}
      <Modal open={!!detailOrder} onClose={() => setDetailOrder(null)} title={`Encomenda ${orderNoLabel(detailOrder)}`}>
        {detailOrder && (
          <OrderDetail
            order={detailOrder}
            contractName={contractName}
            locationName={locationName}
            onMove={(to) => { moveMut.mutate({ id: detailOrder.id, to, fromStatus: detailOrder.status }); setDetailOrder(null) }}
            onCancel={() => { cancelMut.mutate(detailOrder.id); setDetailOrder(null) }}
            onReactivate={() => { reactivateMut.mutate(detailOrder.id); setDetailOrder(null) }}
            onDelete={() => { deleteMut.mutate(detailOrder.id); setDetailOrder(null) }}
            onCarrierChange={(carrier) => carrierMut.mutate({ id: detailOrder.id, carrier })}
            onArmazemChange={(armazem) => armazemMut.mutate({ id: detailOrder.id, armazem })}
            onForcePartial={() => { setDetailOrder(null); setForcePartialOrder(detailOrder) }}
          />
        )}
      </Modal>

      {/* Modal de resumo bulk */}
      <Modal open={!!bulkSummaryModal} onClose={() => setBulkSummaryModal(null)} title="📦 Resumo para Preparação">
        {bulkSummaryModal && (
          <div style={{ display: 'grid', gap: '16px' }}>
            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                <div style={{ fontSize: '12px', color: '#60a5fa', marginBottom: '4px' }}>Subencomendas</div>
                <div style={{ fontSize: '24px', fontWeight: 700, color: '#93c5fd' }}>{bulkSummaryModal.count}</div>
              </div>
              <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                <div style={{ fontSize: '12px', color: '#34d399', marginBottom: '4px' }}>Total de Produtos</div>
                <div style={{ fontSize: '24px', fontWeight: 700, color: '#6ee7b7' }}>{bulkSummaryModal.totalQty.toFixed(2)}</div>
              </div>
              <div style={{ background: 'rgba(249, 115, 22, 0.1)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(249, 115, 22, 0.2)' }}>
                <div style={{ fontSize: '12px', color: '#fb923c', marginBottom: '4px' }}>Valor Total</div>
                <div style={{ fontSize: '24px', fontWeight: 700, color: '#fdba74' }}>{bulkSummaryModal.totalValue.toFixed(2)}€</div>
              </div>
              <div style={{ background: 'rgba(168, 85, 247, 0.1)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(168, 85, 247, 0.2)' }}>
                <div style={{ fontSize: '12px', color: '#c084fc', marginBottom: '4px' }}>Encomendas</div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#d8b4fe', lineHeight: '1.4' }}>
                  {bulkSummaryModal.orders.map(o => orderNoLabel(o)).join(', ')}
                </div>
              </div>
            </div>

            {/* Tabela de produtos */}
            <div>
              <h5 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 600, color: 'var(--ui-text-dim)' }}>Produtos a preparar</h5>
              <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <th style={{ textAlign: 'left', padding: '10px 8px', color: 'var(--ui-text-dim)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Produto</th>
                    <th style={{ textAlign: 'right', padding: '10px 8px', width: '80px', color: 'var(--ui-text-dim)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Qtd</th>
                    <th style={{ textAlign: 'right', padding: '10px 8px', width: '80px', color: 'var(--ui-text-dim)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(bulkSummaryModal.items).map(([product, data]) => (
                    <tr key={product} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '12px 8px', color: 'var(--ui-text)' }}>{product}</td>
                      <td style={{ textAlign: 'right', padding: '12px 8px', color: 'var(--ui-text)' }}>{data.qty.toFixed(2)}</td>
                      <td style={{ textAlign: 'right', padding: '12px 8px', color: '#34d399', fontWeight: 500 }}>{data.value.toFixed(2)}€</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Ações */}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button className="btn-secondary" onClick={() => setBulkSummaryModal(null)}>
                Cancelar
              </button>
              <button 
                className="btn" 
                disabled={bulkSendMut.isPending}
                onClick={() => {
                  bulkSendMut.mutate({
                    orderIds: Array.from(selectedBulkOrders)
                  }, {
                    onSuccess: () => {
                      setBulkSummaryModal(null)
                      setSelectedBulkOrders(new Set())
                    }
                  })
                }}
              >
                {bulkSendMut.isPending ? '⏳ Enviando...' : '✅ Confirmar Envio'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal de timeline */}
      <Modal open={!!flowOrder} onClose={() => setFlowOrder(null)} title={`Timeline ${orderNoLabel(flowOrder)}`}>
        {flowOrder && (
          <OrderTimeline
            order={flowOrder}
            events={flowEvents}
            loading={flowLoading}
          />
        )}
      </Modal>

      {/* Modal de expedição parcial */}
      <Modal open={!!forcePartialOrder} onClose={() => setForcePartialOrder(null)} title="⚡ Expedição Parcial">
        {forcePartialOrder && (
          <ForcePartialModal
            order={forcePartialOrder}
            onConfirm={(targetStatus, notes) => {
              forcePartialMut.mutate({ id: forcePartialOrder.id, targetStatus, notes })
            }}
            onCancel={() => setForcePartialOrder(null)}
            isPending={forcePartialMut.isPending}
          />
        )}
      </Modal>
    </div>
  )
}

// ==================== ORDER DETAIL ====================

function OrderDetail({ order, contractName, locationName, onMove, onCancel, onReactivate, onDelete, onCarrierChange, onArmazemChange, onForcePartial }) {
  const { can } = usePermissions()
  const items = itemsOf(order)
  const total = items.reduce((s, it) => s + (+it.qty || 0) * (+it.preco || 0), 0)
  const cName = contractName[order.contractId] || '—'
  const lName = locationName[order.locationId] || '—'

  // Condições de estado
  const stateCanSendToPrep = order.status === 'ESPERA'
  const stateCanCancel = !['ENTREGUE', 'CANCELADA'].includes(order.status)
  const stateCanReactivate = order.status === 'CANCELADA'
  const stateCanDelete = order.status === 'ESPERA' || order.status === 'CANCELADA'
  const stateCanForcePartial = order.status === 'FALTAS' || order.status === 'PREP'
  
  // Combinar condições de estado com permissões
  const canSendToPrep = stateCanSendToPrep && can('orders.status')
  const canCancel = stateCanCancel && can('orders.cancel')
  const canReactivate = stateCanReactivate && can('orders.status')
  const canDelete = stateCanDelete && can('orders.delete')
  const canChangeCarrier = can('orders.edit')
  const canChangeArmazem = can('orders.edit')
  const canForcePartial = stateCanForcePartial && can('orders.status')

  // Cross-warehouse: o armazém de preparação é diferente do "natural"
  const isCrossWarehouse = order.armazem && order.zona && order.armazem !== order.zona

  return (
    <div style={{ padding: '8px 16px 16px' }}>
      {/* Cross-warehouse alert */}
      {isCrossWarehouse && (
        <div className="cross-warehouse-alert">
          ⚠️ Cross-warehouse: zona {WAREHOUSE_SHORT[order.zona] || order.zona} preparada em {WAREHOUSE_NAMES[order.armazem] || order.armazem}
        </div>
      )}

      <div className="grid" style={{ marginBottom: '16px' }}>
        <div className="span-6">
          <strong>Cliente:</strong> {order.clientName || '—'}<br />
          <strong>Contrato:</strong> {cName}<br />
          <strong>Local:</strong> {lName}
        </div>
        <div className="span-6">
          <strong>Data:</strong> {fmtDate(order.date) || '—'}<br />
          <strong>Estado:</strong> <span dangerouslySetInnerHTML={{ __html: statusBadge(order) }} /><br />
          <strong>Transporte:</strong>
          <select
            value={order.carrier || ''}
            onChange={e => onCarrierChange(e.target.value)}
            disabled={!canChangeCarrier}
            title={canChangeCarrier ? undefined : 'Sem permissão para alterar transportadora'}
            style={{
              marginLeft: '8px',
              opacity: canChangeCarrier ? 1 : 0.5,
              ...((!order.carrier && stateCanSendToPrep) ? {
                border: '2px solid #f59e0b',
                background: 'rgba(245,158,11,0.1)',
                borderRadius: '6px',
                padding: '2px 6px',
                fontWeight: 600
              } : {})
            }}
          >
            <option value="">⚠️ Por atribuir</option>
            <option value={CARRIERS.INTERNO}>Nossos carros</option>
            <option value={CARRIERS.SANTOSVALE}>Santos e Vale</option>
            <option value={CARRIERS.STEFF}>STEFF (frio)</option>
          </select>
          {!order.carrier && stateCanSendToPrep && (
            <div style={{ marginTop: '4px', fontSize: '11px', color: '#f59e0b', fontWeight: 500 }}>
              ⚠️ Define a transportadora antes de enviar para preparação
            </div>
          )}
          <br />
          <strong>Armazém:</strong>
          <select
            value={order.armazem || ''}
            onChange={e => onArmazemChange(e.target.value)}
            disabled={!canChangeArmazem}
            title={canChangeArmazem ? 'Armazém que prepara a encomenda' : 'Sem permissão'}
            className={isCrossWarehouse ? 'cross-warehouse-select' : ''}
            style={{
              marginLeft: '8px',
              opacity: canChangeArmazem ? 1 : 0.5,
            }}
          >
            <option value="">Não atribuído</option>
            {Object.entries(WAREHOUSE_NAMES).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          {isCrossWarehouse && (
            <span className="cross-warehouse-chip">⚠️ Cross</span>
          )}
        </div>
      </div>

      <h4>Produtos ({items.length})</h4>
      <table className="table">
        <thead>
          <tr>
            <th>Produto</th>
            <th>Un.</th>
            <th style={{ textAlign: 'right' }}>Qtd</th>
            <th style={{ textAlign: 'right' }}>Prep.</th>
            <th style={{ textAlign: 'right' }}>Falta</th>
            <th style={{ textAlign: 'right' }}>Preço</th>
            <th style={{ textAlign: 'right' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => {
            const miss = Math.max(0, (+it.qty || 0) - (+it.preparedQty || 0))
            return (
              <tr key={i}>
                <td>{it.productName || it.nome || '—'}</td>
                <td>{it.unidade || '—'}</td>
                <td style={{ textAlign: 'right' }}>{(+it.qty || 0).toFixed(2)}</td>
                <td style={{ textAlign: 'right' }}>{(+it.preparedQty || 0).toFixed(2)}</td>
                <td style={{ textAlign: 'right' }}>
                  {miss > 0 ? <Badge color="orange">{miss.toFixed(2)}</Badge> : <Badge color="green">OK</Badge>}
                </td>
                <td style={{ textAlign: 'right' }}>{(+it.preco || 0).toFixed(2)}€</td>
                <td style={{ textAlign: 'right' }}>{((+it.qty || 0) * (+it.preco || 0)).toFixed(2)}€</td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan="6" style={{ textAlign: 'right', fontWeight: '600' }}>Total:</td>
            <td style={{ textAlign: 'right', fontWeight: '600' }}>{total.toFixed(2)}€</td>
          </tr>
        </tfoot>
      </table>

      <div className="hr" style={{ margin: '16px 0' }}></div>

      <h4>Ações</h4>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {canSendToPrep && (
          <button
            className="btn"
            onClick={() => {
              if (!order.carrier) {
                alert('⚠️ Transportadora obrigatória!\n\nDefine primeiro a transportadora antes de enviar para preparação.')
                return
              }
              onMove('PREP')
            }}
            style={!order.carrier ? { opacity: 0.6 } : undefined}
          >
            {!order.carrier ? '⚠️ ' : ''}Enviar para Preparação →
          </button>
        )}
        {order.status === 'FALTAS' && can('orders.status') && (
          <button className="btn-secondary" onClick={() => onMove('PREP')}>
            Forçar para PREP
          </button>
        )}
        {canForcePartial && (
          <button 
            className="btn-warning" 
            onClick={onForcePartial}
            title="Avançar com produtos disponíveis, ignorando faltas"
          >
            ⚡ Expedição Parcial
          </button>
        )}
        {canCancel && (
          <button className="btn-danger" onClick={() => {
            if (confirm('Cancelar esta encomenda?')) onCancel()
          }}>
            Cancelar
          </button>
        )}
        {canReactivate && (
          <button className="btn-secondary" onClick={onReactivate}>
            Reativar
          </button>
        )}
        {canDelete && (
          <button className="btn-ghost" style={{ color: '#ef4444' }} onClick={() => {
            if (confirm('Eliminar definitivamente esta encomenda? Esta ação não pode ser revertida.')) onDelete()
          }}>
            🗑️ Eliminar
          </button>
        )}
      </div>
    </div>
  )
}

// ==================== FORCE PARTIAL MODAL ====================

function ForcePartialModal({ order, onConfirm, onCancel, isPending }) {
  const [targetStatus, setTargetStatus] = useState('FATURACAO')
  const [notes, setNotes] = useState('')
  
  const items = itemsOf(order)
  const itemsOK = items.filter(it => (+it.preparedQty || 0) >= (+it.qty || 0))
  const itemsFalta = items.filter(it => (+it.preparedQty || 0) < (+it.qty || 0))
  
  const totalOriginal = items.reduce((s, it) => s + (+it.qty || 0) * (+it.preco || 0), 0)
  const totalParcial = items.reduce((s, it) => s + Math.min(+it.preparedQty || 0, +it.qty || 0) * (+it.preco || 0), 0)
  const diferenca = totalOriginal - totalParcial

  return (
    <div style={{ padding: '8px' }}>
      {/* Aviso */}
      <div style={{
        background: 'rgba(245, 158, 11, 0.1)',
        border: '1px solid rgba(245, 158, 11, 0.3)',
        borderRadius: '8px',
        padding: '12px 16px',
        marginBottom: '16px',
        display: 'flex',
        gap: '12px',
        alignItems: 'flex-start'
      }}>
        <span style={{ fontSize: '20px' }}>⚠️</span>
        <div style={{ fontSize: '13px', color: '#f59e0b' }}>
          <strong>Atenção:</strong> Esta ação irá avançar a encomenda para faturação/expedição 
          apenas com os produtos disponíveis. Os produtos em falta <strong>não serão incluídos</strong>.
        </div>
      </div>

      {/* Resumo */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
        <div style={{ background: 'rgba(34, 197, 94, 0.1)', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#22c55e', marginBottom: '4px' }}>Produtos OK</div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#22c55e' }}>{itemsOK.length}</div>
        </div>
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#ef4444', marginBottom: '4px' }}>Com Falta</div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#ef4444' }}>{itemsFalta.length}</div>
        </div>
        <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#3b82f6', marginBottom: '4px' }}>Diferença</div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#3b82f6' }}>-{diferenca.toFixed(2)}€</div>
        </div>
      </div>

      {/* Tabela de produtos com falta */}
      {itemsFalta.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <h5 style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: 600, color: 'var(--ui-text-dim)' }}>
            Produtos que ficarão de fora:
          </h5>
          <div style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px' }}>
            <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.2)' }}>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Produto</th>
                  <th style={{ padding: '8px', textAlign: 'right', width: '60px' }}>Pedido</th>
                  <th style={{ padding: '8px', textAlign: 'right', width: '60px' }}>Prep.</th>
                  <th style={{ padding: '8px', textAlign: 'right', width: '60px' }}>Falta</th>
                </tr>
              </thead>
              <tbody>
                {itemsFalta.map((it, i) => {
                  const falta = Math.max(0, (+it.qty || 0) - (+it.preparedQty || 0))
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '8px' }}>{it.productName || it.nome || '—'}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{(+it.qty || 0).toFixed(2)}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{(+it.preparedQty || 0).toFixed(2)}</td>
                      <td style={{ padding: '8px', textAlign: 'right', color: '#ef4444', fontWeight: 600 }}>{falta.toFixed(2)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Destino */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
          Avançar para:
        </label>
        <select
          value={targetStatus}
          onChange={e => setTargetStatus(e.target.value)}
          style={{ width: '100%', padding: '10px', borderRadius: '6px', fontSize: '14px' }}
        >
          <option value="FATURACAO">📄 Faturação</option>
          <option value="EXPEDIDA">🚛 Expedição (saltar faturação)</option>
        </select>
      </div>

      {/* Notas */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
          Notas (opcional):
        </label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Ex: Cliente aceitou entrega parcial, restante será enviado depois..."
          rows={2}
          style={{ width: '100%', padding: '10px', borderRadius: '6px', fontSize: '13px', resize: 'vertical' }}
        />
      </div>

      {/* Ações */}
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
        <button className="btn-secondary" onClick={onCancel} disabled={isPending}>
          Cancelar
        </button>
        <button 
          className="btn-warning" 
          onClick={() => onConfirm(targetStatus, notes)}
          disabled={isPending}
        >
          {isPending ? '⏳ A processar...' : '⚡ Confirmar Expedição Parcial'}
        </button>
      </div>
    </div>
  )
}

// ==================== ORDER TIMELINE ====================

function OrderTimeline({ order, events, loading }) {
  const sorted = useMemo(() => {
    return [...(events || [])].sort((a, b) => (a.at || '').localeCompare(b.at || ''))
  }, [events])

  const parse = (s) => { const d = new Date(s); return isNaN(d) ? null : d.getTime() }

  const eventConfig = {
    CREATED: { icon: '📝', color: '#3b82f6', label: 'Encomenda criada', dept: 'Sistema' },
    SEND_TO_PREP: { icon: '📤', color: '#8b5cf6', label: 'Enviada para preparação', dept: 'Warehouse' },
    PREP_STARTED: { icon: '⚙️', color: '#f59e0b', label: 'Preparação iniciada', dept: 'Warehouse' },
    PREP_CLOSED_OK: { icon: '✅', color: '#10b981', label: 'Preparação concluída (OK)', dept: 'Warehouse' },
    PREP_CLOSED_MISSING: { icon: '⚠️', color: '#f97316', label: 'Preparação com faltas', dept: 'Warehouse' },
    MISSING_RESOLVED: { icon: '🔧', color: '#06b6d4', label: 'Faltas resolvidas', dept: 'Compras' },
    FORCED_PARTIAL: { icon: '⚡', color: '#f59e0b', label: 'Expedição parcial forçada', dept: 'Gestão' },
    INVOICED: { icon: '💰', color: '#6366f1', label: 'Fatura emitida', dept: 'Faturação' },
    ROUTE_ASSIGNED: { icon: '📍', color: '#ec4899', label: 'Atribuída a rota', dept: 'Rotas' },
    ROUTE_STARTED: { icon: '🚗', color: '#ef4444', label: 'Rota iniciada', dept: 'Rotas' },
    DELIVERED: { icon: '🎉', color: '#22c55e', label: 'Entregue', dept: 'Entrega' },
    DELIVERY_ISSUE: { icon: '❌', color: '#dc2626', label: 'Problema na entrega', dept: 'Entrega' },
    CANCELLED: { icon: '🛑', color: '#6b7280', label: 'Cancelada', dept: 'Sistema' },
    REACTIVATED: { icon: '↩️', color: '#14b8a6', label: 'Reativada', dept: 'Sistema' },
  }

  const timeline = sorted.map((ev, idx) => {
    const curr = parse(ev.at)
    const prev = idx > 0 ? parse(sorted[idx - 1].at) : null
    const delta = curr && prev ? curr - prev : null
    const config = eventConfig[ev.type] || { icon: '•', color: '#64748b', label: ev.type, dept: '—' }
    return { ...ev, delta, ...config }
  })

  const totalTime = useMemo(() => {
    if (!timeline.length) return null
    const first = parse(timeline[0]?.at)
    const last = parse(timeline[timeline.length - 1]?.at)
    return first && last ? last - first : null
  }, [timeline])

  const departmentStats = useMemo(() => {
    const stats = {}
    let lastDept = null
    
    timeline.forEach((ev) => {
      const dept = ev.dept || '—'
      if (dept !== lastDept && lastDept) {
        stats[lastDept] = stats[lastDept] || { time: 0, events: [] }
      }
      lastDept = dept
    })

    return stats
  }, [timeline])

  return (
    <div style={{ padding: '12px 16px 16px', maxHeight: '70vh', overflowY: 'auto' }}>
      {/* Header Info */}
      <div className="card" style={{ padding: '12px', background: '#e2e8f0', marginBottom: '16px', borderRadius: '8px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '13px' }}>
          <div>
            <div style={{ color: '#64748b', fontSize: '12px' }}>Encomenda</div>
            <div style={{ fontWeight: 600, fontSize: '14px', color: '#1e293b' }}>{orderNoLabel(order)}</div>
          </div>
          <div>
            <div style={{ color: '#64748b', fontSize: '12px' }}>Cliente</div>
            <div style={{ fontWeight: 600, fontSize: '14px', color: '#1e293b' }}>{order.clientName || '—'}</div>
          </div>
          <div>
            <div style={{ color: '#64748b', fontSize: '12px' }}>Data entrega</div>
            <div style={{ fontWeight: 600, fontSize: '14px', color: '#1e293b' }}>{fmtDate(order.date) || '—'}</div>
          </div>
          <div>
            <div style={{ color: '#64748b', fontSize: '12px' }}>Estado atual</div>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>
              <span dangerouslySetInnerHTML={{ __html: statusBadge(order) }} />
            </div>
          </div>
          {totalTime && (
            <>
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ color: '#64748b', fontSize: '12px' }}>Tempo total no pipeline</div>
                <div style={{ fontWeight: 600, fontSize: '14px', color: '#7c3aed' }}>
                  {fmtDuration(totalTime)}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Timeline */}
      {loading && <p className="muted">A carregar histórico…</p>}

      {!loading && !timeline.length && (
        <div style={{ 
          padding: '40px 16px', 
          textAlign: 'center', 
          background: '#f1f5f9', 
          borderRadius: '8px',
          color: '#64748b'
        }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>📭</div>
          <p>Ainda não há eventos registados para esta encomenda.</p>
          <p style={{ fontSize: '12px', marginTop: '12px', color: '#94a3b8' }}>
            Crie uma nova encomenda ou mude o estado de uma existente para gerar eventos.
          </p>
        </div>
      )}

      {!loading && !!timeline.length && (
        <div style={{ position: 'relative' }}>
          {/* Linha vertical de conexão - dinâmica baseada no número de eventos */}
          <div style={{
            position: 'absolute',
            left: '33px',
            top: '16px',
            height: `calc((${timeline.length} - 1) * 86px + 48px)`,
            width: '2px',
            background: 'linear-gradient(180deg, #cbd5e1 0%, #a1aec9 100%)',
          }} />

          {/* Eventos */}
          <div style={{ display: 'grid', gap: '16px' }}>
            {timeline.map((ev, i) => (
              <div key={ev.id || i} style={{
                padding: '12px 16px',
                background: 'rgba(241, 245, 249, 0.85)',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                position: 'relative',
                marginLeft: '60px',
              }}>
                {/* Ponto de timeline */}
                <div style={{
                  position: 'absolute',
                  left: '-42px',
                  top: '16px',
                  width: '32px',
                  height: '32px',
                  background: ev.color || '#64748b',
                  border: '3px solid #fff',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '16px',
                  boxShadow: '0 0 0 2px #e2e8f0',
                  zIndex: 10,
                }}>
                  {ev.icon}
                </div>

                {/* Conteúdo */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 600, fontSize: '14px', color: '#1e293b' }}>{ev.label}</span>
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      background: (ev.color || '#64748b') + '20',
                      color: ev.color || '#64748b',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 500,
                    }}>
                      {ev.dept}
                    </span>
                    {ev.delta != null && (
                      <span style={{
                        marginLeft: 'auto',
                        fontSize: '12px',
                        color: '#64748b',
                        padding: '2px 8px',
                        background: '#f1f5f9',
                        borderRadius: '4px',
                      }}>
                        +{fmtDuration(ev.delta)}
                      </span>
                    )}
                  </div>

                  {/* Detalhes */}
                  <div style={{ fontSize: '12px', color: '#64748b', display: 'grid', gap: '4px' }}>
                    <div>
                      <span style={{ display: 'inline-block', width: '80px' }}>
                        <strong>Hora:</strong>
                      </span>
                      <span style={{ fontFamily: 'monospace', color: '#1e293b', fontWeight: 500 }}>
                        {ev.at ? new Date(ev.at).toLocaleString('pt-PT') : '—'}
                      </span>
                    </div>

                    {ev.byName && (
                      <div>
                        <span style={{ display: 'inline-block', width: '80px' }}>
                          <strong>Utilizador:</strong>
                        </span>
                        <span style={{ color: '#1e293b', fontWeight: 500 }}>{ev.byName}</span>
                        {ev.role && <span style={{ color: '#64748b' }}> ({ev.role})</span>}
                      </div>
                    )}

                    {ev.meta?.fromStatus && ev.meta?.toStatus && (
                      <div style={{ padding: '6px 8px', background: '#f8fafc', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                        <span style={{ display: 'inline-block', width: '80px' }}>
                          <strong>Transição:</strong>
                        </span>
                        <span style={{ color: '#1e293b', fontWeight: 500 }}>{ev.meta.fromStatus}</span>
                        <span style={{ color: '#475569' }}> → </span>
                        <span style={{ color: '#047857', fontWeight: 600 }}>{ev.meta.toStatus}</span>
                      </div>
                    )}

                    {ev.meta?.notes && (
                      <div>
                        <span style={{ display: 'inline-block', width: '80px' }}>
                          <strong>Notas:</strong>
                        </span>
                        <span style={{ color: '#475569', fontStyle: 'italic' }}>{ev.meta.notes}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Resumo por departamento */}
          {timeline.length > 1 && (
            <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '2px solid #e2e8f0' }}>
              <h5 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 600 }}>📊 Resumo por departamento</h5>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                {[...new Set(timeline.map(e => e.dept))].map((dept) => {
                  const deptEvents = timeline.filter(e => e.dept === dept)
                  const firstEvt = deptEvents[0]
                  const lastEvt = deptEvents[deptEvents.length - 1]
                  const firstTime = parse(firstEvt?.at)
                  const lastTime = parse(lastEvt?.at)
                  const deptTime = firstTime && lastTime ? lastTime - firstTime : 0
                  
                  return (
                    <div key={dept} style={{
                      padding: '12px',
                      background: (deptEvents[0]?.color || '#64748b') + '10',
                      border: `1px solid ${(deptEvents[0]?.color || '#64748b') + '40'}`,
                      borderRadius: '8px',
                    }}>
                      <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '6px' }}>
                        {deptEvents[0]?.icon} {dept}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>
                        <div>{deptEvents.length} evento{deptEvents.length !== 1 ? 's' : ''}</div>
                        {deptTime > 0 && (
                          <div style={{ color: (deptEvents[0]?.color || '#64748b'), fontWeight: 500, marginTop: '4px' }}>
                            {fmtDuration(deptTime)}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
