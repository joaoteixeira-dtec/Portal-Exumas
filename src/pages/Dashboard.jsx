/**
 * Dashboard.jsx
 * Visão global da operação com KPIs de todas as áreas.
 * Design moderno com glassmorphism e animações.
 */

import { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrders } from '../hooks/useOrders'
import { useAuth } from '../contexts/AuthProvider'
import { useWarehouse } from '../contexts/WarehouseContext'
import { usePermissions } from '../hooks/usePermissions'
import { 
  isCancelledStatus, isDeliveredStatus, isBulkSubOrder, isBulkBatchOrder, orderTotalValue 
} from '../lib/orderHelpers'

// Animated counter component
function AnimatedCounter({ value, duration = 1000, prefix = '', suffix = '' }) {
  const [displayValue, setDisplayValue] = useState(0)
  
  useEffect(() => {
    const numValue = typeof value === 'string' ? parseFloat(value) || 0 : value
    const startTime = Date.now()
    const startValue = displayValue
    
    const animate = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      const easeOut = 1 - Math.pow(1 - progress, 3)
      const current = startValue + (numValue - startValue) * easeOut
      
      setDisplayValue(current)
      
      if (progress < 1) {
        requestAnimationFrame(animate)
      }
    }
    
    requestAnimationFrame(animate)
  }, [value, duration])
  
  const formatted = Number.isInteger(value) 
    ? Math.round(displayValue) 
    : displayValue.toFixed(1)
  
  return <>{prefix}{formatted}{suffix}</>
}

