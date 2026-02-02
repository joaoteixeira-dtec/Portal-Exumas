/**
 * useFirestoreIndexes.js
 * Hooks otimizados para carregar dados do Firestore em batch.
 * Resolve o problema de N+1 queries carregando índices completos uma vez.
 */

import { useQuery } from '@tanstack/react-query'
import { collection, getDocs, query, where, orderBy, documentId } from 'firebase/firestore'
import { db } from './firebase'
import { chunk } from './orderHelpers'

// ==================== FETCH HELPERS ====================

async function fetchCollectionSafe(name) {
  try {
    const snap = await getDocs(collection(db, name))
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch {
    return []
  }
}

async function fetchByIds(collectionName, ids) {
  if (!ids || !ids.length) return []
  const results = []
  for (const pack of chunk(ids, 10)) {
    if (!pack.length) continue
    const snap = await getDocs(
      query(collection(db, collectionName), where(documentId(), 'in', pack))
    )
    snap.docs.forEach(d => results.push({ id: d.id, ...d.data() }))
  }
  return results
}

// ==================== INDEX HOOKS ====================

/**
 * Hook para carregar índice de locais (locations) de forma otimizada.
 * Retorna um objeto { [id]: location }
 */
export function useLocationsIndex() {
  return useQuery({
    queryKey: ['locations-index'],
    queryFn: async () => {
      const names = [
        'locations', 'deliveryLocations', 'delivery_locations',
        'locaisEntrega', 'locais_entrega', 'clientLocations'
      ]
      const all = (await Promise.all(names.map(fetchCollectionSafe))).flat()
      const byId = {}
      all.forEach(l => { byId[l.id] = l })
      return byId
    },
    staleTime: 5 * 60 * 1000 // 5 minutos
  })
}

/**
 * Hook para carregar índice de contratos de forma otimizada.
 * Retorna um objeto { [id]: contract }
 */
export function useContractsIndex() {
  return useQuery({
    queryKey: ['contracts-index'],
    queryFn: async () => {
      const names = ['contracts', 'contratos']
      const all = (await Promise.all(names.map(fetchCollectionSafe))).flat()
      const byId = {}
      all.forEach(c => { byId[c.id] = c })
      return byId
    },
    staleTime: 5 * 60 * 1000
  })
}

/**
 * Hook para carregar índice de utilizadores de forma otimizada.
 * Retorna um objeto { [id]: user }
 */
export function useUsersIndex() {
  return useQuery({
    queryKey: ['users-index'],
    queryFn: async () => {
      const snap = await getDocs(collection(db, 'users'))
      const byId = {}
      snap.docs.forEach(d => { byId[d.id] = { id: d.id, ...d.data() } })
      return byId
    },
    staleTime: 5 * 60 * 1000
  })
}

/**
 * Hook para carregar motoristas
 */
export function useMotoristas() {
  return useQuery({
    queryKey: ['motoristas'],
    queryFn: async () => {
      const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'motorista')))
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    },
    staleTime: 5 * 60 * 1000
  })
}

/**
 * Hook para carregar todas as encomendas com caching otimizado.
 */
export function useAllOrders() {
  return useQuery({
    queryKey: ['orders-all'],
    queryFn: async () => {
      const snap = await getDocs(query(collection(db, 'orders'), orderBy('date', 'desc')))
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    },
    staleTime: 30 * 1000 // 30 segundos
  })
}

/**
 * Hook para carregar rotas num intervalo de datas.
 */
export function useRoutesRange(startISO, endISO) {
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
    enabled: !!startISO && !!endISO,
    staleTime: 60 * 1000
  })
}

/**
 * Hook para nomes de contratos/locais por IDs específicos.
 * Usa batch queries otimizadas.
 */
export function useNamesForOrders(orders = []) {
  const contractIds = [...new Set(orders.map(o => o.contractId).filter(Boolean))]
  const locationIds = [...new Set(orders.map(o => o.locationId).filter(Boolean))]

  return useQuery({
    queryKey: ['names-for-orders', contractIds.join(','), locationIds.join(',')],
    queryFn: async () => {
      const [contracts, locations] = await Promise.all([
        fetchByIds('contracts', contractIds),
        fetchByIds('locations', locationIds)
      ])
      
      const contractMap = {}
      contracts.forEach(c => { contractMap[c.id] = c.nome || c.name || c.id })
      
      const locationMap = {}
      locations.forEach(l => { locationMap[l.id] = l.nome || l.name || l.id })
      
      return { contractMap, locationMap }
    },
    enabled: orders.length > 0,
    staleTime: 5 * 60 * 1000
  })
}

/**
 * Hook para produtos globais
 */
export function useProducts() {
  return useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const snap = await getDocs(collection(db, 'products'))
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    },
    staleTime: 10 * 60 * 1000
  })
}

/**
 * Hook para produtos de um contrato específico
 */
export function useContractProducts(contractId) {
  return useQuery({
    queryKey: ['contract_products', contractId],
    queryFn: async () => {
      if (!contractId) return []
      const qRef = query(collection(db, 'contract_products'), where('contractId', '==', contractId))
      const snap = await getDocs(qRef)
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    },
    enabled: !!contractId,
    staleTime: 5 * 60 * 1000
  })
}

// ==================== STATS HELPERS ====================

/**
 * Calcula estatísticas agregadas de encomendas.
 */
export function computeOrderStats(orders = []) {
  const stats = {
    total: orders.length,
    byStatus: {},
    byCarrier: {},
    totalValue: 0,
    avgValue: 0,
    today: 0,
    thisWeek: 0,
    thisMonth: 0
  }

  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  for (const o of orders) {
    // Por status
    const status = o.status || 'UNKNOWN'
    stats.byStatus[status] = (stats.byStatus[status] || 0) + 1

    // Por transportadora
    const carrier = o.carrier || 'unassigned'
    stats.byCarrier[carrier] = (stats.byCarrier[carrier] || 0) + 1

    // Valor
    const value = o.total || (o.items || []).reduce((s, it) => s + (+it.preco || 0) * (+it.qty || 0), 0)
    stats.totalValue += value

    // Por data
    const dateStr = (o.date || '').slice(0, 10)
    if (dateStr === todayStr) stats.today++
    if (dateStr >= weekAgo) stats.thisWeek++
    if (dateStr >= monthAgo) stats.thisMonth++
  }

  stats.avgValue = stats.total > 0 ? stats.totalValue / stats.total : 0

  return stats
}
