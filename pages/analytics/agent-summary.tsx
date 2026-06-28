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
  growing:    { label: 'Growing',   icon: '💎', color: '#166534', bg: '#dcfce7', border: '#bbf7d0' },
  declining:  { label: 'Declining', icon: '⚠️', color: '#92400e', bg: '#fef9c3', border: '#fde68a' },
  consistent: { label: 'Konsisten', icon: '✅', color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe' },
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

const W2_CFG: Record<string, { label: string, color: string, bg: string, border: string }> = {
  retained: { label: 'Retained', color: '#374151', bg: '#f3f4f6', border: '#e5e7eb' },
  baru:     { label: 'Baru',     color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe' },
  hilang:   { label: 'Hilang',   color: '#dc2626', bg: '#fee2e2', border: '#fecaca' },
}

const KEL_CFG = {
  sehat:        { label: 'Sehat',        color: '#166534', bg: '#f0fdf4', border: '#bbf7d0', sublabel: 'Productive, stabil, float aman' },
  baru_aktif:   { label: 'Baru Aktif',   color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe', sublabel: 'Aktif di W2, tidak ada di W1' },
  kurang_sehat: { label: 'Kurang Sehat', color: '#dc2626', bg: '#fef2f2', border: '#fecaca', sublabel: 'Hilang, Sporadic, Declining, atau Lemah' },
}

const PAGE_SIZE = 25
const SKELETON_STYLE = `@keyframes shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }`

// ── Helpers ───────────────────────────────────────────────────────────────────

function Skeleton({ width, height = 14, radius = 6 }: { width: string | number, height?: number, radius?: number }) {
  return <div style={{ width, height, borderRadius: radius, background: 'linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite' }} />
}

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
  const p = d.split('-')
  const M = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']
  return `${parseInt(p[2])} ${M[parseInt(p[1])-1]} ${p[0]}`
}

function exportCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  const csv = [headers, ...rows]
    .map(r => r.map(v => {
      const s = String(v ?? '')
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
    }).join(','))
    .join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
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
  const [totalCount, setTotalCount]   = useState(0)
  const [page, setPage]               = useState(0)
  const [exporting, setExporting]     = useState(false)

  const [filterMitra, setFilterMitra] = useState('')
  const [filterPic, setFilterPic]     = useState('')
  const [filterKel, setFilterKel]     = useState('')

  const [mitraList, setMitraList]     = useState<string[]>([])
  const [picList, setPicList]         = useState<string[]>([])
  const [loadingPic, setLoadingPic]   = useState(false)

  const [windowStart, setWindowStart] = useState('')
  const [windowEnd, setWindowEnd]     = useState('')

  // Drawer
  const [selectedAgent, setSelectedAgent] = useState<AgentSummaryRow | null>(null)
  const [agentDetail, setAgentDetail]     = useState<AgentDayDetail[]>([])
  const [liqDetail, setLiqDetail]         = useState<AgentLiquidityDetail[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)

  const totalPages  = Math.ceil(totalCount / PAGE_SIZE)
  const liqSummary  = liqDetail[0] ?? null

  useEffect(() => { initPage() }, [])

  async function initPage() {
    setLoading(true)
    try {
      const [filterRes, picRes, countsRes, agentsRes] = await Promise.all([
        supabase.rpc('get_mitra_list'),
        supabase.rpc('get_pic_by_mitra', { p_mitra: '' }),
        supabase.rpc('get_agent_reach_out_count', { p_mitra: '', p_pic: '', p_kelompok: '' }),
        supabase.rpc('get_agent_reach_out', { p_mitra: '', p_pic: '', p_kelompok: '', p_limit: PAGE_SIZE, p_offset: 0 }),
      ])
      if (filterRes.data) setMitraList(filterRes.data.map((m: { mitra: string }) => m.mitra).sort())
      if (picRes.data) setPicList(picRes.data.map((p: { pic: string }) => p.pic))
      if (countsRes.data?.[0]) { setCounts(countsRes.data[0]); setTotalCount(Number(countsRes.data[0].total_count)) }
      if (agentsRes.data?.length > 0) {
        setAgents(agentsRes.data)
        setWindowStart(agentsRes.data[0].window_start)
        setWindowEnd(agentsRes.data[0].window_end)
      }
    } finally { setLoading(false) }
  }

  async function loadAgents(newPage: number, mitra: string, pic: string, kel: string) {
    setLoading(true)
    try {
      const [agentsRes, countsRes] = await Promise.all([
        supabase.rpc('get_agent_reach_out', { p_mitra: mitra, p_pic: pic, p_kelompok: kel, p_limit: PAGE_SIZE, p_offset: newPage * PAGE_SIZE }),
        supabase.rpc('get_agent_reach_out_count', { p_mitra: mitra, p_pic: pic, p_kelompok: kel }),
      ])
      if (agentsRes.data) {
        setAgents(agentsRes.data)
        if (agentsRes.data.length > 0) { setWindowStart(agentsRes.data[0].window_start); setWindowEnd(agentsRes.data[0].window_end) }
      }
      if (countsRes.data?.[0]) { setCounts(countsRes.data[0]); setTotalCount(Number(countsRes.data[0].total_count)) }
    } finally { setLoading(false) }
  }

  async function handleMitraChange(mitra: string) {
    setFilterMitra(mitra); setFilterPic(''); setPage(0)
    setLoadingPic(true)
    try {
      const { data } = await supabase.rpc('get_pic_by_mitra', { p_mitra: mitra })
      setPicList((data ?? []).map((p: { pic: string }) => p.pic))
    } finally { setLoadingPic(false) }
    await loadAgents(0, mitra, '', filterKel)
  }

  async function handlePicChange(pic: string) {
    setFilterPic(pic); setPage(0)
    await loadAgents(0, filterMitra, pic, filterKel)
  }

  async function handleKelChange(kel: string) {
    const newKel = filterKel === kel ? '' : kel
    setFilterKel(newKel); setPage(0)
    await loadAgents(0, filterMitra, filterPic, newKel)
  }

  async function handleReset() {
    setFilterMitra(''); setFilterPic(''); setFilterKel(''); setPage(0)
    setLoadingPic(true)
    try {
      const { data } = await supabase.rpc('get_pic_by_mitra', { p_mitra: '' })
      setPicList((data ?? []).map((p: { pic: string }) => p.pic))
    } finally { setLoadingPic(false) }
    await loadAgents(0, '', '', '')
  }

  async function handlePageChange(newPage: number) {
    setPage(newPage)
    await loadAgents(newPage, filterMitra, filterPic, filterKel)
  }

  async function openDrawer(agent: AgentSummaryRow) {
    setSelectedAgent(agent); setAgentDetail([]); setLiqDetail([]); setLoadingDetail(true)
    try {
      const [detailRes, liqRes] = await Promise.all([
        supabase.rpc('get_agent_detail', { p_serial: agent.serial_number, p_since: agent.window_start, p_until: agent.window_end }),
        supabase.rpc('get_agent_liquidity_summary', { p_serial: agent.serial_number }),
      ])
      setAgentDetail(detailRes.data ?? [])
      setLiqDetail(liqRes.data ?? [])
    } finally { setLoadingDetail(false) }
  }

  async function handleExport() {
    setExporting(true)
    try {
      const { data } = await supabase.rpc('get_agent_reach_out', { p_mitra: filterMitra, p_pic: filterPic, p_kelompok: filterKel, p_limit: 9999, p_offset: 0 })
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
      const rows = sorted.map((a: AgentSummaryRow, i: number) => [
        i + 1, a.merchant_name ?? '', a.serial_number, a.mitra ?? '', a.pic ?? '',
        KEL_LABEL[a.kelompok] ?? a.kelompok, a.trx_transfer_14,
      ])
      const kelLabel = filterKel ? `-${(KEL_LABEL[filterKel] ?? filterKel).toLowerCase().replace(' ','-')}` : ''
      const mlabel   = filterMitra ? `-${filterMitra.split(' ')[0].toLowerCase()}` : ''
      exportCSV(
        `agent-summary${mlabel}${kelLabel}-${windowEnd}.csv`,
        ['No', 'Nama Agen', 'Serial Number', 'Mitra', 'PIC', 'Status', 'TRX Transfer 14H'],
        rows
      )
    } finally { setExporting(false) }
  }

  // W1/W2 computed dari agentDetail
  const trendCfg  = TREND_CFG[selectedAgent?.trend as keyof typeof TREND_CFG] ?? TREND_CFG.consistent
  const bucketCfg = BUCKET_CFG[selectedAgent?.bucket ?? ''] ?? BUCKET_CFG.sporadic

  const w1Days = agentDetail.filter(d => {
    if (!selectedAgent) return false
    const [sy, sm, sd] = selectedAgent.window_start.split('-').map(Number)
    return new Date(d.transaction_date) <= new Date(sy, sm-1, sd+6)
  })
  const w2Days = agentDetail.filter(d => {
    if (!selectedAgent) return false
    const [sy, sm, sd] = selectedAgent.window_start.split('-').map(Number)
    return new Date(d.transaction_date) >= new Date(sy, sm-1, sd+7)
  })
  const avgTrxW1  = w1Days.length > 0 ? +(w1Days.reduce((s,d) => s+Number(d.total_trx),0)/w1Days.length).toFixed(2) : 0
  const avgTrxW2  = w2Days.length > 0 ? +(w2Days.reduce((s,d) => s+Number(d.total_trx),0)/w2Days.length).toFixed(2) : 0
  const changePct = avgTrxW1 > 0 ? Math.round((avgTrxW2-avgTrxW1)/avgTrxW1*100) : 0

  const GRID = '1fr 170px 160px 90px 110px 80px 70px'

  return (
    <Layout>
      <style>{SKELETON_STYLE}</style>
      <Head><title>Agent Summary — AMARIS</title></Head>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}>

        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '11px', fontWeight: '600', color: '#9ca3af', letterSpacing: '0.1em', marginBottom: '4px' }}>ANALITIK AGEN</div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#111827', margin: 0, letterSpacing: '-0.02em' }}>📋 Agent Summary</h1>
          <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
            {windowStart && windowEnd
              ? `Data transaksi 14 hari dari tanggal ${fmtDate(windowStart)} sampai ${fmtDate(windowEnd)}`
              : 'Data transaksi 14 hari terakhir'}
            {!loading && <span style={{ marginLeft: '8px', color: '#9ca3af' }}>{totalCount.toLocaleString('id')} agen</span>}
          </p>
        </div>

        {/* Card summary — 3 card besar */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '24px' }}>
          {(['sehat','baru_aktif','kurang_sehat'] as const).map(k => {
            const cfg = KEL_CFG[k]
            const count = k === 'sehat' ? counts?.sehat_count : k === 'baru_aktif' ? counts?.baru_aktif_count : counts?.kurang_sehat_count
            const active = filterKel === k
            return (
              <button key={k} onClick={() => handleKelChange(k)}
                style={{ padding: '16px 20px', borderRadius: '12px', textAlign: 'left', cursor: 'pointer', border: `2px solid ${active ? cfg.color : '#e5e7eb'}`, backgroundColor: active ? cfg.bg : '#fff', transition: 'all 0.15s' }}>
                <div style={{ fontSize: '28px', fontWeight: '800', color: cfg.color }}>{loading ? '—' : (count ?? 0).toLocaleString('id')}</div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: cfg.color, marginTop: '2px' }}>{cfg.label}</div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>{cfg.sublabel}</div>
              </button>
            )
          })}
        </div>

        {/* Filter */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={filterMitra} onChange={e => handleMitraChange(e.target.value)}
            style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px', color: '#374151', backgroundColor: '#fff', cursor: 'pointer' }}>
            <option value="">Semua Mitra</option>
            {mitraList.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={filterPic} onChange={e => handlePicChange(e.target.value)} disabled={loadingPic}
            style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px', color: '#374151', backgroundColor: loadingPic ? '#f9fafb' : '#fff', cursor: loadingPic ? 'wait' : 'pointer', minWidth: '160px' }}>
            <option value="">{loadingPic ? 'Memuat...' : 'Semua PIC'}</option>
            {picList.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          {(filterMitra || filterPic || filterKel) && (
            <button onClick={handleReset} style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#6b7280', fontSize: '12px', cursor: 'pointer' }}>✕ Reset</button>
          )}
          <button onClick={handleExport} disabled={exporting || loading}
            style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#374151', fontSize: '12px', cursor: exporting || loading ? 'not-allowed' : 'pointer', opacity: exporting || loading ? 0.5 : 1, fontWeight: '600' }}>
            {exporting ? 'Mengekspor...' : '📥 Export CSV'}
          </button>
          <span style={{ marginLeft: 'auto', fontSize: '13px', color: '#6b7280' }}>
            {loading ? 'Memuat...' : `${totalCount.toLocaleString('id')} agen`}
          </span>
        </div>

        {/* Tabel */}
        {loading ? (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
            {[1,2,3,4,5,6,7].map(i => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: GRID, padding: '13px 16px', borderBottom: '1px solid #f3f4f6', gap: '16px', alignItems: 'center' }}>
                <div><Skeleton width={140} height={13} /><div style={{marginTop:5}}><Skeleton width={100} height={10} /></div></div>
                <Skeleton width={110} height={12} />
                <Skeleton width={110} height={12} />
                <Skeleton width={70} height={20} radius={99} />
                <Skeleton width={90} height={20} radius={99} />
                <Skeleton width={60} height={20} radius={99} />
                <Skeleton width={40} height={12} />
              </div>
            ))}
          </div>
        ) : agents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', backgroundColor: '#f9fafb', borderRadius: '10px', border: '1px dashed #e5e7eb', color: '#9ca3af', fontSize: '13px' }}>Tidak ada agen ditemukan</div>
        ) : (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: GRID, padding: '10px 16px', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.05em' }}>
              <div>AGEN</div>
              <div>MITRA</div>
              <div>PIC</div>
              <div style={{ textAlign: 'center' }}>BUCKET</div>
              <div style={{ textAlign: 'center' }}>TREND</div>
              <div style={{ textAlign: 'center' }}>W2</div>
              <div style={{ textAlign: 'right' }}>TRX</div>
            </div>
            {agents.map((a, i) => {
              const bkt = BUCKET_CFG[a.bucket] ?? BUCKET_CFG.sporadic
              const trd = TREND_CFG[a.trend as keyof typeof TREND_CFG] ?? TREND_CFG.consistent
              const w2  = W2_CFG[a.w2_status] ?? W2_CFG.retained
              return (
                <div key={a.serial_number}
                  onClick={() => openDrawer(a)}
                  style={{ display: 'grid', gridTemplateColumns: GRID, padding: '11px 16px', borderBottom: i < agents.length-1 ? '1px solid #f3f4f6' : 'none', alignItems: 'center', backgroundColor: '#fff', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = '#fff'}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#111827' }}>{a.merchant_name ?? a.serial_number}</div>
                    <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '1px' }}>{a.serial_number} · {a.active_days_14} hari aktif</div>
                  </div>
                  <div style={{ fontSize: '12px', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.mitra ?? '—'}</div>
                  <div style={{ fontSize: '12px', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.pic ?? '—'}</div>
                  <div style={{ textAlign: 'center' }}>
                    <span style={{ padding: '2px 8px', borderRadius: '99px', fontSize: '10px', fontWeight: '700', backgroundColor: bkt.bg, color: bkt.color, border: `1px solid ${bkt.border}`, whiteSpace: 'nowrap' }}>{bkt.label}</span>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <span style={{ padding: '2px 8px', borderRadius: '99px', fontSize: '10px', fontWeight: '700', backgroundColor: trd.bg, color: trd.color, border: `1px solid ${trd.border}`, whiteSpace: 'nowrap' }}>{trd.icon} {trd.label}</span>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <span style={{ padding: '2px 8px', borderRadius: '99px', fontSize: '10px', fontWeight: '700', backgroundColor: w2.bg, color: w2.color, border: `1px solid ${w2.border}`, whiteSpace: 'nowrap' }}>{w2.label}</span>
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#374151', textAlign: 'right' }}>{a.trx_transfer_14.toLocaleString('id')}</div>
                </div>
              )
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', alignItems: 'center', marginTop: '16px' }}>
            <button onClick={() => handlePageChange(Math.max(0,page-1))} disabled={page===0}
              style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: page===0?'#d1d5db':'#374151', fontSize: '13px', cursor: page===0?'not-allowed':'pointer' }}>← Prev</button>
            <span style={{ fontSize: '13px', color: '#6b7280' }}>{page+1} / {totalPages}</span>
            <button onClick={() => handlePageChange(Math.min(totalPages-1,page+1))} disabled={page>=totalPages-1}
              style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: page>=totalPages-1?'#d1d5db':'#374151', fontSize: '13px', cursor: page>=totalPages-1?'not-allowed':'pointer' }}>Next →</button>
          </div>
        )}
      </div>

      {/* ── Drawer ───────────────────────────────────────────────────────────── */}
      {selectedAgent && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}>
          <div onClick={() => setSelectedAgent(null)} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)' }} />
          <div style={{ position: 'relative', width: '480px', height: '100%', backgroundColor: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

            {/* Header sticky */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'sticky', top: 0, backgroundColor: '#fff', zIndex: 1 }}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: '800', color: '#111827', marginBottom: '4px' }}>{selectedAgent.merchant_name ?? selectedAgent.serial_number}</div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '8px' }}>{selectedAgent.serial_number}</div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{ padding: '2px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: '700', backgroundColor: trendCfg.bg, color: trendCfg.color, border: `1px solid ${trendCfg.border}` }}>{trendCfg.icon} {trendCfg.label}</span>
                  <span style={{ padding: '2px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: '700', backgroundColor: bucketCfg.bg, color: bucketCfg.color, border: `1px solid ${bucketCfg.border}` }}>{bucketCfg.label}</span>
                </div>
              </div>
              <button onClick={() => setSelectedAgent(null)} style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#6b7280', fontSize: '18px', cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>

            {/* Loading skeleton drawer */}
            {loadingDetail ? (
              <div style={{ padding: '20px 24px' }}>
                {/* Info Agen skeleton */}
                <div style={{ marginBottom: '24px' }}>
                  <Skeleton width={80} height={11} />
                  <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {[120, 90, 200, 80, 80].map((w, i) => (
                      <div key={i} style={{ display: 'flex', gap: '12px', paddingBottom: '12px', borderBottom: '1px solid #f9fafb' }}>
                        <Skeleton width={70} height={12} />
                        <Skeleton width={w} height={12} />
                      </div>
                    ))}
                  </div>
                </div>
                {/* W1 vs W2 skeleton */}
                <div style={{ marginBottom: '24px' }}>
                  <Skeleton width={180} height={11} />
                  <div style={{ marginTop: '14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    {[1,2,3,4,5,6].map(i => (
                      <div key={i} style={{ padding: '10px 12px', backgroundColor: '#f9fafb', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                        <Skeleton width={50} height={16} />
                        <Skeleton width={80} height={10} />
                      </div>
                    ))}
                  </div>
                </div>
                {/* Ringkasan skeleton */}
                <div style={{ marginBottom: '24px' }}>
                  <Skeleton width={120} height={11} />
                  <div style={{ marginTop: '14px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                    {[1,2,3,4,5,6].map(i => (
                      <div key={i} style={{ padding: '10px 12px', backgroundColor: '#f9fafb', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                        <Skeleton width={50} height={16} />
                        <Skeleton width={60} height={10} />
                      </div>
                    ))}
                  </div>
                </div>
                {/* Chart skeleton */}
                <div style={{ marginBottom: '24px' }}>
                  <Skeleton width={140} height={11} />
                  <div style={{ marginTop: '14px', display: 'flex', alignItems: 'flex-end', gap: '3px', height: '80px' }}>
                    {Array.from({length: 14}, (_,i) => (
                      <div key={i} style={{ flex: 1, backgroundColor: '#e5e7eb', borderRadius: '3px 3px 0 0', height: `${20 + Math.random() * 50}px`, animation: 'shimmer 1.4s infinite', background: 'linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%)', backgroundSize: '200% 100%' }} />
                    ))}
                  </div>
                </div>
              </div>
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
                      { label: 'Avg TRX/hari W1 (1–7)',   value: avgTrxW1 > 0 ? String(avgTrxW1) : '—', highlight: false },
                      { label: 'Avg TRX/hari W2 (8–14)',  value: avgTrxW2 > 0 ? String(avgTrxW2) : '—', highlight: true },
                      { label: 'Hari aktif W1',            value: `${w1Days.length} hari`,               highlight: false },
                      { label: 'Hari aktif W2',            value: `${w2Days.length} hari`,               highlight: false },
                      { label: 'Total TRX W2',             value: w2Days.reduce((s,d) => s+Number(d.total_trx),0).toLocaleString('id'), highlight: false },
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
                      { label: 'Total TRX',    value: agentDetail.reduce((s,d) => s+Number(d.total_trx),0).toLocaleString('id') },
                      { label: 'Transfer',     value: agentDetail.reduce((s,d) => s+Number(d.transfer_trx),0).toLocaleString('id') },
                      { label: 'Cek Saldo',    value: agentDetail.reduce((s,d) => s+Number(d.cek_saldo_trx),0).toLocaleString('id') },
                      { label: 'Total Fee',    value: fmtFee(agentDetail.reduce((s,d) => s+Number(d.total_fee),0)) },
                      { label: 'Total Amount', value: fmtAmount(agentDetail.reduce((s,d) => s+Number(d.total_amount),0)) },
                      { label: 'Hari Aktif',   value: `${agentDetail.length} hari` },
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
                      <div style={{ padding: '14px 16px', backgroundColor: '#f9fafb', borderRadius: '8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '16px', fontWeight: '800', color: '#111827' }}>{fmtAmount(liqSummary.avg_daily_amount_w1)}</div>
                        <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '4px' }}>Avg Amount/Hari W1</div>
                      </div>
                      {(() => {
                        const cfg = LIQ_CFG[liqSummary.liquidity_status] ?? LIQ_CFG.no_data
                        return (
                          <div style={{ padding: '14px 16px', backgroundColor: cfg.bg, borderRadius: '8px', textAlign: 'center', border: `1px solid ${cfg.border}` }}>
                            <div style={{ fontSize: '16px', fontWeight: '800', color: cfg.color }}>{liqSummary.liquidity_ratio?.toFixed(2)}x</div>
                            <div style={{ fontSize: '11px', fontWeight: '600', color: cfg.color, marginTop: '4px' }}>{cfg.label}</div>
                            <div style={{ fontSize: '10px', color: cfg.color, opacity: 0.7, marginTop: '2px' }}>{cfg.sublabel}</div>
                          </div>
                        )
                      })()}
                    </div>
                    <div style={{ marginTop: '10px', padding: '10px 16px', backgroundColor: '#f9fafb', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', color: '#6b7280' }}>Avg Amount/Hari W2</span>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: '#111827' }}>{fmtAmount(liqSummary.avg_daily_amount_w2)}</span>
                    </div>
                  </div>
                )}

                {/* CHART TRX PER HARI */}
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>TRANSAKSI PER HARI (14H)</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '70px' }}>
                    {(() => {
                      const maxTrx = Math.max(...agentDetail.map(d => Number(d.total_trx)), 1)
                      const [sy, sm, sd] = selectedAgent.window_start.split('-').map(Number)
                      const startDate = new Date(sy, sm-1, sd)
                      const w2StartStr = new Date(sy, sm-1, sd+7).toISOString().split('T')[0]
                      return Array.from({length: 14}, (_, i) => {
                        const d = new Date(startDate); d.setDate(startDate.getDate()+i)
                        const dateStr = d.toISOString().split('T')[0]
                        const found = agentDetail.find(a => a.transaction_date === dateStr)
                        const trx = found ? Number(found.total_trx) : 0
                        const isW2 = dateStr >= w2StartStr
                        return (
                          <div key={dateStr} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }} title={`${dateStr}: ${trx} trx`}>
                            <div style={{ width: '100%', height: `${Math.max(3, (trx/maxTrx)*56)}px`, backgroundColor: trx > 0 ? (isW2 ? trendCfg.color : '#94a3b8') : '#f3f4f6', borderRadius: '2px 2px 0 0', transition: 'height 0.3s' }} />
                            <div style={{ fontSize: '7px', color: '#d1d5db', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
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

                {/* CHART NOMINAL UANG BEREDAR */}
                {liqDetail.length > 0 && (
                  <div style={{ marginBottom: '24px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>NOMINAL UANG BEREDAR (14H)</div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '80px' }}>
                      {(() => {
                        const maxAmount = Math.max(...liqDetail.map(d => Number(d.daily_amount)), 1)
                        const avgAmount = liqSummary?.avg_daily_amount_14d ?? 0
                        const [sy, sm, sd] = selectedAgent.window_start.split('-').map(Number)
                        const startDate = new Date(sy, sm-1, sd)
                        return Array.from({length: 14}, (_, i) => {
                          const d = new Date(startDate); d.setDate(startDate.getDate()+i)
                          const dateStr = d.toISOString().split('T')[0]
                          const found = liqDetail.find(a => a.transaction_date === dateStr)
                          const amount = found ? Number(found.daily_amount) : 0
                          const barColor = amount === 0 ? '#f3f4f6' : amount < avgAmount*0.5 ? '#ef4444' : amount < avgAmount*0.8 ? '#eab308' : '#22c55e'
                          return (
                            <div key={dateStr} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }} title={`${dateStr}: ${fmtAmount(amount)}`}>
                              <div style={{ width: '100%', height: `${Math.max(3, (amount/maxAmount)*64)}px`, backgroundColor: barColor, borderRadius: '2px 2px 0 0', transition: 'height 0.3s' }} />
                              <div style={{ fontSize: '7px', color: '#d1d5db', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                                {d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
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
                    <div style={{ marginTop: '6px', fontSize: '10px', color: '#9ca3af' }}>Avg 14H: {fmtAmount(liqSummary?.avg_daily_amount_14d ?? 0)}/hari</div>
                  </div>
                )}

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
