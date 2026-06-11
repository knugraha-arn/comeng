import { useEffect, useState } from 'react'
import Head from 'next/head'
import Layout from '../../components/Layout'
import { createBrowserClient } from '@supabase/ssr'

interface Agent {
  serial_number:  string
  merchant_name:  string | null
  mitra:          string | null
  pic:            string | null
  active_days:    number
  total_trx:      number
  transfer_trx:   number
  cek_saldo_trx:  number
  total_fee:      number
  last_active:    string
  bucket:         string
}

interface AgentDayDetail {
  transaction_date:     string
  total_trx:            number
  transfer_trx:         number
  cek_saldo_trx:        number
  total_fee:            number
  total_amount:         number
  dip_count:            number
  swipe_count:          number
  merchant_name:        string | null
  mitra:                string | null
  pic:                  string | null
  alamat_struk:         string | null
  brand:                string | null
  tipe_mesin:           string | null
  source_app:           string | null
  terminal_data_source: string | null
}

interface BucketSummary {
  bucket:      string
  agent_count: number
  total_trx:   number
  total_fee:   number
}

interface Target {
  daily_active_agents:  number | null
  daily_transfer_trx:   number | null
  daily_fee:            number | null
}

const PAGE_SIZE = 20

function Skeleton({ width, height = 14, radius = 6 }: { width: string | number, height?: number, radius?: number }) {
  return (
    <div style={{
      width, height, borderRadius: radius,
      backgroundColor: '#e5e7eb',
      background: 'linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.4s infinite',
    }} />
  )
}

const SKELETON_STYLE = `
  @keyframes shimmer {
    0% { background-position: 200% 0 }
    100% { background-position: -200% 0 }
  }
`

const BUCKET_CONFIG = {
  productive: { label: 'Productive', icon: '🌱', color: '#166534', bg: '#dcfce7', border: '#bbf7d0' },
  moderate:   { label: 'Moderate',   icon: '⚡', color: '#ca8a04', bg: '#fef9c3', border: '#fde68a' },
  sporadic:   { label: 'Sporadic',   icon: '⚠️', color: '#dc2626', bg: '#fee2e2', border: '#fecaca' },
}

function formatFee(val: number): string {
  if (val >= 1000000) return `Rp ${(val / 1000000).toFixed(1)}jt`
  if (val >= 1000) return `Rp ${(val / 1000).toFixed(0)}rb`
  return `Rp ${val}`
}

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

