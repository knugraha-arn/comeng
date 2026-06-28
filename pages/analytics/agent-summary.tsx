import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Layout from '../../components/Layout'
import { createBrowserClient } from '@supabase/ssr'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgentSummaryRow {
  serial_number: string
  merchant_name: string | null
  mitra: string | null
  pic: string | null
  bucket: string
  trend: string
  liquidity_status: string
  w2_status: string
  kelompok: string
  prioritas: string
  active_days_14: number
  total_trx_14: number
  trx_transfer_14: number
  window_start: string
  window_end: string
}

interface AgentDayDetail {
  transaction_date: string
  total_trx: number
  transfer_trx: number
  cek_saldo_trx: number
  total_fee: number
  total_amount: number
  merchant_name: string | null
  mitra: string | null
  pic: string | null
  alamat_struk: string | null
  brand: string | null
  tipe_mesin: string | null
  source_app: string | null
  terminal_data_source: string | null
}

interface AgentLiquidityDetail {
  transaction_date: string
  daily_amount: number
  daily_trx: number
  avg_daily_amount_14d: number
  avg_daily_amount_w1: number
  avg_daily_amount_w2: number
  liquidity_ratio: number
  liquidity_status: 'kuat' | 'menurun' | 'lemah' | 'no_data'
}

interface SummaryCount {
  total_count: number
  sehat_count: number
  baru_aktif_count: number
  kurang_sehat_count: number
}

// ── Configs ───────────────────────────────────────────────────────────────────

