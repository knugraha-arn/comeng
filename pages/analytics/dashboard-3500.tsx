import { useEffect, useState } from 'react'
import Head from 'next/head'
import Layout from '../../components/Layout'
import { createBrowserClient } from '@supabase/ssr'

interface HiddenGemAgent {
  serial_number: string
  merchant_name: string | null
  mitra: string | null
  pic: string | null
  active_days_14: number
  avg_trx_per_active_day_14: number
  active_days_month: number
  total_trx_month: number
  avg_trx_per_active_day_month: number
  growth_pct: number
  trend: 'growing' | 'declining' | 'consistent'
  bucket: string
}

interface AgentDayDetail {
  transaction_date: string
  total_trx: number
  transfer_trx: number
  cek_saldo_trx: number
  total_fee: number
  total_amount: number
  dip_count: number
  swipe_count: number
  merchant_name: string | null
  mitra: string | null
  pic: string | null
  alamat_struk: string | null
  brand: string | null
  tipe_mesin: string | null
  source_app: string | null
  terminal_data_source: string | null
}

interface MonthlyProgress {
  total_fee: number
  total_trx: number
  days_elapsed: number
  days_in_month: number
  month_start: string
  end_date: string
}

const TREND_CONFIG = {
  growing:    { label: 'Growing',   icon: '💎', color: '#166534', bg: '#dcfce7', border: '#bbf7d0' },
  declining:  { label: 'Declining', icon: '⚠️', color: '#92400e', bg: '#fef9c3', border: '#fde68a' },
  consistent: { label: 'Konsisten', icon: '✅', color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe' },
}

const BUCKET_CONFIG: Record<string, { label: string, color: string, bg: string, border: string }> = {
  productive: { label: 'Productive', color: '#166534', bg: '#dcfce7', border: '#bbf7d0' },
  moderate:   { label: 'Moderate',   color: '#ca8a04', bg: '#fef9c3', border: '#fde68a' },
  sporadic:   { label: 'Sporadic',   color: '#dc2626', bg: '#fee2e2', border: '#fecaca' },
}

const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']

function formatFee(val: number): string {
  if (val >= 1000000) return `Rp ${(val / 1000000).toFixed(1)}jt`
  if (val >= 1000) return `Rp ${(val / 1000).toFixed(0)}rb`
  return `Rp ${val}`
}

function Skeleton({ width, height = 14, radius = 6 }: { width: string | number, height?: number, radius?: number }) {
  return (
    <div style={{
      width, height, borderRadius: radius,
      background: 'linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.4s infinite',
    }} />
  )
}

const SKELETON_STYLE = `@keyframes shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }`

function ProgressBar({ value, max, color }: { value: number, max: number, color: string }) {
  const pct = max > 0 ? Math.min(100, Math.round(value / max * 100)) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ flex: 1, height: '6px', backgroundColor: '#f3f4f6', borderRadius: '99px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', backgroundColor: color, borderRadius: '99px', transition: 'width 0.5s' }} />
      </div>
      <span style={{ fontSize: '12px', fontWeight: '700', color, minWidth: '36px', textAlign: 'right' }}>{pct}%</span>
    </div>
  )
}

