/**
 * Button Component
 * Componente base para botões em toda a aplicação
 */

import { forwardRef } from 'react'
import { useTheme } from '../../theme'

const Button = forwardRef(({
  children,
  variant = 'primary',  // primary | secondary | ghost | danger | success
  size = 'md',          // sm | md | lg
  disabled = false,
  loading = false,
  fullWidth = false,
  icon,
  iconRight,
  className = '',
  style = {},
  ...props
}, ref) => {
  const { theme } = useTheme()
  
  // Tamanhos
  const sizes = {
    sm: { padding: '6px 12px', fontSize: '12px', gap: '6px' },
    md: { padding: '10px 18px', fontSize: '13px', gap: '8px' },
    lg: { padding: '12px 24px', fontSize: '14px', gap: '10px' },
  }
  
  // Variantes
  const variants = {
    primary: {
      background: theme.gradientPrimary,
      color: 'white',
      border: 'none',
      hoverTransform: true,
    },
    secondary: {
      background: 'transparent',
      color: theme.text,
      border: `1px solid ${theme.border}`,
      hoverBorder: theme.primary,
    },
    ghost: {
      background: 'transparent',
      color: theme.textDim,
      border: 'none',
      hoverColor: theme.text,
    },
    danger: {
      background: theme.gradientDanger,
      color: 'white',
      border: 'none',
      hoverTransform: true,
    },
    success: {
      background: theme.gradientSuccess,
      color: 'white',
      border: 'none',
      hoverTransform: true,
    },
    info: {
      background: theme.gradientInfo,
      color: 'white',
      border: 'none',
      hoverTransform: true,
    },
  }
  
  const sizeStyle = sizes[size] || sizes.md
  const variantStyle = variants[variant] || variants.primary
  
  const baseStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: sizeStyle.gap,
    padding: sizeStyle.padding,
    fontSize: sizeStyle.fontSize,
    fontWeight: 600,
    borderRadius: '8px',
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    transition: 'all 0.2s ease',
    opacity: disabled ? 0.5 : 1,
    width: fullWidth ? '100%' : 'auto',
    background: variantStyle.background,
    color: variantStyle.color,
    border: variantStyle.border,
    ...style,
  }
  
  const handleMouseEnter = (e) => {
    if (disabled || loading) return
    if (variantStyle.hoverTransform) {
      e.currentTarget.style.transform = 'translateY(-2px)'
      e.currentTarget.style.boxShadow = `0 4px 12px ${theme.primaryBg}`
    }
    if (variantStyle.hoverBorder) {
      e.currentTarget.style.borderColor = variantStyle.hoverBorder
    }
    if (variantStyle.hoverColor) {
      e.currentTarget.style.color = variantStyle.hoverColor
    }
  }
  
  const handleMouseLeave = (e) => {
    if (disabled || loading) return
    e.currentTarget.style.transform = 'translateY(0)'
    e.currentTarget.style.boxShadow = 'none'
    if (variantStyle.hoverBorder) {
      e.currentTarget.style.borderColor = theme.border
    }
    if (variantStyle.hoverColor) {
      e.currentTarget.style.color = variantStyle.color
    }
  }
  
  return (
    <button
      ref={ref}
      className={`ui-button ${className}`}
      style={baseStyle}
      disabled={disabled || loading}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...props}
    >
      {loading && (
        <span style={{
          width: '14px',
          height: '14px',
          border: '2px solid rgba(255,255,255,0.3)',
          borderTopColor: 'white',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }} />
      )}
      {!loading && icon && <span>{icon}</span>}
      {children}
      {!loading && iconRight && <span>{iconRight}</span>}
    </button>
  )
})

Button.displayName = 'Button'

export default Button
