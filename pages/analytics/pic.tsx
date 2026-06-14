import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Layout from '../../components/Layout'
import { createBrowserClient } from '@supabase/ssr'

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

interface PicAgent {
  serial_number: string
  merchant_name: string | null
  active_days_14: number
  total_trx_14d: number
  avg_trx_14: number
  avg_trx_mtd: number
  trend: string
  trx_change_pct: number
}

const TREND_CONFIG = {
  growing:    { label: 'Growing',   icon: '💎', color: '#166534', bg: '#dcfce7', border: '#bbf7d0', tooltip: 'Avg TRX/hari bulan ini > 120% vs 14H.' },
  declining:  { label: 'Declining', icon: '⚠️', color: '#92400e', bg: '#fef9c3', border: '#fde68a', tooltip: 'Avg TRX/hari bulan ini < 80% vs 14H.' },
  consistent: { label: 'Konsisten', icon: '✅', color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe', tooltip: 'Avg TRX/hari bulan ini antara 80–120% vs 14H.' },
}

const SKELETON_STYLE = `@keyframes shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }`
const PAGE_SIZE = 25

function Skeleton({ width, height = 14, radius = 6 }: { width: string | number, height?: number, radius?: number }) {
  return <div style={{ width, height, borderRadius: radius, background: 'linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite' }} />
}

function formatFee(val: number): string {
  if (val >= 1000000000) return `Rp ${(val / 1000000000).toFixed(2)}M`
  if (val >= 1000000) return `Rp ${(val / 1000000).toFixed(1)}jt`
  if (val >= 1000) return `Rp ${(val / 1000).toFixed(0)}rb`
  return `Rp ${val}`
}

function formatNum(val: number): string {
  return val.toLocaleString('id')
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

function exportCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export default function PicPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [pics, setPics]         = useState<PicRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage]         = useState(0)
  const [filterMitra, setFilterMitra] = useState('')
  const [search, setSearch]     = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [mitras, setMitras]     = useState<string[]>([])
  const [exporting, setExporting] = useState(false)
  const [tooltip, setTooltip]   = useState<{ text: string, x: number, y: number } | null>(null)
  const debounceRef = useRef<NodeJS.Timeout>()

  // Drawer
  const [selected, setSelected]       = useState<PicRow | null>(null)
  const [agents, setAgents]           = useState<PicAgent[]>([])
  const [loadingDrawer, setLoadingDrawer] = useState(false)

  useEffect(() => { initPage() }, [router.asPath])

  async function initPage() {
    setLoading(true)
    try {
      const [filterRes] = await Promise.all([
        supabase.rpc('get_pic_filter_options'),
      ])
      if (filterRes.data?.[0]) setMitras(filterRes.data[0].mitras ?? [])
      await loadPics(0, '', '')
    } finally { setLoading(false) }
  }

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

  async function openDrawer(pic: PicRow) {
    setSelected(pic); setAgents([]); setLoadingDrawer(true)
    try {
      const { data } = await supabase.rpc('get_pic_agent_list', { p_pic: pic.pic })
      setAgents(data ?? [])
    } finally { setLoadingDrawer(false) }
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

  async function handlePageChange(newPage: number) {
    setPage(newPage)
    await loadPics(newPage, filterMitra, search)
  }

  async function handleReset() {
    setFilterMitra(''); setSearch(''); setSearchInput(''); setPage(0)
    await loadPics(0, '', '')
  }

  async function handleExport() {
    setExporting(true)
    try {
      const { data } = await supabase.rpc('get_pic_list', { p_mitra: filterMitra, p_search: search, p_limit: 9999, p_offset: 0 })
      const rows = (data ?? []).map((p: PicRow) => [
        p.pic, p.mitra, p.total_agents, p.total_trx_14d, p.total_fee_14d,
        p.avg_trx_per_agent, p.growing_count, p.growing_pct,
        p.declining_count, p.declining_pct, p.health_score,
      ])
      exportCSV(`kekuatan_pic_${new Date().toISOString().split('T')[0]}.csv`,
        ['PIC','Mitra','Agen','TRX 14H','Fee 14H','TRX/Agen','Growing','Growing %','Declining','Declining %','Health Score'],
        rows)
    } finally { setExporting(false) }
  }

  const tip = (text: string) => ({
    onMouseEnter: (e: React.MouseEvent) => setTooltip({ text, x: e.clientX, y: e.clientY }),
    onMouseMove:  (e: React.MouseEvent) => setTooltip({ text, x: e.clientX, y: e.clientY }),
    onMouseLeave: () => setTooltip(null),
  })

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  function TrendChip({ trend }: { trend: string }) {
    const cfg = TREND_CONFIG[trend as keyof typeof TREND_CONFIG] ?? TREND_CONFIG.consistent
    return (
      <span style={{ padding: '1px 7px', borderRadius: '99px', fontSize: '10px', fontWeight: '700', backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, whiteSpace: 'nowrap' }}>
        {cfg.icon} {cfg.label}
      </span>
    )
  }

  // Signals untuk drawer
  function getSignals(p: PicRow): { type: 'red' | 'yellow' | 'green', text: string }[] {
    const s: { type: 'red' | 'yellow' | 'green', text: string }[] = []
    if (p.declining_pct > 20)  s.push({ type: 'red',    text: `${p.declining_pct}% agen declining — perlu perhatian segera` })
    if (p.declining_pct > 10 && p.declining_pct <= 20) s.push({ type: 'yellow', text: `${p.declining_pct}% agen declining — pantau terus` })
    if (p.growing_pct > 10)    s.push({ type: 'green',  text: `${p.growing_pct}% agen growing — coaching efektif` })
    if (p.avg_trx_per_agent > 80) s.push({ type: 'green', text: `Avg ${p.avg_trx_per_agent} TRX/agen — produktivitas tinggi` })
    if (p.avg_trx_per_agent < 20) s.push({ type: 'yellow', text: `Avg ${p.avg_trx_per_agent} TRX/agen — produktivitas rendah` })
    return s
  }

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
          <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>Performa dan kualitas coaching PIC berdasarkan 14 hari terakhir.</p>
        </div>

        {/* Filters + Search + Export */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="text"
            value={searchInput}
            onChange={e => handleSearchInput(e.target.value)}
            placeholder="Cari nama PIC..."
            style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px', color: '#374151', width: '200px', outline: 'none' }}
          />
          <select value={filterMitra} onChange={e => handleMitraChange(e.target.value)}
            style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px', color: '#374151', backgroundColor: '#fff', cursor: 'pointer' }}>
            <option value="">Semua Mitra</option>
            {mitras.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          {(filterMitra || search) && (
            <button onClick={handleReset} style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#6b7280', fontSize: '12px', cursor: 'pointer' }}>✕ Reset</button>
          )}
          <span style={{ marginLeft: 'auto', fontSize: '13px', color: '#6b7280' }}>
            {loading ? 'Memuat...' : `${formatNum(totalCount)} PIC`}
          </span>
          <button onClick={handleExport} disabled={exporting || loading}
            style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: exporting ? '#9ca3af' : '#374151', fontSize: '12px', cursor: exporting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {exporting ? '⏳' : '⬇'} Export CSV
          </button>
        </div>

        {/* Table */}
        {loading ? (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
            {[1,2,3,4,5].map(i => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 150px 60px 90px 110px 90px 70px 70px 80px', padding: '13px 16px', borderBottom: '1px solid #f3f4f6', gap: '12px', alignItems: 'center' }}>
                <Skeleton width={140} height={13} />
                {[120,40,70,90,70,55,55,70].map((w, j) => <Skeleton key={j} width={w} height={12} />)}
              </div>
            ))}
          </div>
        ) : pics.length > 0 ? (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px 60px 90px 110px 90px 70px 70px 80px', padding: '10px 16px', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '10px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.05em', gap: '12px' }}>
              <div>PIC</div>
              <div>MITRA</div>
              <div style={{ textAlign: 'right' }}>AGEN</div>
              <div style={{ textAlign: 'right' }}>TRX (14H)</div>
              <div style={{ textAlign: 'right' }}>FEE (14H)</div>
              <div style={{ textAlign: 'right' }}>
                <span {...tip('Rata-rata TRX per agen dalam 14H. Indikator kualitas coaching PIC.')}>TRX/AGEN ⓘ</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span {...tip('% agen yang avg TRX/hari bulan ini > 120% vs 14H.')}>GROWING ⓘ</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span {...tip('% agen yang avg TRX/hari bulan ini < 80% vs 14H.')}>DECLINING ⓘ</span>
              </div>
              <div>
                <span {...tip('Composite score 0–100. Komponen: % Productive (30%), % Growing (25%), % rendah Declining (25%), fixed 25%.')}>HEALTH ⓘ</span>
              </div>
            </div>

            {/* Rows */}
            {pics.map((p, i) => (
              <div key={p.pic} onClick={() => openDrawer(p)}
                style={{ display: 'grid', gridTemplateColumns: '1fr 150px 60px 90px 110px 90px 70px 70px 80px', padding: '11px 16px', borderBottom: i < pics.length - 1 ? '1px solid #f3f4f6' : 'none', alignItems: 'center', backgroundColor: '#fff', cursor: 'pointer', gap: '12px' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = '#fff'}>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.pic}</div>
                <div style={{ fontSize: '11px', color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.mitra}</div>
                <div style={{ fontSize: '12px', color: '#374151', textAlign: 'right' }}>{formatNum(p.total_agents)}</div>
                <div style={{ fontSize: '12px', color: '#374151', textAlign: 'right' }}>{formatNum(p.total_trx_14d)}</div>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#111827', textAlign: 'right' }}>{formatFee(p.total_fee_14d)}</div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '12px', fontWeight: '700', color: p.avg_trx_per_agent >= 80 ? '#166534' : p.avg_trx_per_agent >= 40 ? '#374151' : '#dc2626' }}>
                    {p.avg_trx_per_agent}
                  </span>
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
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', alignItems: 'center', marginTop: '16px' }}>
            <button onClick={() => handlePageChange(Math.max(0, page - 1))} disabled={page === 0}
              style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: page === 0 ? '#d1d5db' : '#374151', fontSize: '13px', cursor: page === 0 ? 'not-allowed' : 'pointer' }}>← Prev</button>
            <span style={{ fontSize: '13px', color: '#6b7280' }}>{page + 1} / {totalPages}</span>
            <button onClick={() => handlePageChange(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}
              style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: page >= totalPages - 1 ? '#d1d5db' : '#374151', fontSize: '13px', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer' }}>Next →</button>
          </div>
        )}
      </div>

      {/* Drawer */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}>
          <div onClick={() => setSelected(null)} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)' }} />
          <div style={{ position: 'relative', width: '480px', height: '100%', backgroundColor: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

            {/* Drawer Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'sticky', top: 0, backgroundColor: '#fff', zIndex: 1 }}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: '800', color: '#111827', marginBottom: '2px' }}>{selected.pic}</div>
                <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '6px' }}>{selected.mitra} · {formatNum(selected.total_agents)} agen</div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>Health Score: <span style={{ fontWeight: '700', color: selected.health_score >= 65 ? '#166534' : selected.health_score >= 50 ? '#ca8a04' : '#dc2626' }}>{selected.health_score}/100</span></div>
              </div>
              <button onClick={() => setSelected(null)} style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#6b7280', fontSize: '18px', cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>

            {loadingDrawer ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>Memuat data...</div>
            ) : (
              <div style={{ padding: '20px 24px' }}>

                {/* Signals */}
                {(() => {
                  const signals = getSignals(selected)
                  if (signals.length === 0) return null
                  return (
                    <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {signals.map((s, i) => (
                        <div key={i} style={{ padding: '8px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '500', backgroundColor: s.type === 'red' ? '#fef2f2' : s.type === 'yellow' ? '#fffbeb' : '#f0fdf4', color: s.type === 'red' ? '#dc2626' : s.type === 'yellow' ? '#92400e' : '#166534', border: `1px solid ${s.type === 'red' ? '#fecaca' : s.type === 'yellow' ? '#fde68a' : '#bbf7d0'}` }}>
                          {s.type === 'red' ? '🔴' : s.type === 'yellow' ? '🟡' : '🟢'} {s.text}
                        </div>
                      ))}
                    </div>
                  )
                })()}

                {/* Summary Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '24px' }}>
                  {[
                    { label: 'Fee 14H',    value: formatFee(selected.total_fee_14d) },
                    { label: 'TRX/Agen',   value: String(selected.avg_trx_per_agent), highlight: true, tip: 'Proxy coaching quality — semakin tinggi semakin baik.' },
                    { label: 'Growing',    value: `${selected.growing_pct}%`,    color: '#166534' },
                    { label: 'Declining',  value: `${selected.declining_pct}%`,  color: selected.declining_pct > 15 ? '#dc2626' : '#374151' },
                    { label: 'Konsisten',  value: `${Math.round(selected.consistent_count / Math.max(selected.total_agents, 1) * 100)}%`, color: '#1e40af' },
                    { label: 'Total TRX',  value: formatNum(selected.total_trx_14d) },
                  ].map(s => (
                    <div key={s.label} style={{ padding: '10px 12px', backgroundColor: s.highlight ? '#eff6ff' : '#f9fafb', borderRadius: '8px', textAlign: 'center', border: s.highlight ? '1px solid #bfdbfe' : 'none' }}>
                      <div style={{ fontSize: '16px', fontWeight: '700', color: s.color ?? (s.highlight ? '#1e40af' : '#111827') }}>{s.value}</div>
                      <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Agent List */}
                {agents.length > 0 && (
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>
                      TOP AGEN (by TRX 14H)
                      <span {...tip('Daftar agen yang dikelola PIC ini, diurutkan by TRX terbanyak. Maks 20 agen.')} style={{ marginLeft: '6px', cursor: 'default', fontWeight: '400' }}>ⓘ</span>
                    </div>
                    <div style={{ border: '1px solid #f3f4f6', borderRadius: '8px', overflow: 'hidden' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 50px 60px 60px', gap: '8px', padding: '8px 12px', fontSize: '9px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.05em', backgroundColor: '#f9fafb' }}>
                        <div>AGEN</div>
                        <div style={{ textAlign: 'right' }}>HARI</div>
                        <div style={{ textAlign: 'right' }}>TRX 14H</div>
                        <div style={{ textAlign: 'right' }}>TREND</div>
                      </div>
                      {agents.map((a, i) => {
                        const trendCfg = TREND_CONFIG[a.trend as keyof typeof TREND_CONFIG] ?? TREND_CONFIG.consistent
                        return (
                          <div key={a.serial_number} style={{ display: 'grid', gridTemplateColumns: '1fr 50px 60px 60px', gap: '8px', padding: '8px 12px', borderTop: '1px solid #f9fafb', alignItems: 'center' }}>
                            <div>
                              <div style={{ fontSize: '12px', fontWeight: '600', color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.merchant_name ?? a.serial_number}</div>
                              <div style={{ fontSize: '9px', color: '#d1d5db' }}>{a.serial_number}</div>
                            </div>
                            <div style={{ fontSize: '11px', color: a.active_days_14 >= 8 ? '#166534' : a.active_days_14 >= 5 ? '#ca8a04' : '#dc2626', fontWeight: '700', textAlign: 'right' }}>{a.active_days_14}</div>
                            <div style={{ fontSize: '11px', color: '#374151', textAlign: 'right' }}>{formatNum(a.total_trx_14d)}</div>
                            <div style={{ textAlign: 'right' }}>
                              <span style={{ padding: '1px 6px', borderRadius: '99px', fontSize: '9px', fontWeight: '700', backgroundColor: trendCfg.bg, color: trendCfg.color, border: `1px solid ${trendCfg.border}` }}>
                                {a.trx_change_pct > 0 ? '↑' : a.trx_change_pct < 0 ? '↓' : '→'} {Math.abs(a.trx_change_pct)}%
                              </span>
                            </div>
                          </div>
                        )
                      })}
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