const TREND_CFG = {
  growing:    { label: 'Growing',    icon: '💎', color: '#166534', bg: '#dcfce7', border: '#bbf7d0' },
  declining:  { label: 'Declining',  icon: '⚠️', color: '#92400e', bg: '#fef9c3', border: '#fde68a' },
  consistent: { label: 'Konsisten',  icon: '✅', color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe' },
}

const BUCKET_CFG: Record<string, { label: string, color: string, bg: string, border: string }> = {
  productive: { label: 'Productive', color: '#166534', bg: '#dcfce7', border: '#bbf7d0' },
  moderate:   { label: 'Moderate',   color: '#ca8a04', bg: '#fef9c3', border: '#fde68a' },
  sporadic:   { label: 'Sporadic',   color: '#dc2626', bg: '#fee2e2', border: '#fecaca' },
}

const LIQ_CFG = {
  kuat:    { label: 'Kuat',    color: '#166534', bg: '#dcfce7', border: '#bbf7d0', sublabel: 'Float kemungkinan aman' },
  menurun: { label: 'Menurun', color: '#92400e', bg: '#fef9c3', border: '#fde68a', sublabel: 'Perlu perhatian' },
  lemah:   { label: 'Lemah',   color: '#dc2626', bg: '#fee2e2', border: '#fecaca', sublabel: 'Kemungkinan float menipis' },
  no_data: { label: '—',       color: '#9ca3af', bg: '#f9fafb', border: '#e5e7eb', sublabel: 'Data tidak cukup' },
}

const W2_CFG: Record<string, { label: string, color: string, bg: string }> = {
  retained: { label: 'Retained', color: '#374151', bg: '#f3f4f6' },
  baru:     { label: 'Baru',     color: '#1e40af', bg: '#eff6ff' },
  hilang:   { label: 'Hilang',   color: '#dc2626', bg: '#fee2e2' },
}

const KEL_CFG = {
  sehat:        { label: 'Sehat',        emoji: '✅', color: '#166534', bg: '#f0fdf4', border: '#bbf7d0', strip: '#22c55e' },
  baru_aktif:   { label: 'Baru Aktif',   emoji: '🔵', color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe', strip: '#3b82f6' },
  kurang_sehat: { label: 'Kurang Sehat', emoji: '⚠️', color: '#dc2626', bg: '#fef2f2', border: '#fecaca', strip: '#ef4444' },
}

const PAGE_SIZE = 25

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtFee(n: number) {
  if (n >= 1_000_000) return `Rp ${(n/1_000_000).toFixed(1)}jt`
  if (n >= 1_000)     return `Rp ${(n/1_000).toFixed(0)}rb`
  return `Rp ${n}`
}

function fmtAmount(n: number) {
  if (n >= 1_000_000_000) return `Rp ${(n/1_000_000_000).toFixed(1)}M`
  if (n >= 1_000_000)     return `Rp ${(n/1_000_000).toFixed(1)}jt`
  if (n >= 1_000)         return `Rp ${(n/1_000).toFixed(0)}rb`
  return `Rp ${n}`
}

function fmtDate(d: string) {
  if (!d) return ''
  const parts = d.split('-')
  const MONTHS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']
  return `${parseInt(parts[2])} ${MONTHS[parseInt(parts[1]) - 1]} ${parts[0]}`
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AgentSummaryPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [agents, setAgents]           = useState<AgentSummaryRow[]>([])
  const [counts, setCounts]           = useState<SummaryCount | null>(null)
  const [loading, setLoading]         = useState(true)
  const [mitraList, setMitraList]     = useState<string[]>([])
  const [filterMitra, setFilterMitra] = useState('')
  const [filterKel, setFilterKel]     = useState('')
  const [page, setPage]               = useState(0)
  const [totalCount, setTotalCount]   = useState(0)

  // Drawer
  const [selectedAgent, setSelectedAgent]   = useState<AgentSummaryRow | null>(null)
  const [agentDetail, setAgentDetail]       = useState<AgentDayDetail[]>([])
  const [liqDetail, setLiqDetail]           = useState<AgentLiquidityDetail[]>([])
  const [loadingDrawer, setLoadingDrawer]   = useState(false)

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)
  const windowStart = agents[0]?.window_start ?? ''
  const windowEnd   = agents[0]?.window_end   ?? ''

  useEffect(() => { loadMitraList() }, [])
  useEffect(() => { setPage(0) }, [filterMitra, filterKel])
  useEffect(() => { loadData() }, [filterMitra, filterKel, page])

  async function loadMitraList() {
    const { data } = await supabase.rpc('get_mitra_list')
    if (data) setMitraList(data.map((m: { mitra: string }) => m.mitra).sort())
  }

  async function loadData() {
    setLoading(true)
    try {
      const [agentsRes, countsRes] = await Promise.all([
        supabase.rpc('get_agent_reach_out', { p_mitra: filterMitra, p_kelompok: filterKel, p_limit: PAGE_SIZE, p_offset: page * PAGE_SIZE }),
        supabase.rpc('get_agent_reach_out_count', { p_mitra: filterMitra, p_kelompok: filterKel }),
      ])
      setAgents(agentsRes.data ?? [])
      const c = countsRes.data?.[0]
      if (c) { setCounts(c); setTotalCount(Number(c.total_count)) }
    } finally { setLoading(false) }
  }

  async function openDrawer(agent: AgentSummaryRow) {
    setSelectedAgent(agent)
    setAgentDetail([])
    setLiqDetail([])
    setLoadingDrawer(true)
    try {
      const [detailRes, liqRes] = await Promise.all([
        supabase.rpc('get_agent_detail', { p_serial: agent.serial_number, p_since: agent.window_start, p_until: agent.window_end }),
        supabase.rpc('get_agent_liquidity_summary', { p_serial: agent.serial_number }),
      ])
      setAgentDetail(detailRes.data ?? [])
      setLiqDetail(liqRes.data ?? [])
    } finally { setLoadingDrawer(false) }
  }

  async function exportCSV() {
    const { data } = await supabase.rpc('get_agent_reach_out', { p_mitra: filterMitra, p_kelompok: filterKel, p_limit: 9999, p_offset: 0 })
    if (!data || data.length === 0) return
    const KEL_LABEL: Record<string, string> = { sehat: 'Sehat', baru_aktif: 'Baru Aktif', kurang_sehat: 'Kurang Sehat' }
    const sorted = [...data].sort((a: AgentSummaryRow, b: AgentSummaryRow) => {
      const mc = (a.mitra ?? '').localeCompare(b.mitra ?? '', 'id')
      if (mc !== 0) return mc
      const ko: Record<string, number> = { sehat: 0, baru_aktif: 1, kurang_sehat: 2 }
      const kc = (ko[a.kelompok] ?? 9) - (ko[b.kelompok] ?? 9)
      if (kc !== 0) return kc
      return b.trx_transfer_14 - a.trx_transfer_14
    })
    const header = [
      `# Agent Summary — Data 14H dari ${fmtDate(data[0].window_start)} sampai ${fmtDate(data[0].window_end)}`,
      `# Diekspor: ${new Date().toLocaleString('id-ID')}`,
      `# Filter: ${filterMitra || 'Semua Mitra'} | ${filterKel ? KEL_LABEL[filterKel] : 'Semua Kelompok'} | ${sorted.length} agen`,
      '',
      'No,Nama Agen,Serial Number,Mitra,PIC,Status,TRX Transfer 14H',
    ]
    const rows = sorted.map((a: AgentSummaryRow, i: number) => [
      i + 1,
      `"${(a.merchant_name ?? '').replace(/"/g, '""')}"`,
      a.serial_number,
      `"${(a.mitra ?? '').replace(/"/g, '""')}"`,
      `"${(a.pic ?? '').replace(/"/g, '""')}"`,
      KEL_LABEL[a.kelompok] ?? a.kelompok,
      a.trx_transfer_14,
    ].join(','))
    const csv  = [...header, ...rows].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href  = url
    const kl = filterKel ? `-${KEL_LABEL[filterKel]?.toLowerCase().replace(' ','-')}` : ''
    const ml = filterMitra ? `-${filterMitra.split(' ')[0].toLowerCase()}` : ''
    link.download = `agent-summary${ml}${kl}-${new Date().toISOString().slice(0,10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  // Drawer computed
  const liqSummary = liqDetail[0] ?? null
  const trendCfg   = TREND_CFG[selectedAgent?.trend as keyof typeof TREND_CFG] ?? TREND_CFG.consistent
  const bucketCfg  = BUCKET_CFG[selectedAgent?.bucket ?? ''] ?? BUCKET_CFG.sporadic

  // W1/W2 computed dari agentDetail
  const w1Days = agentDetail.filter(d => {
    if (!selectedAgent) return false
    const [sy, sm, sd] = selectedAgent.window_start.split('-').map(Number)
    const w1End = new Date(sy, sm - 1, sd + 6)
    const dt = new Date(d.transaction_date)
    return dt <= w1End
  })
  const w2Days = agentDetail.filter(d => {
    if (!selectedAgent) return false
    const [sy, sm, sd] = selectedAgent.window_start.split('-').map(Number)
    const w2Start = new Date(sy, sm - 1, sd + 7)
    const dt = new Date(d.transaction_date)
    return dt >= w2Start
  })
  const avgTrxW1 = w1Days.length > 0 ? +(w1Days.reduce((s,d) => s + Number(d.total_trx), 0) / w1Days.length).toFixed(2) : 0
  const avgTrxW2 = w2Days.length > 0 ? +(w2Days.reduce((s,d) => s + Number(d.total_trx), 0) / w2Days.length).toFixed(2) : 0
  const changePct = avgTrxW1 > 0 ? Math.round((avgTrxW2 - avgTrxW1) / avgTrxW1 * 100) : 0

  return (
    <Layout>
      <Head><title>Agent Summary — AMARIS</title></Head>

      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '11px', fontWeight: '600', color: '#9ca3af', letterSpacing: '0.1em', marginBottom: '4px' }}>ANALITIK AGEN</div>
        <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#111827', margin: 0, letterSpacing: '-0.02em' }}>📋 Agent Summary</h1>
        {windowStart && windowEnd && (
          <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
            Data transaksi <strong>14 hari</strong> dari tanggal {fmtDate(windowStart)} sampai {fmtDate(windowEnd)}
            {counts && <span style={{ marginLeft: '8px', color: '#9ca3af' }}>· {counts.total_count.toLocaleString('id')} agen</span>}
          </p>
        )}
      </div>

      {/* Filter chips + count chips — gaya Lite & Plus */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        {([
          { key: 'sehat',        label: '✅ Sehat',        count: counts?.sehat_count },
          { key: 'baru_aktif',   label: '🔵 Baru Aktif',   count: counts?.baru_aktif_count },
          { key: 'kurang_sehat', label: '⚠️ Kurang Sehat', count: counts?.kurang_sehat_count },
        ] as const).map(c => {
          const cfg = KEL_CFG[c.key]
          const active = filterKel === c.key
          return (
            <button key={c.key} onClick={() => setFilterKel(active ? '' : c.key)}
              style={{ padding: '6px 14px', borderRadius: '99px', border: `1px solid ${active ? cfg.border : '#e5e7eb'}`, backgroundColor: active ? cfg.bg : '#fff', color: active ? cfg.color : '#374151', fontSize: '13px', fontWeight: active ? '700' : '400', cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '6px' }}>
              {c.label}
              <span style={{ padding: '1px 7px', borderRadius: '99px', backgroundColor: active ? cfg.color : '#f3f4f6', color: active ? '#fff' : '#6b7280', fontSize: '11px', fontWeight: '700' }}>
                {c.count?.toLocaleString('id') ?? '—'}
              </span>
            </button>
          )
        })}
      </div>

      {/* Filter row */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
        <select value={filterMitra} onChange={e => setFilterMitra(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '13px', minWidth: '220px', backgroundColor: '#fff' }}>
          <option value="">Semua Mitra</option>
          {mitraList.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        {(filterMitra || filterKel) && (
          <button onClick={() => { setFilterMitra(''); setFilterKel('') }}
            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', fontSize: '12px', color: '#6b7280', cursor: 'pointer' }}>
            Reset
          </button>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: '12px', color: '#9ca3af' }}>{totalCount.toLocaleString('id')} agen</span>
        <button onClick={exportCSV}
          style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', fontSize: '13px', color: '#374151', cursor: 'pointer', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '6px' }}>
          📥 Export CSV
        </button>
      </div>

      {/* Tabel */}
      <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden', marginBottom: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '6px 1fr 160px 150px 140px 80px', padding: '10px 16px', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.05em' }}>
          <div />
          <div>AGEN</div>
          <div>MITRA</div>
          <div>PIC</div>
          <div style={{ textAlign: 'center' }}>BUCKET · TREND · W2</div>
          <div style={{ textAlign: 'right' }}>TRX</div>
        </div>

        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>Memuat data...</div>
        ) : agents.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>Tidak ada data</div>
        ) : agents.map((a, i) => {
          const kel = KEL_CFG[a.kelompok as keyof typeof KEL_CFG] ?? KEL_CFG.kurang_sehat
          const bkt = BUCKET_CFG[a.bucket] ?? BUCKET_CFG.sporadic
          const trd = TREND_CFG[a.trend as keyof typeof TREND_CFG] ?? TREND_CFG.consistent
          const w2  = W2_CFG[a.w2_status] ?? W2_CFG.retained
          return (
            <div key={a.serial_number} style={{ display: 'grid', gridTemplateColumns: '6px 1fr 160px 150px 140px 80px', borderBottom: i < agents.length - 1 ? '1px solid #f3f4f6' : 'none', alignItems: 'center', backgroundColor: '#fff' }}>
              {/* Strip warna kelompok */}
              <div style={{ width: '6px', height: '100%', backgroundColor: kel.strip, alignSelf: 'stretch' }} />
              {/* Agen */}
              <div style={{ padding: '11px 12px' }}>
                <div onClick={() => openDrawer(a)} style={{ fontSize: '13px', fontWeight: '600', color: '#111827', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#0344D8')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#111827')}>
                  {a.merchant_name ?? '—'}
                </div>
                <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '1px' }}>
                  {a.serial_number} · {a.active_days_14} hari aktif
                </div>
              </div>
              {/* Mitra */}
              <div style={{ padding: '11px 8px', fontSize: '11px', color: '#374151' }}>{a.mitra ?? '—'}</div>
              {/* PIC */}
              <div style={{ padding: '11px 8px', fontSize: '11px', color: '#374151' }}>{a.pic ?? '—'}</div>
              {/* Status chips */}
              <div style={{ padding: '11px 8px', display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ padding: '1px 6px', borderRadius: '99px', fontSize: '10px', fontWeight: '600', backgroundColor: bkt.bg, color: bkt.color, border: `1px solid ${bkt.border}`, whiteSpace: 'nowrap' }}>{bkt.label}</span>
                <span style={{ padding: '1px 6px', borderRadius: '99px', fontSize: '10px', fontWeight: '600', backgroundColor: trd.bg, color: trd.color, border: `1px solid ${trd.border}`, whiteSpace: 'nowrap' }}>{trd.icon} {trd.label}</span>
                <span style={{ padding: '1px 6px', borderRadius: '99px', fontSize: '10px', fontWeight: '600', backgroundColor: w2.bg, color: w2.color, whiteSpace: 'nowrap' }}>{w2.label}</span>
              </div>
              {/* TRX Transfer */}
              <div style={{ padding: '11px 12px', textAlign: 'right', fontSize: '13px', fontWeight: '600', color: '#374151' }}>
                {a.trx_transfer_14.toLocaleString('id')}
              </div>
            </div>
          )
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '32px' }}>
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
            style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: page === 0 ? '#f9fafb' : '#fff', color: page === 0 ? '#9ca3af' : '#374151', fontSize: '13px', cursor: page === 0 ? 'not-allowed' : 'pointer' }}>
            ← Prev
          </button>
          <span style={{ padding: '6px 14px', fontSize: '13px', color: '#6b7280' }}>{page + 1} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
            style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: page >= totalPages - 1 ? '#f9fafb' : '#fff', color: page >= totalPages - 1 ? '#9ca3af' : '#374151', fontSize: '13px', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer' }}>
            Next →
          </button>
        </div>
      )}

      {/* ── Drawer Agent Detail ─────────────────────────────────────────────── */}
      {selectedAgent && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}>
          <div onClick={() => setSelectedAgent(null)} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)' }} />
          <div style={{ position: 'relative', width: '480px', height: '100%', backgroundColor: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

            {/* Header sticky */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'sticky', top: 0, backgroundColor: '#fff', zIndex: 1 }}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: '800', color: '#111827', marginBottom: '4px' }}>
                  {selectedAgent.merchant_name ?? selectedAgent.serial_number}
                </div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '6px' }}>{selectedAgent.serial_number}</div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{ padding: '2px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: '700', backgroundColor: trendCfg.bg, color: trendCfg.color, border: `1px solid ${trendCfg.border}` }}>
                    {trendCfg.icon} {trendCfg.label}
                  </span>
                  <span style={{ padding: '2px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: '700', backgroundColor: bucketCfg.bg, color: bucketCfg.color, border: `1px solid ${bucketCfg.border}` }}>
                    {bucketCfg.label}
                  </span>
                </div>
              </div>
              <button onClick={() => setSelectedAgent(null)}
                style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#6b7280', fontSize: '18px', cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>

            {loadingDrawer ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>Memuat data...</div>
            ) : agentDetail.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>Data tidak tersedia</div>
            ) : (
              <div style={{ padding: '20px 24px' }}>

                {/* INFO AGEN */}
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

                {/* PERBANDINGAN W1 vs W2 */}
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>PERBANDINGAN PERFORMA (W1 vs W2)</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    {[
                      { label: 'Avg TRX/hari W1 (1–7)',   value: avgTrxW1 > 0 ? String(avgTrxW1) : '—',     highlight: false },
                      { label: 'Avg TRX/hari W2 (8–14)',  value: avgTrxW2 > 0 ? String(avgTrxW2) : '—',     highlight: true },
                      { label: 'Hari aktif W1',            value: `${w1Days.length} hari`,                   highlight: false },
                      { label: 'Hari aktif W2',            value: `${w2Days.length} hari`,                   highlight: false },
                      { label: 'Total TRX W2',             value: w2Days.reduce((s,d) => s + Number(d.total_trx), 0).toLocaleString('id'), highlight: false },
                      { label: 'Perubahan W1→W2',          value: `${changePct > 0 ? '+' : ''}${changePct}%`, highlight: true },
                    ].map(s => (
                      <div key={s.label} style={{ padding: '10px 12px', backgroundColor: s.highlight ? trendCfg.bg : '#f9fafb', borderRadius: '8px', textAlign: 'center', border: s.highlight ? `1px solid ${trendCfg.border}` : 'none' }}>
                        <div style={{ fontSize: '14px', fontWeight: '700', color: s.highlight ? trendCfg.color : '#111827' }}>{s.value}</div>
                        <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* RINGKASAN 14 HARI */}
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>RINGKASAN 14 HARI</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                    {[
                      { label: 'Total TRX',   value: agentDetail.reduce((s,d) => s + Number(d.total_trx), 0).toLocaleString('id') },
                      { label: 'Transfer',    value: agentDetail.reduce((s,d) => s + Number(d.transfer_trx), 0).toLocaleString('id') },
                      { label: 'Cek Saldo',   value: agentDetail.reduce((s,d) => s + Number(d.cek_saldo_trx), 0).toLocaleString('id') },
                      { label: 'Total Fee',   value: fmtFee(agentDetail.reduce((s,d) => s + Number(d.total_fee), 0)) },
                      { label: 'Total Amount',value: fmtAmount(agentDetail.reduce((s,d) => s + Number(d.total_amount), 0)) },
                      { label: 'Hari Aktif',  value: `${agentDetail.length} hari` },
                    ].map(s => (
                      <div key={s.label} style={{ padding: '10px 12px', backgroundColor: '#f9fafb', borderRadius: '8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '14px', fontWeight: '700', color: '#111827' }}>{s.value}</div>
                        <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* LIKUIDITAS */}
                {liqSummary && (
                  <div style={{ marginBottom: '24px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>LIKUIDITAS AGEN</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div style={{ padding: '10px 12px', backgroundColor: '#f9fafb', borderRadius: '8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '14px', fontWeight: '700', color: '#111827' }}>{fmtAmount(liqSummary.avg_daily_amount_w1)}</div>
                        <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>Avg Amount/Hari W1</div>
                      </div>
                      {(() => {
                        const cfg = LIQ_CFG[liqSummary.liquidity_status] ?? LIQ_CFG.no_data
                        return (
                          <div style={{ padding: '10px 12px', backgroundColor: cfg.bg, borderRadius: '8px', textAlign: 'center', border: `1px solid ${cfg.border}` }}>
                            <div style={{ fontSize: '14px', fontWeight: '700', color: cfg.color }}>{liqSummary.liquidity_ratio?.toFixed(2)}x</div>
                            <div style={{ fontSize: '10px', color: cfg.color, marginTop: '2px', opacity: 0.8 }}>{cfg.sublabel}</div>
                            <div style={{ marginTop: '4px' }}>
                              <span style={{ padding: '1px 8px', borderRadius: '99px', fontSize: '10px', fontWeight: '700', backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>{cfg.label}</span>
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  </div>
                )}

                {/* CHART: TRX PER HARI */}
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>TRANSAKSI PER HARI</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '80px' }}>
                    {(() => {
                      const maxTrx = Math.max(...agentDetail.map(d => Number(d.total_trx)), 1)
                      const [sy, sm, sd] = selectedAgent.window_start.split('-').map(Number)
                      const startDate = new Date(sy, sm - 1, sd)
                      const w2StartDate = new Date(sy, sm - 1, sd + 7)
                      const w2StartStr = w2StartDate.toISOString().split('T')[0]
                      return Array.from({ length: 14 }, (_, i) => {
                        const d = new Date(startDate); d.setDate(startDate.getDate() + i)
                        const dateStr = d.toISOString().split('T')[0]
                        const found = agentDetail.find(a => a.transaction_date === dateStr)
                        const trx = found ? Number(found.total_trx) : 0
                        const isW2 = dateStr >= w2StartStr
                        return (
                          <div key={dateStr} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }} title={`${dateStr}: ${trx} trx`}>
                            <div style={{ width: '100%', height: `${Math.max(4, (trx / maxTrx) * 64)}px`, backgroundColor: trx > 0 ? (isW2 ? trendCfg.color : '#94a3b8') : '#f3f4f6', borderRadius: '3px 3px 0 0', transition: 'height 0.3s' }} />
                            <div style={{ fontSize: '8px', color: '#d1d5db', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                              {d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                            </div>
                          </div>
                        )
                      })
                    })()}
                  </div>
                  <div style={{ display: 'flex', gap: '12px', marginTop: '8px', fontSize: '10px', color: '#9ca3af' }}>
                    <span>▪ <span style={{ color: '#94a3b8' }}>W1 (1–7)</span></span>
                    <span>▪ <span style={{ color: trendCfg.color }}>W2 (8–14)</span></span>
                  </div>
                </div>

                {/* CHART: NOMINAL UANG BEREDAR */}
                {liqDetail.length > 0 && (
                  <div style={{ marginBottom: '24px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>NOMINAL UANG BEREDAR (14H)</div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '80px' }}>
                      {(() => {
                        const maxAmount = Math.max(...liqDetail.map(d => Number(d.daily_amount)), 1)
                        const avgAmount = liqSummary?.avg_daily_amount_w2 ?? 0
                        const [sy, sm, sd] = selectedAgent.window_start.split('-').map(Number)
                        const startDate = new Date(sy, sm - 1, sd)
                        return Array.from({ length: 14 }, (_, i) => {
                          const d = new Date(startDate); d.setDate(startDate.getDate() + i)
                          const dateStr = d.toISOString().split('T')[0]
                          const found = liqDetail.find(a => a.transaction_date === dateStr)
                          const amount = found ? Number(found.daily_amount) : 0
                          const barColor = amount === 0 ? '#f3f4f6' : amount < avgAmount * 0.5 ? '#ef4444' : amount < avgAmount * 0.8 ? '#eab308' : '#22c55e'
                          return (
                            <div key={dateStr} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }} title={`${dateStr}: ${fmtAmount(amount)}`}>
                              <div style={{ width: '100%', height: `${Math.max(4, (amount / maxAmount) * 64)}px`, backgroundColor: barColor, borderRadius: '3px 3px 0 0', transition: 'height 0.3s' }} />
                              <div style={{ fontSize: '8px', color: '#d1d5db', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                                {d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                              </div>
                            </div>
                          )
                        })
                      })()}
                    </div>
                  </div>
                )}

                {/* Link ke profil lengkap */}
                <button onClick={() => router.push(`/analytics/agent-profile?sn=${selectedAgent.serial_number}`)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#0344D8', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                  Lihat Profil Lengkap →
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </Layout>
  )
}
