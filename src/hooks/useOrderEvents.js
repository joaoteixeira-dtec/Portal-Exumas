// src/hooks/useOrderEvents.js
import { useQuery } from '@tanstack/react-query'
import { db } from '../lib/firebase'
import { collection, getDocs, query, where } from 'firebase/firestore'

export function useOrderEvents(orderId) {
  return useQuery({
    queryKey: ['order-events', orderId],
    enabled: !!orderId,
    queryFn: async () => {
      try {
        const col = collection(db, 'orderEvents')
        // NOTE: No orderBy to avoid needing composite index
        // We'll sort on the client side instead
        const q = query(
          col,
          where('orderId', '==', orderId)
        )
        const snap = await getDocs(q)
        const events = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        // Sort by timestamp on client
        events.sort((a, b) => (a.at || '').localeCompare(b.at || ''))
        return events
      } catch (err) {
        console.error(`❌ useOrderEvents error:`, err.code, err.message)
        throw err
      }
    },
  })
}
