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
import { useClients } from '../hooks/useCommon'
import { usePermissions } from '../hooks/usePermissions'
import { PageGuard } from '../components/PageGuard'
import { useMemo, useState, useEffect } from 'react'
import { fmtDate, ORDER_STATUS, CARRIERS } from '../lib/utils'
import { db } from '../lib/firebase'
import { doc, getDoc } from 'firebase/firestore'

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
  const canCreate = can('invoicing.create')
  const canEdit = can('invoicing.edit')
  const canExport = can('invoicing.export')
  
  // Dados
  const toBill = useOrders('A_FATURAR').data || []
  const all = useOrders().data || []
  const withInv = useMemo(() => all.filter((o) => !!o.invoice), [all])
  const clientsAll = useClients().data || []
  const activeClients = useMemo(
    () => clientsAll.filter((u) => u.role === 'cliente' && String(u.active) !== 'false'),
    [clientsAll]
  )

  const upd = useUpdateOrder()

  // State
  const [tab, setTab] = useState('toBill') // 'toBill' ou 'invoices'
  const [search, setSearch] = useState('')
  const [clientFilter, setClientFilter] = useState('')
  const [expandedRow, setExpandedRow] = useState(null)

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
    import('../lib/firebase').then(({ db: fireDb }) => {
      import('firebase/firestore').then(({ doc: fbDoc, updateDoc: fbUpdate }) => {
        fbUpdate(fbDoc(fireDb, 'orders', orderId), { carrier: value || null }).catch(console.error)
      })
    })
  }

  // Faturar encomenda
  const handleCreateInvoice = (o) => {
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
    upd.mutate({ id: o.id, data: { invoice: inv, status: ORDER_STATUS.A_EXPEDIR, carrier: effectiveCarrier } })
  }

  // Filtrar dados
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    let data = tab === 'toBill' ? toBill : withInv

    if (clientFilter) {
      data = data.filter((o) => o.clientId === clientFilter)
    }

    if (q) {
      data = data.filter((o) => {
        const hay = `${o.id} ${o.clientName} ${o.invoice?.number || ''} ${contractName(o.contractId)} ${locationName(o.locationId)}`.toLowerCase()
        return hay.includes(q)
      })
    }

    return data.sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [tab, toBill, withInv, search, clientFilter, contractMap, locationMap])

  // KPI
  const kpi = useMemo(() => {
    const total = orderTotal
    return {
      toBill: toBill.length,
      toBillValue: toBill.reduce((s, o) => s + total(o), 0),
      invoicesCount: withInv.length,
      invoicesValue: withInv.reduce((s, o) => s + total(o), 0),
      sentCount: withInv.filter((o) => o.invoice?.sentAt).length,
    }
  }, [toBill, withInv])

  return (
    <PageGuard requiredPermission="invoicing.view">
      <div className="page">
        {/* Cabeçalho */}
        <div className="card" style={{ marginBottom: '16px' }}>
          <div className="toolbar">
            <div>
              <h1 style={{ margin: '0 0 8px' }}>💰 Faturação</h1>
              <p className="muted" style={{ margin: 0, fontSize: '13px' }}>Gestão de encomendas e faturas</p>
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
          <div className="card" style={{ padding: '16px' }}>
            <div className="muted" style={{ fontSize: '12px', marginBottom: '6px' }}>A FATURAR</div>
            <div style={{ fontSize: '24px', fontWeight: 700 }}>{kpi.toBill}</div>
            <div className="muted" style={{ fontSize: '12px', marginTop: '4px' }}>{money(kpi.toBillValue)}</div>
          </div>
          <div className="card" style={{ padding: '16px' }}>
            <div className="muted" style={{ fontSize: '12px', marginBottom: '6px' }}>FATURAS EMITIDAS</div>
            <div style={{ fontSize: '24px', fontWeight: 700 }}>{kpi.invoicesCount}</div>
            <div className="muted" style={{ fontSize: '12px', marginTop: '4px' }}>{money(kpi.invoicesValue)}</div>
          </div>
          <div className="card" style={{ padding: '16px' }}>
            <div className="muted" style={{ fontSize: '12px', marginBottom: '6px' }}>ENVIADAS</div>
            <div style={{ fontSize: '24px', fontWeight: 700 }}>{kpi.sentCount}</div>
            <div className="muted" style={{ fontSize: '12px', marginTop: '4px' }}>{((kpi.sentCount / kpi.invoicesCount) * 100 || 0).toFixed(0)}%</div>
          </div>
        </div>

        {/* Filtros */}
        <div className="card" style={{ marginBottom: '16px', padding: '12px' }}>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Pesquisar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flex: 1, minWidth: '200px', padding: '8px 12px', border: '1px solid var(--line)', borderRadius: '6px' }}
            />
            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid var(--line)', borderRadius: '6px' }}
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

        {/* Abas */}
        <div className="card">
          {/* Tab Buttons */}
          <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--line)', padding: '12px' }}>
            <button
              onClick={() => setTab('toBill')}
              style={{
                padding: '8px 16px',
                background: tab === 'toBill' ? 'var(--accent)' : 'transparent',
                color: tab === 'toBill' ? 'white' : 'inherit',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              📦 A Faturar ({kpi.toBill})
            </button>
            <button
              onClick={() => setTab('invoices')}
              style={{
                padding: '8px 16px',
                background: tab === 'invoices' ? 'var(--accent)' : 'transparent',
                color: tab === 'invoices' ? 'white' : 'inherit',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              📄 Faturas ({kpi.invoicesCount})
            </button>
          </div>

          {/* Tab Content */}
          <div style={{ padding: '16px' }}>
            {filtered.length === 0 ? (
              <div className="muted" style={{ textAlign: 'center', padding: '40px' }}>
                {tab === 'toBill' ? '✅ Sem encomendas por faturar' : '📭 Sem faturas'}
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '8px' }}>
                {filtered.map((o) => (
                  <div
                    key={o.id}
                    style={{
                      border: '1px solid var(--line)',
                      borderRadius: '8px',
                      padding: '12px',
                      cursor: 'pointer',
                      background: expandedRow === o.id ? 'var(--surface-2)' : 'transparent',
                    }}
                    onClick={() => setExpandedRow(expandedRow === o.id ? null : o.id)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{o.clientName || '—'}</div>
                        <div className="muted" style={{ fontSize: '12px' }}>
                          {fmtDate(o.date)} • {contractName(o.contractId)} • {money(orderTotal(o))}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        {tab === 'toBill' ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {!(carrierEdits[o.id] || o.carrier) && (
                              <select
                                value={carrierEdits[o.id] || o.carrier || ''}
                                onChange={e => { e.stopPropagation(); handleCarrierInlineChange(o.id, e.target.value) }}
                                onClick={e => e.stopPropagation()}
                                style={{
                                  padding: '4px 6px',
                                  fontSize: '11px',
                                  borderRadius: '6px',
                                  border: '2px solid #f59e0b',
                                  background: 'rgba(245,158,11,0.1)',
                                  color: 'var(--ui-text)',
                                  fontWeight: 500
                                }}
                              >
                                <option value="">⚠️ Transporte?</option>
                                <option value="interno">Nossos carros</option>
                                <option value="santosvale">Santos e Vale</option>
                                <option value="steff">STEFF (frio)</option>
                              </select>
                            )}
                            <button
                              className="btn"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleCreateInvoice(o)
                              }}
                              disabled={!canCreate || upd.isPending}
                              style={{ padding: '6px 12px', fontSize: '12px' }}
                            >
                              Faturar
                            </button>
                          </div>
                        ) : (
                          <span className="badge" style={{ fontSize: '11px' }}>
                            {o.invoice?.number || '—'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Expandido */}
                    {expandedRow === o.id && (
                      <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--line)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '13px' }}>
                          <div>
                            <div className="muted">Encomenda</div>
                            <div>{o.id}</div>
                          </div>
                          <div>
                            <div className="muted">Data</div>
                            <div>{fmtDate(o.date)}</div>
                          </div>
                          <div>
                            <div className="muted">Contrato</div>
                            <div>{contractName(o.contractId)}</div>
                          </div>
                          <div>
                            <div className="muted">Local</div>
                            <div>{locationName(o.locationId)}</div>
                          </div>
                        </div>

                        {/* Items */}
                        <div style={{ marginTop: '12px' }}>
                          <div className="muted" style={{ fontSize: '12px', marginBottom: '6px' }}>Itens</div>
                          <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr>
                                <th style={{ textAlign: 'left', padding: '4px', borderBottom: '1px solid var(--line)' }}>Produto</th>
                                <th style={{ textAlign: 'right', padding: '4px', borderBottom: '1px solid var(--line)' }}>Qtd</th>
                                <th style={{ textAlign: 'right', padding: '4px', borderBottom: '1px solid var(--line)' }}>Preço</th>
                                <th style={{ textAlign: 'right', padding: '4px', borderBottom: '1px solid var(--line)' }}>Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {orderItems(o).map((it, i) => (
                                <tr key={i}>
                                  <td style={{ padding: '4px' }}>{it.productName}</td>
                                  <td style={{ textAlign: 'right', padding: '4px' }}>{it.preparedQty || it.qty}</td>
                                  <td style={{ textAlign: 'right', padding: '4px' }}>{money(it.preco)}</td>
                                  <td style={{ textAlign: 'right', padding: '4px' }}>{money((it.preco || 0) * (it.preparedQty || it.qty || 0))}</td>
                                </tr>
                              ))}
                              <tr style={{ borderTop: '1px solid var(--line)', fontWeight: 600 }}>
                                <td colSpan={3} style={{ padding: '4px', textAlign: 'right' }}>Total</td>
                                <td style={{ textAlign: 'right', padding: '4px' }}>{money(orderTotal(o))}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </PageGuard>
  )
}
