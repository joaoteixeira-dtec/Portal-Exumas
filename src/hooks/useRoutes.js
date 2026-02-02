/* Hooks customizados para criar e editar rotas */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { collection, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { insertAt, moveWithin, removeItem, moveUp, moveDown } from '../lib/dragDropUtils'
import { CARRIERS, FLEET } from '../config/routes'
import { toISODate } from '../lib/orderHelpers'

export const useRouteCreation = (motoristas, internals, orders) => {
  const qc = useQueryClient()
  
  // Form state
  const [showCreate, setShowCreate] = useState(false)
  const [date, setDate] = useState(() => toISODate(new Date()))
  const [vehicle, setVehicle] = useState(FLEET[0])
  const [driver, setDriver] = useState('')
  const [startTime, setStartTime] = useState('08:00')
  const [notes, setNotes] = useState('')
  const [onlyDay, setOnlyDay] = useState(false)
  
  // Draft management
  const [draft, setDraft] = useState([])
  const [draggingId, setDraggingId] = useState(null)
  const [insertIndex, setInsertIndex] = useState(null)
  const [overDraft, setOverDraft] = useState(false)
  const [overAvail, setOverAvail] = useState(false)

  const driverObj = motoristas.find(m => m.id === driver)
  
  const availableOrders = useMemo(() => {
    const sameDay = (o) => toISODate(new Date(o.date)) === date
    return internals
      .filter(o => !draft.includes(o.id))
      .filter(o => (onlyDay ? sameDay(o) : true))
  }, [internals, draft, onlyDay, date])

  const draftOrders = useMemo(
    () => draft.map(id => internals.find(o => o.id === id)).filter(Boolean),
    [draft, internals]
  )

  const pushToDraft = useCallback((id, pos = null) =>
    setDraft(s => (s.includes(id) ? s : insertAt(s, pos ?? s.length, id))),
    []
  )

  const removeFromDraft = useCallback((id) =>
    setDraft(s => removeItem(s, id)),
    []
  )

  const moveUpDraft = useCallback((id) =>
    setDraft(s => moveUp(s, id)),
    []
  )

  const moveDownDraft = useCallback((id) =>
    setDraft(s => moveDown(s, id)),
    []
  )

  const handleDropOnDraft = (e, destIndex = null) => {
    e.preventDefault()
    const { id, source } = JSON.parse(e.dataTransfer.getData('application/json') || '{}')
    if (!id) return
    setOverDraft(false)
    setInsertIndex(null)
    
    if (source === 'avail') {
      if (draft.includes(id)) return
      setDraft(s => insertAt(s, destIndex ?? s.length, id))
    } else if (source === 'draft') {
      const from = draft.indexOf(id)
      if (from === -1) return
      const to = destIndex ?? draft.length
      setDraft(s => moveWithin(s, from, to))
    }
  }

  const handleDropOnAvail = (e) => {
    e.preventDefault()
    const { id, source } = JSON.parse(e.dataTransfer.getData('application/json') || '{}')
    if (!id) return
    setOverAvail(false)
    if (source === 'draft') removeFromDraft(id)
  }

  const createRoute = useMutation({
    mutationFn: async () => {
      if (!driver || !vehicle || !date || draft.length === 0) {
        throw new Error('Preenche veículo, motorista, data e arrasta pelo menos uma encomenda.')
      }
      const payload = {
        date,
        vehicle,
        driverId: driver,
        driverName: motoristas.find(m => m.id === driver)?.name || 'Motorista',
        startTime,
        notes: notes || '',
        orderIds: draft,
        status: 'PLANNED',
        createdAt: new Date().toISOString()
      }
      const ref = await addDoc(collection(db, 'routes'), payload)
      for (const oid of draft) {
        await updateDoc(doc(db, 'orders', oid), {
          routeId: ref.id,
          assignedTo: payload.driverName,
          assignedDriverId: driver
        })
      }
      return ref.id
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['routes'] })
      qc.invalidateQueries({ queryKey: ['orders'] })
      resetForm()
    }
  })

  const resetForm = () => {
    setDraft([])
    setNotes('')
    setShowCreate(false)
    setDriver('')
    setVehicle(FLEET[0])
  }

  return {
    // UI state
    showCreate, setShowCreate,
    // Form state
    date, setDate,
    vehicle, setVehicle,
    driver, setDriver,
    startTime, setStartTime,
    notes, setNotes,
    onlyDay, setOnlyDay,
    driverObj,
    // Draft state
    draft,
    draggingId, setDraggingId,
    insertIndex, setInsertIndex,
    overDraft, setOverDraft,
    overAvail, setOverAvail,
    availableOrders,
    draftOrders,
    // Actions
    pushToDraft,
    removeFromDraft,
    moveUpDraft,
    moveDownDraft,
    handleDropOnDraft,
    handleDropOnAvail,
    createRoute,
    resetForm
  }
}

