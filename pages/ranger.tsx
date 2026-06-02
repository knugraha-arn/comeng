import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Layout from '@/components/Layout'
import { supabase } from '@/lib/supabase'
import { formatWeekKey } from '@/lib/utils'

type RangerData = {
  id: string
  full_name: string
  display_name: string
  phone_number: string
  status: string
  wags: { id: string; name: string }
  weekly_metrics: {
    week_key: string
    active_days: number
    total_messages: number
    participation_rate: number
    proactive_posts: number
    status: string
  }[]
}

const statusConfig = {
  critical: { label: 'Kritis', bg: '#FDECEA', color: '#B00020' },
  warning: { label: 'Waspada', bg: '#FFF3CD', color: '#856404' },
  healthy: { label: 'Sehat', bg: '#EAF3DE', color: '#27500A' },
}

export default function RangerPage() {
  const router = useRouter()
  const [rangers, setRangers] = useState<RangerData[]>([])
  const [filtered, setFiltered] = useState<RangerData[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('semua')
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const PER_PAGE = 10

  useEffect(() => { fetchRangers() }, [])

  useEffect(() => {
    let result = rangers
    if (search) {
      result = result.filter(r =>
        r.full_name.toLowerCase().includes(search.toLowerCase()) ||
        r.wags?.name?.toLowerCase().includes(search.toLowerCase())
      )
    }
    if (filter !== 'semua') {
      result = result.filter(r => getLatestStatus(r) === filter)
    }
    setFiltered(result)
    setPage(1)
  }, [search, filter, rangers])

  const fetchRangers = async () => {
    const { data } = await supabase
      .from('rangers')
      .select('id, full_name, display_name, phone_number, status, wags(id, name), weekly_metrics(week_key, active_days, total_messages, participation_rate, proactive_posts, status)')
      .eq('status', 'active')
      .order('full_name')
    if (data) {
      setRangers(data as unknown as RangerData[])
      setFiltered(data as unknown as RangerData[])
    }
    setLoading(false)
  }

  const getLatestStatus = (r: RangerData) => {
    const latest = [...(r.weekly_metrics || [])].sort((a, b) => b.week_key.localeCompare(a.week_key))[0]
    return latest?.status || 'healthy'
  }

  const getLatestMetric = (r: RangerData) => {
    return [...(r.weekly_metrics || [])].sort((a, b) => b.week_key.localeCompare(a.week_key))[0]
  }

  const totalPages = Math.ceil(filtered.length / PER_PAGE)
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  if (loading) return (
    <Layout title="Ranger">
      <div style={{ color: '#999', fontSize: '13px' }}>Memuat data...</div>
    </Layout>
  )

  return (
    <Layout title="Ranger">
      <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', alignItems: 'center' }}>
        <input type="text" placeholder="Cari nama Ranger atau WAG..."
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid #e5e5e5', fontSize: '13px', outline: 'none' }} />
        <span style={{ fontSize: '12px', color: '#999', whiteSpace: 'nowrap' }}>{filtered.length} Ranger</span>
      </div>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
        {[
          { key: 'semua', label: 'Semua' },
          { key: 'critical', label: '● Kritis' },
          { key: 'warning', label: '● Waspada' },
          { key: 'healthy', label: '● Sehat' },
        ].map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            style={{
              padding: '5px 14px', borderRadius: '999px', border: '1px solid',
              borderColor: filter === f.key ? '#0344D8' : '#e5e5e5',
              background: filter === f.key ? '#0344D8' : '#FFFFFF',
              color: filter === f.key ? '#FFFFFF' : '#555',
              fontSize: '12px', cursor: 'pointer',
              fontWeight: filter === f.key ? '500' : '400',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div style={{ background: '#FFFFFF', border: '1px solid #e5e5e5', borderRadius: '10px', overflow: 'hidden', marginBottom: '14px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e5e5e5' }}>
              {['Ranger', 'WAG', 'Status', 'Hari Aktif', 'Total Pesan', 'Periode', ''].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '11px', color: '#999', fontWeight: '500' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 && (
              <tr><td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: '#999', fontSize: '13px' }}>
                {rangers.length === 0 ? 'Belum ada Ranger' : 'Tidak ada yang sesuai filter'}
              </td></tr>
            )}
            {paginated.map(r => {
              const status = getLatestStatus(r) as keyof typeof statusConfig
              const s = statusConfig[status]
              const metric = getLatestMetric(r)
              return (
                <tr key={r.id} onClick={() => router.push(`/ranger/${r.id}`)}
                  style={{ borderBottom: '1px solid #f5f5f5', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#F8F9FB')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ fontWeight: '500' }}>{r.full_name}</div>
                    <div style={{ fontSize: '11px', color: '#999', marginTop: '2px' }}>{r.display_name}</div>
                  </td>
                  <td style={{ padding: '12px 14px', color: '#555' }}>{r.wags?.name || '—'}</td>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: s.bg, color: s.color, fontWeight: '500' }}>
                      {s.label}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px', color: (metric?.active_days ?? 0) <= 2 ? '#B00020' : (metric?.active_days ?? 0) <= 4 ? '#856404' : '#27500A' }}>
                    {metric?.active_days ?? '—'}/7
                  </td>
                  <td style={{ padding: '12px 14px', color: (metric?.total_messages ?? 0) < 3 ? '#B00020' : (metric?.total_messages ?? 0) < 10 ? '#856404' : '#27500A' }}>
                    {metric?.total_messages ?? '—'}
                  </td>
                  <td style={{ padding: '12px 14px', color: '#999', fontSize: '11px' }}>
                    {metric ? formatWeekKey(metric.week_key) : '—'}
                  </td>
                  <td style={{ padding: '12px 14px', color: '#0344D8', fontSize: '12px' }}>Detail →</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
            <button key={p} onClick={() => setPage(p)}
              style={{
                padding: '5px 12px', borderRadius: '6px', border: '1px solid',
                borderColor: page === p ? '#0344D8' : '#e5e5e5',
                background: page === p ? '#0344D8' : '#FFFFFF',
                color: page === p ? '#FFFFFF' : '#555',
                fontSize: '12px', cursor: 'pointer',
                fontWeight: page === p ? '500' : '400',
              }}
            >
              {p}
            </button>
          ))}
          <span style={{ fontSize: '12px', color: '#999', marginLeft: '4px' }}>dari {totalPages} halaman</span>
        </div>
      )}
    </Layout>
  )
}
