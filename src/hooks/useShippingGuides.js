import { useQuery } from '@tanstack/react-query'
import { db } from '../lib/firebase'
import { collection, query, where, getDocs } from 'firebase/firestore'

export function useShippingGuides(status) {
  return useQuery({
    queryKey: ['shippingGuides', status || 'ALL'],
    queryFn: async () => {
      const base = collection(db, 'shippingGuides')
      const q = status ? query(base, where('status', '==', status)) : base
      const snap = await getDocs(q)
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    }
  })
}
