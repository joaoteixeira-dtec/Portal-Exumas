/**
 * ThemeProvider
 * Contexto React que gere o tema atual e injeta CSS variables
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { darkTheme, lightTheme, spacing, radii, fontSizes, fontWeights, transitions } from './themes'

// Context
const ThemeContext = createContext(null)

// Hook para usar o tema
export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme deve ser usado dentro de um ThemeProvider')
  }
  return context
}

// Função para converter objeto nested em flat com prefixo
function flattenObject(obj, prefix = '') {
  return Object.keys(obj).reduce((acc, key) => {
    const value = obj[key]
    const newKey = prefix ? `${prefix}-${key}` : key
    
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      Object.assign(acc, flattenObject(value, newKey))
    } else {
      acc[newKey] = value
    }
    
    return acc
  }, {})
}

// Função para injetar CSS variables no documento
function injectCSSVariables(theme) {
  const root = document.documentElement
  const flatTheme = flattenObject(theme)
  
  // Injetar variáveis do tema
  Object.entries(flatTheme).forEach(([key, value]) => {
    // Converter camelCase para kebab-case
    const cssVar = key.replace(/([A-Z])/g, '-$1').toLowerCase()
    root.style.setProperty(`--theme-${cssVar}`, value)
  })
  
  // Injetar tokens estáticos (não mudam com o tema)
  Object.entries(spacing).forEach(([key, value]) => {
    root.style.setProperty(`--space-${key}`, value)
  })
  
  Object.entries(radii).forEach(([key, value]) => {
    root.style.setProperty(`--radius-${key}`, value)
  })
  
  Object.entries(fontSizes).forEach(([key, value]) => {
    root.style.setProperty(`--font-${key}`, value)
  })
  
  Object.entries(fontWeights).forEach(([key, value]) => {
    root.style.setProperty(`--weight-${key}`, value)
  })
  
  Object.entries(transitions).forEach(([key, value]) => {
    root.style.setProperty(`--transition-${key}`, value)
  })
  
  // Manter compatibilidade com variáveis antigas (--ui-*)
  root.style.setProperty('--ui-bg', theme.bg)
  root.style.setProperty('--ui-card', theme.card)
  root.style.setProperty('--ui-border', theme.border)
  root.style.setProperty('--ui-text', theme.text)
  root.style.setProperty('--ui-text-dim', theme.textDim)
  root.style.setProperty('--accent', theme.primary)
  
  // Adicionar classe ao body para estilos específicos
  document.body.classList.remove('theme-dark', 'theme-light')
  document.body.classList.add(`theme-${theme.name}`)
}

// Storage key
const THEME_STORAGE_KEY = 'exumas-theme'

// Provider Component
export function ThemeProvider({ children }) {
  // Inicializar com tema guardado ou dark por defeito
  const [themeName, setThemeName] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(THEME_STORAGE_KEY)
      return saved || 'dark'
    }
    return 'dark'
  })
  
  // Tema atual
  const theme = themeName === 'dark' ? darkTheme : lightTheme
  
  // Toggle entre temas
  const toggleTheme = useCallback(() => {
    setThemeName(prev => prev === 'dark' ? 'light' : 'dark')
  }, [])
  
  // Definir tema específico
  const setTheme = useCallback((name) => {
    if (name === 'dark' || name === 'light') {
      setThemeName(name)
    }
  }, [])
  
  // Verificar se é dark
  const isDark = themeName === 'dark'
  
  // Injetar variáveis quando o tema muda
  useEffect(() => {
    injectCSSVariables(theme)
    localStorage.setItem(THEME_STORAGE_KEY, themeName)
  }, [theme, themeName])
  
  // Valor do contexto
  const value = {
    theme,
    themeName,
    isDark,
    toggleTheme,
    setTheme,
    // Helpers para acesso rápido
    colors: {
      bg: theme.bg,
      card: theme.card,
      border: theme.border,
      text: theme.text,
      textDim: theme.textDim,
      primary: theme.primary,
      success: theme.success,
      danger: theme.danger,
      warning: theme.warning,
      info: theme.info,
      purple: theme.purple,
    },
    // Tokens estáticos
    spacing,
    radii,
    fontSizes,
    fontWeights,
    transitions,
  }
  
  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

export default ThemeProvider
