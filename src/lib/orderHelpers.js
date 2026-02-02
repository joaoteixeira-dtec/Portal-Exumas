/**
 * orderHelpers.js
 * Helpers centralizados para manipulação de encomendas, clientes, locais e contratos.
 * Elimina duplicação entre Gestor, Rotas, Motorista, Armazem, etc.
 */

// ==================== STRING UTILS ====================

export const pickText = (...vals) => vals.find(v => typeof v === 'string' && v.trim()) || ''

export const isLikelyId = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{18,}$/.test(s)

export const clean = (s) => {
  const t = (s || '').toString().trim()
  return t && !isLikelyId(t) ? t : ''
}

export const joinNice = (parts, sep = ' • ') => parts.filter(Boolean).join(sep)

export const cap = (s) => (s || '').toString().toLowerCase().replace(/^.| [a-z]/g, m => m.toUpperCase())

export const safe = (s) => {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ==================== DATE UTILS ====================

export const toISODate = (d) => new Date(d).toISOString().slice(0, 10)

export const addDays = (d, n) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export const startOfWeek = (date) => {
  const d = new Date(date)
  const day = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - day)
  d.setHours(0, 0, 0, 0)
  return d
}

export const asDate = (v) => {
  if (!v) return null
  if (v instanceof Date) return v
  if (typeof v === 'string') { const d = new Date(v); return isNaN(+d) ? null : d }
  if (typeof v === 'number') { const d = new Date(v); return isNaN(+d) ? null : d }
  if (typeof v === 'object' && typeof v.toDate === 'function') return v.toDate()
  if (typeof v === 'object' && v.seconds != null) return new Date(v.seconds * 1000)
  return null
}

export const fmtTime = (s) => {
  try {
    const d = new Date(s)
    return d.toTimeString().slice(0, 5)
  } catch {
    return '—:—'
  }
}

export const fmtDateShort = (v) => {
  if (!v) return '—'
  const s = String(v)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-')
    return `${d}/${m}`
  }
  const d = new Date(s)
  if (!isNaN(d)) {
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    return `${dd}/${mm}`
  }
  return s
}