// Mini Bar Chart Component - Modern style
function MiniBarChart({ data, label }) {
  const max = Math.max(...data.map(d => d.value), 1)
  const today = new Date().toLocaleDateString('pt-PT', { weekday: 'short' }).slice(0, 3).toUpperCase()
  
  return (
    <div style={{
      background: 'var(--ui-card)',
      borderRadius: '12px',
      padding: '20px',
      border: '1px solid var(--ui-border)',
      height: '100%',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <div style={{ 
        fontSize: '13px', 
        color: 'var(--ui-text)', 
        fontWeight: 600,
        marginBottom: '16px'
      }}>{label}</div>
      
      <div style={{ 
        display: 'flex', 
        alignItems: 'flex-end', 
        gap: '8px',
        flex: 1,
        minHeight: '80px'
      }}>
        {data.map((d, i) => {
          const isToday = d.label.toUpperCase() === today
          return (
            <div key={i} style={{ 
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px'
            }}>
              <div 
                style={{ 
                  width: '100%',
                  height: `${Math.max((d.value / max) * 60, 4)}px`,
                  background: isToday 
                    ? 'linear-gradient(180deg, #f97316 0%, #ea580c 100%)' 
                    : 'rgba(249,115,22,0.3)',
                  borderRadius: '4px',
                  transition: 'height 0.3s ease'
                }}
                title={`${d.label}: ${d.value}`}
              />
              <span style={{ 
                fontSize: '10px', 
                color: isToday ? '#f97316' : 'var(--ui-text-dim)',
                fontWeight: isToday ? 600 : 400,
                textTransform: 'uppercase'
              }}>
                {d.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Comparison Card with modern styling
function ComparisonCard({ title, current, previous, icon }) {
  const numCurrent = typeof current === 'string' ? parseFloat(current) || 0 : current
  const numPrevious = typeof previous === 'string' ? parseFloat(previous) || 0 : previous
  const diff = numPrevious > 0 ? Math.round(((numCurrent - numPrevious) / numPrevious) * 100) : 0
  const isUp = diff > 0
  const isDown = diff < 0
  
  return (
    <div style={{
      background: 'var(--ui-card)',
      borderRadius: '12px',
      padding: '20px',
      border: '1px solid var(--ui-border)',
      flex: 1,
      minWidth: '200px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <span style={{ fontSize: '16px' }}>{icon}</span>
        <span style={{ 
          fontSize: '13px', 
          color: 'var(--ui-text-dim)',
          fontWeight: 500
        }}>{title}</span>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '8px' }}>
        <span style={{ fontSize: '28px', fontWeight: 700, color: 'var(--ui-text)' }}>{current}</span>
        <span style={{ fontSize: '12px', color: 'var(--ui-text-dim)' }}>vs</span>
        <span style={{ fontSize: '16px', color: 'var(--ui-text-dim)' }}>{previous}</span>
      </div>
      
      {diff !== 0 && (
        <div style={{
          display: 'inline-flex',
          padding: '4px 10px',
          borderRadius: '12px',
          fontSize: '12px',
          fontWeight: 600,
          background: isUp ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
          color: isUp ? '#22c55e' : '#ef4444'
        }}>
          {isUp ? '↑' : '↓'} {Math.abs(diff)}%
        </div>
      )}
    </div>
  )
}

// Performance Metric with History Chart (Line Chart)
function PerformanceMetric({ icon, value, label, historyData, suffix = '' }) {
  const [showChart, setShowChart] = useState(false)
  const [period, setPeriod] = useState(30)
  
  const chartData = historyData?.[period] || []
  const max = Math.max(...chartData.map(d => d.value), 1)
  const min = Math.min(...chartData.map(d => d.value), 0)
  const range = max - min || 1
  
  // Build SVG line path
  const buildPath = () => {
    if (chartData.length < 2) return ''
    const width = 100
    const height = 50
    const padding = 2
    const stepX = (width - padding * 2) / (chartData.length - 1)
    
    return chartData.map((d, i) => {
      const x = padding + i * stepX
      const y = height - padding - ((d.value - min) / range) * (height - padding * 2)
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
    }).join(' ')
  }
  
  // Build area path (for fill)
  const buildAreaPath = () => {
    if (chartData.length < 2) return ''
    const width = 100
    const height = 50
    const padding = 2
    const stepX = (width - padding * 2) / (chartData.length - 1)
    
    let path = chartData.map((d, i) => {
      const x = padding + i * stepX
      const y = height - padding - ((d.value - min) / range) * (height - padding * 2)
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
    }).join(' ')
    
    // Close the path at the bottom
    const lastX = padding + (chartData.length - 1) * stepX
    path += ` L ${lastX} ${height - padding} L ${padding} ${height - padding} Z`
    return path
  }
  
  return (
    <div style={{
      background: 'var(--ui-card)',
      borderRadius: '12px',
      padding: '16px',
      border: '1px solid var(--ui-border)',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      position: 'relative'
    }}>
      <span style={{ 
        fontSize: '20px',
        width: '40px',
        height: '40px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--ui-bg)',
        borderRadius: '10px'
      }}>{icon}</span>
      
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--ui-text)' }}>{value}{suffix}</div>
        <div style={{ fontSize: '11px', color: 'var(--ui-text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
      </div>
      
      <button 
        onClick={() => setShowChart(!showChart)}
        title="Ver histórico"
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontSize: '16px',
          padding: '6px',
          borderRadius: '6px',
          opacity: 0.5,
          transition: 'opacity 0.2s'
        }}
        onMouseEnter={e => e.currentTarget.style.opacity = '1'}
        onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}
      >
        📈
      </button>
      
      {showChart && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          marginTop: '8px',
          background: 'var(--ui-card)',
          borderRadius: '12px',
          padding: '16px',
          border: '1px solid var(--ui-border)',
          zIndex: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '12px', color: 'var(--ui-text-dim)' }}>{label}</span>
            <div style={{ display: 'flex', gap: '4px' }}>
              {[30, 90, 180].map(p => (
                <button 
                  key={p}
                  onClick={() => setPeriod(p)}
                  style={{
                    padding: '4px 8px',
                    fontSize: '11px',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    background: period === p ? '#f97316' : 'var(--ui-bg)',
                    color: period === p ? 'white' : 'var(--ui-text-dim)',
                    fontWeight: period === p ? 600 : 400
                  }}
                >
                  {p}d
                </button>
              ))}
            </div>
          </div>
          
          {chartData.length > 1 ? (
            <>
              <svg viewBox="0 0 100 50" preserveAspectRatio="none" style={{ width: '100%', height: '60px' }}>
                <defs>
                  <linearGradient id="lineGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#f97316" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#f97316" stopOpacity="0.05" />
                  </linearGradient>
                </defs>
                <path d={buildAreaPath()} fill="url(#lineGradient)" />
                <path d={buildPath()} fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                {chartData.map((d, i) => {
                  const width = 100
                  const height = 50
                  const padding = 2
                  const stepX = (width - padding * 2) / (chartData.length - 1)
                  const x = padding + i * stepX
                  const y = height - padding - ((d.value - min) / range) * (height - padding * 2)
                  return <circle key={i} cx={x} cy={y} r="2" fill="#f97316" />
                })}
              </svg>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                {chartData.map((d, i) => (
                  <span key={i} style={{ fontSize: '10px', color: 'var(--ui-text-dim)' }} title={`${d.value}${suffix}`}>
                    {d.label}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <span style={{ fontSize: '12px', color: 'var(--ui-text-dim)' }}>Sem dados suficientes</span>
          )}
        </div>
      )}
    </div>
  )
}

// Modern Stat Card with decorative gradient
function StatCard({ title, value, subtitle, icon, color, trend, onClick }) {
  return (
    <div 
      onClick={onClick}
      style={{
        background: 'var(--ui-card)',
        borderRadius: '12px',
        padding: '20px',
        border: '1px solid var(--ui-border)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.2s ease',
        position: 'relative',
        overflow: 'hidden',
        minWidth: 0
      }}
      onMouseEnter={e => onClick && (e.currentTarget.style.transform = 'translateY(-2px)')}
      onMouseLeave={e => onClick && (e.currentTarget.style.transform = 'translateY(0)')}
    >
      {/* Decorative gradient circle */}
      <div style={{
        position: 'absolute',
        top: '-20px',
        right: '-20px',
        width: '80px',
        height: '80px',
        borderRadius: '50%',
        background: `radial-gradient(circle, ${color}20 0%, transparent 70%)`,
        pointerEvents: 'none'
      }} />
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <span style={{ fontSize: '16px' }}>{icon}</span>
        <span style={{ 
          fontSize: '11px', 
          color: 'var(--ui-text-dim)', 
          textTransform: 'uppercase', 
          letterSpacing: '0.5px',
          fontWeight: 500
        }}>{title}</span>
      </div>
      
      <div style={{ 
        fontSize: '32px', 
        fontWeight: 700, 
        color: color,
        lineHeight: 1,
        marginBottom: subtitle || trend ? '8px' : 0
      }}>
        {typeof value === 'number' ? <AnimatedCounter value={value} /> : value}
      </div>
      
      {(subtitle || trend) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
          {subtitle && <span style={{ fontSize: '12px', color: 'var(--ui-text-dim)' }}>{subtitle}</span>}
          {trend && (
            <span style={{
              fontSize: '11px',
              fontWeight: 600,
              color: trend > 0 ? '#22c55e' : '#ef4444',
              padding: '2px 6px',
              background: trend > 0 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
              borderRadius: '4px'
            }}>
              {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%
            </span>
          )}
        </div>
      )}
      
      {/* Subtle icon in corner */}
      <div style={{
        position: 'absolute',
        bottom: '12px',
        right: '16px',
        fontSize: '20px',
        opacity: 0.15
      }}>
        {icon}
      </div>
    </div>
  )
}

// Status Chip
function StatusChip({ status, count, onClick }) {
  const statusColors = {
    'ESPERA': '#f59e0b',
    'PREP': '#3b82f6',
    'A_FATURAR': '#8b5cf6',
    'FATURADA': '#06b6d4',
    'ROTA': '#10b981',
    'FALTAS': '#ef4444',
  }
  
  const color = statusColors[status] || '#6b7280'
  
  return (
    <div 
      className="status-chip" 
      onClick={onClick}
      style={{ '--chip-color': color }}
    >
      <span className="status-chip__dot" />
      <span className="status-chip__count">{count}</span>
      <span className="status-chip__label">{status.replace('_', ' ')}</span>
    </div>
  )
}

// Quick Action Button
function QuickAction({ icon, label, onClick, variant = 'default' }) {
  return (
    <button className={`quick-action quick-action--${variant}`} onClick={onClick}>
      <span className="quick-action__icon">{icon}</span>
      <span className="quick-action__label">{label}</span>
    </button>
  )
}

export default function Dashboard() {
  const { profile } = useAuth()
  const { can } = usePermissions()
  const navigate = useNavigate()
  const { filterByWarehouse } = useWarehouse() || {}
  const ordersQ = useOrders()
  const ordersRaw = useMemo(() => ordersQ.data || [], [ordersQ.data])
  const orders = useMemo(() => filterByWarehouse ? filterByWarehouse(ordersRaw) : ordersRaw, [ordersRaw, filterByWarehouse])
  const [greeting, setGreeting] = useState('Bom dia')

  // Set greeting based on time
  useEffect(() => {
    const hour = new Date().getHours()
    if (hour < 12) setGreeting('Bom dia')
    else if (hour < 19) setGreeting('Boa tarde')
    else setGreeting('Boa noite')
  }, [])

  // Calcular estatísticas
  const stats = useMemo(() => {
    const now = Date.now()
    const today = new Date().toISOString().slice(0, 10)
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const twoWeeksAgo = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    const active = orders.filter(o => 
      !isDeliveredStatus(o.status) && 
      !isCancelledStatus(o.status) && 
      !isBulkSubOrder(o) && 
      !isBulkBatchOrder(o)
    )

    const delivered = orders.filter(o => isDeliveredStatus(o.status))
    const deliveredWeek = delivered.filter(o => (o.date || '').slice(0, 10) >= weekAgo)
    const deliveredPrevWeek = delivered.filter(o => {
      const d = (o.date || '').slice(0, 10)
      return d >= twoWeeksAgo && d < weekAgo
    })
    const deliveredMonth = delivered.filter(o => (o.date || '').slice(0, 10) >= monthAgo)

    // Por estado
    const byStatus = {}
    for (const o of active) {
      byStatus[o.status] = (byStatus[o.status] || 0) + 1
    }

    // Alertas
    const atrasadas = active.filter(o => {
      const d = o.date ? new Date(o.date + 'T23:59:59').getTime() : null
      return d && d < now
    })

    const emEsperaLonga = active.filter(o => {
      if (o.status !== 'ESPERA') return false
      const created = o.createdAt ? new Date(o.createdAt).getTime() : null
      return created && (now - created) > 24 * 60 * 60 * 1000
    })

    const faltasPendentes = active.filter(o => o.status === 'FALTAS')

    // Valores
    const valorAtivo = active.reduce((s, o) => s + orderTotalValue(o), 0)
    const valorSemana = deliveredWeek.reduce((s, o) => s + orderTotalValue(o), 0)
    const valorSemanaAnterior = deliveredPrevWeek.reduce((s, o) => s + orderTotalValue(o), 0)
    const valorMes = deliveredMonth.reduce((s, o) => s + orderTotalValue(o), 0)

    // Para hoje
    const entregasHoje = active.filter(o => (o.date || '').slice(0, 10) === today).length

    // Dados para gráfico semanal (últimos 7 dias)
    const weeklyData = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - i * 24 * 60 * 60 * 1000)
      const dateStr = d.toISOString().slice(0, 10)
      const dayDelivered = delivered.filter(o => (o.date || '').slice(0, 10) === dateStr).length
      weeklyData.push({
        label: d.toLocaleDateString('pt-PT', { weekday: 'short' }).slice(0, 3),
        value: dayDelivered
      })
    }

    // Top 5 Clientes (por valor no último mês)
    const clientValues = {}
    for (const o of deliveredMonth) {
      const name = o.clientName || 'N/A'
      clientValues[name] = (clientValues[name] || 0) + orderTotalValue(o)
    }
    const topClients = Object.entries(clientValues)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, value]) => ({ name, value }))

    // Valor médio por encomenda
    const avgOrderValue = deliveredMonth.length > 0 
      ? valorMes / deliveredMonth.length 
      : 0

    // Taxa de sucesso (entregues vs total processado)
    const processedTotal = delivered.length + orders.filter(o => isCancelledStatus(o.status)).length
    const successRate = processedTotal > 0 
      ? Math.round((delivered.length / processedTotal) * 100) 
      : 100

    // Tempo médio de processamento (da criação à entrega, em dias)
    let avgProcessingTime = 0
    const deliveredWithDates = delivered.filter(o => o.createdAt && o.date)
    if (deliveredWithDates.length > 0) {
      const totalDays = deliveredWithDates.reduce((sum, o) => {
        const created = new Date(o.createdAt).getTime()
        const deliveredDate = new Date(o.date).getTime()
        return sum + Math.max(0, (deliveredDate - created) / (1000 * 60 * 60 * 24))
      }, 0)
      avgProcessingTime = totalDays / deliveredWithDates.length
    }

    // Atividade recente (últimas 8 encomendas criadas/modificadas)
    const recentActivity = [...orders]
      .filter(o => !isBulkSubOrder(o) && !isBulkBatchOrder(o))
      .sort((a, b) => {
        const dateA = a.updatedAt || a.createdAt || ''
        const dateB = b.updatedAt || b.createdAt || ''
        return dateB.localeCompare(dateA)
      })
      .slice(0, 8)
      .map(o => ({
        id: o.id,
        orderNo: o.orderNo || o.id?.slice(-6),
        client: o.clientName || 'N/A',
        status: o.status,
        date: o.updatedAt || o.createdAt,
        value: orderTotalValue(o)
      }))

    // Próximas entregas (próximos 5 dias)
    const upcomingDeliveries = []
    for (let i = 0; i <= 5; i++) {
      const d = new Date(now + i * 24 * 60 * 60 * 1000)
      const dateStr = d.toISOString().slice(0, 10)
      const dayOrders = active.filter(o => (o.date || '').slice(0, 10) === dateStr)
      if (dayOrders.length > 0) {
        upcomingDeliveries.push({
          date: dateStr,
          label: i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : d.toLocaleDateString('pt-PT', { weekday: 'short', day: 'numeric' }),
          count: dayOrders.length,
          value: dayOrders.reduce((s, o) => s + orderTotalValue(o), 0)
        })
      }
    }

    // Histórico de métricas para gráficos (30, 90, 180 dias)
    const buildHistoryData = (daysBack, bucketSize) => {
      const buckets = []
      const numBuckets = Math.ceil(daysBack / bucketSize)
      
      for (let i = numBuckets - 1; i >= 0; i--) {
        const startDate = new Date(now - (i + 1) * bucketSize * 24 * 60 * 60 * 1000)
        const endDate = new Date(now - i * bucketSize * 24 * 60 * 60 * 1000)
        const startStr = startDate.toISOString().slice(0, 10)
        const endStr = endDate.toISOString().slice(0, 10)
        
        const bucketOrders = delivered.filter(o => {
          const d = (o.date || '').slice(0, 10)
          return d >= startStr && d < endStr
        })
        
        buckets.push({
          startDate: startStr,
          endDate: endStr,
          orders: bucketOrders
        })
      }
      
      return buckets
    }
    
    // Dados para valor médio por período
    const avgValueHistory = {
      30: buildHistoryData(30, 5).map((b, i) => ({
        label: `S${i + 1}`,
        value: b.orders.length > 0 
          ? Math.round(b.orders.reduce((s, o) => s + orderTotalValue(o), 0) / b.orders.length)
          : 0
      })),
      90: buildHistoryData(90, 15).map((b, i) => ({
        label: `M${i + 1}`,
        value: b.orders.length > 0 
          ? Math.round(b.orders.reduce((s, o) => s + orderTotalValue(o), 0) / b.orders.length)
          : 0
      })),
      180: buildHistoryData(180, 30).map((b, i) => ({
        label: `M${i + 1}`,
        value: b.orders.length > 0 
          ? Math.round(b.orders.reduce((s, o) => s + orderTotalValue(o), 0) / b.orders.length)
          : 0
      }))
    }
    
    // Dados para taxa de sucesso por período
    const successRateHistory = {
      30: buildHistoryData(30, 5).map((b, i) => {
        const bucketDelivered = b.orders.length
        const bucketCancelled = orders.filter(o => {
          const d = (o.date || o.createdAt || '').slice(0, 10)
          return isCancelledStatus(o.status) && d >= b.startDate && d < b.endDate
        }).length
        const total = bucketDelivered + bucketCancelled
        return {
          label: `S${i + 1}`,
          value: total > 0 ? Math.round((bucketDelivered / total) * 100) : 100
        }
      }),
      90: buildHistoryData(90, 15).map((b, i) => {
        const bucketDelivered = b.orders.length
        const bucketCancelled = orders.filter(o => {
          const d = (o.date || o.createdAt || '').slice(0, 10)
          return isCancelledStatus(o.status) && d >= b.startDate && d < b.endDate
        }).length
        const total = bucketDelivered + bucketCancelled
        return {
          label: `M${i + 1}`,
          value: total > 0 ? Math.round((bucketDelivered / total) * 100) : 100
        }
      }),
      180: buildHistoryData(180, 30).map((b, i) => {
        const bucketDelivered = b.orders.length
        const bucketCancelled = orders.filter(o => {
          const d = (o.date || o.createdAt || '').slice(0, 10)
          return isCancelledStatus(o.status) && d >= b.startDate && d < b.endDate
        }).length
        const total = bucketDelivered + bucketCancelled
        return {
          label: `M${i + 1}`,
          value: total > 0 ? Math.round((bucketDelivered / total) * 100) : 100
        }
      })
    }
    
    // Dados para tempo médio por período
    const processingTimeHistory = {
      30: buildHistoryData(30, 5).map((b, i) => {
        const withDates = b.orders.filter(o => o.createdAt && o.date)
        if (withDates.length === 0) return { label: `S${i + 1}`, value: 0 }
        const totalDays = withDates.reduce((sum, o) => {
          const created = new Date(o.createdAt).getTime()
          const del = new Date(o.date).getTime()
          return sum + Math.max(0, (del - created) / (1000 * 60 * 60 * 24))
        }, 0)
        return { label: `S${i + 1}`, value: Math.round((totalDays / withDates.length) * 10) / 10 }
      }),
      90: buildHistoryData(90, 15).map((b, i) => {
        const withDates = b.orders.filter(o => o.createdAt && o.date)
        if (withDates.length === 0) return { label: `M${i + 1}`, value: 0 }
        const totalDays = withDates.reduce((sum, o) => {
          const created = new Date(o.createdAt).getTime()
          const del = new Date(o.date).getTime()
          return sum + Math.max(0, (del - created) / (1000 * 60 * 60 * 24))
        }, 0)
        return { label: `M${i + 1}`, value: Math.round((totalDays / withDates.length) * 10) / 10 }
      }),
      180: buildHistoryData(180, 30).map((b, i) => {
        const withDates = b.orders.filter(o => o.createdAt && o.date)
        if (withDates.length === 0) return { label: `M${i + 1}`, value: 0 }
        const totalDays = withDates.reduce((sum, o) => {
          const created = new Date(o.createdAt).getTime()
          const del = new Date(o.date).getTime()
          return sum + Math.max(0, (del - created) / (1000 * 60 * 60 * 24))
        }, 0)
        return { label: `M${i + 1}`, value: Math.round((totalDays / withDates.length) * 10) / 10 }
      })
    }

    return {
      total: orders.length,
      active: active.length,
      delivered: delivered.length,
      deliveredWeek: deliveredWeek.length,
      deliveredPrevWeek: deliveredPrevWeek.length,
      deliveredMonth: deliveredMonth.length,
      byStatus,
      atrasadas,
      emEsperaLonga,
      faltasPendentes,
      valorAtivo,
      valorSemana,
      valorSemanaAnterior,
      valorMes,
      entregasHoje,
      weeklyData,
      topClients,
      avgOrderValue,
      successRate,
      avgProcessingTime,
      recentActivity,
      upcomingDeliveries,
      avgValueHistory,
      successRateHistory,
      processingTimeHistory,
    }
  }, [orders])

  const firstName = (profile?.name || profile?.email || 'Utilizador').split(' ')[0]

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Hero Section */}
      <header style={{ marginBottom: '24px' }}>
        <h1 style={{ 
          margin: 0, 
          fontSize: '28px',
          fontWeight: 400,
          color: 'var(--ui-text)'
        }}>
          {greeting}, <span style={{ 
            color: '#f97316',
            fontWeight: 600
          }}>{firstName}</span>
        </h1>
        <p style={{ 
          margin: '4px 0 0', 
          color: 'var(--ui-text-dim)',
          fontSize: '14px'
        }}>
          Resumo das operações • {new Date().toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </header>

      {/* Alerts */}
      {(stats.atrasadas.length > 0 || stats.emEsperaLonga.length > 0 || stats.faltasPendentes.length > 0) && (
        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
          {stats.atrasadas.length > 0 && (
            <div 
              onClick={() => navigate('/pipeline')}
              style={{
                flex: 1,
                minWidth: '250px',
                background: 'var(--ui-card)',
                borderRadius: '12px',
                padding: '16px 20px',
                border: '1px solid rgba(239,68,68,0.3)',
                borderLeft: '4px solid #ef4444',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                transition: 'transform 0.2s'
              }}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateX(4px)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'translateX(0)'}
            >
              <span style={{ fontSize: '20px' }}>⚠️</span>
              <div style={{ flex: 1 }}>
                <strong style={{ color: '#ef4444' }}>{stats.atrasadas.length}</strong>
                <span style={{ color: 'var(--ui-text)', marginLeft: '6px' }}>
                  encomenda{stats.atrasadas.length > 1 ? 's' : ''} atrasada{stats.atrasadas.length > 1 ? 's' : ''}
                </span>
              </div>
              <span style={{ color: 'var(--ui-text-dim)' }}>→</span>
            </div>
          )}
          {stats.faltasPendentes.length > 0 && (
            <div 
              onClick={() => navigate('/compras')}
              style={{
                flex: 1,
                minWidth: '250px',
                background: 'var(--ui-card)',
                borderRadius: '12px',
                padding: '16px 20px',
                border: '1px solid rgba(249,115,22,0.3)',
                borderLeft: '4px solid #f97316',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                transition: 'transform 0.2s'
              }}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateX(4px)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'translateX(0)'}
            >
              <span style={{ fontSize: '20px' }}>📦</span>
              <div style={{ flex: 1 }}>
                <strong style={{ color: '#f97316' }}>{stats.faltasPendentes.length}</strong>
                <span style={{ color: 'var(--ui-text)', marginLeft: '6px' }}>com faltas de produto</span>
              </div>
              <span style={{ color: 'var(--ui-text-dim)' }}>→</span>
            </div>
          )}
        </div>
      )}

      {/* Main Stats + Chart Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '20px', marginBottom: '24px' }}>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
          <StatCard 
            icon="📦"
            title="Ativas" 
            value={stats.active} 
            color="#3b82f6"
            onClick={() => navigate('/pipeline')}
          />
          <StatCard 
            icon="📅"
            title="Hoje" 
            value={stats.entregasHoje} 
            color="#10b981"
          />
          <StatCard 
            icon="✅"
            title="Semana" 
            value={stats.deliveredWeek} 
            color="#8b5cf6"
          />
          <StatCard 
            icon="💰"
            title="Pipeline" 
            value={`${(stats.valorAtivo / 1000).toFixed(1)}k€`} 
            color="#f97316"
          />
        </div>

        {/* Weekly Chart */}
        <MiniBarChart data={stats.weeklyData} label="Entregas (7 dias)" />
      </div>

      {/* Comparisons Row */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ 
          margin: '0 0 16px',
          fontSize: '15px',
          fontWeight: 600,
          color: 'var(--ui-text)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span>📊</span> Comparativo Semanal
        </h2>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <ComparisonCard 
            icon="📦"
            title="Entregas"
            current={stats.deliveredWeek}
            previous={stats.deliveredPrevWeek}
          />
          <ComparisonCard 
            icon="💰"
            title="Faturação"
            current={`${(stats.valorSemana/1000).toFixed(1)}k€`}
            previous={`${(stats.valorSemanaAnterior/1000).toFixed(1)}k€`}
          />
        </div>
      </div>

      {/* Performance + Top Clients Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
        {/* Performance Metrics */}
        <div>
          <h2 style={{ 
            margin: '0 0 16px',
            fontSize: '15px',
            fontWeight: 600,
            color: 'var(--ui-text)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span>⏱️</span> Performance
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <PerformanceMetric
              icon="💵"
              value={stats.avgOrderValue.toFixed(0)}
              suffix="€"
              label="Valor médio"
              historyData={stats.avgValueHistory}
            />
            <PerformanceMetric
              icon="✅"
              value={stats.successRate}
              suffix="%"
              label="Taxa sucesso"
              historyData={stats.successRateHistory}
            />
            <PerformanceMetric
              icon="⏳"
              value={stats.avgProcessingTime.toFixed(1)}
              suffix="d"
              label="Tempo médio"
              historyData={stats.processingTimeHistory}
            />
          </div>
        </div>

        {/* Top Clients */}
        <div>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            marginBottom: '16px'
          }}>
            <h2 style={{ 
              margin: 0,
              fontSize: '15px',
              fontWeight: 600,
              color: 'var(--ui-text)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span>🏆</span> Top Clientes
            </h2>
            <span style={{
              padding: '4px 10px',
              background: 'var(--ui-bg)',
              borderRadius: '12px',
              fontSize: '11px',
              color: 'var(--ui-text-dim)',
              textTransform: 'uppercase'
            }}>últimos 30 dias</span>
          </div>
          
          <div style={{
            background: 'var(--ui-card)',
            borderRadius: '12px',
            border: '1px solid var(--ui-border)',
            overflow: 'hidden'
          }}>
            {stats.topClients.length > 0 ? (
              stats.topClients.map((client, i) => (
                <div 
                  key={client.name} 
                  onClick={() => navigate('/clientes')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '14px 16px',
                    borderBottom: i < stats.topClients.length - 1 ? '1px solid var(--ui-border)' : 'none',
                    cursor: 'pointer',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    background: i === 0 ? 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)' : 'var(--ui-bg)',
                    color: i === 0 ? 'white' : 'var(--ui-text-dim)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: 600,
                    marginRight: '12px'
                  }}>{i + 1}</span>
                  <span style={{ flex: 1, color: 'var(--ui-text)', fontSize: '14px' }}>{client.name}</span>
                  <span style={{ color: '#22c55e', fontWeight: 600, fontSize: '14px' }}>
                    {(client.value / 1000).toFixed(1)}k€
                  </span>
                </div>
              ))
            ) : (
              <p style={{ padding: '20px', textAlign: 'center', color: 'var(--ui-text-dim)', margin: 0 }}>
                Sem dados de clientes
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Activity + Upcoming Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
        {/* Recent Activity */}
        <div>
          <h2 style={{ 
            margin: '0 0 16px',
            fontSize: '15px',
            fontWeight: 600,
            color: 'var(--ui-text)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span>🕐</span> Atividade Recente
          </h2>
          
          <div style={{
            background: 'var(--ui-card)',
            borderRadius: '12px',
            border: '1px solid var(--ui-border)',
            overflow: 'hidden'
          }}>
            {stats.recentActivity.length > 0 ? (
              stats.recentActivity.map((item, i) => (
                <div 
                  key={item.id} 
                  onClick={() => navigate('/pipeline')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    borderBottom: i < stats.recentActivity.length - 1 ? '1px solid var(--ui-border)' : 'none',
                    cursor: 'pointer',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ 
                      color: '#3b82f6', 
                      fontSize: '13px', 
                      fontWeight: 600,
                      fontFamily: 'monospace'
                    }}>#{item.orderNo}</span>
                    <span style={{ color: 'var(--ui-text)', fontSize: '13px' }}>{item.client}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                      padding: '3px 8px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      background: item.status === 'ENTREGUE' ? 'rgba(34,197,94,0.15)' : 
                                  item.status === 'ESPERA' ? 'rgba(249,115,22,0.15)' : 
                                  item.status === 'PREP' ? 'rgba(59,130,246,0.15)' : 'rgba(139,92,246,0.15)',
                      color: item.status === 'ENTREGUE' ? '#22c55e' : 
                             item.status === 'ESPERA' ? '#f97316' : 
                             item.status === 'PREP' ? '#3b82f6' : '#8b5cf6'
                    }}>{item.status}</span>
                    <span style={{ color: 'var(--ui-text-dim)', fontSize: '12px' }}>{item.value.toFixed(0)}€</span>
                  </div>
                </div>
              ))
            ) : (
              <p style={{ padding: '20px', textAlign: 'center', color: 'var(--ui-text-dim)', margin: 0 }}>
                Sem atividade recente
              </p>
            )}
          </div>
        </div>

        {/* Upcoming Deliveries */}
        <div>
          <h2 style={{ 
            margin: '0 0 16px',
            fontSize: '15px',
            fontWeight: 600,
            color: 'var(--ui-text)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span>📅</span> Próximas Entregas
          </h2>
          
          <div style={{
            background: 'var(--ui-card)',
            borderRadius: '12px',
            border: '1px solid var(--ui-border)',
            overflow: 'hidden'
          }}>
            {stats.upcomingDeliveries.length > 0 ? (
              stats.upcomingDeliveries.map((day, i) => (
                <div 
                  key={day.date}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '14px 16px',
                    borderBottom: i < stats.upcomingDeliveries.length - 1 ? '1px solid var(--ui-border)' : 'none'
                  }}
                >
                  <span style={{ 
                    fontWeight: 600, 
                    color: day.label === 'Hoje' ? '#f97316' : 'var(--ui-text)',
                    minWidth: '80px'
                  }}>{day.label}</span>
                  <span style={{ 
                    flex: 1, 
                    color: 'var(--ui-text-dim)',
                    fontSize: '13px'
                  }}>
                    {day.count} encomenda{day.count > 1 ? 's' : ''}
                  </span>
                  <span style={{ 
                    color: '#22c55e', 
                    fontWeight: 600,
                    fontSize: '14px'
                  }}>
                    {(day.value / 1000).toFixed(1)}k€
                  </span>
                </div>
              ))
            ) : (
              <p style={{ padding: '20px', textAlign: 'center', color: 'var(--ui-text-dim)', margin: 0 }}>
                Sem entregas agendadas
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Pipeline Status */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          marginBottom: '16px'
        }}>
          <h2 style={{ 
            margin: 0,
            fontSize: '15px',
            fontWeight: 600,
            color: 'var(--ui-text)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span>📋</span> Pipeline
          </h2>
          <button 
            onClick={() => navigate('/pipeline')}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#f97316',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500
            }}
          >
            Ver tudo →
          </button>
        </div>
        
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {Object.entries(stats.byStatus).map(([status, count]) => {
            const statusColors = {
              'ESPERA': '#f59e0b',
              'PREP': '#3b82f6',
              'A_FATURAR': '#8b5cf6',
              'FATURADA': '#06b6d4',
              'ROTA': '#10b981',
              'FALTAS': '#ef4444',
            }
            const color = statusColors[status] || '#6b7280'
            
            return (
              <div
                key={status}
                onClick={() => navigate('/pipeline')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 16px',
                  background: 'var(--ui-card)',
                  borderRadius: '20px',
                  border: '1px solid var(--ui-border)',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = color}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--ui-border)'}
              >
                <span style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: color
                }} />
                <span style={{ fontWeight: 700, color }}>{count}</span>
                <span style={{ color: 'var(--ui-text-dim)', fontSize: '12px' }}>
                  {status.replace('_', ' ')}
                </span>
              </div>
            )
          })}
          {Object.keys(stats.byStatus).length === 0 && (
            <p style={{ color: 'var(--ui-text-dim)', margin: 0 }}>Sem encomendas ativas 🎉</p>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 style={{ 
          margin: '0 0 16px',
          fontSize: '15px',
          fontWeight: 600,
          color: 'var(--ui-text)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span>⚡</span> Ações Rápidas
        </h2>
        
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {can('orders.create') && (
            <button
              onClick={() => navigate('/nova-encomenda')}
              style={{
                padding: '12px 20px',
                background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'transform 0.2s, box-shadow 0.2s'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(249,115,22,0.3)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              <span>➕</span> Nova Encomenda
            </button>
          )}
          
          {[
            { icon: '📋', label: 'Pipeline', path: '/pipeline', perm: true },
            { icon: '🏭', label: 'Armazém', path: '/armazem', perm: can('warehouse.view') },
            { icon: '🚚', label: 'Rotas', path: '/rotas', perm: can('routes.view') },
            { icon: '📄', label: 'Faturação', path: '/faturacao', perm: can('invoicing.view') },
            { icon: '🛒', label: 'Compras', path: '/compras', perm: can('purchases.view') },
          ].filter(a => a.perm).map(action => (
            <button
              key={action.path}
              onClick={() => navigate(action.path)}
              style={{
                padding: '12px 20px',
                background: 'var(--ui-card)',
                color: 'var(--ui-text)',
                border: '1px solid var(--ui-border)',
                borderRadius: '10px',
                cursor: 'pointer',
                fontWeight: 500,
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = '#f97316'
                e.currentTarget.style.transform = 'translateY(-2px)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--ui-border)'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              <span>{action.icon}</span> {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
