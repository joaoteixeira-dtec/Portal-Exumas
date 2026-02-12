/**
 * OrderForm.jsx
 * Componente para criação de encomendas (normal e em massa).
 * Extraído do Gestor.jsx monolítico para melhor manutenção.
 */

import { useState, useEffect, useRef, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  collection, doc, getDocs, addDoc, setDoc, updateDoc,
  runTransaction, writeBatch, query, where
} from 'firebase/firestore'
import { db } from '../../../lib/firebase'
import { ORDER_STATUS, CARRIERS } from '../../../lib/utils'
import { logOrderEvent } from '../../../lib/orderEvents'
import { useWarehouse } from '../../../contexts/WarehouseContext'

// ==================== HELPERS ====================

const getErrMsg = (e) => {
  const code = e?.code ? ` (${e.code})` : ''
  return `${e?.message || String(e)}${code}`
}

const isPermDenied = (e) =>
  e?.code === 'permission-denied' ||
  /insufficient permissions/i.test(String(e?.message || ''))

const isResourceExhausted = (e) =>
  e?.code === 'resource-exhausted' ||
  /quota exceeded/i.test(String(e?.message || '')) ||
  /resource exhausted/i.test(String(e?.message || ''))

const isTxContention = (e) =>
  e?.code === 'aborted' || e?.code === 'failed-precondition'

const shouldFallbackCounter = (e) =>
  isPermDenied(e) || isResourceExhausted(e) || isTxContention(e)

const norm = (s) => (s || '').toString().toLowerCase().trim()

// ==================== COMPONENT ====================

