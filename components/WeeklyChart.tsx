import { useState } from 'react'
import { formatWeekKey } from '@/lib/utils'

type MetricPoint = {
  week_key: string
  value: number
  status?: string
}

type Props = {
  data: MetricPoint[]
  target?: number
  unit?: string
  color?: string
  height?: number
}

export default function WeeklyChart({ data, target, unit = '', color = '#0344D8', height = 80 }: Props) {
  const PER_PAGE = 4
  const sorted = [...data].sort((a, b) => a.week_key.localeCompare(b.week_key))
  const totalPages = Math.ceil(sorted.length / PER_PAGE)
  const [currentPage, setCurrentPage] = useState(totalPages > 0 ? totalPages - 1 : 0)

  const slice = sorted.slice(currentPage * PER_PAGE, currentPage * PER_PAGE + PER_PAGE)
  const padded = [...slice]
  while (padded.length < PER_PAGE) padded.push({ week_key: '', value: 0 })

  const maxVal = Math.max(...padded.map(s => s.value), target || 0, 1)

  const getBarColor = (val: number, status?: string) => {
    if (status === 'critical') return '#E24B4A'
    if (status === 'warning') return '#FFC128'
    if (status === 'healthy') return color
    if (target) {
      if (val < target * 0.5) return '#E24B4A'
      if (val < target) return '#FFC128'
    }
    return color
  }

  return (
    <div>
      {/* Navigation */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <button
            onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
            disabled={currentPage === 0}
            style={{
              padding: '3px 10px', fontSize: '11px', borderRadius: '6px',
              border: '1px solid #e5e5e5',
              background: currentPage === 0 ? '#F8F9FB' : '#FFFFFF',
              color: currentPage === 0 ? '#bbb' : '#555',
              cursor: currentPage === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            ← Sebelumnya
          </button>
          <span style={{ fontSize: '11px', color: '#999' }}>
            {currentPage + 1} / {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={currentPage >= totalPages - 1}
            style={{
              padding: '3px 10px', fontSize: '11px', borderRadius: '6px',
              border: '1px solid #e5e5e5',
              background: currentPage >= totalPages - 1 ? '#F8F9FB' : '#FFFFFF',
              color: currentPage >= totalPages - 1 ? '#bbb' : '#555',
              cursor: currentPage >= totalPages - 1 ? 'not-allowed' : 'pointer',
            }}
          >
            Berikutnya →
          </button>
        </div>
      )}

      {/* Chart */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: `${height}px`, position: 'relative' }}>
        {target && (
          <div style={{
            position: 'absolute', left: 0, right: 0,
            bottom: `${Math.min((target / maxVal) * 100, 98)}%`,
            borderTop: '1px dashed #E24B4A', opacity: 0.4,
          }} />
        )}
        {padded.map((m, i) => {
          if (!m.week_key) return (
            <div key={`empty-${i}`} style={{ flex: 1, height: '20%', background: '#F8F9FB', borderRadius: '4px 4px 0 0', opacity: 0.3 }} />
          )
          const pct = (m.value / maxVal) * 100
          const barColor = getBarColor(m.value, m.status)
          const isLatestPage = currentPage === totalPages - 1
          const isLastBar = i === slice.length - 1
          const highlight = isLatestPage && isLastBar
          return (
            <div key={m.week_key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', height: '100%', justifyContent: 'flex-end' }}>
              <div style={{ fontSize: '10px', fontWeight: highlight ? '600' : '400', color: highlight ? barColor : '#bbb' }}>
                {m.value}{unit === '%' ? '%' : ''}
              </div>
              <div style={{
                width: '100%', height: `${Math.max(pct, 3)}%`,
                background: barColor, borderRadius: '4px 4px 0 0',
                opacity: highlight ? 1 : 0.55,
              }} />
              <div style={{ fontSize: '9px', color: '#bbb', whiteSpace: 'nowrap', textAlign: 'center' }}>
                {formatWeekKey(m.week_key)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
