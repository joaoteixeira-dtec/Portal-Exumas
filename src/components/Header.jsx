import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthProvider'
import { useNotifications } from '../contexts/NotificationsContext'
import { useTheme } from '../theme'
import logoExumas from '../Logo Exumas - branco.png'

function initialsFrom(nameOrEmail = '') {
  const src = String(nameOrEmail).trim()
  if (!src) return '…'
  const parts = src.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  const beforeAt = src.includes('@') ? src.split('@')[0] : src
  return (beforeAt.slice(0, 2) || 'U').toUpperCase()
}

function roleLabel(role) {
  if (!role) return '—'
  const map = {
    admin: 'Admin',
    gestor: 'Gestor',
    cliente: 'Cliente',
    armazem: 'Armazém',
    compras: 'Compras',
    faturacao: 'Faturação',
    rotas: 'Rotas',
    motorista: 'Motorista',
  }
  return map[role] || role
}

export default function Header({ onToggleSidebar, sidebarCollapsed }) {
  const { profile, logout } = useAuth()
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications()
  const { isDark, toggleTheme, theme } = useTheme()
  const nav = useNavigate()
  
  const [showNotifications, setShowNotifications] = useState(false)
  const dropdownRef = useRef(null)

  const name = profile?.name || profile?.email || 'Utilizador'
  const role = roleLabel(profile?.role)
  const initials = initialsFrom(profile?.name || profile?.email)
  const firstName = String(name).split(' ')[0] || name

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowNotifications(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const onLogout = async () => {
    await logout()
    nav('/login')
  }

  const handleNotificationClick = (notification) => {
    markAsRead(notification.id)
    if (notification.route) {
      nav(notification.route)
    }
    setShowNotifications(false)
  }

  return (
    <header className="header-unified">
      {/* Área da marca integrada com toggle */}
      <div className="header-brand-area">
        <button
          type="button"
          className="sidebar-toggle-btn"
          onClick={onToggleSidebar}
          title={sidebarCollapsed ? 'Expandir menu' : 'Recolher menu'}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12h18M3 6h18M3 18h18" />
          </svg>
        </button>
        
        <div className="brand-unified">
          <img 
            src={logoExumas} 
            alt="Exumas Group" 
            style={{ 
              height: '32px', 
              width: 'auto', 
              objectFit: 'contain',
              filter: isDark ? 'none' : 'invert(1)'  // Inverter para modo claro
            }}
          />
          <div className="brand-info">
            <span className="brand-product">Portal de Operações</span>
          </div>
        </div>
      </div>

      {/* Área do utilizador */}
      <div className="header-user-area">
        {/* Theme Toggle */}
        <button
          type="button"
          className="theme-toggle-btn"
          onClick={toggleTheme}
          title={isDark ? 'Mudar para modo claro' : 'Mudar para modo escuro'}
          style={{
            background: 'transparent',
            border: `1px solid ${theme.border}`,
            borderRadius: '8px',
            padding: '8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: theme.textDim,
            transition: 'all 0.2s ease',
          }}
        >
          <span style={{ fontSize: '16px' }}>
            {isDark ? '🌙' : '☀️'}
          </span>
        </button>

        {/* Notificações */}
        <div className="notifications-wrapper" ref={dropdownRef}>
          <button
            type="button"
            className={`notifications-btn ${unreadCount > 0 ? 'has-unread' : ''}`}
            onClick={() => setShowNotifications(!showNotifications)}
            title={`${unreadCount} notificações`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
            </svg>
            {unreadCount > 0 && (
              <span className="notifications-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
            )}
          </button>

          {showNotifications && (
            <div className="notifications-dropdown">
              <div className="notifications-header">
                <span>Notificações</span>
                {unreadCount > 0 && (
                  <button 
                    className="notifications-mark-all"
                    onClick={() => markAllAsRead()}
                  >
                    Marcar todas como lidas
                  </button>
                )}
              </div>
              
              <div className="notifications-list">
                {notifications.length > 0 ? (
                  notifications.map(n => (
                    <div
                      key={n.id}
                      className={`notification-item notification-item--${n.type}`}
                      onClick={() => handleNotificationClick(n)}
                    >
                      <span className="notification-icon">{n.icon}</span>
                      <div className="notification-content">
                        <span className="notification-title">{n.title}</span>
                        <span className="notification-message">{n.message}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="notifications-empty">
                    <span>✅</span>
                    <p>Sem notificações</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="user-profile">
          <div className="user-details">
            <span className="user-name">{firstName}</span>
            <span className={`user-role role-${(profile?.role || '').toLowerCase()}`}>{role}</span>
          </div>
          <div className="user-avatar">{initials}</div>
        </div>

        <button
          type="button"
          className="btn-logout"
          onClick={onLogout}
          title="Terminar sessão"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
          </svg>
        </button>
      </div>
    </header>
  )
}
