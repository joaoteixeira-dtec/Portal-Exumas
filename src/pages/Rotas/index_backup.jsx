import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { db } from '../../lib/firebase'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { useOrders } from '../../hooks/useOrders'
import { usePermissions } from '../../hooks/usePermissions'
import { fmtDate } from '../../lib/utils'
import { toISODate, addDays, startOfWeek } from '../../lib/orderHelpers'
import { useLocationsIndex, useContractsIndex } from '../../lib/useFirestoreIndexes'
import { CARRIERS } from '../../config/routes'

export default function Rotas() {
  const { can } = usePermissions()
  const canCreate = can('routes.create')

  const exp = useOrders('A_EXPEDIR').data || []
  const internals = exp.filter(o => o.carrier === CARRIERS.INTERNO && !o.routeId)
  const externals = exp.filter(o => (o.carrier === CARRIERS.SANTOS || o.carrier === CARRIERS.STEFF) && !o.pickupId)

  const [baseDate, setBaseDate] = useState(() => toISODate(new Date()))
  const weekStart = startOfWeek(baseDate)

  return (
    <div className="grid">
      <div className="span-12 card">
        <div className="toolbar">
          <h3 style={{ margin: 0 }}>Rotas & Recolhas</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn" disabled={!canCreate}>
              Criar rota
            </button>
            <button className="btn-secondary" disabled={!canCreate}>
              Criar recolha
            </button>
            <div className="badge blue">
              Disponíveis: {internals.length} internas • {externals.length} externas
            </div>
          </div>
        </div>
      </div>

      <div className="span-12 card">
        <div className="toolbar">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn-secondary" onClick={() => setBaseDate(toISODate(addDays(weekStart, -7)))}>
              &larr; Semana anterior
            </button>
            <button className="btn-secondary" onClick={() => setBaseDate(toISODate(new Date()))}>
              Hoje
            </button>
            <button className="btn-secondary" onClick={() => setBaseDate(toISODate(addDays(weekStart, 7)))}>
              Próxima semana &rarr;
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="badge blue">Semana {fmtDate(baseDate)}</span>
          </div>
        </div>
      </div>

      <div className="span-12" style={{ padding: 20, textAlign: 'center', color: '#666' }}>
        <p>A funcionalidade de Rotas está sendo otimizada...</p>
        <p><small>Recarregue a página para atualizar</small></p>
      </div>
    </div>
  )
}
