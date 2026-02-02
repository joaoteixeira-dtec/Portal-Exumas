/**
 * UI Components reutilizáveis
 */

import { useState } from 'react'

// Export dos novos componentes do sistema de temas (com prefixo Themed para evitar conflitos)
export { default as ThemedCard } from './Card'
export { default as ThemedButton } from './Button'
export { default as ThemedBadge } from './Badge'
export { default as ThemedStatCard } from './StatCard'
export { default as Avatar } from './Avatar'
export { default as ThemeToggle } from './ThemeToggle'

// ==================== MODAL ====================

export function Modal({ open, onClose, title, children, maxWidth = 900 }) {
  if (!open) return null
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(8px)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 60
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: `min(96vw, ${maxWidth}px)`,
          maxHeight: '90vh',
          overflow: 'auto',
          position: 'relative',
          background: '#0d1117',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.8)'
        }}
      >
        <div className="toolbar" style={{ marginTop: 0 }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button className="btn-secondary" onClick={onClose}>Fechar</button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ==================== CONFIRM DIALOG ====================

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmText = 'Confirmar', cancelText = 'Cancelar', danger = false }) {
  if (!open) return null
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(8px)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 70
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ 
          width: 'min(96vw, 400px)', 
          padding: '24px',
          background: '#0d1117',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.8)'
        }}
      >
        <h3 style={{ margin: '0 0 16px' }}>{title}</h3>
        <p style={{ margin: '0 0 24px', color: 'var(--ui-text-dim)' }}>{message}</p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button className="btn-secondary" onClick={onClose}>{cancelText}</button>
          <button
            className={danger ? 'btn-danger' : 'btn'}
            onClick={() => { onConfirm(); onClose() }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

// ==================== TABS ====================

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="tabs" style={{ display: 'flex', gap: '4px', marginBottom: '16px' }}>
      {tabs.map(tab => (
        <button
          key={tab.id}
          className={active === tab.id ? 'btn' : 'btn-secondary'}
          onClick={() => onChange(tab.id)}
          style={{ flex: tab.flex || 'none' }}
        >
          {tab.label}
          {tab.badge != null && (
            <span className="badge" style={{ marginLeft: '8px' }}>{tab.badge}</span>
          )}
        </button>
      ))}
    </div>
  )
}

// ==================== STAT CARD ====================

export function StatCard({ title, value, subtitle, color, icon, trend, onClick }) {
  return (
    <div
      className="stat-card"
      onClick={onClick}
      style={{
        cursor: onClick ? 'pointer' : 'default',
        '--stat-color': color || 'var(--ui-accent)',
      }}
    >
      <div className="stat-card__content">
        <div className="stat-card__label">{title}</div>
        <div className="stat-card__value" style={{ color: color }}>{value}</div>
        {subtitle && <div className="stat-card__subtitle">{subtitle}</div>}
        {trend != null && (
          <div className={`stat-card__trend ${trend > 0 ? 'up' : trend < 0 ? 'down' : ''}`}>
            {trend > 0 ? '↑' : trend < 0 ? '↓' : '—'} {Math.abs(trend)}%
          </div>
        )}
      </div>
      {icon && <div className="stat-card__icon">{icon}</div>}
    </div>
  )
}

// ==================== PROGRESS BAR ====================

export function ProgressBar({ value, max, color = '#3b82f6', height = 8, showLabel = false }) {
  const percent = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div style={{ width: '100%' }}>
      <div
        style={{
          width: '100%',
          height: `${height}px`,
          background: '#e5e7eb',
          borderRadius: `${height / 2}px`,
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            width: `${percent}%`,
            height: '100%',
            background: color,
            transition: 'width 0.3s ease'
          }}
        />
      </div>
      {showLabel && (
        <div style={{ fontSize: '11px', color: '#666', marginTop: '4px', textAlign: 'right' }}>
          {value} / {max} ({percent.toFixed(0)}%)
        </div>
      )}
    </div>
  )
}

// ==================== BADGE ====================

