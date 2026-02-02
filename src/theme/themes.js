/**
 * Theme Definitions
 * Dark e Light themes com as mesmas keys mas valores diferentes
 */

import { neutral, darkGray, lightGray, brand, semantic, gradients } from './colors'
import { spacing, radii, fontSizes, fontWeights, transitions } from './tokens'

// ============================================
// DARK THEME (atual - não alterar valores!)
// ============================================
export const darkTheme = {
  name: 'dark',
  
  // Backgrounds
  bg: darkGray.bg,           // #0f1419
  bgAlt: '#141a21',
  card: darkGray.card,       // #1a1f26
  cardHover: darkGray.cardHover,
  
  // Borders
  border: darkGray.border,   // #2a3441
  borderHover: darkGray.borderHover,
  
  // Text
  text: neutral[50],         // #f9fafb
  textDim: neutral[400],     // #9ca3af
  textMuted: neutral[500],   // #6b7280
  
  // Brand
  primary: brand.primary,
  primaryHover: brand.primaryHover,
  primaryBg: 'rgba(249, 115, 22, 0.15)',
  
  // Semantic
  success: semantic.success,
  successBg: semantic.successBg,
  danger: semantic.danger,
  dangerBg: semantic.dangerBg,
  warning: semantic.warning,
  warningBg: semantic.warningBg,
  info: semantic.info,
  infoBg: semantic.infoBg,
  purple: semantic.purple,
  purpleBg: semantic.purpleBg,
  cyan: semantic.cyan,
  cyanBg: semantic.cyanBg,
  
  // Gradients
  gradientPrimary: gradients.primary,
  gradientSuccess: gradients.success,
  gradientDanger: gradients.danger,
  gradientInfo: gradients.info,
  gradientPurple: gradients.purple,
  gradientTitle: gradients.title,
  
  // Specific UI elements
  sidebar: {
    bg: '#111518',
    itemHover: 'rgba(255, 255, 255, 0.05)',
    itemActive: 'rgba(249, 115, 22, 0.15)',
  },
  
  header: {
    bg: 'rgba(15, 20, 25, 0.8)',
    border: darkGray.border,
  },
  
  input: {
    bg: darkGray.bg,
    border: darkGray.border,
    focus: brand.primary,
    placeholder: neutral[500],
  },
  
  table: {
    headerBg: 'rgba(255, 255, 255, 0.03)',
    rowHover: 'rgba(255, 255, 255, 0.02)',
    border: darkGray.border,
  },
  
  // Shadows (dark theme - mais subtis)
  shadow: {
    sm: '0 1px 2px rgba(0, 0, 0, 0.3)',
    md: '0 4px 12px rgba(0, 0, 0, 0.4)',
    lg: '0 8px 24px rgba(0, 0, 0, 0.5)',
    glow: '0 0 20px rgba(249, 115, 22, 0.3)',
  },
}

// ============================================
// LIGHT THEME
// ============================================
export const lightTheme = {
  name: 'light',
  
  // Backgrounds
  bg: lightGray.bg,          // #f8fafc
  bgAlt: '#f1f5f9',
  card: lightGray.card,      // #ffffff
  cardHover: lightGray.cardHover,
  
  // Borders
  border: lightGray.border,  // #e2e8f0
  borderHover: lightGray.borderHover,
  
  // Text
  text: neutral[900],        // #111827
  textDim: neutral[600],     // #4b5563
  textMuted: neutral[400],   // #9ca3af
  
  // Brand
  primary: brand.primary,
  primaryHover: brand.primaryHover,
  primaryBg: 'rgba(249, 115, 22, 0.1)',
  
  // Semantic (ligeiramente mais escuras para contraste)
  success: semantic.successHover,
  successBg: 'rgba(34, 197, 94, 0.1)',
  danger: semantic.dangerHover,
  dangerBg: 'rgba(239, 68, 68, 0.1)',
  warning: semantic.warningHover,
  warningBg: 'rgba(245, 158, 11, 0.1)',
  info: semantic.infoHover,
  infoBg: 'rgba(59, 130, 246, 0.1)',
  purple: semantic.purpleHover,
  purpleBg: 'rgba(139, 92, 246, 0.1)',
  cyan: semantic.cyanHover,
  cyanBg: 'rgba(6, 182, 212, 0.1)',
  
  // Gradients
  gradientPrimary: gradients.primary,
  gradientSuccess: gradients.success,
  gradientDanger: gradients.danger,
  gradientInfo: gradients.info,
  gradientPurple: gradients.purple,
  gradientTitle: gradients.titleDark,
  
  // Specific UI elements
  sidebar: {
    bg: '#ffffff',
    itemHover: 'rgba(0, 0, 0, 0.04)',
    itemActive: 'rgba(249, 115, 22, 0.1)',
  },
  
  header: {
    bg: 'rgba(255, 255, 255, 0.9)',
    border: lightGray.border,
  },
  
  input: {
    bg: '#ffffff',
    border: lightGray.border,
    focus: brand.primary,
    placeholder: neutral[400],
  },
  
  table: {
    headerBg: 'rgba(0, 0, 0, 0.02)',
    rowHover: 'rgba(0, 0, 0, 0.02)',
    border: lightGray.border,
  },
  
  // Shadows (light theme - mais visíveis)
  shadow: {
    sm: '0 1px 3px rgba(0, 0, 0, 0.08)',
    md: '0 4px 12px rgba(0, 0, 0, 0.1)',
    lg: '0 8px 24px rgba(0, 0, 0, 0.12)',
    glow: '0 0 20px rgba(249, 115, 22, 0.2)',
  },
}

// Export comum de tokens
export { spacing, radii, fontSizes, fontWeights, transitions }
