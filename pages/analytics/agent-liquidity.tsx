import { useEffect, useState } from 'react'
import Head from 'next/head'
import Layout from '../../components/Layout'
import { createBrowserClient } from '@supabase/ssr'

interface AgentLiquidityRow {
  serial_number: string
  merchant_name: string | null
  mitra: string | null
  pic: string | null
  active_days_14: number
  avg_trx_14: number
  active_days_month: number
  total_trx_month: number
  avg_trx_month: number
  trx_change_pct: number
  trend: 'growing' | 'declining' | 'consistent'
  bucket: string
  avg_daily_amount_14d: number
  avg_daily_amount_mtd: number
  liquidity_ratio: number
  liquidity_status: 'kuat' | 'menurun' | 'lemah' | 'no_data'
}

interface AgentLiquidityDetail {
  transaction_date: string
  daily_amount: number
  daily_trx: number
  avg_daily_amount_14d: number
  avg_daily_amount_mtd: number
  liquidity_ratio: number
  liquidity_status: 'kuat' | 'menurun' | 'lemah' | 'no_data'
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

const LIQUIDITY_CONFIG = {
  kuat:    { label: 'Kuat',    color: '#166534', bg: '#dcfce7', border: '#bbf7d0', sublabel: 'Float kemungkinan aman' },
  menurun: { label: 'Menurun', color: '#92400e', bg: '#fef9c3', border: '#fde68a', sublabel: 'Perlu perhatian' },
  lemah:   { label: 'Lemah',   color: '#dc2626', bg: '#fee2e2', border: '#fecaca', sublabel: 'Kemungkinan float menipis' },
  no_data: { label: '—',       color: '#9ca3af', bg: '#f9fafb', border: '#e5e7eb', sublabel: 'Data tidak cukup' },
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

const SKELETON_STYLE = `@keyframes shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }`

function Skeleton({ width, height = 14, radius = 6 }: { width: string | number, height?: number, radius?: number }) {
  return (
    <div style={{ width, height, borderRadius: radius, background: 'linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite' }} />
  )
}

function formatAmount(val: number): string {
  if (val >= 1000000000) return `Rp ${(val / 1000000000).toFixed(1)}M`
  if (val >= 1000000) return `Rp ${(val / 1000000).toFixed(1)}jt`
  if (val >= 1000) return `Rp ${(val / 1000).toFixed(0)}rb`
  return `Rp ${val}`
}

function formatFee(val: number): string {
  if (val >= 1000000) return `Rp ${(val / 1000000).toFixed(1)}jt`
  if (val >= 1000) return `Rp ${(val / 1000).toFixed(0)}rb`
  return `Rp ${val}`
}

export default function AgentLiquidityPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [agents, setAgents] = useState<AgentLiquidityRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filterMitra, setFilterMitra] = useState('')
  const [filterPic, setFilterPic] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 25

