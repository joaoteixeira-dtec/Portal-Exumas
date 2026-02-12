import { useOrders, useUpdateOrder } from '../hooks/useOrders'
import { useState, useMemo, useEffect, useRef, Component } from 'react'
import { ORDER_STATUS, statusBadge, fmtDate, todayISO, isBulkBatchOrder, isBulkSubOrder } from '../lib/utils'
import { useAuth } from '../contexts/AuthProvider'
import { useWarehouse } from '../contexts/WarehouseContext'
import { usePermissions } from '../hooks/usePermissions'
import { PageGuard } from '../components/PageGuard'
import { db } from '../lib/firebase'
import { doc, updateDoc, writeBatch, collection, query, where, getDocs } from 'firebase/firestore'
// Hooks de índices para evitar N+1 queries
import { useLocationsIndex, useContractsIndex, useUsersIndex } from '../lib/useFirestoreIndexes'

/* ---------- Error Boundary para capturar crashes ---------- */
class ArmazemErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true }
  }
  componentDidCatch(error, errorInfo) {
    console.error('[ArmazemErrorBoundary] Erro capturado:', error, errorInfo)
    this.setState({ error, errorInfo })
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="card" style={{ padding: 40, margin: 20, background: '#1a0a0a', border: '2px solid #ef4444' }}>
          <h2 style={{ color: '#ef4444', margin: '0 0 16px' }}>❌ Erro no Armazém</h2>
          <p style={{ color: '#fca5a5' }}>Ocorreu um erro ao renderizar esta página. Verifique a consola (F12) para mais detalhes.</p>
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

/* ---------- helpers ---------- */
function pctFromItems(items) {
  // Garantir que items é sempre um array
  const arr = Array.isArray(items) ? items : []
  const total = arr.reduce((s, it) => s + (Number(it.qty) || 0), 0)
  const done = arr.reduce(
    (s, it) => s + Math.min(Number(it.preparedQty) || 0, Number(it.qty) || 0),
    0
  )
  const pct = total ? Math.round((done / total) * 100) : 0
  return { total, done, pct }
}
function ProgressBar({ pct }) {
  return (
    <div style={{ width: '100%', height: 8, background: '#0b1328', borderRadius: 999, border: '1px solid var(--line)' }}>
      <div
        style={{
          width: `${Math.min(100, Math.max(0, pct))}%`,
          height: 6,
          margin: 1,
          borderRadius: 999,
          background: 'linear-gradient(90deg,var(--green),var(--accent))',
          transition: 'width .25s ease',
        }}
      />
    </div>
  )
}

const asDate = (v) => {
  if (!v) return null
  if (v instanceof Date) return v
  if (typeof v === 'string') {
    const d = new Date(v)
    return Number.isNaN(+d) ? null : d
  }
  if (typeof v === 'number') {
    const d = new Date(v)
    return Number.isNaN(+d) ? null : d
  }
  // Firestore Timestamp
  if (typeof v === 'object' && typeof v.toDate === 'function') {
    try {
      const d = v.toDate()
      return d instanceof Date && !Number.isNaN(+d) ? d : null
    } catch {
      return null
    }
  }
  return null
}

const pad2 = (n) => String(n).padStart(2, '0')
const fmtDM = (v) => {
  const d = asDate(v)
  if (!d) return ''
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`
}
const fmtHM = (v) => {
  const d = asDate(v)
  if (!d) return ''
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}
const fmtDMHM = (v) => {
  const d = asDate(v)
  if (!d) return ''
  return `${fmtDM(d)} ${fmtHM(d)}`
}
const deliveryWindowLabel = (o) => {
  const s = (o?.deliveryWindowStart || '').trim()
  const e = (o?.deliveryWindowEnd || '').trim()
  if (s && e) return `${s}–${e}`
  if (s) return s
  if (e) return e
  return ''
}

const clamp0 = (n) => Math.max(0, Number.isFinite(n) ? n : 0)
const roundTo = (n, prec = 3) => Math.round(n * Math.pow(10, prec)) / Math.pow(10, prec)
const parseLocaleNumber = (v) => Number(String(v || 0).replace(',', '.')) || 0
const toInputString = (n) => String(n ?? 0).replace('.', ',')

/* passos e aceleração */
const isMassOrVolume = (u='') => (u||'').toLowerCase().includes('kg') || (u||'').toLowerCase().includes('l')
function baseStep(unidade = '') {
  // passo base simples (fino para kg/L, mais largo para o resto)
  return isMassOrVolume(unidade) ? 0.005 : 0.25
}
function accelSteps(unidade='') {
  const b = baseStep(unidade)
  // sequência de passos crescentes; cobre de gramas a dezenas
  return isMassOrVolume(unidade) ? [b, b*2, b*4, b*10, 1, 5, 10, 50] : [b, 1, 5, 10, 50]
}

/* Wrapper com Error Boundary */
export default function Armazem() {
  return (
    <ArmazemErrorBoundary>
      <ArmazemInner />
    </ArmazemErrorBoundary>
  )
}

function ArmazemInner() {
  const { profile } = useAuth()
  const { can } = usePermissions()
  const { filterByWarehouse } = useWarehouse() || {}
  const upd = useUpdateOrder()
  
  // Permissões
  const canPrepare = can('warehouse.prepare')
  const canClose = can('warehouse.close')

  /* ---------- queries por estado ---------- */
  const esperaAll   = useOrders('ESPERA').data   || []
  const prepAll     = useOrders('PREP').data     || []
  const faltasAll   = useOrders('FALTAS').data   || []
  const aFaturarAll = useOrders('A_FATURAR').data|| []

  // Filtrar por armazém ativo
  const esperaRaw   = useMemo(() => filterByWarehouse ? filterByWarehouse(esperaAll) : esperaAll, [esperaAll, filterByWarehouse])
  const prepRaw     = useMemo(() => filterByWarehouse ? filterByWarehouse(prepAll) : prepAll, [prepAll, filterByWarehouse])
  const faltasRaw   = useMemo(() => filterByWarehouse ? filterByWarehouse(faltasAll) : faltasAll, [faltasAll, filterByWarehouse])
  const aFaturarRaw = useMemo(() => filterByWarehouse ? filterByWarehouse(aFaturarAll) : aFaturarAll, [aFaturarAll, filterByWarehouse])

  // Pedido em massa: o Armazém prepara o LOTE (BULK_BATCH) agregado, não as sub-encomendas.
  // Excluir subencomendas que estão ligadas a um BULK_BATCH (linkedToBulkBatchId)
  // Mas INCLUIR o próprio BULK_BATCH order
  const espera   = useMemo(() => {
    try {
      return esperaRaw.filter(o => !isBulkSubOrder(o) && !o.linkedToBulkBatchId)
    } catch (err) {
      console.error('[Armazem] Erro ao filtrar espera:', err)
      return []
    }
  }, [esperaRaw])
  
  const prep = useMemo(() => {
    try {
      return prepRaw.filter(o => !isBulkSubOrder(o) && !o.linkedToBulkBatchId)
    } catch (err) {
      console.error('[Armazem] Erro ao filtrar prep:', err)
      return []
    }
  }, [prepRaw])
  
  const faltas = useMemo(() => {
    try {
      return faltasRaw.filter(o => !isBulkSubOrder(o) && !o.linkedToBulkBatchId)
    } catch (err) {
      console.error('[Armazem] Erro ao filtrar faltas:', err)
      return []
    }
  }, [faltasRaw])
  
  const aFaturar = useMemo(() => {
    try {
      return aFaturarRaw.filter(o => (!isBulkSubOrder(o) && !o.linkedToBulkBatchId) && !isBulkBatchOrder(o))
    } catch (err) {
      console.error('[Armazem] Erro ao filtrar aFaturar:', err)
      return []
    }
  }, [aFaturarRaw])

  /* ---------- mapas de nomes (otimizados com hooks de índices) ---------- */
  // Carregamento batch (resolve problema N+1 - antes: 1 query por contrato/local/user)
  const contractsIndex = useContractsIndex().data || {}
  const locationsIndex = useLocationsIndex().data || {}
  const usersIndex = useUsersIndex().data || {}

  const contractName = (id) => {
    if (!id) return '—'
    const c = contractsIndex[id]
    return c?.nome || c?.name || id
  }
  const locationName = (id) => {
    if (!id) return '—'
    const l = locationsIndex[id]
    return l?.nome || l?.name || id
  }
  const clientUsername = (id) => {
    if (!id) return ''
    const u = usersIndex[id]
    return u?.username || u?.userName || u?.shortName || u?.nomeCurto || ''
  }

  const displayLocationName = (o) => {
    if (!o) return '—'
    if (o.locationId) return locationName(o.locationId)
    return o.locationName || '—'
  }

  // etiqueta para palete (impressão / PDF)
  const orderNoLabel = (o) => {
    const s = o?.internalNoStr ? String(o.internalNoStr) : ''
    if (s) return s
    if (o?.internalNo != null) return String(o.internalNo)
    if (o?.id) return String(o.id).slice(0, 8).toUpperCase()
    return '—'
  }

  const printPalletLabel = (order) => {
    if (!order) return
        const esc = (v) =>
          String(v ?? '').replace(/[&<>"']/g, (ch) =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch])
          )

        const client = esc(order.clientName || '—')
        const local = esc(displayLocationName(order) || '—')
        const orderNo = esc(orderNoLabel(order))
        const contractRaw = contractName(order.contractId) || ''
        const dateRaw = order.date || ''
        const contractLine = contractRaw ? `Contrato: ${contractRaw}` : ''
        const dateLine = dateRaw ? `Data: ${dateRaw}` : ''
        const contractLineEsc = esc(contractLine)
        const dateLineEsc = esc(dateLine)

        const html = `<!doctype html><html><head><meta charset="utf-8"/>
<title>Etiqueta Encomenda</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; background:#fff; color:#111; }
  .frame { width: 100%; height: 100%; border: 6px solid #111; border-radius: 8px; padding: 12mm; display:flex; flex-direction:column; justify-content:center; }
  .client { font-weight: 900; font-size: 64pt; line-height: 1.0; text-align:center; }
  .local { margin-top: 10mm; font-weight: 900; font-size: 56pt; line-height: 1.0; text-align:center; }
  .order { margin-top: 8mm; font-weight: 900; font-size: 48pt; letter-spacing: 1px; text-align:center; }
  .meta { margin-top: 8mm; font-size: 14pt; opacity: .75; display:flex; justify-content:space-between; gap: 10mm; }
  .meta div { white-space: nowrap; overflow:hidden; text-overflow: ellipsis; }
</style></head>
<body>
  <div class="frame">
    <div class="client">${client}</div>
    <div class="local">${local}</div>
    <div class="order">${orderNo}</div>
    <div class="meta">
      <div>${contractLineEsc}</div>
      <div>${dateLineEsc}</div>
    </div>
  </div>
<script>window.onload=()=>setTimeout(()=>window.print(),80)</script>
</body></html>`

        const w = window.open('', '_blank', 'width=1100,height=800')
        if (!w) return
        w.document.open()
        w.document.write(html)
        w.document.close()
        w.focus()
  }

  /* ---------- preparadas hoje ---------- */
  const preparedToday = useMemo(
    () => (aFaturar || []).filter(o => (o.warehouseClosedAt || '').slice(0,10) === todayISO()),
    [aFaturar]
  )

  /* ---------- devoluções / produtos retornados ---------- */
  const allOrdersRaw = useOrders().data || []
  const allOrders = useMemo(() => filterByWarehouse ? filterByWarehouse(allOrdersRaw) : allOrdersRaw, [allOrdersRaw, filterByWarehouse])
  const returnsOrders = useMemo(() => 
    allOrders.filter(o => {
      const items = o.delivery?.items || []
      return items.some(it => Number(it.returnedQty) > 0)
    }),
    [allOrders]
  )
  const [showReturns, setShowReturns] = useState(false)

  /* ---------- pesquisa ---------- */
  const [search, setSearch] = useState('')
  const searchable = (o) => {
    const q = (search || '').toLowerCase().trim()
    if (!q) return true
    const hay = `${o?.clientName || ''} ${displayLocationName(o)} ${contractName(o?.contractId)} ${orderNoLabel(o)} ${o?.bulkBatchNo || ''}`
    return hay.toLowerCase().includes(q)
  }

  const isStarted = (o) => !!(o.warehouseStartedById || o.warehouseStartedAt || o.warehouseStartedByName)

  const preparacaoF = useMemo(
    () => [...espera, ...prep.filter(o => !isStarted(o))].filter(searchable),
    [espera, prep, search, contractsIndex, locationsIndex]
  )
  const iniciadasF = useMemo(
    () => prep.filter(o => isStarted(o)).filter(searchable),
    [prep, search, contractsIndex, locationsIndex]
  )
  const pendentesF = useMemo(
    () => faltas.filter(searchable),
    [faltas, search, contractsIndex, locationsIndex]
  )

  /* ---------- foco / draft ---------- */
  const [active, setActive] = useState(null)
  const [itemsDraft, setItemsDraft] = useState([])

  const selectOrder = async (o) => {
    if (o.status === ORDER_STATUS.PREP && !o.warehouseStartedById) {
      try {
        await updateDoc(doc(db, 'orders', o.id), {
          warehouseStartedById: profile?.uid || profile?.id || null,
          warehouseStartedByName: profile?.name || profile?.email || 'Armazém',
          warehouseStartedAt: new Date().toISOString(),
        })
      } catch {}
    }
    setActive(o)
    setItemsDraft((o.items || []).map(it => {
      const val = clamp0(parseLocaleNumber(it.preparedQty || 0))
      return {
        ...it,
        preparedQty: val,
        purchasedQty: clamp0(parseLocaleNumber(it.purchasedQty || 0)),
        qty: clamp0(parseLocaleNumber(it.qty || 0)),
        obs: it.obs || '',
        _locked: false,
        _showObs: false,
        _qtyInput: toInputString(val),
      }
    }))
  }
  useEffect(() => { if (!active) setItemsDraft([]) }, [active])

  /* ---------- edição de linhas ---------- */
  const setLineInput = (pid, str) =>
    setItemsDraft(arr => arr.map(x => {
      if (x.productId !== pid) return x
      const n = parseLocaleNumber(str)
      const next = Number.isFinite(n) ? clamp0(roundTo(n, 3)) : (x.preparedQty || 0)
      return { ...x, _qtyInput: str, preparedQty: next }
    }))
  const normalizeInput = (pid) =>
    setItemsDraft(arr => arr.map(x =>
      x.productId === pid ? { ...x, _qtyInput: toInputString(x.preparedQty) } : x
    ))
  const inc = (pid, d) =>
    setItemsDraft(arr => arr.map(x => {
      if (x.productId !== pid) return x
      const v = clamp0(roundTo((x.preparedQty || 0) + d, 3))
      return { ...x, preparedQty: v, _qtyInput: toInputString(v) }
    }))

  const toggleLock = (pid) =>
    setItemsDraft(arr => arr.map(x => x.productId === pid ? { ...x, _locked: !x._locked } : x))
  const toggleObs = (pid) =>
    setItemsDraft(arr => arr.map(x => x.productId === pid ? { ...x, _showObs: !x._showObs } : x))
  const setObs = (pid, val) =>
    setItemsDraft(arr => arr.map(x => x.productId === pid ? { ...x, obs: val.slice(0, 120) } : x))

  const marcarTudo = () =>
    setItemsDraft(arr => arr.map(x => {
      const v = Number(x.qty || 0)
      return { ...x, preparedQty: v, _qtyInput: toInputString(v) }
    }))

  /* ---------- CLEAR + refs ---------- */
  const inputRefs = useRef({})
  const setInputRef = (pid) => (el) => { if (el) inputRefs.current[pid] = el }
  const clearQty = (pid) =>
    setItemsDraft(arr => arr.map(x =>
      x.productId === pid ? { ...x, preparedQty: 0, _qtyInput: '' } : x
    ))
  const onClearClick = (pid) => {
    clearQty(pid)
    setTimeout(() => inputRefs.current[pid]?.focus(), 0)
  }

  /* ---------- atalhos teclado ---------- */
  const handleKeyDown = (e, item) => {
    if (item._locked) return
    const dec = baseStep(item.unidade)
    const uni = 1
    let step = 0
    if (e.key === 'ArrowUp') { step = e.ctrlKey ? dec*10 : (e.shiftKey ? uni : dec) }
    if (e.key === 'ArrowDown') { step = -(e.ctrlKey ? dec*10 : (e.shiftKey ? uni : dec)) }
    if (step !== 0) { e.preventDefault(); inc(item.productId, step) }
  }

  /* ---------- HOLD: aceleração 180ms ---------- */
  const hold = useRef({ timer:null, pid:null, dir:1, idx:0, ticks:0, steps:[] })
  const stopHold = () => {
    if (hold.current.timer){ clearInterval(hold.current.timer); hold.current.timer = null }
  }
  const startHold = (item, dir) => {
    if (item._locked) return
    const step = 1 // +/- avança 1 unidade (1,2,3,4...)
    hold.current = { timer:null, pid:item.productId, dir, idx:0, ticks:0, steps:[step] }
    inc(item.productId, step * dir) // passo inicial
    hold.current.timer = setInterval(() => {
      const h = hold.current
      if (!h.timer) return
      inc(item.productId, step * h.dir)
    }, 180)
  }
  useEffect(() => {
    const up = () => stopHold()
    window.addEventListener('pointerup', up)
    window.addEventListener('blur', up)
    return () => { window.removeEventListener('pointerup', up); window.removeEventListener('blur', up); stopHold() }
  }, [])

  /* ---------- KPI draft ---------- */
  const kpiDraft = useMemo(() => {
    const { pct, done, total } = pctFromItems(itemsDraft)
    const linhas = itemsDraft.length
    const completas = itemsDraft.filter(x => (x.preparedQty || 0) >= (x.qty || 0)).length
    const pendentes = linhas - completas
    const valorPrep = itemsDraft.reduce((s, it) => s + (Number(it.preparedQty)||0)*(Number(it.preco)||0), 0)
    const valorTotal= itemsDraft.reduce((s, it) => s + (Number(it.qty)||0)*(Number(it.preco)||0), 0)
    return { pct, done, total, linhas, completas, pendentes, valorPrep, valorTotal }
  }, [itemsDraft])

  /* ---------- ações ---------- */
  const guardarProgresso = () => {
    if (!active) return
    const items = itemsDraft.map(x => ({
      productId: x.productId, productName: x.productName,
      unidade: x.unidade, preco: Number(x.preco)||0,
      qty: Number(x.qty)||0, preparedQty: Number(x.preparedQty)||0, purchasedQty: Number(x.purchasedQty)||0,
      obs: x.obs || '',
    }))
    upd.mutate({
      id: active.id,
      data: {
        items,
        status: ORDER_STATUS.PREP,
        needsWarehouseCompletion: true,
        warehouseLastUpdateAt: new Date().toISOString(),
        warehouseLastUpdateById: profile?.uid || profile?.id || null,
        warehouseLastUpdateByName: profile?.name || profile?.email || 'Armazém',
        _profile: profile,
      },
    })
  }

  const fecharEncomenda = async () => {
    if (!active) return
    const items = itemsDraft.map(x => ({
      productId: x.productId, productName: x.productName,
      unidade: x.unidade, preco: Number(x.preco)||0,
      qty: Number(x.qty)||0, preparedQty: Number(x.preparedQty)||0, purchasedQty: Number(x.purchasedQty)||0,
      obs: x.obs || '',
    }))
    const { pct } = pctFromItems(items)
    if (pct < 80) {
      const go = confirm(
        `Atenção: esta carga está com apenas ${pct}% preparado.\n` +
        `Se continuar, a encomenda será fechada com faltas e enviada para "Compras".\n` +
        `Queres mesmo fechar assim?`
      )
      if (!go) return
    }
    const miss = items.some(it => (it.preparedQty||0) < (it.qty||0))

    // Pedido em massa: fechar um LOTE move as sub-encomendas para a Faturação.
    if (isBulkBatchOrder(active) && !miss) {
      const now = new Date().toISOString()
      try {
        const b = writeBatch(db)

        // 1) fechar o lote (fica arquivado como ENTREGUE, mas com flag interno)
        b.update(doc(db, 'orders', active.id), {
          items,
          status: ORDER_STATUS.ENTREGUE,
          needsWarehouseCompletion: false,
          warehouseClosedAt: now,
          warehouseClosedById: profile?.uid || profile?.id || null,
          warehouseClosedByName: profile?.name || profile?.email || 'Armazém',
          bulkBatchInternal: true,
          bulkBatchClosedAt: now,
        })

        // 2) enviar sub-encomendas para a faturação (continuam separadas)
        const subIds = Array.isArray(active.bulkSubOrderIds) ? active.bulkSubOrderIds : []
        for (const id of subIds) {
          if (!id) continue
          b.update(doc(db, 'orders', id), {
            status: ORDER_STATUS.A_FATURAR,
            needsWarehouseCompletion: false,
            bulkBatchReadyAt: now,
            bulkBatchReadyById: profile?.uid || profile?.id || null,
            bulkBatchReadyByName: profile?.name || profile?.email || 'Armazém',
          })
        }

        await b.commit()
        setActive(null)
        return
      } catch (e) {
        console.error(e)
        alert('Não foi possível fechar o lote. Tenta novamente.')
        return
      }
    }

    const next = miss
      ? { status: ORDER_STATUS.FALTAS, needsWarehouseCompletion: false }
      : { status: ORDER_STATUS.A_FATURAR, needsWarehouseCompletion: false, warehouseClosedAt: new Date().toISOString() }

    upd.mutate({
      id: active.id,
      data: {
        items, ...next,
        warehouseClosedById:  miss ? null : (profile?.uid || profile?.id || null),
        warehouseClosedByName:miss ? null : (profile?.name || profile?.email || 'Armazém'),
        _profile: profile,
      },
    })
    setActive(null)
  }

  const iniciarPreparacao = (o) => {
    upd.mutate({
      id: o.id,
      data: {
        status: ORDER_STATUS.PREP,
        warehouseStartedById: profile?.uid || profile?.id || null,
        warehouseStartedByName: profile?.name || profile?.email || 'Armazém',
        warehouseStartedAt: new Date().toISOString(),
        needsWarehouseCompletion: true,
        _profile: profile,
      },
    })
    selectOrder({ ...o, status: ORDER_STATUS.PREP })
  }

  /* ---------- MODAL ---------- */
  useEffect(() => {
    document.body.style.overflow = active ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [active])
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setActive(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const pill = (label, content, muted=false) => (
    <div style={{
      display:'flex', alignItems:'baseline', gap:6,
      background: '#1B1B1BFF',
      border: '1px solid var(--line)',
      borderRadius: 12,
      padding: '6px 10px',
      minWidth: 120
    }}>
      <small className={muted ? 'muted' : ''} style={{opacity: .8}}>{label}</small>
      <div style={{marginLeft:'auto', fontWeight:700}}>{content}</div>
    </div>
  )

    const modalPrep = !active ? null : (
      <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-prep-title"
           onMouseDown={(e) => { if (e.target === e.currentTarget) setActive(null) }}>
        <div className="modal modal-prep">
          <header className="modal-header">
            <div>
              <h3 id="modal-prep-title" style={{ margin: 0 }}>{active.clientName}</h3>
              <small className="muted">
                {contractName(active.contractId)} • {displayLocationName(active)} • {fmtDate(active.date)}
                • Gestor: {active.createdByName || '—'}
                {active.warehouseStartedByName ? ` • Operador: ${active.warehouseStartedByName}` : ''}
              </small>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                className="btn-ghost"
                onClick={() => printPalletLabel(active)}
                title="Imprimir etiqueta (palete)"
                aria-label="Imprimir etiqueta (palete)"
                style={{ padding: '6px 10px' }}
              >
                🏷️
              </button>
              <button className="btn-secondary" onClick={() => setActive(null)} aria-label="Fechar">Fechar</button>
            </div>
          </header>

          <div className="modal-body scroll-soft">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 200px', minWidth: 150 }}>
                <ProgressBar pct={kpiDraft.pct || 0} />
              </div>
              <span className="chip">{kpiDraft.pct || 0}%</span>
              <span className="chip green">✓ {kpiDraft.completas || 0}</span>
              <span className="chip orange">⏳ {kpiDraft.pendentes || 0}</span>
              <span className="chip blue">{(kpiDraft.valorPrep || 0).toFixed(2)}€ / {(kpiDraft.valorTotal || 0).toFixed(2)}€</span>
            </div>

            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {itemsDraft.map((it) => {
                const complete = (it.preparedQty || 0) >= (it.qty || 0)
                const locked = it._locked


                const bought = clamp0(Number(it.purchasedQty || 0))
                const missing = clamp0((it.qty || 0) - (it.preparedQty || 0))
                const boughtShown = Math.min(bought, missing)
                return (
                  <div
                    key={it.productId}
                    className={`prep-item ${complete ? 'complete' : ''}`}
                  >
                    <div className="prep-item__header">
                      <div>
                        <div className="prep-item__name">{it.productName || '—'}</div>
                        <div className="prep-item__meta">
                          {it.unidade || '—'} • {(Number(it.preco) || 0).toFixed(2)}€ • pedir: {it.qty || 0}
                        </div>
                      </div>
                      <div className={`lock ${locked ? 'is-locked' : ''}`}>
                        <button className="btn-mini" onClick={() => toggleLock(it.productId)} aria-pressed={locked} title="Bloquear edição">
                          {locked ? '🔒' : '🔓'}
                        </button>
                      </div>
                    </div>

                    <div className="prep-item__controls">
                      <div className="prep-item__qty-group">
                        <button
                          className="prep-item__qty-btn" 
                          disabled={locked}
                          onPointerDown={() => startHold(it, -1)}
                          onPointerUp={stopHold} 
                          onPointerLeave={stopHold} 
                          onPointerCancel={stopHold}
                          title="Diminuir"
                        >−</button>

                        <input
                          ref={setInputRef(it.productId)}
                          type="text"
                          inputMode="decimal"
                          pattern="[0-9]+([\\.,][0-9]{0,3})?"
                          disabled={locked}
                          value={it._qtyInput}
                          onChange={(e) => setLineInput(it.productId, e.target.value)}
                          onBlur={() => normalizeInput(it.productId)}
                          onKeyDown={(e) => handleKeyDown(e, it)}
                          onMouseDown={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                          className="prep-item__qty-input"
                          aria-valuemin={0}
                          aria-valuenow={it.preparedQty}
                          aria-label="Quantidade preparada"
                        />

                        <button
                          className="prep-item__qty-btn" 
                          disabled={locked}
                          onPointerDown={() => startHold(it, +1)}
                          onPointerUp={stopHold} 
                          onPointerLeave={stopHold} 
                          onPointerCancel={stopHold}
                          title="Aumentar"
                        >+</button>
                      </div>

                      <div className="prep-item__info">
                        <span className="prep-item__pedido">Pedido: <strong>{toInputString(it.qty)}</strong></span>
                        {boughtShown > 0 && (
                          <span>Comprado: <strong>{toInputString(boughtShown)}</strong></span>
                        )}
                      </div>
                    </div>

                    <div className="prep-item__actions">
                      <button className="btn-secondary" disabled={locked} onClick={() => onClearClick(it.productId)}>Limpar</button>
                      <button className="btn-secondary" onClick={() => toggleObs(it.productId)}>Obs</button>
                    </div>

                    {it._showObs && (
                      <div style={{ marginTop: 8 }}>
                        <input
                          type="text"
                          placeholder="Observação curta (ex.: calibrado, embalagem aberta, etc.)"
                          value={it.obs || ''}
                          onChange={(e) => setObs(it.productId, e.target.value)}
                          maxLength={120}
                          style={{ width: '100%' }}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
              {!itemsDraft.length && (
                <div className="muted" style={{ textAlign: 'center', padding: 24 }}>Sem itens…</div>
              )}
            </div>
          </div>

          <footer className="modal-footer" style={{ gap: 16 }}>
              <button 
                className="btn-secondary" 
                onClick={marcarTudo}
                disabled={!canPrepare}
                title={!canPrepare ? 'Sem permissão' : undefined}
                style={{ padding: '12px 20px' }}
              >
                Marcar tudo preparado
              </button>
              <button 
                className="btn-secondary" 
                onClick={guardarProgresso}
                disabled={!canPrepare}
                title={!canPrepare ? 'Sem permissão' : undefined}
                style={{ padding: '12px 20px' }}
              >
                Guardar progresso
              </button>
              <button 
                className="btn" 
                onClick={fecharEncomenda}
                disabled={!canClose}
                title={!canClose ? 'Sem permissão' : undefined}
                style={{ padding: '12px 20px' }}
              >
                Fechar encomenda
              </button>
              <button className="btn-ghost" onClick={() => setActive(null)} style={{ padding: '12px 20px' }}>Voltar à lista</button>
          </footer>
        </div>
      </div>
    )


  /* ---------- cartão (encomenda) ---------- */
  const Card = ({ o, action, actionLabel }) => {
    const p = pctFromItems(o.items || [])
    const operatorStart = o.warehouseStartedByName
    const operatorEnd = o.warehouseClosedByName
    const isSelected = active?.id === o.id

    const isBatch = isBulkBatchOrder(o)
    const batchCount = isBatch ? (o.bulkSubOrderCount || (Array.isArray(o.bulkSubOrderIds) ? o.bulkSubOrderIds.length : 0)) : 0

    const username = clientUsername(o.clientId) || o.clientUsername || ''
    const clientLabel = username || o.clientName

    const createdLabel = o.createdAt ? fmtDMHM(o.createdAt) : '—'
    const win = deliveryWindowLabel(o)
    const deliveryLabel = o.date ? `${fmtDM(o.date)}${win ? ` ${win}` : ''}` : '—'

    const meta1 = `${contractName(o.contractId)} • ${displayLocationName(o)} • Itens: ${o.items?.length || 0}`
    const meta2 = `Criada: ${createdLabel} • Entrega: ${deliveryLabel} • Gestor: ${o.createdByName || '—'} • Op: ${operatorStart || '—'}${operatorEnd ? ` → ${operatorEnd}` : ''}`
    return (
      <div
        className={`card kanban-card ${isSelected ? 'is-selected' : ''}`}
        role="button"
        tabIndex={0}
        aria-selected={isSelected}
        onClick={() => selectOrder(o)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && selectOrder(o)}
      >
        <div className="toolbar" style={{ alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <div
              title={o.clientName || ''}
              style={{ fontWeight: 650, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              <span className="mono" style={{ opacity: .85 }}>#{orderNoLabel(o)}</span>
              <span style={{ marginLeft: 8 }}>{clientLabel}</span>
              {isBatch && (
                <span className="badge badge-prep" style={{ marginLeft: 8, padding: '6px 10px' }}>
                  Lote • {batchCount} sub
                </span>
              )}
            </div>
            <small
              className="muted"
              title={meta1}
              style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
            >
              {meta1}
            </small>
            <small
              className="muted"
              title={meta2}
              style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
            >
              {meta2}
            </small>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 160 }}>
            <div dangerouslySetInnerHTML={{ __html: statusBadge(o) }} />
            {(o.status === 'PREP' || o.status === 'FALTAS') && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <small className="muted" style={{ minWidth: 34, textAlign: 'right' }}>{p.pct}%</small>
                <div style={{ flex: 1 }}>
                  <ProgressBar pct={p.pct} />
                </div>
              </div>
            )}
          </div>
        </div>
        {action && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
            <button 
              className="btn-secondary" 
              onClick={(e) => (e.stopPropagation(), action(o))}
              disabled={!canPrepare}
              title={!canPrepare ? 'Sem permissão para preparar' : undefined}
              style={{ opacity: canPrepare ? 1 : 0.5 }}
            >
              {actionLabel}
            </button>
          </div>
        )}
      </div>
    )
  }

  /* ---------- layout ---------- */
  const totalHoje   = preparedToday.length
  const totalPreparacao = espera.length + prep.filter(o => !isStarted(o)).length
  const totalIniciadas  = prep.filter(o => isStarted(o)).length
  const totalPendentes  = faltas.length

  return (
    <PageGuard requiredPermission="warehouse.view">
      <div className="grid">
        {/* Header compacto */}
        <div className="span-12">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0 }}>📦 Armazém</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="chip">Preparação: {totalPreparacao}</div>
              <div className="chip">Iniciadas: {totalIniciadas}</div>
              <div className="chip">Pendentes: {totalPendentes}</div>
              <div className="chip">Hoje: {totalHoje}</div>
              {returnsOrders.length > 0 && (
                <div 
                  className="chip" 
                  style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', cursor: 'pointer', fontWeight: 600 }}
                  onClick={() => setShowReturns(!showReturns)}
                >
                  ↩ Devoluções: {returnsOrders.length}
                </div>
              )}
              <input
                placeholder="Pesquisar cliente/contrato/local…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ minWidth: 240 }}
              />
            </div>
          </div>
        </div>

        {/* Devoluções / Produtos retornados */}
        {showReturns && returnsOrders.length > 0 && (
          <div className="span-12">
            <div className="card" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '16px' }}>↩️ Produtos Devolvidos</h3>
                <button 
                  onClick={() => setShowReturns(false)} 
                  style={{ background: 'none', border: 'none', color: 'var(--ui-text-dim)', cursor: 'pointer', fontSize: '16px' }}
                >✕</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {returnsOrders.map(o => {
                  const del = o.delivery || {}
                  const retItems = (del.items || []).filter(it => Number(it.returnedQty) > 0)
                  const reasonLabels = { danificado: 'Danificado', recusado: 'Recusado', erro_quantidade: 'Erro qtd', erro_produto: 'Produto errado', validade: 'Validade', temperatura: 'Temperatura', outro: 'Outro' }
                  
                  return (
                    <div key={o.id} style={{ border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '12px', background: 'rgba(239,68,68,0.03)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontWeight: 600, color: 'var(--ui-text)' }}>{o.clientName || '—'}</span>
                        <span style={{ fontSize: '12px', color: 'var(--ui-text-dim)' }}>{fmtDate(o.deliveredAt || o.date)} • {del.recordedBy || 'Motorista'}</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {retItems.map((it, i) => (
                          <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'center', fontSize: '13px', padding: '4px 8px', background: 'rgba(239,68,68,0.06)', borderRadius: '4px' }}>
                            <span style={{ fontWeight: 500, color: 'var(--ui-text)', flex: 1 }}>{it.name} {it.unit && <span style={{ color: 'var(--ui-text-dim)' }}>({it.unit})</span>}</span>
                            <span style={{ color: '#ef4444', fontWeight: 600 }}>↩ {it.returnedQty}</span>
                            <span style={{ color: 'var(--ui-text-dim)', fontSize: '11px', minWidth: 80 }}>{reasonLabels[it.returnReason] || it.returnReason || '—'}</span>
                          </div>
                        ))}
                      </div>
                      {del.notes && (
                        <div style={{ fontSize: '12px', color: '#f59e0b', marginTop: '6px' }}>💬 {del.notes}</div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* colunas */}
        <div className="span-4 card kanban-col">
          <div className="kanban-head">
            <h3>Preparação</h3>
            <span className="kanban-count">{preparacaoF.length}</span>
          </div>
          <div className="kanban-body">
            {preparacaoF.map(o => (
              <Card key={o.id} o={o} action={iniciarPreparacao} actionLabel="Iniciar" />
            ))}
            {!preparacaoF.length && <small className="muted">Sem encomendas para preparar.</small>}
          </div>
        </div>

        <div className="span-4 card kanban-col">
          <div className="kanban-head">
            <h3>Iniciadas</h3>
            <span className="kanban-count">{iniciadasF.length}</span>
          </div>
          <div className="kanban-body">
            {iniciadasF.map(o => (<Card key={o.id} o={o} />))}
            {!iniciadasF.length && <small className="muted">Sem encomendas iniciadas.</small>}
          </div>
        </div>

        <div className="span-4 card kanban-col">
          <div className="kanban-head">
            <h3>Pendentes (produto)</h3>
            <span className="kanban-count">{pendentesF.length}</span>
          </div>
          <div className="kanban-body">
            {pendentesF.map(o => (<Card key={o.id} o={o} />))}
            {!pendentesF.length && <small className="muted">Sem pendentes.</small>}
          </div>
        </div>
      </div>

      {/* Modal - fora do armazem-page para garantir z-index correto */}
      {modalPrep}
    </PageGuard>
  )
}
