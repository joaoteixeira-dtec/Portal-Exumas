import { useQuery } from '@tanstack/react-query'
import { db } from '../lib/firebase'
import { collection, getDocs, query, where } from 'firebase/firestore'
const fetchAll = async (path)=>{ const snap = await getDocs(collection(db,path)); return snap.docs.map(d=>({id:d.id, ...d.data()})) }
export const useProducts = ()=> useQuery({ queryKey:['products'], queryFn:()=>fetchAll('products') })
export const useContracts = (clientId)=> useQuery({ queryKey:['contracts', clientId||'ALL'], queryFn: async()=>{
  if(!clientId) return fetchAll('contracts')
  const q = query(collection(db,'contracts'), where('clientId','==', clientId)); const s=await getDocs(q); return s.docs.map(d=>({id:d.id, ...d.data()}))
}})
export const useLocations = (contractId)=> useQuery({ queryKey:['locations', contractId||'ALL'], queryFn: async()=>{
  if(!contractId) return fetchAll('locations')
  const q = query(collection(db,'locations'), where('contractId','==', contractId)); const s=await getDocs(q); return s.docs.map(d=>({id:d.id, ...d.data()}))
}})
export const useClients = ()=> useQuery({ queryKey:['clients'], queryFn:()=>fetchAll('users') })
