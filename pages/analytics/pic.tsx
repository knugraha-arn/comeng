import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Layout from '../../components/Layout'
import { createBrowserClient } from '@supabase/ssr'

// ── Interfaces ────────────────────────────────────────────────
interface PicRow {
  pic: string
  mitra: string
  total_agents: number
  total_trx_14d: number
  total_fee_14d: number
  avg_trx_per_agent: number
  growing_count: number
  declining_count: number
  consistent_count: number
  growing_pct: number
  declining_pct: number
  health_score: number
}

interface RangerAgent {
  sn: string
  mer_name: string | null
  mtr: string | null
  act_days_14: number
  tot_trx_14: number
  tot_fee_14: number
  avg_trx_14: number
  avg_w1: number
  avg_w2: number
  trnd: string
  chg_pct: number
  bkt: string
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
  avg_daily_amount_mtd: number
  liquidity_ratio: number
  liquidity_status: 'kuat' | 'menurun' | 'lemah' | 'no_data'
}

// ── Constants ─────────────────────────────────────────────────
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

const LIQUIDITY_CONFIG = {
  kuat:    { label: 'Kuat',    color: '#166534', bg: '#dcfce7', border: '#bbf7d0', sublabel: 'Float kemungkinan aman' },
  menurun: { label: 'Menurun', color: '#92400e', bg: '#fef9c3', border: '#fde68a', sublabel: 'Perlu perhatian' },
  lemah:   { label: 'Lemah',   color: '#dc2626', bg: '#fee2e2', border: '#fecaca', sublabel: 'Kemungkinan float menipis' },
  no_data: { label: '—',       color: '#9ca3af', bg: '#f9fafb', border: '#e5e7eb', sublabel: 'Data tidak cukup' },
}

const RANGER_MITRAS = ['arranet', 'ex dinar', 'ex ssdi']
const PAGE_SIZE = 25
const SKELETON_STYLE = `@keyframes shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }`

// ── Helpers ───────────────────────────────────────────────────
function Skeleton({ width, height = 14, radius = 6 }: { width: string | number, height?: number, radius?: number }) {
  return <div style={{ width, height, borderRadius: radius, background: 'linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite' }} />
}

function formatFee(val: number): string {
  if (val >= 1000000000) return `Rp ${(val / 1000000000).toFixed(2)}M`
  if (val >= 1000000) return `Rp ${(val / 1000000).toFixed(1)}jt`
  if (val >= 1000) return `Rp ${(val / 1000).toFixed(0)}rb`
  return `Rp ${val}`
}

function formatAmount(val: number): string {
  if (val >= 1000000000) return `${(val / 1000000000).toFixed(1)}M`
  if (val >= 1000000) return `${(val / 1000000).toFixed(1)}jt`
  if (val >= 1000) return `${(val / 1000).toFixed(0)}rb`
  return String(val)
}

function formatNum(val: number): string { return val.toLocaleString('id') }

function isRangerMitra(mitra: string | null): boolean {
  if (!mitra) return false
  return RANGER_MITRAS.some(m => mitra.toLowerCase().includes(m))
}

function HealthBar({ score }: { score: number }) {
  const color = score >= 65 ? '#166534' : score >= 50 ? '#ca8a04' : '#dc2626'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div style={{ flex: 1, height: '4px', backgroundColor: '#f3f4f6', borderRadius: '99px', overflow: 'hidden' }}>
        <div style={{ width: `${score}%`, height: '100%', backgroundColor: color, borderRadius: '99px' }} />
      </div>
      <span style={{ fontSize: '11px', fontWeight: '700', color, minWidth: '28px', textAlign: 'right' }}>{score}</span>
    </div>
  )
}