export default function AgentDashboard() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [agents, setAgents] = useState<Agent[]>([])
  const [summary, setSummary] = useState<BucketSummary[]>([])
  const [target, setTarget] = useState<Target | null>(null)
  const [filterOptions, setFilterOptions] = useState<{ mitra: string, pic: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingList, setLoadingList] = useState(false)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [bucket, setBucket] = useState('')
  const [filterMitra, setFilterMitra] = useState('')
  const [filterPic, setFilterPic] = useState('')
  const [lastDate, setLastDate] = useState('')
  const [sinceDate, setSinceDate] = useState('')
  const [avgActivePerDay, setAvgActivePerDay] = useState(0)
  const [avgTrxPerDay, setAvgTrxPerDay] = useState(0)
  const [avgFeePerDay, setAvgFeePerDay] = useState(0)
  const [loadingAvg, setLoadingAvg] = useState(true)
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [agentDetail, setAgentDetail] = useState<AgentDayDetail[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)

  useEffect(() => { init() }, [])
  useEffect(() => {
    if (lastDate) loadAgents()
  }, [page, bucket, filterMitra, filterPic, lastDate])

  async function getLatestDate() {
    const { data } = await supabase
      .from('am_agent_daily_metrics')
      .select('metric_date')
      .order('metric_date', { ascending: false })
      .limit(1)
      .single()
    return data?.metric_date ?? null
  }

  async function init() {
    setLoading(true)
    try {
      const maxDate = await getLatestDate()
      if (!maxDate) { setLoading(false); return }

      const [_y, _m, _d] = maxDate.split("-").map(Number)
      const sd = new Date(_y, _m - 1, _d - 13)
      const sinceStr = `${sd.getFullYear()}-${String(sd.getMonth() + 1).padStart(2, "0")}-${String(sd.getDate()).padStart(2, "0")}`
      setLastDate(maxDate)
      setSinceDate(sinceStr)

      const now = new Date(maxDate)
      const [summaryRes, targetRes] = await Promise.all([
        supabase.rpc('get_dashboard_summary', { p_date: maxDate }),
        supabase.from('am_targets')
          .select('daily_active_agents, daily_transfer_trx, daily_fee')
          .eq('period_year', now.getFullYear())
          .eq('period_month', now.getMonth() + 1)
          .single(),
      ])

      setSummary(summaryRes.data ?? [])
      setTarget(targetRes.data)
      setLoading(false)

      // Load avg + filter options di background
      Promise.all([
        supabase.rpc('get_avg_active_from_metrics', { p_since: sinceStr, p_until: maxDate })
          .then(({ data }) => setAvgActivePerDay(Number(data ?? 0))),
        supabase.rpc('get_avg_daily_metrics', { p_since: sinceStr, p_until: maxDate })
          .then(({ data }) => {
            if (data && data.length > 0) {
              setAvgTrxPerDay(Number(data[0].avg_trx_per_day ?? 0))
              setAvgFeePerDay(Number(data[0].avg_fee_per_day ?? 0))
            }
          }),
      ]).finally(() => setLoadingAvg(false))

      supabase.rpc('get_dashboard_filter_options', { p_date: maxDate })
        .then(({ data }) => setFilterOptions(data ?? []))

    } catch { setLoading(false) }
  }

  async function loadAgents() {
    if (!lastDate) return
    setLoadingList(true)
    try {
      const [agentsRes, countRes] = await Promise.all([
        supabase.rpc('get_dashboard_agents', {
          p_date:   lastDate,
          p_bucket: bucket || null,
          p_mitra:  filterMitra || null,
          p_pic:    filterPic || null,
          p_limit:  PAGE_SIZE,
          p_offset: page * PAGE_SIZE,
        }),
        supabase.rpc('get_dashboard_agents_count', {
          p_date:   lastDate,
          p_bucket: bucket || null,
          p_mitra:  filterMitra || null,
          p_pic:    filterPic || null,
        }),
      ])
      setAgents(agentsRes.data ?? [])
      setTotal(countRes.data ?? 0)
    } finally { setLoadingList(false) }
  }

  async function openDrawer(agent: Agent) {
    setSelectedAgent(agent)
    setAgentDetail([])
    setLoadingDetail(true)
    try {
      const [__y, __m, __d] = lastDate.split("-").map(Number)
      const dsd = new Date(__y, __m - 1, __d - 13)
      const drawerSince = `${dsd.getFullYear()}-${String(dsd.getMonth() + 1).padStart(2, "0")}-${String(dsd.getDate()).padStart(2, "0")}`
      const { data } = await supabase.rpc("get_agent_detail", {
        p_serial: agent.serial_number,
        p_since:  drawerSince,
        p_until:  lastDate,
      })
      setAgentDetail(data ?? [])
    } finally { setLoadingDetail(false) }
  }

  async function exportCSV() {
    const { data } = await supabase.rpc('get_dashboard_agents', {
      p_date:   lastDate,
      p_bucket: bucket || null,
      p_mitra:  filterMitra || null,
      p_pic:    filterPic || null,
      p_limit:  5000,
      p_offset: 0,
    })
    if (!data?.length) return

    const headers = ['Bucket','Nama Agen','Serial Number','Mitra','PIC','Hari Aktif','Total TRX','Transfer','Cek Saldo','Total Fee']
    const rows = data.map((a: Agent) => [
      a.bucket, a.merchant_name ?? '', a.serial_number,
      a.mitra ?? '', a.pic ?? '', a.active_days,
      a.total_trx, a.transfer_trx, a.cek_saldo_trx, a.total_fee,
    ])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `agen_${bucket || 'semua'}_${lastDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const getSummary = (b: string) => summary.find(s => s.bucket === b)
  const totalAgents = summary.reduce((s, r) => s + Number(r.agent_count), 0)
  const mitras = [...new Set(filterOptions.map(f => f.mitra))].sort()
  const pics   = [...new Set(filterOptions.filter(f => !filterMitra || f.mitra === filterMitra).map(f => f.pic))].sort()
  const totalPages = Math.ceil(total / PAGE_SIZE)

  function BucketChip({ b }: { b: string }) {
    const cfg = BUCKET_CONFIG[b as keyof typeof BUCKET_CONFIG] ?? BUCKET_CONFIG.sporadic
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

  if (loading) return (
    <Layout>
      <div style={{ display: 'flex', justifyContent: 'center', padding: '80px', color: '#9ca3af', fontSize: '13px' }}>
        Memuat data...
      </div>
    </Layout>
  )

  return (
    <Layout>
      <style>{SKELETON_STYLE}</style>
      <Head><title>Dashboard Agen — AMARIS</title></Head>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}>

        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '11px', fontWeight: '600', color: '#9ca3af', letterSpacing: '0.1em', marginBottom: '4px' }}>ANALITIK AGEN</div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#111827', margin: 0, letterSpacing: '-0.02em' }}>Dashboard Agen</h1>
          <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
            Data per {lastDate ? new Date(lastDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'} · {totalAgents.toLocaleString('id')} agen aktif 14 hari terakhir
          </p>
        </div>

        {/* Target Progress */}
        {target && (
          <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px 24px', marginBottom: '20px' }}>
            <div style={{ fontSize: '12px', fontWeight: '700', color: '#374151', marginBottom: '16px', letterSpacing: '0.05em' }}>
              TARGET {lastDate ? new Date(lastDate).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }).toUpperCase() : ''}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
              {[
                { label: 'Rata-rata Agen Aktif/Hari', current: avgActivePerDay, target: target.daily_active_agents, color: '#0344D8' },
                { label: 'Rata-rata TRX/Hari', current: avgTrxPerDay, target: target.daily_transfer_trx, color: '#7c3aed' },
                { label: 'Rata-rata Fee/Hari', current: avgFeePerDay, target: target.daily_fee, isRp: true, color: '#059669' },
              ].map(t => (
                <div key={t.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '12px', color: '#6b7280' }}>{t.label}</span>
                    {loadingAvg ? (
                      <Skeleton width={80} height={12} />
                    ) : (
                      <span style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>
                        {(t as {isRp?: boolean}).isRp ? formatFee(Math.round(t.current)) : Math.round(t.current).toLocaleString('id')}
                        {t.target && <span style={{ color: '#9ca3af', fontWeight: '400' }}> / {(t as {isRp?: boolean}).isRp ? formatFee(t.target) : t.target.toLocaleString('id')}</span>}
                      </span>
                    )}
                  </div>
                  {loadingAvg ? (
                    <Skeleton width="100%" height={6} radius={99} />
                  ) : (
                    t.target && <ProgressBar value={t.current} max={t.target} color={t.color} />
                  )}
                </div>
              ))}
            </div>
            {target.daily_active_agents && avgActivePerDay > 0 && avgActivePerDay < target.daily_active_agents && (
              <div style={{ marginTop: '16px', padding: '10px 14px', backgroundColor: '#fffbeb', borderRadius: '8px', border: '1px solid #fde68a', fontSize: '12px', color: '#92400e' }}>
                💡 Kurang <strong>{(target.daily_active_agents - avgActivePerDay).toLocaleString('id')} agen/hari</strong> dari target.
                {Number(getSummary('moderate')?.agent_count ?? 0) > 0 && ` Ada ${Number(getSummary('moderate')?.agent_count ?? 0)} agen Moderate yang bisa didorong.`}
              </div>
            )}
          </div>
        )}

        {/* Bucket Cards — 3 buckets */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
          {(['productive', 'moderate', 'sporadic'] as const).map(b => {
            const cfg  = BUCKET_CONFIG[b]
            const data = getSummary(b)
            const count = Number(data?.agent_count ?? 0)
            const isSelected = bucket === b
            return (
              <div key={b} onClick={() => { setBucket(isSelected ? '' : b); setPage(0) }} style={{
                padding: '16px', borderRadius: '10px', cursor: 'pointer',
                border: `2px solid ${isSelected ? cfg.color : cfg.border}`,
                backgroundColor: isSelected ? cfg.bg : '#fff',
                transition: 'all 0.15s',
              }}>
                <div style={{ fontSize: '20px', marginBottom: '8px' }}>{cfg.icon}</div>
                {loading ? (
                  <>
                    <Skeleton width={60} height={22} radius={4} />
                    <div style={{ marginTop: '8px' }}><Skeleton width={80} height={12} /></div>
                    <div style={{ marginTop: '6px' }}><Skeleton width={50} height={10} /></div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: '22px', fontWeight: '800', color: cfg.color }}>{count.toLocaleString('id')}</div>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '2px' }}>{cfg.label}</div>
                    <div style={{ fontSize: '11px', color: '#9ca3af' }}>{totalAgents > 0 ? Math.round(count / totalAgents * 100) : 0}% dari total</div>
                    {data && Number(data.total_fee) > 0 && (
                      <div style={{ fontSize: '11px', color: cfg.color, marginTop: '4px', fontWeight: '600' }}>
                        {formatFee(Number(data.total_fee))} fee/hari ini
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>

        {/* Filters + Export */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={filterMitra} onChange={e => { setFilterMitra(e.target.value); setFilterPic(''); setPage(0) }} style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px', color: '#374151', backgroundColor: '#fff', cursor: 'pointer' }}>
            <option value="">Semua Mitra</option>
            {mitras.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={filterPic} onChange={e => { setFilterPic(e.target.value); setPage(0) }} style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px', color: '#374151', backgroundColor: '#fff', cursor: 'pointer', maxWidth: '180px' }}>
            <option value="">Semua PIC</option>
            {pics.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          {(bucket || filterMitra || filterPic) && (
            <button onClick={() => { setBucket(''); setFilterMitra(''); setFilterPic(''); setPage(0) }} style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#6b7280', fontSize: '12px', cursor: 'pointer' }}>
              ✕ Reset
            </button>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: '#6b7280' }}>{loadingList ? 'Memuat...' : `${total.toLocaleString('id')} agen`}</span>
            <button onClick={exportCSV} style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #0344D8', backgroundColor: '#fff', color: '#0344D8', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
              ↓ Export CSV
            </button>
          </div>
        </div>

        {/* Table */}
        {!loadingList && agents.length > 0 && (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden', marginBottom: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 150px 150px 60px 70px 80px 80px 90px', padding: '10px 16px', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.05em' }}>
              <div>BUCKET</div><div>AGEN</div><div>MITRA</div><div>PIC</div>
              <div style={{ textAlign: 'center' }}>HARI</div>
              <div style={{ textAlign: 'right' }}>TRX</div>
              <div style={{ textAlign: 'right' }}>TRANSFER</div>
              <div style={{ textAlign: 'right' }}>CEK SALDO</div>
              <div style={{ textAlign: 'right' }}>FEE</div>
            </div>
            {agents.map((agent, i) => (
              <div key={agent.serial_number} onClick={() => openDrawer(agent)}
                style={{ display: 'grid', gridTemplateColumns: '120px 1fr 150px 150px 60px 70px 80px 80px 90px', padding: '11px 16px', borderBottom: i < agents.length - 1 ? '1px solid #f3f4f6' : 'none', alignItems: 'center', backgroundColor: '#fff', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = '#fff'}
              >
                <div><BucketChip b={agent.bucket} /></div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#111827' }}>{agent.merchant_name ?? agent.serial_number}</div>
                  <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '1px' }}>{agent.serial_number}</div>
                </div>
                <div style={{ fontSize: '12px', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.mitra ?? '—'}</div>
                <div style={{ fontSize: '12px', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.pic ?? '—'}</div>
                <div style={{ fontSize: '14px', fontWeight: '700', textAlign: 'center', color: agent.active_days >= 8 ? '#166534' : agent.active_days >= 5 ? '#ca8a04' : '#dc2626' }}>{agent.active_days}</div>
                <div style={{ fontSize: '12px', color: '#374151', textAlign: 'right' }}>{Number(agent.total_trx).toLocaleString('id')}</div>
                <div style={{ fontSize: '12px', color: '#374151', textAlign: 'right' }}>{Number(agent.transfer_trx).toLocaleString('id')}</div>
                <div style={{ fontSize: '12px', color: '#374151', textAlign: 'right' }}>{Number(agent.cek_saldo_trx).toLocaleString('id')}</div>
                <div style={{ fontSize: '12px', color: '#374151', textAlign: 'right' }}>{formatFee(Number(agent.total_fee))}</div>
              </div>
            ))}
          </div>
        )}

        {!loadingList && agents.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px', backgroundColor: '#f9fafb', borderRadius: '10px', border: '1px dashed #e5e7eb', color: '#9ca3af', fontSize: '13px' }}>
            Tidak ada agen ditemukan
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', alignItems: 'center' }}>
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: page === 0 ? '#d1d5db' : '#374151', fontSize: '13px', cursor: page === 0 ? 'not-allowed' : 'pointer' }}>← Prev</button>
            <span style={{ fontSize: '13px', color: '#6b7280' }}>{page + 1} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: page >= totalPages - 1 ? '#d1d5db' : '#374151', fontSize: '13px', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer' }}>Next →</button>
          </div>
        )}

        {/* Agent Detail Drawer */}
        {selectedAgent && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}>
            <div onClick={() => setSelectedAgent(null)} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)' }} />
            <div style={{ position: 'relative', width: '480px', height: '100%', backgroundColor: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
              {/* Drawer Header */}
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'sticky', top: 0, backgroundColor: '#fff', zIndex: 1 }}>
                <div>
                  <div style={{ fontSize: '18px', fontWeight: '800', color: '#111827', marginBottom: '4px' }}>{selectedAgent.merchant_name ?? selectedAgent.serial_number}</div>
                  <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '6px' }}>{selectedAgent.serial_number}</div>
                  <BucketChip b={selectedAgent.bucket} />
                </div>
                <button onClick={() => setSelectedAgent(null)} style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#6b7280', fontSize: '18px', cursor: 'pointer', lineHeight: 1 }}>✕</button>
              </div>

              {loadingDetail ? (
                <div style={{ padding: '40px 24px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '16px' }}>MEMUAT DATA AGEN...</div>
                  {[1,2,3,4,5].map(i => (
                    <div key={i} style={{ display: 'flex', gap: '12px', padding: '10px 0', borderBottom: '1px solid #f9fafb' }}>
                      <Skeleton width={80} height={12} />
                      <Skeleton width={140} height={12} />
                    </div>
                  ))}
                  <div style={{ marginTop: '24px', marginBottom: '12px' }}><Skeleton width={120} height={12} /></div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                    {[1,2,3,4,5,6].map(i => (
                      <div key={i} style={{ padding: '10px 12px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
                        <Skeleton width="60%" height={14} />
                        <div style={{ marginTop: '6px' }}><Skeleton width="80%" height={10} /></div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: '24px', marginBottom: '12px' }}><Skeleton width={140} height={12} /></div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '80px' }}>
                    {Array.from({ length: 14 }, (_, i) => (
                      <div key={i} style={{ flex: 1, height: `${20 + Math.random() * 50}px`, backgroundColor: '#e5e7eb', borderRadius: '3px 3px 0 0' }} />
                    ))}
                  </div>
                </div>
              ) : agentDetail.length > 0 ? (
                <div style={{ padding: '20px 24px' }}>
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

                  {/* Bucket Badge di Drawer */}
                  <div style={{ marginBottom: '24px', padding: '12px 16px', borderRadius: '8px', backgroundColor: BUCKET_CONFIG[selectedAgent.bucket as keyof typeof BUCKET_CONFIG]?.bg ?? '#f9fafb', border: `1px solid ${BUCKET_CONFIG[selectedAgent.bucket as keyof typeof BUCKET_CONFIG]?.border ?? '#e5e7eb'}` }}>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '8px' }}>KLASIFIKASI</div>
                    <div style={{ display: 'flex', gap: '16px' }}>
                      <div>
                        <div style={{ fontSize: '11px', color: '#9ca3af' }}>Bucket</div>
                        <div style={{ marginTop: '4px' }}><BucketChip b={selectedAgent.bucket} /></div>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: '#9ca3af' }}>Hari Aktif</div>
                        <div style={{ fontSize: '16px', fontWeight: '700', color: selectedAgent.active_days >= 8 ? '#166534' : selectedAgent.active_days >= 5 ? '#ca8a04' : '#dc2626' }}>
                          {selectedAgent.active_days} / 14 hari
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: '#9ca3af' }}>Total TRX</div>
                        <div style={{ fontSize: '16px', fontWeight: '700', color: '#111827' }}>{Number(selectedAgent.total_trx).toLocaleString('id')}</div>
                      </div>
                    </div>
                  </div>

                  {/* DIP vs SWIPE */}
                  {(() => {
                    const totalDip   = agentDetail.reduce((s, d) => s + Number(d.dip_count), 0)
                    const totalSwipe = agentDetail.reduce((s, d) => s + Number(d.swipe_count), 0)
                    const total      = totalDip + totalSwipe
                    if (total === 0) return null
                    return (
                      <div style={{ marginBottom: '24px' }}>
                        <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>TIPE KARTU</div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <div style={{ flex: totalDip, padding: '8px', borderRadius: '6px', backgroundColor: '#eff6ff', textAlign: 'center' }}>
                            <div style={{ fontSize: '16px', fontWeight: '700', color: '#1d4ed8' }}>{totalDip.toLocaleString('id')}</div>
                            <div style={{ fontSize: '10px', color: '#6b7280' }}>DIP (Chip)</div>
                            <div style={{ fontSize: '10px', color: '#9ca3af' }}>{Math.round(totalDip/total*100)}%</div>
                          </div>
                          <div style={{ flex: totalSwipe || 1, padding: '8px', borderRadius: '6px', backgroundColor: '#fef9c3', textAlign: 'center' }}>
                            <div style={{ fontSize: '16px', fontWeight: '700', color: '#ca8a04' }}>{totalSwipe.toLocaleString('id')}</div>
                            <div style={{ fontSize: '10px', color: '#6b7280' }}>SWIPE (Bansos)</div>
                            <div style={{ fontSize: '10px', color: '#9ca3af' }}>{Math.round(totalSwipe/total*100)}%</div>
                          </div>
                        </div>
                      </div>
                    )
                  })()}

                  {/* Grafik TRX per hari */}
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>TRANSAKSI PER HARI</div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '80px' }}>
                      {(() => {
                        const maxTrx = Math.max(...agentDetail.map(d => Number(d.total_trx)), 1)
                        const sd = new Date(sinceDate)
                        return Array.from({ length: 14 }, (_, i) => {
                          const d = new Date(sd)
                          d.setDate(sd.getDate() + i)
                          const dateStr = d.toISOString().split('T')[0]
                          const found = agentDetail.find(a => a.transaction_date === dateStr)
                          const trx = found ? Number(found.total_trx) : 0
                          return (
                            <div key={dateStr} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}
                              title={`${dateStr}: ${trx} trx`}>
                              <div style={{ width: '100%', height: `${Math.max(4, (trx / maxTrx) * 64)}px`, backgroundColor: trx > 0 ? '#0344D8' : '#f3f4f6', borderRadius: '3px 3px 0 0', transition: 'height 0.3s' }} />
                              <div style={{ fontSize: '8px', color: '#d1d5db', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                                {new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                              </div>
                            </div>
                          )
                        })
                      })()}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>Tidak ada data</div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
