import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Layout from '../../components/Layout'
import { createBrowserClient } from '@supabase/ssr'

interface MitraRow {
  mitra: string
  total_agents: number
  total_trx_14d: number
  total_fee_14d: number
  fee_per_agent: number
  trx_w1: number
  trx_w2: number
  momentum: 'accelerating' | 'stable' | 'decelerating'
  momentum_pct: number
  growing_count: number
  declining_count: number
  consistent_count: number
  growing_pct: number
  declining_pct: number
  liquidity_lemah_count: number
  liquidity_lemah_pct: number
  health_score: number
  window_start: string
  window_end: string
}

interface MitraDetail {
  trx_date: string
  daily_trx: number
  daily_fee: number
  active_agents: number
  fee_per_active_agent: number
}

interface MitraChurn {
  new_agents: number
  lost_agents: number
  retained_agents: number
}

interface MitraMTD {
  total_trx_mtd: number
  total_fee_mtd: number
  fee_per_agent_mtd: number
  active_agents_mtd: number
  avg_trx_per_day_mtd: number
  avg_trx_per_day_14d: number
  days_elapsed: number
  month_start: string
  end_date: string
}

interface MitraTarget {
  target_trx: number
  actual_trx_mtd: number
  achievement_pct: number
  days_elapsed: number
  days_in_month: number
  avg_trx_current_dekade: number
  dekade_number: number
  ontrack_threshold: number
  atrisk_threshold: number
}

