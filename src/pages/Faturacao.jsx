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

import { useOrders, useUpdateOrder } from '../hooks/useOrders'
import { useShippingGuides } from '../hooks/useShippingGuides'
import { useClients } from '../hooks/useCommon'
import { usePermissions } from '../hooks/usePermissions'
import { useAuth } from '../contexts/AuthProvider'
import { PageGuard } from '../components/PageGuard'
import { useMemo, useState, useEffect } from 'react'
import { fmtDate, ORDER_STATUS } from '../lib/utils'
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
  const toBill = useOrders('A_FATURAR').data || []
  const all = useOrders().data || []
  const withInv = useMemo(() => all.filter((o) => !!o.invoice), [all])
  const shippingGuidesPending = useShippingGuides('PENDENTE').data || []
  const clientsAll = useClients().data || []
  const activeClients = useMemo(
    () => clientsAll.filter((u) => u.role === 'cliente' && String(u.active) !== 'false'),
    [clientsAll]
  )

  const upd = useUpdateOrder()

  // State
  const [tab, setTab] = useState('toBill') // 'toBill', 'invoices' ou 'guides'
  const [search, setSearch] = useState('')
  const [clientFilter, setClientFilter] = useState('')
  const [expandedRow, setExpandedRow] = useState(null)
  const [timeFilter, setTimeFilter] = useState('1S') // '1D', '1S', '1M', '1A'

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

  // Faturar encomenda
  const handleCreateInvoice = (o) => {
    console.log('📝 Creating invoice for order:', o.id)
    console.log('  - Client:', o.clientName)
    console.log('  - Current status:', o.status)
    console.log('  - User role:', profile?.role)
    console.log('  - Can create:', canCreate)
    
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
    
    console.log('  - Invoice object:', inv)
    console.log('  - About to call upd.mutate()')
    
    upd.mutate({ id: o.id, data: { invoice: inv, status: ORDER_STATUS.A_EXPEDIR, _profile: profile } })
    
    console.log('  - upd.mutate() called')
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
    }
  }, [toBill, withInv, shippingGuidesPending])

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
          </div>

          {/* Tab Content */}
          <div style={{ padding: '16px' }}>
            {filtered.length === 0 ? (
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
                          <button
                            className="btn"
                            onClick={(e) => {
                              console.log('🖱️ Button clicked!')
                              console.log('  - canCreate:', canCreate)
                              console.log('  - upd.isPending:', upd.isPending)
                              console.log('  - Button disabled:', !canCreate || upd.isPending)
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
            )}
          </div>
        </div>
      </div>
    </PageGuard>
  )
}
