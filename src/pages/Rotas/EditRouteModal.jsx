import { FLEET } from '../../config/routes'
import { fmtDate } from '../../lib/utils'
import { OrderCard } from './OrderCard'
import { dragDataGet } from '../../lib/dragDropUtils'

export const EditRouteModal = ({
  routeEdit,
  motoristas,
  locationsIndex,
  contractsIndex,
  internals,
  canEdit
}) => {
  const {
    editRoute, setEditRoute,
    editVehicle, setEditVehicle,
    editDriver, setEditDriver,
    editTime, setEditTime,
    editNotes, setEditNotes,
    editOnlyDay, setEditOnlyDay,
    availableForEdit,
    draftOrdersEdit,
    pushToEdit,
    removeFromEdit,
    moveUpEdit,
    moveDownEdit,
    saveEdit
  } = routeEdit

  return (
    <div className="modal-overlay" onClick={() => setEditRoute(null)}>
      <div className="modal wide" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Editar rota</h3>
          <button className="icon-btn" onClick={() => setEditRoute(null)}>✕</button>
        </div>
        <div className="modal-body">
          <div className="grid" style={{ gap: 8, gridTemplateColumns: 'repeat(12,1fr)' }}>
            <div className="span-3">
              <div className="field">
                <span>Data</span>
                <input type="date" value={editRoute.date} disabled />
              </div>
            </div>
            <div className="span-3">
              <div className="field">
                <span>Veículo</span>
                <select value={editVehicle} onChange={e => setEditVehicle(e.target.value)}>
                  {FLEET.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            </div>
            <div className="span-3">
              <div className="field">
                <span>Motorista</span>
                <select value={editDriver} onChange={e => setEditDriver(e.target.value)}>
                  <option value="">— selecionar —</option>
                  {motoristas.map(m => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
                </select>
              </div>
            </div>
            <div className="span-3">
              <div className="field">
                <span>Hora</span>
                <input type="time" value={editTime} onChange={e => setEditTime(e.target.value)} />
              </div>
            </div>
            <div className="span-12">
              <div className="field">
                <span>Observações</span>
                <textarea rows={2} value={editNotes} onChange={e => setEditNotes(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="hr"></div>

          <div className="grid" style={{ gap: 12 }}>
            <div className="span-6 kanban-col">
              <div className="kanban-head">
                <strong>Encomendas disponíveis</strong>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <label className="inline-group" style={{ fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={editOnlyDay}
                      onChange={e => setEditOnlyDay(e.target.checked)}
                    />
                    <span className="muted">Apenas do dia da rota</span>
                  </label>
                  <span className="kanban-count">{availableForEdit.length}</span>
                </div>
              </div>
              <div className="kanban-body dropzone">
                {availableForEdit.length === 0 && (
                  <div className="drop-hint muted">Sem encomendas.</div>
                )}
                {availableForEdit.map(o => (
                  <OrderCard
                    key={o.id}
                    o={o}
                    source="avail"
                    locationsIndex={locationsIndex}
                    contractsIndex={contractsIndex}
                    onAction={() => pushToEdit(o.id)}
                  />
                ))}
              </div>
            </div>

            <div className="span-6 kanban-col">
              <div className="kanban-head">
                <strong>Rota (ordem de paragens)</strong>
                <span className="kanban-count">{draftOrdersEdit.length}</span>
              </div>
              <div className="kanban-body dropzone">
                {draftOrdersEdit.length === 0 && (
                  <div className="drop-hint">Arraste ou use a seta →</div>
                )}
                {draftOrdersEdit.map(o => (
                  <OrderCard
                    key={o.id}
                    o={o}
                    source="draft"
                    locationsIndex={locationsIndex}
                    contractsIndex={contractsIndex}
                    onAction={() => removeFromEdit(o.id)}
                    onUp={() => moveUpEdit(o.id)}
                    onDown={() => moveDownEdit(o.id)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={() => setEditRoute(null)}>
            Cancelar
          </button>
          <button
            className="btn"
            onClick={() => saveEdit.mutate()}
            disabled={!canEdit || saveEdit.isPending}
          >
            {saveEdit.isPending ? 'A guardar…' : 'Guardar alterações'}
          </button>
        </div>
      </div>
    </div>
  )
}
