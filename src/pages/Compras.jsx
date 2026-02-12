import { useMemo, useState } from 'react'
import { useOrders, useUpdateOrder } from '../hooks/useOrders'
import { usePermissions } from '../hooks/usePermissions'
import { useWarehouse } from '../contexts/WarehouseContext'
import { PageGuard } from '../components/PageGuard'
import { fmtDate } from '../lib/utils'

export default function Compras(){
  const { can } = usePermissions()
  const { filterByWarehouse } = useWarehouse() || {}
  
  // Permissões
  const canManage = can('purchases.manage')
  const canRestock = can('purchases.restock')
  
  // Encomendas em FALTAS (filtradas por armazém)
  const faltasRaw = useOrders('FALTAS').data || []
  const faltas = useMemo(() => filterByWarehouse ? filterByWarehouse(faltasRaw) : faltasRaw, [faltasRaw, filterByWarehouse])
  const upd = useUpdateOrder()

  // Encomendas ENTREGUES (para análises de top produtos)
  const entreguesRaw = useOrders('ENTREGUE').data || []
  const entregues = useMemo(() => filterByWarehouse ? filterByWarehouse(entreguesRaw) : entreguesRaw, [entreguesRaw, filterByWarehouse])

  // Ordena FALTAS por data (primeiro a repor as mais antigas)
  const faltasSorted = useMemo(() => {
    return [...faltas].sort((a,b)=> new Date(a.date) - new Date(b.date))
  }, [faltas])

  // Agregado de faltas por produto
  const aggMap = useMemo(() => {
    const map = {}
    for (const o of faltasSorted) {
      const orderDate = o.date
      for (const it of (o.items||[])) {
        const miss = Math.max(0, (it.qty||0) - (it.preparedQty||0) - (it.purchasedQty||0))
        if (miss > 0) {
          const k = `${it.productId}|${it.unidade}|${it.productName}`
          if (!map[k]) {
            map[k] = {
              key: k,
              productId: it.productId,
              productName: it.productName,
              unidade: it.unidade,
              missing: 0,
              ordersCount: 0,
              firstDate: orderDate,
              lastDate: orderDate,
            }
          }
          map[k].missing += miss
          map[k].ordersCount += 1
          // janela temporal das faltas
          if (orderDate) {
            if (!map[k].firstDate || new Date(orderDate) < new Date(map[k].firstDate)) {
              map[k].firstDate = orderDate
            }
            if (!map[k].lastDate || new Date(orderDate) > new Date(map[k].lastDate)) {
              map[k].lastDate = orderDate
            }
          }
        }
      }
    }
    return map
  }, [faltasSorted])

  const agg = useMemo(() => {
    return Object.values(aggMap).sort((a,b)=> a.productName.localeCompare(b.productName))
  }, [aggMap])

  // Pesquisa e inputs de “recebido agora”
  const [q, setQ] = useState('')
  const [received, setReceived] = useState({})   // { key: number }
  const setRec = (k, v) => setReceived(s => ({ ...s, [k]: v }))

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return agg
    return agg.filter(r =>
      `${r.productName} ${r.unidade}`.toLowerCase().includes(term)
    )
  }, [agg, q])

  // Dar entrada para uma “chave” (produto agregado) distribuindo pelas encomendas
  const darEntradaKey = async (k, addQtyRaw) => {
    const addQty = parseFloat(addQtyRaw || '0') || 0
    if (!k || addQty <= 0) return
    const [pid] = k.split('|')
    let remain = addQty

    // percorre encomendas por data, consumindo a necessidade
    for (const o of faltasSorted) {
      if (remain <= 0) break
      let changed = false

      const items = (o.items||[]).map(it => {
        if (it.productId === pid && remain > 0) {
          const need = Math.max(0, (it.qty||0) - (it.preparedQty||0) - (it.purchasedQty||0))
          const take = Math.min(need, remain)
          if (take > 0) {
            remain -= take
            changed = true
            return { ...it, purchasedQty: (it.purchasedQty||0) + take }
          }
        }
        return it
      })

      if (changed) {
        const still = items.some(it => ((it.preparedQty||0) + (it.purchasedQty||0)) < (it.qty||0))
        if (still) {
          // Ainda há faltas nesta encomenda
          upd.mutate({ id:o.id, data:{ items } })
        } else {
          // Cobriu tudo da encomenda → volta a PREP para o armazém concluir
          upd.mutate({ id:o.id, data:{ items, status:'PREP', needsWarehouseCompletion:true } })
        }
      }
    }

    // Limpa input deste produto
    setRec(k, '')
  }

  // Lançar todas as entradas preenchidas
  const confirmarTodas = async () => {
    const arr = Object.entries(received).filter(([_, v]) => parseFloat(v) > 0)
    if (!arr.length) return
    for (const [k, v] of arr) {
      // sequência simples; não aguardamos cada update (como no resto do projeto)
      await darEntradaKey(k, v)
    }
  }

  // KPIs de faltas
  const totalLinhas = agg.length
  const totalQtd = agg.reduce((s,r)=> s + (r.missing||0), 0)
  const totalEncomendas = faltas.length

  const topFaltas = useMemo(() => {
    return [...agg]
      .sort((a,b)=> (b.missing || 0) - (a.missing || 0))
      .slice(0, 10)
  }, [agg])

  // Exportar PDF de forma simples (abre janela, imprime)
  const exportPDF = () => {
    const esc = (t='') => String(t)
      .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
      .replaceAll('"','&quot;').replaceAll("'","&#39;")

    const rows = agg.map(r => `
      <tr>
        <td>${esc(r.productName)}</td>
        <td>${esc(r.unidade)}</td>
        <td style="text-align:right">${(r.missing||0).toFixed(2)}</td>
      </tr>`).join('')

    const now = new Date()
    const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Livro de Faltas</title>
  <style>
    :root{--txt:#111827;--muted:#6b7280;--line:#e5e7eb}
    *{box-sizing:border-box} body{font-family:Inter,system-ui,Segoe UI,Roboto,Arial,sans-serif;margin:24px;color:var(--txt)}
    h1{font-size:18px;margin:0 0 6px} .muted{color:var(--muted);font-size:12px;margin-bottom:12px}
    table{width:100%;border-collapse:collapse;margin-top:8px}
    th,td{border-bottom:1px solid var(--line);padding:8px 6px;text-align:left;font-size:13px}
    th{background:#fafafa}
    .kpi{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
    .chip{border:1px solid var(--line);border-radius:999px;padding:4px 8px;font-size:12px}
    @page{size:auto;margin:15mm}
    @media print{ .no-print{display:none} body{margin:0} }
  </style>
</head>
<body>
  <h1>Livro de Faltas</h1>
  <div class="muted">Gerado em ${esc(now.toLocaleString())}</div>
  <div class="kpi">
    <div class="chip">Linhas: ${totalLinhas}</div>
    <div class="chip">Qtd total: ${totalQtd.toFixed(2)}</div>
    <div class="chip">Encomendas em FALTAS: ${totalEncomendas}</div>
  </div>
  <table>
    <thead><tr><th>Produto</th><th>Un.</th><th style="text-align:right">Qtd em falta</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="3">Sem faltas.</td></tr>'}</tbody>
  </table>
  <div class="no-print" style="margin-top:12px"><button onclick="window.print()">Imprimir / Guardar PDF</button></div>
  <script>window.onload = () => setTimeout(()=>window.print(), 50)</script>
</body>
</html>
    `.trim()

    const w = window.open('', '_blank', 'width=900,height=700')
    if (!w) return
    w.document.open(); w.document.write(html); w.document.close()
    w.focus()
  }

  // ----- BLOCO 2: ANÁLISES / TOP PRODUTOS ---------------------------------

  const [periodDays, setPeriodDays] = useState(30) // 7 / 30 / 90 / 365

  // Filtra encomendas ENTREGUE pelo período escolhido
  const entreguesPeriodo = useMemo(() => {
    if (!entregues?.length) return []
    const now = new Date()
    const from = new Date(now)
    from.setDate(from.getDate() - (periodDays || 30))

    return entregues.filter(o => {
      if (!o?.date) return false
      const d = new Date(o.date)
      if (Number.isNaN(d.getTime())) return false
      return d >= from && d <= now
    })
  }, [entregues, periodDays])

  // Agregado de consumo por produto (quantidade vendida)
  const topMap = useMemo(() => {
    const map = {}
    for (const o of entreguesPeriodo) {
      for (const it of (o.items || [])) {
        const qty = it.qty || 0
        if (qty <= 0) continue
        const k = `${it.productId}|${it.unidade}|${it.productName}`
        if (!map[k]) {
          map[k] = {
            key: k,
            productId: it.productId,
            productName: it.productName,
            unidade: it.unidade,
            qty: 0,
            ordersCount: 0,
          }
        }
        map[k].qty += qty
        map[k].ordersCount += 1
      }
    }
    return map
  }, [entreguesPeriodo])

  const topProdutos = useMemo(() => {
    return Object.values(topMap)
      .sort((a,b)=> (b.qty || 0) - (a.qty || 0))
      .slice(0, 100) // top 100
  }, [topMap])

  const totalProdutosTop = topProdutos.length
  const totalQtyPeriodo = topProdutos.reduce((s,r)=> s + (r.qty || 0), 0)
  const totalEncomendasPeriodo = entreguesPeriodo.length

  // ----- RENDER ------------------------------------------------------------

  return (
    <PageGuard requiredPermission="purchases.view">
      <div className="grid">
      {/* KPIs organizados */}
      <div className="span-12">
        <div className="compras-kpi-grid">
          <div className="compras-kpi-card">
            <span className="compras-kpi-label">Produtos em falta</span>
            <span className="compras-kpi-value">{totalLinhas}</span>
          </div>
          <div className="compras-kpi-card">
            <span className="compras-kpi-label">Qtd em falta</span>
            <span className="compras-kpi-value">{totalQtd.toFixed(2)}</span>
          </div>
          <div className="compras-kpi-card">
            <span className="compras-kpi-label">Encomendas com faltas</span>
            <span className="compras-kpi-value">{totalEncomendas}</span>
          </div>
          <div className="compras-kpi-card">
            <span className="compras-kpi-label">Top baseado em</span>
            <span className="compras-kpi-value">{periodDays} dias</span>
          </div>
        </div>
      </div>

      {/* Cabeçalho / Ações principais */}
      <div className="span-12 card">
        <div className="toolbar">
          <div>
            <h3 style={{margin:0}}>Compras &amp; Reposição</h3>
            <p className="muted" style={{margin:'4px 0 0'}}>
              Painel diário para gerir faltas, dar entradas e acompanhar os produtos mais críticos e mais vendidos.
            </p>
          </div>

          <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
            <input
              placeholder="Pesquisar produto em falta…"
              value={q}
              onChange={e=>setQ(e.target.value)}
            />
            <button 
              className="btn-secondary" 
              onClick={()=>exportPDF()}
            >
              Exportar PDF (faltas)
            </button>
            <button 
              className="btn" 
              onClick={confirmarTodas}
              disabled={!canRestock}
              title={!canRestock ? 'Sem permissão para registar reposição' : undefined}
            >
              Confirmar entradas (lote)
            </button>
          </div>
        </div>
      </div>

      {/* Coluna principal: Livro de Faltas / Reposição */}
      <div className="span-8 card">
        <div className="toolbar" style={{marginTop:0, justifyContent:'space-between', alignItems:'flex-end'}}>
          <div>
            <strong>Livro de Faltas &amp; Reposição</strong>
            <div className="muted" style={{fontSize:12}}>
              Edita “Recebido agora” e clica em <em>Dar entrada</em> ou usa <em>Confirmar entradas (lote)</em>.
            </div>
          </div>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>Produto</th>
              <th>Un.</th>
              <th>Em falta</th>
              <th>Encomendas</th>
              <th style={{width:180}}>Recebido agora</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => {
              const k = r.key
              const val = received[k] ?? ''
              return (
                <tr key={k}>
                  <td>{r.productName}</td>
                  <td>{r.unidade}</td>
                  <td>{r.missing.toFixed(2)}</td>
                  <td>{r.ordersCount || 0}</td>
                  <td>
                    <div style={{display:'flex',gap:6}}>
                      <input
                        type="number" step="0.01" min="0"
                        value={val}
                        onChange={e=>setRec(k, e.target.value)}
                        placeholder="0.00"
                      />
                      <button className="btn-ghost" onClick={()=>setRec(k, String(r.missing))}>Max</button>
                    </div>
                  </td>
                  <td style={{textAlign:'right'}}>
                    <button
                      className="btn-secondary"
                      onClick={()=>darEntradaKey(k, val)}
                      disabled={!(parseFloat(val)>0) || !canRestock}
                      title={!canRestock ? 'Sem permissão para registar reposição' : undefined}
                    >
                      Dar entrada
                    </button>
                  </td>
                </tr>
              )
            })}
            {!filtered.length && (
              <tr><td colSpan="6" className="muted">Sem faltas ou sem resultados.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Coluna lateral: contexto + produtos mais críticos em falta */}
      <div className="span-4 card">
        <h3>Hoje &amp; Produtos mais críticos</h3>
        <div className="kpi" style={{marginBottom:8}}>
          <div className="chip">Hoje: {fmtDate(new Date().toISOString().slice(0,10))}</div>
          <div className="chip">Top faltas: {topFaltas.length}</div>
        </div>

        <p className="muted" style={{marginTop:0}}>
          Cada entrada é distribuída pelas encomendas mais antigas primeiro.
          Quando todas as faltas de uma encomenda ficam cobertas, a encomenda volta a <strong>PREP</strong> para o armazém concluir (sem alterar o "Preparado" automaticamente).
        </p>

        <div className="hr"></div>

        <h4>Produtos com mais falta (top 10)</h4>
        <p className="muted" style={{marginTop:0}}>
          Ajuda a priorizar compras urgentes — maior quantidade em falta e presença em várias encomendas.
        </p>

        <div style={{maxHeight:220,overflow:'auto',marginTop:8}}>
          <table className="table compact">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Qtd</th>
                <th>Encs.</th>
              </tr>
            </thead>
            <tbody>
              {topFaltas.map(r => (
                <tr key={r.key}>
                  <td>{r.productName}</td>
                  <td>{r.missing.toFixed(2)}</td>
                  <td>{r.ordersCount || 0}</td>
                </tr>
              ))}
              {!topFaltas.length && (
                <tr><td colSpan={3} className="muted">Sem faltas críticas.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="hr"></div>

        <h4>Ajuda rápida</h4>
        <p className="muted" style={{marginTop:0}}>
          Usa o PDF para acompanhar a reposição no armazém ou enviar ao fornecedor.
          As entradas em lote permitem registar rapidamente uma palete ou caixa com vários produtos.
        </p>

        <button
          className="btn-ghost"
          onClick={()=>setReceived({})}
          title="Limpa todos os valores de 'Recebido agora'"
          style={{marginTop:8}}
        >
          Limpar valores dos campos
        </button>
      </div>

      {/* Linha analítica: Top produtos vendidos no período */}
      <div className="span-12 card">
        <div className="toolbar" style={{marginTop:0,justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <strong>Top produtos por quantidade vendida</strong>
            <div className="muted" style={{fontSize:12}}>
              Baseado em encomendas com estado <strong>ENTREGUE</strong> nos últimos {periodDays} dias.
            </div>
          </div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
            <span className="muted" style={{fontSize:12}}>Período:</span>
            {[7,30,90,365].map(d => (
              <button
                key={d}
                type="button"
                className={periodDays === d ? 'btn' : 'btn-ghost'}
                onClick={()=>setPeriodDays(d)}
              >
                {d === 365 ? 'Ano' : `${d}d`}
              </button>
            ))}
          </div>
        </div>

        <div className="kpi" style={{marginBottom:8}}>
          <div className="chip">Produtos no top: {totalProdutosTop}</div>
          <div className="chip">Qtd total vendida: {totalQtyPeriodo.toFixed(2)}</div>
          <div className="chip">Encomendas ENTREGUE: {totalEncomendasPeriodo}</div>
        </div>

        <div style={{maxHeight:360,overflow:'auto'}} className="compras-top-table">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Produto</th>
                <th>Un.</th>
                <th>Qtd vendida</th>
                <th>Encomendas</th>
              </tr>
            </thead>
            <tbody>
              {topProdutos.map((r, idx) => (
                <tr key={r.key}>
                  <td>{idx + 1}</td>
                  <td>{r.productName}</td>
                  <td>{r.unidade}</td>
                  <td>{r.qty.toFixed(2)}</td>
                  <td>{r.ordersCount || 0}</td>
                </tr>
              ))}
              {!topProdutos.length && (
                <tr><td colSpan={5} className="muted">Ainda sem dados de encomendas ENTREGUE para este período.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
    </PageGuard>
  )
}
