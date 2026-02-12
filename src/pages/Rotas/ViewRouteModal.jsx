import { getClientName, getLocationInfo, getOrderLinesGeneric, joinNice } from '../../lib/orderHelpers'
import { fmtDate } from '../../lib/utils'

export const ViewRouteModal = ({
  route,
  onClose,
  onViewOrder,
  onEdit,
  onDelete,
  onPrint,
  canEdit,
  exp,
  locationsIndex,
  contractsIndex,
  deleteLoading
}) => {
  const ordersList = (route.orderIds || []).map(oid => exp.find(x => x.id === oid)).filter(Boolean)
  const totalParagens = ordersList.length

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <h3>🚚 Resumo da rota</h3>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ padding: '16px 20px' }}>
          {/* Info chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            <div className="vrm-chip">📅 {fmtDate(route.date)}</div>
            <div className="vrm-chip">🚗 {route.vehicle}</div>
            <div className="vrm-chip">👤 {route.driverName}</div>
            <div className="vrm-chip">⏰ {route.startTime || '—:—'}</div>
            <div className="vrm-chip vrm-chip-accent">{totalParagens} paragens</div>
          </div>

          {route.notes && (
            <div style={{
              padding: '10px 14px', borderRadius: 8, marginBottom: 16,
              background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.15)',
              fontSize: 13, color: 'var(--ui-text-dim)'
            }}>
              <strong style={{ color: '#fb923c' }}>Obs:</strong> {route.notes}
            </div>
          )}

          {/* Entregas */}
          <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>
            Ordem de entrega
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(route.orderIds || []).map((oid, i) => {
              const o = exp.find(x => x.id === oid)
              const L = getLocationInfo(o || {}, { locationsIndex, contractsIndex })
              const lines = o ? getOrderLinesGeneric(o) : []
              const sub = joinNice([
                L.name,
                L.contract ? `Contrato: ${L.contract}` : '',
              ])
              return (
                <div
                  key={oid}
                  className="vrm-delivery-card"
                  onClick={() => o && onViewOrder(o)}
                >
                  <div className="vrm-delivery-index">{i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="vrm-delivery-client">{getClientName(o) || '—'}</div>
                    {sub && <div className="vrm-delivery-location">{sub}</div>}
                    {L.addr && <div className="vrm-delivery-addr">{L.addr}</div>}
                    {o && <div className="vrm-delivery-date">{fmtDate(o.date)}</div>}
                    {lines.length > 0 && (
                      <div className="vrm-delivery-items">
                        {lines.slice(0, 3).map((l, idx) => (
                          <span key={idx} className="vrm-item-chip">{l.name} ×{l.qty}</span>
                        ))}
                        {lines.length > 3 && <span className="vrm-item-chip vrm-item-more">+{lines.length - 3} mais</span>}
                      </div>
                    )}
                  </div>
                  <div className="vrm-delivery-arrow">›</div>
                </div>
              )
            })}
          </div>
        </div>
        <div className="modal-actions" style={{ padding: '12px 20px', gap: 10 }}>
          <button className="btn-secondary btn-icon" onClick={onPrint} title="Imprimir / Guardar como PDF">
            🖨️ PDF
          </button>
          <button
            className="btn"
            onClick={onEdit}
            disabled={!canEdit}
            title={!canEdit ? 'Sem permissão para editar' : undefined}
          >
            Editar rota
          </button>
          <button
            className="btn-danger"
            onClick={onDelete}
            disabled={!canEdit || deleteLoading}
            title={!canEdit ? 'Sem permissão para eliminar' : undefined}
          >
            {deleteLoading ? 'A eliminar…' : 'Eliminar rota'}
          </button>
        </div>
      </div>
    </div>
  )
}