const MOMENTUM_CONFIG = {
  accelerating: { label: 'Akselerasi', icon: '↑', color: '#166534', bg: '#dcfce7', border: '#bbf7d0', tooltip: 'TRX W2 (7 hari terakhir) > 110% dari W1 (7 hari pertama). Jaringan mitra sedang tumbuh.' },
  stable:       { label: 'Stabil',     icon: '→', color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe', tooltip: 'TRX W2 antara 90–110% dari W1. Volume konsisten.' },
  decelerating: { label: 'Melambat',   icon: '↓', color: '#dc2626', bg: '#fee2e2', border: '#fecaca', tooltip: 'TRX W2 < 90% dari W1. Volume menurun di minggu terakhir — perlu investigasi.' },
}

const SKELETON_STYLE = `@keyframes shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }`

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

export default function MitraPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [mitras, setMitras]     = useState<MitraRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [pageTab, setPageTab]   = useState<'ranking' | 'achievement' | 'heatmap' | 'bubble' | 'kategori'>('ranking')
  const [activeTab, setActiveTab] = useState<'accelerating' | 'stable' | 'decelerating' | ''>('')
  const [tooltip, setTooltip]   = useState<{ text: string, x: number, y: number } | null>(null)
  const [exporting, setExporting] = useState(false)
  const [windowStart, setWindowStart] = useState('')
  const [windowEnd, setWindowEnd]     = useState('')
  const [targetProgress, setTargetProgress] = useState<(MitraTarget & { mitra: string })[]>([])

  const [selected, setSelected]           = useState<MitraRow | null>(null)
  const [detail, setDetail]               = useState<MitraDetail[]>([])
  const [churn, setChurn]                 = useState<MitraChurn | null>(null)
  const [mtd, setMtd]                     = useState<MitraMTD | null>(null)
  const [mitraTarget, setMitraTarget]     = useState<MitraTarget | null>(null)
  const [loadingDrawer, setLoadingDrawer] = useState(false)

  useEffect(() => { loadMitras() }, [router.asPath])

  async function loadMitras() {
    setLoading(true)
    try {
      const now = new Date()
      const [mitraRes, tgtRes] = await Promise.all([
        supabase.rpc('get_mitra_list'),
        supabase.rpc('get_mitra_target_progress', { p_year: now.getFullYear(), p_month: now.getMonth() + 1 }),
      ])
      setMitras(mitraRes.data ?? [])
      if (mitraRes.data && mitraRes.data.length > 0) {
        setWindowStart(mitraRes.data[0].window_start)
        setWindowEnd(mitraRes.data[0].window_end)
      }
      setTargetProgress(tgtRes.data ?? [])
    } finally {
      setLoading(false)
    }
  }

  async function openDrawer(m: MitraRow) {
    setSelected(m); setDetail([]); setChurn(null); setMtd(null); setMitraTarget(null); setLoadingDrawer(true)
    try {
      const now = new Date()
      const [d, c, t, tgt] = await Promise.all([
        supabase.rpc('get_mitra_detail',        { p_mitra: m.mitra }),
        supabase.rpc('get_mitra_agent_churn',   { p_mitra: m.mitra }),
        supabase.rpc('get_mitra_mtd',           { p_mitra: m.mitra }),
        supabase.rpc('get_mitra_target_progress', {
          p_year:  now.getFullYear(),
          p_month: now.getMonth() + 1,
        }),
      ])
      setDetail(d.data ?? [])
      setChurn(c.data?.[0] ?? null)
      setMtd(t.data?.[0] ?? null)
      // Filter hanya target untuk Mitra ini
      const thisMitraTarget = (tgt.data ?? []).find((r: MitraTarget & { mitra: string }) => r.mitra === m.mitra)
      setMitraTarget(thisMitraTarget ?? null)
    } finally { setLoadingDrawer(false) }
  }

  function handleExport() {
    setExporting(true)
    try {
      const rows = filtered.map(m => [
        m.mitra, m.total_agents, m.total_fee_14d, m.fee_per_agent,
        m.momentum, m.momentum_pct,
        m.growing_count, m.growing_pct,
        m.declining_count, m.declining_pct,
        m.liquidity_lemah_count, m.liquidity_lemah_pct,
        m.health_score, m.total_trx_14d,
      ])
      exportCSV(`kekuatan_mitra_${new Date().toISOString().split('T')[0]}.csv`,
        ['Mitra','Agen','Fee 14H','Fee/Agen','Momentum','Momentum %','Growing','Growing %','Declining','Declining %','Liq Lemah','Liq Lemah %','Health Score','TRX 14H'],
        rows)
    } finally { setExporting(false) }
  }

  const tip = (text: string) => ({
    onMouseEnter: (e: React.MouseEvent) => setTooltip({ text, x: e.clientX, y: e.clientY }),
    onMouseMove:  (e: React.MouseEvent) => setTooltip({ text, x: e.clientX, y: e.clientY }),
    onMouseLeave: () => setTooltip(null),
  })

  const filtered = activeTab ? mitras.filter(m => m.momentum === activeTab) : mitras
  const counts = {
    accelerating: mitras.filter(m => m.momentum === 'accelerating').length,
    stable:       mitras.filter(m => m.momentum === 'stable').length,
    decelerating: mitras.filter(m => m.momentum === 'decelerating').length,
  }

  const maxTrx = detail.length > 0 ? Math.max(...detail.map(d => d.daily_trx)) : 1
  const maxFee = detail.length > 0 ? Math.max(...detail.map(d => d.fee_per_active_agent)) : 1

  function getSignals(m: MitraRow, ch: MitraChurn | null): { type: 'red' | 'yellow' | 'green', text: string }[] {
    const s: { type: 'red' | 'yellow' | 'green', text: string }[] = []
    if (m.momentum === 'decelerating') s.push({ type: 'red',    text: `Volume melambat ${Math.abs(m.momentum_pct)}% di minggu terakhir` })
    if (m.momentum === 'accelerating') s.push({ type: 'green',  text: `Volume akselerasi +${m.momentum_pct}% di minggu terakhir` })
    if (m.declining_pct > 15)          s.push({ type: 'red',    text: `${m.declining_pct}% agen declining — butuh perhatian segera` })
    if (m.liquidity_lemah_pct > 10)    s.push({ type: 'yellow', text: `${m.liquidity_lemah_pct}% agen liquidity lemah — risiko penurunan volume` })
    if (ch && ch.lost_agents > 10)     s.push({ type: 'red',    text: `${ch.lost_agents} agen hilang vs 14H sebelumnya` })
    if (ch && ch.new_agents > 20)      s.push({ type: 'green',  text: `${ch.new_agents} agen baru/kembali aktif vs 14H sebelumnya` })
    return s
  }

  return (
    <Layout>
      <style>{SKELETON_STYLE}</style>
      <Head><title>Kekuatan Mitra — AMARIS</title></Head>

      {tooltip && (
        <div style={{ position: 'fixed', left: Math.min(tooltip.x + 12, window.innerWidth - 340), top: tooltip.y - 8, zIndex: 9999, backgroundColor: '#1f2937', color: '#f9fafb', fontSize: '11px', padding: '8px 12px', borderRadius: '8px', maxWidth: '320px', lineHeight: '1.5', pointerEvents: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', whiteSpace: 'pre-line' }}>
          {tooltip.text}
        </div>
      )}

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}>

        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '11px', fontWeight: '600', color: '#9ca3af', letterSpacing: '0.1em', marginBottom: '4px' }}>ANALITIK JARINGAN</div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#111827', margin: 0, letterSpacing: '-0.02em' }}>🤝 Kekuatan Mitra</h1>
          <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
            {windowStart && windowEnd ? (() => {
              const fmtNoYear = (d: string) => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
              const fmtFull   = (d: string) => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
              return `Data transaksi 14 hari dari tanggal ${fmtNoYear(windowStart)} sampai ${fmtFull(windowEnd)}`
            })() : 'Performa, momentum, dan kesehatan jaringan per mitra.'}
          </p>
        </div>

        {/* Page Tab Switcher */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', backgroundColor: '#f3f4f6', padding: '4px', borderRadius: '10px', width: 'fit-content', flexWrap: 'wrap' }}>
          {([
            { key: 'ranking',     label: '📊 Ranking' },
            { key: 'achievement', label: '🎯 Achievement' },
            { key: 'heatmap',    label: '🔥 Heatmap' },
            { key: 'bubble',     label: '🫧 Volume vs Kualitas' },
            { key: 'kategori',   label: '⭐ Kategori' },
          ] as { key: 'ranking'|'achievement'|'heatmap'|'bubble'|'kategori', label: string }[]).map(t => (
            <button key={t.key} onClick={() => setPageTab(t.key)}
              style={{ padding: '7px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: pageTab === t.key ? '600' : '400', background: pageTab === t.key ? '#fff' : 'transparent', color: pageTab === t.key ? '#111827' : '#6b7280', boxShadow: pageTab === t.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none', transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── TAB: RANKING ─────────────────────────────────────────── */}
        {pageTab === 'ranking' && <div>

        {/* Momentum Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          {(['accelerating', 'stable', 'decelerating'] as const).map(tab => {
            const cfg = MOMENTUM_CONFIG[tab]
            const isActive = activeTab === tab
            return (
              <button key={tab} onClick={() => setActiveTab(isActive ? '' : tab)}
                onMouseEnter={e => setTooltip({ text: cfg.tooltip, x: e.clientX, y: e.clientY })}
                onMouseMove={e => setTooltip({ text: cfg.tooltip, x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setTooltip(null)}
                style={{ padding: '9px 18px', borderRadius: '8px', cursor: 'pointer', border: `2px solid ${isActive ? cfg.color : '#e5e7eb'}`, backgroundColor: isActive ? cfg.bg : '#fff', color: isActive ? cfg.color : '#6b7280', fontSize: '13px', fontWeight: '600', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>{cfg.icon}</span>
                <span>{cfg.label}</span>
                <span style={{ padding: '1px 8px', borderRadius: '99px', fontSize: '11px', backgroundColor: isActive ? '#fff' : '#f3f4f6', color: isActive ? cfg.color : '#9ca3af', fontWeight: '700' }}>{counts[tab]}</span>
              </button>
            )
          })}
          <span style={{ marginLeft: 'auto', fontSize: '13px', color: '#6b7280' }}>{filtered.length} mitra</span>
          <button onClick={handleExport} disabled={exporting || loading}
            style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: exporting ? '#9ca3af' : '#374151', fontSize: '12px', cursor: exporting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {exporting ? '⏳' : '⬇'} Export CSV
          </button>
        </div>

        {/* Table */}
        {loading ? (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
            {[1,2,3,4,5].map(i => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 100px 110px 90px 70px 70px 80px 70px', padding: '14px 16px', borderBottom: '1px solid #f3f4f6', gap: '12px', alignItems: 'center' }}>
                <Skeleton width={160} height={14} />
                {[70,80,90,80,60,60,60,50].map((w, j) => <Skeleton key={j} width={w} height={12} />)}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 100px 110px 90px 70px 70px 80px 70px', padding: '10px 16px', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '10px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.05em', gap: '12px' }}>
              <div>MITRA</div>
              <div style={{ textAlign: 'right' }}>AGEN</div>
              <div style={{ textAlign: 'right' }}>FEE (14H)</div>
              <div style={{ textAlign: 'right' }}><span {...tip('Fee dibagi jumlah agen aktif 14H — ukuran efisiensi mitra.')}>FEE/AGEN ⓘ</span></div>
              <div style={{ textAlign: 'right' }}><span {...tip('% agen yang avg TRX/hari W2 (8–14) > 120% vs W1 (1–7).')}>GROWING ⓘ</span></div>
              <div style={{ textAlign: 'right' }}><span {...tip('% agen yang avg TRX/hari W2 (8–14) < 80% vs W1 (1–7).')}>DECLINING ⓘ</span></div>
              <div style={{ textAlign: 'right' }}><span {...tip('% agen yang avg amount/hari W2 < 50% dari W1. Indikasi float menipis.')}>LIQ. LEMAH ⓘ</span></div>
              <div><span {...tip('Composite score 0–100. Komponen: % Productive (30%), % Growing (25%), % rendah Declining (25%), % rendah Liquidity Lemah (20%).')}>HEALTH ⓘ</span></div>
              <div style={{ textAlign: 'right' }}>TRX 14H</div>
            </div>

            {filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px', color: '#9ca3af', fontSize: '13px' }}>Tidak ada mitra di kategori ini</div>
            ) : filtered.map((m, i) => (
              <div key={m.mitra} onClick={() => openDrawer(m)}
                style={{ display: 'grid', gridTemplateColumns: '1fr 70px 100px 110px 90px 70px 70px 80px 70px', padding: '12px 16px', borderBottom: i < filtered.length - 1 ? '1px solid #f3f4f6' : 'none', alignItems: 'center', backgroundColor: '#fff', cursor: 'pointer', gap: '12px' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = '#fff'}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#111827', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {m.mitra}
                    {/* Inline momentum chip kecil */}
                    {(() => {
                      const mom = MOMENTUM_CONFIG[m.momentum]
                      return (
                        <span style={{ padding: '1px 6px', borderRadius: '99px', fontSize: '10px', fontWeight: '700', backgroundColor: mom.bg, color: mom.color, border: `1px solid ${mom.border}` }}>
                          {mom.icon} {m.momentum_pct > 0 ? '+' : ''}{m.momentum_pct}%
                        </span>
                      )
                    })()}
                  </div>
                  <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '1px' }}>{formatNum(m.total_agents)} agen aktif</div>
                </div>
                <div style={{ fontSize: '12px', color: '#374151', textAlign: 'right' }}>{formatNum(m.total_agents)}</div>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#111827', textAlign: 'right' }}>{formatFee(m.total_fee_14d)}</div>
                <div style={{ fontSize: '12px', color: '#374151', textAlign: 'right' }}>{formatFee(m.fee_per_agent)}</div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: m.growing_pct >= 8 ? '#166534' : '#374151' }}>{m.growing_pct}%</span>
                  <div style={{ fontSize: '10px', color: '#9ca3af' }}>{formatNum(m.growing_count)} agen</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: m.declining_pct > 15 ? '#dc2626' : m.declining_pct > 8 ? '#ca8a04' : '#374151' }}>{m.declining_pct}%</span>
                  <div style={{ fontSize: '10px', color: '#9ca3af' }}>{formatNum(m.declining_count)} agen</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: m.liquidity_lemah_pct > 10 ? '#dc2626' : m.liquidity_lemah_pct > 5 ? '#ca8a04' : '#374151' }}>{m.liquidity_lemah_pct}%</span>
                  <div style={{ fontSize: '10px', color: '#9ca3af' }}>{formatNum(m.liquidity_lemah_count)} agen</div>
                </div>
                <div><HealthBar score={m.health_score} /></div>
                <div style={{ fontSize: '12px', color: '#374151', textAlign: 'right' }}>{formatNum(m.total_trx_14d)}</div>
              </div>
            ))}
          </div>
        )}
        </div>} {/* end tab ranking */}

        {/* ── TAB: ACHIEVEMENT ──────────────────────────────────────── */}
        {pageTab === 'achievement' && (() => {
          const now = new Date()
          const bulan = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'][now.getMonth()]
          const tahun = now.getFullYear()
          const targetMap = Object.fromEntries(targetProgress.map(t => [t.mitra, t]))
          return (
            <div>
              <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px' }}>
                Achievement TRX Transfer vs target {bulan} {tahun}. Semua Mitra ditampilkan — yang belum ada target ditandai abu-abu.
              </div>
              <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 100px 100px 110px 110px', padding: '10px 16px', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.05em' }}>
                  <div>MITRA</div>
                  <div style={{ textAlign: 'right' }}>AGEN</div>
                  <div style={{ textAlign: 'right' }}>TRX MTD</div>
                  <div style={{ textAlign: 'right' }}>TARGET</div>
                  <div style={{ textAlign: 'center' }}>ACHIEVEMENT</div>
                  <div style={{ textAlign: 'center' }}>PREDIKSI</div>
                </div>
                {loading ? (
                  <div style={{ padding: '32px', textAlign: 'center', color: '#9ca3af' }}>Memuat...</div>
                ) : mitras.map((m, i) => {
                  const tgt = targetMap[m.mitra]
                  const hasTarget = !!tgt
                  const pct = hasTarget ? Number(tgt.achievement_pct) : null
                  const avgD = hasTarget ? Number(tgt.avg_trx_current_dekade ?? 0) : 0
                  const projected = hasTarget
                    ? (avgD > 0 ? Math.round(tgt.actual_trx_mtd + avgD * (tgt.days_in_month - tgt.days_elapsed)) : Math.round(tgt.actual_trx_mtd / Math.max(tgt.days_elapsed, 1) * tgt.days_in_month))
                    : null
                  // Threshold dinamis dari am_targets — fallback 90/70
                  const ontrackThr = hasTarget ? Number(tgt.ontrack_threshold ?? 90) : 90
                  const atriskThr  = hasTarget ? Number(tgt.atrisk_threshold  ?? 70) : 70
                  const projectedPct = projected !== null && tgt && tgt.target_trx > 0
                    ? Math.round(projected / tgt.target_trx * 100) : null
                  const predLabel = projectedPct === null ? null
                    : projectedPct >= ontrackThr ? '✅ On track'
                    : projectedPct >= atriskThr  ? '⚠️ At risk'
                    : '↓ Jauh dari target'
                  const predColor = projectedPct === null ? '#9ca3af'
                    : projectedPct >= ontrackThr ? '#166534'
                    : projectedPct >= atriskThr  ? '#92400e'
                    : '#dc2626'
                  const predBg = projectedPct === null ? '#f9fafb'
                    : projectedPct >= ontrackThr ? '#f0fdf4'
                    : projectedPct >= atriskThr  ? '#fefce8'
                    : '#fef2f2'
                  const pc = pct === null ? '#9ca3af' : pct >= 80 ? '#166534' : pct >= 50 ? '#92400e' : '#dc2626'
                  const pb = pct === null ? '#f9fafb' : pct >= 80 ? '#f0fdf4' : pct >= 50 ? '#fefce8' : '#fef2f2'
                  return (
                    <div key={m.mitra} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 100px 100px 110px 110px', padding: '12px 16px', borderBottom: i < mitras.length - 1 ? '1px solid #f3f4f6' : 'none', alignItems: 'center', backgroundColor: '#fff' }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#111827' }}>{m.mitra}</div>
                        {!hasTarget
                          ? <div style={{ fontSize: '11px', color: '#9ca3af', fontStyle: 'italic', marginTop: '2px' }}>Target {bulan} {tahun} belum ditetapkan</div>
                          : pct !== null && <div style={{ marginTop: '5px', height: '3px', backgroundColor: '#f3f4f6', borderRadius: '99px', overflow: 'hidden', maxWidth: '150px' }}><div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, backgroundColor: pc, borderRadius: '99px' }} /></div>
                        }
                      </div>
                      <div style={{ textAlign: 'right', fontSize: '12px', color: '#374151' }}>{m.total_agents.toLocaleString('id')}</div>
                      <div style={{ textAlign: 'right', fontSize: '12px', color: '#374151' }}>{hasTarget ? tgt.actual_trx_mtd.toLocaleString('id') : <span style={{ color: '#d1d5db' }}>—</span>}</div>
                      <div style={{ textAlign: 'right', fontSize: '12px', fontWeight: '600', color: '#374151' }}>{hasTarget ? tgt.target_trx.toLocaleString('id') : <span style={{ color: '#d1d5db' }}>—</span>}</div>
                      <div style={{ textAlign: 'center' }}>{hasTarget && pct !== null ? <span style={{ padding: '3px 10px', borderRadius: '99px', fontSize: '12px', fontWeight: '700', backgroundColor: pb, color: pc }}>{pct}%</span> : <span style={{ color: '#d1d5db' }}>—</span>}</div>
                      <div style={{ textAlign: 'center' }}>{hasTarget && predLabel ? <span style={{ padding: '3px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: '600', backgroundColor: predBg, color: predColor }}>{predLabel}</span> : <span style={{ color: '#d1d5db' }}>—</span>}</div>
                    </div>
                  )
                })}
              </div>
              {targetProgress.length > 0 && <div style={{ marginTop: '8px', fontSize: '11px', color: '#9ca3af', textAlign: 'right' }}>Hari ke-{targetProgress[0].days_elapsed} dari {targetProgress[0].days_in_month} · Dekade {targetProgress[0].dekade_number} · On track ≥{targetProgress[0].ontrack_threshold}% · At risk {targetProgress[0].atrisk_threshold}–{targetProgress[0].ontrack_threshold}%</div>}
            </div>
          )
        })()}

        {/* ── TAB: HEATMAP ──────────────────────────────────────────── */}
        {pageTab === 'heatmap' && (() => {
          const COLS: { key: keyof MitraRow, label: string, fmt: (v: number) => string, thresholds: [number, number], invert?: boolean }[] = [
            { key: 'health_score',        label: 'Health',      fmt: v => String(v),               thresholds: [65, 50] },
            { key: 'growing_pct',         label: 'Growing %',   fmt: v => `${v}%`,                 thresholds: [25, 15] },
            { key: 'declining_pct',       label: 'Declining %', fmt: v => `${v}%`,                 thresholds: [20, 30], invert: true },
            { key: 'liquidity_lemah_pct', label: 'Liq Lemah',   fmt: v => `${v}%`,                 thresholds: [10, 20], invert: true },
            { key: 'fee_per_agent',       label: 'Fee/Agen',    fmt: v => `${Math.round(v/1000)}rb`, thresholds: [100000, 60000] },
            { key: 'momentum_pct',        label: 'Momentum',    fmt: v => `${v > 0 ? '+' : ''}${v}%`, thresholds: [5, -5] },
          ]
          const cellStyle = (val: number, t: [number,number], inv = false) => {
            const ok = !inv ? val >= t[0] : val <= t[0]
            const warn = !inv ? val >= t[1] : val <= t[1]
            return ok ? { bg: '#dcfce7', c: '#166534' } : warn ? { bg: '#fefce8', c: '#92400e' } : { bg: '#fee2e2', c: '#dc2626' }
          }
          return (
            <div>
              <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px' }}>🟢 Baik · 🟡 Perlu perhatian · 🔴 Bermasalah. Diurutkan berdasarkan Health Score.</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f9fafb' }}>
                      <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: '#9ca3af', borderBottom: '1px solid #e5e7eb' }}>MITRA</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: '11px', fontWeight: '700', color: '#9ca3af', borderBottom: '1px solid #e5e7eb' }}>AGEN</th>
                      {COLS.map(c => <th key={String(c.key)} style={{ padding: '10px 12px', textAlign: 'center', fontSize: '11px', fontWeight: '700', color: '#9ca3af', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>{c.label.toUpperCase()}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {[...mitras].sort((a, b) => b.health_score - a.health_score).map((m, i) => (
                      <tr key={m.mitra} style={{ borderBottom: '1px solid #f3f4f6', backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                        <td style={{ padding: '10px 16px', fontWeight: '600', color: '#111827', fontSize: '12px' }}>{m.mitra.length > 28 ? m.mitra.slice(0, 28) + '…' : m.mitra}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', color: '#374151' }}>{m.total_agents}</td>
                        {COLS.map(c => {
                          const val = Number(m[c.key])
                          const { bg, c: col } = cellStyle(val, c.thresholds, c.invert)
                          return <td key={String(c.key)} style={{ padding: '8px 12px', textAlign: 'center' }}><span style={{ padding: '3px 8px', borderRadius: '6px', backgroundColor: bg, color: col, fontWeight: '600', fontSize: '12px' }}>{c.fmt(val)}</span></td>
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })()}

        {/* ── TAB: BUBBLE CHART ─────────────────────────────────────── */}
        {pageTab === 'bubble' && (() => {
          const sig = mitras.filter(m => m.total_agents >= 10)
          const small = mitras.filter(m => m.total_agents < 10)
          const maxA = Math.max(...sig.map(m => m.total_agents), 1)
          const maxF = Math.max(...sig.map(m => Number(m.fee_per_agent)), 1)
          const W = 680, H = 360, P = 56
          const mc: Record<string, string> = { accelerating: '#16a34a', stable: '#6b7280', decelerating: '#dc2626' }
          const ml: Record<string, string> = { accelerating: '↑ Accelerating', stable: '→ Stable', decelerating: '↓ Decelerating' }
          return (
            <div>
              <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px' }}>X = Fee/Agen · Y = Health Score · Ukuran = Jumlah agen · Warna = Momentum. Mitra {'<'}10 agen dikecualikan.</div>
              <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px', overflowX: 'auto' }}>
                <svg width={W} height={H} style={{ display: 'block', margin: '0 auto' }}>
                  {[0,25,50,75,100].map(y => (
                    <g key={y}>
                      <line x1={P} y1={P+(1-y/100)*(H-P*2)} x2={W-P/2} y2={P+(1-y/100)*(H-P*2)} stroke='#f3f4f6' strokeWidth={1} />
                      <text x={P-6} y={P+(1-y/100)*(H-P*2)+4} fontSize={10} fill='#9ca3af' textAnchor='end'>{y}</text>
                    </g>
                  ))}
                  <text x={W/2} y={H-6} fontSize={11} fill='#6b7280' textAnchor='middle'>Fee per Agen (Rp ribu)</text>
                  <text x={12} y={H/2} fontSize={11} fill='#6b7280' textAnchor='middle' transform={`rotate(-90,12,${H/2})`}>Health Score</text>
                  {sig.map(m => {
                    const x = P + (Number(m.fee_per_agent)/maxF)*(W-P*2-P/2)
                    const y = P + (1-m.health_score/100)*(H-P*2)
                    const r = Math.max(8, Math.sqrt(m.total_agents/maxA)*42)
                    const col = mc[m.momentum] ?? '#6b7280'
                    const nm = m.mitra.replace(/CV\.|PT\.|PT |cv\./gi,'').replace(/\(.*?\)/g,'').trim().slice(0,10)
                    return (
                      <g key={m.mitra}>
                        <circle cx={x} cy={y} r={r} fill={col} fillOpacity={0.2} stroke={col} strokeWidth={2} />
                        <text x={x} y={y+4} fontSize={9} fill='#374151' textAnchor='middle' fontWeight='600'>{nm}</text>
                      </g>
                    )
                  })}
                  {[0,50,100,150,200].map(v => {
                    const x = P+(v*1000/maxF)*(W-P*2-P/2)
                    return x <= W-P/2 ? <text key={v} x={x} y={H-P+18} fontSize={10} fill='#9ca3af' textAnchor='middle'>{v}rb</text> : null
                  })}
                </svg>
                <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginTop: '10px', flexWrap: 'wrap' }}>
                  {Object.entries(mc).map(([k,col]) => <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#6b7280' }}><div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: col }} />{ml[k]}</div>)}
                </div>
                {small.length > 0 && <div style={{ marginTop: '8px', fontSize: '11px', color: '#9ca3af', textAlign: 'center' }}>Tidak ditampilkan ({'<'}10 agen): {small.map(m => m.mitra.split('(')[0].trim()).join(', ')}</div>}
              </div>
            </div>
          )
        })()}

        {/* ── TAB: KATEGORI ─────────────────────────────────────────── */}
        {pageTab === 'kategori' && (() => {
          const sig = mitras.filter(m => m.total_agents >= 10)
          const small = mitras.filter(m => m.total_agents < 10)
          const avgF = sig.reduce((s,m) => s+Number(m.fee_per_agent),0) / Math.max(sig.length,1)
          const avgH = sig.reduce((s,m) => s+m.health_score,0) / Math.max(sig.length,1)
          type CatKey = 'star'|'atrisk'|'potential'|'lagging'
          const cats: Record<CatKey, { label: string, desc: string, color: string, bg: string, border: string, mitras: MitraRow[] }> = {
            star:      { label: '⭐ Star',      desc: 'Fee/Agen tinggi + Health tinggi',    color: '#166534', bg: '#f0fdf4', border: '#bbf7d0', mitras: [] },
            atrisk:    { label: '⚠️ At Risk',   desc: 'Fee/Agen tinggi tapi Health rendah', color: '#92400e', bg: '#fefce8', border: '#fde68a', mitras: [] },
            potential: { label: '🌱 Potential', desc: 'Fee/Agen rendah tapi Health tinggi', color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe', mitras: [] },
            lagging:   { label: '💀 Lagging',   desc: 'Fee/Agen rendah + Health rendah',   color: '#dc2626', bg: '#fef2f2', border: '#fecaca', mitras: [] },
          }
          sig.forEach(m => {
            const hF = Number(m.fee_per_agent) >= avgF
            const hH = m.health_score >= avgH
            if (hF && hH)       cats.star.mitras.push(m)
            else if (hF && !hH) cats.atrisk.mitras.push(m)
            else if (!hF && hH) cats.potential.mitras.push(m)
            else                cats.lagging.mitras.push(m)
          })
          return (
            <div>
              <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>Pengelompokan otomatis berdasarkan Fee/Agen dan Health Score vs rata-rata jaringan.</div>
              <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '20px' }}>Rata-rata Fee/Agen: Rp {Math.round(avgF/1000)}rb · Health Score rata-rata: {Math.round(avgH)}/100 · Mitra {'<'}10 agen dikecualikan</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                {(Object.keys(cats) as CatKey[]).map(key => {
                  const cat = cats[key]
                  return (
                    <div key={key} style={{ padding: '20px', borderRadius: '12px', backgroundColor: cat.bg, border: `1px solid ${cat.border}` }}>
                      <div style={{ fontSize: '15px', fontWeight: '700', color: cat.color, marginBottom: '2px' }}>{cat.label}</div>
                      <div style={{ fontSize: '11px', color: cat.color, opacity: 0.8, marginBottom: '14px' }}>{cat.desc}</div>
                      {cat.mitras.length === 0
                        ? <div style={{ fontSize: '12px', color: '#9ca3af', fontStyle: 'italic' }}>Tidak ada Mitra</div>
                        : cat.mitras.sort((a,b) => Number(b.fee_per_agent)-Number(a.fee_per_agent)).map(m => (
                          <div key={m.mitra} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                            <div>
                              <div style={{ fontSize: '12px', fontWeight: '600', color: '#111827' }}>{m.mitra.length > 28 ? m.mitra.slice(0,28)+'…' : m.mitra}</div>
                              <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '1px' }}>{m.total_agents} agen · {m.momentum === 'accelerating' ? '↑' : m.momentum === 'decelerating' ? '↓' : '→'} {m.momentum}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '12px', fontWeight: '700', color: cat.color }}>H:{m.health_score}</div>
                              <div style={{ fontSize: '10px', color: '#9ca3af' }}>Rp {Math.round(Number(m.fee_per_agent)/1000)}rb/agen</div>
                            </div>
                          </div>
                        ))}
                    </div>
                  )
                })}
              </div>
              {small.length > 0 && (
                <div style={{ marginTop: '16px', padding: '12px 16px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: '#9ca3af', marginBottom: '6px' }}>MITRA KECIL (dikecualikan)</div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {small.map(m => <span key={m.mitra} style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '99px', backgroundColor: '#fff', border: '1px solid #e5e7eb', color: '#6b7280' }}>{m.mitra.split('(')[0].trim()} ({m.total_agents})</span>)}
                  </div>
                </div>
              )}
            </div>
          )
        })()}

      </div> {/* end maxWidth */}

      {/* Drawer */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}>
          <div onClick={() => setSelected(null)} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)' }} />
          <div style={{ position: 'relative', width: '480px', height: '100%', backgroundColor: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'sticky', top: 0, backgroundColor: '#fff', zIndex: 1 }}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: '800', color: '#111827', marginBottom: '4px' }}>{selected.mitra}</div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {(() => {
                    const mom = MOMENTUM_CONFIG[selected.momentum]
                    return (
                      <span style={{ padding: '2px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: '700', backgroundColor: mom.bg, color: mom.color, border: `1px solid ${mom.border}` }}>
                        {mom.icon} {mom.label} {selected.momentum_pct > 0 ? '+' : ''}{selected.momentum_pct}%
                      </span>
                    )
                  })()}
                  <span style={{ fontSize: '12px', color: '#9ca3af' }}>{formatNum(selected.total_agents)} agen · Health {selected.health_score}/100</span>
                </div>
              </div>
              <button onClick={() => setSelected(null)} style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#6b7280', fontSize: '18px', cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>

            {loadingDrawer ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>Memuat data...</div>
            ) : (
              <div style={{ padding: '20px 24px' }}>

                {(() => {
                  const signals = getSignals(selected, churn)
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

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '24px' }}>
                  {[
                    { label: 'Fee 14H',    value: formatFee(selected.total_fee_14d) },
                    { label: 'Fee/Agen',   value: formatFee(selected.fee_per_agent) },
                    { label: 'TRX 14H',    value: formatNum(selected.total_trx_14d) },
                    { label: 'Growing',    value: `${selected.growing_pct}%`,         color: '#166534' },
                    { label: 'Declining',  value: `${selected.declining_pct}%`,       color: selected.declining_pct > 15 ? '#dc2626' : '#374151' },
                    { label: 'Liq. Lemah', value: `${selected.liquidity_lemah_pct}%`, color: selected.liquidity_lemah_pct > 10 ? '#dc2626' : '#374151' },
                  ].map(s => (
                    <div key={s.label} style={{ padding: '10px 12px', backgroundColor: '#f9fafb', borderRadius: '8px', textAlign: 'center' }}>
                      <div style={{ fontSize: '14px', fontWeight: '700', color: s.color ?? '#111827' }}>{s.value}</div>
                      <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {mtd && (() => {
                  const diffPct = mtd.avg_trx_per_day_14d > 0
                    ? Math.round((mtd.avg_trx_per_day_mtd - mtd.avg_trx_per_day_14d) / mtd.avg_trx_per_day_14d * 1000) / 10
                    : 0
                  const isUp = diffPct >= 0
                  return (
                    <div style={{ marginBottom: '24px' }}>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>
                        PERFORMA MTD
                        <span {...tip(`Akumulasi sejak ${new Date(mtd.month_start).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} (${mtd.days_elapsed} hari berjalan). Dibandingkan dengan rata-rata TRX/hari basis 14H untuk lihat apakah momentum bulan ini sedang menguat atau melambat.`)} style={{ marginLeft: '6px', cursor: 'default', fontWeight: '400' }}>ⓘ</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                        {[
                          { label: 'TRX MTD',  value: formatNum(mtd.total_trx_mtd) },
                          { label: 'Fee MTD',  value: formatFee(mtd.total_fee_mtd) },
                          { label: 'Fee/Agen MTD', value: formatFee(mtd.fee_per_agent_mtd) },
                        ].map(s => (
                          <div key={s.label} style={{ padding: '10px 12px', backgroundColor: '#f9fafb', borderRadius: '8px', textAlign: 'center' }}>
                            <div style={{ fontSize: '14px', fontWeight: '700', color: '#111827' }}>{s.value}</div>
                            <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>{s.label}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ marginTop: '10px', padding: '8px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', backgroundColor: isUp ? '#f0fdf4' : '#fef2f2', color: isUp ? '#166534' : '#dc2626', border: `1px solid ${isUp ? '#bbf7d0' : '#fecaca'}` }}>
                        {isUp ? '↑' : '↓'} {Math.abs(diffPct)}% vs avg 14H
                        <span style={{ fontWeight: '400', color: '#9ca3af', marginLeft: '6px' }}>
                          ({formatNum(mtd.avg_trx_per_day_mtd)} vs {formatNum(mtd.avg_trx_per_day_14d)} TRX/hari)
                        </span>
                      </div>
                    </div>
                  )
                })()}

                {/* Target Achievement — hanya tampil kalau Mitra ini punya target bulan ini */}
                {mitraTarget && (() => {
                  const pct = Number(mitraTarget.achievement_pct)
                  const color  = pct >= 80 ? '#166534' : pct >= 50 ? '#92400e' : '#dc2626'
                  const bg     = pct >= 80 ? '#f0fdf4' : pct >= 50 ? '#fefce8' : '#fef2f2'
                  const border = pct >= 80 ? '#bbf7d0' : pct >= 50 ? '#fde68a' : '#fecaca'
                  const projected = mitraTarget.avg_trx_current_dekade > 0
                    ? Math.round(mitraTarget.actual_trx_mtd + mitraTarget.avg_trx_current_dekade * (mitraTarget.days_in_month - mitraTarget.days_elapsed))
                    : Math.round(mitraTarget.actual_trx_mtd / Math.max(mitraTarget.days_elapsed, 1) * mitraTarget.days_in_month)
                  return (
                    <div style={{ marginBottom: '24px' }}>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>
                        TARGET TRX TRANSFER BULAN INI
                        <span {...tip('Target TRX Transfer (bukan Cek Saldo) yang ditetapkan untuk Mitra ini. Achievement dihitung dari aktual MTD.')} style={{ marginLeft: '6px', cursor: 'default', fontWeight: '400' }}>ⓘ</span>
                      </div>
                      <div style={{ padding: '16px', backgroundColor: bg, borderRadius: '10px', border: `1px solid ${border}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                          <div style={{ fontSize: '28px', fontWeight: '800', color }}>{pct}%</div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '12px', fontWeight: '600', color }}>
                              {mitraTarget.actual_trx_mtd.toLocaleString('id')} / {mitraTarget.target_trx.toLocaleString('id')} TRX
                            </div>
                            <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>
                              Proyeksi akhir bulan: {projected.toLocaleString('id')} TRX
                            </div>
                          </div>
                        </div>
                        <div style={{ height: '8px', backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: '99px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, backgroundColor: color, borderRadius: '99px', transition: 'width 0.5s' }} />
                        </div>
                        <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '6px' }}>
                          Hari berjalan: {mitraTarget.days_elapsed} dari {mitraTarget.days_in_month} hari
                        </div>
                      </div>
                    </div>
                  )
                })()}

                {churn && (
                  <div style={{ marginBottom: '24px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>
                      RETENSI AGEN
                      <span {...tip('Perbandingan W1 vs W2 dalam 14H. Baru/Kembali = ada di W2 tapi tidak di W1. Hilang = ada di W1 tapi tidak di W2.')} style={{ marginLeft: '6px', cursor: 'default', fontWeight: '400' }}>ⓘ</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                      {[
                        { label: 'Agen Baru/Kembali', value: churn.new_agents,      color: '#166534', bg: '#dcfce7' },
                        { label: 'Agen Retained',     value: churn.retained_agents, color: '#1e40af', bg: '#eff6ff' },
                        { label: 'Agen Hilang',       value: churn.lost_agents,     color: '#dc2626', bg: '#fee2e2' },
                      ].map(s => (
                        <div key={s.label} style={{ padding: '10px 12px', backgroundColor: s.bg, borderRadius: '8px', textAlign: 'center' }}>
                          <div style={{ fontSize: '18px', fontWeight: '800', color: s.color }}>{formatNum(s.value)}</div>
                          <div style={{ fontSize: '10px', color: s.color, opacity: 0.8, marginTop: '2px' }}>{s.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {detail.length > 0 && (
                  <div style={{ marginBottom: '24px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>TRX PER HARI (14H)</div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '80px' }}>
                      {detail.map((d, i) => {
                        const isWeekend = [0, 6].includes(new Date(d.trx_date).getDay())
                        return (
                          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}
                            title={`${new Date(d.trx_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}: ${formatNum(d.daily_trx)} TRX`}>
                            <div style={{ width: '100%', height: `${Math.max(4, (d.daily_trx / maxTrx) * 64)}px`, backgroundColor: isWeekend ? '#c7d2fe' : '#0344D8', borderRadius: '2px 2px 0 0' }} />
                            <div style={{ fontSize: '7px', color: '#d1d5db', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                              {new Date(d.trx_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <div style={{ display: 'flex', gap: '12px', marginTop: '6px', fontSize: '10px', color: '#9ca3af' }}>
                      <span>▪ <span style={{ color: '#0344D8' }}>Weekday</span></span>
                      <span>▪ <span style={{ color: '#c7d2fe' }}>Weekend</span></span>
                    </div>
                  </div>
                )}

                {detail.length > 0 && (
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>
                      FEE/AGEN AKTIF PER HARI (14H)
                      <span {...tip('Total fee dibagi jumlah agen aktif hari itu. Indikator efisiensi harian.')} style={{ marginLeft: '6px', cursor: 'default', fontWeight: '400' }}>ⓘ</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '60px' }}>
                      {detail.map((d, i) => (
                        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}
                          title={`${new Date(d.trx_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}: ${formatFee(d.fee_per_active_agent)}/agen`}>
                          <div style={{ width: '100%', height: `${Math.max(4, (d.fee_per_active_agent / maxFee) * 48)}px`, backgroundColor: '#7c3aed', borderRadius: '2px 2px 0 0', opacity: 0.8 }} />
                          <div style={{ fontSize: '7px', color: '#d1d5db', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                            {new Date(d.trx_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                          </div>
                        </div>
                      ))}
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
