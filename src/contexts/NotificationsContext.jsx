/**
 * NotificationsContext.jsx
 * Sistema de notificações derivadas das orders em tempo real.
 * Filtra por permissões do utilizador.
 * Guarda notificações lidas no LocalStorage.
 */

import { createContext, useContext, useMemo, useCallback, useState, useEffect } from 'react'
import { useOrders } from '../hooks/useOrders'
import { useAuth } from './AuthProvider'
import { usePermissions } from '../hooks/usePermissions'
import { isCancelledStatus, isDeliveredStatus, isBulkSubOrder, isBulkBatchOrder } from '../lib/orderHelpers'

const NotificationsContext = createContext(null)

const STORAGE_KEY = 'platcloude_read_notifications'
const MAX_NOTIFICATIONS = 50

// Carregar notificações lidas do localStorage
function loadReadNotifications() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

// Guardar notificações lidas no localStorage
function saveReadNotifications(ids) {
  try {
    // Limitar a 200 para não encher o localStorage
    const limited = ids.slice(-200)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(limited))
  } catch (e) {
    console.warn('Erro ao guardar notificações:', e)
  }
}

export function NotificationsProvider({ children }) {
  const ordersQ = useOrders()
  const orders = useMemo(() => ordersQ.data || [], [ordersQ.data])
  const { profile } = useAuth()
  const { can } = usePermissions()
  
  const [readIds, setReadIds] = useState(() => loadReadNotifications())

  // Guardar no localStorage quando muda
  useEffect(() => {
    saveReadNotifications(readIds)
  }, [readIds])

  // Gerar notificações a partir das orders (filtradas por permissão)
  const allNotifications = useMemo(() => {
    const now = Date.now()
    const today = new Date().toISOString().slice(0, 10)
    const notifications = []
    
    const role = profile?.role
    const userId = profile?.id
    const userClientId = profile?.clientId // Para clientes

    // Filtrar orders baseado no role
    let relevantOrders = orders.filter(o => 
      !isDeliveredStatus(o.status) && 
      !isCancelledStatus(o.status) && 
      !isBulkSubOrder(o) && 
      !isBulkBatchOrder(o)
    )

    // Cliente só vê as suas encomendas
    if (role === 'cliente' && userClientId) {
      relevantOrders = relevantOrders.filter(o => o.clientId === userClientId)
    }

    // Motorista só vê as suas rotas (se tiver routeId atribuído)
    if (role === 'motorista' && userId) {
      relevantOrders = relevantOrders.filter(o => 
        o.driverId === userId || o.status === 'ROTA'
      )
    }

    for (const order of relevantOrders) {
      const orderId = order.id
      const orderNo = order.orderNo || orderId?.slice(-6)
      const clientName = order.clientName || 'Cliente'

      // 🔴 Atrasadas - admin, gestor, rotas
      if (order.date && (can('routes.view') || role === 'admin' || role === 'gestor')) {
        const deliveryDate = new Date(order.date + 'T23:59:59').getTime()
        if (deliveryDate < now) {
          const daysLate = Math.ceil((now - deliveryDate) / (1000 * 60 * 60 * 24))
          notifications.push({
            id: `atrasada_${orderId}`,
            type: 'danger',
            icon: '⚠️',
            title: 'Encomenda atrasada',
            message: `#${orderNo} - ${clientName} (${daysLate} dia${daysLate > 1 ? 's' : ''})`,
            orderId,
            priority: 1,
            route: '/pipeline',
            createdAt: order.date
          })
        }
      }

      // 🟡 Em espera há mais de 24h - admin, gestor, armazém
      if (order.status === 'ESPERA' && order.createdAt && (can('warehouse.view') || role === 'admin' || role === 'gestor')) {
        const created = new Date(order.createdAt).getTime()
        const hoursWaiting = (now - created) / (1000 * 60 * 60)
        if (hoursWaiting > 24) {
          notifications.push({
            id: `espera_${orderId}`,
            type: 'warning',
            icon: '⏳',
            title: 'Espera prolongada',
            message: `#${orderNo} - ${clientName} há ${Math.floor(hoursWaiting)}h`,
            orderId,
            priority: 2,
            route: '/armazem',
            createdAt: order.createdAt
          })
        }
      }

      // 🔵 Com faltas - admin, gestor, compras
      if (order.status === 'FALTAS' && (can('purchases.view') || role === 'admin' || role === 'gestor')) {
        const faltasCount = (order.items || []).filter(i => i.fpiStatus === 'em_falta').length
        notifications.push({
          id: `faltas_${orderId}`,
          type: 'info',
          icon: '📦',
          title: 'Produtos em falta',
          message: `#${orderNo} - ${clientName} (${faltasCount || '?'} produtos)`,
          orderId,
          priority: 2,
          route: '/compras',
          createdAt: order.updatedAt || order.createdAt
        })
      }

      // � Produtos repostos - notificar armazém quando faltas foram resolvidas
      if (order.status === 'FALTAS' && (can('warehouse.view') || role === 'admin' || role === 'gestor')) {
        const items = order.items || []
        const emFalta = items.filter(i => i.fpiStatus === 'em_falta').length
        const repostos = items.filter(i => i.fpiStatus === 'disponivel' || i.fpiStatus === 'pronto').length
        
        // Se não há mais itens em falta, a encomenda pode avançar
        if (emFalta === 0 && items.length > 0) {
          notifications.push({
            id: `reposto_total_${orderId}`,
            type: 'success',
            icon: '✅',
            title: 'Faltas resolvidas',
            message: `#${orderNo} - ${clientName} pronto para preparar`,
            orderId,
            priority: 1,
            route: '/armazem',
            createdAt: order.updatedAt || order.createdAt
          })
        }
        // Se alguns foram repostos mas ainda há faltas
        else if (repostos > 0 && emFalta > 0) {
          notifications.push({
            id: `reposto_parcial_${orderId}`,
            type: 'warning',
            icon: '🔄',
            title: 'Produtos repostos',
            message: `#${orderNo} - ${repostos} reposto${repostos > 1 ? 's' : ''}, falta${emFalta > 1 ? 'm' : ''} ${emFalta}`,
            orderId,
            priority: 2,
            route: '/armazem',
            createdAt: order.updatedAt || order.createdAt
          })
        }
      }

      // �🟢 Entregas para hoje - admin, gestor, rotas, armazém, motorista
      if (order.date === today && order.status !== 'ROTA' && 
          (can('routes.view') || can('warehouse.view') || role === 'admin' || role === 'gestor' || role === 'motorista')) {
        notifications.push({
          id: `hoje_${orderId}`,
          type: 'reminder',
          icon: '📅',
          title: 'Entrega hoje',
          message: `#${orderNo} - ${clientName}`,
          orderId,
          priority: 3,
          route: '/pipeline',
          createdAt: order.date
        })
      }

      // 🟣 Para clientes - estado da sua encomenda
      if (role === 'cliente') {
        // Notificar se está em ROTA
        if (order.status === 'ROTA') {
          notifications.push({
            id: `rota_${orderId}`,
            type: 'reminder',
            icon: '🚚',
            title: 'Em entrega',
            message: `#${orderNo} está a caminho`,
            orderId,
            priority: 1,
            route: '/cliente',
            createdAt: order.updatedAt || order.createdAt
          })
        }
      }
    }

    // Ordenar por prioridade e limitar
    return notifications
      .sort((a, b) => a.priority - b.priority)
      .slice(0, MAX_NOTIFICATIONS)
  }, [orders, profile, can])

  // Filtrar as não lidas
  const unreadNotifications = useMemo(() => {
    return allNotifications.filter(n => !readIds.includes(n.id))
  }, [allNotifications, readIds])

  // Marcar como lida
  const markAsRead = useCallback((notificationId) => {
    setReadIds(prev => {
      if (prev.includes(notificationId)) return prev
      return [...prev, notificationId]
    })
  }, [])

  // Marcar todas como lidas
  const markAllAsRead = useCallback(() => {
    const allIds = allNotifications.map(n => n.id)
    setReadIds(prev => {
      const newIds = [...new Set([...prev, ...allIds])]
      return newIds
    })
  }, [allNotifications])

  // Limpar notificações antigas do localStorage (que já não existem)
  useEffect(() => {
    const currentIds = new Set(allNotifications.map(n => n.id))
    setReadIds(prev => {
      const cleaned = prev.filter(id => {
        // Manter se ainda existe OU se foi lido há menos de 7 dias
        // Para simplificar, mantemos todas as que ainda existem
        return currentIds.has(id) || prev.length < 100
      })
      return cleaned.length !== prev.length ? cleaned : prev
    })
  }, [allNotifications])

  const value = {
    notifications: unreadNotifications,
    allNotifications,
    unreadCount: unreadNotifications.length,
    markAsRead,
    markAllAsRead,
    isLoading: ordersQ.isLoading
  }

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  )
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext)
  if (!ctx) {
    throw new Error('useNotifications must be used within NotificationsProvider')
  }
  return ctx
}
