import { FLEET } from '../../config/routes'
import { fmtDate } from '../../lib/utils'
import { getClientName, getLocationInfo } from '../../lib/orderHelpers'
import { useState } from 'react'

export const CreateRoutePanel = ({
  routeCreation,
  motoristas,
  locationsIndex,
  contractsIndex,
  internals,
}) => {
  const {
    date, setDate,
    vehicle, setVehicle,
    driver, setDriver,
    startTime, setStartTime,
    notes, setNotes,
    onlyDay, setOnlyDay,
    driverObj,
    draft,
    availableOrders,
    draftOrders,
    pushToDraft,
    removeFromDraft,
    moveUpDraft,
    moveDownDraft,
    createRoute
  } = routeCreation

  const [expandedCard, setExpandedCard] = useState(null)

  const toggleExpand = (orderId) => {
    setExpandedCard(expandedCard === orderId ? null : orderId)
  }

  const renderOrderCard = (o, inDraft = false, idx = null) => {
    const clientName = getClientName(o, contractsIndex)
    const loc = getLocationInfo(o, { locationsIndex, contractsIndex })
    const items = Array.isArray(o.items) ? o.items : []
    const isExpanded = expandedCard === o.id
    
    // Build location string - getLocationInfo returns { name, addr, contract }
    const locationStr = loc.name || loc.addr || o.deliveryAddress || o.morada || o.endereco || 'Local não definido'
    
    return (
      <div className={`route-order-card ${isExpanded ? 'expanded' : ''}`} key={o.id}>
        <div className="route-order-main">
          <div className="route-order-info" onClick={() => toggleExpand(o.id)} style={{ cursor: 'pointer' }}>
            {inDraft && idx !== null && (
              <span className="route-order-index">{idx + 1}</span>
            )}
            <div className="route-order-details">
              <div className="route-order-client">{clientName}</div>
              <div className="route-order-location">📍 {locationStr}</div>
              <div className="route-order-meta">
                <span className="route-order-date">{fmtDate(o.scheduledDate)}</span>
                {o.timeWindow && <span className="route-order-time">🕐 {o.timeWindow}</span>}
                {o.contract && <span className="route-order-contract">{o.contract}</span>}
                <span className="route-order-items">📦 {items.length} artigo(s)</span>
              </div>
            </div>
          </div>
          
          {!inDraft ? (
            <button 
              className="route-order-add" 
              onClick={(e) => { e.stopPropagation(); pushToDraft(o.id); }}
              title="Adicionar à rota"
            >
              +
            </button>
          ) : (
            <div className="route-order-actions">
              <button 
                className="route-order-move" 
                onClick={(e) => { e.stopPropagation(); moveUpDraft(o.id); }}
                disabled={idx === 0}
                title="Subir"
              >
                ↑
              </button>
              <button 
                className="route-order-move" 
                onClick={(e) => { e.stopPropagation(); moveDownDraft(o.id); }}
                disabled={idx === draftOrders.length - 1}
                title="Descer"
              >
                ↓
              </button>
              <button 
                className="route-order-remove" 
                onClick={(e) => { e.stopPropagation(); removeFromDraft(o.id); }}
                title="Remover"
              >
                ✕
              </button>
            </div>
          )}
        </div>
        
        {/* Artigos expandidos */}
        {isExpanded && (
          <div className="route-order-expanded">
            <div className="route-order-expanded-header">
              <span>📋 Artigos desta encomenda</span>
              {o.notes && <span className="route-order-note">💬 {o.notes}</span>}
            </div>
            {items.length === 0 ? (
              <div className="route-order-no-items">Sem artigos registados</div>
            ) : (
              <div className="route-order-items-list">
                {items.map((item, i) => (
                  <div key={i} className="route-order-item">
                    <span className="route-order-item-qty">{item.qty || 1}x</span>
                    <span className="route-order-item-name">{item.productName || item.description || item.name || item.produto || 'Artigo sem nome'}</span>
                    {item.weight && <span className="route-order-item-weight">{item.weight}kg</span>}
                    {item.volume && <span className="route-order-item-volume">{item.volume}m³</span>}
                  </div>
                ))}
              </div>
            )}
            {(o.totalWeight || o.totalVolume) && (
              <div className="route-order-totals">
                {o.totalWeight && <span>⚖️ Total: {o.totalWeight}kg</span>}
                {o.totalVolume && <span>📐 Volume: {o.totalVolume}m³</span>}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="create-route-panel">
      {/* Configuração da Rota */}
      <div className="route-config">
        <div className="route-config-header">
          <h3>⚙️ Configuração da Rota</h3>
          <div className="route-stats">
            <span className="route-stat">{draft.length} paragens</span>
            <span className="route-stat-divider">•</span>
            <span className="route-stat">{vehicle || 'Sem veículo'}</span>
          </div>
        </div>
        
        <div className="route-config-grid">
          <label className="route-field">
            <span>Data</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          
          <label className="route-field">
            <span>Veículo</span>
            <select value={vehicle} onChange={(e) => setVehicle(e.target.value)}>
              {FLEET.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </label>
          
          <label className="route-field">
            <span>Motorista</span>
            <select value={driver} onChange={(e) => setDriver(e.target.value)}>
              <option value="">— selecionar —</option>
              {motoristas.map((m) => (
                <option key={m.id} value={m.id}>{m.name || m.email}</option>
              ))}
            </select>
          </label>
          
          <label className="route-field">
            <span>Hora de início</span>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </label>
        </div>
        
        <label className="route-field route-field-full">
          <span>Observações</span>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notas adicionais para o motorista..."
          />
        </label>
      </div>

      {/* Builder de duas colunas */}
      <div className="route-builder">
        {/* Coluna Esquerda: Disponíveis */}
        <div className="route-column">
          <div className="route-column-header">
            <h4>📦 Encomendas Disponíveis</h4>
            <div className="route-column-header-right">
              <label className="route-filter-toggle">
                <input
                  type="checkbox"
                  checked={onlyDay}
                  onChange={(e) => setOnlyDay(e.target.checked)}
                />
                <span>Só {fmtDate(date)}</span>
              </label>
              <span className="route-column-count">{availableOrders.length}</span>
            </div>
          </div>
          <div className="route-column-body">
            {availableOrders.length === 0 ? (
              <div className="route-empty">
                <span className="route-empty-icon">📭</span>
                <span>Sem encomendas disponíveis</span>
              </div>
            ) : (
              availableOrders.map((o) => renderOrderCard(o, false))
            )}
          </div>
        </div>

        {/* Coluna Direita: Rota em construção */}
        <div className="route-column route-column-draft">
          <div className="route-column-header">
            <h4>🚚 Rota em Construção</h4>
            <span className="route-column-count">{draft.length}</span>
          </div>
          <div className="route-column-body">
            {draftOrders.length === 0 ? (
              <div className="route-empty">
                <span className="route-empty-icon">👆</span>
                <span>Clique + para adicionar paragens</span>
              </div>
            ) : (
              draftOrders.map((o, idx) => renderOrderCard(o, true, idx))
            )}
          </div>
          <div className="route-submit">
            <button
              className="route-submit-btn"
              onClick={() => createRoute.mutate()}
              disabled={createRoute.isPending || draft.length === 0}
            >
              {createRoute.isPending ? 'A criar...' : `Criar Rota (${draft.length} paragens)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
