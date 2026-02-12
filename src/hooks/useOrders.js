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
        
        // Validar carrier obrigatório antes de A_EXPEDIR
        if (cleanData.status === 'A_EXPEDIR' && oldData.status !== 'A_EXPEDIR') {
          const effectiveCarrier = cleanData.carrier || oldData.carrier
          if (!effectiveCarrier) {
            throw new Error('⚠️ Transportadora obrigatória! Sem transportadora atribuída, a encomenda não aparecerá nas Rotas nem nas Recolhas.')
          }
        }
        
        // Update order
        await updateDoc(orderRef, cleanData)
        
        // Log events for specific changes
        // Detect status change
        if (oldData.status !== cleanData.status) {
          const type = cleanData.status === 'FALTAS' ? 'PREP_CLOSED_MISSING' : 
                      cleanData.status === 'A_FATURAR' ? 'PREP_CLOSED_OK' : 
                      cleanData.status === 'A_EXPEDIR' ? 'INVOICED' :
                      'SEND_TO_PREP'
          
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

          // Se BULK_BATCH fecha (PREP → A_FATURAR), distribuir items de volta às subencomendas
          if (oldData.bulkBatch && oldData.status === 'PREP' && cleanData.status === 'A_FATURAR') {
            await distributeBulkBatchItems(id, oldSnap.data(), profile)
          }

          // Se uma subencomenda bulk transita para A_FATURAR, criar guia de remessa
          if (oldData.linkedToBulkBatchId && oldData.status === 'PREP' && cleanData.status === 'A_FATURAR') {
            await createShippingGuideForBulkSuborder(oldSnap.data(), id, profile)
          }
        }
      } catch (err) {
        console.error('❌ useUpdateOrder mutation error:', err.code, err.message)
        throw err
      }
    },
    onSuccess:()=> {
      qc.invalidateQueries({queryKey:['orders']})
      qc.invalidateQueries({queryKey:['orderEvents']})
    },
    onError: (err) => {
      console.error('❌ useUpdateOrder error:', err.code, err.message)
    }
  })
}

/**
 * Hook para registar entrega com detalhe de itens (motorista)
 * Grava delivery object na encomenda com quantidades entregues/devolvidas
 */
export function useRecordDelivery() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ orderId, delivery, routeUpdate }) => {
      const orderRef = doc(db, 'orders', orderId)

      // Detectar discrepâncias
      const hasDiscrepancy = (delivery.items || []).some(it =>
        Number(it.deliveredQty) !== Number(it.invoicedQty) || Number(it.returnedQty) > 0
      )

      // Sanitizar: remover campos undefined (Firestore rejeita undefined)
      const sanitize = (obj) => {
        const clean = {}
        for (const [k, v] of Object.entries(obj)) {
          if (v !== undefined) clean[k] = v
        }
        return clean
      }

      const deliveryData = sanitize({
        ...delivery,
        recordedById: delivery.recordedById || null,
        hasDiscrepancy,
        discrepancyStatus: hasDiscrepancy ? 'pendente' : null,
        rectifications: [],
      })

      await updateDoc(orderRef, {
        delivery: deliveryData,
        hasDeliveryIssues: hasDiscrepancy || delivery.outcome !== 'OK',
        deliveredAt: delivery.recordedAt,
        deliveryOutcome: delivery.outcome,
        deliveryNotes: delivery.notes || '',
        status: delivery.outcome === 'NAOENTREGUE' ? 'NAOENTREGUE' : 'ENTREGUE',
      })

      // Atualizar progresso da rota
      if (routeUpdate) {
        await updateDoc(doc(db, 'routes', routeUpdate.routeId), routeUpdate.data)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['driver-routes'] })
      qc.invalidateQueries({ queryKey: ['driver-orders-for-routes'] })
    },
    onError: (err) => {
      console.error('❌ useRecordDelivery error:', err.message)
    },
  })
}

/**
 * Hook para registar retificação (faturação)
 * Adiciona nota de crédito ou fatura complementar à delivery
 */
export function useAddRectification() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ orderId, rectification }) => {
      const orderRef = doc(db, 'orders', orderId)
      const snap = await getDoc(orderRef)
      const data = snap.data()
      const delivery = data?.delivery || {}
      const existing = delivery.rectifications || []

      await updateDoc(orderRef, {
        'delivery.rectifications': [...existing, rectification],
        'delivery.discrepancyStatus': 'resolvida',
        hasDeliveryIssues: false,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] })
    },
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
    
    if (bulkSubOrderIds.length === 0) {
      console.log('⚠️ Nenhuma subencomenda associada')
      return
    }
    
    // Fetch todas as subencomendas para distribuir proportionally
    const suborderDocs = await Promise.all(
      bulkSubOrderIds.map(id => getDoc(doc(db, 'orders', id)))
    )
    const subencomendas = suborderDocs.map(d => ({ id: d.id, ...d.data() })).filter(d => d.id)
    
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
    
  } catch (err) {
    console.error('❌ Error distributing bulk batch items:', err)
    throw err
  }
}
