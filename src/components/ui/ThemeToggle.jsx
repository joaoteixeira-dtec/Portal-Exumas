/**
 * ThemeToggle Component
 * Botão para alternar entre tema dark e light
 */

import { useTheme } from '../../theme'

export default function ThemeToggle({ className = '', style = {} }) {
  const { isDark, toggleTheme, theme } = useTheme()
  
  return (
    <button
      onClick={toggleTheme}
      className={`ui-theme-toggle ${className}`}
      title={isDark ? 'Mudar para modo claro' : 'Mudar para modo escuro'}
      style={{
        background: 'transparent',
        border: `1px solid ${theme.border}`,
        borderRadius: '8px',
        padding: '8px 12px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        color: theme.textDim,
        fontSize: '13px',
        transition: 'all 0.2s ease',
        ...style,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = theme.primary
        e.currentTarget.style.color = theme.text
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = theme.border
        e.currentTarget.style.color = theme.textDim
      }}
    >
      <span style={{ fontSize: '16px' }}>
        {isDark ? '🌙' : '☀️'}
      </span>
      <span>{isDark ? 'Escuro' : 'Claro'}</span>
    </button>
  )
}
