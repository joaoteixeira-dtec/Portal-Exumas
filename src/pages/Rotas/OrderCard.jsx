import { getClientName, getLocationInfo, joinNice } from '../../lib/orderHelpers'
import { fmtDate } from '../../lib/utils'
import { dragDataSet } from '../../lib/dragDropUtils'

export const OrderCard = ({
  o,
  source,
  index,
  onAction,
  onUp,
  onDown,
  draggingId,
  locationsIndex,
  contractsIndex
}) => {
  const L = getLocationInfo(o, { locationsIndex, contractsIndex })

  return (
    <article
      className={`kanban-card ${draggingId === o.id ? 'dragging' : ''}`}
      draggable
      onDragStart={(e) => {
        dragDataSet(e, { id: o.id, source })
      }}
      data-index={index}
      aria-label={`${getClientName(o)} • ${L.name || L.addr || 'Entrega'}`}
    >
      <div style={{ padding: 8, display: 'grid', gap: 6, position: 'relative' }}>
        <div className="card-actions">
          <button
            type="button"
            className={`icon-btn ${source === 'avail' ? 'accent' : ''}`}
            title={source === 'avail' ? 'Adicionar à rota' : 'Remover da rota'}
            onClick={onAction}
          >
            {source === 'avail' ? '→' : '←'}
          </button>
          {source === 'draft' && (
            <>
              <button
                type="button"
                className="icon-btn"
                title="Mover para cima"
                onClick={onUp}
              >
                ▲
              </button>
              <button
                type="button"
                className="icon-btn"
                title="Mover para baixo"
                onClick={onDown}
              >
                ▼
              </button>
            </>
          )}
        </div>
        <div className="truncate-1" style={{ fontWeight: 700, fontSize: 14 }}>
          {getClientName(o) || 'Cliente'}
        </div>
        <div className="muted truncate-1" style={{ fontSize: 11 }}>
          {joinNice([L.name, L.addr], ' – ') || 'Entrega não especificada'}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="badge blue" style={{ fontSize: 10 }}>
            {fmtDate(o.date)}
          </span>
          {L.contract && (
            <span className="badge" style={{ fontSize: 10 }}>
              Contrato: {L.contract}
            </span>
          )}
        </div>
      </div>
    </article>
  )
}
