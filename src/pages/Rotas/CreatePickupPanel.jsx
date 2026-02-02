import { CARRIERS, CARRIER_NAMES } from '../../config/routes'
import { getClientName, getLocationInfo, joinNice } from '../../lib/orderHelpers'
import { fmtDate } from '../../lib/utils'

export const CreatePickupPanel = ({
  pickupCreation,
  externals,
  locationsIndex,
  contractsIndex
}) => {
  const {
    date, setDate,
    carrier, setCarrier,
    time, setTime,
    location, setLocation,
    selected,
    toggleSelected,
    createPickup
  } = pickupCreation

  const relevantExternals = externals.filter(o => o.carrier === carrier)

  return (
    <div className="grid" style={{ marginTop: 8 }}>
      <div className="span-3">
        <label className="field">
          <span>Data da recolha</span>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
        </label>
      </div>
      <div className="span-3">
        <label className="field">
          <span>Transportadora</span>
          <select value={carrier} onChange={e => setCarrier(e.target.value)}>
            <option value={CARRIERS.SANTOS}>
              {CARRIER_NAMES[CARRIERS.SANTOS]}
            </option>
            <option value={CARRIERS.STEFF}>
              {CARRIER_NAMES[CARRIERS.STEFF]}
            </option>
          </select>
        </label>
      </div>
      <div className="span-3">
        <label className="field">
          <span>Hora prevista de recolha</span>
          <input
            type="time"
            value={time}
            onChange={e => setTime(e.target.value)}
          />
        </label>
      </div>
      <div className="span-3">
        <label className="field">
          <span>Local da recolha</span>
          <input
            value={location}
            onChange={e => setLocation(e.target.value)}
            placeholder="Armazém central, cais 2…"
          />
        </label>
      </div>

      <div className="span-6 card">
        <h4>Encomendas externas disponíveis</h4>
        {relevantExternals.length === 0 && (
          <small className="muted">Sem externas por atribuir nesta transportadora.</small>
        )}
        {relevantExternals.map(o => {
          const L = getLocationInfo(o, { locationsIndex, contractsIndex })
          const checked = selected.includes(o.id)
          return (
            <label
              key={o.id}
              className="toolbar"
              style={{
                justifyContent: 'space-between',
                border: '1px solid var(--line)',
                borderRadius: 12,
                padding: 8,
                margin: '6px 0'
              }}
            >
              <div>
                <strong>{getClientName(o) || 'Cliente'}</strong> • {L.name || L.addr || 'Entrega'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <small className="muted">{fmtDate(o.date)}</small>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleSelected(o.id)}
                />
              </div>
            </label>
          )
        })}
      </div>

      <div className="span-6 card">
        <h4>Resumo da recolha</h4>
        <div className="kpi" style={{ marginBottom: 8 }}>
          <div className="chip">Data: {fmtDate(date)}</div>
          <div className="chip">Transportadora: {CARRIER_NAMES[carrier]}</div>
          <div className="chip">Hora: {time}</div>
          <div className="chip">Local: {location || '—'}</div>
          <div className="chip">Volumes: {selected.length}</div>
        </div>
        <button
          className="btn"
          onClick={() => createPickup.mutate()}
          disabled={createPickup.isPending}
        >
          {createPickup.isPending ? 'A agendar…' : 'Agendar recolha'}
        </button>
      </div>
    </div>
  )
}