export const fmtDateFull = (v) => {
  if (!v) return '—'
  const d = asDate(v)
  if (!d) return String(v)
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ==================== ORDER STATUS HELPERS ====================

export const isCancelledStatus = (s) =>
  ['CANCELADA', 'CANCELADO', 'CANCELLED', 'CANCELED'].includes(String(s || '').toUpperCase())

export const isDeliveredStatus = (s) =>
  ['ENTREGUE', 'DELIVERED', 'DONE'].includes(String(s || '').toUpperCase())

export const isInTransitStatus = (s) =>
  ['EXPEDIDA', 'EMROTA', 'EM_ROTA', 'IN_TRANSIT'].includes(String(s || '').toUpperCase())

export const isInWarehouseStatus = (s) =>
  ['PREP', 'ESPERA', 'FALTAS', 'A_FATURAR'].includes(String(s || '').toUpperCase())

export const STATE_WEIGHT = {
  ESPERA: 1,
  PREP: 2,
  FALTAS: 3,
  A_FATURAR: 4,
  A_EXPEDIR: 5,
  EMROTA: 6,
  EXPEDIDA: 7,
  ENTREGUE: 8,
  NAOENTREGUE: 9,
  CANCELADA: 10
}

// ==================== ORDER DATA EXTRACTION ====================

export const getOrderClientId = (o) =>
  o?.clientId || o?.clienteId || o?.client?.id || o?.client || ''

export const getOrderDate = (o) =>
  asDate(o?.date || o?.createdAt || o?.created_at || o?.created || o?.ts) || null

export const orderNoLabel = (o) => {
  const n = o?.internalNoStr || (o?.internalNo != null ? String(o.internalNo).padStart(6, '0') : '')
  return n ? `#${n}` : (o?.id ? `#${String(o.id).slice(0, 6).toUpperCase()}` : '#—')
}

export const orderTotalValue = (o) => {
  if (o?.total != null && !isNaN(+o.total)) return +o.total
  const items = Array.isArray(o?.items) ? o.items : []
  return items.reduce((sum, it) => sum + (+it.preco || 0) * (+it.qty || 0), 0)
}

// ==================== ORDER ITEMS ====================

export const itemsArray = (v) => {
  if (Array.isArray(v)) return v
  if (!v) return []
  if (typeof v === 'object') return Object.values(v)
  return []
}

export const itemsOf = (o) => itemsArray(o?.items)

export const getOrderLinesGeneric = (o) => {
  const arr = Array.isArray(o?.items) ? o.items
    : Array.isArray(o?.lines) ? o.lines
      : Array.isArray(o?.products) ? o.products
        : []
  return arr.map((it) => {
    const name = clean(pickText(
      it?.name, it?.title, it?.productName, it?.product, it?.descricao, it?.description, it?.label, it?.sku
    )) || 'Item'
    const qty = it?.qty ?? it?.quantity ?? it?.qtd ?? it?.q ?? it?.amount ?? it?.count ?? 1
    const unit = clean(pickText(it?.unit, it?.uom, it?.unidade, it?.units, it?.medida, it?.measure)) || ''
    return { name, qty, unit }
  })
}

// ==================== BULK ORDERS ====================

export const orderKind = (o) => String(o?.kind || o?.orderKind || o?.type || '').toUpperCase()

export const isBulkSubOrder = (o) =>
  orderKind(o) === 'BULK_SUB' ||
  o?.isBulkSub === true ||
  (o?.bulkRequestId && orderKind(o) !== 'BULK_BATCH' && o?.bulkBatch !== true)

export const isBulkBatchOrder = (o) =>
  orderKind(o) === 'BULK_BATCH' ||
  o?.bulkBatch === true ||
  o?.isBulkBatch === true

// ==================== CLIENT HELPERS ====================

export const getClientName = (o) =>
  clean(pickText(
    o?.clientName, o?.customerName, o?.cliente?.nome, o?.clienteNome,
    o?.customer?.name, o?.billingName, o?.nomeCliente, o?.name
  ))

export const getPreparedBy = (o) =>
  clean(pickText(
    o?.preparedByName, o?.preparedBy, o?.warehouseUserName,
    o?.warehouseUser, o?.pickerName, o?.armazemFuncionario, o?.armazemUser
  ))

// ==================== CONTRACT HELPERS ====================

export const getContractNameFromObj = (obj) =>
  clean(pickText(obj?.name, obj?.nome, obj?.title, obj?.label))

export const getContractName = (o, contractsIndex = {}) => {
  const inline = clean(pickText(o?.contractName, o?.contrato?.nome, o?.contract?.name, o?.nomeContrato))
  if (inline) return inline
  const id = pickText(o?.contractId, o?.contratoId, o?.idContrato, o?.contract?.id)
  const obj = id ? contractsIndex[id] : null
  return getContractNameFromObj(obj)
}

// ==================== LOCATION HELPERS ====================

export const getLocationNameFromObj = (obj) =>
  clean(pickText(obj?.name, obj?.nome, obj?.title, obj?.label))

export const formatAddress = (x = {}) => {
  const l1 = clean(pickText(x.address, x.address1, x.addressLine1, x.street, x.rua, x.morada))
  const l2 = clean(pickText(x.address2, x.addressLine2, x.complement, x.complemento))
  const zip = clean(pickText(x.zip, x.postalCode, x.codigoPostal))
  const city = clean(pickText(x.city, x.localidade, x.cidade))
  const parts = [l1, l2, joinNice([zip, city], ' ')]
  const s = parts.filter(Boolean).join(', ')
  return s || clean(pickText(x.moradaEntrega, x.endereco))
}

export const getLocationInfo = (o = {}, { locationsIndex = {}, contractsIndex = {} } = {}) => {
  const inlineName = clean(pickText(
    o.locationName, o.deliveryName, o.localName, o.entregaNome,
    o.local?.name, o.entrega?.name, o.location?.name, o.destino?.nome
  ))
  const inlineAddr = clean(pickText(
    o.address, o.addressText, o.entrega?.address, o.location?.address,
    o.deliveryAddress, o.endereco, o.morada, o.moradaEntrega
  ))

  let name = inlineName
  let addr = inlineAddr

  const locId = pickText(
    o.locationId, o.deliveryLocationId, o.localEntregaId,
    o.localId, o.destinoId, typeof o.location === 'string' ? o.location : ''
  )
  if (!name && locationsIndex && locId && locationsIndex[locId]) {
    const loc = locationsIndex[locId]
    name = getLocationNameFromObj(loc)
    addr = addr || formatAddress(loc)
  }

  const contract = getContractName(o, contractsIndex)

  return { name, addr, contract }
}

// ==================== EMAIL/CONTACT HELPERS ====================

export const parseEmailList = (s) => {
  if (!s) return []
  const arr = String(s)
    .split(/[,;\n\t ]+/)
    .map(x => x.trim())
    .filter(Boolean)
  const out = []
  const seen = new Set()
  for (const e of arr) {
    const k = e.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(e)
  }
  return out
}

export const formatEmailList = (arr) => {
  if (!arr) return ''
  const list = Array.isArray(arr) ? arr : [arr]
  return list.filter(Boolean).join(', ')
}

export const normalizeContacts = (raw) => {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'object') {
    return Object.entries(raw).map(([dept, val]) => ({
      dept,
      name: val?.name || '',
      email: val?.email || '',
      phone: val?.phone || '',
    }))
  }
  return []
}

export const contactsToText = (raw) => {
  const contacts = normalizeContacts(raw)
  return contacts
    .map(c => [c.dept || '', c.name || '', c.email || '', c.phone || ''].join('; '))
    .join('\n')
}

export const contactsFromText = (txt) => {
  const lines = String(txt || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  return lines.map(line => {
    const parts = line.split(';').map(s => s.trim())
    const [dept, name, email, phone] = parts
    return { dept: dept || '', name: name || '', email: email || '', phone: phone || '' }
  })
}

// ==================== ARRAY UTILS ====================

export const chunk = (arr, size) => {
  const out = []
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size))
  }
  return out
}

// ==================== FLEET & CARRIERS ====================

export const FLEET = ['Carro 1', 'Carro 2', 'Carrinha Frio 1', 'Carrinha 3']

export const CARRIERS_MAP = {
  INTERNO: 'interno',
  SANTOS: 'santosvale',
  STEFF: 'steff'
}

export const weekdays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
