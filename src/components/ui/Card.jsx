/**
 * Card Component
 * Componente base para cards em toda a aplicação
 */

import { forwardRef } from 'react'
import { useTheme } from '../../theme'

const Card = forwardRef(({ 
  children, 
  padding = 'lg',
  hover = false,
  onClick,
  className = '',
  style = {},
  ...props 
}, ref) => {
  const { theme, spacing } = useTheme()
  
  const paddingMap = {
    none: '0',
    sm: spacing.sm,
    md: spacing.md,
    lg: spacing.lg,
    xl: spacing.xl,
    '2xl': spacing['2xl'],
  }
  
  const baseStyle = {
    background: theme.card,
    borderRadius: '12px',
    border: `1px solid ${theme.border}`,
    padding: paddingMap[padding] || padding,
    transition: 'all 0.2s ease',
    ...(onClick && { cursor: 'pointer' }),
    ...style,
  }
  
  const handleMouseEnter = (e) => {
    if (hover || onClick) {
      e.currentTarget.style.transform = 'translateY(-2px)'
      e.currentTarget.style.borderColor = theme.borderHover
    }
  }
  
  const handleMouseLeave = (e) => {
    if (hover || onClick) {
      e.currentTarget.style.transform = 'translateY(0)'
      e.currentTarget.style.borderColor = theme.border
    }
  }
  
  return (
    <div
      ref={ref}
      className={`ui-card ${className}`}
      style={baseStyle}
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...props}
    >
      {children}
    </div>
  )
})

Card.displayName = 'Card'

export default Card