  // Drawer
  const [selectedAgent, setSelectedAgent] = useState<AgentLiquidityRow | null>(null)
  const [agentDetail, setAgentDetail] = useState<AgentDayDetail[]>([])
  const [liquidityDetail, setLiquidityDetail] = useState<AgentLiquidityDetail[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [sinceDate, setSinceDate] = useState('')
  const [lastDate, setLastDate] = useState('')

  useEffect(() => { init() }, [])

  async function init() {
    setLoading(true)
    try {
      const { data } = await supabase.rpc('get_hidden_gem_agents', {
        p_min_active_days_month: 2,
        p_min_trx_month: 10,
        p_min_avg_trx_14: 3,
      })

      // Sort by liquidity_ratio ascending (paling lemah di atas)
      const sorted = (data ?? []).sort((a: AgentLiquidityRow, b: AgentLiquidityRow) =>
        (a.liquidity_ratio ?? 0) - (b.liquidity_ratio ?? 0)
      )
      setAgents(sorted)

      // Set date window dari data
      const { data: progressData } = await supabase.rpc('get_monthly_progress')
      if (progressData) {
        const d = typeof progressData === 'string' ? JSON.parse(progressData) : progressData
        setLastDate(d.end_date)
        const [y, m, dd] = d.end_date.split('-').map(Number)
        const sd = new Date(y, m - 1, dd - 13)
        setSinceDate(`${sd.getFullYear()}-${String(sd.getMonth() + 1).padStart(2, '0')}-${String(sd.getDate()).padStart(2, '0')}`)
      }
    } finally {
      setLoading(false)
    }
  }

  async function openDrawer(agent: AgentLiquidityRow) {
    setSelectedAgent(agent)
    setAgentDetail([])
    setLiquidityDetail([])
    setLoadingDetail(true)
    try {
      const [detailRes, liquidityRes] = await Promise.all([
        supabase.rpc('get_agent_detail', {
          p_serial: agent.serial_number,
          p_since: sinceDate,
          p_until: lastDate,
        }),
        supabase.rpc('get_agent_liquidity_summary', {
          p_serial: agent.serial_number,
        }),
      ])
      setAgentDetail(detailRes.data ?? [])
      setLiquidityDetail(liquidityRes.data ?? [])
    } finally {
      setLoadingDetail(false)
    }
  }

  const mitras = [...new Set(agents.map(a => a.mitra).filter(Boolean) as string[])].sort()
  const pics   = [...new Set(agents.filter(a => !filterMitra || a.mitra === filterMitra).map(a => a.pic).filter(Boolean) as string[])].sort()

  const filtered = agents
    .filter(a => !filterMitra || a.mitra === filterMitra)
    .filter(a => !filterPic || a.pic === filterPic)
    .filter(a => !filterStatus || a.liquidity_status === filterStatus)

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated  = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const lemahCount   = agents.filter(a => a.liquidity_status === 'lemah').length
  const menurunCount = agents.filter(a => a.liquidity_status === 'menurun').length
  const kuatCount    = agents.filter(a => a.liquidity_status === 'kuat').length

  const liquiditySummary = liquidityDetail[0] ?? null

  function LiquidityChip({ status }: { status: string }) {
    const cfg = LIQUIDITY_CONFIG[status as keyof typeof LIQUIDITY_CONFIG] ?? LIQUIDITY_CONFIG.no_data
    return (
      <span style={{ padding: '2px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: '700', backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, whiteSpace: 'nowrap' }}>
        {cfg.label}
      </span>
    )
  }

  function TrendChip({ trend }: { trend: string }) {
    const cfg = TREND_CONFIG[trend as keyof typeof TREND_CONFIG] ?? TREND_CONFIG.consistent
    return (
      <span style={{ padding: '2px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: '700', backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, whiteSpace: 'nowrap' }}>
        {cfg.icon} {cfg.label}
      </span>
    )
  }

  function BucketChip({ b }: { b: string }) {
    const cfg = BUCKET_CONFIG[b] ?? BUCKET_CONFIG.sporadic
    return (
      <span style={{ padding: '2px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: '700', backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, whiteSpace: 'nowrap' }}>
        {cfg.label}
      </span>
    )
  }

  return (
    <Layout>
      <style>{SKELETON_STYLE}</style>
      <Head><title>Agent Liquidity — AMARIS</title></Head>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}>

        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '11px', fontWeight: '600', color: '#9ca3af', letterSpacing: '0.1em', marginBottom: '4px' }}>ANALITIK AGEN</div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#111827', margin: 0, letterSpacing: '-0.02em' }}>💧 Agent Liquidity</h1>
          <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
            Estimasi kekuatan float agen berdasarkan perbandingan nominal uang beredar bulan ini vs 14 hari terakhir.
          </p>
        </div>

        {/* Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '24px' }}>
          {[
            { status: 'lemah',   count: lemahCount,   label: 'Lemah',   desc: 'Ratio < 0.5 — kemungkinan float menipis', cfg: LIQUIDITY_CONFIG.lemah },
            { status: 'menurun', count: menurunCount, label: 'Menurun', desc: 'Ratio 0.5–0.8 — perlu perhatian',          cfg: LIQUIDITY_CONFIG.menurun },
            { status: 'kuat',    count: kuatCount,    label: 'Kuat',    desc: 'Ratio ≥ 0.8 — float kemungkinan aman',    cfg: LIQUIDITY_CONFIG.kuat },
          ].map(({ status, count, label, desc, cfg }) => (
            <button key={status} onClick={() => { setFilterStatus(filterStatus === status ? '' : status); setPage(0) }}
              style={{
                padding: '16px 20px', borderRadius: '12px', textAlign: 'left', cursor: 'pointer',
                border: `2px solid ${filterStatus === status ? cfg.color : '#e5e7eb'}`,
                backgroundColor: filterStatus === status ? cfg.bg : '#fff',
                transition: 'all 0.15s',
              }}>
              <div style={{ fontSize: '28px', fontWeight: '800', color: cfg.color }}>{loading ? '—' : count}</div>
              <div style={{ fontSize: '13px', fontWeight: '700', color: cfg.color, marginTop: '2px' }}>{label}</div>
              <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>{desc}</div>
            </button>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={filterMitra} onChange={e => { setFilterMitra(e.target.value); setFilterPic(''); setPage(0) }}
            style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px', color: '#374151', backgroundColor: '#fff', cursor: 'pointer' }}>
            <option value="">Semua Mitra</option>
            {mitras.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={filterPic} onChange={e => { setFilterPic(e.target.value); setPage(0) }}
            style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px', color: '#374151', backgroundColor: '#fff', cursor: 'pointer', maxWidth: '180px' }}>
            <option value="">Semua PIC</option>
            {pics.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          {(filterMitra || filterPic || filterStatus) && (
            <button onClick={() => { setFilterMitra(''); setFilterPic(''); setFilterStatus(''); setPage(0) }}
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
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 150px 150px 110px 110px 70px', padding: '13px 16px', borderBottom: '1px solid #f3f4f6', gap: '16px', alignItems: 'center' }}>
                <Skeleton width={70} height={20} />
                <div><Skeleton width={120} height={13} /><div style={{marginTop:4}}><Skeleton width={80} height={10} /></div></div>
                <Skeleton width={100} height={12} />
                <Skeleton width={100} height={12} />
                <Skeleton width={80} height={12} />
                <Skeleton width={80} height={12} />
                <Skeleton width={50} height={20} />
              </div>
            ))}
          </div>
        ) : filtered.length > 0 ? (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 150px 150px 130px 130px 70px', padding: '10px 16px', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.05em' }}>
              <div>STATUS</div>
              <div>AGEN</div>
              <div>MITRA</div>
              <div>PIC</div>
              <div style={{ textAlign: 'right' }}>AVG AMOUNT/HARI (14H)</div>
              <div style={{ textAlign: 'right' }}>AVG AMOUNT/HARI (MTD)</div>
              <div style={{ textAlign: 'right' }}>RATIO</div>
            </div>
            {/* Rows */}
            {paginated.map((agent, i) => (
              <div key={agent.serial_number} onClick={() => openDrawer(agent)}
                style={{ display: 'grid', gridTemplateColumns: '90px 1fr 150px 150px 130px 130px 70px', padding: '11px 16px', borderBottom: i < paginated.length - 1 ? '1px solid #f3f4f6' : 'none', alignItems: 'center', backgroundColor: '#fff', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = '#fff'}
              >
                <div><LiquidityChip status={agent.liquidity_status} /></div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#111827' }}>{agent.merchant_name ?? agent.serial_number}</div>
                  <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '1px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span>{agent.serial_number}</span>
                    <BucketChip b={agent.bucket} />
                    <TrendChip trend={agent.trend} />
                  </div>
                </div>
                <div style={{ fontSize: '12px', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.mitra ?? '—'}</div>
                <div style={{ fontSize: '12px', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.pic ?? '—'}</div>
                <div style={{ fontSize: '12px', color: '#374151', textAlign: 'right', fontWeight: '600' }}>{formatAmount(agent.avg_daily_amount_14d)}</div>
                <div style={{ fontSize: '12px', color: '#374151', textAlign: 'right' }}>{formatAmount(agent.avg_daily_amount_mtd)}</div>
                <div style={{ textAlign: 'right' }}>
                  {(() => {
                    const cfg = LIQUIDITY_CONFIG[agent.liquidity_status] ?? LIQUIDITY_CONFIG.no_data
                    return (
                      <span style={{ fontSize: '12px', fontWeight: '700', color: cfg.color }}>
                        {agent.liquidity_ratio?.toFixed(2)}x
                      </span>
                    )
                  })()}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px', backgroundColor: '#f9fafb', borderRadius: '10px', border: '1px dashed #e5e7eb', color: '#9ca3af', fontSize: '13px' }}>
            Tidak ada agen ditemukan
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
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <LiquidityChip status={selectedAgent.liquidity_status} />
                  <BucketChip b={selectedAgent.bucket} />
                  <TrendChip trend={selectedAgent.trend} />
                </div>
              </div>
              <button onClick={() => setSelectedAgent(null)} style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#6b7280', fontSize: '18px', cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>

            {loadingDetail ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>Memuat data...</div>
            ) : (
              <div style={{ padding: '20px 24px' }}>

                {/* Info Agen */}
                {agentDetail.length > 0 && (() => {
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

                {/* Perbandingan TRX */}
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>PERFORMA TRX</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                    {[
                      { label: 'Avg TRX/hari (14H)', value: String(selectedAgent.avg_trx_14) },
                      { label: 'Avg TRX/hari (MTD)',  value: String(selectedAgent.avg_trx_month) },
                      { label: 'Hari Aktif (14H)',    value: `${selectedAgent.active_days_14} hari` },
                      { label: 'Hari Aktif (MTD)',    value: `${selectedAgent.active_days_month} hari` },
                      { label: 'Total TRX (MTD)',     value: Number(selectedAgent.total_trx_month).toLocaleString('id') },
                      { label: 'Growth TRX',          value: `${selectedAgent.trx_change_pct > 0 ? '+' : ''}${selectedAgent.trx_change_pct}%` },
                    ].map(s => (
                      <div key={s.label} style={{ padding: '10px 12px', backgroundColor: '#f9fafb', borderRadius: '8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '13px', fontWeight: '700', color: '#111827' }}>{s.value}</div>
                        <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Likuiditas — 2 card utama */}
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>LIKUIDITAS</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    {/* Card: Avg Amount 14H */}
                    <div style={{ padding: '14px 16px', backgroundColor: '#f9fafb', borderRadius: '8px', textAlign: 'center' }}>
                      <div style={{ fontSize: '16px', fontWeight: '800', color: '#111827' }}>
                        {formatAmount(selectedAgent.avg_daily_amount_14d)}
                      </div>
                      <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '4px' }}>Avg Amount/Hari (14H)</div>
                    </div>
                    {/* Card: Liquidity Ratio */}
                    {(() => {
                      const cfg = LIQUIDITY_CONFIG[selectedAgent.liquidity_status] ?? LIQUIDITY_CONFIG.no_data
                      return (
                        <div style={{ padding: '14px 16px', backgroundColor: cfg.bg, borderRadius: '8px', textAlign: 'center', border: `1px solid ${cfg.border}` }}>
                          <div style={{ fontSize: '16px', fontWeight: '800', color: cfg.color }}>
                            {selectedAgent.liquidity_ratio?.toFixed(2)}x
                          </div>
                          <div style={{ fontSize: '11px', fontWeight: '600', color: cfg.color, marginTop: '4px' }}>{cfg.label}</div>
                          <div style={{ fontSize: '10px', color: cfg.color, opacity: 0.7, marginTop: '2px' }}>{cfg.sublabel}</div>
                        </div>
                      )
                    })()}
                  </div>
                  {/* Avg Amount MTD */}
                  <div style={{ marginTop: '10px', padding: '10px 16px', backgroundColor: '#f9fafb', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: '#6b7280' }}>Avg Amount/Hari (MTD)</span>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: '#111827' }}>{formatAmount(selectedAgent.avg_daily_amount_mtd)}</span>
                  </div>
                </div>

                {/* Ringkasan 14 Hari */}
                {agentDetail.length > 0 && (
                  <div style={{ marginBottom: '24px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>RINGKASAN 14 HARI</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                      {[
                        { label: 'Total TRX',    value: agentDetail.reduce((s, d) => s + Number(d.total_trx), 0).toLocaleString('id') },
                        { label: 'Total Fee',    value: formatFee(agentDetail.reduce((s, d) => s + Number(d.total_fee), 0)) },
                        { label: 'Total Amount', value: formatAmount(agentDetail.reduce((s, d) => s + Number(d.total_amount), 0)) },
                      ].map(s => (
                        <div key={s.label} style={{ padding: '10px 12px', backgroundColor: '#f9fafb', borderRadius: '8px', textAlign: 'center' }}>
                          <div style={{ fontSize: '13px', fontWeight: '700', color: '#111827' }}>{s.value}</div>
                          <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>{s.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Grafik TRX per hari */}
                {agentDetail.length > 0 && (
                  <div style={{ marginBottom: '24px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>TRANSAKSI PER HARI (14H)</div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '70px' }}>
                      {(() => {
                        const maxTrx = Math.max(...agentDetail.map(d => Number(d.total_trx)), 1)
                        const sd = new Date(sinceDate)
                        return Array.from({ length: 14 }, (_, i) => {
                          const d = new Date(sd); d.setDate(sd.getDate() + i)
                          const dateStr = d.toISOString().split('T')[0]
                          const found = agentDetail.find(a => a.transaction_date === dateStr)
                          const trx = found ? Number(found.total_trx) : 0
                          return (
                            <div key={dateStr} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }} title={`${dateStr}: ${trx} trx`}>
                              <div style={{ width: '100%', height: `${Math.max(3, (trx / maxTrx) * 56)}px`, backgroundColor: trx > 0 ? '#6366f1' : '#f3f4f6', borderRadius: '2px 2px 0 0' }} />
                              <div style={{ fontSize: '7px', color: '#d1d5db', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                                {new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                              </div>
                            </div>
                          )
                        })
                      })()}
                    </div>
                  </div>
                )}

                {/* Grafik Amount per hari */}
                {liquidityDetail.length > 0 && (
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>NOMINAL UANG BEREDAR (14H)</div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '80px' }}>
                      {(() => {
                        const maxAmount = Math.max(...liquidityDetail.map(d => Number(d.daily_amount)), 1)
                        const avgAmount = liquiditySummary?.avg_daily_amount_14d ?? 0
                        const sd = new Date(sinceDate)
                        return Array.from({ length: 14 }, (_, i) => {
                          const d = new Date(sd); d.setDate(sd.getDate() + i)
                          const dateStr = d.toISOString().split('T')[0]
                          const found = liquidityDetail.find(a => a.transaction_date === dateStr)
                          const amount = found ? Number(found.daily_amount) : 0
                          const barColor = amount === 0 ? '#f3f4f6'
                            : amount < avgAmount * 0.5 ? '#ef4444'
                            : amount < avgAmount * 0.8 ? '#eab308'
                            : '#22c55e'
                          return (
                            <div key={dateStr} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }} title={`${dateStr}: ${formatAmount(amount)}`}>
                              <div style={{ width: '100%', height: `${Math.max(3, (amount / maxAmount) * 64)}px`, backgroundColor: barColor, borderRadius: '2px 2px 0 0', transition: 'height 0.3s' }} />
                              <div style={{ fontSize: '7px', color: '#d1d5db', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                                {new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                              </div>
                            </div>
                          )
                        })
                      })()}
                    </div>
                    <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '10px', color: '#9ca3af' }}>
                      <span>▪ <span style={{ color: '#22c55e' }}>≥ avg</span></span>
                      <span>▪ <span style={{ color: '#eab308' }}>50–80% avg</span></span>
                      <span>▪ <span style={{ color: '#ef4444' }}>&lt; 50% avg</span></span>
                    </div>
                    <div style={{ marginTop: '6px', fontSize: '10px', color: '#9ca3af' }}>
                      Avg 14H: {formatAmount(liquiditySummary?.avg_daily_amount_14d ?? 0)}/hari
                    </div>
                  </div>
                )}

              </div>
            )}
          </div>
        </div>
      )}
    </Layout>
  )
}
