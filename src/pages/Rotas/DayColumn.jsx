import { fmtDate } from '../../lib/utils'

export const DayColumn = ({ dayISO, idx, weekdays, routesByDay, onSelectRoute }) => {
  const dayRoutes = routesByDay[dayISO] || []
  const nice = `${weekdays[idx]} • ${fmtDate(dayISO)}`

  return (
    <div className="span-12 card" style={{ padding: 10 }}>
      <div className="toolbar">
        <strong>{nice}</strong>
        <span className="kpi">
          <span className="chip">Rotas: {dayRoutes.length}</span>
        </span>
      </div>
      <div className="grid" style={{ gap: 8 }}>
        {dayRoutes.map((r) => (
          <button
            key={r.id}
            className="span-4 card route-card"
            style={{ padding: 10, textAlign: 'left' }}
            onClick={() => onSelectRoute(r)}
          >
            <div className="toolbar" style={{ margin: 0 }}>
              <div>
                <strong>{r.vehicle}</strong> • {r.driverName}
              </div>
              <span className="badge cold">{r.startTime || '—:—'}</span>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              {r.orderIds?.length || 0} encomendas • {r.status || 'PLANNED'}
            </div>
            {r.notes && (
              <div style={{ marginTop: 6, fontSize: 12 }}>
                {r.notes}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
