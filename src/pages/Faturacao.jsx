/**
 * Faturacao.jsx (REFATORIZADA)
 * Interface simples e moderna para gestão de faturação
 * 
 * Estrutura:
 * 1. KPI Cards (Resumo rápido)
 * 2. Filtros e Pesquisa
 * 3. Abas (A Faturar | Faturas Emitidas)
 * 4. Tabelas simplificadas com ações
 */

import { useOrders, useUpdateOrder, useAddRectification } from '../hooks/useOrders'
import { useShippingGuides } from '../hooks/useShippingGuides'
import { useClients } from '../hooks/useCommon'
import { usePermissions } from '../hooks/usePermissions'
import { useAuth } from '../contexts/AuthProvider'
import { useWarehouse } from '../contexts/WarehouseContext'
import { PageGuard } from '../components/PageGuard'
import { useMemo, useState, useEffect } from 'react'
import { fmtDate, ORDER_STATUS, CARRIERS } from '../lib/utils'
import { db } from '../lib/firebase'
import { doc, getDoc, updateDoc } from 'firebase/firestore'

// ==================== HELPERS ====================

const money = (n) => Number(n || 0).toFixed(2) + '€'
const orderItems = (o) => {
  if (Array.isArray(o?.items)) return o.items
  if (o?.items && typeof o.items === 'object') return Object.values(o.items)
  return []
}
const orderTotal = (o) => orderItems(o).reduce((s, it) => s + (Number(it.preco) || 0) * (Number(it.preparedQty || it.qty) || 0), 0)

// ==================== COMPONENTE ====================

