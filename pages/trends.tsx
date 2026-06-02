import { useEffect, useState } from 'react'
import Layout from '@/components/Layout'
import { supabase } from '@/lib/supabase'
import { formatWeekKey } from '@/lib/utils'

type WeekMetric = {
  week_key: string
  active_days: number
  total_messages: number
  participation_rate: number
  proactive_posts: number
  status: string
  ranger_name: string
  wag_name: string
  ranger_id: string
}

type RangerTrend = {
  ranger_id: string
  ranger_name: string
  wag_name: string
  metrics: WeekMetric[]
}

export default function TrendsPage() {
  const [trends, setTrends] = useState<RangerTrend[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMetric, setSelectedMetric] = useState<'total_messages' | 'active_days' | 'participation_rate' | 'proactive_posts'>('total_messages')
  const [selectedRangerId, setSelectedRangerId] = useState<string>('semua')

  useEffect(() => { fetchTrends() }, [])

  const fetchTrends = async () => {
    const { data } = await supabase
      .from('rangers')
      .select('id, full_name, wags(name), weekly_metrics(week_key, active_days, total_messages, participation_rate, proactive_posts, status)')
      .eq('status', 'active')

    if (!data) { setLoading(false); return }

    const result: RangerTrend[] = (data as unknown as {
      id: string
      full_name: string
      wags: { name: string }
      weekly_metrics: WeekMetric[]
    }[]).map(r => ({
      ranger_id: r.id,
      ranger_name: r.full_name,
      wag_name: r.wags?.name || '—',
      metrics: [...(r.weekly_metrics || [])].sort((a, b) => a.week_key.localeCompare(b.week_key)),
    }))

    setTrends(result)
    setLoading(false)
  }

  const metricConfig = {
    total_messages: { label: 'Total Pesan Ranger', unit: 'pesan', target: 10, desc: 'Jumlah pesan Ranger per minggu' },
    active_days: { label: 'Hari Aktif', unit: 'hari', target: 3, desc: 'Hari Ranger aktif di WAG per minggu' },
    participation_rate: { label: 'Participation Rate', unit: '%', target: 40, desc: '% agen aktif dalam 30 hari terakhir' },
    proactive_posts: { label: 'Proactive Posts', unit: 'pesan', target: 5, desc: 'Pesan inisiasi Ranger (bukan balasan)' },
  }

  const mc = metricConfig[selectedMetric]

  const displayedTrends = selectedRangerId === 'semua'
    ? trends
    : trends.filter(t => t.ranger_id === selectedRangerId)

  // Kumpulkan semua week_key unik dari semua ranger
  const allWeeks = [...new Set(trends.flatMap(t => t.metrics.map(m => m.week_key)))].sort()

  // Hitung agregat semua Ranger per minggu
  const aggregated = allWeeks.map(wk => {
    const vals = trends.map(t => t.metrics.find(m => m.week_key === wk)?.[selectedMetric] ?? 0)
    const avg = vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0
    return { week_key: wk, avg, vals }
  })

  const maxVal = Math.max(...aggregated.map(a => a.avg), mc.target, 1)

  if (loading) return (
    <Layout title="Tren">
      <div style={{ color: '#999', fontSize: '13px' }}>Memuat data...</div>
    </Layout>
  )

  return (
    <Layout title="Tren">

      {/* Controls */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Metric selector */}
        <div style={{ display: 'flex', gap: '4px', background: '#F8F9FB', padding: '4px', borderRadius: '10px', border: '1px solid #e5e5e5' }}>
          {(Object.keys(metricConfig) as (keyof typeof metricConfig)[]).map(k => (
            <button key={k} onClick={() => setSelectedMetric(k)}
              style={{
                padding: '6px 14px', borderRadius: '8px', border: 'none', fontSize: '12px', cursor: 'pointer',
                background: selectedMetric === k ? '#FFFFFF' : 'transparent',
                color: selectedMetric === k ? '#000000' : '#999',
                fontWeight: selectedMetric === k ? '500' : '400',
                boxShadow: selectedMetric === k ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {metricConfig[k].label}
            </button>
          ))}
        </div>

        {/* Ranger filter */}
        <select
          value={selectedRangerId}
          onChange={e => setSelectedRangerId(e.target.value)}
          style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #e5e5e5', fontSize: '12px', outline: 'none', background: '#FFFFFF' }}
        >
          <option value="semua">Semua Ranger</option>
          {trends.map(t => (
            <option key={t.ranger_id} value={t.ranger_id}>{t.ranger_name}</option>
          ))}
        </select>

        <div style={{ fontSize: '12px', color: '#999', marginLeft: 'auto' }}>{mc.desc} · Target: {mc.target} {mc.unit}</div>
      </div>

      {/* Agregat chart — semua ranger */}
      {selectedRangerId === 'semua' && (
        <div style={{ background: '#FFFFFF', border: '1px solid #e5e5e5', borderRadius: '10px', padding: '20px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: '500' }}>Rata-rata semua Ranger — {mc.label}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#999' }}>
              <div style={{ width: '20px', height: '2px', background: '#E24B4A', borderRadius: '1px' }} />
              Target {mc.target} {mc.unit}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', height: '120px' }}>
            {aggregated.map(a => {
              const pct = (a.avg / maxVal) * 100
              const targetPct = (mc.target / maxVal) * 100
              const barColor = a.avg < mc.target * 0.5 ? '#E24B4A' : a.avg < mc.target ? '#FFC128' : '#0344D8'
              return (
                <div key={a.week_key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', height: '100%', justifyContent: 'flex-end', position: 'relative' }}>
                  {/* Target line */}
                  <div style={{ position: 'absolute', bottom: `${targetPct}%`, left: 0, right: 0, height: '1px', background: '#E24B4A', opacity: 0.4 }} />
                  <div style={{ fontSize: '11px', fontWeight: '500', color: barColor }}>{a.avg}</div>
                  <div style={{ width: '100%', height: `${Math.max(pct, 3)}%`, background: barColor, borderRadius: '4px 4px 0 0', opacity: 0.85 }} />
                  <div style={{ fontSize: '10px', color: '#999', whiteSpace: 'nowrap', textAlign: 'center' }}>{formatWeekKey(a.week_key)}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Per Ranger charts */}
      <div style={{ display: 'grid', gridTemplateColumns: displayedTrends.length === 1 ? '1fr' : 'repeat(auto-fill, minmax(340px, 1fr))', gap: '14px' }}>
        {displayedTrends.map(t => {
          const vals = t.metrics.map(m => m[selectedMetric] as number)
          const max = Math.max(...vals, mc.target, 1)
          const latest = vals[vals.length - 1] ?? 0
          const prev = vals[vals.length - 2] ?? 0
          const trend = latest > prev ? 'up' : latest < prev ? 'down' : 'flat'
          const trendColor = trend === 'up' ? '#27500A' : trend === 'down' ? '#B00020' : '#999'
          const trendIcon = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'

          return (
            <div key={t.ranger_id} style={{ background: '#FFFFFF', border: '1px solid #e5e5e5', borderRadius: '10px', padding: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '14px' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '500' }}>{t.ranger_name}</div>
                  <div style={{ fontSize: '11px', color: '#999', marginTop: '2px' }}>{t.wag_name}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '20px', fontWeight: '600', color: latest < mc.target * 0.5 ? '#B00020' : latest < mc.target ? '#856404' : '#0344D8' }}>
                    {latest}{mc.unit === '%' ? '%' : ''}
                  </div>
                  <div style={{ fontSize: '11px', color: trendColor, marginTop: '2px' }}>
                    {trendIcon} vs minggu lalu
                  </div>
                </div>
              </div>

              {/* Mini chart */}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '80px' }}>
                {t.metrics.map((m, i) => {
                  const val = m[selectedMetric] as number
                  const pct = (val / max) * 100
                  const isLatest = i === t.metrics.length - 1
                  const barColor = val < mc.target * 0.5 ? '#E24B4A' : val < mc.target ? '#FFC128' : '#0344D8'
                  return (
                    <div key={m.week_key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', height: '100%', justifyContent: 'flex-end' }}>
                      <div style={{ fontSize: '10px', fontWeight: isLatest ? '600' : '400', color: isLatest ? barColor : '#bbb' }}>{val}{mc.unit === '%' ? '%' : ''}</div>
                      <div style={{ width: '100%', height: `${Math.max(pct, 3)}%`, background: barColor, borderRadius: '3px 3px 0 0', opacity: isLatest ? 1 : 0.5 }} />
                      <div style={{ fontSize: '9px', color: '#bbb', whiteSpace: 'nowrap' }}>{formatWeekKey(m.week_key)}</div>
                    </div>
                  )
                })}
                {t.metrics.length === 0 && <div style={{ fontSize: '12px', color: '#999' }}>Belum ada data</div>}
              </div>

              {/* Target indicator */}
              <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ flex: 1, height: '4px', background: '#F8F9FB', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min((latest / mc.target) * 100, 100)}%`, height: '100%', background: latest >= mc.target ? '#0344D8' : latest >= mc.target * 0.5 ? '#FFC128' : '#E24B4A', borderRadius: '2px' }} />
                </div>
                <div style={{ fontSize: '10px', color: '#999', whiteSpace: 'nowrap' }}>
                  {latest >= mc.target ? '✓ Target tercapai' : `${Math.round((latest / mc.target) * 100)}% dari target`}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Summary table */}
      <div style={{ background: '#FFFFFF', border: '1px solid #e5e5e5', borderRadius: '10px', overflow: 'hidden', marginTop: '16px' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5e5e5', fontSize: '13px', fontWeight: '500' }}>
          Ringkasan semua metrik — periode terakhir
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e5e5e5' }}>
              {['Ranger', 'WAG', 'Total Pesan', 'Hari Aktif', 'Participation', 'Proactive', 'Status'].map(h => (
                <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: '11px', color: '#999', fontWeight: '500' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {trends.map(t => {
              const latest = t.metrics[t.metrics.length - 1]
              if (!latest) return null
              const s = latest.status
              const sc = { critical: { bg: '#FDECEA', color: '#B00020', label: 'Kritis' }, warning: { bg: '#FFF3CD', color: '#856404', label: 'Waspada' }, healthy: { bg: '#EAF3DE', color: '#27500A', label: 'Sehat' } }
              const style = sc[s as keyof typeof sc] || sc.healthy
              return (
                <tr key={t.ranger_id} style={{ borderBottom: '1px solid #f5f5f5' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#F8F9FB')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '10px 14px', fontWeight: '500' }}>{t.ranger_name}</td>
                  <td style={{ padding: '10px 14px', color: '#999' }}>{t.wag_name}</td>
                  <td style={{ padding: '10px 14px', color: latest.total_messages < 10 ? '#B00020' : '#27500A', fontWeight: '500' }}>{latest.total_messages}</td>
                  <td style={{ padding: '10px 14px', color: latest.active_days < 3 ? '#B00020' : '#27500A', fontWeight: '500' }}>{latest.active_days}/7</td>
                  <td style={{ padding: '10px 14px', color: latest.participation_rate < 40 ? '#B00020' : '#27500A', fontWeight: '500' }}>{latest.participation_rate}%</td>
                  <td style={{ padding: '10px 14px', color: '#555' }}>{latest.proactive_posts}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: style.bg, color: style.color, fontWeight: '500' }}>
                      {style.label}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

    </Layout>
  )
}
