/**
 * ClientHub.jsx
 * Gestão de clientes, contratos, locais e produtos.
 */

import { useState, useMemo, useEffect } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  doc, updateDoc, addDoc, deleteDoc, collection, getDocs, query, where, writeBatch
} from 'firebase/firestore'
import { db } from '../../../lib/firebase'
import { useContracts, useLocations } from '../../../hooks/useCommon'
import { usePermissions } from '../../../hooks/usePermissions'
import {
  isCancelledStatus, isDeliveredStatus, getOrderClientId, getOrderDate,
  orderTotalValue, parseEmailList, formatEmailList, normalizeContacts,
  contactsToText, contactsFromText, chunk
} from '../../../lib/orderHelpers'
import { Modal, StatCard, Badge, EmptyState } from '../../../components/ui/index.jsx'
import * as XLSX from 'xlsx'

// Helper para iniciais
function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

// ==================== COMPONENT ====================

export default function ClientHub({ clients, orders }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { can } = usePermissions()
  
  // Permissões
  const canCreate = can('clients.create')
  const canEdit = can('clients.edit')
  const canDelete = can('clients.delete')
  const canManageContracts = can('contracts.edit')

  // Search & filters
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all') // all, with-contracts, recent
  const [sortBy, setSortBy] = useState('name') // name, orders, revenue
  
  // Get contracts for stats
  const allContractsQ = useQuery({
    queryKey: ['all-contracts'],
    queryFn: async () => {
      const snap = await getDocs(collection(db, 'contracts'))
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    }
  })
  const allContracts = allContractsQ.data || []

  // Calculate client stats for filtering/sorting
  const clientsWithStats = useMemo(() => {
    return clients.map(c => {
      const clientOrders = (orders || []).filter(o => String(getOrderClientId(o) || '') === String(c.id))
      const validOrders = clientOrders.filter(o => !isCancelledStatus(o.status))
      const delivered = validOrders.filter(o => isDeliveredStatus(o.status))
      const revenue = delivered.reduce((s, o) => s + orderTotalValue(o), 0)
      const contractCount = allContracts.filter(ct => ct.clientId === c.id).length
      
      // Check if has recent orders (last 30 days)
      const now = new Date()
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      const recentOrders = validOrders.filter(o => {
        const d = getOrderDate(o)
        return d && d >= thirtyDaysAgo
      })
      
      return {
        ...c,
        orderCount: validOrders.length,
        revenue,
        contractCount,
        hasRecentOrders: recentOrders.length > 0,
        recentOrderCount: recentOrders.length
      }
    })
  }, [clients, orders, allContracts])

  const filtered = useMemo(() => {
    let list = clientsWithStats
    
    // Text search
    const raw = (search || '').trim().toLowerCase()
    if (raw) {
      const digits = raw.replace(/\D/g, '')
      list = list.filter(c => {
        const hay = `${c.name || ''} ${c.username || ''} ${c.email || ''}`.toLowerCase()
        if (hay.includes(raw)) return true
        if (digits) {
          const nifDigits = String(c.nif || '').replace(/\D/g, '')
          if (nifDigits.includes(digits)) return true
        }
        return false
      })
    }
    
    // Filter
    if (filter === 'with-contracts') {
      list = list.filter(c => c.contractCount > 0)
    } else if (filter === 'recent') {
      list = list.filter(c => c.hasRecentOrders)
    }
    
    // Sort
    if (sortBy === 'name') {
      list = [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    } else if (sortBy === 'orders') {
      list = [...list].sort((a, b) => b.orderCount - a.orderCount)
    } else if (sortBy === 'revenue') {
      list = [...list].sort((a, b) => b.revenue - a.revenue)
    }
    
    return list
  }, [clientsWithStats, search, filter, sortBy])

  // Selected client
  const [selClientId, setSelClientId] = useState('')
  const selClient = useMemo(() => clients.find(c => c.id === selClientId), [clients, selClientId])

  // Client stats
  const clientOrders = useMemo(() => {
    if (!selClientId) return []
    return (orders || []).filter(o => String(getOrderClientId(o) || '') === String(selClientId))
  }, [orders, selClientId])

  const clientStats = useMemo(() => {
    const base = clientOrders.filter(o => !isCancelledStatus(o.status))
    const delivered = base.filter(o => isDeliveredStatus(o.status))
    const pedidos = base.length
    const satisfeitas = delivered.length
    const faturacao = delivered.reduce((s, o) => s + orderTotalValue(o), 0)

    const weeksWindow = 8
    const now = new Date()
    const from = new Date(now.getTime() - weeksWindow * 7 * 24 * 60 * 60 * 1000)
    const recent = base.filter(o => {
      const d = getOrderDate(o)
      return d && d >= from
    })
    const mediaSemana = recent.length / weeksWindow

    return { pedidos, satisfeitas, faturacao, mediaSemana }
  }, [clientOrders])

  // Modals
  const [openNewClient, setOpenNewClient] = useState(false)
  const [newClient, setNewClient] = useState({ name: '', username: '', email: '', nif: '', phone: '', morada: '', emailsExtra: '', contactsText: '' })
  const [openEditClient, setOpenEditClient] = useState(false)
  const [editClient, setEditClient] = useState(null)

  // Contracts & Locations
  const contractsForClient = useContracts(selClientId).data || []
  const [activeContractId, setActiveContractId] = useState('')
  useEffect(() => { setActiveContractId('') }, [selClientId])
  const locationsForActive = useLocations(activeContractId).data || []

  // New contract/location
  const [newContract, setNewContract] = useState({ nome: '', inicio: '', fim: '', compromisso: '', cabimento: '', regime: '' })
  const [newLocation, setNewLocation] = useState({ nome: '', morada: '', deliveryWindowStart: '', deliveryWindowEnd: '' })
  const [editContract, setEditContract] = useState(null)
  const [editLocation, setEditLocation] = useState(null)

  // Products import
  const [importSummary, setImportSummary] = useState(null)
  const [replaceList, setReplaceList] = useState(true)
  const [contractProducts, setContractProducts] = useState([])

  // ==================== MUTATIONS ====================

  const addClientMut = useMutation({
    mutationFn: async () => {
      const emailsExtra = parseEmailList(newClient.emailsExtra)
      const contacts = contactsFromText(newClient.contactsText)
      return addDoc(collection(db, 'users'), {
        name: newClient.name || 'Cliente',
        username: newClient.username || newClient.email || 'cliente',
        email: newClient.email || '',
        nif: newClient.nif || '',
        phone: newClient.phone || '',
        morada: newClient.morada || '',
        emailsExtra,
        contacts,
        role: 'cliente',
        active: true
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] })
      setNewClient({ name: '', username: '', email: '', nif: '', phone: '', morada: '', emailsExtra: '', contactsText: '' })
      setOpenNewClient(false)
    }
  })

  const saveClientMut = useMutation({
    mutationFn: async ({ id, data }) => updateDoc(doc(db, 'users', id), data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] })
      setOpenEditClient(false)
      setEditClient(null)
    }
  })

  const deleteClientMut = useMutation({
    mutationFn: async (id) => updateDoc(doc(db, 'users', id), { active: false, deletedAt: new Date().toISOString() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] })
  })

  const addContractMut = useMutation({
    mutationFn: async () => {
      if (!selClientId) throw new Error('Seleciona um cliente.')
      if (!newContract.nome) throw new Error('Indica o nome do contrato.')
      await addDoc(collection(db, 'contracts'), { clientId: selClientId, ...newContract })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contracts'] })
      setNewContract({ nome: '', inicio: '', fim: '', compromisso: '', cabimento: '', regime: '' })
    }
  })

  const saveContractMut = useMutation({
    mutationFn: async ({ id, data }) => updateDoc(doc(db, 'contracts', id), data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contracts'] })
      setEditContract(null)
    }
  })

  const deleteContractMut = useMutation({
    mutationFn: async (id) => {
      // Delete associated locations
      const locSnap = await getDocs(query(collection(db, 'locations'), where('contractId', '==', id)))
      for (const pack of chunk(locSnap.docs, 400)) {
        const b = writeBatch(db)
        pack.forEach(d => b.delete(d.ref))
        await b.commit()
      }
      // Delete associated products
      const prodSnap = await getDocs(query(collection(db, 'contract_products'), where('contractId', '==', id)))
      for (const pack of chunk(prodSnap.docs, 400)) {
        const b = writeBatch(db)
        pack.forEach(d => b.delete(d.ref))
        await b.commit()
      }
      await deleteDoc(doc(db, 'contracts', id))
    },
    onSuccess: (_, id) => {
      if (activeContractId === id) {
        setActiveContractId('')
        setImportSummary(null)
        setContractProducts([])
      }
      qc.invalidateQueries({ queryKey: ['contracts'] })
      qc.invalidateQueries({ queryKey: ['locations'] })
    }
  })

  const addLocationMut = useMutation({
    mutationFn: async () => {
      if (!activeContractId) throw new Error('Seleciona um contrato.')
      if (!newLocation.nome) throw new Error('Nome do local em falta.')
      await addDoc(collection(db, 'locations'), { contractId: activeContractId, ...newLocation })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['locations'] })
      setNewLocation({ nome: '', morada: '', deliveryWindowStart: '', deliveryWindowEnd: '' })
    }
  })

  const saveLocationMut = useMutation({
    mutationFn: async ({ id, data }) => updateDoc(doc(db, 'locations', id), data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['locations'] })
      setEditLocation(null)
    }
  })

  const deleteLocationMut = useMutation({
    mutationFn: async (id) => deleteDoc(doc(db, 'locations', id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['locations'] })
  })

  // ==================== PRODUCTS IMPORT ====================

  const loadContractProductsList = async (cid) => {
    if (!cid) { setContractProducts([]); return [] }
    const qRef = query(collection(db, 'contract_products'), where('contractId', '==', cid))
    const snap = await getDocs(qRef)
    const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    setContractProducts(rows)
    return rows
  }

  const deleteAllContractProducts = async (cid) => {
    const rows = await loadContractProductsList(cid)
    if (!rows.length) return
    for (const pack of chunk(rows, 400)) {
      const b = writeBatch(db)
      pack.forEach(r => b.delete(doc(db, 'contract_products', r.id)))
      await b.commit()
    }
  }

  const insertContractProductsBatch = async (cid, items) => {
    let ok = 0
    for (const pack of chunk(items, 400)) {
      const b = writeBatch(db)
      pack.forEach(r => {
        const ref = doc(collection(db, 'contract_products'))
        b.set(ref, { contractId: cid, nome: r.nome, unidade: r.unidade, preco: r.preco })
        ok++
      })
      await b.commit()
    }
    return ok
  }

  async function handleImportFile(file) {
    if (!file || !activeContractId) return
    const data = await file.arrayBuffer()
    const wb = XLSX.read(data, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
    const parsed = []; let fail = 0
    for (const r of rows) {
      const nome = String(r.nome || r.NOME || r.Name || '').trim()
      const unidade = String(r.unidade || r.UNIDADE || r.Unit || '').trim()
      const precoRaw = String(r.preco || r.PRECO || r.Price || r['preço'] || '').trim()
      const preco = parseFloat(precoRaw.replace(',', '.'))
      if (!nome || !unidade || !isFinite(preco)) { fail++; continue }
      parsed.push({ nome, unidade, preco })
    }
    if (replaceList) await deleteAllContractProducts(activeContractId)
    const ok = await insertContractProductsBatch(activeContractId, parsed)
    setImportSummary({ ok, fail, total: rows.length })
    await loadContractProductsList(activeContractId)
  }

  useEffect(() => {
    if (activeContractId) loadContractProductsList(activeContractId)
    else setImportSummary(null)
  }, [activeContractId])

  // ==================== HANDLERS ====================

  const startEditClient = (c) => {
    if (!c) return
    setEditClient({
      id: c.id,
      name: c.name || '',
      username: c.username || '',
      email: c.email || '',
      nif: c.nif || '',
      phone: c.phone || '',
      morada: c.morada || '',
      emailsExtra: formatEmailList(c.emailsExtra || c.emails || []),
      contactsText: contactsToText(c.contacts || c.departmentContacts || c.responsaveis || []),
    })
    setOpenEditClient(true)
  }

  // ==================== RENDER ====================

  return (
    <div className="grid">
      {/* Lista de clientes */}
      <div className="span-4">
        <div className="card" style={{ height: 'calc(100vh - 200px)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h4 style={{ margin: 0, color: 'var(--ui-text)' }}>Lista de Clientes</h4>
            <button 
              className="btn" 
              onClick={() => setOpenNewClient(true)}
              disabled={!canCreate}
              title={!canCreate ? 'Sem permissão para criar clientes' : undefined}
              style={{ padding: '6px 12px', fontSize: '13px' }}
            >
              + Novo
            </button>
          </div>
          
          {/* Search */}
          <div style={{ position: 'relative', marginBottom: '10px' }}>
            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--ui-text-dim)' }}>🔍</span>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Pesquisar cliente, NIF..."
              style={{ paddingLeft: '36px' }}
            />
          </div>
          
          {/* Filters & Sort */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <select 
              value={filter} 
              onChange={e => setFilter(e.target.value)}
              style={{ flex: 1, minWidth: '100px', fontSize: '12px', padding: '6px 8px' }}
            >
              <option value="all">Todos</option>
              <option value="with-contracts">Com contratos</option>
              <option value="recent">Ativos (30 dias)</option>
            </select>
            <select 
              value={sortBy} 
              onChange={e => setSortBy(e.target.value)}
              style={{ flex: 1, minWidth: '100px', fontSize: '12px', padding: '6px 8px' }}
            >
              <option value="name">A-Z Nome</option>
              <option value="orders">Mais pedidos</option>
              <option value="revenue">Maior faturação</option>
            </select>
          </div>
          
          {/* Client list */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {filtered.map(c => (
              <div
                key={c.id}
                onClick={() => setSelClientId(c.id)}
                style={{
                  padding: '12px',
                  marginBottom: '8px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  background: c.id === selClientId 
                    ? 'linear-gradient(135deg, rgba(249,115,22,0.15) 0%, rgba(249,115,22,0.05) 100%)' 
                    : 'var(--ui-bg)',
                  border: c.id === selClientId 
                    ? '1px solid rgba(249,115,22,0.3)' 
                    : '1px solid var(--ui-border)',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px'
                }}
                onMouseEnter={e => {
                  if (c.id !== selClientId) e.currentTarget.style.borderColor = 'var(--ui-border-hover)'
                }}
                onMouseLeave={e => {
                  if (c.id !== selClientId) e.currentTarget.style.borderColor = 'var(--ui-border)'
                }}
              >
                {/* Avatar */}
                <div style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  background: c.id === selClientId 
                    ? 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)' 
                    : 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px',
                  fontWeight: 700,
                  color: c.id === selClientId ? 'white' : 'var(--ui-text-dim)',
                  flexShrink: 0
                }}>
                  {getInitials(c.name || c.username)}
                </div>
                
                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ 
                    fontWeight: 600, 
                    color: 'var(--ui-text)',
                    marginBottom: '2px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {c.name || c.username}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--ui-text-dim)', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {c.contractCount > 0 && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                        📋 {c.contractCount}
                      </span>
                    )}
                    {c.orderCount > 0 && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                        📦 {c.orderCount}
                      </span>
                    )}
                    {c.hasRecentOrders && (
                      <span style={{ 
                        background: 'rgba(16,185,129,0.15)', 
                        color: '#10b981', 
                        padding: '1px 6px', 
                        borderRadius: '8px',
                        fontSize: '10px'
                      }}>
                        Ativo
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--ui-text-dim)' }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔍</div>
                <p style={{ margin: 0 }}>Nenhum cliente encontrado</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detalhe do cliente */}
      <div className="span-8">
        {!selClient ? (
          <div className="card" style={{ 
            height: 'calc(100vh - 200px)', 
            display: 'flex', 
            flexDirection: 'column',
            alignItems: 'center', 
            justifyContent: 'center',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }}>👈</div>
            <h3 style={{ margin: '0 0 8px', color: 'var(--ui-text)' }}>Selecione um cliente</h3>
            <p style={{ margin: 0, color: 'var(--ui-text-dim)' }}>Escolha um cliente da lista para ver os detalhes</p>
          </div>
        ) : (
          <div style={{ height: 'calc(100vh - 200px)', overflowY: 'auto' }}>
            {/* Header do cliente */}
            <div className="card" style={{ marginBottom: '16px', position: 'relative', overflow: 'hidden' }}>
              {/* Decorative background */}
              <div style={{
                position: 'absolute',
                top: '-50px',
                right: '-50px',
                width: '150px',
                height: '150px',
                background: 'radial-gradient(circle, rgba(249,115,22,0.1) 0%, transparent 70%)',
                borderRadius: '50%',
                pointerEvents: 'none'
              }} />
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                  {/* Large avatar */}
                  <div style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '14px',
                    background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '22px',
                    fontWeight: 700,
                    color: 'white',
                    flexShrink: 0,
                    boxShadow: '0 4px 12px rgba(249,115,22,0.3)'
                  }}>
                    {getInitials(selClient.name || selClient.username)}
                  </div>
                  
                  <div>
                    <h3 style={{ margin: '0 0 4px', color: 'var(--ui-text)', fontSize: '20px' }}>{selClient.name}</h3>
                    <div style={{ fontSize: '13px', color: 'var(--ui-text-dim)', lineHeight: 1.6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>📧</span> {selClient.email || '—'}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>🆔</span> NIF: {selClient.nif || '—'}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>📞</span> {selClient.phone || '—'}
                      </div>
                    </div>
                  </div>
                </div>
                
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    className="btn"
                    onClick={() => navigate('/nova-encomenda?clientId=' + selClientId)}
                    style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', border: 'none' }}
                  >
                    + Nova Encomenda
                  </button>
                  <button 
                    className="btn-secondary" 
                    onClick={() => startEditClient(selClient)}
                    disabled={!canEdit}
                    title={!canEdit ? 'Sem permissão para editar' : undefined}
                  >
                    ✏️ Editar
                  </button>
                  <button
                    className="btn-ghost"
                    style={{ color: '#ef4444' }}
                    onClick={() => {
                      if (confirm('Desativar este cliente?')) deleteClientMut.mutate(selClientId)
                    }}
                    disabled={!canDelete}
                    title={!canDelete ? 'Sem permissão para desativar' : undefined}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>

            {/* KPIs melhorados */}
            <div className="grid" style={{ marginBottom: '16px' }}>
              <div className="span-3">
                <div className="card" style={{ position: 'relative', overflow: 'hidden', padding: '16px' }}>
                  <div style={{
                    position: 'absolute', top: '-20px', right: '-20px',
                    width: '80px', height: '80px',
                    background: 'radial-gradient(circle, rgba(59,130,246,0.15) 0%, transparent 70%)',
                    borderRadius: '50%'
                  }} />
                  <div style={{ fontSize: '11px', color: 'var(--ui-text-dim)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Total Pedidos
                  </div>
                  <div style={{ fontSize: '28px', fontWeight: 700, color: '#3b82f6' }}>
                    {clientStats.pedidos}
                  </div>
                  <div style={{ fontSize: '20px', position: 'absolute', bottom: '12px', right: '16px', opacity: 0.3 }}>📦</div>
                </div>
              </div>
              <div className="span-3">
                <div className="card" style={{ position: 'relative', overflow: 'hidden', padding: '16px' }}>
                  <div style={{
                    position: 'absolute', top: '-20px', right: '-20px',
                    width: '80px', height: '80px',
                    background: 'radial-gradient(circle, rgba(16,185,129,0.15) 0%, transparent 70%)',
                    borderRadius: '50%'
                  }} />
                  <div style={{ fontSize: '11px', color: 'var(--ui-text-dim)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Entregues
                  </div>
                  <div style={{ fontSize: '28px', fontWeight: 700, color: '#10b981' }}>
                    {clientStats.satisfeitas}
                  </div>
                  <div style={{ fontSize: '20px', position: 'absolute', bottom: '12px', right: '16px', opacity: 0.3 }}>✅</div>
                </div>
              </div>
              <div className="span-3">
                <div className="card" style={{ position: 'relative', overflow: 'hidden', padding: '16px' }}>
                  <div style={{
                    position: 'absolute', top: '-20px', right: '-20px',
                    width: '80px', height: '80px',
                    background: 'radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%)',
                    borderRadius: '50%'
                  }} />
                  <div style={{ fontSize: '11px', color: 'var(--ui-text-dim)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Faturação
                  </div>
                  <div style={{ fontSize: '28px', fontWeight: 700, color: '#8b5cf6' }}>
                    {clientStats.faturacao >= 1000 ? `${(clientStats.faturacao / 1000).toFixed(1)}k` : clientStats.faturacao.toFixed(0)}€
                  </div>
                  <div style={{ fontSize: '20px', position: 'absolute', bottom: '12px', right: '16px', opacity: 0.3 }}>💰</div>
                </div>
              </div>
              <div className="span-3">
                <div className="card" style={{ position: 'relative', overflow: 'hidden', padding: '16px' }}>
                  <div style={{
                    position: 'absolute', top: '-20px', right: '-20px',
                    width: '80px', height: '80px',
                    background: 'radial-gradient(circle, rgba(245,158,11,0.15) 0%, transparent 70%)',
                    borderRadius: '50%'
                  }} />
                  <div style={{ fontSize: '11px', color: 'var(--ui-text-dim)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Média/Semana
                  </div>
                  <div style={{ fontSize: '28px', fontWeight: 700, color: '#f59e0b' }}>
                    {clientStats.mediaSemana.toFixed(1)}
                  </div>
                  <div style={{ fontSize: '20px', position: 'absolute', bottom: '12px', right: '16px', opacity: 0.3 }}>📈</div>
                </div>
              </div>
            </div>

            {/* Últimas encomendas */}
            <div className="card" style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h4 style={{ margin: 0, color: 'var(--ui-text)' }}>📦 Últimas Encomendas</h4>
                <button 
                  className="btn-ghost" 
                  onClick={() => navigate('/pipeline?client=' + selClientId)}
                  style={{ fontSize: '12px' }}
                >
                  Ver todas →
                </button>
              </div>
              {clientOrders.length === 0 ? (
                <p style={{ color: 'var(--ui-text-dim)', textAlign: 'center', padding: '16px 0' }}>Sem encomendas registadas</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {clientOrders.slice(0, 5).map(o => (
                    <div 
                      key={o.id}
                      style={{
                        padding: '10px 12px',
                        background: 'var(--ui-bg)',
                        borderRadius: '8px',
                        border: '1px solid var(--ui-border)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <div>
                        <span style={{ fontFamily: 'monospace', color: 'var(--ui-text)', fontWeight: 500 }}>
                          #{o.orderNo || o.id?.slice(-6)}
                        </span>
                        <span style={{ fontSize: '12px', color: 'var(--ui-text-dim)', marginLeft: '12px' }}>
                          {o.createdAt?.slice(0, 10) || '—'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '13px', color: 'var(--ui-text-dim)' }}>
                          {orderTotalValue(o).toFixed(2)}€
                        </span>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 500,
                          background: isDeliveredStatus(o.status) ? 'rgba(16,185,129,0.15)' : 
                                      isCancelledStatus(o.status) ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)',
                          color: isDeliveredStatus(o.status) ? '#10b981' : 
                                 isCancelledStatus(o.status) ? '#ef4444' : '#3b82f6'
                        }}>
                          {o.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Contratos */}
            <div className="card" style={{ marginBottom: '16px' }}>
              <h4 style={{ margin: '0 0 12px' }}>📋 Contratos</h4>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                {contractsForClient.map(c => (
                  <button
                    key={c.id}
                    className={c.id === activeContractId ? 'btn' : 'btn-secondary'}
                    onClick={() => setActiveContractId(c.id)}
                  >
                    {c.nome}
                  </button>
                ))}
                {contractsForClient.length === 0 && (
                  <span className="muted">Sem contratos.</span>
                )}
              </div>
              <div className="grid" style={{ alignItems: 'flex-end' }}>
                <div className="span-6">
                  <input
                    placeholder="Nome do novo contrato"
                    value={newContract.nome}
                    onChange={e => setNewContract({ ...newContract, nome: e.target.value })}
                  />
                </div>
                <div className="span-3">
                  <input
                    type="date"
                    placeholder="Início"
                    value={newContract.inicio}
                    onChange={e => setNewContract({ ...newContract, inicio: e.target.value })}
                  />
                </div>
                <div className="span-3">
                  <button 
                    className="btn" 
                    onClick={() => addContractMut.mutate()}
                    disabled={!canManageContracts}
                    title={!canManageContracts ? 'Sem permissão para criar contratos' : undefined}
                  >
                    + Contrato
                  </button>
                </div>
              </div>
            </div>

            {/* Locais do contrato ativo */}
            {activeContractId && (
              <div className="card" style={{ marginBottom: '16px' }}>
                <h4 style={{ margin: '0 0 12px' }}>📍 Locais de Entrega</h4>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>Morada</th>
                      <th>Janela</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {locationsForActive.map(l => (
                      <tr key={l.id}>
                        <td>{l.nome}</td>
                        <td>{l.morada || '—'}</td>
                        <td>{l.deliveryWindowStart && l.deliveryWindowEnd ? `${l.deliveryWindowStart}–${l.deliveryWindowEnd}` : '—'}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button 
                            className="btn-ghost" 
                            onClick={() => setEditLocation(l)}
                            disabled={!canManageContracts}
                            title={!canManageContracts ? 'Sem permissão' : undefined}
                          >
                            ✏️
                          </button>
                          <button 
                            className="btn-ghost" 
                            onClick={() => {
                              if (confirm('Eliminar este local?')) deleteLocationMut.mutate(l.id)
                            }}
                            disabled={!canManageContracts}
                            title={!canManageContracts ? 'Sem permissão' : undefined}
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))}
                    {locationsForActive.length === 0 && (
                      <tr><td colSpan="4" className="muted">Sem locais.</td></tr>
                    )}
                  </tbody>
                </table>
                <div className="grid" style={{ marginTop: '12px', alignItems: 'flex-end' }}>
                  <div className="span-4">
                    <input
                      placeholder="Nome do local"
                      value={newLocation.nome}
                      onChange={e => setNewLocation({ ...newLocation, nome: e.target.value })}
                    />
                  </div>
                  <div className="span-5">
                    <input
                      placeholder="Morada"
                      value={newLocation.morada}
                      onChange={e => setNewLocation({ ...newLocation, morada: e.target.value })}
                    />
                  </div>
                  <div className="span-3">
                    <button className="btn" onClick={() => addLocationMut.mutate()}>+ Local</button>
                  </div>
                </div>
              </div>
            )}

            {/* Produtos do contrato */}
            {activeContractId && (
              <div className="card">
                <h4 style={{ margin: '0 0 12px' }}>🏷️ Produtos do Contrato</h4>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                    <input
                      type="checkbox"
                      checked={replaceList}
                      onChange={e => setReplaceList(e.target.checked)}
                    />
                    Substituir lista existente
                  </label>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={e => handleImportFile(e.target.files[0])}
                  />
                </div>
                {importSummary && (
                  <div style={{ marginBottom: '12px', padding: '8px', background: '#f0fdf4', borderRadius: '6px' }}>
                    <Badge color="green">✓ Importados: {importSummary.ok}</Badge>
                    {importSummary.fail > 0 && <Badge color="red" style={{ marginLeft: '8px' }}>Falhas: {importSummary.fail}</Badge>}
                  </div>
                )}
                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Produto</th>
                        <th>Unidade</th>
                        <th style={{ textAlign: 'right' }}>Preço</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contractProducts.slice(0, 50).map(p => (
                        <tr key={p.id}>
                          <td>{p.nome}</td>
                          <td>{p.unidade}</td>
                          <td style={{ textAlign: 'right' }}>{(+p.preco || 0).toFixed(2)}€</td>
                        </tr>
                      ))}
                      {contractProducts.length === 0 && (
                        <tr><td colSpan="3" className="muted">Sem produtos.</td></tr>
                      )}
                    </tbody>
                  </table>
                  {contractProducts.length > 50 && (
                    <p className="muted" style={{ textAlign: 'center', margin: '8px 0 0' }}>
                      +{contractProducts.length - 50} mais produtos...
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal novo cliente */}
      <Modal open={openNewClient} onClose={() => setOpenNewClient(false)} title="Novo Cliente" maxWidth={600}>
        <div style={{ display: 'grid', gap: '12px', padding: '16px' }}>
          <input placeholder="Nome *" value={newClient.name} onChange={e => setNewClient({ ...newClient, name: e.target.value })} />
          <input placeholder="Username" value={newClient.username} onChange={e => setNewClient({ ...newClient, username: e.target.value })} />
          <input placeholder="Email" value={newClient.email} onChange={e => setNewClient({ ...newClient, email: e.target.value })} />
          <input placeholder="NIF" value={newClient.nif} onChange={e => setNewClient({ ...newClient, nif: e.target.value })} />
          <input placeholder="Telefone" value={newClient.phone} onChange={e => setNewClient({ ...newClient, phone: e.target.value })} />
          <input placeholder="Morada" value={newClient.morada} onChange={e => setNewClient({ ...newClient, morada: e.target.value })} />
          <button className="btn" onClick={() => addClientMut.mutate()}>Criar Cliente</button>
        </div>
      </Modal>

      {/* Modal editar cliente */}
      <Modal open={openEditClient} onClose={() => { setOpenEditClient(false); setEditClient(null) }} title="Editar Cliente" maxWidth={600}>
        {editClient && (
          <div style={{ display: 'grid', gap: '12px', padding: '16px' }}>
            <input placeholder="Nome *" value={editClient.name} onChange={e => setEditClient({ ...editClient, name: e.target.value })} />
            <input placeholder="Username" value={editClient.username} onChange={e => setEditClient({ ...editClient, username: e.target.value })} />
            <input placeholder="Email" value={editClient.email} onChange={e => setEditClient({ ...editClient, email: e.target.value })} />
            <input placeholder="NIF" value={editClient.nif} onChange={e => setEditClient({ ...editClient, nif: e.target.value })} />
            <input placeholder="Telefone" value={editClient.phone} onChange={e => setEditClient({ ...editClient, phone: e.target.value })} />
            <input placeholder="Morada" value={editClient.morada} onChange={e => setEditClient({ ...editClient, morada: e.target.value })} />
            <button className="btn" onClick={() => {
              const emailsExtra = parseEmailList(editClient.emailsExtra)
              const contacts = contactsFromText(editClient.contactsText)
              saveClientMut.mutate({
                id: editClient.id,
                data: {
                  name: editClient.name,
                  username: editClient.username,
                  email: editClient.email,
                  nif: editClient.nif,
                  phone: editClient.phone,
                  morada: editClient.morada,
                  emailsExtra,
                  contacts
                }
              })
            }}>Guardar</button>
          </div>
        )}
      </Modal>

      {/* Modal editar local */}
      <Modal open={!!editLocation} onClose={() => setEditLocation(null)} title="Editar Local" maxWidth={500}>
        {editLocation && (
          <div style={{ display: 'grid', gap: '12px', padding: '16px' }}>
            <input
              placeholder="Nome"
              value={editLocation.nome || ''}
              onChange={e => setEditLocation({ ...editLocation, nome: e.target.value })}
            />
            <input
              placeholder="Morada"
              value={editLocation.morada || ''}
              onChange={e => setEditLocation({ ...editLocation, morada: e.target.value })}
            />
            <div className="grid">
              <div className="span-6">
                <input
                  type="time"
                  value={editLocation.deliveryWindowStart || ''}
                  onChange={e => setEditLocation({ ...editLocation, deliveryWindowStart: e.target.value })}
                  placeholder="Início"
                />
              </div>
              <div className="span-6">
                <input
                  type="time"
                  value={editLocation.deliveryWindowEnd || ''}
                  onChange={e => setEditLocation({ ...editLocation, deliveryWindowEnd: e.target.value })}
                  placeholder="Fim"
                />
              </div>
            </div>
            <button className="btn" onClick={() => {
              saveLocationMut.mutate({
                id: editLocation.id,
                data: {
                  nome: editLocation.nome,
                  morada: editLocation.morada,
                  deliveryWindowStart: editLocation.deliveryWindowStart,
                  deliveryWindowEnd: editLocation.deliveryWindowEnd
                }
              })
            }}>Guardar</button>
          </div>
        )}
      </Modal>
    </div>
  )
}
