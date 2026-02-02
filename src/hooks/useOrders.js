import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { db } from '../lib/firebase'
import { collection, query, where, getDocs, addDoc, doc, updateDoc, getDoc, writeBatch } from 'firebase/firestore'
import { logOrderEvent } from '../lib/orderEvents'

export function useOrders(status){
  return useQuery({
    queryKey:['orders', status||'ALL'],
    queryFn: async()=>{
      const base = collection(db,'orders')
      const q = status ? query(base, where('status','==', status)) : base
      const snap = await getDocs(q)
      return snap.docs.map(d=>({id:d.id, ...d.data()}))
    }
  })
}

export function useCreateOrder(){
  const qc=useQueryClient()
  return useMutation({
    mutationFn: async (order)=> addDoc(collection(db,'orders'), order),
    onSuccess:()=> qc.invalidateQueries({queryKey:['orders']})
  })
}

export function useUpdateOrder(){
  const qc=useQueryClient()
  return useMutation({
    mutationFn: async ({id, data})=> {
      try {
        // Extract profile before saving (it's only for logging)
        const profile = data._profile
        const cleanData = { ...data }
        delete cleanData._profile
        
        // Get current order to detect changes
        const orderRef = doc(db, 'orders', id)
        const oldSnap = await getDoc(orderRef)
        const oldData = oldSnap.data() || {}
        
        console.log(`📊 useUpdateOrder: Updating order ${id}`)
        console.log(`  Old status: ${oldData.status}, New status: ${cleanData.status}`)
        
        // Update order
        await updateDoc(orderRef, cleanData)
        console.log(`✅ Order updated successfully`)
        
        // Log events for specific changes
        // Detect status change
        if (oldData.status !== cleanData.status) {
          const type = cleanData.status === 'FALTAS' ? 'PREP_CLOSED_MISSING' : 
                      cleanData.status === 'A_FATURAR' ? 'PREP_CLOSED_OK' : 
                      cleanData.status === 'A_EXPEDIR' ? 'INVOICED' :
                      'SEND_TO_PREP'
          
          console.log(`🔍 Logging event: ${type}`)
          await logOrderEvent({
            orderId: id,
            type,
            role: profile?.role || 'system',
            profile,
            meta: {
              fromStatus: oldData.status,
              toStatus: cleanData.status,
            }
          }).catch(e => console.error('Event logging failed:', e))
          console.log(`✅ Event logged successfully`)

          // Se BULK_BATCH fecha (PREP → A_FATURAR), distribuir items de volta às subencomendas
          if (oldData.bulkBatch && oldData.status === 'PREP' && cleanData.status === 'A_FATURAR') {
            console.log(`📦 Distribuindo items do BULK_BATCH de volta às subencomendas...`)
            await distributeBulkBatchItems(id, oldSnap.data(), profile)
          }

          // Se uma subencomenda bulk transita para A_FATURAR, criar guia de remessa
          if (oldData.linkedToBulkBatchId && oldData.status === 'PREP' && cleanData.status === 'A_FATURAR') {
            console.log(`📋 Creating shipping guide for bulk order ${oldData.linkedToBulkBatchId}`)
            await createShippingGuideForBulkSuborder(oldSnap.data(), id, profile)
          }
        }
      } catch (err) {
        console.error('❌ useUpdateOrder mutation error:', err.code, err.message)
        throw err
      }
    },
    onSuccess:()=> {
      console.log('✅ useUpdateOrder onSuccess: Invalidating queries')
      qc.invalidateQueries({queryKey:['orders']})
      qc.invalidateQueries({queryKey:['orderEvents']})
    },
    onError: (err) => {
      console.error('❌ useUpdateOrder error:', err.code, err.message)
    }
  })
}

// Helper function to create shipping guides from bulk subencomendas
async function createShippingGuideForBulkSuborder(order, orderId, profile) {
  try {
    const guideRef = await addDoc(collection(db, 'shippingGuides'), {
      // Link to source
      orderId: orderId,
      bulkBatchId: order.bulkBatchId,
      
      // Order info
      clientId: order.clientId,
      clientName: order.clientName,
      contractId: order.contractId,
      locationId: order.locationId,
      
      // Items (copy from order)
      items: order.items || {},
      
      // Status
      status: 'PENDENTE', // PENDENTE, FATURADA, CANCELADA
      
      // Audit
      createdAt: new Date().toISOString(),
      createdBy: profile?.uid || 'system',
      createdByName: profile?.name || 'System',
      
      // Meta
      meta: {
        sourceType: 'bulk',
        bulkSuborderNo: order.no || order.internalNo
      }
    })
    
    console.log(`✅ Shipping guide created: ${guideRef.id}`)
    return guideRef.id
  } catch (err) {
    console.error('❌ Error creating shipping guide:', err)
    throw err
  }
}

// Helper function to distribute bulk batch items back to subencomendas
async function distributeBulkBatchItems(bulkBatchId, bulkBatchOrder, profile) {
  try {
    const bulkSubOrderIds = bulkBatchOrder.bulkSubOrderIds || []
    const aggregatedItems = bulkBatchOrder.items || {}
    
    console.log(`📦 Distribuindo items para ${bulkSubOrderIds.length} subencomendas...`)
    
    if (bulkSubOrderIds.length === 0) {
      console.log('⚠️ Nenhuma subencomenda associada')
      return
    }
    
    // Fetch todas as subencomendas para distribuir proportionally
    const suborderDocs = await Promise.all(
      bulkSubOrderIds.map(id => getDoc(doc(db, 'orders', id)))
    )
    const subencomendas = suborderDocs.map(d => ({ id: d.id, ...d.data() })).filter(d => d.id)
    
    console.log(`✅ ${subencomendas.length} subencomendas carregadas`)
    
    // Batch update: distribuir items de volta
    const distribBatch = writeBatch(db)
    
    subencomendas.forEach(suborder => {
      const subItems = suborder.items || {}
      const updatedItems = {}
      
      // Para cada item da subencomenda, pega a quantidade preparada do bulk batch
      Object.keys(subItems).forEach(key => {
        const subItem = subItems[key]
        const productName = subItem.productName || subItem.nome || key
        const bulkItem = Object.values(aggregatedItems).find(
          bi => (bi.productName || bi.nome) === productName
        )
        
        if (bulkItem) {
          // Distribuir proportionally: (suborder qty / total qty) * prepared qty
          const totalQty = bulkItem.qty || 1
          const subQty = subItem.qty || 0
          const ratio = subQty / totalQty
          const preparedForSub = Math.round((bulkItem.preparedQty || 0) * ratio * 100) / 100
          
          updatedItems[key] = {
            ...subItem,
            preparedQty: preparedForSub
          }
        } else {
          updatedItems[key] = subItem
        }
      })
      
      distribBatch.update(doc(db, 'orders', suborder.id), {
        items: updatedItems,
        warehouseClosedAt: new Date().toISOString()
      })
    })
    
    await distribBatch.commit()
    console.log(`✅ Items distribuídos para todas as subencomendas`)
    
  } catch (err) {
    console.error('❌ Error distributing bulk batch items:', err)
    throw err
  }
}