export default function Faturacao() {
  const { can } = usePermissions()
  const { profile } = useAuth()
  const canCreate = can('invoicing.create')
  const canEdit = can('invoicing.edit')
  const canExport = can('invoicing.export')
  
  // Dados
  const { filterByWarehouse } = useWarehouse() || {}
  const toBillRaw = useOrders('A_FATURAR').data || []
  const allRaw = useOrders().data || []
  const toBill = useMemo(() => filterByWarehouse ? filterByWarehouse(toBillRaw) : toBillRaw, [toBillRaw, filterByWarehouse])
  const all = useMemo(() => filterByWarehouse ? filterByWarehouse(allRaw) : allRaw, [allRaw, filterByWarehouse])
  const withInv = useMemo(() => all.filter((o) => !!o.invoice), [all])
  const shippingGuidesPending = useShippingGuides('PENDENTE').data || []
  const clientsAll = useClients().data || []
  const activeClients = useMemo(
    () => clientsAll.filter((u) => u.role === 'cliente' && String(u.active) !== 'false'),
    [clientsAll]
  )

  const upd = useUpdateOrder()
  const addRect = useAddRectification()

  // State
  const [tab, setTab] = useState('toBill') // 'toBill', 'invoices', 'guides' ou 'discrepancies'
  const [search, setSearch] = useState('')
  const [clientFilter, setClientFilter] = useState('')
  const [expandedRow, setExpandedRow] = useState(null)
  const [timeFilter, setTimeFilter] = useState('1S') // '1D', '1S', '1M', '1A'
  const [rectModal, setRectModal] = useState(null) // { order, type }
  const [rectForm, setRectForm] = useState({ number: '', amount: '', notes: '' })
  const [deliveryDetailOrder, setDeliveryDetailOrder] = useState(null)

  // Mapas de nomes
  const [contractMap, setContractMap] = useState({})
  const [locationMap, setLocationMap] = useState({})
  const [clientMap, setClientMap] = useState({})

  const contractName = (id) => contractMap[id]?.name || id || '—'
  const locationName = (id) => locationMap[id]?.name || id || '—'
  const clientName = (id) => {
    const c = clientMap[id]
    if (!c) return id || '—'
    return c.username || c.nome || c.name || c.empresa || '—'
  }

  // Carregar mapas
  useEffect(() => {
    let cancel = false
    async function load() {
      const allOrders = [...toBill, ...withInv]
      const cIds = [...new Set(allOrders.map((o) => o.contractId).filter(Boolean))]
      const lIds = [...new Set(allOrders.map((o) => o.locationId).filter(Boolean))]
      const uIds = [...new Set([...activeClients.map((u) => u.id), ...allOrders.map((o) => o.clientId).filter(Boolean)])]

      try {
        const cData = await Promise.all(cIds.map((id) => getDoc(doc(db, 'contracts', id))))
        const lData = await Promise.all(lIds.map((id) => getDoc(doc(db, 'locations', id))))
        const uData = await Promise.all(uIds.map((id) => getDoc(doc(db, 'users', id))))

        if (!cancel) {
          const cm = {}
          cData.forEach((d) => { if (d.exists()) cm[d.id] = d.data() })
          const lm = {}
          lData.forEach((d) => { if (d.exists()) lm[d.id] = d.data() })
          const um = {}
          uData.forEach((d) => { if (d.exists()) um[d.id] = d.data() })
          
          setContractMap(cm)
          setLocationMap(lm)
          setClientMap(um)
        }
      } catch (err) {
        console.error('Erro ao carregar mapas:', err)
      }
    }
    load()
    return () => { cancel = true }
  }, [toBill, withInv, activeClients])

  // Carrier inline edit (para encomendas sem transportadora)
  const [carrierEdits, setCarrierEdits] = useState({})
  const handleCarrierInlineChange = (orderId, value) => {
    setCarrierEdits(prev => ({ ...prev, [orderId]: value }))
    // Guardar no Firestore imediatamente
    updateDoc(doc(db, 'orders', orderId), { carrier: value || null }).catch(console.error)
  }

  // Faturar encomenda
  const handleCreateInvoice = (o) => {
    // Validar carrier antes de avançar para A_EXPEDIR
    const effectiveCarrier = carrierEdits[o.id] || o.carrier
    if (!effectiveCarrier) {
      alert('⚠️ Transportadora obrigatória!\n\nEsta encomenda não tem transportadora atribuída. Seleciona uma transportadora antes de faturar.\n\nSem transportadora, a encomenda não aparecerá nas Rotas nem nas Recolhas.')
      return
    }

    const items = orderItems(o)
    const total = orderTotal(o)
    const inv = {
      number: `FAT-${new Date().getFullYear()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
      date: new Date().toISOString().slice(0, 10),
      items,
      total,
      reviewStatus: 'pendente',
      sentAt: null,
    }
    
    upd.mutate({ id: o.id, data: { invoice: inv, status: ORDER_STATUS.A_EXPEDIR, carrier: effectiveCarrier, _profile: profile } })
  }

  // Exportar fatura em XML
  const exportInvoiceXML = (o) => {
    if (!o.invoice) return
    
    const items = orderItems(o)
    const client = clientMap[o.clientId] || {}
    const contract = contractMap[o.contractId] || {}
    const location = locationMap[o.locationId] || {}
    
    const xmlItems = items
      .map((it) => {
        const qty = Number(it.preparedQty || it.qty || 0)
        const price = Number(it.preco || 0)
        const subtotal = qty * price
        return `
    <Item>
      <Product>${escapeXml(it.productName || '')}</Product>
      <Unit>${escapeXml(it.unidade || '')}</Unit>
      <Quantity>${qty}</Quantity>
      <UnitPrice>${price.toFixed(2)}</UnitPrice>
      <Subtotal>${subtotal.toFixed(2)}</Subtotal>
    </Item>`
      })
      .join('')

    const invoiceXml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice>
  <Header>
    <InvoiceNumber>${escapeXml(o.invoice.number)}</InvoiceNumber>
    <InvoiceDate>${o.invoice.date}</InvoiceDate>
    <OrderNumber>${escapeXml(o.id)}</OrderNumber>
    <OrderDate>${o.date}</OrderDate>
  </Header>
  <Customer>
    <Name>${escapeXml(client.username || client.nome || client.name || '')}</Name>
    <Company>${escapeXml(client.empresa || '')}</Company>
    <TaxId>${escapeXml(client.nif || '')}</TaxId>
    <Email>${escapeXml(client.email || '')}</Email>
  </Customer>
  <Contract>
    <Name>${escapeXml(contract.name || contract.nome || '')}</Name>
  </Contract>
  <Location>
    <Name>${escapeXml(location.name || location.nome || '')}</Name>
    <Address>${escapeXml(location.morada || '')}</Address>
  </Location>
  <Items>${xmlItems}
  </Items>
  <Summary>
    <Total>${o.invoice.total.toFixed(2)}</Total>
    <Currency>EUR</Currency>
    <Status>${escapeXml(o.invoice.reviewStatus || 'pendente')}</Status>
  </Summary>
  <ExportDate>${new Date().toISOString()}</ExportDate>
</Invoice>`

    // Criar download
    const blob = new Blob([invoiceXml], { type: 'application/xml' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `fatura-${o.invoice.number.replace(/\s+/g, '-')}.xml`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // Função auxiliar para escapar caracteres especiais em XML
  const escapeXml = (str) => {
    if (!str) return ''
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  }

  // Helper para calcular data limite do filtro de tempo
  const getTimeFilterDate = (filter) => {
    const now = new Date()
    switch (filter) {
      case '1D': return new Date(now.setDate(now.getDate() - 1))
      case '1S': return new Date(now.setDate(now.getDate() - 7))
      case '1M': return new Date(now.setMonth(now.getMonth() - 1))
      case '1A': return new Date(now.setFullYear(now.getFullYear() - 1))
      default: return new Date(0)
    }
  }

  // Filtrar dados
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    let data = tab === 'toBill' ? toBill : tab === 'guides' ? shippingGuidesPending : withInv

    // Filtro de tempo
    const minDate = getTimeFilterDate(timeFilter)
    data = data.filter((item) => {
      const itemDate = new Date(item.createdAt || item.date || item.invoice?.createdAt || 0)
      return itemDate >= minDate
    })

    if (clientFilter && tab !== 'guides') {
      data = data.filter((o) => o.clientId === clientFilter)
    }

    if (clientFilter && tab === 'guides') {
      data = data.filter((g) => g.clientId === clientFilter)
    }

    if (q) {
      data = data.filter((item) => {
        const isGuide = tab === 'guides'
        const hay = isGuide 
          ? `${item.id} ${item.clientName} ${contractName(item.contractId)} ${locationName(item.locationId)}`.toLowerCase()
          : `${item.id} ${item.clientName} ${item.invoice?.number || ''} ${contractName(item.contractId)} ${locationName(item.locationId)}`.toLowerCase()
        return hay.includes(q)
      })
    }

    return data.sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date))
  }, [tab, toBill, withInv, shippingGuidesPending, search, clientFilter, timeFilter, contractMap, locationMap])

  // Encomendas com discrepâncias de entrega  
  const discrepancies = useMemo(() => 
    all.filter(o => o.delivery?.hasDiscrepancy || o.hasDeliveryIssues)
  , [all])
  const pendingDiscrepancies = useMemo(() => 
    discrepancies.filter(o => o.delivery?.discrepancyStatus !== 'resolvida')
  , [discrepancies])

  // KPI
  const kpi = useMemo(() => {
    const total = orderTotal
    return {
      toBill: toBill.length,
      toBillValue: toBill.reduce((s, o) => s + total(o), 0),
      invoicesCount: withInv.length,
      invoicesValue: withInv.reduce((s, o) => s + total(o), 0),
      sentCount: withInv.filter((o) => o.invoice?.sentAt).length,
      guidesCount: shippingGuidesPending.length,
      guidesValue: shippingGuidesPending.reduce((s, g) => s + orderTotal({ items: g.items }), 0),
      discrepanciesCount: pendingDiscrepancies.length,
      discrepanciesTotal: discrepancies.length,
    }
  }, [toBill, withInv, shippingGuidesPending, pendingDiscrepancies, discrepancies])

  return (
    <PageGuard requiredPermission="invoicing.view">
      <div className="page">
        {/* Header moderno */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '24px'
        }}>
          <div>
            <h1 style={{ 
              margin: 0, 
              fontSize: '28px',
              background: 'linear-gradient(135deg, #f9fafb 0%, #9ca3af 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <span style={{ fontSize: '32px' }}>💰</span> Faturação
            </h1>
            <p style={{ margin: '4px 0 0', color: 'var(--ui-text-dim)', fontSize: '14px' }}>
              Gestão de encomendas e faturas
            </p>
          </div>
          {/* Filtros de tempo modernos */}
          <div style={{ 
            display: 'flex', 
            gap: '4px',
            background: 'var(--ui-bg)',
            padding: '4px',
            borderRadius: '10px',
            border: '1px solid var(--ui-border)'
          }}>
            {['1D', '1S', '1M', '1ANO'].map((f) => (
              <button
                key={f}
                onClick={() => setTimeFilter(f === '1ANO' ? '1A' : f)}
                style={{
                  padding: '8px 14px',
                  fontSize: '12px',
                  fontWeight: 600,
                  border: 'none',
                  background: (timeFilter === f || (f === '1ANO' && timeFilter === '1A'))
                    ? 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)'
                    : 'transparent',
                  color: (timeFilter === f || (f === '1ANO' && timeFilter === '1A')) ? 'white' : 'var(--ui-text-dim)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* KPI Cards modernos */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
          <div className="card" style={{ position: 'relative', overflow: 'hidden', padding: '20px' }}>
            <div style={{
              position: 'absolute', top: '-30px', right: '-30px',
              width: '100px', height: '100px',
              background: 'radial-gradient(circle, rgba(249,115,22,0.15) 0%, transparent 70%)',
              borderRadius: '50%'
            }} />
            <div style={{ fontSize: '11px', color: 'var(--ui-text-dim)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              A FATURAR
            </div>
            <div style={{ fontSize: '32px', fontWeight: 700, color: '#f97316' }}>{kpi.toBill}</div>
            <div style={{ fontSize: '13px', color: 'var(--ui-text-dim)', marginTop: '4px' }}>{money(kpi.toBillValue)}</div>
            <div style={{ fontSize: '24px', position: 'absolute', bottom: '16px', right: '20px', opacity: 0.3 }}>📦</div>
          </div>
          
          <div className="card" style={{ position: 'relative', overflow: 'hidden', padding: '20px' }}>
            <div style={{
              position: 'absolute', top: '-30px', right: '-30px',
              width: '100px', height: '100px',
              background: 'radial-gradient(circle, rgba(16,185,129,0.15) 0%, transparent 70%)',
              borderRadius: '50%'
            }} />
            <div style={{ fontSize: '11px', color: 'var(--ui-text-dim)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              FATURAS EMITIDAS
            </div>
            <div style={{ fontSize: '32px', fontWeight: 700, color: '#10b981' }}>{kpi.invoicesCount}</div>
            <div style={{ fontSize: '13px', color: 'var(--ui-text-dim)', marginTop: '4px' }}>{money(kpi.invoicesValue)}</div>
            <div style={{ fontSize: '24px', position: 'absolute', bottom: '16px', right: '20px', opacity: 0.3 }}>📄</div>
          </div>
          
          <div className="card" style={{ position: 'relative', overflow: 'hidden', padding: '20px' }}>
            <div style={{
              position: 'absolute', top: '-30px', right: '-30px',
              width: '100px', height: '100px',
              background: 'radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%)',
              borderRadius: '50%'
            }} />
            <div style={{ fontSize: '11px', color: 'var(--ui-text-dim)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              ENVIADAS
            </div>
            <div style={{ fontSize: '32px', fontWeight: 700, color: '#8b5cf6' }}>{kpi.sentCount}</div>
            <div style={{ fontSize: '13px', color: 'var(--ui-text-dim)', marginTop: '4px' }}>
              {((kpi.sentCount / kpi.invoicesCount) * 100 || 0).toFixed(0)}%
            </div>
            <div style={{ fontSize: '24px', position: 'absolute', bottom: '16px', right: '20px', opacity: 0.3 }}>✉️</div>
          </div>
        </div>

        {/* Filtros modernos */}
        <div className="card" style={{ marginBottom: '16px', padding: '16px' }}>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
              <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--ui-text-dim)' }}>🔍</span>
              <input
                type="text"
                placeholder="Pesquisar..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: '100%', paddingLeft: '36px' }}
              />
            </div>
            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              style={{ minWidth: '200px' }}
            >
              <option value="">Todos os clientes</option>
              {activeClients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.username || c.nome || c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Abas modernos */}
        <div className="card">
          {/* Tab Buttons */}
          <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--ui-border)', padding: '16px' }}>
            <button
              onClick={() => setTab('toBill')}
              style={{
                padding: '10px 20px',
                background: tab === 'toBill' 
                  ? 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)' 
                  : 'transparent',
                color: tab === 'toBill' ? 'white' : 'var(--ui-text-dim)',
                border: tab === 'toBill' ? 'none' : '1px solid var(--ui-border)',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '13px',
                transition: 'all 0.2s ease'
              }}
            >
              📦 A Faturar ({kpi.toBill})
            </button>
            <button
              onClick={() => setTab('guides')}
              style={{
                padding: '10px 20px',
                background: tab === 'guides' 
                  ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' 
                  : 'transparent',
                color: tab === 'guides' ? 'white' : 'var(--ui-text-dim)',
                border: tab === 'guides' ? 'none' : '1px solid var(--ui-border)',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '13px',
                transition: 'all 0.2s ease'
              }}
            >
              📋 Guias de Remessa ({kpi.guidesCount})
            </button>
            <button
              onClick={() => setTab('invoices')}
              style={{
                padding: '10px 20px',
                background: tab === 'invoices' 
                  ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' 
                  : 'transparent',
                color: tab === 'invoices' ? 'white' : 'var(--ui-text-dim)',
                border: tab === 'invoices' ? 'none' : '1px solid var(--ui-border)',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '13px',
                transition: 'all 0.2s ease'
              }}
            >
              📄 Faturas ({kpi.invoicesCount})
            </button>
            <button
              onClick={() => setTab('discrepancies')}
              style={{
                padding: '10px 20px',
                background: tab === 'discrepancies' 
                  ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' 
                  : 'transparent',
                color: tab === 'discrepancies' ? 'white' : 'var(--ui-text-dim)',
                border: tab === 'discrepancies' ? 'none' : '1px solid var(--ui-border)',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '13px',
                transition: 'all 0.2s ease',
                position: 'relative'
              }}
            >
              ↩ Devoluções ({kpi.discrepanciesCount})
              {kpi.discrepanciesCount > 0 && (
                <span style={{
                  position: 'absolute', top: -6, right: -6,
                  width: 18, height: 18, borderRadius: '50%',
                  background: '#ef4444', color: 'white',
                  fontSize: '10px', fontWeight: 700,
                  display: 'grid', placeItems: 'center',
                  animation: 'pulse 2s infinite'
                }}>{kpi.discrepanciesCount}</span>
              )}
            </button>
          </div>

          {/* Tab Content */}
          <div style={{ padding: '16px' }}>
            {/* ====== DEVOLUÇÕES / DISCREPÂNCIAS ====== */}
            {tab === 'discrepancies' ? (
              <div>
                {discrepancies.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                    <div style={{ fontSize: '48px', marginBottom: '12px', opacity: 0.5 }}>✅</div>
                    <p style={{ color: 'var(--ui-text-dim)', margin: 0 }}>Sem devoluções ou discrepâncias</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {discrepancies.map(o => {
                      const del = o.delivery || {}
                      const isResolved = del.discrepancyStatus === 'resolvida'
                      const delItems = del.items || []
                      const totalReturned = delItems.reduce((s, it) => s + (Number(it.returnedQty) || 0), 0)
                      const totalDiff = delItems.reduce((s, it) => s + (Number(it.invoicedQty) - Number(it.deliveredQty)), 0)
                      
                      return (
                        <div key={o.id} className="discrepancy-card" style={{
                          border: `1px solid ${isResolved ? 'var(--ui-border)' : '#ef444440'}`,
                          borderRadius: '10px',
                          padding: '16px',
                          background: isResolved ? 'transparent' : 'rgba(239,68,68,0.03)',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                            <div>
                              <div style={{ fontWeight: 600, color: 'var(--ui-text)', marginBottom: '4px' }}>
                                {o.clientName || '—'}
                                {o.invoice?.number && <span style={{ color: 'var(--ui-text-dim)', fontWeight: 400, marginLeft: 8, fontSize: '12px' }}>{o.invoice.number}</span>}
                              </div>
                              <div style={{ fontSize: '12px', color: 'var(--ui-text-dim)' }}>
                                {fmtDate(o.date)} • {o.id?.slice(-12)} • Motorista: {del.recordedBy || '—'}
                              </div>
                              {del.notes && (
                                <div style={{ fontSize: '12px', color: '#f59e0b', marginTop: '4px' }}>
                                  💬 {del.notes}
                                </div>
                              )}
                            </div>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                              <span style={{
                                padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
                                background: isResolved ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                                color: isResolved ? '#10b981' : '#ef4444'
                              }}>
                                {isResolved ? '✓ Resolvida' : '⚠ Pendente'}
                              </span>
                              {del.outcome && del.outcome !== 'OK' && (
                                <span style={{
                                  padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
                                  background: 'rgba(249,115,22,0.15)', color: '#f97316'
                                }}>
                                  {del.outcome === 'DEVOLVIDO' ? '↩ Devolvido' : del.outcome === 'NAOENTREGUE' ? '✕ Não entregue' : del.outcome}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Resumo rápido */}
                          <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', fontSize: '13px' }}>
                            {totalReturned > 0 && (
                              <span style={{ color: '#ef4444' }}>↩ {totalReturned} devolvido{totalReturned !== 1 ? 's' : ''}</span>
                            )}
                            {totalDiff > 0 && (
                              <span style={{ color: '#f59e0b' }}>⚠ {totalDiff} não entregue{totalDiff !== 1 ? 's' : ''}</span>
                            )}
                          </div>

                          {/* Tabela de comparação */}
                          {deliveryDetailOrder === o.id && (() => {
                            // Usar delivery.items se existir, senão mostrar itens da encomenda como fallback
                            const displayItems = delItems.length > 0 ? delItems : orderItems(o).map(it => ({
                              name: it.productName || it.name || 'Item',
                              unit: it.unidade || '',
                              invoicedQty: Number(it.preparedQty || it.qty || 0),
                              deliveredQty: del.outcome === 'NAOENTREGUE' ? 0 : Number(it.preparedQty || it.qty || 0),
                              returnedQty: 0,
                              returnReason: '',
                            }))
                            const hasDeliveryData = delItems.length > 0

                            return displayItems.length > 0 ? (
                            <div style={{ marginBottom: '12px', background: 'var(--ui-bg)', borderRadius: '8px', border: '1px solid var(--ui-border)', overflow: 'hidden' }}>
                              {!hasDeliveryData && (
                                <div style={{ padding: '8px 12px', fontSize: '11px', color: '#f59e0b', background: 'rgba(245,158,11,0.06)', borderBottom: '1px solid var(--ui-border)' }}>
                                  ⚠️ Registo anterior — sem detalhe de entrega do motorista. A mostrar itens da encomenda.
                                </div>
                              )}
                              <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                                <thead>
                                  <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                                    <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--ui-text-dim)', fontWeight: 500 }}>Produto</th>
                                    <th style={{ textAlign: 'right', padding: '8px 12px', color: 'var(--ui-text-dim)', fontWeight: 500 }}>Faturado</th>
                                    <th style={{ textAlign: 'right', padding: '8px 12px', color: 'var(--ui-text-dim)', fontWeight: 500 }}>Entregue</th>
                                    <th style={{ textAlign: 'right', padding: '8px 12px', color: 'var(--ui-text-dim)', fontWeight: 500 }}>Devolvido</th>
                                    <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--ui-text-dim)', fontWeight: 500 }}>Motivo</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {displayItems.map((it, i) => {
                                    const diff = Number(it.invoicedQty) !== Number(it.deliveredQty) || Number(it.returnedQty) > 0
                                    const reasonLabels = { danificado: 'Danificado', recusado: 'Recusado', erro_quantidade: 'Erro qtd', erro_produto: 'Produto errado', validade: 'Validade', temperatura: 'Temperatura', outro: 'Outro' }
                                    return (
                                      <tr key={i} style={{ borderTop: '1px solid var(--ui-border)', background: diff ? 'rgba(239,68,68,0.04)' : 'transparent' }}>
                                        <td style={{ padding: '8px 12px', color: 'var(--ui-text)' }}>{it.name} {it.unit && <span style={{ color: 'var(--ui-text-dim)', fontSize: '11px' }}>({it.unit})</span>}</td>
                                        <td style={{ textAlign: 'right', padding: '8px 12px', color: 'var(--ui-text)' }}>{it.invoicedQty}</td>
                                        <td style={{ textAlign: 'right', padding: '8px 12px', color: diff ? '#f59e0b' : 'var(--ui-text)', fontWeight: diff ? 600 : 400 }}>{it.deliveredQty}</td>
                                        <td style={{ textAlign: 'right', padding: '8px 12px', color: Number(it.returnedQty) > 0 ? '#ef4444' : 'var(--ui-text-dim)', fontWeight: Number(it.returnedQty) > 0 ? 600 : 400 }}>{it.returnedQty || 0}</td>
                                        <td style={{ padding: '8px 12px', color: 'var(--ui-text-dim)', fontSize: '11px' }}>{reasonLabels[it.returnReason] || it.returnReason || '—'}</td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                              {/* Info de entrega */}
                              {(del.outcome || del.notes) && (
                                <div style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--ui-text-dim)', borderTop: '1px solid var(--ui-border)', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                  {del.outcome && <span>Resultado: <strong style={{ color: del.outcome === 'OK' ? '#10b981' : '#f59e0b' }}>{del.outcome}</strong></span>}
                                  {o.deliveryOutcome && !del.outcome && <span>Resultado: <strong style={{ color: o.deliveryOutcome === 'OK' ? '#10b981' : '#f59e0b' }}>{o.deliveryOutcome}</strong></span>}
                                  {(del.notes || o.deliveryNotes) && <span>💬 {del.notes || o.deliveryNotes}</span>}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div style={{ marginBottom: '12px', padding: '16px', background: 'var(--ui-bg)', borderRadius: '8px', border: '1px solid var(--ui-border)', textAlign: 'center' }}>
                              <span style={{ color: 'var(--ui-text-dim)', fontSize: '13px' }}>
                                Sem itens registados. Resultado: <strong>{o.deliveryOutcome || '—'}</strong>
                                {o.deliveryNotes && <span> — 💬 {o.deliveryNotes}</span>}
                              </span>
                            </div>
                          )
                          })()}

                          {/* Retificações existentes */}
                          {(del.rectifications || []).length > 0 && deliveryDetailOrder === o.id && (
                            <div style={{ marginBottom: '12px' }}>
                              <div style={{ fontSize: '11px', color: 'var(--ui-text-dim)', textTransform: 'uppercase', marginBottom: '6px' }}>Retificações</div>
                              {del.rectifications.map((r, ri) => (
                                <div key={ri} style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '8px 12px', background: 'rgba(16,185,129,0.05)', borderRadius: '6px', marginBottom: '4px', fontSize: '12px' }}>
                                  <span style={{ color: r.type === 'nota_credito' ? '#ef4444' : '#10b981', fontWeight: 600 }}>
                                    {r.type === 'nota_credito' ? '📕 Nota de crédito' : '📗 Fatura complementar'}
                                  </span>
                                  <span style={{ color: 'var(--ui-text)' }}>{r.number}</span>
                                  <span style={{ color: 'var(--ui-text-dim)' }}>{money(r.amount)}</span>
                                  <span style={{ color: 'var(--ui-text-dim)' }}>{fmtDate(r.date)}</span>
                                  {r.notes && <span style={{ color: 'var(--ui-text-dim)' }}>— {r.notes}</span>}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Ações */}
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <button
                              onClick={() => setDeliveryDetailOrder(deliveryDetailOrder === o.id ? null : o.id)}
                              style={{
                                padding: '6px 14px', fontSize: '12px', borderRadius: '6px',
                                border: '1px solid var(--ui-border)', background: 'transparent',
                                color: 'var(--ui-text-dim)', cursor: 'pointer', fontWeight: 500
                              }}
                            >
                              {deliveryDetailOrder === o.id ? '▲ Fechar' : '▼ Ver detalhes'}
                            </button>
                            {!isResolved && canEdit && (
                              <>
                                <button
                                  onClick={() => { setRectModal({ order: o, type: 'nota_credito' }); setRectForm({ number: '', amount: '', notes: '' }) }}
                                  style={{
                                    padding: '6px 14px', fontSize: '12px', borderRadius: '6px',
                                    border: 'none', background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                                    color: 'white', cursor: 'pointer', fontWeight: 600
                                  }}
                                >
                                  📕 Nota de crédito
                                </button>
                                <button
                                  onClick={() => { setRectModal({ order: o, type: 'fatura_complementar' }); setRectForm({ number: '', amount: '', notes: '' }) }}
                                  style={{
                                    padding: '6px 14px', fontSize: '12px', borderRadius: '6px',
                                    border: 'none', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                    color: 'white', cursor: 'pointer', fontWeight: 600
                                  }}
                                >
                                  📗 Fatura complementar
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ) : (
            filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                <div style={{ fontSize: '48px', marginBottom: '12px', opacity: 0.5 }}>
                  {tab === 'toBill' ? '✅' : tab === 'guides' ? '📭' : '📭'}
                </div>
                <p style={{ color: 'var(--ui-text-dim)', margin: 0 }}>
                  {tab === 'toBill' ? 'Sem encomendas por faturar' : tab === 'guides' ? 'Sem guias de remessa' : 'Sem faturas'}
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {filtered.map((item) => {
                  const isGuide = tab === 'guides'
                  const o = item
                  
                  return (
                  <div
                    key={o.id}
                    style={{
                      border: '1px solid var(--ui-border)',
                      borderRadius: '10px',
                      padding: '14px 16px',
                      cursor: 'pointer',
                      background: expandedRow === o.id ? 'var(--ui-bg)' : 'transparent',
                      transition: 'all 0.2s ease'
                    }}
                    onClick={() => setExpandedRow(expandedRow === o.id ? null : o.id)}
                    onMouseEnter={e => { if (expandedRow !== o.id) e.currentTarget.style.borderColor = 'var(--ui-border-hover)' }}
                    onMouseLeave={e => { if (expandedRow !== o.id) e.currentTarget.style.borderColor = 'var(--ui-border)' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {/* Avatar com inicial */}
                        <div style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '10px',
                          background: tab === 'toBill' 
                            ? 'linear-gradient(135deg, rgba(249,115,22,0.15) 0%, rgba(249,115,22,0.05) 100%)'
                            : tab === 'guides'
                            ? 'linear-gradient(135deg, rgba(59,130,246,0.15) 0%, rgba(59,130,246,0.05) 100%)'
                            : 'linear-gradient(135deg, rgba(16,185,129,0.15) 0%, rgba(16,185,129,0.05) 100%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: '14px',
                          color: tab === 'toBill' ? '#f97316' : tab === 'guides' ? '#3b82f6' : '#10b981'
                        }}>
                          {(o.clientName || '?')[0].toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--ui-text)' }}>{o.clientName || '—'}</div>
                          <div style={{ fontSize: '12px', color: 'var(--ui-text-dim)' }}>
                            {fmtDate(o.date)} • {o.id?.slice(-12)} • {money(orderTotal(o))}
                          </div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        {tab === 'toBill' ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {/* Alerta se não tem carrier */}
                            {!(carrierEdits[o.id] || o.carrier) && (
                              <select
                                value={carrierEdits[o.id] || o.carrier || ''}
                                onChange={e => { e.stopPropagation(); handleCarrierInlineChange(o.id, e.target.value) }}
                                onClick={e => e.stopPropagation()}
                                style={{
                                  padding: '6px 8px',
                                  fontSize: '11px',
                                  borderRadius: '6px',
                                  border: '2px solid #f59e0b',
                                  background: 'rgba(245,158,11,0.1)',
                                  color: 'var(--ui-text)',
                                  fontWeight: 500
                                }}
                              >
                                <option value="">⚠️ Transporte?</option>
                                <option value={CARRIERS.INTERNO}>Nossos carros</option>
                                <option value={CARRIERS.SANTOSVALE}>Santos e Vale</option>
                                <option value={CARRIERS.STEFF}>STEFF (frio)</option>
                              </select>
                            )}
                            <button
                              className="btn"
                              onClick={(e) => {
                                if (!canCreate) {
                                  alert('Sem permissão para criar faturas')
                                  return
                                }
                                if (upd.isPending) {
                                  alert('Aguarde, operação em progresso...')
                                  return
                                }
                                e.stopPropagation()
                                handleCreateInvoice(o)
                              }}
                              disabled={!canCreate || upd.isPending}
                              style={{ 
                                padding: '8px 16px', 
                                fontSize: '12px',
                                background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                                border: 'none',
                                fontWeight: 600
                              }}
                            >
                              Faturar
                            </button>
                          </div>
                        ) : tab === 'invoices' ? (
                          <span style={{ 
                            padding: '4px 10px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: 600,
                            background: 'rgba(16,185,129,0.15)',
                            color: '#10b981'
                          }}>
                            {o.invoice?.number || '—'}
                          </span>
                        ) : (
                          <span style={{ 
                            padding: '4px 10px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: 600,
                            background: 'rgba(59,130,246,0.15)',
                            color: '#3b82f6'
                          }}>
                            Pendente
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Expandido */}
                    {expandedRow === o.id && (
                      <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--ui-border)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: '13px', marginBottom: '16px' }}>
                          <div style={{ 
                            padding: '12px', 
                            background: 'var(--ui-bg)', 
                            borderRadius: '8px',
                            border: '1px solid var(--ui-border)'
                          }}>
                            <div style={{ color: 'var(--ui-text-dim)', fontSize: '11px', marginBottom: '4px', textTransform: 'uppercase' }}>Encomenda</div>
                            <div style={{ color: 'var(--ui-text)', fontFamily: 'monospace' }}>{o.id?.slice(-12)}</div>
                          </div>
                          <div style={{ 
                            padding: '12px', 
                            background: 'var(--ui-bg)', 
                            borderRadius: '8px',
                            border: '1px solid var(--ui-border)'
                          }}>
                            <div style={{ color: 'var(--ui-text-dim)', fontSize: '11px', marginBottom: '4px', textTransform: 'uppercase' }}>Data</div>
                            <div style={{ color: 'var(--ui-text)' }}>{fmtDate(o.date)}</div>
                          </div>
                          <div style={{ 
                            padding: '12px', 
                            background: 'var(--ui-bg)', 
                            borderRadius: '8px',
                            border: '1px solid var(--ui-border)'
                          }}>
                            <div style={{ color: 'var(--ui-text-dim)', fontSize: '11px', marginBottom: '4px', textTransform: 'uppercase' }}>Contrato</div>
                            <div style={{ color: 'var(--ui-text)' }}>{contractName(o.contractId)}</div>
                          </div>
                          <div style={{ 
                            padding: '12px', 
                            background: 'var(--ui-bg)', 
                            borderRadius: '8px',
                            border: '1px solid var(--ui-border)'
                          }}>
                            <div style={{ color: 'var(--ui-text-dim)', fontSize: '11px', marginBottom: '4px', textTransform: 'uppercase' }}>Local</div>
                            <div style={{ color: 'var(--ui-text)' }}>{locationName(o.locationId)}</div>
                          </div>
                        </div>

                        {/* Botões de ação (apenas para faturas) */}
                        {tab === 'invoices' && o.invoice && (
                          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                            <button
                              className="btn-secondary"
                              onClick={(e) => {
                                e.stopPropagation()
                                exportInvoiceXML(o)
                              }}
                              disabled={!canExport}
                              title={!canExport ? 'Sem permissão para exportar' : 'Descarregar fatura em XML'}
                              style={{ padding: '8px 14px', fontSize: '12px' }}
                            >
                              📥 Exportar XML
                            </button>
                          </div>
                        )}

                        {/* Items */}
                        <div>
                          <div style={{ color: 'var(--ui-text-dim)', fontSize: '11px', marginBottom: '8px', textTransform: 'uppercase' }}>Itens da encomenda</div>
                          <div style={{ 
                            background: 'var(--ui-bg)', 
                            borderRadius: '8px', 
                            border: '1px solid var(--ui-border)',
                            overflow: 'hidden'
                          }}>
                            <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                              <thead>
                                <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                                  <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--ui-text-dim)', fontWeight: 500 }}>Produto</th>
                                  <th style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--ui-text-dim)', fontWeight: 500 }}>Qtd</th>
                                  <th style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--ui-text-dim)', fontWeight: 500 }}>Preço</th>
                                  <th style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--ui-text-dim)', fontWeight: 500 }}>Total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {orderItems(o).map((it, i) => (
                                  <tr key={i} style={{ borderTop: '1px solid var(--ui-border)' }}>
                                    <td style={{ padding: '10px 12px', color: 'var(--ui-text)' }}>{it.productName}</td>
                                    <td style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--ui-text)' }}>{it.preparedQty || it.qty}</td>
                                    <td style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--ui-text-dim)' }}>{money(it.preco)}</td>
                                    <td style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--ui-text)' }}>{money((it.preco || 0) * (it.preparedQty || it.qty || 0))}</td>
                                  </tr>
                                ))}
                                <tr style={{ borderTop: '2px solid var(--ui-border)', background: 'rgba(255,255,255,0.03)' }}>
                                  <td colSpan={3} style={{ padding: '12px', textAlign: 'right', fontWeight: 600, color: 'var(--ui-text)' }}>Total</td>
                                  <td style={{ textAlign: 'right', padding: '12px', fontWeight: 700, color: '#10b981', fontSize: '14px' }}>{money(orderTotal(o))}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  )
                })}
              </div>
            )
            )}
          </div>
        </div>

        {/* ====== MODAL DE RETIFICAÇÃO ====== */}
        {rectModal && (
          <div className="modal-overlay" onClick={() => setRectModal(null)}>
            <div className="driver-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
              <div className="driver-modal-header">
                <h3>
                  {rectModal.type === 'nota_credito' ? '📕 Registar Nota de Crédito' : '📗 Registar Fatura Complementar'}
                </h3>
                <button className="driver-modal-close" onClick={() => setRectModal(null)}>✕</button>
              </div>
              <div className="driver-modal-body">
                <div style={{ marginBottom: '12px', fontSize: '13px', color: 'var(--ui-text-dim)' }}>
                  Encomenda de <strong style={{ color: 'var(--ui-text)' }}>{rectModal.order?.clientName || '—'}</strong>
                  {rectModal.order?.invoice?.number && ` • ${rectModal.order.invoice.number}`}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <label style={{ fontSize: '13px' }}>
                    <span style={{ color: 'var(--ui-text-dim)', display: 'block', marginBottom: '4px' }}>
                      Número do documento
                    </span>
                    <input
                      type="text"
                      value={rectForm.number}
                      onChange={e => setRectForm(p => ({ ...p, number: e.target.value }))}
                      placeholder={rectModal.type === 'nota_credito' ? 'NC-2026-001' : 'FC-2026-001'}
                      style={{ width: '100%' }}
                    />
                  </label>
                  <label style={{ fontSize: '13px' }}>
                    <span style={{ color: 'var(--ui-text-dim)', display: 'block', marginBottom: '4px' }}>
                      Valor (€)
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={rectForm.amount}
                      onChange={e => setRectForm(p => ({ ...p, amount: e.target.value }))}
                      placeholder="0.00"
                      style={{ width: '100%' }}
                    />
                  </label>
                  <label style={{ fontSize: '13px' }}>
                    <span style={{ color: 'var(--ui-text-dim)', display: 'block', marginBottom: '4px' }}>
                      Notas (opcional)
                    </span>
                    <textarea
                      rows={2}
                      value={rectForm.notes}
                      onChange={e => setRectForm(p => ({ ...p, notes: e.target.value }))}
                      placeholder="Detalhes adicionais..."
                      style={{ width: '100%' }}
                    />
                  </label>
                </div>
              </div>
              <div className="driver-modal-footer">
                <button className="driver-btn driver-btn-ghost" onClick={() => setRectModal(null)}>Cancelar</button>
                <button
                  className="driver-btn driver-btn-primary"
                  disabled={!rectForm.number || !rectForm.amount || addRect.isPending}
                  onClick={() => {
                    addRect.mutate({
                      orderId: rectModal.order.id,
                      rectification: {
                        type: rectModal.type,
                        number: rectForm.number,
                        amount: Number(rectForm.amount) || 0,
                        notes: rectForm.notes,
                        date: new Date().toISOString().slice(0, 10),
                        createdBy: profile?.name || 'Faturação',
                        createdAt: new Date().toISOString(),
                      }
                    })
                    setRectModal(null)
                  }}
                >
                  {addRect.isPending ? 'A guardar...' : 'Registar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageGuard>
  )
}