export function Badge({ children, color = 'gray', size = 'normal' }) {
  const colors = {
    gray: { bg: '#f3f4f6', text: '#374151' },
    green: { bg: '#d1fae5', text: '#065f46' },
    red: { bg: '#fee2e2', text: '#991b1b' },
    yellow: { bg: '#fef3c7', text: '#92400e' },
    blue: { bg: '#dbeafe', text: '#1e40af' },
    purple: { bg: '#ede9fe', text: '#5b21b6' },
    orange: { bg: '#ffedd5', text: '#9a3412' },
  }
  const c = colors[color] || colors.gray
  return (
    <span
      style={{
        display: 'inline-block',
        padding: size === 'small' ? '2px 6px' : '4px 10px',
        fontSize: size === 'small' ? '11px' : '12px',
        fontWeight: '500',
        borderRadius: '9999px',
        background: c.bg,
        color: c.text
      }}
    >
      {children}
    </span>
  )
}

// ==================== EMPTY STATE ====================

export function EmptyState({ title, message, action, icon = '📭' }) {
  return (
    <div style={{
      textAlign: 'center',
      padding: '48px 24px',
      color: '#666'
    }}>
      <div style={{ fontSize: '48px', marginBottom: '16px' }}>{icon}</div>
      <h3 style={{ margin: '0 0 8px', color: '#333' }}>{title}</h3>
      <p style={{ margin: '0 0 16px' }}>{message}</p>
      {action}
    </div>
  )
}

// ==================== LOADING SPINNER ====================

export function LoadingSpinner({ size = 24, color = '#3b82f6' }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        border: `3px solid ${color}20`,
        borderTopColor: color,
        borderRadius: '50%',
        animation: 'spin 1s linear infinite'
      }}
    />
  )
}

// ==================== SEARCH INPUT ====================

export function SearchInput({ value, onChange, placeholder = 'Pesquisar...', debounce = 300 }) {
  const [localValue, setLocalValue] = useState(value)
  
  const handleChange = (e) => {
    const val = e.target.value
    setLocalValue(val)
    if (debounce > 0) {
      clearTimeout(handleChange.timer)
      handleChange.timer = setTimeout(() => onChange(val), debounce)
    } else {
      onChange(val)
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        type="text"
        value={localValue}
        onChange={handleChange}
        placeholder={placeholder}
        style={{ paddingLeft: '36px' }}
      />
      <span style={{
        position: 'absolute',
        left: '12px',
        top: '50%',
        transform: 'translateY(-50%)',
        color: '#9ca3af',
        pointerEvents: 'none'
      }}>
        🔍
      </span>
    </div>
  )
}

// ==================== PAGINATION ====================

export function Pagination({ page, totalPages, onChange, pageSize, onPageSizeChange, pageSizeOptions = [12, 25, 50] }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 0',
      borderTop: '1px solid #e5e7eb',
      marginTop: '16px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '13px', color: '#666' }}>Por página:</span>
        <select
          value={pageSize}
          onChange={e => onPageSizeChange(Number(e.target.value))}
          style={{ padding: '4px 8px', fontSize: '13px' }}
        >
          {pageSizeOptions.map(n => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          className="btn-ghost"
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={page <= 1}
        >
          ← Anterior
        </button>
        <span style={{ fontSize: '13px', color: '#666' }}>
          Página {page} de {totalPages}
        </span>
        <button
          className="btn-ghost"
          onClick={() => onChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
        >
          Seguinte →
        </button>
      </div>
    </div>
  )
}

// ==================== TABLE ====================

export function Table({ columns, data, onRowClick, emptyMessage = 'Sem dados', loading = false }) {
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '48px' }}>
        <LoadingSpinner />
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <EmptyState
        title="Sem resultados"
        message={emptyMessage}
        icon="📋"
      />
    )
  }

  return (
    <table className="table">
      <thead>
        <tr>
          {columns.map(col => (
            <th key={col.key} style={col.headerStyle}>{col.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((row, idx) => (
          <tr
            key={row.id || idx}
            onClick={() => onRowClick?.(row)}
            style={{ cursor: onRowClick ? 'pointer' : 'default' }}
          >
            {columns.map(col => (
              <td key={col.key} style={col.cellStyle}>
                {col.render ? col.render(row[col.key], row) : row[col.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
