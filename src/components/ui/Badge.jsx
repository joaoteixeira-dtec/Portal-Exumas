/**
 * Badge Component
 * Componente para tags, status e labels
 */

import { forwardRef } from 'react'
import { useTheme } from '../../theme'

const Badge = forwardRef(({
  children,
  variant = 'default',  // default | primary | success | danger | warning | info | purple
  size = 'md',          // sm | md | lg
  pill = false,
  dot = false,
  className = '',
  style = {},
  ...props
}, ref) => {
  const { theme } = useTheme()
  
  // Tamanhos
  const sizes = {
    sm: { padding: '2px 6px', fontSize: '10px' },
    md: { padding: '4px 10px', fontSize: '11px' },
    lg: { padding: '6px 14px', fontSize: '12px' },
  }
  
  // Variantes de cor
  const variants = {
    default: {
      background: theme.bg,
      color: theme.textDim,
      border: theme.border,
    },
    primary: {
      background: theme.primaryBg,
      color: theme.primary,
      border: 'transparent',
    },
    success: {
      background: theme.successBg,
      color: theme.success,
      border: 'transparent',
    },
    danger: {
      background: theme.dangerBg,
      color: theme.danger,
      border: 'transparent',
    },
    warning: {
      background: theme.warningBg,
      color: theme.warning,
      border: 'transparent',
    },
    info: {
      background: theme.infoBg,
      color: theme.info,
      border: 'transparent',
    },
    purple: {
      background: theme.purpleBg,
      color: theme.purple,
      border: 'transparent',
    },
    cyan: {
      background: theme.cyanBg,
      color: theme.cyan,
      border: 'transparent',
    },
  }
  
  const sizeStyle = sizes[size] || sizes.md
  const variantStyle = variants[variant] || variants.default
  
  const baseStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: sizeStyle.padding,
    fontSize: sizeStyle.fontSize,
    fontWeight: 600,
    borderRadius: pill ? '9999px' : '6px',
    background: variantStyle.background,
    color: variantStyle.color,
    border: variantStyle.border !== 'transparent' ? `1px solid ${variantStyle.border}` : 'none',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    lineHeight: 1,
    whiteSpace: 'nowrap',
    ...style,
  }
  
  return (
    <span
      ref={ref}
      className={`ui-badge ${className}`}
      style={baseStyle}
      {...props}
    >
      {dot && (
        <span style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: variantStyle.color,
        }} />
      )}
      {children}
    </span>
  )
})

Badge.displayName = 'Badge'

export default Badge
