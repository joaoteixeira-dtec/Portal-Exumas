/**
 * ClientsPage.jsx
 * Página standalone para gestão de clientes.
 */

import { useOrders } from '../hooks/useOrders'
import { useClients } from '../hooks/useCommon'
import { PageGuard } from '../components/PageGuard'
import ClientHub from './Gestor/components/ClientHub'
import { useMemo } from 'react'

export default function ClientsPage() {
  const ordersQ = useOrders()
  const orders = useMemo(() => ordersQ.data || [], [ordersQ.data])
  const clientsAll = useClients().data || []

  const activeClients = clientsAll.filter(
    u => u.role === 'cliente' && String(u.active) !== 'false'
  )

  return (
    <PageGuard requiredPermission="clients.view">
      <div className="clients-page">
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
              backgroundClip: 'text'
            }}>
              👥 Gestão de Clientes
            </h1>
            <p style={{ margin: '4px 0 0', color: 'var(--ui-text-dim)', fontSize: '14px' }}>
              Clientes, contratos e locais de entrega
            </p>
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '8px 16px',
            background: 'rgba(16, 185, 129, 0.1)',
            borderRadius: '20px',
            border: '1px solid rgba(16, 185, 129, 0.2)'
          }}>
            <span style={{ 
              width: '8px', 
              height: '8px', 
              borderRadius: '50%', 
              background: '#10b981',
              animation: 'pulse 2s infinite'
            }} />
            <span style={{ color: '#10b981', fontWeight: 600 }}>
              {activeClients.length} clientes ativos
            </span>
          </div>
        </div>

        <ClientHub
          clients={activeClients}
          orders={orders}
        />
      </div>
    </PageGuard>
  )
}
