import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Layout from '../../components/Layout'
import { createBrowserClient } from '@supabase/ssr'

interface AgentLiquidityRow {
  serial_number: string
  merchant_name: string | null
  mitra: string | null
  pic: string | null
  active_days_14: number
  total_trx_14: number
  avg_daily_amount_14d: number
  avg_daily_amount_w1: number
  avg_daily_amount_w2: number
  liquidity_ratio: number
  liquidity_status: 'kuat' | 'menurun' | 'lemah' | 'no_data'
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
  kuat:    { label: 'Kuat',    color: '#166534', bg: '#dcfce7', border: '#bbf7d0', sublabel: 'Float kemungkinan aman',    tooltip: 'Avg amount/hari W2 ≥ 80% dari W1. Agen kemungkinan masih punya float yang cukup.' },
  menurun: { label: 'Menurun', color: '#92400e', bg: '#fef9c3', border: '#fde68a', sublabel: 'Perlu perhatian',           tooltip: 'Avg amount/hari W2 50–80% dari W1. Ada penurunan signifikan, perlu dipantau.' },
  lemah:   { label: 'Lemah',   color: '#dc2626', bg: '#fee2e2', border: '#fecaca', sublabel: 'Kemungkinan float menipis', tooltip: 'Avg amount/hari W2 < 50% dari W1. Kemungkinan float agen sudah sangat menipis.' },
  no_data: { label: '—',       color: '#9ca3af', bg: '#f9fafb', border: '#e5e7eb', sublabel: 'Tidak ada data W1',        tooltip: 'Tidak ada transaksi di W1 (7 hari pertama).' },
}

const PAGE_SIZE = 25
const SKELETON_STYLE = `@keyframes shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }`

