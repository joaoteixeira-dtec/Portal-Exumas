import { useOrders } from '../hooks/useOrders'
import { useAuth } from '../contexts/AuthProvider'
import { carrierLabel, fmtDate, statusBadge } from '../lib/utils'
export default function Cliente(){
  const { user } = useAuth()
  const my = (useOrders().data||[]).filter(o=>o.clientId===user?.uid || o.clientId===user?.id)
  return (<div className="grid"><div className="span-8 card"><div className="toolbar"><h3>As minhas encomendas</h3></div>
    <table className="table"><thead><tr><th>Data</th><th>Contrato</th><th>Local</th><th>Estado</th><th>Transporte</th></tr></thead><tbody>
      {my.map(o=>(<tr key={o.id}><td>{fmtDate(o.date)}</td><td>{o.contractId}</td><td>{o.locationId}</td><td dangerouslySetInnerHTML={{__html: statusBadge(o)}} /><td dangerouslySetInnerHTML={{__html: carrierLabel(o.carrier)}} /></tr>))}
    </tbody></table></div></div>)
}
