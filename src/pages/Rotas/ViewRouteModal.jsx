import { getClientName, getLocationInfo, joinNice } from '../../lib/orderHelpers'
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
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Resumo da rota</h3>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="grid" style={{ gap: 8, gridTemplateColumns: 'repeat(12,1fr)' }}>
            <div className="span-3"><div className="chip">Data: {fmtDate(route.date)}</div></div>
            <div className="span-3"><div className="chip">Veículo: {route.vehicle}</div></div>
            <div className="span-3"><div className="chip">Motorista: {route.driverName}</div></div>
            <div className="span-3"><div className="chip">Hora: {route.startTime || '—:—'}</div></div>
            {route.notes && (
              <div className="span-12">
                <small className="muted">Obs: {route.notes}</small>
              </div>
            )}
          </div>

          <div className="hr"></div>

          <h4>Ordem de entrega</h4>
          <ol className="list-plain">
            {(route.orderIds || []).map((oid, i) => {
              const o = exp.find(x => x.id === oid)
              const L = getLocationInfo(o || {}, { locationsIndex, contractsIndex })
              const sub = joinNice([
                L.name,
                L.addr,
                L.contract ? `Contrato: ${L.contract}` : '',
                o ? fmtDate(o.date) : ''
              ])
              return (
                <li
                  key={oid}
                  className="route-list-item clickable"
                  onClick={() => o && onViewOrder(o)}
                >
                  <span className="index">{i + 1}</span>
                  <div className="info">
                    <div className="title">{getClientName(o) || '—'}</div>
                    <div className="sub muted">{sub || '—'}</div>
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
        <div className="modal-actions">
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