export default function OrderForm({ clients = [], profile, onCreated }) {
  const qc = useQueryClient()
  const wh = useWarehouse()
  const activeWarehouse = wh?.activeWarehouse || profile?.defaultWarehouse || null

  // Mode: normal ou bulk
  const [orderMode, setOrderMode] = useState('normal')

  // Selecção cliente/contrato/local
  const [clientId, setClientId] = useState('')
  const [contractId, setContractId] = useState('')
  const [locId, setLocId] = useState('')

  // Campos comuns
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [externalRef, setExternalRef] = useState('')
  const [notes, setNotes] = useState('')
  const [carrier, setCarrier] = useState('')

  // Janela de entrega
  const [deliveryWindowStart, setDeliveryWindowStart] = useState('')
  const [deliveryWindowEnd, setDeliveryWindowEnd] = useState('')
  const [deliveryWindowAuto, setDeliveryWindowAuto] = useState(true)

  // Basket (normal mode)
  const [basket, setBasket] = useState([])
  const [selPid, setSelPid] = useState('')
  const [selQty, setSelQty] = useState('')
  const qtyRef = useRef(null)

  // Extra product
  const [extra, setExtra] = useState({ nome: '', unidade: '', preco: '', qty: '' })

  // Bulk mode
  const [bulkText, setBulkText] = useState('')

  // Errors
  const [createErr, setCreateErr] = useState('')

  // ==================== QUERIES ====================

  // Contratos do cliente selecionado
  const contractsQ = useQuery({
    queryKey: ['contracts-for-client', clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const snap = await getDocs(query(
        collection(db, 'contracts'),
        where('clientId', '==', clientId)
      ))
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    }
  })
  const contractsForClient = useMemo(() => contractsQ.data || [], [contractsQ.data])

  // Locais do contrato selecionado
  const locationsQ = useQuery({
    queryKey: ['locations-for-contract', contractId],
    enabled: !!contractId && contractId !== '__NONE__',
    queryFn: async () => {
      const snap = await getDocs(query(
        collection(db, 'locations'),
        where('contractId', '==', contractId)
      ))
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    }
  })
  const locationsForContract = useMemo(() => locationsQ.data || [], [locationsQ.data])

  // Produtos do contrato
  const productsQ = useQuery({
    queryKey: ['contract_products', contractId],
    enabled: !!contractId && contractId !== '__NONE__',
    queryFn: async () => {
      const snap = await getDocs(query(
        collection(db, 'contract_products'),
        where('contractId', '==', contractId)
      ))
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    }
  })
  const contractProducts = useMemo(() => productsQ.data || [], [productsQ.data])

  // ==================== EFFECTS ====================

  // Reset quando muda cliente
  useEffect(() => {
    setContractId('')
    setLocId('')
    setBasket([])
  }, [clientId])

  // Reset quando muda contrato
  useEffect(() => {
    setLocId('')
    setBasket([])
  }, [contractId])

  // Auto-fill delivery window
  useEffect(() => {
    setDeliveryWindowAuto(true)
  }, [locId])

  useEffect(() => {
    if (!locId) {
      setDeliveryWindowStart('')
      setDeliveryWindowEnd('')
      return
    }
    const loc = locationsForContract.find(l => l.id === locId)
    if (!loc) return
    if (deliveryWindowAuto) {
      setDeliveryWindowStart(loc.deliveryWindowStart || '')
      setDeliveryWindowEnd(loc.deliveryWindowEnd || '')
    }
  }, [locId, locationsForContract, deliveryWindowAuto])

  // Focus qty input
  useEffect(() => {
    if (selPid && qtyRef.current) {
      qtyRef.current.focus()
      qtyRef.current.select()
    }
  }, [selPid])

  // ==================== BASKET HANDLERS ====================

  const addSelectedContractProduct = () => {
    if (!selPid) return
    const p = contractProducts.find(x => x.id === selPid)
    if (!p) return
    const q = parseFloat(selQty || '0')
    if (!isFinite(q) || q <= 0) return
    setBasket(b => [...b, {
      productId: p.id,
      productName: p.nome,
      unidade: p.unidade,
      preco: p.preco,
      qty: q,
      preparedQty: 0
    }])
    setSelPid('')
    setSelQty('')
  }

  const setBasketQty = (idx, v) => {
    const q = Math.max(0, parseFloat(v || '0') || 0)
    setBasket(b => {
      const c = [...b]
      c[idx] = { ...c[idx], qty: q }
      return c
    })
  }

  const addExtraProduct = () => {
    const nome = String(extra.nome || '').trim()
    const unidade = String(extra.unidade || '').trim()
    const preco = parseFloat(String(extra.preco || '').replace(',', '.'))
    const qty = parseFloat(String(extra.qty || '').replace(',', '.'))
    if (!nome || !unidade || !isFinite(preco) || preco <= 0 || !isFinite(qty) || qty <= 0) return
    setBasket(b => [...b, {
      productId: 'extra-' + Date.now(),
      productName: nome,
      unidade,
      preco,
      qty,
      preparedQty: 0
    }])
    setExtra({ nome: '', unidade: '', preco: '', qty: '' })
  }

  // ==================== BULK PREVIEW ====================

  const bulkPreview = useMemo(() => {
    if (orderMode !== 'bulk') return null
    if (!bulkText.trim()) return { groups: [], invalid: [], totalLines: 0, delim: '' }
    if (!contractId || contractId === '__NONE__') return { groups: [], invalid: [], totalLines: 0, delim: '' }

    const lines = bulkText.split(/\r?\n/)
    const workLines = lines.map(l => l.trim()).filter(Boolean)

    // Detect delimiter
    const tabCount = workLines.filter(l => l.includes('\t')).length
    const semicolonCount = workLines.filter(l => l.includes(';')).length
    const delim = tabCount >= semicolonCount ? '\t' : ';'

    // Build maps
    const locMap = new Map()
    for (const loc of locationsForContract) {
      locMap.set(norm(loc.nome), loc)
      if (loc.alias) locMap.set(norm(loc.alias), loc)
    }
    const prodMap = new Map()
    for (const prod of contractProducts) {
      prodMap.set(norm(prod.nome), prod)
      if (prod.alias) prodMap.set(norm(prod.alias), prod)
    }

    const rows = []
    const invalid = []

    for (let i = 0; i < workLines.length; i++) {
      const line = workLines[i]
      const cells = line.split(delim).map(c => c.trim())
      const [locName, prodName, qtyStr, externalRefRow, noteRow] = cells
      const qty = parseFloat(String(qtyStr || '').replace(',', '.'))

      if (!locName) {
        invalid.push({ line: i + 1, reason: 'Local em falta' })
        continue
      }
      if (!prodName) {
        invalid.push({ line: i + 1, reason: 'Produto em falta' })
        continue
      }
      if (!isFinite(qty) || qty <= 0) {
        invalid.push({ line: i + 1, reason: 'Quantidade inválida' })
        continue
      }

      const loc = locMap.get(norm(locName))
      if (!loc) {
        invalid.push({ line: i + 1, reason: `Local não encontrado: ${locName}` })
        continue
      }

      const prod = prodMap.get(norm(prodName))
      if (!prod) {
        invalid.push({ line: i + 1, reason: `Produto não encontrado: ${prodName}` })
        continue
      }

      rows.push({
        locationId: loc.id,
        locationName: loc.nome,
        deliveryWindowStart: loc.deliveryWindowStart || '',
        deliveryWindowEnd: loc.deliveryWindowEnd || '',
        externalRef: externalRefRow || '',
        note: noteRow || '',
        productId: prod.id,
        productName: prod.nome,
        unidade: prod.unidade,
        preco: +prod.preco || 0,
        qty,
      })
    }

    // Group by location
    const groupBy = new Map()
    for (const r of rows) {
      const key = r.locationId
      if (!groupBy.has(key)) {
        groupBy.set(key, {
          locationId: r.locationId,
          locationName: r.locationName,
          deliveryWindowStart: r.deliveryWindowStart || '',
          deliveryWindowEnd: r.deliveryWindowEnd || '',
          externalRef: r.externalRef || '',
          notes: [],
          items: [],
        })
      }
      const g = groupBy.get(key)
      if (r.externalRef && !g.externalRef) g.externalRef = r.externalRef
      if (r.note) g.notes.push(r.note)

      const existing = g.items.find(it => String(it.productId) === String(r.productId))
      if (existing) {
        existing.qty = (+existing.qty || 0) + (+r.qty || 0)
      } else {
        g.items.push({
          productId: r.productId,
          productName: r.productName,
          unidade: r.unidade,
          preco: r.preco,
          qty: r.qty,
          preparedQty: 0,
        })
      }
    }

    const groups = Array.from(groupBy.values()).map(g => ({
      ...g,
      notes: (g.notes || []).filter(Boolean).join(' | '),
    }))

    return { groups, invalid, totalLines: workLines.length, delim }
  }, [orderMode, bulkText, locationsForContract, contractProducts, contractId])

  // ==================== MUTATIONS ====================

  const createOrder = useMutation({
    onMutate: () => setCreateErr(''),
    mutationFn: async () => {
      const noContract = (contractId === '__NONE__')
      if (!clientId || basket.length === 0) throw new Error('Dados em falta')
      if (!noContract && (!contractId || !locId)) throw new Error('Seleciona contrato e local')

      const cli = clients.find(c => c.id === clientId)
      const status = ORDER_STATUS?.ESPERA || 'ESPERA'
      const now = new Date().toISOString()

      const orderRef = doc(collection(db, 'orders'))

      // Internal number
      const monthBase = date ? new Date(`${date}T00:00:00`) : new Date(now)
      const yyyy = monthBase.getFullYear()
      const mm = String(monthBase.getMonth() + 1).padStart(2, '0')
      const yy = String(yyyy).slice(-2)
      const monthKey = `${yyyy}${mm}`

      let internal = null

      try {
        internal = await runTransaction(db, async (tx) => {
          const counterRef = doc(db, 'counters', `orders_${monthKey}`)
          const snap = await tx.get(counterRef)
          const next = snap.exists() ? (+snap.data()?.next || 1) : 1

          tx.set(counterRef, { next: next + 1 }, { merge: true })

          const seqStr = String(next).padStart(5, '0')
          const internalNoStr = `E${yy}${mm}-${seqStr}`
          const internalNo = Number(`${monthKey}${seqStr}`)

          tx.set(orderRef, {
            clientId,
            clientName: cli?.name || 'Cliente',
            contractId: noContract ? null : contractId,
            locationId: noContract ? null : (locId || null),
            deliveryWindowStart: (!noContract && locId) ? (deliveryWindowStart || null) : null,
            deliveryWindowEnd: (!noContract && locId) ? (deliveryWindowEnd || null) : null,
            date,
            externalRef: externalRef || '',
            internalNo,
            internalNoStr,
            internalMonth: monthKey,
            internalSeq: next,
            status,
            carrier: carrier || null,
            armazem: activeWarehouse || null,
            items: basket,
            needsWarehouseCompletion: false,
            notes: notes || '',
            createdAt: now,
            createdByUid: profile?.uid || profile?.id || profile?.userId || null,
            createdByName: profile?.name || profile?.displayName || profile?.username || profile?.email || 'Gestor',
            createdByEmail: profile?.email || null,
          })

          return { internalNo, internalNoStr, internalMonth: monthKey, internalSeq: next }
        })
      } catch (e) {
        if (!shouldFallbackCounter(e)) throw e

        // Fallback without counter
        const seqStr = String(Math.floor(Math.random() * 99999) + 1).padStart(5, '0')
        const internalNoStr = `E${yy}${mm}-X${seqStr}`
        const internalNo = Number(`${monthKey}${seqStr}`)

        await setDoc(orderRef, {
          clientId,
          clientName: cli?.name || 'Cliente',
          contractId: noContract ? null : contractId,
          locationId: noContract ? null : (locId || null),
          deliveryWindowStart: (!noContract && locId) ? (deliveryWindowStart || null) : null,
          deliveryWindowEnd: (!noContract && locId) ? (deliveryWindowEnd || null) : null,
          date,
          externalRef: externalRef || '',
          internalNo,
          internalNoStr,
          internalMonth: monthKey,
          internalSeq: null,
          internalFallback: true,
          status,
          carrier: carrier || null,
          armazem: activeWarehouse || null,
          items: basket,
          needsWarehouseCompletion: false,
          notes: notes || '',
          createdAt: now,
          createdByUid: profile?.uid || profile?.id || profile?.userId || null,
          createdByName: profile?.name || profile?.displayName || profile?.username || profile?.email || 'Gestor',
          createdByEmail: profile?.email || null,
        })

        internal = { internalNo, internalNoStr, internalMonth: monthKey, internalSeq: null }
      }

      // Log event (non-blocking)
      try {
        await logOrderEvent({
          orderId: orderRef.id,
          type: 'CREATED',
          role: profile?.role || 'gestor',
          profile,
          meta: {
            clientId,
            contractId: noContract ? null : contractId,
            locationId: noContract ? null : (locId || null),
            toStatus: status,
            createdAt: now,
            internalNo: internal?.internalNo,
            internalNoStr: internal?.internalNoStr,
          },
        })
      } catch (e) {
        console.warn('⚠️ Falhou logOrderEvent:', e?.message || e)
      }

      return orderRef.id
    },
    onSuccess: () => {
      setBasket([])
      setExternalRef('')
      setNotes('')
      // Invalidate all order queries to ensure new order shows up everywhere
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.refetchQueries({ queryKey: ['orders'] })
      if (onCreated) onCreated()
    },
    onError: (e) => {
      console.error(e)
      setCreateErr(getErrMsg(e))
    },
  })

  const createBulkRequest = useMutation({
    onMutate: () => setCreateErr(''),
    mutationFn: async () => {
      if (orderMode !== 'bulk') throw new Error('Modo inválido')
      if (!clientId) throw new Error('Seleciona cliente')
      if (!contractId || contractId === '__NONE__') throw new Error('Seleciona um contrato')

      const preview = bulkPreview
      if (!preview?.groups?.length) throw new Error('Sem encomendas para criar')
      if (preview?.invalid?.length) throw new Error('Existem linhas inválidas')

      const cli = clients.find(c => c.id === clientId)
      const ctr = contractsForClient.find(c => c.id === contractId)
      const now = new Date().toISOString()

      // 1) Create master bulk request
      const res = await addDoc(collection(db, 'bulk_requests'), {
        kind: 'PEDIDO_EM_MASSA',
        clientId,
        clientName: cli?.name || 'Cliente',
        contractId,
        contractName: ctr?.nome || '',
        date,
        carrier: carrier || null,
        armazem: activeWarehouse || null,
        notes: notes || '',
        rawText: bulkText || '',
        delimiter: preview.delim || '',
        totalLines: preview.totalLines || 0,
        groupsCount: preview.groups.length,
        groups: preview.groups,
        status: 'DRAFT',
        createdAt: now,
        createdByUid: profile?.uid || profile?.id || profile?.userId || null,
        createdByName: profile?.name || profile?.displayName || profile?.username || profile?.email || 'Gestor',
        createdByEmail: profile?.email || null,
      })

      // 2) Create sub-orders
      const bulkRequestId = res.id
      const groups = preview.groups || []
      const count = groups.length
      const baseDate = date || new Date().toISOString().slice(0, 10)
      const d = new Date(`${baseDate}T00:00:00`)
      const yy = String(d.getFullYear()).slice(-2)
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const monthKey = `${d.getFullYear()}${mm}`

      let startSeq = null
      try {
        const counterRef = doc(db, 'counters', `orders_${monthKey}`)
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(counterRef)
          const next = snap.exists() ? (+snap.data().next || 1) : 1
          startSeq = next
          tx.set(counterRef, { next: next + count }, { merge: true })
        })
      } catch (e) {
        if (!shouldFallbackCounter(e)) throw e
        startSeq = null
      }

      const base = {
        kind: 'BULK_SUB',
        bulkRequestId,
        bulkBatchId: null,
        bulkBatchStatus: null,
        clientId,
        clientName: cli?.name || 'Cliente',
        contractId,
        contractName: ctr?.nome || '',
        date: baseDate,
        carrier: carrier || null,
        armazem: activeWarehouse || null,
        notes: notes || '',
        status: ORDER_STATUS.ESPERA,
        createdAt: now,
        createdByUid: profile?.uid || profile?.id || profile?.userId || null,
        createdByName: profile?.name || profile?.displayName || profile?.username || profile?.email || 'Gestor',
        createdByEmail: profile?.email || null,
      }

      const makeInternal = (seq) => {
        const seqStr = String(seq).padStart(5, '0')
        return {
          internalNoStr: `E${yy}${mm}-${seqStr}`,
          internalNo: Number(`${monthKey}${seqStr}`),
          internalMonth: monthKey,
          internalSeq: seq,
        }
      }

      const randSeq = () => Math.floor(Math.random() * 99999) + 1

      // Firestore batch: <=500 ops
      const chunkSize = 450
      for (let i = 0; i < groups.length; i += chunkSize) {
        const slice = groups.slice(i, i + chunkSize)
        const b = writeBatch(db)
        slice.forEach((g, idx) => {
          const globalIndex = i + idx
          const orderRef = doc(collection(db, 'orders'))
          const seq = startSeq != null ? (startSeq + globalIndex) : randSeq()
          const internal = makeInternal(seq)
          const items = (g.items || []).map(it => ({
            ...it,
            qty: +it.qty || 0,
            preparedQty: +it.preparedQty || 0,
          }))
          const gNotes = (g.notes || g.note || '').trim()
          const mergedNotes = [base.notes, gNotes].filter(Boolean).join(' | ')

          b.set(orderRef, {
            ...base,
            ...internal,
            locationId: g.locationId || '',
            locationName: g.locationName || '',
            deliveryWindowStart: g.deliveryWindowStart || null,
            deliveryWindowEnd: g.deliveryWindowEnd || null,
            externalRef: g.externalRef || g.ref || '',
            notes: mergedNotes,
            items,
          })
        })
        await b.commit()
      }

      // Update master status
      try {
        await updateDoc(doc(db, 'bulk_requests', bulkRequestId), {
          status: 'SUB_ORDERS_CREATED',
          subOrdersCount: count,
          subOrdersCreatedAt: now,
        })
      } catch {}

      return { bulkRequestId, subOrdersCount: count }
    },
    onSuccess: (data) => {
      setBulkText('')
      setNotes('')
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['bulk_requests'] })
      alert(`Pedido em massa criado: ${data.subOrdersCount} encomendas`)
      if (onCreated) onCreated()
    },
    onError: (e) => {
      console.error(e)
      setCreateErr(getErrMsg(e))
    },
  })

  // ==================== RENDER ====================

  const basketTotal = basket.reduce((s, it) => s + (+it.qty || 0) * (+it.preco || 0), 0)

  return (
    <section>
      {/* Mode selector - tabs modernos */}
      <div className="card" style={{ marginBottom: '20px', padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button 
              onClick={() => setOrderMode('normal')}
              style={{
                padding: '10px 20px',
                background: orderMode === 'normal' 
                  ? 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)' 
                  : 'transparent',
                color: orderMode === 'normal' ? 'white' : 'var(--ui-text-dim)',
                border: orderMode === 'normal' ? 'none' : '1px solid var(--ui-border)',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '13px',
                transition: 'all 0.2s ease'
              }}
            >
              Encomenda
            </button>
            <button 
              onClick={() => setOrderMode('bulk')}
              style={{
                padding: '10px 20px',
                background: orderMode === 'bulk' 
                  ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' 
                  : 'transparent',
                color: orderMode === 'bulk' ? 'white' : 'var(--ui-text-dim)',
                border: orderMode === 'bulk' ? 'none' : '1px solid var(--ui-border)',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '13px',
                transition: 'all 0.2s ease'
              }}
            >
              Pedido em massa
            </button>
          </div>
          {orderMode === 'bulk' && (
            <div style={{ fontSize: 12, color: 'var(--ui-text-dim)' }}>
              Importa linhas do Excel (copiar/colar) e cria múltiplas encomendas de uma vez.
            </div>
          )}
        </div>
      </div>

      {/* Formulário principal */}
      <div className="card" style={{ marginBottom: '20px', padding: '20px' }}>
        {/* Client / Contract / Location / Date */}
        <div className="grid" style={{ marginBottom: '16px' }}>
          <div className="span-3">
            <div style={{ fontSize: '11px', color: 'var(--ui-text-dim)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Cliente
            </div>
            <select value={clientId} onChange={e => setClientId(e.target.value)} style={{ width: '100%' }}>
              <option value="">— cliente —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="span-3">
            <div style={{ fontSize: '11px', color: 'var(--ui-text-dim)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Contrato
            </div>
            <select value={contractId} onChange={e => setContractId(e.target.value)} disabled={!clientId} style={{ width: '100%' }}>
              <option value="">— contrato —</option>
              <option value="__NONE__">— sem contrato —</option>
              {contractsForClient.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>

          {orderMode === 'normal' ? (
            <div className="span-3">
              <div style={{ fontSize: '11px', color: 'var(--ui-text-dim)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Local
              </div>
              <select value={locId} onChange={e => setLocId(e.target.value)} disabled={!contractId || contractId === '__NONE__'} style={{ width: '100%' }}>
                <option value="">{(!contractId || contractId === '__NONE__') ? '— sem contrato —' : '— local —'}</option>
                {locationsForContract.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
              </select>
            </div>
          ) : (
            <div className="span-3">
              <div style={{ fontSize: '11px', color: 'var(--ui-text-dim)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Local
              </div>
              <select value="" disabled style={{ width: '100%' }}>
                <option value="">— definido nas linhas —</option>
              </select>
            </div>
          )}

          <div className="span-3">
            <div style={{ fontSize: '11px', color: 'var(--ui-text-dim)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Data
            </div>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ width: '100%' }} />
          </div>
        </div>

        {/* Delivery window (normal mode only) */}
        {orderMode === 'normal' && (
          <div className="grid" style={{ marginBottom: '16px' }}>
            <div className="span-3">
              <div style={{ fontSize: '11px', color: 'var(--ui-text-dim)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Janela Entrega (Início)
              </div>
              <input
                type="time"
                value={deliveryWindowStart}
                onChange={e => { setDeliveryWindowStart(e.target.value); setDeliveryWindowAuto(false) }}
                disabled={!contractId || contractId === '__NONE__' || !locId}
                style={{ width: '100%' }}
              />
            </div>
            <div className="span-3">
              <div style={{ fontSize: '11px', color: 'var(--ui-text-dim)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Janela Entrega (Fim)
              </div>
              <input
                type="time"
                value={deliveryWindowEnd}
                onChange={e => { setDeliveryWindowEnd(e.target.value); setDeliveryWindowAuto(false) }}
                disabled={!contractId || contractId === '__NONE__' || !locId}
                style={{ width: '100%' }}
              />
            </div>
            <div className="span-3">
              <div style={{ fontSize: '11px', color: 'var(--ui-text-dim)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                N.º Externo (Cliente)
              </div>
              <input value={externalRef} onChange={e => setExternalRef(e.target.value)} placeholder="Opcional" style={{ width: '100%' }} />
            </div>
            <div className="span-3">
              <div style={{ fontSize: '11px', color: 'var(--ui-text-dim)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Transporte (Opcional)
              </div>
              <select value={carrier} onChange={e => setCarrier(e.target.value)} style={{ width: '100%' }}>
                <option value="">Por atribuir</option>
                <option value="interno">Nossos carros</option>
                <option value="santosvale">Santos e Vale</option>
                <option value="steff">STEFF (frio)</option>
              </select>
            </div>
          </div>
        )}

        {orderMode !== 'normal' && (
          <div className="grid" style={{ marginBottom: '16px' }}>
            <div className="span-6">
              <div style={{ fontSize: '11px', color: 'var(--ui-text-dim)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                N.º Externo (Cliente)
              </div>
              <input value={externalRef} onChange={e => setExternalRef(e.target.value)} placeholder="Opcional" style={{ width: '100%' }} />
            </div>
            <div className="span-6">
              <div style={{ fontSize: '11px', color: 'var(--ui-text-dim)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Transporte (Opcional)
              </div>
              <select value={carrier} onChange={e => setCarrier(e.target.value)} style={{ width: '100%' }}>
                <option value="">Por atribuir</option>
                <option value="interno">Nossos carros</option>
                <option value="santosvale">Santos e Vale</option>
                <option value="steff">STEFF (frio)</option>
              </select>
            </div>
          </div>
        )}

        <div>
          <div style={{ fontSize: '11px', color: 'var(--ui-text-dim)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Observações
          </div>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notas/observações" style={{ width: '100%' }} />
        </div>
      </div>

      {/* ========== NORMAL MODE ========== */}
      {orderMode === 'normal' && (
        <>
          {/* Add contract product */}
          <div className="card" style={{ marginBottom: '20px', padding: '20px' }}>
            <h4 style={{ margin: '0 0 16px', color: 'var(--ui-text)', fontWeight: 600 }}>Adicionar produto contratado</h4>
            <div className="grid">
              <div className="span-6">
                <div style={{ fontSize: '11px', color: 'var(--ui-text-dim)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Produto (lista do contrato)
                </div>
                <select value={selPid} onChange={e => setSelPid(e.target.value)} disabled={contractId === '__NONE__' || !contractId} style={{ width: '100%' }}>
                  <option value="">{(!contractId || contractId === '__NONE__') ? '— selecione um contrato —' : '— selecionar —'}</option>
                  {contractProducts.map(p => (
                    <option key={p.id} value={p.id}>{p.nome} ({p.unidade}) — {(+p.preco || 0).toFixed(2)}€</option>
                  ))}
                </select>
              </div>
              <div className="span-3">
                <div style={{ fontSize: '11px', color: 'var(--ui-text-dim)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Quantidade
                </div>
                <input
                  ref={qtyRef}
                  type="number"
                  step="0.01"
                  min="0"
                  value={selQty}
                  onChange={e => setSelQty(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSelectedContractProduct() } }}
                  placeholder="ex.: 5"
                  style={{ width: '100%' }}
                />
              </div>
              <div className="span-3" style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button 
                  onClick={addSelectedContractProduct} 
                  disabled={!selPid || !selQty}
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    background: (!selPid || !selQty) ? 'var(--ui-bg)' : 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                    color: (!selPid || !selQty) ? 'var(--ui-text-dim)' : 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: (!selPid || !selQty) ? 'not-allowed' : 'pointer',
                    fontWeight: 600,
                    fontSize: '13px',
                    transition: 'all 0.2s ease'
                  }}
                >
                  Adicionar
                </button>
              </div>
            </div>
          </div>

          {/* Extra product */}
          <div className="card" style={{ marginBottom: '20px', padding: '20px' }}>
            <details>
              <summary style={{ cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  padding: '6px 12px',
                  background: 'rgba(59,130,246,0.15)',
                  color: '#3b82f6',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600
                }}>+ ADICIONAR PRODUTO EXTRA (NÃO CONTRATADO)</span>
              </summary>
              <div className="grid" style={{ marginTop: 16 }}>
                <div className="span-4">
                  <div style={{ fontSize: '11px', color: 'var(--ui-text-dim)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Nome
                  </div>
                  <input value={extra.nome} onChange={e => setExtra(s => ({ ...s, nome: e.target.value }))} placeholder="ex.: Pão de forma" style={{ width: '100%' }} />
                </div>
                <div className="span-2">
                  <div style={{ fontSize: '11px', color: 'var(--ui-text-dim)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Unidade
                  </div>
                  <input value={extra.unidade} onChange={e => setExtra(s => ({ ...s, unidade: e.target.value }))} placeholder="kg, un, cx…" style={{ width: '100%' }} />
                </div>
                <div className="span-3">
                  <div style={{ fontSize: '11px', color: 'var(--ui-text-dim)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Preço
                  </div>
                  <input type="number" step="0.01" min="0" value={extra.preco} onChange={e => setExtra(s => ({ ...s, preco: e.target.value }))} placeholder="€" style={{ width: '100%' }} />
                </div>
                <div className="span-3">
                  <div style={{ fontSize: '11px', color: 'var(--ui-text-dim)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Quantidade
                  </div>
                  <input type="number" step="0.01" min="0" value={extra.qty} onChange={e => setExtra(s => ({ ...s, qty: e.target.value }))} placeholder="ex.: 2" style={{ width: '100%' }} />
                </div>
                <div className="span-12" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                  <button 
                    onClick={addExtraProduct} 
                    disabled={!extra.nome || !extra.unidade || !extra.preco || !extra.qty}
                    style={{
                      padding: '8px 16px',
                      background: 'transparent',
                      color: 'var(--ui-text-dim)',
                      border: '1px solid var(--ui-border)',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: 500,
                      fontSize: '13px'
                    }}
                  >
                    Adicionar extra
                  </button>
                </div>
              </div>
            </details>
          </div>

          {/* Basket - tabela moderna */}
          <div className="card" style={{ marginBottom: '20px', padding: '0', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <th style={{ textAlign: 'left', padding: '14px 16px', color: '#3b82f6', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Produto</th>
                  <th style={{ textAlign: 'left', padding: '14px 16px', color: '#3b82f6', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Un.</th>
                  <th style={{ textAlign: 'left', padding: '14px 16px', color: '#3b82f6', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Preço</th>
                  <th style={{ textAlign: 'left', padding: '14px 16px', color: '#3b82f6', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', width: 140 }}>Qtd</th>
                  <th style={{ padding: '14px 16px' }}></th>
                </tr>
              </thead>
              <tbody>
                {basket.map((it, idx) => (
                  <tr key={idx} style={{ borderTop: '1px solid var(--ui-border)' }}>
                    <td style={{ padding: '12px 16px', color: 'var(--ui-text)' }}>{it.productName}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--ui-text-dim)' }}>{it.unidade}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--ui-text-dim)' }}>{(+it.preco || 0).toFixed(2)}€</td>
                    <td style={{ padding: '12px 16px' }}>
                      <input type="number" step="0.01" min="0" value={it.qty} onChange={e => setBasketQty(idx, e.target.value)} style={{ width: '100%' }} />
                    </td>
                    <td style={{ textAlign: 'right', padding: '12px 16px' }}>
                      <button 
                        onClick={() => setBasket(b => b.filter((_, i) => i !== idx))}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#ef4444',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: 500
                        }}
                      >
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
                {!basket.length && (
                  <tr>
                    <td colSpan="5" style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--ui-text-dim)' }}>
                      Sem itens ainda. Adiciona produtos acima.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Create button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            {createErr && (
              <div style={{ 
                padding: '8px 14px', 
                background: 'rgba(239,68,68,0.15)', 
                borderRadius: '8px',
                color: '#ef4444',
                fontSize: '13px'
              }}>
                {createErr}
              </div>
            )}
            <div style={{ 
              padding: '10px 18px', 
              background: 'rgba(59,130,246,0.15)', 
              borderRadius: '20px',
              color: '#3b82f6',
              fontWeight: 700,
              fontSize: '14px'
            }}>
              TOTAL: {basketTotal.toFixed(2)}€
            </div>
            <button 
              onClick={() => createOrder.mutate()} 
              disabled={createOrder.isPending}
              style={{
                padding: '12px 24px',
                background: createOrder.isPending ? 'var(--ui-bg)' : 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: createOrder.isPending ? 'not-allowed' : 'pointer',
                fontWeight: 600,
                fontSize: '14px',
                transition: 'all 0.2s ease'
              }}
            >
              {createOrder.isPending ? 'A criar...' : 'Criar encomenda'}
            </button>
          </div>
        </>
      )}

      {/* ========== BULK MODE ========== */}
      {orderMode === 'bulk' && (
        <div className="card" style={{ padding: '20px' }}>
          <h4 style={{ margin: '0 0 12px', color: 'var(--ui-text)', fontWeight: 600 }}>Pedido em massa</h4>
          <p style={{ margin: '0 0 16px', color: 'var(--ui-text-dim)', fontSize: '13px', lineHeight: 1.5 }}>
            Cola aqui as linhas do Excel (copiar/colar). Formato: <strong style={{ color: 'var(--ui-text)' }}>Local</strong> / <strong style={{ color: 'var(--ui-text)' }}>Produto</strong> / <strong style={{ color: 'var(--ui-text)' }}>Quantidade</strong> / Ref (opcional) / Nota (opcional).
          </p>

          {contractId === '__NONE__' && (
            <div style={{ 
              padding: '10px 14px', 
              background: 'rgba(239,68,68,0.15)', 
              borderRadius: '8px',
              color: '#ef4444',
              fontSize: '13px',
              marginBottom: '16px'
            }}>
              ⚠️ Seleciona um contrato para poder usar o pedido em massa.
            </div>
          )}

          <textarea
            rows={10}
            value={bulkText}
            onChange={e => setBulkText(e.target.value)}
            disabled={!contractId || contractId === '__NONE__'}
            placeholder="Local    Produto    Quantidade    RefExterna    Nota"
            style={{ 
              width: '100%', 
              fontFamily: 'monospace', 
              fontSize: '12px',
              background: 'var(--ui-bg)',
              border: '1px solid var(--ui-border)',
              borderRadius: '8px',
              padding: '12px',
              color: 'var(--ui-text)',
              resize: 'vertical'
            }}
          />

          {/* Preview */}
          {bulkPreview && bulkPreview.groups.length > 0 && (
            <div style={{ marginTop: '20px' }}>
              <h5 style={{ 
                margin: '0 0 12px', 
                color: '#22c55e',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                ✅ Pré-visualização: 
                <span style={{
                  padding: '4px 10px',
                  background: 'rgba(34,197,94,0.15)',
                  borderRadius: '12px',
                  fontSize: '12px'
                }}>
                  {bulkPreview.groups.length} encomenda(s)
                </span>
              </h5>
              <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <th style={{ textAlign: 'left', padding: '12px 16px', color: '#3b82f6', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Local</th>
                      <th style={{ textAlign: 'left', padding: '12px 16px', color: '#3b82f6', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Itens</th>
                      <th style={{ textAlign: 'left', padding: '12px 16px', color: '#3b82f6', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Produtos</th>
                      <th style={{ textAlign: 'left', padding: '12px 16px', color: '#3b82f6', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total €</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkPreview.groups.map((g, i) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--ui-border)' }}>
                        <td style={{ padding: '10px 16px', color: 'var(--ui-text)' }}>{g.locationName}</td>
                        <td style={{ padding: '10px 16px', color: 'var(--ui-text-dim)' }}>{g.items.length}</td>
                        <td style={{ padding: '10px 16px', color: 'var(--ui-text-dim)' }}>{g.items.map(it => `${it.productName} x${it.qty}`).join(', ')}</td>
                        <td style={{ padding: '10px 16px', color: '#22c55e', fontWeight: 600 }}>{g.items.reduce((s, it) => s + (+it.qty || 0) * (+it.preco || 0), 0).toFixed(2)}€</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Invalid lines */}
          {bulkPreview && bulkPreview.invalid.length > 0 && (
            <div style={{ marginTop: '16px' }}>
              <h5 style={{ 
                margin: '0 0 10px', 
                color: '#ef4444',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                ❌ Linhas inválidas
                <span style={{
                  padding: '4px 10px',
                  background: 'rgba(239,68,68,0.15)',
                  borderRadius: '12px',
                  fontSize: '12px'
                }}>
                  {bulkPreview.invalid.length}
                </span>
              </h5>
              <ul style={{ 
                margin: 0, 
                paddingLeft: '20px', 
                fontSize: '12px', 
                color: '#ef4444',
                background: 'rgba(239,68,68,0.08)',
                borderRadius: '8px',
                padding: '12px 12px 12px 32px'
              }}>
                {bulkPreview.invalid.slice(0, 10).map((inv, i) => (
                  <li key={i} style={{ marginBottom: '4px' }}>Linha {inv.line}: {inv.reason}</li>
                ))}
                {bulkPreview.invalid.length > 10 && <li style={{ fontStyle: 'italic' }}>... e mais {bulkPreview.invalid.length - 10}</li>}
              </ul>
            </div>
          )}

          {/* Create bulk button */}
          <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: 12, alignItems: 'center' }}>
            {createErr && (
              <div style={{ 
                padding: '8px 14px', 
                background: 'rgba(239,68,68,0.15)', 
                borderRadius: '8px',
                color: '#ef4444',
                fontSize: '13px'
              }}>
                {createErr}
              </div>
            )}
            <button
              onClick={() => createBulkRequest.mutate()}
              disabled={createBulkRequest.isPending || !bulkPreview?.groups?.length || bulkPreview?.invalid?.length > 0}
              style={{
                padding: '12px 24px',
                background: (createBulkRequest.isPending || !bulkPreview?.groups?.length || bulkPreview?.invalid?.length > 0) 
                  ? 'var(--ui-bg)' 
                  : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: (createBulkRequest.isPending || !bulkPreview?.groups?.length || bulkPreview?.invalid?.length > 0) 
                  ? 'not-allowed' 
                  : 'pointer',
                fontWeight: 600,
                fontSize: '14px',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              {createBulkRequest.isPending ? (
                <>
                  <span style={{
                    width: '14px',
                    height: '14px',
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: 'white',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                  }}></span>
                  A criar encomendas...
                </>
              ) : (
                `Criar ${bulkPreview?.groups?.length || 0} encomenda(s)`
              )}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
