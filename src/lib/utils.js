export const ORDER_STATUS = {
  ESPERA: 'ESPERA',           // encomenda criada, ainda sem tocar
  PREP: 'PREP',               // em preparação pelo armazém
  FALTAS: 'FALTAS',           // aguarda reposição de produto
  A_FATURAR: 'A_FATURAR',     // pronta para faturação
  A_EXPEDIR: 'A_EXPEDIR',     // faturada, está no dept. de rotas (a expedir)
  EMROTA: 'EMROTA',           // já em rota atribuída mas rota ainda não iniciou
  EXPEDIDA: 'EXPEDIDA',       // motorista iniciou rota (em entrega)
  ENTREGUE: 'ENTREGUE',       // entrega concluída (pode ter ocorrências)
  NAOENTREGUE: 'NAOENTREGUE', // não foi entregue nada
  CANCELADA: 'CANCELADA',     // cancelada pelo gestor
}

export const ROLES = {
  ADMIN: 'admin',
  GESTOR: 'gestor',
  CLIENTE: 'cliente',
  ARMAZEM: 'armazem',
  FATURACAO: 'faturacao',
  COMPRAS: 'compras',
  ROTAS: 'rotas',
  MOTORISTA: 'motorista',
}

export const CARRIERS = {
  INTERNO: 'interno',
  SANTOSVALE: 'santosvale',
  STEFF: 'steff',
}

/**
 * Quantas horas passaram desde uma data.
 */
const hoursSince = (value) => {
  if (!value) return 0
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return 0
  return (Date.now() - d.getTime()) / (1000 * 60 * 60)
}

/**
 * Escapar texto para usar em atributos HTML (title, etc.).
 */
const escapeAttr = (s) => {
  if (!s) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * HTML do badge de estado (usado com dangerouslySetInnerHTML).
 */
export const statusBadge = (o = {}) => {
  const status = o.status
  const ageHours = hoursSince(o.date || o.createdAt || o.createdAtISO)

  // para ESPERA, mostramos se já passou 24h
  const extraEspera = ageHours > 24 ? ' (+24h)' : ''

  if (status === ORDER_STATUS.ESPERA) {
    return `<span class="badge badge-espera">Em espera${extraEspera}</span>`
  }

  if (status === ORDER_STATUS.PREP) {
    return '<span class="badge badge-prep">Em preparação</span>'
  }

  if (status === ORDER_STATUS.FALTAS) {
    return '<span class="badge badge-faltas">Aguarda reposição</span>'
  }

  if (status === ORDER_STATUS.A_FATURAR) {
    return '<span class="badge badge-afaturar">A faturar</span>'
  }

  if (status === ORDER_STATUS.A_EXPEDIR) {
    // acabou de ser faturada, está no dept. de rotas à espera de ser inserida numa rota
    return '<span class="badge badge-aexpedir">A expedir</span>'
  }

  if (status === ORDER_STATUS.EMROTA) {
    // já está numa rota planeada, mas o motorista ainda não iniciou
    return '<span class="badge badge-emrota">Em rota (planeada)</span>'
  }

  if (status === ORDER_STATUS.EXPEDIDA) {
    // motorista iniciou a rota → em entrega
    return '<span class="badge badge-expedida">Em entrega</span>'
  }

  if (status === ORDER_STATUS.ENTREGUE) {
    if (o.hasDeliveryIssues) {
      // Preparar tooltip com info do motorista + observação
      const parts = []
      if (o.assignedTo) {
        parts.push(`Motorista: ${o.assignedTo}`)
      }
      if (o.deliveryOutcome) {
        parts.push(`Tipo: ${o.deliveryOutcome}`)
      }
      if (o.deliveryNotes) {
        parts.push(`Obs: ${o.deliveryNotes}`)
      }
      const tooltip = escapeAttr(parts.join(' | '))

      // Encomenda entregue mas com ocorrências (danificado, devolução parcial, etc.)
      // Ao passar o rato em cima do "Entregue ⚠" aparece o balão com estes detalhes
      return `<span class="badge badge-entregue badge-entregue-issues" title="${tooltip}">Entregue ⚠</span>`
    }
    return '<span class="badge badge-entregue">Entregue</span>'
  }

  if (status === ORDER_STATUS.NAOENTREGUE) {
    return '<span class="badge badge-naoentregue">Não entregue</span>'
  }

  if (status === ORDER_STATUS.CANCELADA) {
    return '<span class="badge badge-cancelada">Cancelada</span>'
  }

  return '<span class="badge">—</span>'
}

export const carrierLabel = (c) => {
  if (!c) return '<span class="muted">Por atribuir</span>'
  if (c === CARRIERS.INTERNO || c === 'interno') return 'Nossos carros'
  if (c === CARRIERS.SANTOSVALE || c === 'santosvale') return 'Santos e Vale'
  if (c === CARRIERS.STEFF || c === 'steff') return 'STEFF (frio)'
  return c
}

export const todayISO = () => new Date().toISOString().slice(0, 10)

export const fmtDate = (s) => {
  if (!s) return ''
  try {
    return new Date(s).toISOString().slice(0, 10)
  } catch {
    return ''
  }
}

// ---------------- Pedido em massa (helpers) ----------------
// Reutilizável em todas as páginas.

export const orderKind = (o = {}) => {
  const k = o?.kind || o?.orderKind || o?.type || ''
  return String(k || '').toUpperCase()
}

export const isBulkBatchOrder = (o = {}) => {
  if (!o) return false
  const k = orderKind(o)
  return k === 'BULK_BATCH' || o?.bulkBatch === true || o?.isBulkBatch === true
}

export const isBulkSubOrder = (o = {}) => {
  if (!o) return false
  const k = orderKind(o)
  if (k === 'BULK_SUB') return true
  // fallback por campos do modelo (caso mudem o nome do kind)
  if (o?.bulkSub === true || o?.isBulkSub === true) return true
  if (o?.bulkRequestId && !isBulkBatchOrder(o)) return true
  return false
}
