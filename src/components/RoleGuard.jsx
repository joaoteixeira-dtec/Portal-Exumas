import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthProvider'
export default function RoleGuard({ allow=[], children }){
  const { loading, profile } = useAuth()
  if(loading) return <div className="container"><div className="card">A carregar…</div></div>
  if(!profile || (allow.length && !allow.includes(profile.role))) return <Navigate to="/login" replace/>
  return children
}
