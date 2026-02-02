/**
 * NewOrderPage.jsx
 * Página standalone para criação de encomendas.
 */

import { useNavigate } from 'react-router-dom'
import { useClients } from '../hooks/useCommon'
import { useAuth } from '../contexts/AuthProvider'
import OrderForm from './Gestor/components/OrderForm'

export default function NewOrderPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const clientsAll = useClients().data || []

  const activeClients = clientsAll.filter(
    u => u.role === 'cliente' && String(u.active) !== 'false'
  )

  return (
    <div className="new-order-page">
      {/* Header moderno */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '24px'
      }}>
        <div>
          <h1 style={{ 
            margin: 0, 
            fontSize: '28px',
            background: 'linear-gradient(135deg, #f9fafb 0%, #9ca3af 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <span style={{ fontSize: '32px' }}>➕</span> Nova Encomenda
          </h1>
          <p style={{ margin: '4px 0 0', color: 'var(--ui-text-dim)', fontSize: '14px' }}>
            Criar encomenda individual ou pedido em massa
          </p>
        </div>
      </div>

      <OrderForm
        clients={activeClients}
        profile={profile}
        onCreated={() => {
          navigate('/pipeline')
        }}
      />
    </div>
  )
}