function Skeleton({ width, height = 14, radius = 6 }: { width: string | number, height?: number, radius?: number }) {
  return <div style={{ width, height, borderRadius: radius, background: 'linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite' }} />
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

function exportCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => {
      const s = String(cell ?? '')
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
    }).join(','))
    .join('\n')
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export default function AgentLiquidityPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [agents, setAgents] = useState<AgentLiquidityRow[]>([])
  const [loading, setLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const [statusCounts, setStatusCounts] = useState({ lemah: 0, menurun: 0, kuat: 0 })

  const [filterMitra, setFilterMitra] = useState('')
  const [filterPic, setFilterPic] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [page, setPage] = useState(0)

  const [filterOptions, setFilterOptions] = useState<{ mitra: string, pic: string }[]>([])

  const [sinceDate, setSinceDate] = useState('')
  const [lastDate, setLastDate] = useState('')

  const [selectedAgent, setSelectedAgent] = useState<AgentLiquidityRow | null>(null)
  const [agentDetail, setAgentDetail] = useState<AgentDayDetail[]>([])
  const [liquidityDetail, setLiquidityDetail] = useState<AgentLiquidityDetail[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)

  const [tooltip, setTooltip] = useState<{ text: string, x: number, y: number } | null>(null)
  const [exporting, setExporting] = useState(false)

  useEffect(() => { initPage() }, [router.asPath])

  async function initPage() {
    setLoading(true)
    try {
      const [progressRes, filterRes] = await Promise.all([
        supabase.rpc('get_monthly_progress'),
        supabase.rpc('get_agent_liquidity_filter_options'),
      ])

      if (progressRes.data) {
        const d = typeof progressRes.data === 'string' ? JSON.parse(progressRes.data) : progressRes.data
        setLastDate(d.end_date)
        const [y, m, dd] = d.end_date.split('-').map(Number)
        const sd = new Date(y, m - 1, dd - 13)
        setSinceDate(`${sd.getFullYear()}-${String(sd.getMonth() + 1).padStart(2, '0')}-${String(sd.getDate()).padStart(2, '0')}`)
      }

      if (filterRes.data) {
        setFilterOptions(filterRes.data)
      }

      await loadStatusCounts('', '')
      await loadAgents(0, '', '', '')
    } finally {
      setLoading(false)
    }
  }

  async function loadStatusCounts(mitra: string, pic: string) {
    const [l, m, k] = await Promise.all([
      supabase.rpc('get_agent_liquidity_list_count', { p_mitra: mitra, p_pic: pic, p_status: 'lemah' }),
      supabase.rpc('get_agent_liquidity_list_count', { p_mitra: mitra, p_pic: pic, p_status: 'menurun' }),
      supabase.rpc('get_agent_liquidity_list_count', { p_mitra: mitra, p_pic: pic, p_status: 'kuat' }),
    ])
    setStatusCounts({ lemah: Number(l.data ?? 0), menurun: Number(m.data ?? 0), kuat: Number(k.data ?? 0) })
  }

  async function loadAgents(newPage: number, mitra: string, pic: string, status: string) {
    setLoading(true)
    try {
      const [dataRes, countRes] = await Promise.all([
        supabase.rpc('get_agent_liquidity_list', {
          p_mitra: mitra, p_pic: pic, p_status: status,
          p_limit: PAGE_SIZE, p_offset: newPage * PAGE_SIZE,
        }),
        supabase.rpc('get_agent_liquidity_list_count', { p_mitra: mitra, p_pic: pic, p_status: status }),
      ])
      setAgents(dataRes.data ?? [])
      setTotalCount(Number(countRes.data ?? 0))
    } finally {
      setLoading(false)
    }
  }

  async function handleMitraChange(mitra: string) {
    setFilterMitra(mitra); setFilterPic(''); setPage(0)
    await loadStatusCounts(mitra, '')
    await loadAgents(0, mitra, '', filterStatus)
  }

  async function handlePicChange(pic: string) {
    setFilterPic(pic); setPage(0)
    await loadAgents(0, filterMitra, pic, filterStatus)
  }

  async function handleStatusChange(status: string) {
    const newStatus = filterStatus === status ? '' : status
    setFilterStatus(newStatus); setPage(0)
    await loadAgents(0, filterMitra, filterPic, newStatus)
  }

  async function handlePageChange(newPage: number) {
    setPage(newPage)
    await loadAgents(newPage, filterMitra, filterPic, filterStatus)
  }

  async function handleReset() {
    setFilterMitra(''); setFilterPic(''); setFilterStatus(''); setPage(0)
    await loadStatusCounts('', '')
    await loadAgents(0, '', '', '')
  }

  async function openDrawer(agent: AgentLiquidityRow) {
    setSelectedAgent(agent)
    setAgentDetail([])
    setLiquidityDetail([])
    setLoadingDetail(true)
    try {
      const [detailRes, liquidityRes] = await Promise.all([
        supabase.rpc('get_agent_detail', { p_serial: agent.serial_number, p_since: sinceDate, p_until: lastDate }),
        supabase.rpc('get_agent_liquidity_summary', { p_serial: agent.serial_number }),
      ])
      setAgentDetail(detailRes.data ?? [])
      setLiquidityDetail(liquidityRes.data ?? [])
    } finally {
      setLoadingDetail(false)
    }
  }

  // Export CSV — selalu fetch ulang SEMUA data (p_limit besar), bukan dari state
  // `agents` yang sudah dipotong PAGE_SIZE untuk pagination.
  async function handleExport() {
    setExporting(true)
    try {
      const { data } = await supabase.rpc('get_agent_liquidity_list', {
        p_mitra: filterMitra, p_pic: filterPic, p_status: filterStatus,
        p_limit: 99999, p_offset: 0,
      })
      const rows = (data ?? []).map((a: AgentLiquidityRow) => [
        a.serial_number, a.merchant_name ?? '', a.mitra ?? '', a.pic ?? '',
        a.active_days_14, a.total_trx_14,
        a.avg_daily_amount_14d, a.avg_daily_amount_w1, a.avg_daily_amount_w2,
        a.liquidity_ratio, a.liquidity_status,
      ])
      const statusLabel = filterStatus || 'semua'
      exportCSV(`likuiditas_agen_${statusLabel}_${lastDate}.csv`,
        ['Serial', 'Merchant', 'Mitra', 'PIC', 'Hari Aktif 14H', 'Total TRX 14H', 'Avg Amount/Hari 14H', 'Avg Amount/Hari W1', 'Avg Amount/Hari W2', 'Liquidity Ratio', 'Liquidity Status'],
        rows)
    } finally {
      setExporting(false)
    }
  }

  const mitras = [...new Set(filterOptions.map(f => f.mitra))].sort()
  const pics   = [...new Set(filterOptions.filter(f => !filterMitra || f.mitra === filterMitra).map(f => f.pic))].sort()

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)
  const liquiditySummary = liquidityDetail[0] ?? null

  function LiquidityChip({ status }: { status: string }) {
    const cfg = LIQUIDITY_CONFIG[status as keyof typeof LIQUIDITY_CONFIG] ?? LIQUIDITY_CONFIG.no_data
    return (
      <span
        onMouseEnter={e => setTooltip({ text: cfg.tooltip, x: e.clientX, y: e.clientY })}
        onMouseMove={e => setTooltip({ text: cfg.tooltip, x: e.clientX, y: e.clientY })}
        onMouseLeave={() => setTooltip(null)}
        style={{ padding: '2px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: '700', backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, whiteSpace: 'nowrap', cursor: 'default' }}>
        {cfg.label}
      </span>
    )
  }

  return (
    <Layout>
      <style>{SKELETON_STYLE}</style>
      <Head><title>Agent Liquidity — AMARIS</title></Head>

      {tooltip && (
        <div style={{ position: 'fixed', left: Math.min(tooltip.x + 12, window.innerWidth - 340), top: tooltip.y - 8, zIndex: 9999, backgroundColor: '#1f2937', color: '#f9fafb', fontSize: '11px', padding: '8px 12px', borderRadius: '8px', maxWidth: '320px', lineHeight: '1.6', pointerEvents: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', whiteSpace: 'pre-line' }}>
          {tooltip.text}
        </div>
      )}

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}>

        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '11px', fontWeight: '600', color: '#9ca3af', letterSpacing: '0.1em', marginBottom: '4px' }}>ANALITIK AGEN</div>
          <h1
            style={{ fontSize: '24px', fontWeight: '800', color: '#111827', margin: 0, letterSpacing: '-0.02em', cursor: 'default' }}
            onMouseEnter={e => setTooltip({ text: 'Estimasi kekuatan float agen — perbandingan avg nominal transaksi harian W2 (7 hari terakhir) vs W1 (7 hari pertama).\n\n💪 Kuat — Avg amount/hari W2 ≥ 80% dari W1. Float kemungkinan aman.\n📉 Menurun — Avg amount/hari W2 50–80% dari W1. Perlu dipantau.\n⚠️ Lemah — Avg amount/hari W2 < 50% dari W1. Float kemungkinan menipis.', x: e.clientX, y: e.clientY })}
            onMouseMove={e => setTooltip({ text: 'Estimasi kekuatan float agen — perbandingan avg nominal transaksi harian W2 (7 hari terakhir) vs W1 (7 hari pertama).\n\n💪 Kuat — Avg amount/hari W2 ≥ 80% dari W1. Float kemungkinan aman.\n📉 Menurun — Avg amount/hari W2 50–80% dari W1. Perlu dipantau.\n⚠️ Lemah — Avg amount/hari W2 < 50% dari W1. Float kemungkinan menipis.', x: e.clientX, y: e.clientY })}
            onMouseLeave={() => setTooltip(null)}
          >💧 Agent Liquidity ⓘ</h1>
          <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
            {sinceDate && lastDate ? (() => {
              const fmtNoYear = (d: string) => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
              const fmtFull   = (d: string) => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
              return `Data transaksi 14 hari dari tanggal ${fmtNoYear(sinceDate)} sampai ${fmtFull(lastDate)}`
            })() : ''}
            {!loading && <span style={{ marginLeft: '8px', color: '#9ca3af' }}>{totalCount.toLocaleString('id')} agen</span>}
          </p>
        </div>

        {/* Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '24px' }}>
          {([
            { status: 'kuat',    count: statusCounts.kuat,    cfg: LIQUIDITY_CONFIG.kuat },
            { status: 'menurun', count: statusCounts.menurun, cfg: LIQUIDITY_CONFIG.menurun },
            { status: 'lemah',   count: statusCounts.lemah,   cfg: LIQUIDITY_CONFIG.lemah },
          ] as const).map(({ status, count, cfg }) => (
            <button key={status}
              onClick={() => handleStatusChange(status)}
              onMouseEnter={e => setTooltip({ text: cfg.tooltip, x: e.clientX, y: e.clientY })}
              onMouseMove={e => setTooltip({ text: cfg.tooltip, x: e.clientX, y: e.clientY })}
              onMouseLeave={() => setTooltip(null)}
              style={{ padding: '16px 20px', borderRadius: '12px', textAlign: 'left', cursor: 'pointer', border: `2px solid ${filterStatus === status ? cfg.color : '#e5e7eb'}`, backgroundColor: filterStatus === status ? cfg.bg : '#fff', transition: 'all 0.15s' }}>
              <div style={{ fontSize: '28px', fontWeight: '800', color: cfg.color }}>{loading ? '—' : count.toLocaleString('id')}</div>
              <div style={{ fontSize: '13px', fontWeight: '700', color: cfg.color, marginTop: '2px' }}>{cfg.label}</div>
              <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>{cfg.sublabel}</div>
            </button>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={filterMitra} onChange={e => handleMitraChange(e.target.value)}
            style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px', color: '#374151', backgroundColor: '#fff', cursor: 'pointer' }}>
            <option value="">Semua Mitra</option>
            {mitras.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={filterPic} onChange={e => handlePicChange(e.target.value)}
            style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px', color: '#374151', backgroundColor: '#fff', cursor: 'pointer', maxWidth: '180px' }}>
            <option value="">Semua PIC</option>
            {pics.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          {(filterMitra || filterPic || filterStatus) && (
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

        {/* Table */}
        {loading ? (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
            {[1,2,3,4,5].map(i => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 150px 150px 130px 130px 70px', padding: '13px 16px', borderBottom: '1px solid #f3f4f6', gap: '16px', alignItems: 'center' }}>
                <Skeleton width={60} height={20} /><div><Skeleton width={140} height={13} /><div style={{marginTop:4}}><Skeleton width={90} height={10} /></div></div>
                <Skeleton width={100} height={12} /><Skeleton width={100} height={12} /><Skeleton width={80} height={12} /><Skeleton width={80} height={12} /><Skeleton width={40} height={12} />
              </div>
            ))}
          </div>
        ) : agents.length > 0 ? (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 150px 150px 130px 130px 70px', padding: '10px 16px', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.05em' }}>
              <div>STATUS</div><div>AGEN</div><div>MITRA</div><div>PIC</div>
              <div style={{ textAlign: 'right' }}>AVG AMOUNT/HARI (W1)</div>
              <div style={{ textAlign: 'right' }}>AVG AMOUNT/HARI (W2)</div>
              <div style={{ textAlign: 'right' }}>RATIO</div>
            </div>
            {agents.map((agent, i) => {
              const cfg = LIQUIDITY_CONFIG[agent.liquidity_status] ?? LIQUIDITY_CONFIG.no_data
              return (
                <div key={agent.serial_number} onClick={() => openDrawer(agent)}
                  style={{ display: 'grid', gridTemplateColumns: '90px 1fr 150px 150px 130px 130px 70px', padding: '11px 16px', borderBottom: i < agents.length - 1 ? '1px solid #f3f4f6' : 'none', alignItems: 'center', backgroundColor: '#fff', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = '#fff'}>
                  <div><LiquidityChip status={agent.liquidity_status} /></div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#111827' }}>{agent.merchant_name ?? agent.serial_number}</div>
                    <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '1px' }}>{agent.serial_number}</div>
                  </div>
                  <div style={{ fontSize: '12px', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.mitra ?? '—'}</div>
                  <div style={{ fontSize: '12px', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.pic ?? '—'}</div>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#374151', textAlign: 'right' }}>{formatAmount(agent.avg_daily_amount_w1)}</div>
                  <div style={{ fontSize: '12px', color: '#374151', textAlign: 'right' }}>{formatAmount(agent.avg_daily_amount_w2)}</div>
                  <div style={{ textAlign: 'right', fontSize: '12px', fontWeight: '700', color: cfg.color }}>{agent.liquidity_ratio?.toFixed(2)}x</div>
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px', backgroundColor: '#f9fafb', borderRadius: '10px', border: '1px dashed #e5e7eb', color: '#9ca3af', fontSize: '13px' }}>Tidak ada agen ditemukan</div>
        )}

        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', alignItems: 'center', marginTop: '16px' }}>
            <button onClick={() => handlePageChange(Math.max(0, page - 1))} disabled={page === 0} style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: page === 0 ? '#d1d5db' : '#374151', fontSize: '13px', cursor: page === 0 ? 'not-allowed' : 'pointer' }}>← Prev</button>
            <span style={{ fontSize: '13px', color: '#6b7280' }}>{page + 1} / {totalPages}</span>
            <button onClick={() => handlePageChange(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1} style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: page >= totalPages - 1 ? '#d1d5db' : '#374151', fontSize: '13px', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer' }}>Next →</button>
          </div>
        )}
      </div>

      {/* Drawer */}
      {selectedAgent && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}>
          <div onClick={() => setSelectedAgent(null)} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)' }} />
          <div style={{ position: 'relative', width: '480px', height: '100%', backgroundColor: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'sticky', top: 0, backgroundColor: '#fff', zIndex: 1 }}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: '800', color: '#111827', marginBottom: '4px' }}>{selectedAgent.merchant_name ?? selectedAgent.serial_number}</div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '6px' }}>{selectedAgent.serial_number}</div>
                <LiquidityChip status={selectedAgent.liquidity_status} />
              </div>
              <button onClick={() => setSelectedAgent(null)} style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#6b7280', fontSize: '18px', cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>

            {loadingDetail ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>Memuat data...</div>
            ) : (
              <div style={{ padding: '20px 24px' }}>

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

                <div style={{ marginBottom: '24px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>LIKUIDITAS</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div style={{ padding: '14px 16px', backgroundColor: '#f9fafb', borderRadius: '8px', textAlign: 'center' }}>
                      <div style={{ fontSize: '16px', fontWeight: '800', color: '#111827' }}>{formatAmount(selectedAgent.avg_daily_amount_w1)}</div>
                      <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '4px' }}>Avg Amount/Hari W1</div>
                    </div>
                    {(() => {
                      const cfg = LIQUIDITY_CONFIG[selectedAgent.liquidity_status] ?? LIQUIDITY_CONFIG.no_data
                      return (
                        <div style={{ padding: '14px 16px', backgroundColor: cfg.bg, borderRadius: '8px', textAlign: 'center', border: `1px solid ${cfg.border}` }}>
                          <div style={{ fontSize: '16px', fontWeight: '800', color: cfg.color }}>{selectedAgent.liquidity_ratio?.toFixed(2)}x</div>
                          <div style={{ fontSize: '11px', fontWeight: '600', color: cfg.color, marginTop: '4px' }}>{cfg.label}</div>
                          <div style={{ fontSize: '10px', color: cfg.color, opacity: 0.7, marginTop: '2px' }}>{cfg.sublabel}</div>
                        </div>
                      )
                    })()}
                  </div>
                  <div style={{ marginTop: '10px', padding: '10px 16px', backgroundColor: '#f9fafb', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: '#6b7280' }}>Avg Amount/Hari W2</span>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: '#111827' }}>{formatAmount(selectedAgent.avg_daily_amount_w2)}</span>
                  </div>
                </div>

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
                          const barColor = amount === 0 ? '#f3f4f6' : amount < avgAmount * 0.5 ? '#ef4444' : amount < avgAmount * 0.8 ? '#eab308' : '#22c55e'
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
                    <div style={{ marginTop: '6px', fontSize: '10px', color: '#9ca3af' }}>Avg 14H: {formatAmount(liquiditySummary?.avg_daily_amount_14d ?? 0)}/hari</div>
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
