// src/lib/orderEvents.js
import { db } from './firebase'
import { collection, addDoc } from 'firebase/firestore'

/**
 * Regista um evento no histórico de uma encomenda.
 *
 * orderId  → ID da encomenda
 * type     → tipo de evento (ex: 'CREATED', 'SEND_TO_PREP', 'CANCELLED', ...)
 * role     → perfil (ROLES.GESTOR, ROLES.ARMAZEM, etc.)
 * profile  → objeto vindo do useAuth() (utilizador atual)
 * meta     → dados extra (fromStatus, toStatus, notas, etc.)
 */
export async function logOrderEvent({ orderId, type, role, profile, meta }) {
  if (!orderId || !type) return

  const now = new Date().toISOString()
  const col = collection(db, 'orderEvents')

  const payload = {
    orderId,
    type,
    role: role || profile?.role || null,
    byUserId: profile?.uid || profile?.id || null,
    byName: profile?.name || profile?.email || 'Sistema',
    at: meta?.at || now,
    meta: meta || {},
  }

  try {
    console.log(`🔍 logOrderEvent: Creating ${type} event for order ${orderId}`)
    const docRef = await addDoc(col, payload)
    console.log(`✅ logOrderEvent: Event created with ID ${docRef.id}`)
    return docRef
  } catch (err) {
    console.error(`❌ logOrderEvent failed for ${type}:`, err?.code, err?.message)
    throw err
  }
}
