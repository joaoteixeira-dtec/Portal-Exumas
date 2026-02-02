/**
 * StatCard Component
 * Card para mostrar KPIs e estatísticas
 */

import { forwardRef } from 'react'
import { useTheme } from '../../theme'

const StatCard = forwardRef(({
  title,
  value,
  subtitle,
  icon,
  color,           // Cor de destaque (primary, success, danger, info, etc.)
  trend,           // { value: 10, direction: 'up' | 'down' }
  onClick,
  className = '',
  style = {},
  ...props
}, ref) => {
  const { theme } = useTheme()
  
  // Mapear cor para valor do tema
  const colorMap = {
    primary: theme.primary,
    success: theme.success,
    danger: theme.danger,
    warning: theme.warning,
    info: theme.info,
    purple: theme.purple,
    cyan: theme.cyan,
  }
  
  const accentColor = colorMap[color] || color || theme.primary
  
  const baseStyle = {
    background: theme.card,
    borderRadius: '12px',
    padding: '20px',
    border: `1px solid ${theme.border}`,
    cursor: onClick ? 'pointer' : 'default',
    transition: 'all 0.2s ease',
    position: 'relative',
    overflow: 'hidden',
    minWidth: 0,
    ...style,
  }
  
  const handleMouseEnter = (e) => {
    if (onClick) {
      e.currentTarget.style.transform = 'translateY(-2px)'
    }
  }
  
  const handleMouseLeave = (e) => {
    if (onClick) {
      e.currentTarget.style.transform = 'translateY(0)'
    }
  }
  
  return (
    <div
      ref={ref}
      className={`ui-stat-card ${className}`}
      style={baseStyle}
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...props}
    >
      {/* Decorative gradient circle */}
      <div style={{
        position: 'absolute',
        top: '-20px',
        right: '-20px',
        width: '80px',
        height: '80px',
        borderRadius: '50%',
        background: `radial-gradient(circle, ${accentColor}20 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />
      
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '8px', 
        marginBottom: '12px' 
      }}>
        {icon && <span style={{ fontSize: '16px' }}>{icon}</span>}
        <span style={{ 
          fontSize: '11px', 
          color: theme.textDim, 
          textTransform: 'uppercase', 
          letterSpacing: '0.5px',
          fontWeight: 500,
        }}>
          {title}
        </span>
      </div>
      
      {/* Value */}
      <div style={{ 
        fontSize: '32px', 
        fontWeight: 700, 
        color: accentColor,
        lineHeight: 1,
        marginBottom: (subtitle || trend) ? '8px' : 0,
      }}>
        {value}
      </div>
      
      {/* Footer */}
      {(subtitle || trend) && (
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '8px', 
          marginTop: '4px' 
        }}>
          {subtitle && (
            <span style={{ fontSize: '12px', color: theme.textDim }}>
              {subtitle}
            </span>
          )}
          {trend && (
            <span style={{
              fontSize: '11px',
              fontWeight: 600,
              color: trend.direction === 'up' ? theme.success : theme.danger,
              padding: '2px 6px',
              background: trend.direction === 'up' ? theme.successBg : theme.dangerBg,
              borderRadius: '4px',
            }}>
              {trend.direction === 'up' ? '↑' : '↓'} {Math.abs(trend.value)}%
            </span>
          )}
        </div>
      )}
      
      {/* Subtle icon in corner */}
      {icon && (
        <div style={{
          position: 'absolute',
          bottom: '12px',
          right: '16px',
          fontSize: '20px',
          opacity: 0.15,
        }}>
          {icon}
        </div>
      )}
    </div>
  )
})

StatCard.displayName = 'StatCard'

export default StatCard
