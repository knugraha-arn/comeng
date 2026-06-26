import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Layout from '../../components/Layout'
import { createBrowserClient } from '@supabase/ssr'

interface Agent3500 {
  serial_number: string
  merchant_name: string | null
  mitra: string | null
  pic: string | null
  active_days_14: number
  avg_trx_14: number
  active_days_w1: number
  total_trx_w1: number
  avg_trx_w1: number
  active_days_w2: number
  total_trx_w2: number
  avg_trx_w2: number
  trx_change_pct: number
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
  fee_projected_conservative?: number
  fee_projected_optimistic?: number
  dekade_number?: number
}

interface ReturningAgent3500 {
  serial_number: string
  merchant_name: string | null
  mitra: string | null
  pic: string | null
  first_return_date: string
  days_since_return: number
  trx_count_14d: number
  trx_count_w1: number
  trx_count_w2: number
  avg_trx_since_return: number
  total_fee_14d: number
}

interface LostAgent3500 {
  serial_number: string
  merchant_name: string | null
  mitra: string | null
  pic: string | null
  last_active_date: string
  days_since_lost: number
  trx_count_14d: number
  trx_count_w1: number
  trx_count_w2: number
  avg_trx_w1: number
  total_fee_14d: number
}

const TREND_CONFIG = {
  growing:    { label: 'Growing',   icon: '💎', color: '#166534', bg: '#dcfce7', border: '#bbf7d0', tooltip: 'Avg TRX/hari W2 (8–14) > 120% vs W1 (1–7). Agen sedang tumbuh.' },
  declining:  { label: 'Declining', icon: '⚠️', color: '#92400e', bg: '#fef9c3', border: '#fde68a', tooltip: 'Avg TRX/hari W2 (8–14) < 80% vs W1 (1–7). Agen sedang menurun, perlu perhatian.' },
  consistent: { label: 'Konsisten', icon: '✅', color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe', tooltip: 'Avg TRX/hari W2 (8–14) antara 80–120% vs W1 (1–7). Agen stabil.' },
}

const BUCKET_CONFIG: Record<string, { label: string, color: string, bg: string, border: string }> = {
  productive: { label: 'Productive', color: '#166534', bg: '#dcfce7', border: '#bbf7d0' },
  moderate:   { label: 'Moderate',   color: '#ca8a04', bg: '#fef9c3', border: '#fde68a' },
  sporadic:   { label: 'Sporadic',   color: '#dc2626', bg: '#fee2e2', border: '#fecaca' },
}

const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']
const PAGE_SIZE = 25

function formatFee(val: number): string {
  if (val >= 1000000) return `Rp ${(val / 1000000).toFixed(1)}jt`
  if (val >= 1000) return `Rp ${(val / 1000).toFixed(0)}rb`
  return `Rp ${val}`
}

function Skeleton({ width, height = 14, radius = 6 }: { width: string | number, height?: number, radius?: number }) {
  return <div style={{ width, height, borderRadius: radius, background: 'linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite' }} />
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

export default function Dashboard3500Page() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [agents, setAgents] = useState<Agent3500[]>([])
  const [loading, setLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const [trendCounts, setTrendCounts] = useState({ growing: 0, declining: 0, consistent: 0 })

  const [activeTab, setActiveTab] = useState<'growing' | 'declining' | 'consistent' | 'returning' | 'lost_w2' | ''>('')
  const [filterMitra, setFilterMitra] = useState('')
  const [filterPic, setFilterPic] = useState('')
  const [page, setPage] = useState(0)

  const [returningAgents, setReturningAgents] = useState<ReturningAgent3500[]>([])
  const [returningCount, setReturningCount] = useState(0)
  const [loadingReturning, setLoadingReturning] = useState(false)
  const [returningPage, setReturningPage] = useState(0)
  const [selectedReturning, setSelectedReturning] = useState<ReturningAgent3500 | null>(null)
  const [returningDetail, setReturningDetail] = useState<AgentDayDetail[]>([])
  const [loadingReturningDetail, setLoadingReturningDetail] = useState(false)

  const [lostAgents, setLostAgents] = useState<LostAgent3500[]>([])
  const [lostCount, setLostCount] = useState(0)
  const [loadingLost, setLoadingLost] = useState(false)
  const [lostPage, setLostPage] = useState(0)
  const [selectedLost, setSelectedLost] = useState<LostAgent3500 | null>(null)
  const [lostDetail, setLostDetail] = useState<AgentDayDetail[]>([])
  const [loadingLostDetail, setLoadingLostDetail] = useState(false)

  const [exporting, setExporting] = useState(false)

  const [mitras, setMitras] = useState<string[]>([])
  const [pics, setPics] = useState<string[]>([])

  const [progress, setProgress] = useState<MonthlyProgress | null>(null)
  const [monthlyTarget, setMonthlyTarget] = useState<number | null>(null)
  const [lastDate, setLastDate] = useState('')
  const [sinceDate, setSinceDate] = useState('')

  const [selectedAgent, setSelectedAgent] = useState<Agent3500 | null>(null)
  const [agentDetail, setAgentDetail] = useState<AgentDayDetail[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [tooltip, setTooltip] = useState<{ text: string, x: number, y: number } | null>(null)

  useEffect(() => { initPage() }, [router.asPath])

  async function initPage() {
    setLoading(true)
    try {
      const [progressRes, filterRes] = await Promise.all([
        supabase.rpc('get_monthly_progress'),
        supabase.rpc('get_hidden_gem_3500_filter_options'),
      ])

      if (progressRes.data) {
        const d = typeof progressRes.data === 'string' ? JSON.parse(progressRes.data) : progressRes.data
        setProgress({
          total_fee:     Number(d.total_fee ?? 0),
          total_trx:     Number(d.total_trx ?? 0),
          days_elapsed:  Number(d.days_elapsed ?? 0),
          days_in_month: Number(d.days_in_month ?? 0),
          month_start:   d.month_start,
          end_date:      d.end_date,
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

      if (filterRes.data?.[0]) {
        setMitras(filterRes.data[0].mitras ?? [])
        setPics(filterRes.data[0].pics ?? [])
      }

      await loadTrendCounts('', '')
      await loadAgents(0, '', '', '')

      const rc = await supabase.rpc('get_returning_agents_3500_count', { p_mitra: '', p_pic: '' })
      setReturningCount(Number(rc.data ?? 0))
      const lc = await supabase.rpc('get_lost_agents_3500_count', { p_mitra: '', p_pic: '' })
      setLostCount(Number(lc.data ?? 0))
    } finally {
      setLoading(false)
    }
  }

  async function loadTrendCounts(mitra: string, pic: string) {
    const params = { p_min_active_days_w2: 2, p_min_trx_w2: 5, p_min_avg_trx_14: 1, p_trend: '', p_mitra: mitra, p_pic: pic }
    const [g, d, c] = await Promise.all([
      supabase.rpc('get_hidden_gem_agents_3500_count', { ...params, p_trend: 'growing' }),
      supabase.rpc('get_hidden_gem_agents_3500_count', { ...params, p_trend: 'declining' }),
      supabase.rpc('get_hidden_gem_agents_3500_count', { ...params, p_trend: 'consistent' }),
    ])
    setTrendCounts({
      growing:   Number(g.data ?? 0),
      declining: Number(d.data ?? 0),
      consistent: Number(c.data ?? 0),
    })
  }

  function getMinParams(tab: string) {
    const isAll = tab === '' || tab === 'all'
    return {
      p_min_active_days_w2: isAll ? 0 : 2,
      p_min_trx_w2:         isAll ? 0 : 5,
      p_min_avg_trx_14:     isAll ? 0 : 1,
    }
  }

  async function loadAgents(newPage: number, trend: string, mitra: string, pic: string) {
    setLoading(true)
    try {
      const minParams = getMinParams(trend)
      const trendParam = trend
      const [dataRes, countRes] = await Promise.all([
        supabase.rpc('get_hidden_gem_agents_3500', {
          ...minParams,
          p_trend: trendParam,
          p_mitra: mitra,
          p_pic: pic,
          p_limit: PAGE_SIZE,
          p_offset: newPage * PAGE_SIZE,
        }),
        supabase.rpc('get_hidden_gem_agents_3500_count', {
          ...minParams,
          p_trend: trendParam,
          p_mitra: mitra,
          p_pic: pic,
        }),
      ])
      setAgents(dataRes.data ?? [])
      setTotalCount(Number(countRes.data ?? 0))
    } finally {
      setLoading(false)
    }
  }

  async function loadReturningAgents(newPage: number, mitra: string, pic: string) {
    setLoadingReturning(true)
    try {
      const [dataRes, countRes] = await Promise.all([
        supabase.rpc('get_returning_agents_3500', { p_mitra: mitra, p_pic: pic, p_limit: PAGE_SIZE, p_offset: newPage * PAGE_SIZE }),
        supabase.rpc('get_returning_agents_3500_count', { p_mitra: mitra, p_pic: pic }),
      ])
      setReturningAgents(dataRes.data ?? [])
      setReturningCount(Number(countRes.data ?? 0))
    } finally {
      setLoadingReturning(false)
    }
  }

  async function loadLostAgents(newPage: number, mitra: string, pic: string) {
    setLoadingLost(true)
    try {
      const [dataRes, countRes] = await Promise.all([
        supabase.rpc('get_lost_agents_3500', { p_mitra: mitra, p_pic: pic, p_limit: PAGE_SIZE, p_offset: newPage * PAGE_SIZE }),
        supabase.rpc('get_lost_agents_3500_count', { p_mitra: mitra, p_pic: pic }),
      ])
      setLostAgents(dataRes.data ?? [])
      setLostCount(Number(countRes.data ?? 0))
    } finally {
      setLoadingLost(false)
    }
  }

  async function handleTabChange(tab: typeof activeTab) {
    setActiveTab(tab)
    setPage(0); setReturningPage(0); setLostPage(0)
    if (tab === 'returning') await loadReturningAgents(0, filterMitra, filterPic)
    else if (tab === 'lost_w2') await loadLostAgents(0, filterMitra, filterPic)
    else await loadAgents(0, tab, filterMitra, filterPic)
  }

  async function handleMitraChange(mitra: string) {
    setFilterMitra(mitra); setFilterPic(''); setPage(0); setReturningPage(0); setLostPage(0)
    await loadTrendCounts(mitra, '')
    if (activeTab === 'returning') await loadReturningAgents(0, mitra, '')
    else if (activeTab === 'lost_w2') await loadLostAgents(0, mitra, '')
    else await loadAgents(0, activeTab, mitra, '')
  }

  async function handlePicChange(pic: string) {
    setFilterPic(pic); setPage(0); setReturningPage(0); setLostPage(0)
    if (activeTab === 'returning') await loadReturningAgents(0, filterMitra, pic)
    else if (activeTab === 'lost_w2') await loadLostAgents(0, filterMitra, pic)
    else await loadAgents(0, activeTab, filterMitra, pic)
  }

  async function handlePageChange(newPage: number) {
    if (activeTab === 'returning') { setReturningPage(newPage); await loadReturningAgents(newPage, filterMitra, filterPic) }
    else if (activeTab === 'lost_w2') { setLostPage(newPage); await loadLostAgents(newPage, filterMitra, filterPic) }
    else { setPage(newPage); await loadAgents(newPage, activeTab, filterMitra, filterPic) }
  }

  async function handleReset() {
    setFilterMitra(''); setFilterPic(''); setActiveTab(''); setPage(0); setReturningPage(0); setLostPage(0)
    await loadTrendCounts('', '')
    await loadAgents(0, '', '', '')
    const rc = await supabase.rpc('get_returning_agents_3500_count', { p_mitra: '', p_pic: '' })
    setReturningCount(Number(rc.data ?? 0))
    const lc = await supabase.rpc('get_lost_agents_3500_count', { p_mitra: '', p_pic: '' })
    setLostCount(Number(lc.data ?? 0))
  }

  async function openDrawer(agent: Agent3500) {
    setSelectedAgent(agent); setAgentDetail([]); setLoadingDetail(true)
    try {
      const { data } = await supabase.rpc('get_agent_detail_3500', {
        p_serial: agent.serial_number,
        p_since: sinceDate,
        p_until: lastDate,
      })
      setAgentDetail(data ?? [])
    } finally { setLoadingDetail(false) }
  }

  async function openReturningDrawer(agent: ReturningAgent3500) {
    setSelectedReturning(agent); setReturningDetail([]); setLoadingReturningDetail(true)
    try {
      const { data } = await supabase.rpc('get_agent_detail_3500', { p_serial: agent.serial_number, p_since: sinceDate, p_until: lastDate })
      setReturningDetail(data ?? [])
    } finally { setLoadingReturningDetail(false) }
  }

  async function openLostDrawer(agent: LostAgent3500) {
    setSelectedLost(agent); setLostDetail([]); setLoadingLostDetail(true)
    try {
      const { data } = await supabase.rpc('get_agent_detail_3500', { p_serial: agent.serial_number, p_since: sinceDate, p_until: lastDate })
      setLostDetail(data ?? [])
    } finally { setLoadingLostDetail(false) }
  }

  // Export CSV — selalu fetch ulang SEMUA data (p_limit besar), bukan pakai state tabel
  // yang sudah dipotong PAGE_SIZE untuk pagination.
  async function handleExport() {
    setExporting(true)
    try {
      if (activeTab === 'returning') {
        const { data } = await supabase.rpc('get_returning_agents_3500', {
          p_mitra: filterMitra, p_pic: filterPic, p_limit: 99999, p_offset: 0
        })
        const rows = (data ?? []).map((a: ReturningAgent3500) => [
          a.serial_number, a.merchant_name ?? '', a.mitra ?? '', a.pic ?? '',
          a.first_return_date, a.days_since_return,
          a.trx_count_w1, a.trx_count_w2, a.trx_count_14d,
          a.avg_trx_since_return, a.total_fee_14d,
        ])
        exportCSV(`dashboard3500_baru_w2_${lastDate}.csv`,
          ['Serial','Merchant','Mitra','PIC','Tgl Kembali W2','Hari Sejak Kembali','TRX W1','TRX W2','TRX 14H','Avg TRX/Hari','Total Fee 14H'],
          rows)
      } else if (activeTab === 'lost_w2') {
        const { data } = await supabase.rpc('get_lost_agents_3500', {
          p_mitra: filterMitra, p_pic: filterPic, p_limit: 99999, p_offset: 0
        })
        const rows = (data ?? []).map((a: LostAgent3500) => [
          a.serial_number, a.merchant_name ?? '', a.mitra ?? '', a.pic ?? '',
          a.last_active_date, a.days_since_lost,
          a.trx_count_w1, a.trx_count_w2, a.trx_count_14d,
          a.avg_trx_w1, a.total_fee_14d,
        ])
        exportCSV(`dashboard3500_hilang_w2_${lastDate}.csv`,
          ['Serial','Merchant','Mitra','PIC','Tgl Aktif Terakhir','Hari Sejak Hilang','TRX W1','TRX W2','TRX 14H','Avg TRX/Hari W1','Total Fee 14H'],
          rows)
      } else {
        const minParams = getMinParams(activeTab)
        const trendParam = activeTab
        const { data } = await supabase.rpc('get_hidden_gem_agents_3500', {
          ...minParams, p_trend: trendParam, p_mitra: filterMitra, p_pic: filterPic, p_limit: 99999, p_offset: 0
        })
        const rows = (data ?? []).map((a: Agent3500) => [
          a.serial_number, a.merchant_name ?? '', a.mitra ?? '', a.pic ?? '',
          a.trend, a.bucket, a.active_days_14, a.avg_trx_14,
          a.active_days_w1, a.total_trx_w1, a.avg_trx_w1,
          a.active_days_w2, a.total_trx_w2, a.avg_trx_w2,
          a.trx_change_pct,
        ])
        const tabLabel = activeTab || 'semua'
        exportCSV(`dashboard3500_${tabLabel}_${lastDate}.csv`,
          ['Serial','Merchant','Mitra','PIC','Trend','Bucket','Hari Aktif 14H','Avg TRX/Hari 14H','Hari Aktif W1','Total TRX W1','Avg TRX/Hari W1','Hari Aktif W2','Total TRX W2','Avg TRX/Hari W2','Growth %'],
          rows)
      }
    } finally { setExporting(false) }
  }

  const currentPage  = activeTab === 'returning' ? returningPage : activeTab === 'lost_w2' ? lostPage : page
  const currentTotal = activeTab === 'returning' ? returningCount : activeTab === 'lost_w2' ? lostCount : totalCount
  const totalPages   = Math.ceil(currentTotal / PAGE_SIZE)
  const isLoadingTable = activeTab === 'returning' ? loadingReturning : activeTab === 'lost_w2' ? loadingLost : loading
  const feeProgress  = progress && monthlyTarget ? Math.min(100, Math.round(progress.total_fee / monthlyTarget * 100)) : null
  const projectedFeeConservative = progress?.fee_projected_conservative
    ?? (progress && progress.days_elapsed > 0 ? Math.round(progress.total_fee / progress.days_elapsed * progress.days_in_month) : null)
  const projectedFeeOptimistic = progress?.fee_projected_optimistic ?? projectedFeeConservative
  const currentMonth = progress ? MONTHS[new Date(progress.end_date).getMonth()] : ''
  const currentYear  = progress ? new Date(progress.end_date).getFullYear() : ''
  const filteredPics = filterMitra ? pics.filter(p => agents.some(a => a.mitra === filterMitra && a.pic === p)) : pics

  function TrendChip({ trend }: { trend: string }) {
    const cfg = TREND_CONFIG[trend as keyof typeof TREND_CONFIG] ?? TREND_CONFIG.consistent
    return (
      <span
        onMouseEnter={e => setTooltip({ text: cfg.tooltip, x: e.clientX, y: e.clientY })}
        onMouseMove={e => setTooltip({ text: cfg.tooltip, x: e.clientX, y: e.clientY })}
        onMouseLeave={() => setTooltip(null)}
        style={{ padding: '2px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: '700', backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, whiteSpace: 'nowrap', cursor: 'default' }}>
        {cfg.icon} {cfg.label}
      </span>
    )
  }

  function BucketChip({ b }: { b: string }) {
    const cfg = BUCKET_CONFIG[b] ?? BUCKET_CONFIG.sporadic
    return <span style={{ padding: '2px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: '700', backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, whiteSpace: 'nowrap' }}>{cfg.label}</span>
  }

  return (
    <Layout>
      <style>{SKELETON_STYLE}</style>
      <Head><title>Dashboard Lite dan Plus — AMARIS</title></Head>

      {tooltip && (
        <div style={{ position: 'fixed', left: Math.min(tooltip.x + 12, window.innerWidth - 260), top: tooltip.y - 8, zIndex: 9999, backgroundColor: '#1f2937', color: '#f9fafb', fontSize: '11px', padding: '8px 12px', borderRadius: '8px', maxWidth: '240px', lineHeight: '1.5', pointerEvents: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
          {tooltip.text}
        </div>
      )}

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}>

        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '11px', fontWeight: '600', color: '#9ca3af', letterSpacing: '0.1em', marginBottom: '4px' }}>ANALITIK AGEN</div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#111827', margin: 0, letterSpacing: '-0.02em' }}>💰 Dashboard Lite dan Plus</h1>
          <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
            {sinceDate && lastDate ? (() => {
              const start = new Date(sinceDate)
              const end = new Date(lastDate)
              const fmt = (d: Date) => d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
              const fmtFull = (d: Date) => d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
              return `Data transaksi 14 hari dari tanggal ${fmt(start)} sampai ${fmtFull(end)}`
            })() : 'Agen dengan transaksi fee Rp 3.500 — Lite dan Plus'}
          </p>
        </div>

        {progress && (
          <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px 24px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#374151', letterSpacing: '0.05em' }}>TARGET {currentMonth.toUpperCase()} {currentYear}</div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>
                  {sinceDate && lastDate ? (() => {
                    const start = new Date(sinceDate)
                    const end = new Date(lastDate)
                    const fmt = (d: Date) => d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
                    const fmtFull = (d: Date) => d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
                    return `Data transaksi 14 hari dari tanggal ${fmt(start)} sampai ${fmtFull(end)}`
                  })() : `Hari ke-${progress.days_elapsed} dari ${progress.days_in_month}`}
                </div>
              </div>
              {projectedFeeConservative && monthlyTarget && (
                <div style={{ display: 'flex', gap: '6px' }}>
                  <div style={{ padding: '5px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: '700', backgroundColor: projectedFeeConservative >= monthlyTarget ? '#dcfce7' : '#fee2e2', color: projectedFeeConservative >= monthlyTarget ? '#166534' : '#dc2626' }}>
                    {projectedFeeConservative >= monthlyTarget ? '✓' : '↓'} {formatFee(projectedFeeConservative)}
                  </div>
                  {projectedFeeOptimistic && projectedFeeOptimistic !== projectedFeeConservative && (
                    <div style={{ padding: '5px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: '600', backgroundColor: projectedFeeOptimistic >= monthlyTarget ? '#f0fdf4' : '#fefce8', color: projectedFeeOptimistic >= monthlyTarget ? '#166534' : '#92400e' }}>
                      {projectedFeeOptimistic >= monthlyTarget ? '✓' : '↑'} {formatFee(projectedFeeOptimistic)}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', color: '#6b7280' }}>Fee terkumpul</span>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>{formatFee(progress.total_fee)}{monthlyTarget && <span style={{ color: '#9ca3af', fontWeight: '400' }}> / {formatFee(monthlyTarget)}</span>}</span>
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
                <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>{Math.round(progress.total_trx / Math.max(progress.days_elapsed, 1)).toLocaleString('id')} TRX/hari rata-rata</div>
              </div>
            </div>
            {!monthlyTarget && <div style={{ marginTop: '12px', fontSize: '12px', color: '#9ca3af' }}>💡 <a href="/analytics/target-simple" style={{ color: '#0344D8' }}>Set target bulan ini</a> untuk lihat proyeksi lengkap.</div>}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
          {(['growing', 'declining', 'consistent'] as const).map(tab => {
            const cfg = TREND_CONFIG[tab]
            const count = trendCounts[tab]
            const isActive = activeTab === tab
            return (
              <button key={tab} onClick={() => handleTabChange(isActive ? '' : tab)}
                onMouseEnter={e => setTooltip({ text: cfg.tooltip, x: e.clientX, y: e.clientY })}
                onMouseMove={e => setTooltip({ text: cfg.tooltip, x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setTooltip(null)}
                style={{ padding: '9px 18px', borderRadius: '8px', cursor: 'pointer', border: `2px solid ${isActive ? cfg.color : '#e5e7eb'}`, backgroundColor: isActive ? cfg.bg : '#fff', color: isActive ? cfg.color : '#6b7280', fontSize: '13px', fontWeight: '600', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>{cfg.icon}</span>
                <span>{cfg.label}</span>
                <span style={{ padding: '1px 8px', borderRadius: '99px', fontSize: '11px', backgroundColor: isActive ? '#fff' : '#f3f4f6', color: isActive ? cfg.color : '#9ca3af', fontWeight: '700' }}>{count}</span>
              </button>
            )
          })}

          {(() => {
            const isActive = activeTab === 'returning'
            return (
              <button onClick={() => handleTabChange(isActive ? '' : 'returning')}
                onMouseEnter={e => setTooltip({ text: 'Agen fee Rp 3.500 yang aktif di W2 (7 hari terakhir) tapi tidak ada transaksi di W1 (7 hari pertama). Baru mulai aktif lagi minggu ini.', x: e.clientX, y: e.clientY })}
                onMouseMove={e => setTooltip({ text: 'Agen fee Rp 3.500 yang aktif di W2 (7 hari terakhir) tapi tidak ada transaksi di W1 (7 hari pertama). Baru mulai aktif lagi minggu ini.', x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setTooltip(null)}
                style={{ padding: '9px 18px', borderRadius: '8px', cursor: 'pointer', border: `2px solid ${isActive ? '#7c3aed' : '#e5e7eb'}`, backgroundColor: isActive ? '#f5f3ff' : '#fff', color: isActive ? '#7c3aed' : '#6b7280', fontSize: '13px', fontWeight: '600', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>🆕</span><span>Baru W2</span>
                <span style={{ padding: '1px 8px', borderRadius: '99px', fontSize: '11px', backgroundColor: isActive ? '#fff' : '#f3f4f6', color: isActive ? '#7c3aed' : '#9ca3af', fontWeight: '700' }}>{returningCount}</span>
              </button>
            )
          })()}
          {(() => {
            const isActive = activeTab === 'lost_w2'
            return (
              <button onClick={() => handleTabChange(isActive ? '' : 'lost_w2')}
                onMouseEnter={e => setTooltip({ text: 'Agen fee Rp 3.500 yang aktif di W1 (7 hari pertama) tapi tidak ada transaksi sama sekali di W2 (7 hari terakhir). Perlu dicek — mungkin berhenti.', x: e.clientX, y: e.clientY })}
                onMouseMove={e => setTooltip({ text: 'Agen fee Rp 3.500 yang aktif di W1 (7 hari pertama) tapi tidak ada transaksi sama sekali di W2 (7 hari terakhir). Perlu dicek — mungkin berhenti.', x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setTooltip(null)}
                style={{ padding: '9px 18px', borderRadius: '8px', cursor: 'pointer', border: `2px solid ${isActive ? '#c2410c' : '#e5e7eb'}`, backgroundColor: isActive ? '#fff7ed' : '#fff', color: isActive ? '#c2410c' : '#6b7280', fontSize: '13px', fontWeight: '600', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>👻</span><span>Hilang W2</span>
                <span style={{ padding: '1px 8px', borderRadius: '99px', fontSize: '11px', backgroundColor: isActive ? '#fff' : '#f3f4f6', color: isActive ? '#c2410c' : '#9ca3af', fontWeight: '700' }}>{lostCount}</span>
              </button>
            )
          })()}
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
            {filteredPics.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          {(filterMitra || filterPic || activeTab) && (
            <button onClick={handleReset}
              style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#6b7280', fontSize: '12px', cursor: 'pointer' }}>✕ Reset</button>
          )}
          <button onClick={handleExport} disabled={exporting || isLoadingTable}
            style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#374151', fontSize: '12px', cursor: exporting || isLoadingTable ? 'not-allowed' : 'pointer', opacity: exporting || isLoadingTable ? 0.5 : 1, fontWeight: '600' }}>
            {exporting ? 'Mengekspor...' : '📥 Export CSV'}
          </button>
          <span style={{ marginLeft: 'auto', fontSize: '13px', color: '#6b7280' }}>
            {isLoadingTable ? 'Memuat...' : `${currentTotal.toLocaleString('id')} agen`}
          </span>
        </div>

        {/* Table */}
        {activeTab === 'returning' ? (
          loadingReturning ? (
            <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
              {[1,2,3,4,5].map(i => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 150px 150px 130px 80px', padding: '13px 16px', borderBottom: '1px solid #f3f4f6', gap: '16px', alignItems: 'center' }}>
                  <div><Skeleton width={120} height={13} /><div style={{marginTop:4}}><Skeleton width={80} height={10} /></div></div>
                  <Skeleton width={100} height={12} /><Skeleton width={100} height={12} /><Skeleton width={100} height={12} /><Skeleton width={60} height={12} />
                </div>
              ))}
            </div>
          ) : returningAgents.length > 0 ? (
            <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px 150px 130px 80px', padding: '10px 16px', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.05em' }}>
                <div>AGEN</div><div>MITRA</div><div>PIC</div>
                <div style={{ textAlign: 'center' }}>BARU W2</div>
                <div style={{ textAlign: 'right' }}>TRX 14H</div>
              </div>
              {returningAgents.map((agent, i) => (
                <div key={agent.serial_number} onClick={() => openReturningDrawer(agent)}
                  style={{ display: 'grid', gridTemplateColumns: '1fr 150px 150px 130px 80px', padding: '11px 16px', borderBottom: i < returningAgents.length - 1 ? '1px solid #f3f4f6' : 'none', alignItems: 'center', backgroundColor: '#fff', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = '#fff'}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#111827' }}>{agent.merchant_name ?? agent.serial_number}</div>
                    <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '1px' }}>{agent.serial_number}</div>
                  </div>
                  <div style={{ fontSize: '12px', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.mitra ?? '—'}</div>
                  <div style={{ fontSize: '12px', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.pic ?? '—'}</div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#7c3aed' }}>
                      {new Date(agent.first_return_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                    </div>
                    <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '1px' }}>
                      {agent.avg_trx_since_return} TRX/hari ({agent.days_since_return}h)
                    </div>
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#374151', textAlign: 'right' }}>{agent.trx_count_14d.toLocaleString('id')}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '60px', backgroundColor: '#f9fafb', borderRadius: '10px', border: '1px dashed #e5e7eb', color: '#9ca3af', fontSize: '13px' }}>Tidak ada agen Baru W2 di lini fee 3.500</div>
          )
        ) : activeTab === 'lost_w2' ? (
          loadingLost ? (
            <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
              {[1,2,3,4,5].map(i => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 150px 150px 130px 80px', padding: '13px 16px', borderBottom: '1px solid #f3f4f6', gap: '16px', alignItems: 'center' }}>
                  <div><Skeleton width={120} height={13} /><div style={{marginTop:4}}><Skeleton width={80} height={10} /></div></div>
                  <Skeleton width={100} height={12} /><Skeleton width={100} height={12} /><Skeleton width={100} height={12} /><Skeleton width={60} height={12} />
                </div>
              ))}
            </div>
          ) : lostAgents.length > 0 ? (
            <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px 150px 130px 80px', padding: '10px 16px', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.05em' }}>
                <div>AGEN</div><div>MITRA</div><div>PIC</div>
                <div style={{ textAlign: 'center' }}>HILANG W2</div>
                <div style={{ textAlign: 'right' }}>TRX W1</div>
              </div>
              {lostAgents.map((agent, i) => (
                <div key={agent.serial_number} onClick={() => openLostDrawer(agent)}
                  style={{ display: 'grid', gridTemplateColumns: '1fr 150px 150px 130px 80px', padding: '11px 16px', borderBottom: i < lostAgents.length - 1 ? '1px solid #f3f4f6' : 'none', alignItems: 'center', backgroundColor: '#fff', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = '#fff'}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#111827' }}>{agent.merchant_name ?? agent.serial_number}</div>
                    <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '1px' }}>{agent.serial_number}</div>
                  </div>
                  <div style={{ fontSize: '12px', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.mitra ?? '—'}</div>
                  <div style={{ fontSize: '12px', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.pic ?? '—'}</div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#c2410c' }}>
                      {new Date(agent.last_active_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                    </div>
                    <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '1px' }}>
                      {agent.days_since_lost} hari lalu
                    </div>
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#374151', textAlign: 'right' }}>{agent.trx_count_w1.toLocaleString('id')}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '60px', backgroundColor: '#f9fafb', borderRadius: '10px', border: '1px dashed #e5e7eb', color: '#9ca3af', fontSize: '13px' }}>Tidak ada agen Hilang W2 di lini fee 3.500</div>
          )
        ) : loading ? (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
            {[1,2,3,4,5].map(i => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 150px 150px 60px 80px 80px 80px', padding: '13px 16px', borderBottom: '1px solid #f3f4f6', gap: '16px', alignItems: 'center' }}>
                <Skeleton width={70} height={20} /><div><Skeleton width={120} height={13} /><div style={{marginTop:4}}><Skeleton width={80} height={10} /></div></div>
                <Skeleton width={100} height={12} /><Skeleton width={100} height={12} /><Skeleton width={30} height={12} /><Skeleton width={50} height={12} /><Skeleton width={50} height={12} /><Skeleton width={60} height={20} />
              </div>
            ))}
          </div>
        ) : agents.length > 0 ? (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 150px 150px 60px 80px 80px 80px', padding: '10px 16px', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.05em' }}>
              <div>TREND</div><div>AGEN</div><div>MITRA</div><div>PIC</div>
              <div style={{ textAlign: 'center' }}>
                <span
                  onMouseEnter={e => setTooltip({ text: 'Jumlah hari agen aktif dalam 14 hari terakhir.', x: e.clientX, y: e.clientY })}
                  onMouseMove={e => setTooltip({ text: 'Jumlah hari agen aktif dalam 14 hari terakhir.', x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => setTooltip(null)}>HARI ⓘ</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span
                  onMouseEnter={e => setTooltip({ text: 'Rata-rata TRX fee Rp 3.500 per hari dalam 14 hari terakhir.', x: e.clientX, y: e.clientY })}
                  onMouseMove={e => setTooltip({ text: 'Rata-rata TRX fee Rp 3.500 per hari dalam 14 hari terakhir.', x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => setTooltip(null)}>TRX/HARI (14H) ⓘ</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span
                  onMouseEnter={e => setTooltip({ text: 'Rata-rata TRX fee Rp 3.500 per hari di W2 (8–14).', x: e.clientX, y: e.clientY })}
                  onMouseMove={e => setTooltip({ text: 'Rata-rata TRX fee Rp 3.500 per hari di W2 (8–14).', x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => setTooltip(null)}>TRX/HARI (W2) ⓘ</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span
                  onMouseEnter={e => setTooltip({ text: 'Perubahan avg TRX/hari W2 vs W1. Hijau = naik, merah = turun.', x: e.clientX, y: e.clientY })}
                  onMouseMove={e => setTooltip({ text: 'Perubahan avg TRX/hari W2 vs W1. Hijau = naik, merah = turun.', x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => setTooltip(null)}>GROWTH ⓘ</span>
              </div>
            </div>
            {agents.map((agent, i) => (
              <div key={agent.serial_number} onClick={() => openDrawer(agent)}
                style={{ display: 'grid', gridTemplateColumns: '100px 1fr 150px 150px 60px 80px 80px 80px', padding: '11px 16px', borderBottom: i < agents.length - 1 ? '1px solid #f3f4f6' : 'none', alignItems: 'center', backgroundColor: '#fff', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = '#fff'}>
                <div><TrendChip trend={agent.trend} /></div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#111827' }}>{agent.merchant_name ?? agent.serial_number}</div>
                  <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '1px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span>{agent.serial_number}</span><BucketChip b={agent.bucket} />
                  </div>
                </div>
                <div style={{ fontSize: '12px', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.mitra ?? '—'}</div>
                <div style={{ fontSize: '12px', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.pic ?? '—'}</div>
                <div style={{ fontSize: '13px', fontWeight: '700', textAlign: 'center', color: agent.active_days_14 >= 8 ? '#166534' : agent.active_days_14 >= 5 ? '#ca8a04' : '#dc2626' }}>{agent.active_days_14}</div>
                <div style={{ fontSize: '12px', color: '#374151', textAlign: 'right' }}>{Number(agent.avg_trx_14).toLocaleString('id')}</div>
                <div style={{ fontSize: '12px', color: '#374151', textAlign: 'right' }}>{Number(agent.avg_trx_w2).toLocaleString('id')}</div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ padding: '2px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: '700', backgroundColor: agent.trx_change_pct > 0 ? '#dcfce7' : '#fee2e2', color: agent.trx_change_pct > 0 ? '#166534' : '#dc2626' }}>
                    {agent.trx_change_pct > 0 ? '↑' : '↓'} {Math.abs(agent.trx_change_pct)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px', backgroundColor: '#f9fafb', borderRadius: '10px', border: '1px dashed #e5e7eb', color: '#9ca3af', fontSize: '13px' }}>Tidak ada agen di kategori ini</div>
        )}

        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', alignItems: 'center', marginTop: '16px' }}>
            <button onClick={() => handlePageChange(Math.max(0, currentPage - 1))} disabled={currentPage === 0} style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: currentPage === 0 ? '#d1d5db' : '#374151', fontSize: '13px', cursor: currentPage === 0 ? 'not-allowed' : 'pointer' }}>← Prev</button>
            <span style={{ fontSize: '13px', color: '#6b7280' }}>{currentPage + 1} / {totalPages}</span>
            <button onClick={() => handlePageChange(Math.min(totalPages - 1, currentPage + 1))} disabled={currentPage >= totalPages - 1} style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: currentPage >= totalPages - 1 ? '#d1d5db' : '#374151', fontSize: '13px', cursor: currentPage >= totalPages - 1 ? 'not-allowed' : 'pointer' }}>Next →</button>
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
                <div style={{ display: 'flex', gap: '6px' }}><TrendChip trend={selectedAgent.trend} /><BucketChip b={selectedAgent.bucket} /></div>
              </div>
              <button onClick={() => setSelectedAgent(null)} style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#6b7280', fontSize: '18px', cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>

            {loadingDetail ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>Memuat data...</div>
            ) : agentDetail.length > 0 ? (
              <div style={{ padding: '20px 24px' }}>
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>PERBANDINGAN PERFORMA (W1 vs W2)</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    {[
                      { label: 'Avg TRX/hari W1 (1–7)',   value: String(selectedAgent.avg_trx_w1 > 0 ? selectedAgent.avg_trx_w1 : '—'), highlight: true },
                      { label: 'Avg TRX/hari W2 (8–14)',  value: String(selectedAgent.avg_trx_w2 > 0 ? selectedAgent.avg_trx_w2 : '—'), highlight: true },
                      { label: 'Hari aktif W1',            value: `${selectedAgent.active_days_w1} hari` },
                      { label: 'Hari aktif W2',            value: `${selectedAgent.active_days_w2} hari` },
                      { label: 'TRX Fee 3500 W1',          value: Number(selectedAgent.total_trx_w1).toLocaleString('id') + ' trx', highlight: true },
                      { label: 'TRX Fee 3500 W2',          value: Number(selectedAgent.total_trx_w2).toLocaleString('id') + ' trx', highlight: true },
                      { label: 'Hari aktif 14H',           value: `${selectedAgent.active_days_14} hari` },
                      { label: 'Perubahan W1→W2',          value: `${selectedAgent.trx_change_pct > 0 ? '+' : ''}${selectedAgent.trx_change_pct}%` },
                    ].map(s => (
                      <div key={s.label} style={{ padding: '10px 12px', backgroundColor: (s as any).highlight ? TREND_CONFIG[selectedAgent.trend].bg : '#f9fafb', borderRadius: '8px', textAlign: 'center', border: (s as any).highlight ? `1px solid ${TREND_CONFIG[selectedAgent.trend].border}` : 'none' }}>
                        <div style={{ fontSize: '14px', fontWeight: '700', color: (s as any).highlight ? TREND_CONFIG[selectedAgent.trend].color : '#111827' }}>{s.value}</div>
                        <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

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

                <div>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>TRANSAKSI PER HARI (fee Rp 3.500)</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '80px' }}>
                    {(() => {
                      const maxTrx = Math.max(...agentDetail.map(d => Number(d.total_trx)), 1)
                      const sd = new Date(sinceDate)
                      const w2Start = new Date(sd); w2Start.setDate(sd.getDate() + 7)
                      const w2StartStr = w2Start.toISOString().split('T')[0]
                      return Array.from({ length: 14 }, (_, i) => {
                        const d = new Date(sd); d.setDate(sd.getDate() + i)
                        const dateStr = d.toISOString().split('T')[0]
                        const found = agentDetail.find(a => a.transaction_date === dateStr)
                        const trx = found ? Number(found.total_trx) : 0
                        const isW2 = dateStr >= w2StartStr
                        return (
                          <div key={dateStr} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }} title={`${dateStr}: ${trx} trx`}>
                            <div style={{ width: '100%', height: `${Math.max(4, (trx / maxTrx) * 64)}px`, backgroundColor: trx > 0 ? (isW2 ? TREND_CONFIG[selectedAgent.trend].color : '#94a3b8') : '#f3f4f6', borderRadius: '3px 3px 0 0', transition: 'height 0.3s' }} />
                            <div style={{ fontSize: '8px', color: '#d1d5db', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                              {new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                            </div>
                          </div>
                        )
                      })
                    })()}
                  </div>
                  <div style={{ display: 'flex', gap: '12px', marginTop: '8px', fontSize: '10px', color: '#9ca3af' }}>
                    <span>▪ <span style={{ color: '#94a3b8' }}>W1 (1–7)</span></span>
                    <span>▪ <span style={{ color: TREND_CONFIG[selectedAgent.trend].color }}>W2 (8–14)</span></span>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>Tidak ada data</div>
            )}
          </div>
        </div>
      )}

      {/* Drawer — Baru W2 */}
      {selectedReturning && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}>
          <div onClick={() => setSelectedReturning(null)} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)' }} />
          <div style={{ position: 'relative', width: '480px', height: '100%', backgroundColor: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'sticky', top: 0, backgroundColor: '#fff', zIndex: 1 }}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: '800', color: '#111827', marginBottom: '4px' }}>{selectedReturning.merchant_name ?? selectedReturning.serial_number}</div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '6px' }}>{selectedReturning.serial_number}</div>
                <span style={{ padding: '2px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: '700', backgroundColor: '#f5f3ff', color: '#7c3aed', border: '1px solid #e9d5ff' }}>
                  🆕 Baru W2 sejak {new Date(selectedReturning.first_return_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                </span>
              </div>
              <button onClick={() => setSelectedReturning(null)} style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#6b7280', fontSize: '18px', cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
            {loadingReturningDetail ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>Memuat data...</div>
            ) : (
              <div style={{ padding: '20px 24px' }}>
                {returningDetail.length > 0 && (() => {
                  const latest = returningDetail[returningDetail.length - 1]
                  return (
                    <div style={{ marginBottom: '24px' }}>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>INFO AGEN</div>
                      {[
                        { label: 'Mitra', value: latest.mitra }, { label: 'PIC', value: latest.pic },
                        { label: 'Alamat', value: latest.alamat_struk }, { label: 'Brand', value: latest.brand },
                        { label: 'Mesin', value: latest.tipe_mesin }, { label: 'Aplikasi', value: latest.source_app },
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
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>RINGKASAN</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                    {[
                      { label: 'TRX 14H', value: selectedReturning.trx_count_14d.toLocaleString('id') },
                      { label: 'TRX W2', value: selectedReturning.trx_count_w2.toLocaleString('id') },
                      { label: 'Total Fee 14H', value: formatFee(selectedReturning.total_fee_14d) },
                    ].map(s => (
                      <div key={s.label} style={{ padding: '10px 12px', backgroundColor: '#f9fafb', borderRadius: '8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '14px', fontWeight: '700', color: '#111827' }}>{s.value}</div>
                        <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {returningDetail.length > 0 && (
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>TRANSAKSI PER HARI (14H)</div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '80px' }}>
                      {(() => {
                        const maxTrx = Math.max(...returningDetail.map(d => Number(d.total_trx)), 1)
                        const sd = new Date(sinceDate)
                        const returnDate = selectedReturning.first_return_date
                        return Array.from({ length: 14 }, (_, i) => {
                          const d = new Date(sd); d.setDate(sd.getDate() + i)
                          const dateStr = d.toISOString().split('T')[0]
                          const found = returningDetail.find(a => a.transaction_date === dateStr)
                          const trx = found ? Number(found.total_trx) : 0
                          const isAfterReturn = dateStr >= returnDate
                          return (
                            <div key={dateStr} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }} title={`${dateStr}: ${trx} trx`}>
                              <div style={{ width: '100%', height: `${Math.max(4, (trx / maxTrx) * 64)}px`, backgroundColor: trx > 0 ? (isAfterReturn ? '#7c3aed' : '#94a3b8') : '#f3f4f6', borderRadius: '3px 3px 0 0', transition: 'height 0.3s' }} />
                              <div style={{ fontSize: '8px', color: '#d1d5db', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                                {new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                              </div>
                            </div>
                          )
                        })
                      })()}
                    </div>
                    <div style={{ display: 'flex', gap: '12px', marginTop: '8px', fontSize: '10px', color: '#9ca3af' }}>
                      <span>▪ <span style={{ color: '#94a3b8' }}>Sebelum kembali</span></span>
                      <span>▪ <span style={{ color: '#7c3aed' }}>Setelah kembali</span></span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Drawer — Hilang W2 */}
      {selectedLost && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}>
          <div onClick={() => setSelectedLost(null)} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)' }} />
          <div style={{ position: 'relative', width: '480px', height: '100%', backgroundColor: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'sticky', top: 0, backgroundColor: '#fff', zIndex: 1 }}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: '800', color: '#111827', marginBottom: '4px' }}>{selectedLost.merchant_name ?? selectedLost.serial_number}</div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '6px' }}>{selectedLost.serial_number}</div>
                <span style={{ padding: '2px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: '700', backgroundColor: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' }}>
                  👻 Hilang W2 · Terakhir aktif {new Date(selectedLost.last_active_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                </span>
              </div>
              <button onClick={() => setSelectedLost(null)} style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#6b7280', fontSize: '18px', cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
            {loadingLostDetail ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>Memuat data...</div>
            ) : (
              <div style={{ padding: '20px 24px' }}>
                {lostDetail.length > 0 && (() => {
                  const latest = lostDetail[lostDetail.length - 1]
                  return (
                    <div style={{ marginBottom: '24px' }}>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>INFO AGEN</div>
                      {[
                        { label: 'Mitra', value: latest.mitra }, { label: 'PIC', value: latest.pic },
                        { label: 'Alamat', value: latest.alamat_struk }, { label: 'Brand', value: latest.brand },
                        { label: 'Mesin', value: latest.tipe_mesin }, { label: 'Aplikasi', value: latest.source_app },
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
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>RINGKASAN</div>
                  <div style={{ padding: '12px 16px', backgroundColor: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', marginBottom: '10px' }}>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: '#c2410c' }}>
                      Tidak ada transaksi fee 3.500 selama {selectedLost.days_since_lost} hari
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                    {[
                      { label: 'TRX W1', value: selectedLost.trx_count_w1.toLocaleString('id') },
                      { label: 'Avg TRX/Hari W1', value: selectedLost.avg_trx_w1.toString() },
                      { label: 'Total Fee 14H', value: formatFee(selectedLost.total_fee_14d) },
                    ].map(s => (
                      <div key={s.label} style={{ padding: '10px 12px', backgroundColor: '#f9fafb', borderRadius: '8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '14px', fontWeight: '700', color: '#111827' }}>{s.value}</div>
                        <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {lostDetail.length > 0 && (
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>TRANSAKSI PER HARI (14H)</div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '80px' }}>
                      {(() => {
                        const maxTrx = Math.max(...lostDetail.map(d => Number(d.total_trx)), 1)
                        const sd = new Date(sinceDate)
                        return Array.from({ length: 14 }, (_, i) => {
                          const d = new Date(sd); d.setDate(sd.getDate() + i)
                          const dateStr = d.toISOString().split('T')[0]
                          const found = lostDetail.find(a => a.transaction_date === dateStr)
                          const trx = found ? Number(found.total_trx) : 0
                          return (
                            <div key={dateStr} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }} title={`${dateStr}: ${trx} trx`}>
                              <div style={{ width: '100%', height: `${Math.max(4, (trx / maxTrx) * 64)}px`, backgroundColor: trx > 0 ? '#c2410c' : '#f3f4f6', borderRadius: '3px 3px 0 0', transition: 'height 0.3s' }} />
                              <div style={{ fontSize: '8px', color: '#d1d5db', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                                {new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                              </div>
                            </div>
                          )
                        })
                      })()}
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
