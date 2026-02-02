import { FLEET } from '../../config/routes'
import { fmtDate } from '../../lib/utils'
import { getClientName, getLocationInfo } from '../../lib/orderHelpers'

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

  const getLocation = (o) => {
    const L = getLocationInfo(o, { locationsIndex, contractsIndex })
    return L.name || L.addr || '—'
  }

  return (
    <div className="create-route-panel">
      {/* Configuração da Rota */}
      <div className="route-config">
        <h3 className="route-config-title">⚙️ Configuração</h3>
        
        <div className="route-config-grid">
          <div className="route-field">
            <label>📅 Data</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          
          <div className="route-field">
            <label>🚗 Veículo</label>
            <select value={vehicle} onChange={(e) => setVehicle(e.target.value)}>
              {FLEET.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
          
          <div className="route-field">
            <label>👤 Motorista</label>
            <select value={driver} onChange={(e) => setDriver(e.target.value)}>
              <option value="">Selecionar...</option>
              {motoristas.map((m) => (
                <option key={m.id} value={m.id}>{m.name || m.email}</option>
              ))}
            </select>
          </div>
          
          <div className="route-field">
            <label>🕐 Hora</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
        </div>

        <div className="route-field full">
          <label>📝 Observações (opcional)</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notas para o motorista..."
          />
        </div>
      </div>

      {/* Duas colunas: Disponíveis | Rota */}
      <div className="route-builder">
        {/* Coluna Esquerda - Encomendas Disponíveis */}
        <div className="route-column available">
          <div className="route-column-header">
            <div className="route-column-title">
              <span className="route-column-icon">📦</span>
              <span>Disponíveis</span>
              <span className="route-column-count">{availableOrders.length}</span>
            </div>
            <label className="route-filter">
              <input
                type="checkbox"
                checked={onlyDay}
                onChange={(e) => setOnlyDay(e.target.checked)}
              />
              <span>Só do dia {fmtDate(date)}</span>
            </label>
          </div>
          
          <div className="route-column-body">
            {availableOrders.length === 0 ? (
              <div className="route-empty">
                <span>Sem encomendas disponíveis</span>
              </div>
            ) : (
              availableOrders.map((o) => (
                <div key={o.id} className="route-order-card" onClick={() => pushToDraft(o.id)}>
                  <div className="route-order-main">
                    <div className="route-order-client">{getClientName(o) || 'Cliente'}</div>
                    <div className="route-order-location">{getLocation(o)}</div>
                    <div className="route-order-meta">
                      <span className="route-order-date">{fmtDate(o.date)}</span>
                      <span className="route-order-items">{(o.items || []).length} itens</span>
                    </div>
                  </div>
                  <button className="route-order-add" title="Adicionar à rota">
                    →
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Coluna Direita - Rota em Construção */}
        <div className="route-column draft">
          <div className="route-column-header">
            <div className="route-column-title">
              <span className="route-column-icon">🚚</span>
              <span>Rota</span>
              <span className="route-column-count accent">{draft.length}</span>
            </div>
            {draft.length > 0 && (
              <button 
                className="route-clear-btn"
                onClick={() => draft.forEach(id => removeFromDraft(id))}
              >
                Limpar
              </button>
            )}
          </div>
          
          <div className="route-column-body">
            {draftOrders.length === 0 ? (
              <div className="route-empty">
                <span className="route-empty-icon">👈</span>
                <span>Clique nas encomendas para adicionar</span>
              </div>
            ) : (
              draftOrders.map((o, idx) => (
                <div key={o.id} className="route-order-card in-route">
                  <div className="route-order-number">{idx + 1}</div>
                  <div className="route-order-main">
                    <div className="route-order-client">{getClientName(o) || 'Cliente'}</div>
                    <div className="route-order-location">{getLocation(o)}</div>
                  </div>
                  <div className="route-order-actions">
                    <button 
                      className="route-order-move" 
                      onClick={() => moveUpDraft(o.id)}
                      disabled={idx === 0}
                      title="Mover para cima"
                    >
                      ↑
                    </button>
                    <button 
                      className="route-order-move" 
                      onClick={() => moveDownDraft(o.id)}
                      disabled={idx === draftOrders.length - 1}
                      title="Mover para baixo"
                    >
                      ↓
                    </button>
                    <button 
                      className="route-order-remove" 
                      onClick={() => removeFromDraft(o.id)}
                      title="Remover da rota"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Botão de Criar Rota */}
          <div className="route-submit">
            <button
              className="route-submit-btn"
              onClick={() => createRoute.mutate()}
              disabled={createRoute.isPending || draft.length === 0 || !driver}
            >
              {createRoute.isPending ? (
                <>⏳ A criar...</>
              ) : (
                <>✓ Criar Rota ({draft.length} paragens)</>
              )}
            </button>
            {!driver && draft.length > 0 && (
              <span className="route-submit-hint">Selecione um motorista</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
