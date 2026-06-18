import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Layout from '../../components/Layout'
import { createBrowserClient } from '@supabase/ssr'

interface ProductivityAgent {
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
  avg_daily_amount_14d: number
  avg_daily_amount_w1: number
  avg_daily_amount_w2: number
  liquidity_ratio: number
  liquidity_status: 'kuat' | 'menurun' | 'lemah' | 'no_data'
}

interface ReturningAgent {
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
  max_gap_days: number
  gap_threshold: number
}

interface SwipeChampionAgent {
  serial_number: string
  merchant_name: string | null
  mitra: string | null
  pic: string | null
  swipe_count_14d: number
  total_trx_14d: number
  pct_swipe: number
  total_fee_14d: number
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

interface MonthlyProgress {
  total_fee: number
  total_trx: number
  days_elapsed: number
  days_in_month: number
  month_start: string
  end_date: string
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

const LIQUIDITY_CONFIG = {
  kuat:    { label: 'Kuat',    color: '#166534', bg: '#dcfce7', border: '#bbf7d0', sublabel: 'Float kemungkinan aman' },
  menurun: { label: 'Menurun', color: '#92400e', bg: '#fef9c3', border: '#fde68a', sublabel: 'Perlu perhatian' },
  lemah:   { label: 'Lemah',   color: '#dc2626', bg: '#fee2e2', border: '#fecaca', sublabel: 'Kemungkinan float menipis' },
  no_data: { label: '—',       color: '#9ca3af', bg: '#f9fafb', border: '#e5e7eb', sublabel: 'Data tidak cukup' },
}

const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']
const PAGE_SIZE = 25

function formatFee(val: number): string {
  if (val >= 1000000) return `Rp ${(val / 1000000).toFixed(1)}jt`
  if (val >= 1000) return `Rp ${(val / 1000).toFixed(0)}rb`
  return `Rp ${val}`
}

function formatAmount(val: number): string {
  if (val >= 1000000000) return `Rp ${(val / 1000000000).toFixed(1)}M`
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

// CSV Export helper
function exportCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export default function ProductivityPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [agents, setAgents] = useState<ProductivityAgent[]>([])
  const [allAgents, setAllAgents] = useState<ProductivityAgent[]>([]) // untuk export
  const [loading, setLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const [trendCounts, setTrendCounts] = useState({ growing: 0, declining: 0, consistent: 0 })

  const [activeTab, setActiveTab] = useState<'growing' | 'declining' | 'consistent' | 'returning' | 'jagoan_bansos' | ''>('')
  const [filterMitra, setFilterMitra] = useState('')
  const [filterPic, setFilterPic] = useState('')
  const [page, setPage] = useState(0)

  const [returningAgents, setReturningAgents] = useState<ReturningAgent[]>([])
  const [allReturning, setAllReturning] = useState<ReturningAgent[]>([]) // untuk export
  const [returningCount, setReturningCount] = useState(0)
  const [loadingReturning, setLoadingReturning] = useState(false)
  const [returningPage, setReturningPage] = useState(0)

  const [swipeChampions, setSwipeChampions] = useState<SwipeChampionAgent[]>([])
  const [swipeChampionCount, setSwipeChampionCount] = useState(0)
  const [loadingSwipeChampion, setLoadingSwipeChampion] = useState(false)
  const [swipeChampionPage, setSwipeChampionPage] = useState(0)

  const [mitras, setMitras] = useState<string[]>([])
  const [pics, setPics] = useState<string[]>([])

  const [progress, setProgress] = useState<MonthlyProgress | null>(null)
  const [monthlyTarget, setMonthlyTarget] = useState<number | null>(null)
  const [lastDate, setLastDate] = useState('')
  const [sinceDate, setSinceDate] = useState('')

  // Drawer — trend agents
  const [selectedAgent, setSelectedAgent] = useState<ProductivityAgent | null>(null)
  const [agentDetail, setAgentDetail] = useState<AgentDayDetail[]>([])
  const [liquidityDetail, setLiquidityDetail] = useState<AgentLiquidityDetail[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)

  // Drawer — returning agents
  const [selectedReturning, setSelectedReturning] = useState<ReturningAgent | null>(null)
  const [returningDetail, setReturningDetail] = useState<AgentDayDetail[]>([])
  const [returningLiqDetail, setReturningLiqDetail] = useState<AgentLiquidityDetail[]>([])
  const [loadingReturningDetail, setLoadingReturningDetail] = useState(false)

  // Drawer — swipe champion (Jagoan Bansos)
  const [selectedSwipeChampion, setSelectedSwipeChampion] = useState<SwipeChampionAgent | null>(null)
  const [swipeChampionDetail, setSwipeChampionDetail] = useState<AgentDayDetail[]>([])
  const [swipeChampionLiqDetail, setSwipeChampionLiqDetail] = useState<AgentLiquidityDetail[]>([])
  const [loadingSwipeChampionDetail, setLoadingSwipeChampionDetail] = useState(false)

  const [tooltip, setTooltip] = useState<{ text: string, x: number, y: number } | null>(null)
  const [exporting, setExporting] = useState(false)

  useEffect(() => { initPage() }, [router.asPath])

  async function initPage() {
    setLoading(true)
    try {
      const [progressRes, filterRes] = await Promise.all([
        supabase.rpc('get_monthly_progress'),
        supabase.rpc('get_hidden_gem_filter_options'),
      ])

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

      if (filterRes.data?.[0]) {
        setMitras(filterRes.data[0].mitras ?? [])
        setPics(filterRes.data[0].pics ?? [])
      }

      const [, , rc] = await Promise.all([
        loadTrendCounts('', ''),
        loadAgents(0, '', '', ''),
        supabase.rpc('get_returning_agents_count', { p_mitra: '', p_pic: '' }),
      ])
      setReturningCount(Number(rc.data ?? 0))

      const scc = await supabase.rpc('get_swipe_champion_agents_count', { p_mitra: '', p_pic: '' })
      setSwipeChampionCount(Number(scc.data ?? 0))
    } finally {
      setLoading(false)
    }
  }

  async function loadTrendCounts(mitra: string, pic: string) {
    const base = { p_min_active_days_w2: 2, p_min_trx_w2: 10, p_min_avg_trx_14: 3, p_mitra: mitra, p_pic: pic }
    const [g, d, c] = await Promise.all([
      supabase.rpc('get_hidden_gem_agents_count', { ...base, p_trend: 'growing' }),
      supabase.rpc('get_hidden_gem_agents_count', { ...base, p_trend: 'declining' }),
      supabase.rpc('get_hidden_gem_agents_count', { ...base, p_trend: 'consistent' }),
    ])
    setTrendCounts({ growing: Number(g.data ?? 0), declining: Number(d.data ?? 0), consistent: Number(c.data ?? 0) })
  }

  async function loadAgents(newPage: number, trend: string, mitra: string, pic: string) {
    setLoading(true)
    try {
      const params = { p_min_active_days_w2: 2, p_min_trx_w2: 10, p_min_avg_trx_14: 3, p_trend: trend, p_mitra: mitra, p_pic: pic }
      const [dataRes, countRes] = await Promise.all([
        supabase.rpc('get_hidden_gem_agents', { ...params, p_limit: PAGE_SIZE, p_offset: newPage * PAGE_SIZE }),
        supabase.rpc('get_hidden_gem_agents_count', params),
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
        supabase.rpc('get_returning_agents', { p_mitra: mitra, p_pic: pic, p_limit: PAGE_SIZE, p_offset: newPage * PAGE_SIZE }),
        supabase.rpc('get_returning_agents_count', { p_mitra: mitra, p_pic: pic }),
      ])
      setReturningAgents(dataRes.data ?? [])
      setReturningCount(Number(countRes.data ?? 0))
    } finally {
      setLoadingReturning(false)
    }
  }

  async function loadSwipeChampionAgents(newPage: number, mitra: string, pic: string) {
    setLoadingSwipeChampion(true)
    try {
      const [dataRes, countRes] = await Promise.all([
        supabase.rpc('get_swipe_champion_agents', { p_mitra: mitra, p_pic: pic, p_limit: PAGE_SIZE, p_offset: newPage * PAGE_SIZE }),
        supabase.rpc('get_swipe_champion_agents_count', { p_mitra: mitra, p_pic: pic }),
      ])
      setSwipeChampions(dataRes.data ?? [])
      setSwipeChampionCount(Number(countRes.data ?? 0))
    } finally {
      setLoadingSwipeChampion(false)
    }
  }

  async function handleTabChange(tab: typeof activeTab) {
    setActiveTab(tab); setPage(0); setReturningPage(0); setSwipeChampionPage(0)
    if (tab === 'returning') await loadReturningAgents(0, filterMitra, filterPic)
    else if (tab === 'jagoan_bansos') await loadSwipeChampionAgents(0, filterMitra, filterPic)
    else await loadAgents(0, tab, filterMitra, filterPic)
  }

  async function handleMitraChange(mitra: string) {
    setFilterMitra(mitra); setFilterPic(''); setPage(0); setReturningPage(0); setSwipeChampionPage(0)
    await loadTrendCounts(mitra, '')
    if (activeTab === 'returning') await loadReturningAgents(0, mitra, '')
    else if (activeTab === 'jagoan_bansos') await loadSwipeChampionAgents(0, mitra, '')
    else await loadAgents(0, activeTab, mitra, '')
  }

  async function handlePicChange(pic: string) {
    setFilterPic(pic); setPage(0); setReturningPage(0); setSwipeChampionPage(0)
    if (activeTab === 'returning') await loadReturningAgents(0, filterMitra, pic)
    else if (activeTab === 'jagoan_bansos') await loadSwipeChampionAgents(0, filterMitra, pic)
    else await loadAgents(0, activeTab, filterMitra, pic)
  }

  async function handlePageChange(newPage: number) {
    if (activeTab === 'returning') { setReturningPage(newPage); await loadReturningAgents(newPage, filterMitra, filterPic) }
    else if (activeTab === 'jagoan_bansos') { setSwipeChampionPage(newPage); await loadSwipeChampionAgents(newPage, filterMitra, filterPic) }
    else { setPage(newPage); await loadAgents(newPage, activeTab, filterMitra, filterPic) }
  }

  async function handleReset() {
    setFilterMitra(''); setFilterPic(''); setActiveTab(''); setPage(0); setReturningPage(0); setSwipeChampionPage(0)
    await loadTrendCounts('', '')
    await loadAgents(0, '', '', '')
    const rc = await supabase.rpc('get_returning_agents_count', { p_mitra: '', p_pic: '' })
    setReturningCount(Number(rc.data ?? 0))
    const scc = await supabase.rpc('get_swipe_champion_agents_count', { p_mitra: '', p_pic: '' })
    setSwipeChampionCount(Number(scc.data ?? 0))
  }

  async function openDrawer(agent: ProductivityAgent) {
    setSelectedAgent(agent); setAgentDetail([]); setLiquidityDetail([]); setLoadingDetail(true)
    try {
      const [detailRes, liquidityRes] = await Promise.all([
        supabase.rpc('get_agent_detail', { p_serial: agent.serial_number, p_since: sinceDate, p_until: lastDate }),
        supabase.rpc('get_agent_liquidity_summary', { p_serial: agent.serial_number }),
      ])
      setAgentDetail(detailRes.data ?? [])
      setLiquidityDetail(liquidityRes.data ?? [])
    } finally { setLoadingDetail(false) }
  }

  async function openReturningDrawer(agent: ReturningAgent) {
    setSelectedReturning(agent); setReturningDetail([]); setReturningLiqDetail([]); setLoadingReturningDetail(true)
    try {
      const [detailRes, liquidityRes] = await Promise.all([
        supabase.rpc('get_agent_detail', { p_serial: agent.serial_number, p_since: sinceDate, p_until: lastDate }),
        supabase.rpc('get_agent_liquidity_summary', { p_serial: agent.serial_number }),
      ])
      setReturningDetail(detailRes.data ?? [])
      setReturningLiqDetail(liquidityRes.data ?? [])
    } finally { setLoadingReturningDetail(false) }
  }

  async function openSwipeChampionDrawer(agent: SwipeChampionAgent) {
    setSelectedSwipeChampion(agent); setSwipeChampionDetail([]); setSwipeChampionLiqDetail([]); setLoadingSwipeChampionDetail(true)
    try {
      const [detailRes, liquidityRes] = await Promise.all([
        supabase.rpc('get_agent_detail', { p_serial: agent.serial_number, p_since: sinceDate, p_until: lastDate }),
        supabase.rpc('get_agent_liquidity_summary', { p_serial: agent.serial_number }),
      ])
      setSwipeChampionDetail(detailRes.data ?? [])
      setSwipeChampionLiqDetail(liquidityRes.data ?? [])
    } finally { setLoadingSwipeChampionDetail(false) }
  }

  // Export CSV
  async function handleExport() {
    setExporting(true)
    try {
      if (activeTab === 'returning') {
        // Fetch all returning
        const { data } = await supabase.rpc('get_returning_agents', {
          p_mitra: filterMitra, p_pic: filterPic, p_limit: 99999, p_offset: 0
        })
        const rows = (data ?? []).map((a: ReturningAgent) => [
          a.serial_number, a.merchant_name ?? '', a.mitra ?? '', a.pic ?? '',
          a.first_return_date, a.days_since_return,
          a.trx_count_w1, a.trx_count_w2, a.trx_count_14d,
          a.avg_trx_since_return, a.total_fee_14d,
          a.max_gap_days, a.gap_threshold,
          a.max_gap_days > a.gap_threshold ? 'Absen Signifikan' : 'Normal',
        ])
        exportCSV(`produktifitas_kembali_aktif_${lastDate}.csv`,
          ['Serial','Merchant','Mitra','PIC','Tgl Kembali W2','Hari Sejak Kembali','TRX W1','TRX W2','TRX 14H','Avg TRX/Hari','Total Fee','Max Gap (hari)','Threshold','Status Absen'],
          rows)
      } else if (activeTab === 'jagoan_bansos') {
        // Fetch all swipe champions
        const { data } = await supabase.rpc('get_swipe_champion_agents', {
          p_mitra: filterMitra, p_pic: filterPic, p_limit: 99999, p_offset: 0
        })
        const rows = (data ?? []).map((a: SwipeChampionAgent) => [
          a.serial_number, a.merchant_name ?? '', a.mitra ?? '', a.pic ?? '',
          a.swipe_count_14d, a.pct_swipe, a.total_trx_14d, a.total_fee_14d,
        ])
        exportCSV(`produktifitas_jagoan_bansos_${lastDate}.csv`,
          ['Serial','Merchant','Mitra','PIC','SWIPE 14H','% SWIPE','Total TRX 14H','Total Fee 14H'],
          rows)
      } else {
        // Fetch all trend agents
        const params = { p_min_active_days_w2: 2, p_min_trx_w2: 10, p_min_avg_trx_14: 3, p_trend: activeTab, p_mitra: filterMitra, p_pic: filterPic }
        const { data } = await supabase.rpc('get_hidden_gem_agents', { ...params, p_limit: 99999, p_offset: 0 })
        const rows = (data ?? []).map((a: ProductivityAgent) => [
          a.serial_number, a.merchant_name ?? '', a.mitra ?? '', a.pic ?? '',
          a.trend, a.bucket, a.active_days_14, a.avg_trx_14,
          a.active_days_w1, a.total_trx_w1, a.avg_trx_w1,
          a.active_days_w2, a.total_trx_w2, a.avg_trx_w2,
          a.trx_change_pct, a.avg_daily_amount_14d, a.avg_daily_amount_w1, a.avg_daily_amount_w2,
          a.liquidity_ratio, a.liquidity_status,
        ])
        const tabLabel = activeTab || 'semua'
        exportCSV(`produktifitas_${tabLabel}_${lastDate}.csv`,
          ['Serial','Merchant','Mitra','PIC','Trend','Bucket','Hari Aktif 14H','Avg TRX/Hari 14H','Hari Aktif W1','Total TRX W1','Avg TRX/Hari W1','Hari Aktif W2','Total TRX W2','Avg TRX/Hari W2','Growth %','Avg Amount/Hari 14H','Avg Amount/Hari W1','Avg Amount/Hari W2','Liquidity Ratio','Liquidity Status'],
          rows)
      }
    } finally { setExporting(false) }
  }

  const currentPage  = activeTab === 'returning' ? returningPage : activeTab === 'jagoan_bansos' ? swipeChampionPage : page
  const currentTotal = activeTab === 'returning' ? returningCount : activeTab === 'jagoan_bansos' ? swipeChampionCount : totalCount
  const totalPages   = Math.ceil(currentTotal / PAGE_SIZE)
  const feeProgress  = progress && monthlyTarget ? Math.min(100, Math.round(progress.total_fee / monthlyTarget * 100)) : null
  const projectedFee = progress && progress.days_elapsed > 0 ? Math.round(progress.total_fee / progress.days_elapsed * progress.days_in_month) : null
  const currentMonth = progress ? MONTHS[new Date(progress.end_date).getMonth()] : ''
  const currentYear  = progress ? new Date(progress.end_date).getFullYear() : ''
  const liquiditySummary = liquidityDetail[0] ?? null
  const returningLiqSummary = returningLiqDetail[0] ?? null
  const swipeChampionLiqSummary = swipeChampionLiqDetail[0] ?? null
  const isLoadingTable = activeTab === 'returning' ? loadingReturning : activeTab === 'jagoan_bansos' ? loadingSwipeChampion : loading

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

  function LiquidityChip({ status }: { status: string }) {
    const cfg = LIQUIDITY_CONFIG[status as keyof typeof LIQUIDITY_CONFIG] ?? LIQUIDITY_CONFIG.no_data
    return <span style={{ padding: '2px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: '700', backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, whiteSpace: 'nowrap' }}>{cfg.label}</span>
  }

  return (
    <Layout>
      <style>{SKELETON_STYLE}</style>
      <Head><title>Produktifitas Agen — AMARIS</title></Head>

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
            onMouseEnter={e => setTooltip({ text: 'Produktifitas agen diukur dengan membandingkan W1 (7 hari pertama) vs W2 (7 hari terakhir) dalam window 14 hari terakhir.\n\n💎 Growing — Avg TRX/hari W2 lebih dari 120% W1. Agen tumbuh.\n⚠️ Declining — Avg TRX/hari W2 kurang dari 80% W1. Agen menurun.\n✅ Konsisten — Avg TRX/hari W2 antara 80–120% W1. Agen stabil.', x: e.clientX, y: e.clientY })}
            onMouseMove={e => setTooltip({ text: 'Produktifitas agen diukur dengan membandingkan W1 (7 hari pertama) vs W2 (7 hari terakhir) dalam window 14 hari terakhir.\n\n💎 Growing — Avg TRX/hari W2 lebih dari 120% W1. Agen tumbuh.\n⚠️ Declining — Avg TRX/hari W2 kurang dari 80% W1. Agen menurun.\n✅ Konsisten — Avg TRX/hari W2 antara 80–120% W1. Agen stabil.', x: e.clientX, y: e.clientY })}
            onMouseLeave={() => setTooltip(null)}
          >📈 Produktifitas Agen ⓘ</h1>
          <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
            {sinceDate && lastDate ? (() => {
              const fmtNoYear = (d: string) => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
              const fmtFull   = (d: string) => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
              return `Data transaksi 14 hari dari tanggal ${fmtNoYear(sinceDate)} sampai ${fmtFull(lastDate)}`
            })() : ''}
          </p>
        </div>

        {progress && (
          <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px 24px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#374151', letterSpacing: '0.05em' }}>TARGET {currentMonth.toUpperCase()} {currentYear}</div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>Hari ke-{progress.days_elapsed} dari {progress.days_in_month}</div>
              </div>
              {projectedFee && monthlyTarget && (
                <div style={{ padding: '6px 14px', borderRadius: '99px', fontSize: '12px', fontWeight: '700', backgroundColor: projectedFee >= monthlyTarget ? '#dcfce7' : '#fee2e2', color: projectedFee >= monthlyTarget ? '#166534' : '#dc2626' }}>
                  Proyeksi: {formatFee(projectedFee)} {projectedFee >= monthlyTarget ? '✓' : '↓'}
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
                <span>{cfg.icon}</span><span>{cfg.label}</span>
                <span style={{ padding: '1px 8px', borderRadius: '99px', fontSize: '11px', backgroundColor: isActive ? '#fff' : '#f3f4f6', color: isActive ? cfg.color : '#9ca3af', fontWeight: '700' }}>{count}</span>
              </button>
            )
          })}
          {(() => {
            const isActive = activeTab === 'returning'
            return (
              <button onClick={() => handleTabChange(isActive ? '' : 'returning')}
                onMouseEnter={e => setTooltip({ text: 'Agen yang aktif di 7 hari kedua window (W2) tapi tidak ada di 7 hari pertama (W1). Indikasi agen yang baru mulai aktif minggu ini setelah absen minggu lalu.', x: e.clientX, y: e.clientY })}
                onMouseMove={e => setTooltip({ text: 'Agen yang aktif di 7 hari kedua window (W2) tapi tidak ada di 7 hari pertama (W1). Indikasi agen yang baru mulai aktif minggu ini setelah absen minggu lalu.', x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setTooltip(null)}
                style={{ padding: '9px 18px', borderRadius: '8px', cursor: 'pointer', border: `2px solid ${isActive ? '#7c3aed' : '#e5e7eb'}`, backgroundColor: isActive ? '#f5f3ff' : '#fff', color: isActive ? '#7c3aed' : '#6b7280', fontSize: '13px', fontWeight: '600', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>🔄</span><span>Kembali Aktif</span>
                <span style={{ padding: '1px 8px', borderRadius: '99px', fontSize: '11px', backgroundColor: isActive ? '#fff' : '#f3f4f6', color: isActive ? '#7c3aed' : '#9ca3af', fontWeight: '700' }}>{returningCount}</span>
              </button>
            )
          })()}
          {(() => {
            const isActive = activeTab === 'jagoan_bansos'
            return (
              <button onClick={() => handleTabChange(isActive ? '' : 'jagoan_bansos')}
                onMouseEnter={e => setTooltip({ text: 'Agen dengan total transaksi SWIPE ≥100 dalam 14 hari terakhir. SWIPE umumnya terkait transaksi pencairan bansos — agen di sini melayani volume SWIPE besar, terlepas dari berapa banyak transaksi DIP-nya.', x: e.clientX, y: e.clientY })}
                onMouseMove={e => setTooltip({ text: 'Agen dengan total transaksi SWIPE ≥100 dalam 14 hari terakhir. SWIPE umumnya terkait transaksi pencairan bansos — agen di sini melayani volume SWIPE besar, terlepas dari berapa banyak transaksi DIP-nya.', x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setTooltip(null)}
                style={{ padding: '9px 18px', borderRadius: '8px', cursor: 'pointer', border: `2px solid ${isActive ? '#c2410c' : '#e5e7eb'}`, backgroundColor: isActive ? '#fff7ed' : '#fff', color: isActive ? '#c2410c' : '#6b7280', fontSize: '13px', fontWeight: '600', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>🪪</span><span>Jagoan Bansos</span>
                <span style={{ padding: '1px 8px', borderRadius: '99px', fontSize: '11px', backgroundColor: isActive ? '#fff' : '#f3f4f6', color: isActive ? '#c2410c' : '#9ca3af', fontWeight: '700' }}>{swipeChampionCount}</span>
              </button>
            )
          })()}
        </div>

        {/* Filters + Export */}
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
          {(filterMitra || filterPic || activeTab) && (
            <button onClick={handleReset} style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#6b7280', fontSize: '12px', cursor: 'pointer' }}>✕ Reset</button>
          )}
          <span style={{ marginLeft: 'auto', fontSize: '13px', color: '#6b7280', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            {isLoadingTable ? 'Memuat...' : (
              <>
                {currentTotal.toLocaleString('id')} agen
                {activeTab !== 'returning' && (
                  <span
                    onMouseEnter={e => setTooltip({ text: 'Hanya agen dengan aktif ≥2 hari di W2, total TRX ≥10 di W2, dan avg TRX/hari ≥3 dalam 14 hari terakhir yang ditampilkan.', x: e.clientX, y: e.clientY })}
                    onMouseMove={e => setTooltip({ text: 'Hanya agen dengan aktif ≥2 hari di W2, total TRX ≥10 di W2, dan avg TRX/hari ≥3 dalam 14 hari terakhir yang ditampilkan.', x: e.clientX, y: e.clientY })}
                    onMouseLeave={() => setTooltip(null)}
                    style={{ fontSize: '11px', color: '#9ca3af', cursor: 'default', opacity: 0.7 }}>ⓘ</span>
                )}
              </>
            )}
          </span>
          <button onClick={handleExport} disabled={exporting || isLoadingTable}
            style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: exporting ? '#9ca3af' : '#374151', fontSize: '12px', cursor: exporting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {exporting ? '⏳' : '⬇'} Export CSV
          </button>
        </div>

        {/* Table — Kembali Aktif */}
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
                <div>AGEN</div>
                <div>MITRA</div>
                <div>PIC</div>
                <div style={{ textAlign: 'center' }}>
                  <span onMouseEnter={e => setTooltip({ text: 'Tanggal pertama aktif di W2 (7 hari terakhir). TRX/hari dihitung sejak tanggal kembali hingga hari terakhir data.', x: e.clientX, y: e.clientY })} onMouseMove={e => setTooltip({ text: 'Tanggal pertama aktif di W2 (7 hari terakhir). TRX/hari dihitung sejak tanggal kembali hingga hari terakhir data.', x: e.clientX, y: e.clientY })} onMouseLeave={() => setTooltip(null)}>
                    KEMBALI AKTIF ⓘ
                  </span>
                </div>
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
                    {agent.max_gap_days > agent.gap_threshold && (
                      <div style={{ fontSize: '9px', color: '#dc2626', fontWeight: '600', marginTop: '1px' }}>
                        🔴 absen {agent.max_gap_days}h
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#374151', textAlign: 'right' }}>{agent.trx_count_14d.toLocaleString('id')}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '60px', backgroundColor: '#f9fafb', borderRadius: '10px', border: '1px dashed #e5e7eb', color: '#9ca3af', fontSize: '13px' }}>Tidak ada agen kembali aktif</div>
          )
        ) : activeTab === 'jagoan_bansos' ? (
          loadingSwipeChampion ? (
            <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
              {[1,2,3,4,5].map(i => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 150px 150px 100px 90px 90px 100px', padding: '13px 16px', borderBottom: '1px solid #f3f4f6', gap: '16px', alignItems: 'center' }}>
                  <div><Skeleton width={120} height={13} /><div style={{marginTop:4}}><Skeleton width={80} height={10} /></div></div>
                  <Skeleton width={100} height={12} /><Skeleton width={100} height={12} /><Skeleton width={60} height={12} /><Skeleton width={60} height={12} /><Skeleton width={60} height={12} /><Skeleton width={70} height={12} />
                </div>
              ))}
            </div>
          ) : swipeChampions.length > 0 ? (
            <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px 150px 100px 90px 90px 100px', padding: '10px 16px', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.05em' }}>
                <div>AGEN</div>
                <div>MITRA</div>
                <div>PIC</div>
                <div style={{ textAlign: 'right' }}>
                  <span onMouseEnter={e => setTooltip({ text: 'Total transaksi SWIPE dalam 14 hari terakhir. Minimal 100 untuk masuk kategori ini.', x: e.clientX, y: e.clientY })} onMouseMove={e => setTooltip({ text: 'Total transaksi SWIPE dalam 14 hari terakhir. Minimal 100 untuk masuk kategori ini.', x: e.clientX, y: e.clientY })} onMouseLeave={() => setTooltip(null)}>
                    SWIPE 14H ⓘ
                  </span>
                </div>
                <div style={{ textAlign: 'right' }}>% SWIPE</div>
                <div style={{ textAlign: 'right' }}>TRX 14H</div>
                <div style={{ textAlign: 'right' }}>FEE 14H</div>
              </div>
              {swipeChampions.map((agent, i) => (
                <div key={agent.serial_number} onClick={() => openSwipeChampionDrawer(agent)}
                  style={{ display: 'grid', gridTemplateColumns: '1fr 150px 150px 100px 90px 90px 100px', padding: '11px 16px', borderBottom: i < swipeChampions.length - 1 ? '1px solid #f3f4f6' : 'none', alignItems: 'center', backgroundColor: '#fff', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = '#fff'}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#111827' }}>{agent.merchant_name ?? agent.serial_number}</div>
                    <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '1px' }}>{agent.serial_number}</div>
                  </div>
                  <div style={{ fontSize: '12px', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.mitra ?? '—'}</div>
                  <div style={{ fontSize: '12px', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.pic ?? '—'}</div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#c2410c', textAlign: 'right' }}>{agent.swipe_count_14d.toLocaleString('id')}</div>
                  <div style={{ fontSize: '12px', color: '#374151', textAlign: 'right' }}>{agent.pct_swipe}%</div>
                  <div style={{ fontSize: '12px', color: '#374151', textAlign: 'right' }}>{agent.total_trx_14d.toLocaleString('id')}</div>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#374151', textAlign: 'right' }}>{formatFee(agent.total_fee_14d)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '60px', backgroundColor: '#f9fafb', borderRadius: '10px', border: '1px dashed #e5e7eb', color: '#9ca3af', fontSize: '13px' }}>Tidak ada agen Jagoan Bansos (SWIPE ≥100 dalam 14H)</div>
          )
        ) : (
          loading ? (
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
                <div style={{ textAlign: 'center' }}>HARI</div>
                <div style={{ textAlign: 'right' }}>TRX/HARI (14H)</div>
                <div style={{ textAlign: 'right' }}>TRX/HARI (BLN)</div>
                <div style={{ textAlign: 'right' }}>GROWTH</div>
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
          )
        )}

        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', alignItems: 'center', marginTop: '16px' }}>
            <button onClick={() => handlePageChange(Math.max(0, currentPage - 1))} disabled={currentPage === 0} style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: currentPage === 0 ? '#d1d5db' : '#374151', fontSize: '13px', cursor: currentPage === 0 ? 'not-allowed' : 'pointer' }}>← Prev</button>
            <span style={{ fontSize: '13px', color: '#6b7280' }}>{currentPage + 1} / {totalPages}</span>
            <button onClick={() => handlePageChange(Math.min(totalPages - 1, currentPage + 1))} disabled={currentPage >= totalPages - 1} style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: currentPage >= totalPages - 1 ? '#d1d5db' : '#374151', fontSize: '13px', cursor: currentPage >= totalPages - 1 ? 'not-allowed' : 'pointer' }}>Next →</button>
          </div>
        )}
      </div>

      {/* Drawer — Trend Agent */}
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
                {(() => {
                  const latest = agentDetail[agentDetail.length - 1]
                  return (
                    <div style={{ marginBottom: '24px' }}>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>INFO AGEN</div>
                      {[
                        { label: 'Mitra', value: latest.mitra }, { label: 'PIC', value: latest.pic },
                        { label: 'Alamat', value: latest.alamat_struk }, { label: 'Brand', value: latest.brand },
                        { label: 'Mesin', value: latest.tipe_mesin }, { label: 'Aplikasi', value: latest.source_app },
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
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>PERBANDINGAN PERFORMA (W1 vs W2)</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    {[
                      { label: 'Avg TRX/hari W1 (1–7)',   value: String(selectedAgent.avg_trx_w1 > 0 ? selectedAgent.avg_trx_w1 : '—') },
                      { label: 'Avg TRX/hari W2 (8–14)', value: String(selectedAgent.avg_trx_w2 > 0 ? selectedAgent.avg_trx_w2 : '—'), highlight: true },
                      { label: 'Hari aktif W1',            value: `${selectedAgent.active_days_w1} hari` },
                      { label: 'Hari aktif W2',            value: `${selectedAgent.active_days_w2} hari` },
                      { label: 'Total TRX W2',             value: Number(selectedAgent.total_trx_w2).toLocaleString('id') },
                      { label: 'Perubahan W1→W2',          value: `${selectedAgent.trx_change_pct > 0 ? '+' : ''}${selectedAgent.trx_change_pct}%`, highlight: true },
                    ].map(s => (
                      <div key={s.label} style={{ padding: '10px 12px', backgroundColor: (s as any).highlight ? TREND_CONFIG[selectedAgent.trend].bg : '#f9fafb', borderRadius: '8px', textAlign: 'center', border: (s as any).highlight ? `1px solid ${TREND_CONFIG[selectedAgent.trend].border}` : 'none' }}>
                        <div style={{ fontSize: '14px', fontWeight: '700', color: (s as any).highlight ? TREND_CONFIG[selectedAgent.trend].color : '#111827' }}>{s.value}</div>
                        <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>RINGKASAN 14 HARI</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                    {[
                      { label: 'Total TRX', value: agentDetail.reduce((s, d) => s + Number(d.total_trx), 0).toLocaleString('id') },
                      { label: 'Transfer', value: agentDetail.reduce((s, d) => s + Number(d.transfer_trx), 0).toLocaleString('id') },
                      { label: 'Cek Saldo', value: agentDetail.reduce((s, d) => s + Number(d.cek_saldo_trx), 0).toLocaleString('id') },
                      { label: 'Total Fee', value: formatFee(agentDetail.reduce((s, d) => s + Number(d.total_fee), 0)) },
                      { label: 'Total Amount', value: formatAmount(agentDetail.reduce((s, d) => s + Number(d.total_amount), 0)) },
                      { label: 'Hari Aktif', value: `${agentDetail.length} hari` },
                    ].map(s => (
                      <div key={s.label} style={{ padding: '10px 12px', backgroundColor: '#f9fafb', borderRadius: '8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '14px', fontWeight: '700', color: '#111827' }}>{s.value}</div>
                        <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
                {liquiditySummary && (
                  <div style={{ marginBottom: '24px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>LIKUIDITAS AGEN</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div style={{ padding: '10px 12px', backgroundColor: '#f9fafb', borderRadius: '8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '14px', fontWeight: '700', color: '#111827' }}>{formatAmount(liquiditySummary.avg_daily_amount_w1)}</div>
                        <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>Avg Amount/Hari W1</div>
                      </div>
                      {(() => {
                        const cfg = LIQUIDITY_CONFIG[liquiditySummary.liquidity_status] ?? LIQUIDITY_CONFIG.no_data
                        return (
                          <div style={{ padding: '10px 12px', backgroundColor: cfg.bg, borderRadius: '8px', textAlign: 'center', border: `1px solid ${cfg.border}` }}>
                            <div style={{ fontSize: '14px', fontWeight: '700', color: cfg.color }}>{liquiditySummary.liquidity_ratio?.toFixed(2)}x</div>
                            <div style={{ fontSize: '10px', color: cfg.color, marginTop: '2px', opacity: 0.8 }}>{cfg.sublabel}</div>
                            <div style={{ marginTop: '4px' }}><LiquidityChip status={liquiditySummary.liquidity_status} /></div>
                          </div>
                        )
                      })()}
                    </div>
                  </div>
                )}
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>TRANSAKSI PER HARI</div>
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
                {liquidityDetail.length > 0 && (
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>NOMINAL UANG BEREDAR (14H)</div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '80px' }}>
                      {(() => {
                        const maxAmount = Math.max(...liquidityDetail.map(d => Number(d.daily_amount)), 1)
                        const avgAmount = liquiditySummary?.avg_daily_amount_w2 ?? 0
                        const sd = new Date(sinceDate)
                        return Array.from({ length: 14 }, (_, i) => {
                          const d = new Date(sd); d.setDate(sd.getDate() + i)
                          const dateStr = d.toISOString().split('T')[0]
                          const found = liquidityDetail.find(a => a.transaction_date === dateStr)
                          const amount = found ? Number(found.daily_amount) : 0
                          const barColor = amount === 0 ? '#f3f4f6' : amount < avgAmount * 0.5 ? '#ef4444' : amount < avgAmount * 0.8 ? '#eab308' : '#22c55e'
                          return (
                            <div key={dateStr} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }} title={`${dateStr}: ${formatAmount(amount)}`}>
                              <div style={{ width: '100%', height: `${Math.max(4, (amount / maxAmount) * 64)}px`, backgroundColor: barColor, borderRadius: '3px 3px 0 0', transition: 'height 0.3s' }} />
                              <div style={{ fontSize: '8px', color: '#d1d5db', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
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
                    <div style={{ marginTop: '6px', fontSize: '10px', color: '#9ca3af' }}>Avg W2: {formatAmount(liquiditySummary?.avg_daily_amount_w2 ?? 0)}/hari</div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>Tidak ada data</div>
            )}
          </div>
        </div>
      )}

      {/* Drawer — Returning Agent */}
      {selectedReturning && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}>
          <div onClick={() => setSelectedReturning(null)} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)' }} />
          <div style={{ position: 'relative', width: '480px', height: '100%', backgroundColor: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'sticky', top: 0, backgroundColor: '#fff', zIndex: 1 }}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: '800', color: '#111827', marginBottom: '4px' }}>{selectedReturning.merchant_name ?? selectedReturning.serial_number}</div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '6px' }}>{selectedReturning.serial_number}</div>
                <span style={{ padding: '2px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: '700', backgroundColor: '#f5f3ff', color: '#7c3aed', border: '1px solid #e9d5ff' }}>
                  🔄 Kembali Aktif sejak {new Date(selectedReturning.first_return_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                </span>
              </div>
              <button onClick={() => setSelectedReturning(null)} style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#6b7280', fontSize: '18px', cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
            {loadingReturningDetail ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>Memuat data...</div>
            ) : (
              <div style={{ padding: '20px 24px' }}>

                {/* 1. Info Agen */}
                {returningDetail.length > 0 && (() => {
                  const latest = returningDetail[returningDetail.length - 1]
                  return (
                    <div style={{ marginBottom: '24px' }}>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>INFO AGEN</div>
                      {[
                        { label: 'Mitra', value: latest.mitra }, { label: 'PIC', value: latest.pic },
                        { label: 'Alamat', value: latest.alamat_struk }, { label: 'Brand', value: latest.brand },
                        { label: 'Mesin', value: latest.tipe_mesin }, { label: 'Aplikasi', value: latest.source_app },
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

                {/* 2. Ringkasan Kembali Aktif */}
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>RINGKASAN KEMBALI AKTIF</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                    {[
                      { label: 'TRX W1 (tidak aktif)', value: selectedReturning.trx_count_w1.toLocaleString('id'), dim: true },
                      { label: 'TRX W2 (aktif kembali)', value: selectedReturning.trx_count_w2.toLocaleString('id'), highlight: true },
                      { label: 'Avg TRX/Hari', value: String(selectedReturning.avg_trx_since_return) },
                      { label: 'Hari Sejak Kembali', value: `${selectedReturning.days_since_return} hari` },
                      { label: 'Total Fee 14H', value: formatFee(selectedReturning.total_fee_14d) },
                      { label: 'Total TRX 14H', value: selectedReturning.trx_count_14d.toLocaleString('id') },
                    ].map(s => (
                      <div key={s.label} style={{ padding: '10px 12px', backgroundColor: (s as any).highlight ? '#f5f3ff' : '#f9fafb', borderRadius: '8px', textAlign: 'center', border: (s as any).highlight ? '1px solid #e9d5ff' : 'none', opacity: (s as any).dim ? 0.6 : 1 }}>
                        <div style={{ fontSize: '14px', fontWeight: '700', color: (s as any).highlight ? '#7c3aed' : '#111827' }}>{s.value}</div>
                        <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                  {/* Gap indicator */}
                  <div style={{ marginTop: '10px', padding: '10px 14px', borderRadius: '8px', backgroundColor: selectedReturning.max_gap_days > selectedReturning.gap_threshold ? '#fef2f2' : '#f0fdf4', border: `1px solid ${selectedReturning.max_gap_days > selectedReturning.gap_threshold ? '#fecaca' : '#bbf7d0'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: selectedReturning.max_gap_days > selectedReturning.gap_threshold ? '#dc2626' : '#166534' }}>
                        {selectedReturning.max_gap_days > selectedReturning.gap_threshold ? '🔴' : '🟢'} Gap terpanjang di W1: {selectedReturning.max_gap_days} hari berturut-turut
                      </div>
                      <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>Threshold absen: &gt;{selectedReturning.gap_threshold} hari</div>
                    </div>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: selectedReturning.max_gap_days > selectedReturning.gap_threshold ? '#dc2626' : '#166534' }}>
                      {selectedReturning.max_gap_days > selectedReturning.gap_threshold ? 'Absen Signifikan' : 'Normal'}
                    </div>
                  </div>
                </div>

                {/* 3. Likuiditas Cards */}
                {returningLiqDetail.length > 0 && (() => {
                  const liqSummary = returningLiqDetail[0]
                  const cfg = LIQUIDITY_CONFIG[liqSummary.liquidity_status] ?? LIQUIDITY_CONFIG.no_data
                  return (
                    <div style={{ marginBottom: '24px' }}>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>LIKUIDITAS AGEN</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div style={{ padding: '10px 12px', backgroundColor: '#f9fafb', borderRadius: '8px', textAlign: 'center' }}>
                          <div style={{ fontSize: '14px', fontWeight: '700', color: '#111827' }}>{formatAmount(liqSummary.avg_daily_amount_14d)}</div>
                          <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>Avg Amount/Hari (14H)</div>
                        </div>
                        <div style={{ padding: '10px 12px', backgroundColor: cfg.bg, borderRadius: '8px', textAlign: 'center', border: `1px solid ${cfg.border}` }}>
                          <div style={{ fontSize: '14px', fontWeight: '700', color: cfg.color }}>{liqSummary.liquidity_ratio?.toFixed(2)}x</div>
                          <div style={{ fontSize: '10px', color: cfg.color, marginTop: '2px', opacity: 0.8 }}>{cfg.sublabel}</div>
                          <div style={{ marginTop: '4px' }}><LiquidityChip status={liqSummary.liquidity_status} /></div>
                        </div>
                      </div>
                    </div>
                  )
                })()}

                {/* 3. Grafik TRX */}
                {returningDetail.length > 0 && (
                  <div style={{ marginBottom: '24px' }}>
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


                {/* 5. Nominal Uang Beredar */}
                {returningLiqDetail.length > 0 && (() => {
                  const liqSummary = returningLiqDetail[0]
                  return (
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>NOMINAL UANG BEREDAR (14H)</div>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '70px' }}>
                        {(() => {
                          const maxAmount = Math.max(...returningLiqDetail.map(d => Number(d.daily_amount)), 1)
                          const avgAmount = liqSummary.avg_daily_amount_14d ?? 0
                          const sd = new Date(sinceDate)
                          return Array.from({ length: 14 }, (_, i) => {
                            const d = new Date(sd); d.setDate(sd.getDate() + i)
                            const dateStr = d.toISOString().split('T')[0]
                            const found = returningLiqDetail.find(a => a.transaction_date === dateStr)
                            const amount = found ? Number(found.daily_amount) : 0
                            const barColor = amount === 0 ? '#f3f4f6' : amount < avgAmount * 0.5 ? '#ef4444' : amount < avgAmount * 0.8 ? '#eab308' : '#22c55e'
                            return (
                              <div key={dateStr} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }} title={`${dateStr}: ${formatAmount(amount)}`}>
                                <div style={{ width: '100%', height: `${Math.max(3, (amount / maxAmount) * 56)}px`, backgroundColor: barColor, borderRadius: '2px 2px 0 0' }} />
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
                      <div style={{ marginTop: '6px', fontSize: '10px', color: '#9ca3af' }}>Avg: {formatAmount(liqSummary.avg_daily_amount_14d)}/hari</div>
                    </div>
                  )
                })()}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Drawer — Jagoan Bansos (SWIPE Champion) */}
      {selectedSwipeChampion && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}>
          <div onClick={() => setSelectedSwipeChampion(null)} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)' }} />
          <div style={{ position: 'relative', width: '480px', height: '100%', backgroundColor: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'sticky', top: 0, backgroundColor: '#fff', zIndex: 1 }}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: '800', color: '#111827', marginBottom: '4px' }}>{selectedSwipeChampion.merchant_name ?? selectedSwipeChampion.serial_number}</div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '6px' }}>{selectedSwipeChampion.serial_number}</div>
                <span style={{ padding: '2px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: '700', backgroundColor: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' }}>
                  🪪 Jagoan Bansos · {selectedSwipeChampion.swipe_count_14d.toLocaleString('id')} SWIPE (14H)
                </span>
              </div>
              <button onClick={() => setSelectedSwipeChampion(null)} style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#6b7280', fontSize: '18px', cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
            {loadingSwipeChampionDetail ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>Memuat data...</div>
            ) : (
              <div style={{ padding: '20px 24px' }}>

                {/* 1. Info Agen */}
                {swipeChampionDetail.length > 0 && (() => {
                  const latest = swipeChampionDetail[swipeChampionDetail.length - 1]
                  return (
                    <div style={{ marginBottom: '24px' }}>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>INFO AGEN</div>
                      {[
                        { label: 'Mitra', value: latest.mitra }, { label: 'PIC', value: latest.pic },
                        { label: 'Alamat', value: latest.alamat_struk }, { label: 'Brand', value: latest.brand },
                        { label: 'Mesin', value: latest.tipe_mesin }, { label: 'Aplikasi', value: latest.source_app },
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

                {/* 2. Ringkasan SWIPE */}
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>RINGKASAN 14 HARI</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                    {[
                      { label: 'SWIPE 14H', value: selectedSwipeChampion.swipe_count_14d.toLocaleString('id'), highlight: true },
                      { label: '% SWIPE', value: `${selectedSwipeChampion.pct_swipe}%` },
                      { label: 'Total TRX 14H', value: selectedSwipeChampion.total_trx_14d.toLocaleString('id') },
                      { label: 'Total Fee 14H', value: formatFee(selectedSwipeChampion.total_fee_14d) },
                    ].map(s => (
                      <div key={s.label} style={{ padding: '10px 12px', backgroundColor: (s as any).highlight ? '#fff7ed' : '#f9fafb', borderRadius: '8px', textAlign: 'center', border: (s as any).highlight ? '1px solid #fed7aa' : 'none' }}>
                        <div style={{ fontSize: '14px', fontWeight: '700', color: (s as any).highlight ? '#c2410c' : '#111827' }}>{s.value}</div>
                        <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 3. DIP vs SWIPE breakdown */}
                {swipeChampionDetail.length > 0 && (() => {
                  const totalDip   = swipeChampionDetail.reduce((s, d) => s + Number(d.dip_count), 0)
                  const totalSwipe = swipeChampionDetail.reduce((s, d) => s + Number(d.swipe_count), 0)
                  const total      = totalDip + totalSwipe
                  if (total === 0) return null
                  return (
                    <div style={{ marginBottom: '24px' }}>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>TIPE KARTU</div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <div style={{ flex: totalDip || 1, padding: '8px', borderRadius: '6px', backgroundColor: '#eff6ff', textAlign: 'center' }}>
                          <div style={{ fontSize: '16px', fontWeight: '700', color: '#1d4ed8' }}>{totalDip.toLocaleString('id')}</div>
                          <div style={{ fontSize: '10px', color: '#6b7280' }}>DIP (Chip)</div>
                          <div style={{ fontSize: '10px', color: '#9ca3af' }}>{Math.round(totalDip/total*100)}%</div>
                        </div>
                        <div style={{ flex: totalSwipe || 1, padding: '8px', borderRadius: '6px', backgroundColor: '#fff7ed', textAlign: 'center', border: '1px solid #fed7aa' }}>
                          <div style={{ fontSize: '16px', fontWeight: '700', color: '#c2410c' }}>{totalSwipe.toLocaleString('id')}</div>
                          <div style={{ fontSize: '10px', color: '#6b7280' }}>SWIPE (Bansos)</div>
                          <div style={{ fontSize: '10px', color: '#9ca3af' }}>{Math.round(totalSwipe/total*100)}%</div>
                        </div>
                      </div>
                    </div>
                  )
                })()}

                {/* 4. Likuiditas */}
                {swipeChampionLiqSummary && (() => {
                  const cfg = LIQUIDITY_CONFIG[swipeChampionLiqSummary.liquidity_status] ?? LIQUIDITY_CONFIG.no_data
                  return (
                    <div style={{ marginBottom: '24px' }}>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>LIKUIDITAS AGEN</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div style={{ padding: '10px 12px', backgroundColor: '#f9fafb', borderRadius: '8px', textAlign: 'center' }}>
                          <div style={{ fontSize: '14px', fontWeight: '700', color: '#111827' }}>{formatAmount(swipeChampionLiqSummary.avg_daily_amount_14d)}</div>
                          <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>Avg Amount/Hari (14H)</div>
                        </div>
                        <div style={{ padding: '10px 12px', backgroundColor: cfg.bg, borderRadius: '8px', textAlign: 'center', border: `1px solid ${cfg.border}` }}>
                          <div style={{ fontSize: '14px', fontWeight: '700', color: cfg.color }}>{swipeChampionLiqSummary.liquidity_ratio?.toFixed(2)}x</div>
                          <div style={{ fontSize: '10px', color: cfg.color, marginTop: '2px', opacity: 0.8 }}>{cfg.sublabel}</div>
                          <div style={{ marginTop: '4px' }}><LiquidityChip status={swipeChampionLiqSummary.liquidity_status} /></div>
                        </div>
                      </div>
                    </div>
                  )
                })()}

                {/* 5. Grafik TRX per hari */}
                {swipeChampionDetail.length > 0 && (
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>TRANSAKSI PER HARI (14H)</div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '80px' }}>
                      {(() => {
                        const maxTrx = Math.max(...swipeChampionDetail.map(d => Number(d.total_trx)), 1)
                        const sd = new Date(sinceDate)
                        return Array.from({ length: 14 }, (_, i) => {
                          const d = new Date(sd); d.setDate(sd.getDate() + i)
                          const dateStr = d.toISOString().split('T')[0]
                          const found = swipeChampionDetail.find(a => a.transaction_date === dateStr)
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
