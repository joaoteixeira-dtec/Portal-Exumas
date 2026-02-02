/**
 * Sidebar.jsx
 * Menu lateral com navegação baseada em permissões.
 */

import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthProvider'
import { getNavigationForUser } from '../config/navigation'

export default function Sidebar({ collapsed, onToggle }) {
  const { profile } = useAuth()
  const location = useLocation()
  const [expandedGroups, setExpandedGroups] = useState({})

  const role = profile?.role
  const customPermissions = profile?.customPermissions || []
  
  // Obtém navegação filtrada por permissões
  const navigation = getNavigationForUser(role, customPermissions)

  const toggleGroup = (groupId) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }))
  }

  // Auto-expand group se um child está ativo
  const isChildActive = (children) => {
    return children?.some(child => location.pathname === child.path)
  }

  const isGroupExpanded = (group) => {
    if (expandedGroups[group.id] !== undefined) {
      return expandedGroups[group.id]
    }
    return isChildActive(group.children)
  }

  if (!role || role === 'cliente') return null

  return (
    <aside className={`sidebar-unified ${collapsed ? 'sidebar-unified--collapsed' : ''}`}>
      <nav className="sidebar__nav">
        {navigation.map(item => {
          // Item simples (sem children)
          if (!item.children) {
            const isReadOnly = item.accessLevel === 'view'
            return (
              <NavLink
                key={item.id}
                to={item.path}
                className={({ isActive }) => 
                  `sidebar__item ${isActive ? 'sidebar__item--active' : ''} ${isReadOnly ? 'sidebar__item--readonly' : ''}`
                }
                title={collapsed ? item.label : undefined}
              >
                <span className="sidebar__icon">{item.icon}</span>
                {!collapsed && (
                  <>
                    <span className="sidebar__label">{item.label}</span>
                    {isReadOnly && <span className="sidebar__badge" title="Só visualização">👁</span>}
                  </>
                )}
              </NavLink>
            )
          }

          // Grupo com children
          const isExpanded = isGroupExpanded(item)
          const hasActiveChild = isChildActive(item.children)

          return (
            <div key={item.id} className="sidebar__group">
              <button
                className={`sidebar__group-header ${hasActiveChild ? 'sidebar__group-header--active' : ''}`}
                onClick={() => toggleGroup(item.id)}
                title={collapsed ? item.label : undefined}
              >
                <span className="sidebar__icon">{item.icon}</span>
                {!collapsed && (
                  <>
                    <span className="sidebar__label">{item.label}</span>
                    <span className={`sidebar__arrow ${isExpanded ? 'sidebar__arrow--expanded' : ''}`}>
                      ›
                    </span>
                  </>
                )}
              </button>

              {!collapsed && isExpanded && (
                <div className="sidebar__children">
                  {item.children.map(child => {
                    const isReadOnly = child.accessLevel === 'view'
                    return (
                      <NavLink
                        key={child.id}
                        to={child.path}
                        className={({ isActive }) => 
                          `sidebar__child ${isActive ? 'sidebar__child--active' : ''} ${isReadOnly ? 'sidebar__child--readonly' : ''}`
                        }
                      >
                        <span className="sidebar__child-label">{child.label}</span>
                        {isReadOnly && <span className="sidebar__badge" title="Só visualização">👁</span>}
                      </NavLink>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      <div className="sidebar__footer">
        {!collapsed && (
          <>
            <div className="sidebar__user-info">
              <span className="sidebar__user-role">{getRoleLabel(role)}</span>
            </div>
            <div className="sidebar__version">v0.84</div>
          </>
        )}
      </div>
    </aside>
  )
}

function getRoleLabel(role) {
  const labels = {
    admin: 'Administrador',
    gestor: 'Gestor',
    armazem: 'Armazém',
    compras: 'Compras',
    faturacao: 'Faturação',
    rotas: 'Rotas',
    motorista: 'Motorista',
  }
  return labels[role] || role
}
