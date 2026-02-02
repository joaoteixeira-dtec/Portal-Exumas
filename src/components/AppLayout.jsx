/**
 * AppLayout.jsx
 * Layout principal da aplicação com Header e Sidebar.
 */

import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Header from './Header'
import Sidebar from './Sidebar'
import { useAuth } from '../contexts/AuthProvider'

export default function AppLayout() {
  const { profile } = useAuth()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const toggleSidebar = () => setSidebarCollapsed(!sidebarCollapsed)

  // Cliente tem layout diferente (sem sidebar)
  const isClient = profile?.role === 'cliente'

  if (isClient) {
    return (
      <div className="layout-unified layout-unified--client">
        <Header />
        <main className="layout-main layout-main--full">
          <Outlet />
        </main>
      </div>
    )
  }

  return (
    <div className={`layout-unified ${sidebarCollapsed ? 'layout-unified--collapsed' : ''}`}>
      <Header 
        onToggleSidebar={toggleSidebar}
        sidebarCollapsed={sidebarCollapsed}
      />
      <div className="layout-body">
        <Sidebar 
          collapsed={sidebarCollapsed} 
          onToggle={toggleSidebar} 
        />
        <main className="layout-main">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
