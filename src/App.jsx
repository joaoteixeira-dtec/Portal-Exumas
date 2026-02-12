/**
 * App.jsx
 * Aplicação principal com routing e layout.
 */

import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthProvider'
import { NotificationsProvider } from './contexts/NotificationsContext'
import { WarehouseProvider } from './contexts/WarehouseContext'
import { getDefaultRoute } from './config/navigation'

// Layout
import AppLayout from './components/AppLayout'

// Páginas públicas
import Login from './pages/Login'

// Páginas principais
import Dashboard from './pages/Dashboard'
import PipelinePage from './pages/PipelinePage'
import NewOrderPage from './pages/NewOrderPage'
import ClientsPage from './pages/ClientsPage'
import DeliveriesPage from './pages/DeliveriesPage'

// Páginas existentes (mantidas)
import Admin from './pages/Admin'
import Gestor from './pages/Gestor'
import Cliente from './pages/Cliente'
import Armazem from './pages/Armazem'
import Compras from './pages/Compras'
import Faturacao from './pages/Faturacao'
import Rotas from './pages/Rotas'
import Motorista from './pages/Motorista'

// ==================== ROUTE GUARD ====================

function ProtectedRoute({ children, allowedRoles }) {
  const { profile, loading } = useAuth()

  if (loading) {
    return <div className="loading-screen">A carregar...</div>
  }

  if (!profile) {
    return <Navigate to="/login" replace />
  }

  // Se allowedRoles definido, verifica acesso
  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    // Redireciona para a rota padrão do role
    return <Navigate to={getDefaultRoute(profile.role)} replace />
  }

  return children
}

// ==================== APP ====================

export default function App() {
  const { profile } = useAuth()

  return (
    <Routes>
      {/* Rota pública */}
      <Route path="/login" element={<Login />} />

      {/* Redirect raiz */}
      <Route 
        path="/" 
        element={
          profile 
            ? <Navigate to={getDefaultRoute(profile.role)} replace /> 
            : <Navigate to="/login" replace />
        } 
      />

      {/* Rotas protegidas com layout */}
      <Route 
        element={
          <ProtectedRoute>
            <NotificationsProvider>
              <WarehouseProvider>
                <AppLayout />
              </WarehouseProvider>
            </NotificationsProvider>
          </ProtectedRoute>
        }
      >
        {/* Dashboard */}
        <Route path="/dashboard" element={<Dashboard />} />

        {/* Operações */}
        <Route path="/pipeline" element={<PipelinePage />} />
        <Route path="/nova-encomenda" element={<NewOrderPage />} />

        {/* Armazém */}
        <Route path="/armazem" element={<Armazem />} />
        <Route path="/compras" element={<Compras />} />

        {/* Logística */}
        <Route path="/rotas" element={<Rotas />} />
        <Route path="/entregas" element={<DeliveriesPage />} />

        {/* Financeiro */}
        <Route path="/faturacao" element={<Faturacao />} />

        {/* Clientes */}
        <Route path="/clientes" element={<ClientsPage />} />

        {/* Admin */}
        <Route 
          path="/admin/*" 
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <Admin />
            </ProtectedRoute>
          } 
        />

        {/* Compatibilidade com rotas antigas */}
        <Route path="/gestor" element={<Navigate to="/dashboard" replace />} />
        <Route path="/motorista" element={<Navigate to="/entregas" replace />} />
      </Route>

      {/* Cliente (layout diferente) */}
      <Route 
        path="/cliente" 
        element={
          <ProtectedRoute allowedRoles={['cliente']}>
            <Cliente />
          </ProtectedRoute>
        } 
      />

      {/* 404 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