export default function HiddenGemPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [agents, setAgents] = useState<HiddenGemAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'growing' | 'declining' | 'consistent' | null>(null)
  const [progress, setProgress] = useState<MonthlyProgress | null>(null)
  const [monthlyTarget, setMonthlyTarget] = useState<number | null>(null)
  const [filterMitra, setFilterMitra] = useState('')
  const [filterPic, setFilterPic] = useState('')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 20
  const [lastDate, setLastDate] = useState('')
  const [sinceDate, setSinceDate] = useState('')

  // Drawer
  const [selectedAgent, setSelectedAgent] = useState<HiddenGemAgent | null>(null)
  const [agentDetail, setAgentDetail] = useState<AgentDayDetail[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)

  useEffect(() => { init() }, [])

  async function init() {
    setLoading(true)
    try {
      const [agentsRes, progressRes] = await Promise.all([
        supabase.rpc('get_hidden_gem_agents_3500', { p_min_active_days_month: 2, p_min_trx_month: 5, p_min_avg_trx_14: 1 }),
        supabase.rpc('get_monthly_progress'),
      ])

      setAgents(agentsRes.data ?? [])

      if (progressRes.data) {
        const d = typeof progressRes.data === 'string' ? JSON.parse(progressRes.data) : progressRes.data
        setProgress({
          total_fee: Number(d.total_fee ?? 0),
          total_trx: Number(d.total_trx ?? 0),
          days_elapsed: Number(d.days_elapsed ?? 0),
          days_in_month: Number(d.days_in_month ?? 0),
          month_start: d.month_start,
          end_date: d.end_date,
        })

        const endDate = new Date(d.end_date)
        setLastDate(d.end_date)
        const [y, m, dd] = d.end_date.split('-').map(Number)
        const sd = new Date(y, m - 1, dd - 13)
        setSinceDate(`${sd.getFullYear()}-${String(sd.getMonth() + 1).padStart(2, '0')}-${String(sd.getDate()).padStart(2, '0')}`)

        const { data: targetData } = await supabase
          .from('am_targets')
          .select('monthly_fee')
          .eq('period_year', endDate.getFullYear())
          .eq('period_month', endDate.getMonth() + 1)
          .single()
        setMonthlyTarget(targetData?.monthly_fee ?? null)
      }
    } finally {
      setLoading(false)
    }
  }

  async function openDrawer(agent: HiddenGemAgent) {
    setSelectedAgent(agent)
    setAgentDetail([])
    setLoadingDetail(true)
    try {
      const { data } = await supabase.rpc('get_agent_detail_3500', {
        p_serial: agent.serial_number,
        p_since: sinceDate,
        p_until: lastDate,
      })
      setAgentDetail(data ?? [])
    } finally {
      setLoadingDetail(false)
    }
  }

  const filtered = agents
    .filter(a => activeTab === null || a.trend === activeTab)
    .filter(a => !filterMitra || a.mitra === filterMitra)
    .filter(a => !filterPic || a.pic === filterPic)
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const growingCount = agents.filter(a => a.trend === 'growing').length
  const decliningCount = agents.filter(a => a.trend === 'declining').length
  const consistentCount = agents.filter(a => a.trend === 'consistent').length

  const mitras = [...new Set(agents.map(a => a.mitra).filter(Boolean) as string[])].sort()
  const pics = [...new Set(agents.filter(a => !filterMitra || a.mitra === filterMitra).map(a => a.pic).filter(Boolean) as string[])].sort()

  const feeProgress = progress && monthlyTarget ? Math.min(100, Math.round(progress.total_fee / monthlyTarget * 100)) : null
  const projectedFee = progress && progress.days_elapsed > 0 ? Math.round(progress.total_fee / progress.days_elapsed * progress.days_in_month) : null
  const currentMonth = progress ? MONTHS[new Date(progress.end_date).getMonth()] : ''
  const currentYear = progress ? new Date(progress.end_date).getFullYear() : ''

  function TrendChip({ trend }: { trend: string }) {
    const cfg = TREND_CONFIG[trend as keyof typeof TREND_CONFIG] ?? TREND_CONFIG.consistent
    return (
      <span style={{
        padding: '2px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: '700',
        backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
        whiteSpace: 'nowrap',
      }}>
        {cfg.icon} {cfg.label}
      </span>
    )
  }

  function BucketChip({ b }: { b: string }) {
    const cfg = BUCKET_CONFIG[b] ?? BUCKET_CONFIG.sporadic
    return (
      <span style={{
        padding: '2px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: '700',
        backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
        whiteSpace: 'nowrap',
      }}>
        {cfg.label}
      </span>
    )
  }

  return (
    <Layout>
      <style>{SKELETON_STYLE}</style>
      <Head><title>Dashboard 3500 — AMARIS</title></Head>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}>

        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '11px', fontWeight: '600', color: '#9ca3af', letterSpacing: '0.1em', marginBottom: '4px' }}>ANALITIK AGEN</div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#111827', margin: 0, letterSpacing: '-0.02em' }}>💰 Dashboard 3500</h1>
          <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
            Agen dengan transaksi fee Rp 3.500 — Lita dan Plus
          </p>
        </div>

        {/* Target Progress */}
        {progress && (
          <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px 24px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#374151', letterSpacing: '0.05em' }}>
                  TARGET {currentMonth.toUpperCase()} {currentYear}
                </div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>
                  Hari ke-{progress.days_elapsed} dari {progress.days_in_month}
                </div>
              </div>
              {projectedFee && monthlyTarget && (
                <div style={{
                  padding: '6px 14px', borderRadius: '99px', fontSize: '12px', fontWeight: '700',
                  backgroundColor: projectedFee >= monthlyTarget ? '#dcfce7' : '#fee2e2',
                  color: projectedFee >= monthlyTarget ? '#166534' : '#dc2626',
                }}>
                  Proyeksi: {formatFee(projectedFee)} {projectedFee >= monthlyTarget ? '✓' : '↓'}
                </div>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', color: '#6b7280' }}>Fee terkumpul</span>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>
                    {formatFee(progress.total_fee)}
                    {monthlyTarget && <span style={{ color: '#9ca3af', fontWeight: '400' }}> / {formatFee(monthlyTarget)}</span>}
                  </span>
                </div>
                <ProgressBar value={progress.total_fee} max={monthlyTarget ?? progress.total_fee} color='#0344D8' />
                {feeProgress !== null && <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>{feeProgress}% tercapai</div>}
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', color: '#6b7280' }}>Total TRX bulan ini</span>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>{progress.total_trx.toLocaleString('id')}</span>
                </div>
                <ProgressBar value={progress.days_elapsed} max={progress.days_in_month} color='#7c3aed' />
                <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                  {Math.round(progress.total_trx / Math.max(progress.days_elapsed, 1)).toLocaleString('id')} TRX/hari rata-rata
                </div>
              </div>
            </div>
            {!monthlyTarget && (
              <div style={{ marginTop: '12px', fontSize: '12px', color: '#9ca3af' }}>
                💡 <a href="/analytics/target-simple" style={{ color: '#0344D8' }}>Set target bulan ini</a> untuk lihat proyeksi lengkap.
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          {(['growing', 'declining', 'consistent'] as const).map(tab => {
            const cfg = TREND_CONFIG[tab]
            const count = tab === 'growing' ? growingCount : tab === 'declining' ? decliningCount : consistentCount
            const isActive = activeTab === tab
            return (
              <button key={tab} onClick={() => { setActiveTab(activeTab === tab ? null : tab); setPage(0) }} style={{
                padding: '9px 18px', borderRadius: '8px', cursor: 'pointer',
                border: `2px solid ${isActive ? cfg.color : '#e5e7eb'}`,
                backgroundColor: isActive ? cfg.bg : '#fff',
                color: isActive ? cfg.color : '#6b7280',
                fontSize: '13px', fontWeight: '600',
                transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', gap: '8px',
              }}>
                <span>{cfg.icon}</span>
                <span>{cfg.label}</span>
                <span style={{
                  padding: '1px 8px', borderRadius: '99px', fontSize: '11px',
                  backgroundColor: isActive ? '#fff' : '#f3f4f6',
                  color: isActive ? cfg.color : '#9ca3af',
                  fontWeight: '700',
                }}>{count}</span>
              </button>
            )
          })}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={filterMitra} onChange={e => { setFilterMitra(e.target.value); setFilterPic('') }}
            style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px', color: '#374151', backgroundColor: '#fff', cursor: 'pointer' }}>
            <option value="">Semua Mitra</option>
            {mitras.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={filterPic} onChange={e => setFilterPic(e.target.value)}
            style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px', color: '#374151', backgroundColor: '#fff', cursor: 'pointer', maxWidth: '180px' }}>
            <option value="">Semua PIC</option>
            {pics.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          {(filterMitra || filterPic) && (
            <button onClick={() => { setFilterMitra(''); setFilterPic('') }}
              style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#6b7280', fontSize: '12px', cursor: 'pointer' }}>
              ✕ Reset
            </button>
          )}
          <span style={{ marginLeft: 'auto', fontSize: '13px', color: '#6b7280' }}>
            {loading ? 'Memuat...' : `${filtered.length.toLocaleString('id')} agen`}
          </span>
        </div>

        {/* Table */}
        {loading ? (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
            {[1,2,3,4,5].map(i => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 150px 150px 60px 80px 80px 80px', padding: '13px 16px', borderBottom: '1px solid #f3f4f6', gap: '16px', alignItems: 'center' }}>
                <Skeleton width={70} height={20} />
                <div><Skeleton width={120} height={13} /><div style={{marginTop:4}}><Skeleton width={80} height={10} /></div></div>
                <Skeleton width={100} height={12} />
                <Skeleton width={100} height={12} />
                <Skeleton width={30} height={12} />
                <Skeleton width={50} height={12} />
                <Skeleton width={50} height={12} />
                <Skeleton width={60} height={20} />
              </div>
            ))}
          </div>
        ) : filtered.length > 0 ? (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 150px 150px 60px 80px 80px 80px', padding: '10px 16px', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.05em' }}>
              <div>TREND</div>
              <div>AGEN</div>
              <div>MITRA</div>
              <div>PIC</div>
              <div style={{ textAlign: 'center' }}>HARI</div>
              <div style={{ textAlign: 'right' }}>TRX/HARI (14H)</div>
              <div style={{ textAlign: 'right' }}>TRX/HARI (BLN)</div>
              <div style={{ textAlign: 'right' }}>GROWTH</div>
            </div>
            {/* Rows */}
            {paginated.map((agent, i) => (
              <div key={agent.serial_number} onClick={() => openDrawer(agent)}
                style={{ display: 'grid', gridTemplateColumns: '100px 1fr 150px 150px 60px 80px 80px 80px', padding: '11px 16px', borderBottom: i < paginated.length - 1 ? '1px solid #f3f4f6' : 'none', alignItems: 'center', backgroundColor: '#fff', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = '#fff'}
              >
                <div><TrendChip trend={agent.trend} /></div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#111827' }}>{agent.merchant_name ?? agent.serial_number}</div>
                  <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '1px', display: 'flex', gap: '6px' }}>
                    <span>{agent.serial_number}</span>
                    <BucketChip b={agent.bucket} />
                  </div>
                </div>
                <div style={{ fontSize: '12px', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.mitra ?? '—'}</div>
                <div style={{ fontSize: '12px', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.pic ?? '—'}</div>
                <div style={{ fontSize: '13px', fontWeight: '700', textAlign: 'center', color: agent.active_days_14 >= 8 ? '#166534' : agent.active_days_14 >= 5 ? '#ca8a04' : '#dc2626' }}>{agent.active_days_14}</div>
                <div style={{ fontSize: '12px', color: '#374151', textAlign: 'right' }}>{Number(agent.avg_trx_per_active_day_14).toLocaleString('id')}</div>
                <div style={{ fontSize: '12px', color: '#374151', textAlign: 'right' }}>{Number(agent.avg_trx_per_active_day_month).toLocaleString('id')}</div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{
                    padding: '2px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: '700',
                    backgroundColor: agent.growth_pct > 0 ? '#dcfce7' : '#fee2e2',
                    color: agent.growth_pct > 0 ? '#166534' : '#dc2626',
                  }}>
                    {agent.growth_pct > 0 ? '↑' : '↓'} {Math.abs(agent.growth_pct)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px', backgroundColor: '#f9fafb', borderRadius: '10px', border: '1px dashed #e5e7eb', color: '#9ca3af', fontSize: '13px' }}>
            Tidak ada agen di kategori ini
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', alignItems: 'center', marginTop: '16px' }}>
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: page === 0 ? '#d1d5db' : '#374151', fontSize: '13px', cursor: page === 0 ? 'not-allowed' : 'pointer' }}>← Prev</button>
            <span style={{ fontSize: '13px', color: '#6b7280' }}>{page + 1} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: page >= totalPages - 1 ? '#d1d5db' : '#374151', fontSize: '13px', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer' }}>Next →</button>
          </div>
        )}
      </div>

      {/* Drawer */}
      {selectedAgent && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}>
          <div onClick={() => setSelectedAgent(null)} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)' }} />
          <div style={{ position: 'relative', width: '480px', height: '100%', backgroundColor: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            {/* Drawer Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'sticky', top: 0, backgroundColor: '#fff', zIndex: 1 }}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: '800', color: '#111827', marginBottom: '4px' }}>{selectedAgent.merchant_name ?? selectedAgent.serial_number}</div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '6px' }}>{selectedAgent.serial_number}</div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <TrendChip trend={selectedAgent.trend} />
                  <BucketChip b={selectedAgent.bucket} />
                </div>
              </div>
              <button onClick={() => setSelectedAgent(null)} style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#6b7280', fontSize: '18px', cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>

            {loadingDetail ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>Memuat data...</div>
            ) : agentDetail.length > 0 ? (
              <div style={{ padding: '20px 24px' }}>

                {/* Perbandingan */}
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>PERBANDINGAN PERFORMA</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    {[
                      { label: 'Avg TRX/hari (14 hari)', value: String(selectedAgent.avg_trx_per_active_day_14) },
                      { label: 'Avg TRX/hari (bulan ini)', value: String(selectedAgent.avg_trx_per_active_day_month), highlight: true },
                      { label: 'Hari aktif (14 hari)', value: `${selectedAgent.active_days_14} hari` },
                      { label: 'Hari aktif (bulan ini)', value: `${selectedAgent.active_days_month} hari` },
                      { label: 'TRX Fee 3500 (14H)', value: String(selectedAgent.active_days_14) + ' hari aktif' },
                      { label: 'TRX Fee 3500 (Bln)', value: Number(selectedAgent.total_trx_month).toLocaleString('id') + ' trx' },      
                      { label: 'Total TRX bulan ini', value: Number(selectedAgent.total_trx_month).toLocaleString('id') },
                      { label: 'Growth', value: `${selectedAgent.growth_pct > 0 ? '+' : ''}${selectedAgent.growth_pct}%`, highlight: true },
                    ].map(s => (
                      <div key={s.label} style={{
                        padding: '10px 12px', backgroundColor: s.highlight ? TREND_CONFIG[selectedAgent.trend].bg : '#f9fafb',
                        borderRadius: '8px', textAlign: 'center',
                        border: s.highlight ? `1px solid ${TREND_CONFIG[selectedAgent.trend].border}` : 'none',
                      }}>
                        <div style={{ fontSize: '14px', fontWeight: '700', color: s.highlight ? TREND_CONFIG[selectedAgent.trend].color : '#111827' }}>{s.value}</div>
                        <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Info Agen */}
                {(() => {
                  const latest = agentDetail[agentDetail.length - 1]
                  return (
                    <div style={{ marginBottom: '24px' }}>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>INFO AGEN</div>
                      {[
                        { label: 'Mitra',    value: latest.mitra },
                        { label: 'PIC',      value: latest.pic },
                        { label: 'Alamat',   value: latest.alamat_struk },
                        { label: 'Brand',    value: latest.brand },
                        { label: 'Mesin',    value: latest.tipe_mesin },
                        { label: 'Aplikasi', value: latest.source_app },
                        { label: 'Terminal', value: latest.terminal_data_source },
                      ].filter(r => r.value).map(r => (
                        <div key={r.label} style={{ display: 'flex', gap: '12px', padding: '7px 0', borderBottom: '1px solid #f9fafb' }}>
                          <span style={{ fontSize: '12px', color: '#9ca3af', minWidth: '80px', flexShrink: 0 }}>{r.label}</span>
                          <span style={{ fontSize: '12px', color: '#111827', fontWeight: '500' }}>{r.value}</span>
                        </div>
                      ))}
                    </div>
                  )
                })()}

                {/* Ringkasan 14 Hari */}
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>RINGKASAN 14 HARI</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                    {[
                      { label: 'Total TRX',    value: agentDetail.reduce((s, d) => s + Number(d.total_trx), 0).toLocaleString('id') },
                      { label: 'Transfer',     value: agentDetail.reduce((s, d) => s + Number(d.transfer_trx), 0).toLocaleString('id') },
                      { label: 'Cek Saldo',    value: agentDetail.reduce((s, d) => s + Number(d.cek_saldo_trx), 0).toLocaleString('id') },
                      { label: 'Total Fee',    value: formatFee(agentDetail.reduce((s, d) => s + Number(d.total_fee), 0)) },
                      { label: 'Total Amount', value: formatFee(agentDetail.reduce((s, d) => s + Number(d.total_amount), 0)) },
                      { label: 'Hari Aktif',   value: `${agentDetail.length} hari` },
                    ].map(s => (
                      <div key={s.label} style={{ padding: '10px 12px', backgroundColor: '#f9fafb', borderRadius: '8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '14px', fontWeight: '700', color: '#111827' }}>{s.value}</div>
                        <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Grafik TRX per hari */}
                <div>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>TRANSAKSI PER HARI</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '80px' }}>
                    {(() => {
                      const maxTrx = Math.max(...agentDetail.map(d => Number(d.total_trx)), 1)
                      const sd = new Date(sinceDate)
                      const monthStart = progress?.month_start ?? ''
                      return Array.from({ length: 14 }, (_, i) => {
                        const d = new Date(sd)
                        d.setDate(sd.getDate() + i)
                        const dateStr = d.toISOString().split('T')[0]
                        const found = agentDetail.find(a => a.transaction_date === dateStr)
                        const trx = found ? Number(found.total_trx) : 0
                        const isThisMonth = dateStr >= monthStart
                        return (
                          <div key={dateStr} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}
                            title={`${dateStr}: ${trx} trx`}>
                            <div style={{
                              width: '100%',
                              height: `${Math.max(4, (trx / maxTrx) * 64)}px`,
                              backgroundColor: trx > 0 ? (isThisMonth ? TREND_CONFIG[selectedAgent.trend].color : '#94a3b8') : '#f3f4f6',
                              borderRadius: '3px 3px 0 0',
                              transition: 'height 0.3s',
                            }} />
                            <div style={{ fontSize: '8px', color: '#d1d5db', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                              {new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                            </div>
                          </div>
                        )
                      })
                    })()}
                  </div>
                  <div style={{ display: 'flex', gap: '12px', marginTop: '8px', fontSize: '10px', color: '#9ca3af' }}>
                    <span>▪ <span style={{ color: '#94a3b8' }}>Bulan lalu</span></span>
                    <span>▪ <span style={{ color: TREND_CONFIG[selectedAgent.trend].color }}>Bulan ini</span></span>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>Tidak ada data</div>
            )}
          </div>
        </div>
      )}
    </Layout>
  )
}
