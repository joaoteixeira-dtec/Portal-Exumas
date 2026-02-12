/**
 * WarehouseContext.jsx
 * Gere o armazém ativo para filtragem de dados nas páginas operacionais.
 * 
 * - Admin / Gestor podem alternar entre armazéns ou ver "Todos"
 * - Utilizadores operacionais ficam no seu armazém atribuído (defaultWarehouse do profile)
 * - Se o utilizador não tem defaultWarehouse, vê tudo (compatibilidade com dados antigos)
 * - Persistido em localStorage para sobreviver a refresh
 */

import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from './AuthProvider'
import { WAREHOUSES, WAREHOUSE_NAMES } from '../config/routes'

const WarehouseCtx = createContext(null)

const STORAGE_KEY = 'exumas_activeWarehouse'

/**
 * Roles que podem trocar de armazém (ver selector no Header).
 * Outros roles ficam locked ao seu defaultWarehouse.
 */
const ROLES_CAN_SWITCH = ['admin', 'gestor']

export function WarehouseProvider({ children }) {
  const { profile } = useAuth()

  // Inicializar do localStorage ou null (= todos)
  const [activeWarehouse, setActiveWarehouseRaw] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || null
    } catch {
      return null
    }
  })

  // Persistir mudanças
  const setActiveWarehouse = useCallback((wh) => {
    setActiveWarehouseRaw(wh)
    try {
      if (wh) localStorage.setItem(STORAGE_KEY, wh)
      else localStorage.removeItem(STORAGE_KEY)
    } catch { /* ignore */ }
  }, [])

  // Se tem profile mas não pode trocar, forçar o defaultWarehouse
  useEffect(() => {
    if (!profile) return
    const role = profile.role
    const canSwitch = ROLES_CAN_SWITCH.includes(role) || role === 'admin'
    if (!canSwitch && profile.defaultWarehouse) {
      setActiveWarehouse(profile.defaultWarehouse)
    }
  }, [profile?.role, profile?.defaultWarehouse, setActiveWarehouse])

  // Pode trocar de armazém?
  const canSwitchWarehouse = useMemo(() => {
    if (!profile) return false
    return ROLES_CAN_SWITCH.includes(profile.role)
  }, [profile?.role])

  // Filtrar orders por armazém ativo
  // Regra: se activeWarehouse é null → mostra tudo
  //        se order não tem armazem → mostra em TODOS os armazéns (migração)
  //        se order.armazem === activeWarehouse → mostra
  const filterByWarehouse = useCallback((items) => {
    if (!activeWarehouse) return items // "Todos" → sem filtro
    return items.filter(item => !item.armazem || item.armazem === activeWarehouse)
  }, [activeWarehouse])

  const value = useMemo(() => ({
    activeWarehouse,        // null | 'covoes' | 'marinhais'
    setActiveWarehouse,
    canSwitchWarehouse,
    filterByWarehouse,
    warehouses: WAREHOUSES,
    warehouseNames: WAREHOUSE_NAMES,
  }), [activeWarehouse, setActiveWarehouse, canSwitchWarehouse, filterByWarehouse])

  return <WarehouseCtx.Provider value={value}>{children}</WarehouseCtx.Provider>
}

export const useWarehouse = () => useContext(WarehouseCtx)
