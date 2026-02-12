import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { collection, getDocs, query, where, orderBy, updateDoc, doc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthProvider'
import { usePermissions } from '../hooks/usePermissions'
import { useRecordDelivery } from '../hooks/useOrders'
import { PageGuard } from '../components/PageGuard'
import { fmtDate, ORDER_STATUS } from '../lib/utils'
// Helpers partilhados (eliminação de código duplicado)
import {
  toISODate, addDays, fmtTime, pickText, clean, joinNice, cap,
  getClientName, getContractName, formatAddress, getLocationInfo, getOrderLinesGeneric, getPreparedBy
} from '../lib/orderHelpers'
import { useLocationsIndex, useContractsIndex } from '../lib/useFirestoreIndexes'

/* ------------------------------------------------------------------
   Hooks de índices (usam os hooks partilhados)
-------------------------------------------------------------------*/
const useLocations = () => useLocationsIndex()
const useContracts = () => useContractsIndex()

/* ------------------------------------------------------------------
   Queries: Rotas & Recolhas + Orders por rota
-------------------------------------------------------------------*/
function useMyRoutes(startISO, endISO, profile){
  return useQuery({
    queryKey:['driver-routes', startISO, endISO, profile?.id || profile?.motoristaId],
    queryFn: async () => {
      const qRef = query(
        collection(db,'routes'),
        where('date','>=', startISO),
        where('date','<=', endISO),
        orderBy('date','asc')
      )
      const snap = await getDocs(qRef)
      const all = snap.docs.map(d => ({ id:d.id, ...d.data() }))
      const isMine = (r) => (
        r.driverId === profile?.id ||
        r.driverId === profile?.motoristaId ||
        r.driverName === profile?.name ||
        r.assignedTo === profile?.name
      )
      return all.filter(isMine)
    },
    enabled: !!startISO && !!endISO && !!profile
  })
}
function useMyPickups(startISO, endISO, profile){
  return useQuery({
    queryKey:['driver-pickups', startISO, endISO, profile?.id || profile?.motoristaId],
    queryFn: async () => {
      const qRef = query(
        collection(db,'pickups'),
        where('date','>=', startISO),
        where('date','<=', endISO),
        orderBy('date','asc')
      )
      const snap = await getDocs(qRef)
      const all = snap.docs.map(d => ({ id:d.id, ...d.data() }))
      const isMine = (p) => (
        p.driverId === profile?.id ||
        p.assignedDriverId === profile?.id ||
        p.driverName === profile?.name
      )
      return all.filter(isMine)
    },
    enabled: !!startISO && !!endISO && !!profile
  })
}
function useOrdersForRoutes(routeIds){
  return useQuery({
    queryKey:['driver-orders-for-routes', routeIds.slice().sort().join(',')],
    queryFn: async () => {
      const results = await Promise.all(routeIds.map(async (rid)=>{
        const snap = await getDocs(query(collection(db,'orders'), where('routeId','==', rid)))
        return snap.docs.map(d => ({ id:d.id, ...d.data() }))
      }))
      const arr = results.flat()
      const byId = new Map(); arr.forEach(o => byId.set(o.id, o))
      return { list: arr, map: Object.fromEntries(byId.entries()) }
    },
    enabled: routeIds.length > 0
  })
}

/* ------------------------------------------------------------------
   PDF
-------------------------------------------------------------------*/
const escapeHTML = (s='') => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
const buildRoutePdfHtml = (route, orders, { locationsIndex, contractsIndex }) => {
  const rows = (route.orderIds||[]).map((id,i)=>{
    const o = orders.find(x=>x.id===id) || {}
    const client = getClientName(o) || 'Cliente'
    const L = getLocationInfo(o||{}, { locationsIndex, contractsIndex })
    const headSub = joinNice([L.name, L.addr, L.contract ? `Contrato: ${L.contract}` : ''])
    const lines = getOrderLinesGeneric(o||{})
    const linesHtml = lines.length
      ? lines.map(l => `<tr><td>${escapeHTML(l.name)}</td><td class="num">${escapeHTML(l.qty)}</td><td>${escapeHTML(l.unit||'')}</td></tr>`).join('')
      : `<tr><td colspan="3" class="muted">Sem detalhes de itens</td></tr>`
    const out = o?.deliveryOutcome ? ` • ${cap(o.deliveryOutcome.replace('_',' '))}` : ''
    const when = o?.deliveredAt ? ` • entregue ${fmtTime(o.deliveredAt)}` : ''
    return `
      <section class="order">
        <div class="order-head">
          <div class="idx">${i+1}</div>
          <div>
            <div class="client">${escapeHTML(client)}</div>
            <div class="sub">${escapeHTML(headSub||'')}</div>
            <div class="sub">${escapeHTML((o.deliveryNotes||'') + out + when)}</div>
          </div>
        </div>
        <table class="lines">
          <thead><tr><th>Produto</th><th class="num">Qtd</th><th>Un.</th></tr></thead>
          <tbody>${linesHtml}</tbody>
        </table>
      </section>
    `
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
      <div class="chip">Veículo: ${escapeHTML(route.vehicle||'')}</div>
      <div class="chip">Motorista: ${escapeHTML(route.driverName||'')}</div>
      <div class="chip">Hora: ${escapeHTML(route.startTime||'—:—')}</div>
      <div class="chip">Paragens: ${(route.orderIds||[]).length}</div>
      ${route.startedAt ? `<div class="chip">Início: ${fmtTime(route.startedAt)}</div>` : ''}
      ${route.finishedAt ? `<div class="chip">Fim: ${fmtTime(route.finishedAt)}</div>` : ''}
    </div>
  </div>
  ${rows}
  ${route.notes ? `<div class="footer"><b>Obs:</b> ${escapeHTML(route.notes)}</div>` : ''}
</body></html>`
}
const printRoutePdf = (route, orders, ctx) => {
  const html = buildRoutePdfHtml(route, orders, ctx)
  const blob = new Blob([html], { type:'text/html' })
  const url = URL.createObjectURL(blob)
  const iframe = document.createElement('iframe')
  iframe.style.position='fixed'; iframe.style.right='0'; iframe.style.bottom='0'
  iframe.style.width='0'; iframe.style.height='0'; iframe.style.border='0'
  iframe.src = url
  iframe.onload = () => { setTimeout(()=>{ try{ iframe.contentWindow?.focus(); iframe.contentWindow?.print() }catch{} }, 200) }
  document.body.appendChild(iframe)
  setTimeout(()=>{ URL.revokeObjectURL(url); setTimeout(()=> document.body.removeChild(iframe), 1000) }, 10000)
}

/* ------------------------------------------------------------------
   Component
-------------------------------------------------------------------*/
export default function Motorista(){
  const { profile } = useAuth()
  const qc = useQueryClient()

  const locationsIndex = useLocations().data || {}
  const contractsIndex = useContracts().data || {}

  const startISO = toISODate(addDays(new Date(), -1))
  const endISO   = toISODate(addDays(new Date(), 14))

  const routes = useMyRoutes(startISO, endISO, profile).data || []
  const pickups = useMyPickups(startISO, endISO, profile).data || []

  const routeIds = useMemo(() => routes.map(r=>r.id), [routes])
  const ordersForRoutes = useOrdersForRoutes(routeIds).data || { list:[], map:{} }

  const ongoing = routes.find(r => r.status === 'ONGOING')
  const nextIdx = Math.max(0, ongoing?.progressIndex ?? 0)
  const nextStopId = ongoing?.orderIds?.[nextIdx]

  const nextOrder = nextStopId ? ordersForRoutes.map[nextStopId] : null

  const activeRoutes = routes.filter(r => r.status !== 'DONE')
  const doneRoutes = routes.filter(r => r.status === 'DONE')
  const [tab, setTab] = useState('ATIVAS')

const startRoute = useMutation({
  mutationFn: async (r) => {
    const now = new Date().toISOString()

    // 1) Atualiza a rota para ONGOING
    await updateDoc(doc(db, 'routes', r.id), {
      status: 'ONGOING',
      progressIndex: r.progressIndex ?? 0,
      startedAt: now,
    })

    // 2) Põe todas as encomendas desta rota em EXPEDIDA (em entrega)
    //    mas só se ainda estiverem em EMROTA ou A_EXPEDIR
    const snap = await getDocs(
      query(
        collection(db, 'orders'),
        where('routeId', '==', r.id)
      )
    )

    const updates = snap.docs.map((d) => {
      const o = d.data()
      if (
        o.status === ORDER_STATUS.EMROTA ||
        o.status === ORDER_STATUS.A_EXPEDIR
      ) {
        return updateDoc(d.ref, { status: ORDER_STATUS.EXPEDIDA })
      }
      return Promise.resolve()
    })

    await Promise.all(updates)
  },
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ['driver-routes'] })
    qc.invalidateQueries({ queryKey: ['driver-orders-for-routes'] })
  },
})

  const finishRoute = useMutation({
    mutationFn: async (r) => updateDoc(doc(db,'routes',r.id), {
      status:'DONE',
      finishedAt: new Date().toISOString()
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey:['driver-routes'] })
  })
const registerOutcome = useMutation({
  mutationFn: async ({ route, order, outcome }) => {
    const now = new Date().toISOString()

    // Mapear outcome → estado + flag de ocorrências
    let newStatus = ORDER_STATUS.ENTREGUE
    let hasDeliveryIssues = false

    if (outcome.type === 'OK') {
      // Tudo certo → ENTREGUE normal
      newStatus = ORDER_STATUS.ENTREGUE
      hasDeliveryIssues = false
    } else if (outcome.type === 'NAOENTREGUE') {
      // Caso tenhas um botão futuro para "Não entregue"
      newStatus = ORDER_STATUS.NAOENTREGUE
      hasDeliveryIssues = true
    } else {
      // DEVOLVIDO / DANIFICADO / ERRO_FAT etc. → ENTREGUE com alerta
      newStatus = ORDER_STATUS.ENTREGUE
      hasDeliveryIssues = true
    }

    await updateDoc(doc(db, 'orders', order.id), {
      status: newStatus,
      hasDeliveryIssues,
      deliveredAt: now,
      deliveryOutcome: outcome.type,
      deliveryNotes: outcome.notes || '',
    })

    const next = (route.progressIndex ?? 0) + 1
    const done = next >= (route.orderIds?.length || 0)

    await updateDoc(doc(db, 'routes', route.id), {
      progressIndex: next,
      status: done ? 'DONE' : 'ONGOING',
      finishedAt: done ? now : null,
    })
  },
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ['driver-routes'] })
    qc.invalidateQueries({ queryKey: ['driver-orders-for-routes'] })
  },
})


  const recordDelivery = useRecordDelivery()

  const [viewRoute, setViewRoute] = useState(null)
  const [viewOutcomeFor, setViewOutcomeFor] = useState(null)
  const [deliveryItems, setDeliveryItems] = useState([])
  const [expandNextItems, setExpandNextItems] = useState(false)
  const [mapsUrl, setMapsUrl] = useState(null)
  const [mapsError, setMapsError] = useState(null)

  // Inicializar itens de entrega quando abre modal
  const openDeliveryModal = (route, order, type) => {
    // Resolver itens: suportar tanto Array como Object (Firestore map)
    let rawItems = []
    if (Array.isArray(order?.items)) {
      rawItems = order.items
    } else if (order?.items && typeof order.items === 'object') {
      rawItems = Object.values(order.items)
    } else if (Array.isArray(order?.lines)) {
      rawItems = order.lines
    } else if (Array.isArray(order?.products)) {
      rawItems = order.products
    }
    
    const deliveryLines = rawItems.map((srcItem) => {
      const name = srcItem.productName || srcItem.name || srcItem.title || srcItem.descricao || 'Item'
      const unit = srcItem.unidade || srcItem.unit || srcItem.uom || ''
      const invoicedQty = Number(srcItem.preparedQty || srcItem.qty || srcItem.quantity || 0)
      return {
        name,
        unit,
        invoicedQty,
        deliveredQty: type === 'OK' ? invoicedQty : type === 'NAOENTREGUE' ? 0 : invoicedQty,
        returnedQty: 0,
        returnReason: '',
        preco: Number(srcItem.preco || 0),
      }
    })
    setDeliveryItems(deliveryLines)
    setViewOutcomeFor({ route, order, type })
  }

  const updateDeliveryItem = (idx, field, value) => {
    setDeliveryItems(prev => prev.map((it, i) => {
      if (i !== idx) return it
      const updated = { ...it, [field]: value }
      // Auto-calcular devolvido se entregue < faturado
      if (field === 'deliveredQty') {
        const diff = it.invoicedQty - Number(value)
        updated.returnedQty = diff > 0 ? diff : 0
      }
      return updated
    }))
  }

  // Generate Google Maps route URL
  const WAREHOUSE_ADDRESS = '3840-322 Rua das Flores, Ponte de Vagos, Vagos, Aveiro, Portugal'
  
  const generateGoogleMapsRoute = (route) => {
    setMapsUrl(null)
    setMapsError(null)
    
    if (!route?.orderIds?.length) {
      setMapsError('Rota sem paragens definidas')
      return
    }

    // Start with warehouse as origin
    const addresses = [WAREHOUSE_ADDRESS]
    
    for (const oid of route.orderIds) {
      const o = ordersForRoutes.map[oid] || {}
      const L = getLocationInfo(o, { locationsIndex, contractsIndex })
      
      // Try to build a valid address string
      let addressStr = ''
      
      // Priority: full address > name + city > any available
      if (L.addr) {
        addressStr = L.addr
      } else if (L.name) {
        addressStr = L.name
      }
      
      // Also check direct order fields
      if (!addressStr) {
        addressStr = pickText(
          o.deliveryAddress,
          o.address,
          o.morada,
          o.endereco,
          o.location?.address,
          o.entrega?.address
        )
      }
      
      if (addressStr && addressStr.trim().length > 3) {
        // Clean the address - remove special chars that cause issues
        let cleanAddr = addressStr.trim()
          .replace(/[\n\r\t]+/g, ' ')  // Remove line breaks
          .replace(/\s+/g, ' ')         // Normalize spaces
          .replace(/[""'']/g, '')       // Remove quotes
        
        // Add Portugal to improve geocoding
        if (!cleanAddr.toLowerCase().includes('portugal')) {
          cleanAddr = `${cleanAddr}, Portugal`
        }
        
        addresses.push(cleanAddr)
      }
    }

    // Need at least warehouse + 1 delivery address
    const deliveryAddresses = addresses.length - 1 // Minus warehouse
    if (deliveryAddresses < 1) {
      setMapsError(`Informação insuficiente. Nenhuma morada de entrega válida encontrada.`)
      return
    }

    // Add warehouse as final destination (return trip)
    addresses.push(WAREHOUSE_ADDRESS)

    // Use the simple /dir/ format which is more reliable
    // Format: https://www.google.com/maps/dir/Warehouse/Address1/Address2/Warehouse/
    const encodedAddresses = addresses.map(addr => encodeURIComponent(addr))
    const url = `https://www.google.com/maps/dir/${encodedAddresses.join('/')}`

    setMapsUrl(url)
  }

  // Calculate progress percentage
  const progressPct = ongoing 
    ? Math.round(((ongoing.progressIndex || 0) / (ongoing.orderIds?.length || 1)) * 100)
    : 0

  return (
    <PageGuard requiredPermission="deliveries.view">
      <div className="driver-page">
        {/* Header simples */}
        <header className="driver-header">
          <div className="driver-header-left">
            <span className="driver-title">🚚 Entregas</span>
            {ongoing && <span className="driver-vehicle-badge">{ongoing.vehicle}</span>}
          </div>
          <span className="driver-date">{new Date().toLocaleDateString('pt-PT', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
        </header>

        {/* Current Route Hero */}
        {ongoing && (
          <section className="driver-hero">
            <div className="driver-hero-status">
              <span className="driver-hero-label">Rota em curso</span>
              <span className="driver-hero-progress">{ongoing.progressIndex || 0}/{ongoing.orderIds?.length || 0}</span>
            </div>
            
            <div className="driver-progress-bar">
              <div className="driver-progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
            
            <div className="driver-hero-meta">
              <span>{fmtDate(ongoing.date)}</span>
              <span>•</span>
              <span>{ongoing.startedAt ? fmtTime(ongoing.startedAt) : ongoing.startTime}</span>
              <span>•</span>
              <span>{(ongoing.orderIds?.length || 0) - (ongoing.progressIndex || 0)} restantes</span>
            </div>

            {/* Next Stop Card */}
            {nextOrder && (
              <div className="driver-next-stop">
                <div className="driver-next-stop-header">
                  <span className="driver-next-badge">Próxima paragem</span>
                  <span className="driver-next-number">#{(ongoing.progressIndex || 0) + 1}</span>
                </div>
                
                <div className="driver-next-client">{getClientName(nextOrder) || 'Cliente'}</div>
                <div className="driver-next-location">
                  📍 {(() => {
                    const L = getLocationInfo(nextOrder, { locationsIndex, contractsIndex })
                    return joinNice([L.name, L.addr], ' – ') || 'Local não disponível'
                  })()}
                </div>

                {/* Expandable Items */}
                <details className="driver-items-details" open={expandNextItems} onToggle={(e) => setExpandNextItems(e.target.open)}>
                  <summary className="driver-items-summary">
                    <span>📦 Ver artigos ({(getOrderLinesGeneric(nextOrder) || []).length})</span>
                    <span className="driver-items-chevron">{expandNextItems ? '▲' : '▼'}</span>
                  </summary>
                  <div className="driver-items-list">
                    {(() => {
                      const lines = getOrderLinesGeneric(nextOrder)
                      if (!lines.length) return <div className="driver-items-empty">Sem artigos registados</div>
                      return lines.map((l, idx) => (
                        <div key={idx} className="driver-item-row">
                          <span className="driver-item-qty">{l.qty}x</span>
                          <span className="driver-item-name">{l.name}</span>
                          {l.unit && <span className="driver-item-unit">{l.unit}</span>}
                        </div>
                      ))
                    })()}
                  </div>
                </details>

                {/* Action Buttons */}
                <div className="driver-actions">
                  <button className="driver-btn driver-btn-success" onClick={() => openDeliveryModal(ongoing, nextOrder, 'OK')}>
                    <span className="driver-btn-icon">✓</span>
                    <span>Entregue</span>
                  </button>
                  <button className="driver-btn driver-btn-warning" onClick={() => openDeliveryModal(ongoing, nextOrder, 'DEVOLVIDO')}>
                    <span className="driver-btn-icon">↩</span>
                    <span>Devolvido</span>
                  </button>
                  <button className="driver-btn driver-btn-danger" onClick={() => openDeliveryModal(ongoing, nextOrder, 'NAOENTREGUE')}>
                    <span className="driver-btn-icon">⚠</span>
                    <span>Não entregue</span>
                  </button>
                </div>
              </div>
            )}

            {/* Route Quick Actions */}
            <div className="driver-hero-footer">
              <button className="driver-link-btn" onClick={() => setViewRoute(ongoing)}>
                <span>📋</span> Ver rota completa
              </button>
              <button className="driver-link-btn" onClick={() => printRoutePdf(ongoing, ordersForRoutes.list, { locationsIndex, contractsIndex })}>
                <span>📄</span> PDF
              </button>
              <button className="driver-link-btn driver-link-danger" onClick={() => finishRoute.mutate(ongoing)} disabled={finishRoute.isPending}>
                <span>🏁</span> Terminar
              </button>
            </div>
          </section>
        )}

        {/* No Active Route Message */}
        {!ongoing && activeRoutes.length > 0 && (
          <div className="driver-empty-hero">
            <span className="driver-empty-icon">🚀</span>
            <span className="driver-empty-text">Seleciona uma rota para começar</span>
          </div>
        )}

        {/* Tabs */}
        <div className="driver-tabs">
          <button className={`driver-tab ${tab === 'ATIVAS' ? 'active' : ''}`} onClick={() => setTab('ATIVAS')}>
            Ativas
            {activeRoutes.length > 0 && <span className="driver-tab-badge">{activeRoutes.length}</span>}
          </button>
          <button className={`driver-tab ${tab === 'FINALIZADAS' ? 'active' : ''}`} onClick={() => setTab('FINALIZADAS')}>
            Concluídas
            {doneRoutes.length > 0 && <span className="driver-tab-badge">{doneRoutes.length}</span>}
          </button>
        </div>

        {/* Routes List */}
        <div className="driver-routes">
          {tab === 'ATIVAS' && (
            <>
              {activeRoutes.length === 0 ? (
                <div className="driver-empty">
                  <span className="driver-empty-icon">📭</span>
                  <span className="driver-empty-text">Sem rotas ativas</span>
                </div>
              ) : (
                activeRoutes.map(r => {
                  const isOngoing = r.status === 'ONGOING'
                  const remaining = (r.orderIds?.length || 0) - (r.progressIndex || 0)
                  
                  return (
                    <div key={r.id} className={`driver-route-card ${isOngoing ? 'ongoing' : ''}`}>
                      <div className="driver-route-card-header">
                        <div className="driver-route-date">{fmtDate(r.date)}</div>
                        <div className={`driver-route-status ${r.status || 'PLANNED'}`}>
                          {isOngoing ? 'Em curso' : 'Planeada'}
                        </div>
                      </div>
                      
                      <div className="driver-route-info">
                        <span className="driver-route-vehicle">🚚 {r.vehicle}</span>
                        <span className="driver-route-meta">
                          📍 {r.orderIds?.length || 0} paragens • 🕐 {r.startTime || '—'}
                          {isOngoing && ` • ${remaining} em falta`}
                        </span>
                      </div>
                      
                      <div className="driver-route-actions">
                        {!isOngoing && (
                          <button className="driver-btn driver-btn-primary" onClick={() => startRoute.mutate(r)} disabled={startRoute.isPending}>
                            <span>▶</span> Iniciar
                          </button>
                        )}
                        {isOngoing && (
                          <button className="driver-btn driver-btn-primary" onClick={() => setViewRoute(r)}>
                            <span>➤</span> Continuar
                          </button>
                        )}
                        <button className="driver-btn driver-btn-ghost" onClick={() => setViewRoute(r)}>
                          Detalhes
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </>
          )}

          {tab === 'FINALIZADAS' && (
            <>
              {doneRoutes.length === 0 ? (
                <div className="driver-empty">
                  <span className="driver-empty-icon">📋</span>
                  <span className="driver-empty-text">Sem rotas concluídas</span>
                </div>
              ) : (
                doneRoutes.map(r => (
                  <div key={r.id} className="driver-route-card done">
                    <div className="driver-route-card-header">
                      <div className="driver-route-date">{fmtDate(r.date)}</div>
                      <div className="driver-route-status DONE">Concluída ✓</div>
                    </div>
                    
                    <div className="driver-route-info">
                      <span className="driver-route-vehicle">🚚 {r.vehicle}</span>
                      <span className="driver-route-meta">
                        📍 {r.orderIds?.length || 0} entregas • ⏱ {r.startedAt ? fmtTime(r.startedAt) : '—'} → {r.finishedAt ? fmtTime(r.finishedAt) : '—'}
                      </span>
                    </div>
                    
                    <div className="driver-route-actions">
                      <button className="driver-btn driver-btn-ghost" onClick={() => setViewRoute(r)}>
                        Ver resumo
                      </button>
                      <button className="driver-btn driver-btn-ghost" onClick={() => printRoutePdf(r, ordersForRoutes.list, { locationsIndex, contractsIndex })}>
                        📄 PDF
                      </button>
                    </div>
                  </div>
                ))
              )}
            </>
          )}
        </div>

        {/* Pickups Section */}
        {pickups.length > 0 && (
          <section className="driver-pickups">
            <h3 className="driver-section-title">🚛 Recolhas Agendadas</h3>
            {pickups.map(p => (
              <div key={p.id} className="driver-pickup-card">
                <div className="driver-pickup-header">
                  <span className="driver-pickup-date">{fmtDate(p.date)}</span>
                  <span className="driver-pickup-carrier">{p.carrier?.toUpperCase?.() || 'Transportadora'}</span>
                </div>
                <div className="driver-pickup-info">
                  📦 {p.orderIds?.length || 0} volumes • 🕐 {p.pickupTime || '—'} • 📍 {p.pickupLocation || '—'}
                </div>
              </div>
            ))}
          </section>
        )}

      {viewRoute && (
        <div className="modal-overlay" onClick={()=> setViewRoute(null)}>
          <div className="driver-modal" onClick={e=>e.stopPropagation()}>
            <div className="driver-modal-header">
              <h3>Rota {fmtDate(viewRoute.date)}</h3>
              <button className="driver-modal-close" onClick={()=> setViewRoute(null)}>✕</button>
            </div>
            <div className="driver-modal-body">
              <div className="driver-modal-meta">
                <span>🚚 {viewRoute.vehicle}</span>
                <span>📍 {viewRoute.orderIds?.length || 0} paragens</span>
                <span>🕐 {viewRoute.startTime || '—'}</span>
              </div>

              <div className="driver-stops-list">
                {(viewRoute.orderIds||[]).map((oid,i)=>{
                  const o = ordersForRoutes.map[oid] || {}
                  const L = getLocationInfo(o, { locationsIndex, contractsIndex })
                  const delivered = o?.deliveredAt ? fmtTime(o.deliveredAt) : null
                  const outcome = o?.deliveryOutcome ? cap(o.deliveryOutcome.replace('_',' ')) : null
                  const isDone = !!delivered
                  const isCurrent = i === (viewRoute.progressIndex || 0) && viewRoute.status === 'ONGOING'
                  
                  return (
                    <div key={oid} className={`driver-stop ${isDone ? 'done' : ''} ${isCurrent ? 'current' : ''}`}>
                      <div className="driver-stop-index">
                        {isDone ? '✓' : i + 1}
                      </div>
                      <div className="driver-stop-content">
                        <div className="driver-stop-client">{getClientName(o) || '—'}</div>
                        <div className="driver-stop-location">{joinNice([L.name, L.addr], ' • ') || '—'}</div>
                        {isDone && (
                          <div className="driver-stop-outcome">
                            {delivered && `Entregue às ${delivered}`}
                            {outcome && ` • ${outcome}`}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Google Maps Route Generator */}
              <div className="driver-maps-section">
                <button 
                  className="driver-btn driver-btn-maps"
                  onClick={() => generateGoogleMapsRoute(viewRoute)}
                >
                  🗺️ Gerar Rota GPS
                </button>
                
                {mapsError && (
                  <div className="driver-maps-error">
                    <span>⚠️</span> {mapsError}
                  </div>
                )}
                
                {mapsUrl && (
                  <a 
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="driver-btn driver-btn-maps-open"
                  >
                    📍 Abrir no Google Maps
                  </a>
                )}
              </div>
            </div>
            <div className="driver-modal-footer">
              <button className="driver-btn driver-btn-ghost" onClick={() => printRoutePdf(viewRoute, ordersForRoutes.list, { locationsIndex, contractsIndex })}>
                📄 Exportar PDF
              </button>
              <button className="driver-btn driver-btn-primary" onClick={() => { setViewRoute(null); setMapsUrl(null); setMapsError(null); }}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* ====== MODAL DE REGISTO DE ENTREGA ====== */}
      {viewOutcomeFor && (
        <div className="modal-overlay" onClick={() => setViewOutcomeFor(null)}>
          <div className="driver-modal delivery-modal" onClick={e => e.stopPropagation()}>
            <div className="driver-modal-header">
              <h3>
                {viewOutcomeFor.type === 'OK' ? '✓ Confirmar Entrega' :
                 viewOutcomeFor.type === 'DEVOLVIDO' ? '↩ Devolução' :
                 viewOutcomeFor.type === 'NAOENTREGUE' ? '✕ Não Entregue' : '⚠ Problema'}
              </h3>
              <button className="driver-modal-close" onClick={() => setViewOutcomeFor(null)}>✕</button>
            </div>
            <div className="driver-modal-body">
              <div className="driver-outcome-client">
                <strong>{getClientName(viewOutcomeFor.order) || '—'}</strong>
                <span className="driver-outcome-location">
                  {(() => {
                    const L = getLocationInfo(viewOutcomeFor.order, { locationsIndex, contractsIndex })
                    return joinNice([L.name, L.addr], ' – ') || ''
                  })()}
                </span>
              </div>

              {/* Tabela de itens para validação */}
              {deliveryItems.length > 0 && (
                <div className="delivery-items-section">
                  <div className="delivery-items-title">📦 Validar quantidades</div>
                  <div className="delivery-items-table">
                    {deliveryItems.map((it, idx) => {
                      const hasIssue = Number(it.deliveredQty) !== Number(it.invoicedQty) || Number(it.returnedQty) > 0
                      return (
                        <div key={idx} className={`delivery-item-row ${hasIssue ? 'has-issue' : ''}`}>
                          <div className="delivery-item-name">
                            <span>{it.name}</span>
                            {it.unit && <span className="delivery-item-unit">{it.unit}</span>}
                          </div>
                          <div className="delivery-item-fields">
                            <div className="delivery-field">
                              <label>Faturado</label>
                              <span className="delivery-field-value">{it.invoicedQty}</span>
                            </div>
                            <div className="delivery-field">
                              <label>Entregue</label>
                              <input
                                type="number"
                                min="0"
                                max={it.invoicedQty}
                                value={it.deliveredQty}
                                onChange={e => updateDeliveryItem(idx, 'deliveredQty', Number(e.target.value) || 0)}
                                className="delivery-qty-input"
                              />
                            </div>
                            <div className="delivery-field">
                              <label>Devolvido</label>
                              <input
                                type="number"
                                min="0"
                                value={it.returnedQty}
                                onChange={e => updateDeliveryItem(idx, 'returnedQty', Number(e.target.value) || 0)}
                                className={`delivery-qty-input ${Number(it.returnedQty) > 0 ? 'has-return' : ''}`}
                              />
                            </div>
                          </div>
                          {Number(it.returnedQty) > 0 && (
                            <div className="delivery-return-reason">
                              <select
                                value={it.returnReason}
                                onChange={e => updateDeliveryItem(idx, 'returnReason', e.target.value)}
                                className="delivery-reason-select"
                              >
                                <option value="">Motivo da devolução...</option>
                                <option value="danificado">Danificado</option>
                                <option value="recusado">Recusado pelo cliente</option>
                                <option value="erro_quantidade">Erro de quantidade</option>
                                <option value="erro_produto">Produto errado</option>
                                <option value="validade">Fora de validade</option>
                                <option value="temperatura">Quebra de temperatura</option>
                                <option value="outro">Outro</option>
                              </select>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  {/* Resumo de discrepâncias */}
                  {deliveryItems.some(it => Number(it.deliveredQty) !== Number(it.invoicedQty) || Number(it.returnedQty) > 0) && (
                    <div className="delivery-discrepancy-alert">
                      ⚠️ Existem diferenças — a faturação será notificada
                    </div>
                  )}
                </div>
              )}

              <label className="driver-outcome-field">
                <span>Observações (opcional)</span>
                <textarea
                  id="driver-notes"
                  rows={3}
                  placeholder="Ex.: Cliente ausente, deixado na portaria..."
                />
              </label>
            </div>
            <div className="driver-modal-footer">
              <button className="driver-btn driver-btn-ghost" onClick={() => setViewOutcomeFor(null)}>Cancelar</button>
              <button
                className={`driver-btn ${viewOutcomeFor.type === 'OK' ? 'driver-btn-success' : 'driver-btn-warning'}`}
                disabled={recordDelivery.isPending}
                onClick={() => {
                  const notes = document.getElementById('driver-notes')?.value || ''
                  const now = new Date().toISOString()
                  const route = viewOutcomeFor.route
                  const next = (route.progressIndex ?? 0) + 1
                  const done = next >= (route.orderIds?.length || 0)

                  recordDelivery.mutate({
                    orderId: viewOutcomeFor.order.id,
                    delivery: {
                      recordedAt: now,
                      recordedBy: profile?.name || 'Motorista',
                      recordedById: profile?.id,
                      outcome: viewOutcomeFor.type,
                      notes,
                      items: deliveryItems,
                    },
                    routeUpdate: {
                      routeId: route.id,
                      data: {
                        progressIndex: next,
                        status: done ? 'DONE' : 'ONGOING',
                        finishedAt: done ? now : null,
                      },
                    },
                  })
                  setViewOutcomeFor(null)
                }}
              >
                {recordDelivery.isPending ? 'A gravar...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </PageGuard>
  )
}
