/**
 * Avatar Component
 * Avatar com iniciais ou imagem
 */

import { forwardRef } from 'react'
import { useTheme } from '../../theme'

// Helper para extrair iniciais
function getInitials(name) {
  if (!name) return '?'
  return name
    .split(' ')
    .map(word => word[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

const Avatar = forwardRef(({
  name,
  src,
  size = 'md',        // xs | sm | md | lg | xl
  color,              // Cor de fundo (auto-gerada se não especificada)
  className = '',
  style = {},
  ...props
}, ref) => {
  const { theme } = useTheme()
  
  // Tamanhos
  const sizes = {
    xs: { size: '24px', fontSize: '10px' },
    sm: { size: '32px', fontSize: '12px' },
    md: { size: '40px', fontSize: '14px' },
    lg: { size: '48px', fontSize: '16px' },
    xl: { size: '64px', fontSize: '20px' },
  }
  
  // Gerar cor baseada no nome (consistente)
  const generateColor = (str) => {
    const colors = [
      theme.primary,
      theme.info,
      theme.success,
      theme.purple,
      theme.cyan,
      theme.warning,
    ]
    
    if (!str) return colors[0]
    
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash)
    }
    
    return colors[Math.abs(hash) % colors.length]
  }
  
  const sizeStyle = sizes[size] || sizes.md
  const bgColor = color || generateColor(name)
  const initials = getInitials(name)
  
  const baseStyle = {
    width: sizeStyle.size,
    height: sizeStyle.size,
    minWidth: sizeStyle.size,
    borderRadius: '50%',
    background: src ? 'transparent' : bgColor,
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: sizeStyle.fontSize,
    fontWeight: 600,
    overflow: 'hidden',
    ...style,
  }
  
  return (
    <div
      ref={ref}
      className={`ui-avatar ${className}`}
      style={baseStyle}
      title={name}
      {...props}
    >
      {src ? (
        <img 
          src={src} 
          alt={name} 
          style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
        />
      ) : (
        initials
      )}
    </div>
  )
})

Avatar.displayName = 'Avatar'

export default Avatar