export const useRouteEdit = (motoristas, internals, orders) => {
  const qc = useQueryClient()
  
  const [editRoute, setEditRoute] = useState(null)
  const [editDraft, setEditDraft] = useState([])
  const [editVehicle, setEditVehicle] = useState(FLEET[0])
  const [editDriver, setEditDriver] = useState('')
  const [editTime, setEditTime] = useState('08:00')
  const [editNotes, setEditNotes] = useState('')
  const [editOnlyDay, setEditOnlyDay] = useState(true)

  useEffect(() => {
    if (!editRoute) return
    setEditDraft(editRoute.orderIds || [])
    setEditVehicle(editRoute.vehicle || FLEET[0])
    setEditDriver(editRoute.driverId || '')
    setEditTime(editRoute.startTime || '08:00')
    setEditNotes(editRoute.notes || '')
    setEditOnlyDay(true)
  }, [editRoute])

  const internalForEdit = useMemo(() =>
    internals.filter(o =>
      o.carrier === CARRIERS.INTERNO && (!o.routeId || o.routeId === editRoute?.id)
    ),
    [internals, editRoute]
  )

  const availableForEdit = useMemo(() => {
    if (!editRoute) return []
    const sameDay = (o) => toISODate(new Date(o.date)) === editRoute.date
    return internalForEdit
      .filter(o => !editDraft.includes(o.id))
      .filter(o => (editOnlyDay ? sameDay(o) : true))
  }, [internalForEdit, editDraft, editRoute, editOnlyDay])

  const draftOrdersEdit = useMemo(() =>
    editRoute ? editDraft.map(id => internalForEdit.find(o => o.id === id)).filter(Boolean) : [],
    [editDraft, internalForEdit, editRoute]
  )

  const pushToEdit = useCallback((id, pos = null) =>
    setEditDraft(s => (s.includes(id) ? s : insertAt(s, pos ?? s.length, id))),
    []
  )

  const removeFromEdit = useCallback((id) =>
    setEditDraft(s => removeItem(s, id)),
    []
  )

  const moveUpEdit = useCallback((id) =>
    setEditDraft(s => moveUp(s, id)),
    []
  )

  const moveDownEdit = useCallback((id) =>
    setEditDraft(s => moveDown(s, id)),
    []
  )

  const deleteRoute = useMutation({
    mutationFn: async (route) => {
      for (const oid of route.orderIds || []) {
        await updateDoc(doc(db, 'orders', oid), {
          routeId: null,
          assignedTo: null,
          assignedDriverId: null
        })
      }
      await deleteDoc(doc(db, 'routes', route.id))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['routes'] })
      qc.invalidateQueries({ queryKey: ['orders'] })
      setEditRoute(null)
    }
  })

  const saveEdit = useMutation({
    mutationFn: async () => {
      if (!editRoute) throw new Error('Rota inválida.')
      if (!editDriver || !editVehicle || editDraft.length === 0) {
        throw new Error('Seleciona motorista, veículo e pelo menos uma encomenda.')
      }
      const driverName = motoristas.find(m => m.id === editDriver)?.name || 'Motorista'
      const before = new Set(editRoute.orderIds || [])
      const after = new Set(editDraft)
      
      for (const oid of [...before].filter(x => !after.has(x))) {
        await updateDoc(doc(db, 'orders', oid), {
          routeId: null,
          assignedTo: null,
          assignedDriverId: null
        })
      }
      for (const oid of editDraft) {
        await updateDoc(doc(db, 'orders', oid), {
          routeId: editRoute.id,
          assignedTo: driverName,
          assignedDriverId: editDriver
        })
      }
      await updateDoc(doc(db, 'routes', editRoute.id), {
        vehicle: editVehicle,
        driverId: editDriver,
        driverName,
        startTime: editTime,
        notes: editNotes || '',
        orderIds: editDraft
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['routes'] })
      qc.invalidateQueries({ queryKey: ['orders'] })
      setEditRoute(null)
    }
  })

  return {
    // State
    editRoute, setEditRoute,
    editDraft, setEditDraft,
    editVehicle, setEditVehicle,
    editDriver, setEditDriver,
    editTime, setEditTime,
    editNotes, setEditNotes,
    editOnlyDay, setEditOnlyDay,
    // Computed
    internalForEdit,
    availableForEdit,
    draftOrdersEdit,
    // Actions
    pushToEdit,
    removeFromEdit,
    moveUpEdit,
    moveDownEdit,
    deleteRoute,
    saveEdit
  }
}

export const usePickupCreation = (externals) => {
  const qc = useQueryClient()
  
  const [showCreate, setShowCreate] = useState(false)
  const [date, setDate] = useState(() => toISODate(new Date()))
  const [carrier, setCarrier] = useState(CARRIERS.SANTOS)
  const [time, setTime] = useState('15:00')
  const [location, setLocation] = useState('')
  const [selected, setSelected] = useState([])

  const toggleSelected = useCallback((id) =>
    setSelected(s => s.includes(id) ? removeItem(s, id) : [...s, id]),
    []
  )

  const createPickup = useMutation({
    mutationFn: async () => {
      if (!location || !date || selected.length === 0) {
        throw new Error('Preenche local, data e seleciona encomendas.')
      }
      const ok = selected.every(id => {
        const o = externals.find(x => x.id === id)
        return o && o.carrier === carrier
      })
      if (!ok) throw new Error('As encomendas selecionadas não coincidem com a transportadora.')
      
      const payload = {
        date,
        carrier,
        pickupTime: time,
        pickupLocation: location,
        orderIds: selected,
        status: 'SCHEDULED',
        createdAt: new Date().toISOString()
      }
      const ref = await addDoc(collection(db, 'pickups'), payload)
      for (const oid of selected) {
        await updateDoc(doc(db, 'orders', oid), {
          pickupId: ref.id,
          pickupTime: time,
          pickupLocation: location,
          assignedTo: carrier === CARRIERS.SANTOS ? 'Santos e Vale' : 'STEFF'
        })
      }
      return ref.id
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pickups'] })
      qc.invalidateQueries({ queryKey: ['orders'] })
      resetForm()
    }
  })

  const resetForm = () => {
    setSelected([])
    setLocation('')
    setShowCreate(false)
  }

  return {
    // UI state
    showCreate, setShowCreate,
    // Form state
    date, setDate,
    carrier, setCarrier,
    time, setTime,
    location, setLocation,
    selected,
    // Actions
    toggleSelected,
    createPickup,
    resetForm
  }
}