function TrendChip({ trend }: { trend: string }) {
  const cfg = TREND_CONFIG[trend as keyof typeof TREND_CONFIG] ?? TREND_CONFIG.consistent
  return <span style={{ padding: '1px 7px', borderRadius: '99px', fontSize: '10px', fontWeight: '700', backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>{cfg.icon} {cfg.label}</span>
}

function BucketChip({ b }: { b: string }) {
  const cfg = BUCKET_CONFIG[b] ?? BUCKET_CONFIG.sporadic
  return <span style={{ padding: '1px 7px', borderRadius: '99px', fontSize: '10px', fontWeight: '700', backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>{cfg.label}</span>
}

function LiquidityChip({ status }: { status: string }) {
  const cfg = LIQUIDITY_CONFIG[status as keyof typeof LIQUIDITY_CONFIG] ?? LIQUIDITY_CONFIG.no_data
  return <span style={{ padding: '1px 7px', borderRadius: '99px', fontSize: '10px', fontWeight: '700', backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>{cfg.label}</span>
}

function exportCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// ── Main Component ────────────────────────────────────────────
export default function PicPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Tab state — 'semua' | 'ranger' | 'ranger_detail'
  const [activeTab, setActiveTab] = useState<'semua' | 'ranger' | 'ranger_detail'>('semua')
  const [selectedRanger, setSelectedRanger] = useState<PicRow | null>(null)

  // Semua PIC tab
  const [pics, setPics]               = useState<PicRow[]>([])
  const [loading, setLoading]         = useState(true)
  const [totalCount, setTotalCount]   = useState(0)
  const [page, setPage]               = useState(0)
  const [filterMitra, setFilterMitra] = useState('')
  const [search, setSearch]           = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [mitras, setMitras]           = useState<string[]>([])
  const [exporting, setExporting]     = useState(false)

  // Ranger tab
  const [rangers, setRangers]             = useState<PicRow[]>([])
  const [loadingRangers, setLoadingRangers] = useState(false)
  const [rangerSearch, setRangerSearch]   = useState('')
  const [rangerSearchInput, setRangerSearchInput] = useState('')
  const [allRangers, setAllRangers]           = useState<PicRow[]>([])
  const [rangerCluster, setRangerCluster]     = useState<string>('semua')
  const [rangerSortBy, setRangerSortBy]       = useState<string>('fee_per_agent')
  const [rangerPage, setRangerPage]           = useState(0)
  const [rangerTotal, setRangerTotal]     = useState(0)

  // Ranger Detail tab
  const [rangerAgentFilter, setRangerAgentFilter] = useState<string>('semua')
  const [rangerAgents, setRangerAgents]         = useState<RangerAgent[]>([])
  const [allRangerAgents, setAllRangerAgents]   = useState<RangerAgent[]>([])
  const [loadingRangerAgents, setLoadingRangerAgents] = useState(false)
  const [rangerAgentPage, setRangerAgentPage]   = useState(0)
  const [rangerAgentTotal, setRangerAgentTotal] = useState(0)

  // Agent Drawer (reuse dari hidden-gem)
  const [selectedAgent, setSelectedAgent]   = useState<RangerAgent | null>(null)
  const [agentDetail, setAgentDetail]       = useState<AgentDayDetail[]>([])
  const [liquiditySummary, setLiquiditySummary] = useState<AgentLiquidityDetail | null>(null)
  const [liquidityDetail, setLiquidityDetail]   = useState<AgentLiquidityDetail[]>([])
  const [loadingDrawer, setLoadingDrawer]   = useState(false)
  const [sinceDate, setSinceDate]           = useState('')
  const [lastDate, setLastDate]             = useState('')

  const [lastTrxDate, setLastTrxDate]       = useState<string | null>(null)
  const [sinceTrxDate, setSinceTrxDate]     = useState<string | null>(null)
  const [totalDays, setTotalDays]           = useState<number>(14)
  const [rangerComparison, setRangerComparison] = useState<{ranger: any, nonRanger: any} | null>(null)
  const [tooltip, setTooltip] = useState<{ text: string, x: number, y: number } | null>(null)
  const debounceRef    = useRef<NodeJS.Timeout>()
  const debounceRgRef  = useRef<NodeJS.Timeout>()

  // ── Init ────────────────────────────────────────────────────
  useEffect(() => { initPage() }, [])

  async function initPage() {
    setLoading(true)
    try {
      const [filterRes] = await Promise.all([supabase.rpc('get_pic_filter_options')])
      if (filterRes.data?.[0]) setMitras(filterRes.data[0].mitras ?? [])

      // Get date range
      const { data: prog } = await supabase.rpc('get_monthly_progress')
      const progData = Array.isArray(prog) ? prog[0] : prog
      if (progData) {
        setSinceDate(progData.end_date ? new Date(new Date(progData.end_date).getTime() - 13 * 86400000).toISOString().split('T')[0] : '')
        setLastDate(progData.end_date ?? '')
      }
      await loadPics(0, '', '')

      // Set tanggal dari MAX(transaction_date)
      if (progData?.end_date) {
        const MONTHS_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']
        const [ey, em, ed] = (progData.end_date as string).split('-')
        const endStr = `${parseInt(ed)} ${MONTHS_ID[parseInt(em)-1]} ${ey}`
        const startDate = new Date(new Date(progData.end_date).getTime() - 13 * 86400000)
        const [sy, sm, sd2] = startDate.toISOString().split('T')[0].split('-')
        const startStr = `${parseInt(sd2)} ${MONTHS_ID[parseInt(sm)-1]} ${sy}`
        setLastTrxDate(endStr)
        setSinceTrxDate(startStr)
        setTotalDays(14)
      }
    } finally { setLoading(false) }
  }

  // ── Semua PIC ───────────────────────────────────────────────
  async function loadPics(newPage: number, mitra: string, srch: string) {
    setLoading(true)
    try {
      const [dataRes, countRes] = await Promise.all([
        supabase.rpc('get_pic_list', { p_mitra: mitra, p_search: srch, p_limit: PAGE_SIZE, p_offset: newPage * PAGE_SIZE }),
        supabase.rpc('get_pic_list_count', { p_mitra: mitra, p_search: srch }),
      ])
      setPics(dataRes.data ?? [])
      setTotalCount(Number(countRes.data ?? 0))
    } finally { setLoading(false) }
  }

  function handleSearchInput(val: string) {
    setSearchInput(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setSearch(val); setPage(0)
      await loadPics(0, filterMitra, val)
    }, 400)
  }

  async function handleMitraChange(mitra: string) {
    setFilterMitra(mitra); setPage(0)
    await loadPics(0, mitra, search)
  }

  async function handleReset() {
    setFilterMitra(''); setSearch(''); setSearchInput(''); setPage(0)
    await loadPics(0, '', '')
  }

  async function handleExport() {
    setExporting(true)
    try {
      const { data } = await supabase.rpc('get_pic_list', { p_mitra: filterMitra, p_search: search, p_limit: 9999, p_offset: 0 })
      const rows = (data ?? []).map((p: PicRow) => [p.pic, p.mitra, p.total_agents, p.total_trx_14d, p.total_fee_14d, p.avg_trx_per_agent, p.growing_count, p.growing_pct, p.declining_count, p.declining_pct, p.health_score])
      exportCSV(`kekuatan_pic_${new Date().toISOString().split('T')[0]}.csv`, ['PIC','Mitra','Agen','TRX 14H','Fee 14H','TRX/Agen','Growing','Growing %','Declining','Declining %','Health Score'], rows)
    } finally { setExporting(false) }
  }

  // ── Ranger Tab ──────────────────────────────────────────────
  async function loadRangers(newPage: number, srch: string) {
    setLoadingRangers(true)
    try {
      const [listRes, compRes] = await Promise.all([
        supabase.rpc('get_ranger_list'),
        supabase.rpc('get_ranger_vs_nonranger_comparison'),
      ])
      const data = listRes.data
      if (compRes.data) {
        const ranger    = compRes.data.find((r: any) => r.kelompok === 'Ranger')
        const nonRanger = compRes.data.find((r: any) => r.kelompok === 'Non-Ranger')
        setRangerComparison({ ranger, nonRanger })
      }
      let all: PicRow[] = (data ?? []).map((r: any) => ({
        pic:               r.ranger_name,
        mitra:             r.mitras?.join(', ') ?? '',
        total_agents:      r.total_agents,
        total_trx_14d:     r.total_trx_14d,
        total_fee_14d:     r.total_fee_14d,
        avg_trx_per_agent: r.avg_trx_per_agent,
        growing_count:     r.growing_count,
        declining_count:   r.declining_count,
        consistent_count:  r.consistent_count,
        growing_pct:       r.growing_pct,
        declining_pct:     r.declining_pct,
        health_score:      r.health_score,
        fee_per_agent:     r.total_agents > 0 ? Math.round(r.total_fee_14d / r.total_agents) : 0,
      }))
      if (srch) all = all.filter(r => r.pic.toLowerCase().includes(srch.toLowerCase()))
      // Sort by fee_per_agent default
      all.sort((a, b) => (b as any).fee_per_agent - (a as any).fee_per_agent)
      setAllRangers(all)
      setRangerTotal(all.length)
      setRangers(all.slice(newPage * PAGE_SIZE, (newPage + 1) * PAGE_SIZE))
    } finally { setLoadingRangers(false) }
  }

  function handleRangerSearchInput(val: string) {
    setRangerSearchInput(val)
    if (debounceRgRef.current) clearTimeout(debounceRgRef.current)
    debounceRgRef.current = setTimeout(() => {
      setRangerSearch(val)
      setRangerPage(0)
      setRangerCluster('semua')
    }, 300)
  }

  // ── Ranger Detail Tab ────────────────────────────────────────
  async function openRangerDetail(ranger: PicRow) {
    setSelectedRanger(ranger)
    setActiveTab('ranger_detail')
    setRangerAgentPage(0)
    setRangerAgentFilter('semua')
    setAllRangerAgents([])
    await loadRangerAgents(ranger.pic, 0)
  }

  async function loadRangerAgents(pic: string, newPage: number) {
    setLoadingRangerAgents(true)
    try {
      const [dataRes, allRes, countRes] = await Promise.all([
        supabase.rpc('get_ranger_agents', { p_pic: pic, p_limit: PAGE_SIZE, p_offset: newPage * PAGE_SIZE }),
        supabase.rpc('get_ranger_agents', { p_pic: pic, p_limit: 9999, p_offset: 0 }),
        supabase.rpc('get_ranger_agents_count', { p_pic: pic }),
      ])
      setRangerAgents(dataRes.data ?? [])
      setAllRangerAgents(allRes.data ?? [])
      setRangerAgentTotal(Number(countRes.data ?? 0))
    } finally { setLoadingRangerAgents(false) }
  }

  async function loadRangerAgentsPage(pic: string, newPage: number) {
    setLoadingRangerAgents(true)
    try {
      const { data } = await supabase.rpc('get_ranger_agents', { p_pic: pic, p_limit: PAGE_SIZE, p_offset: newPage * PAGE_SIZE })
      setRangerAgents(data ?? [])
    } finally { setLoadingRangerAgents(false) }
  }

  // ── Agent Drawer ─────────────────────────────────────────────
  async function openAgentDrawer(agent: RangerAgent) {
    setSelectedAgent(agent)
    setAgentDetail([]); setLiquiditySummary(null); setLiquidityDetail([])
    setLoadingDrawer(true)
    try {
      // Selalu fetch date terbaru langsung dari DB
      const { data: maxDateData } = await supabase
        .from('am_transactions')
        .select('transaction_date')
        .order('transaction_date', { ascending: false })
        .limit(1)
        .single()

      const last  = maxDateData?.transaction_date
        ? new Date(maxDateData.transaction_date).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0]
      const since = new Date(new Date(last).getTime() - 13 * 86400000).toISOString().split('T')[0]

      setSinceDate(since)
      setLastDate(last)

      const [detailRes, liqRes] = await Promise.all([
        supabase.rpc('get_agent_detail', { p_serial: agent.sn, p_since: since, p_until: last }),
        supabase.rpc('get_agent_liquidity_summary', { p_serial: agent.sn }),
      ])
      setAgentDetail(detailRes.data ?? [])
      const liqData = liqRes.data ?? []
      if (liqData.length > 0) {
        setLiquiditySummary(liqData[0])
        setLiquidityDetail(liqData)
      }
    } finally { setLoadingDrawer(false) }
  }

  const tip = (text: string) => ({
    onMouseEnter: (e: React.MouseEvent) => setTooltip({ text, x: e.clientX, y: e.clientY }),
    onMouseMove:  (e: React.MouseEvent) => setTooltip({ text, x: e.clientX, y: e.clientY }),
    onMouseLeave: () => setTooltip(null),
  })

  const totalPages       = Math.ceil(totalCount / PAGE_SIZE)
  const rangerTotalPages = Math.ceil(rangerTotal / PAGE_SIZE)
  const agentTotalPages  = Math.ceil(rangerAgentTotal / PAGE_SIZE)

  // ── PIC Table (reusable) ─────────────────────────────────────
  function PicTable({ data, isLoading, onRowClick }: { data: PicRow[], isLoading: boolean, onRowClick?: (p: PicRow) => void }) {
    return isLoading ? (
      <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
        {[1,2,3,4,5].map(i => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 150px 60px 90px 110px 90px 70px 70px 80px', padding: '13px 16px', borderBottom: '1px solid #f3f4f6', gap: '12px', alignItems: 'center' }}>
            <Skeleton width={140} height={13} />
            {[120,40,70,90,70,55,55,70].map((w, j) => <Skeleton key={j} width={w} height={12} />)}
          </div>
        ))}
      </div>
    ) : data.length > 0 ? (
      <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px 60px 90px 110px 90px 70px 70px 80px', padding: '10px 16px', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '10px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.05em', gap: '12px' }}>
          <div>PIC</div>
          <div>MITRA</div>
          <div style={{ textAlign: 'right' }}>AGEN</div>
          <div style={{ textAlign: 'right' }}>TRX (14H)</div>
          <div style={{ textAlign: 'right' }}>FEE (14H)</div>
          <div style={{ textAlign: 'right' }}><span {...tip('Rata-rata TRX per agen dalam 14H.')}>TRX/AGEN ⓘ</span></div>
          <div style={{ textAlign: 'right' }}><span {...tip('% agen growing — W2 (8–14) > 120% vs W1 (1–7).')}>GROWING ⓘ</span></div>
          <div style={{ textAlign: 'right' }}><span {...tip('% agen declining — W2 (8–14) < 80% vs W1 (1–7).')}>DECLINING ⓘ</span></div>
          <div><span {...tip('Composite score 0–100.')}>HEALTH ⓘ</span></div>
        </div>
        {data.map((p, i) => (
          <div key={p.pic} onClick={() => onRowClick?.(p)}
            style={{ display: 'grid', gridTemplateColumns: '1fr 150px 60px 90px 110px 90px 70px 70px 80px', padding: '11px 16px', borderBottom: i < data.length - 1 ? '1px solid #f3f4f6' : 'none', alignItems: 'center', backgroundColor: '#fff', cursor: onRowClick ? 'pointer' : 'default', gap: '12px' }}
            onMouseEnter={e => { if (onRowClick) e.currentTarget.style.backgroundColor = '#f9fafb' }}
            onMouseLeave={e => { if (onRowClick) e.currentTarget.style.backgroundColor = '#fff' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.pic}</div>
            <div style={{ fontSize: '11px', color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.mitra}</div>
            <div style={{ fontSize: '12px', color: '#374151', textAlign: 'right' }}>{formatNum(p.total_agents)}</div>
            <div style={{ fontSize: '12px', color: '#374151', textAlign: 'right' }}>{formatNum(p.total_trx_14d)}</div>
            <div style={{ fontSize: '12px', fontWeight: '600', color: '#111827', textAlign: 'right' }}>{formatFee(p.total_fee_14d)}</div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '12px', fontWeight: '700', color: p.avg_trx_per_agent >= 80 ? '#166534' : p.avg_trx_per_agent >= 40 ? '#374151' : '#dc2626' }}>{p.avg_trx_per_agent}</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '12px', fontWeight: '600', color: p.growing_pct >= 10 ? '#166534' : '#374151' }}>{p.growing_pct}%</span>
              <div style={{ fontSize: '10px', color: '#9ca3af' }}>{formatNum(p.growing_count)} agen</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '12px', fontWeight: '600', color: p.declining_pct > 20 ? '#dc2626' : p.declining_pct > 10 ? '#ca8a04' : '#374151' }}>{p.declining_pct}%</span>
              <div style={{ fontSize: '10px', color: '#9ca3af' }}>{formatNum(p.declining_count)} agen</div>
            </div>
            <div><HealthBar score={p.health_score} /></div>
          </div>
        ))}
      </div>
    ) : (
      <div style={{ textAlign: 'center', padding: '60px', backgroundColor: '#f9fafb', borderRadius: '10px', border: '1px dashed #e5e7eb', color: '#9ca3af', fontSize: '13px' }}>
        Tidak ada PIC ditemukan
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────
  return (
    <Layout>
      <style>{SKELETON_STYLE}</style>
      <Head><title>Kekuatan PIC — AMARIS</title></Head>

      {tooltip && (
        <div style={{ position: 'fixed', left: Math.min(tooltip.x + 12, window.innerWidth - 260), top: tooltip.y - 8, zIndex: 9999, backgroundColor: '#1f2937', color: '#f9fafb', fontSize: '11px', padding: '8px 12px', borderRadius: '8px', maxWidth: '240px', lineHeight: '1.5', pointerEvents: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
          {tooltip.text}
        </div>
      )}

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}>

        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '11px', fontWeight: '600', color: '#9ca3af', letterSpacing: '0.1em', marginBottom: '4px' }}>ANALITIK JARINGAN</div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#111827', margin: 0, letterSpacing: '-0.02em' }}>👤 Kekuatan PIC</h1>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: '1px solid #e5e7eb', paddingBottom: '0' }}>
          {[
            { key: 'semua',         label: 'Semua PIC' },
            { key: 'ranger',        label: '⚡ Ranger' },
            { key: 'ranger_detail', label: selectedRanger ? `📋 ${selectedRanger.pic}` : '📋 Detail Ranger', disabled: !selectedRanger },
          ].map(tab => (
            <button key={tab.key}
              onClick={() => {
                if (tab.disabled) return
                setActiveTab(tab.key as any)
                if (tab.key === 'ranger' && rangers.length === 0) loadRangers(0, '')
              }}
              disabled={tab.disabled}
              style={{
                padding: '8px 16px', fontSize: '13px', fontWeight: '600', cursor: tab.disabled ? 'not-allowed' : 'pointer',
                border: 'none', borderBottom: activeTab === tab.key ? '2px solid #0344D8' : '2px solid transparent',
                backgroundColor: 'transparent', color: tab.disabled ? '#d1d5db' : activeTab === tab.key ? '#0344D8' : '#6b7280',
                marginBottom: '-1px', transition: 'all 0.15s',
              }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Date info strip */}
        {lastTrxDate && (
          <div style={{ marginBottom: '16px', padding: '8px 14px', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: '#6b7280' }}>
            <span>📅</span>
            <span>Data transaksi <strong style={{ color: '#374151' }}>{totalDays} hari</strong> dari tanggal <strong style={{ color: '#374151' }}>{sinceTrxDate}</strong> sampai <strong style={{ color: '#374151' }}>{lastTrxDate}</strong></span>
          </div>
        )}

        {/* ── TAB 1: Semua PIC ── */}
        {activeTab === 'semua' && (
          <>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
              <input type="text" value={searchInput} onChange={e => handleSearchInput(e.target.value)} placeholder="Cari nama PIC..."
                style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px', color: '#374151', width: '200px', outline: 'none' }} />
              <select value={filterMitra} onChange={e => handleMitraChange(e.target.value)}
                style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px', color: '#374151', backgroundColor: '#fff', cursor: 'pointer' }}>
                <option value="">Semua Mitra</option>
                {mitras.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              {(filterMitra || search) && (
                <button onClick={handleReset} style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#6b7280', fontSize: '12px', cursor: 'pointer' }}>✕ Reset</button>
              )}
              <span style={{ marginLeft: 'auto', fontSize: '13px', color: '#6b7280' }}>{loading ? 'Memuat...' : `${formatNum(totalCount)} PIC`}</span>
              <button onClick={handleExport} disabled={exporting || loading}
                style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: exporting ? '#9ca3af' : '#374151', fontSize: '12px', cursor: exporting ? 'not-allowed' : 'pointer' }}>
                {exporting ? '⏳' : '⬇'} Export CSV
              </button>
            </div>
            <PicTable data={pics} isLoading={loading} />
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', alignItems: 'center', marginTop: '16px' }}>
                <button onClick={() => { setPage(p => Math.max(0, p - 1)); loadPics(Math.max(0, page - 1), filterMitra, search) }} disabled={page === 0}
                  style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: page === 0 ? '#d1d5db' : '#374151', fontSize: '13px', cursor: page === 0 ? 'not-allowed' : 'pointer' }}>← Prev</button>
                <span style={{ fontSize: '13px', color: '#6b7280' }}>{page + 1} / {totalPages}</span>
                <button onClick={() => { setPage(p => Math.min(totalPages - 1, p + 1)); loadPics(Math.min(totalPages - 1, page + 1), filterMitra, search) }} disabled={page >= totalPages - 1}
                  style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: page >= totalPages - 1 ? '#d1d5db' : '#374151', fontSize: '13px', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer' }}>Next →</button>
              </div>
            )}
          </>
        )}

        {/* ── TAB 2: Ranger ── */}
        {activeTab === 'ranger' && (
          <>
            {/* Summary Cards */}
            {/* Ranger vs Non-Ranger Comparison */}
            {rangerComparison && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
                {[
                  { label: 'Jaringan Ranger', icon: '⚡', data: rangerComparison.ranger,    color: '#0344D8', bg: '#eff6ff', border: '#bfdbfe',
                    tip: 'Performa agregat seluruh Ranger — PIC dari mitra ARRANET, ARRANET ex Dinar, dan ARRANET ex SSDI dalam 14 hari terakhir.' },
                  { label: 'Non-Ranger',       icon: '👤', data: rangerComparison.nonRanger, color: '#374151', bg: '#f9fafb', border: '#e5e7eb',
                    tip: 'Performa agregat PIC dari mitra selain Arranet dalam 14 hari terakhir. Bersifat indikatif — karakteristik mitra berbeda sehingga tidak apple-to-apple.' },
                ].map(s => (
                  <div key={s.label} {...tip(s.tip)} style={{ backgroundColor: s.bg, border: `1px solid ${s.border}`, borderRadius: '10px', padding: '14px 20px', display: 'grid', gridTemplateColumns: '180px 1fr 1fr 1fr 1fr', alignItems: 'center', gap: '0', cursor: 'default' }}>
                    <div style={{ fontSize: '13px', fontWeight: '800', color: s.color }}>{s.icon} {s.label}</div>
                    {[
                      { label: 'Jumlah PIC',      value: formatNum(s.data?.jumlah_pic ?? 0),      tip2: 'Jumlah PIC unik aktif dalam 14 hari terakhir.' },
                      { label: 'Total Agen (14H)', value: formatNum(s.data?.total_agen ?? 0),       tip2: 'Jumlah agen unik yang dikelola dalam 14 hari terakhir.' },
                      { label: 'Fee (14H)',         value: formatFee(s.data?.total_fee ?? 0),        tip2: 'Total fee yang dihasilkan seluruh agen dalam 14 hari terakhir.' },
                      { label: 'Avg Fee/Agen (14H)',value: formatFee(s.data?.avg_fee_per_agen ?? 0), tip2: 'Rata-rata fee per agen dalam 14 hari terakhir. Indikator efisiensi coaching — semakin tinggi, agen semakin produktif.', highlight: true },
                    ].map(m => (
                      <div key={m.label} {...tip(m.tip2)} style={{ textAlign: 'center', borderLeft: '1px solid rgba(0,0,0,0.06)', padding: '0 16px', cursor: 'default' }}>
                        <div style={{ fontSize: '16px', fontWeight: '800', color: (m as any).highlight ? s.color : '#111827' }}>{m.value}</div>
                        <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>{m.label}</div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* Cluster chips + search + export */}
            {!loadingRangers && allRangers.length > 0 && (() => {
              // Pisahkan: <20 agen = "Tidak Tumbuh", sisanya di-cluster 4 tier
              const THRESHOLD_AGEN = 20
              const tidakTumbuh = allRangers.filter(r => r.total_agents <= THRESHOLD_AGEN)
              const qualified   = allRangers.filter(r => r.total_agents > THRESHOLD_AGEN)

              const sortedQ = [...qualified].sort((a, b) => (b as any).fee_per_agent - (a as any).fee_per_agent)
              const nQ = sortedQ.length
              const getCluster = (r: any) => {
                if (r.total_agents <= THRESHOLD_AGEN) return 'tidak_tumbuh'
                const rank = sortedQ.findIndex(s => s.pic === r.pic) / Math.max(nQ, 1)
                if (rank < 0.25) return 'elite'
                if (rank < 0.5)  return 'solid'
                if (rank < 0.75) return 'average'
                return 'perhatian'
              }
              const clusterCount = { elite: 0, solid: 0, average: 0, perhatian: 0, tidak_tumbuh: 0 }
              allRangers.forEach(r => { clusterCount[getCluster(r) as keyof typeof clusterCount]++ })

              const CLUSTERS = [
                { key: 'semua',        label: 'Semua',              icon: '📋', count: allRangers.length,          activeBg: '#1e40af', activeColor: '#fff',     activeBorder: '#1e40af', tip: 'Semua Ranger tanpa filter.' },
                { key: 'elite',        label: 'Elite',              icon: '🏆', count: clusterCount.elite,         activeBg: '#dcfce7', activeColor: '#166534',  activeBorder: '#bbf7d0', tip: 'Ranger dengan Fee per Agen tertinggi dibanding sesama Ranger Arranet yang mengelola lebih dari 20 agen. Artinya rata-rata setiap agen yang dikelola menghasilkan fee paling besar di antara seluruh Ranger.' },
                { key: 'solid',        label: 'Solid',              icon: '⭐', count: clusterCount.solid,         activeBg: '#d1fae5', activeColor: '#065f46',  activeBorder: '#6ee7b7', tip: 'Ranger dengan Fee per Agen di atas rata-rata sesama Ranger Arranet. Agen-agennya lebih produktif dari mayoritas Ranger lain.' },
                { key: 'average',      label: 'Average',            icon: '📊', count: clusterCount.average,       activeBg: '#eff6ff', activeColor: '#1e40af',  activeBorder: '#bfdbfe', tip: 'Ranger dengan Fee per Agen setara rata-rata sesama Ranger Arranet. Tidak terlalu tinggi, tidak terlalu rendah — ada ruang untuk improvement dengan coaching yang tepat.' },
                { key: 'perhatian',    label: 'Perlu Perhatian',    icon: '⚠️', count: clusterCount.perhatian,    activeBg: '#fee2e2', activeColor: '#dc2626',  activeBorder: '#fecaca', tip: 'Ranger dengan Fee per Agen terendah dibanding sesama Ranger Arranet yang memiliki lebih dari 20 agen. Agen-agennya rata-rata kurang produktif — perlu evaluasi coaching. Ini perbandingan relatif, bukan nilai absolut.' },
                { key: 'tidak_tumbuh', label: 'Ranger Tidak Tumbuh',icon: '🌱', count: clusterCount.tidak_tumbuh, activeBg: '#f5f3ff', activeColor: '#6b21a8',  activeBorder: '#e9d5ff', tip: 'Ranger dengan 20 agen atau kurang dalam 14 hari terakhir. Belum cukup data untuk dibandingkan secara adil dengan Ranger lain. Fokus utama: tambah jumlah agen aktif terlebih dahulu.' },
              ]

              // Filter + sort allRangers
              let filtered = allRangers
              if (rangerSearch) filtered = filtered.filter(r => r.pic.toLowerCase().includes(rangerSearch.toLowerCase()))
              if (rangerCluster !== 'semua') filtered = filtered.filter(r => getCluster(r) === rangerCluster)
              filtered = [...filtered].sort((a, b) => (b as any).fee_per_agent - (a as any).fee_per_agent)
              const paged = filtered.slice(rangerPage * PAGE_SIZE, (rangerPage + 1) * PAGE_SIZE)
              const totalPages = Math.ceil(filtered.length / PAGE_SIZE)

              const handleExportRangers = () => {
                const rows = filtered.map(r => [
                  r.pic, r.mitra, r.total_agents, r.total_trx_14d, r.total_fee_14d,
                  (r as any).fee_per_agent, r.avg_trx_per_agent,
                  r.growing_count, r.growing_pct, r.declining_count, r.declining_pct,
                  r.health_score, getCluster(r)
                ])
                exportCSV(`ranger_${new Date().toISOString().split('T')[0]}.csv`,
                  ['Ranger','Mitra','Agen','TRX 14H','Fee 14H','Fee/Agen','TRX/Agen','Growing','Growing %','Declining','Declining %','Health Score','Cluster'],
                  rows)
              }

              return (
                <>
                  {/* Cluster chips */}
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
                    {CLUSTERS.map(c => {
                      const isActive = rangerCluster === c.key
                      return (
                        <button key={c.key} onClick={() => { setRangerCluster(c.key); setRangerPage(0) }}
                          {...tip(c.tip)}
                          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '99px', border: `1px solid ${isActive ? c.activeBorder : '#e5e7eb'}`, backgroundColor: isActive ? c.activeBg : '#f9fafb', color: isActive ? c.activeColor : '#374151', fontSize: '12px', fontWeight: '600', cursor: 'pointer', transition: 'all 0.15s' }}>
                          <span>{c.icon} {c.label}</span>
                          <span style={{ backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: '99px', padding: '1px 7px', fontSize: '11px', fontWeight: '700' }}>{c.count}</span>
                        </button>
                      )
                    })}
                  </div>

                  {/* Search + count + export */}
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', alignItems: 'center' }}>
                    <input type="text" value={rangerSearchInput} onChange={e => handleRangerSearchInput(e.target.value)} placeholder="Cari nama Ranger..."
                      style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px', color: '#374151', width: '200px', outline: 'none' }} />
                    <span {...tip('Sort berdasarkan Fee per Agen — indikator efisiensi Ranger menghasilkan pendapatan dari setiap agen yang dikelola.')}
                      style={{ fontSize: '11px', color: '#9ca3af', cursor: 'default' }}>Sort: Fee/Agen ↓ ⓘ</span>
                    <span style={{ marginLeft: 'auto', fontSize: '13px', color: '#6b7280' }}>{formatNum(filtered.length)} Ranger</span>
                    <button onClick={handleExportRangers}
                      style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#374151', fontSize: '12px', cursor: 'pointer' }}>
                      ⬇ Export CSV
                    </button>
                  </div>

                  {/* Table — add Fee/Agen column */}
                  {loadingRangers ? (
                    <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
                      {[1,2,3].map(i => <div key={i} style={{ padding: '13px 16px', borderBottom: '1px solid #f3f4f6' }}><Skeleton width="100%" height={13} /></div>)}
                    </div>
                  ) : paged.length > 0 ? (
                    <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 60px 90px 110px 100px 80px 80px', padding: '10px 16px', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '10px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.05em', gap: '12px' }}>
                        <div>RANGER</div>
                        <div>MITRA</div>
                        <div style={{ textAlign: 'right' }}>AGEN</div>
                        <div style={{ textAlign: 'right' }}>TRX (14H)</div>
                        <div style={{ textAlign: 'right' }}>FEE (14H)</div>
                        <div style={{ textAlign: 'right' }}><span {...tip('Fee per Agen = Total Fee 14H ÷ Jumlah Agen. Indikator efisiensi Ranger — lebih tinggi = lebih efisien menghasilkan pendapatan.')}>FEE/AGEN ⓘ</span></div>
                        <div style={{ textAlign: 'right' }}><span {...tip('Rata-rata transaksi per agen dalam 14 hari terakhir. Proxy kualitas coaching.')}>TRX/AGEN ⓘ</span></div>
                        <div><span {...tip('Composite score 0–100 berdasarkan % Productive, % Growing, % rendah Declining.')}>HEALTH ⓘ</span></div>
                      </div>
                      {paged.map((r, i) => {
                        const cluster = getCluster(r)
                        const clusterCfg = CLUSTERS.find(c => c.key === cluster)!
                        return (
                          <div key={r.pic} onClick={() => openRangerDetail(r)}
                            style={{ display: 'grid', gridTemplateColumns: '1fr 140px 60px 90px 110px 100px 80px 80px', padding: '11px 16px', borderBottom: i < paged.length - 1 ? '1px solid #f3f4f6' : 'none', alignItems: 'center', backgroundColor: '#fff', cursor: 'pointer', gap: '12px' }}
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#fff'}>
                            <div>
                              <div style={{ fontSize: '13px', fontWeight: '600', color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.pic}</div>
                              <span style={{ padding: '1px 6px', borderRadius: '99px', fontSize: '9px', fontWeight: '700', backgroundColor: clusterCfg.activeBg, color: clusterCfg.activeColor, border: `1px solid ${clusterCfg.activeBorder}` }}>{clusterCfg.icon} {clusterCfg.label}</span>
                            </div>
                            <div style={{ fontSize: '11px', color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.mitra}</div>
                            <div style={{ fontSize: '12px', color: '#374151', textAlign: 'right' }}>{formatNum(r.total_agents)}</div>
                            <div style={{ fontSize: '12px', color: '#374151', textAlign: 'right' }}>{formatNum(r.total_trx_14d)}</div>
                            <div style={{ fontSize: '12px', fontWeight: '600', color: '#111827', textAlign: 'right' }}>{formatFee(r.total_fee_14d)}</div>
                            <div style={{ textAlign: 'right' }}>
                              <span style={{ fontSize: '13px', fontWeight: '800', color: clusterCfg.activeColor }}>{formatFee((r as any).fee_per_agent)}</span>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <span style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>{r.avg_trx_per_agent}</span>
                            </div>
                            <div><HealthBar score={r.health_score} /></div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '40px', backgroundColor: '#f9fafb', borderRadius: '10px', border: '1px dashed #e5e7eb', color: '#9ca3af', fontSize: '13px' }}>Tidak ada Ranger</div>
                  )}

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', alignItems: 'center', marginTop: '16px' }}>
                      <button onClick={() => setRangerPage(p => Math.max(0, p - 1))} disabled={rangerPage === 0}
                        style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: rangerPage === 0 ? '#d1d5db' : '#374151', fontSize: '13px', cursor: rangerPage === 0 ? 'not-allowed' : 'pointer' }}>← Prev</button>
                      <span style={{ fontSize: '13px', color: '#6b7280' }}>{rangerPage + 1} / {totalPages}</span>
                      <button onClick={() => setRangerPage(p => Math.min(totalPages - 1, p + 1))} disabled={rangerPage >= totalPages - 1}
                        style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: rangerPage >= totalPages - 1 ? '#d1d5db' : '#374151', fontSize: '13px', cursor: rangerPage >= totalPages - 1 ? 'not-allowed' : 'pointer' }}>Next →</button>
                    </div>
                  )}
                </>
              )
            })()}
            {loadingRangers && (
              <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
                {[1,2,3,4,5].map(i => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 140px 60px 90px 110px 100px 80px 80px', padding: '13px 16px', borderBottom: '1px solid #f3f4f6', gap: '12px', alignItems: 'center' }}>
                    <div><Skeleton width={140} height={13} /><div style={{ marginTop: '4px' }}><Skeleton width={60} height={10} /></div></div>
                    {[100,40,70,90,80,60,60].map((w, j) => <Skeleton key={j} width={w} height={12} />)}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── TAB 3: Ranger Detail ── */}
        {activeTab === 'ranger_detail' && selectedRanger && (
          <>
            {/* Back button */}
            <button onClick={() => setActiveTab('ranger')}
              style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#374151', fontSize: '12px', cursor: 'pointer', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              ← Kembali ke Ranger
            </button>

            {/* Ranger Header — row style seperti Tab 2 */}
            <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '14px 20px', display: 'grid', gridTemplateColumns: '200px 1fr 1fr 1fr 1fr 1fr', alignItems: 'center', gap: '0', marginBottom: '16px' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: '800', color: '#0344D8' }}>⚡ {selectedRanger.pic}</div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedRanger.mitra}</div>
              </div>
              {[
                { label: 'Total Agen',    value: formatNum(selectedRanger.total_agents),                                                                       tip: 'Jumlah agen yang dikelola Ranger ini dalam 14 hari terakhir.' },
                { label: 'Fee (14H)',     value: formatFee(selectedRanger.total_fee_14d),                                                                      tip: 'Total fee yang dihasilkan seluruh agen Ranger ini dalam 14 hari terakhir.', highlight: true },
                { label: 'Fee/Agen',     value: formatFee(Math.round(selectedRanger.total_fee_14d / Math.max(selectedRanger.total_agents, 1))),                tip: 'Rata-rata fee per agen. Indikator efisiensi Ranger — dibandingkan sesama Ranger Arranet.' },
                { label: 'TRX/Agen',     value: String(selectedRanger.avg_trx_per_agent),                                                                     tip: 'Rata-rata transaksi per agen dalam 14 hari terakhir.' },
                { label: 'Health Score', value: String(selectedRanger.health_score),                                                                           tip: 'Composite score 0–100 berdasarkan % Productive, % Growing, % rendah Declining.', color: selectedRanger.health_score >= 65 ? '#166534' : selectedRanger.health_score >= 50 ? '#ca8a04' : '#dc2626' },
              ].map(m => (
                <div key={m.label} {...tip(m.tip)} style={{ textAlign: 'center', borderLeft: '1px solid rgba(3,68,216,0.15)', padding: '0 12px', cursor: 'default' }}>
                  <div style={{ fontSize: '15px', fontWeight: '800', color: (m as any).color ?? ((m as any).highlight ? '#1e40af' : '#111827') }}>{m.value}</div>
                  <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>{m.label}</div>
                </div>
              ))}
            </div>

            {/* Agent List */}
            {(() => {
              // Count per trend dari semua agen yang di-load
              const growingList   = allRangerAgents.filter(a => a.trnd === 'growing')
              const decliningList = allRangerAgents.filter(a => a.trnd === 'declining')
              const consistentList= allRangerAgents.filter(a => a.trnd === 'consistent')
              const baruList      = allRangerAgents.filter(a => a.trnd === 'baru')
              const hilangList    = allRangerAgents.filter(a => a.trnd === 'hilang')

              const filtered = rangerAgentFilter === 'semua'      ? rangerAgents
                             : rangerAgentFilter === 'growing'    ? growingList
                             : rangerAgentFilter === 'declining'  ? decliningList
                             : rangerAgentFilter === 'consistent' ? consistentList
                             : rangerAgentFilter === 'baru'       ? baruList
                             : rangerAgentFilter === 'hilang'     ? hilangList
                             : rangerAgents

              const handleExportAgents = () => {
                exportCSV(
                  `agen_${selectedRanger.pic.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`,
                  ['Serial Number','Merchant Name','Mitra','Hari Aktif 14H','TRX 14H','Fee 14H','Avg TRX/Hari 14H','Avg W1','Avg W2','Trend','% Change','Bucket'],
                  allRangerAgents.map(a => [a.sn, a.mer_name ?? '', a.mtr ?? '', a.act_days_14, a.tot_trx_14, a.tot_fee_14, a.avg_trx_14, a.avg_w1, a.avg_w2, a.trnd, a.chg_pct, a.bkt])
                )
              }

              const TREND_CHIPS = [
                { key: 'semua',      label: 'Semua',      icon: '📋', count: rangerAgentTotal, activeBg: '#1e40af',  activeColor: '#fff',     activeBorder: '#1e40af',  tip: 'Semua agen Ranger ini dalam 14 hari terakhir.' },
                { key: 'growing',    label: 'Growing',    icon: '💎', count: growingList.length,   activeBg: '#dcfce7', activeColor: '#166534',  activeBorder: '#bbf7d0',  tip: 'Agen yang TRX/hari di 7 hari kedua (W2) lebih dari 120% dibanding 7 hari pertama (W1). Tren meningkat signifikan.' },
                { key: 'declining',  label: 'Declining',  icon: '⚠️', count: decliningList.length, activeBg: '#fee2e2', activeColor: '#dc2626',  activeBorder: '#fecaca',  tip: 'Agen yang TRX/hari di W2 kurang dari 80% dibanding W1. Tren menurun — perlu follow up Ranger.' },
                { key: 'consistent', label: 'Konsisten',  icon: '✅', count: consistentList.length,activeBg: '#eff6ff', activeColor: '#1e40af',  activeBorder: '#bfdbfe',  tip: 'Agen yang TRX/hari di W2 antara 80–120% dibanding W1. Performa stabil.' },
                { key: 'baru',       label: 'Baru W2',    icon: '🆕', count: baruList.length,      activeBg: '#f5f3ff', activeColor: '#6b21a8',  activeBorder: '#e9d5ff',  tip: 'Agen yang tidak ada transaksi di W1 tapi muncul di W2. Bisa agen yang baru aktif kembali atau agen baru.' },
                { key: 'hilang',     label: 'Hilang W2',  icon: '👻', count: hilangList.length,    activeBg: '#fff7ed', activeColor: '#c2410c',  activeBorder: '#fed7aa',  tip: 'Agen yang aktif di W1 tapi tidak ada transaksi di W2. Perlu dicek — mungkin berhenti atau ada masalah.' },
              ]

              return (
                <>
                  {/* Chips */}
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
                    {TREND_CHIPS.map(c => {
                      const isActive = rangerAgentFilter === c.key
                      return (
                        <button key={c.key} onClick={() => setRangerAgentFilter(c.key)}
                          {...tip(c.tip)}
                          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '99px', border: `1px solid ${isActive ? c.activeBorder : '#e5e7eb'}`, backgroundColor: isActive ? c.activeBg : '#f9fafb', color: isActive ? c.activeColor : '#374151', fontSize: '12px', fontWeight: '600', cursor: 'pointer', transition: 'all 0.15s' }}>
                          <span>{c.icon} {c.label}</span>
                          <span style={{ backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: '99px', padding: '1px 7px', fontSize: '11px', fontWeight: '700' }}>{c.count}</span>
                        </button>
                      )
                    })}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em' }}>
                      {filtered.length < rangerAgentTotal ? `${formatNum(filtered.length)} dari ${formatNum(rangerAgentTotal)} agen` : `${formatNum(rangerAgentTotal)} agen`} — klik untuk detail
                    </div>
                    <button onClick={handleExportAgents}
                      style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#374151', fontSize: '12px', cursor: 'pointer' }}>
                      ⬇ Export CSV
                    </button>
                  </div>

            {loadingRangerAgents ? (
              <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
                {[1,2,3,4,5].map(i => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 70px 90px 70px 70px 70px 80px', padding: '12px 16px', borderBottom: '1px solid #f3f4f6', gap: '12px' }}>
                    <Skeleton width={160} height={13} />
                    {[40,60,80,60,55,55,65].map((w,j) => <Skeleton key={j} width={w} height={12} />)}
                  </div>
                ))}
              </div>
            ) : filtered.length > 0 ? (
              <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 70px 90px 70px 70px 70px 80px', padding: '10px 16px', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '10px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.05em', gap: '12px' }}>
                  <div>AGEN</div>
                  <div style={{ textAlign: 'right' }}><span {...tip('Jumlah hari aktif dalam 14 hari terakhir.')}>HARI ⓘ</span></div>
                  <div style={{ textAlign: 'right' }}>TRX 14H</div>
                  <div style={{ textAlign: 'right' }}>FEE 14H</div>
                  <div style={{ textAlign: 'right' }}><span {...tip('Rata-rata TRX/hari di 7 hari pertama (1–7).')}>AVG W1 ⓘ</span></div>
                  <div style={{ textAlign: 'right' }}><span {...tip('Rata-rata TRX/hari di 7 hari kedua (8–14). Dibandingkan W1 untuk menentukan tren.')}>AVG W2 ⓘ</span></div>
                  <div style={{ textAlign: 'center' }}>BUCKET</div>
                  <div style={{ textAlign: 'center' }}><span {...tip('Tren berdasarkan W1 vs W2. Growing = W2 > 120% W1. Declining = W2 < 80% W1. Baru = tidak ada di W1. Hilang = tidak ada di W2.')}>TREND ⓘ</span></div>
                </div>
                {filtered.map((a, i) => {
                  const trendCfg = TREND_CONFIG[a.trnd as keyof typeof TREND_CONFIG] ?? TREND_CONFIG.consistent
                  return (
                    <div key={a.sn} onClick={() => openAgentDrawer(a)}
                      style={{ display: 'grid', gridTemplateColumns: '1fr 60px 70px 90px 70px 70px 70px 80px', padding: '11px 16px', borderBottom: i < filtered.length - 1 ? '1px solid #f3f4f6' : 'none', alignItems: 'center', backgroundColor: '#fff', cursor: 'pointer', gap: '12px' }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = '#fff'}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.mer_name ?? a.sn}</div>
                        <div style={{ fontSize: '10px', color: '#d1d5db' }}>{a.sn}</div>
                      </div>
                      <div style={{ fontSize: '12px', fontWeight: '700', color: a.act_days_14 >= 8 ? '#166534' : a.act_days_14 >= 5 ? '#ca8a04' : '#dc2626', textAlign: 'right' }}>{a.act_days_14}</div>
                      <div style={{ fontSize: '12px', color: '#374151', textAlign: 'right' }}>{formatNum(a.tot_trx_14)}</div>
                      <div style={{ fontSize: '12px', color: '#374151', textAlign: 'right' }}>{formatFee(a.tot_fee_14)}</div>
                      <div style={{ fontSize: '12px', color: '#6b7280', textAlign: 'right' }}>{a.avg_w1 > 0 ? a.avg_w1 : '—'}</div>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: a.avg_w2 > a.avg_w1 * 1.2 ? '#166534' : a.avg_w2 < a.avg_w1 * 0.8 ? '#dc2626' : '#374151', textAlign: 'right' }}>{a.avg_w2 > 0 ? a.avg_w2 : '—'}</div>
                      <div style={{ textAlign: 'center' }}><BucketChip b={a.bkt} /></div>
                      <div style={{ textAlign: 'center' }}>
                        <span style={{ padding: '1px 7px', borderRadius: '99px', fontSize: '10px', fontWeight: '700', backgroundColor: trendCfg?.bg ?? '#f9fafb', color: trendCfg?.color ?? '#374151', border: `1px solid ${trendCfg?.border ?? '#e5e7eb'}` }}>
                          {a.trnd === 'baru' ? '🆕 Baru' : a.trnd === 'hilang' ? '👻 Hilang' : `${trendCfg?.icon} ${trendCfg?.label}`}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px', backgroundColor: '#f9fafb', borderRadius: '10px', border: '1px dashed #e5e7eb', color: '#9ca3af', fontSize: '13px' }}>
                Tidak ada agen
              </div>
            )}
                </>
              )
            })()}

            {/* Agent Pagination */}
            {agentTotalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', alignItems: 'center', marginTop: '16px' }}>
                <button onClick={() => { setRangerAgentPage(p => Math.max(0, p - 1)); loadRangerAgentsPage(selectedRanger.pic, Math.max(0, rangerAgentPage - 1)) }} disabled={rangerAgentPage === 0}
                  style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: rangerAgentPage === 0 ? '#d1d5db' : '#374151', fontSize: '13px', cursor: rangerAgentPage === 0 ? 'not-allowed' : 'pointer' }}>← Prev</button>
                <span style={{ fontSize: '13px', color: '#6b7280' }}>{rangerAgentPage + 1} / {agentTotalPages}</span>
                <button onClick={() => { setRangerAgentPage(p => Math.min(agentTotalPages - 1, p + 1)); loadRangerAgentsPage(selectedRanger.pic, Math.min(agentTotalPages - 1, rangerAgentPage + 1)) }} disabled={rangerAgentPage >= agentTotalPages - 1}
                  style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: rangerAgentPage >= agentTotalPages - 1 ? '#d1d5db' : '#374151', fontSize: '13px', cursor: rangerAgentPage >= agentTotalPages - 1 ? 'not-allowed' : 'pointer' }}>Next →</button>
              </div>
            )}
          </>
        )}

      </div>

      {/* ── Agent Drawer (reuse dari hidden-gem) ── */}
      {selectedAgent && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}>
          <div onClick={() => setSelectedAgent(null)} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)' }} />
          <div style={{ position: 'relative', width: '480px', height: '100%', backgroundColor: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'sticky', top: 0, backgroundColor: '#fff', zIndex: 1 }}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: '800', color: '#111827', marginBottom: '4px' }}>{selectedAgent.mer_name ?? selectedAgent.sn}</div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '6px' }}>{selectedAgent.sn}</div>
                <div style={{ display: 'flex', gap: '6px' }}><TrendChip trend={selectedAgent.trnd} /><BucketChip b={selectedAgent.bkt} /></div>
              </div>
              <button onClick={() => setSelectedAgent(null)} style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#6b7280', fontSize: '18px', cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>

            {loadingDrawer ? (
              <div style={{ padding: '20px 24px' }}>
                {[1,2,3,4,5,6].map(i => (
                  <div key={i} style={{ marginBottom: '20px' }}>
                    <Skeleton width={100} height={10} radius={4} />
                    <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <Skeleton width="100%" height={14} />
                      <Skeleton width="80%" height={14} />
                      <Skeleton width="60%" height={14} />
                    </div>
                  </div>
                ))}
              </div>
            ) : agentDetail.length > 0 ? (
              <div style={{ padding: '20px 24px' }}>

                {/* INFO AGEN */}
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

                {/* PERBANDINGAN PERFORMA */}
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>PERBANDINGAN PERFORMA (W1 vs W2)</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    {[
                      { label: 'Avg TRX/hari W1 (1–7)',  value: String(selectedAgent.avg_w1 > 0 ? selectedAgent.avg_w1 : '—') },
                      { label: 'Avg TRX/hari W2 (8–14)', value: String(selectedAgent.avg_w2 > 0 ? selectedAgent.avg_w2 : '—'), highlight: true },
                      { label: 'Total TRX 14H',           value: formatNum(selectedAgent.tot_trx_14) },
                      { label: 'Perubahan W1→W2',         value: `${selectedAgent.chg_pct > 0 ? '+' : ''}${selectedAgent.chg_pct}%`, highlight: true },
                    ].map(s => {
                      const cfg = TREND_CONFIG[selectedAgent.trnd as keyof typeof TREND_CONFIG] ?? TREND_CONFIG.consistent
                      return (
                        <div key={s.label} style={{ padding: '10px 12px', backgroundColor: s.highlight ? cfg.bg : '#f9fafb', borderRadius: '8px', textAlign: 'center', border: s.highlight ? `1px solid ${cfg.border}` : 'none' }}>
                          <div style={{ fontSize: '14px', fontWeight: '700', color: s.highlight ? cfg.color : '#111827' }}>{s.value}</div>
                          <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>{s.label}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* RINGKASAN 14 HARI */}
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>RINGKASAN 14 HARI</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                    {[
                      { label: 'Total TRX',  value: agentDetail.reduce((s, d) => s + Number(d.total_trx), 0).toLocaleString('id') },
                      { label: 'Transfer',   value: agentDetail.reduce((s, d) => s + Number(d.transfer_trx), 0).toLocaleString('id') },
                      { label: 'Cek Saldo',  value: agentDetail.reduce((s, d) => s + Number(d.cek_saldo_trx), 0).toLocaleString('id') },
                      { label: 'Total Fee',  value: formatFee(agentDetail.reduce((s, d) => s + Number(d.total_fee), 0)) },
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

                {/* LIKUIDITAS */}
                {liquiditySummary && (
                  <div style={{ marginBottom: '24px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>LIKUIDITAS AGEN</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div style={{ padding: '10px 12px', backgroundColor: '#f9fafb', borderRadius: '8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '14px', fontWeight: '700', color: '#111827' }}>{formatAmount(liquiditySummary.avg_daily_amount_14d)}</div>
                        <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>Avg Amount/Hari (14H)</div>
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

                {/* TRANSAKSI PER HARI */}
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>TRANSAKSI PER HARI</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '80px' }}>
                    {(() => {
                      const cfg = TREND_CONFIG[selectedAgent.trnd as keyof typeof TREND_CONFIG] ?? TREND_CONFIG.consistent
                      const maxTrx = Math.max(...agentDetail.map(d => Number(d.total_trx)), 1)
                      const sd = new Date(sinceDate)
                      return Array.from({ length: 14 }, (_, i) => {
                        const d = new Date(sd); d.setDate(sd.getDate() + i)
                        const dateStr = d.toISOString().split('T')[0]
                        const found = agentDetail.find(a => a.transaction_date === dateStr)
                        const trx = found ? Number(found.total_trx) : 0
                        const isThisMonth = dateStr >= (lastDate ? lastDate.substring(0, 7) + '-01' : '')
                        return (
                          <div key={dateStr} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }} title={`${dateStr}: ${trx} trx`}>
                            <div style={{ width: '100%', height: `${Math.max(4, (trx / maxTrx) * 64)}px`, backgroundColor: trx > 0 ? (isThisMonth ? cfg.color : '#94a3b8') : '#f3f4f6', borderRadius: '3px 3px 0 0', transition: 'height 0.3s' }} />
                            <div style={{ fontSize: '8px', color: '#9ca3af', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                              {new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                            </div>
                          </div>
                        )
                      })
                    })()}
                  </div>
                  <div style={{ display: 'flex', gap: '12px', marginTop: '8px', fontSize: '10px', color: '#9ca3af' }}>
                    <span>▪ <span style={{ color: '#94a3b8' }}>Bulan lalu</span></span>
                    <span>▪ <span style={{ color: (TREND_CONFIG[selectedAgent.trnd as keyof typeof TREND_CONFIG] ?? TREND_CONFIG.consistent).color }}>Bulan ini</span></span>
                  </div>
                </div>

                {/* NOMINAL UANG BEREDAR */}
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
                            <div key={dateStr} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }} title={`${dateStr}: ${formatAmount(amount)}`}>
                              <div style={{ width: '100%', height: `${Math.max(4, (amount / maxAmount) * 64)}px`, backgroundColor: barColor, borderRadius: '3px 3px 0 0', transition: 'height 0.3s' }} />
                              <div style={{ fontSize: '8px', color: '#9ca3af', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
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
                    <div style={{ marginTop: '6px', fontSize: '10px', color: '#9ca3af' }}>Avg: {formatAmount(liquiditySummary?.avg_daily_amount_14d ?? 0)}/hari</div>
                  </div>
                )}

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
