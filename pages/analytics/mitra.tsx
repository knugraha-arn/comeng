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
  const [activeTab, setActiveTab] = useState<'accelerating' | 'stable' | 'decelerating' | ''>('')
  const [tooltip, setTooltip]   = useState<{ text: string, x: number, y: number } | null>(null)
  const [exporting, setExporting] = useState(false)

  const [selected, setSelected]           = useState<MitraRow | null>(null)
  const [detail, setDetail]               = useState<MitraDetail[]>([])
  const [churn, setChurn]                 = useState<MitraChurn | null>(null)
  const [loadingDrawer, setLoadingDrawer] = useState(false)

  useEffect(() => { loadMitras() }, [router.asPath])

  async function loadMitras() {
    setLoading(true)
    try {
      const { data } = await supabase.rpc('get_mitra_list')
      setMitras(data ?? [])
    } finally {
      setLoading(false)
    }
  }

  async function openDrawer(m: MitraRow) {
    setSelected(m); setDetail([]); setChurn(null); setLoadingDrawer(true)
    try {
      const [d, c] = await Promise.all([
        supabase.rpc('get_mitra_detail',      { p_mitra: m.mitra }),
        supabase.rpc('get_mitra_agent_churn', { p_mitra: m.mitra }),
      ])
      setDetail(d.data ?? [])
      setChurn(c.data?.[0] ?? null)
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
        <div style={{ position: 'fixed', left: Math.min(tooltip.x + 12, window.innerWidth - 260), top: tooltip.y - 8, zIndex: 9999, backgroundColor: '#1f2937', color: '#f9fafb', fontSize: '11px', padding: '8px 12px', borderRadius: '8px', maxWidth: '240px', lineHeight: '1.5', pointerEvents: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
          {tooltip.text}
        </div>
      )}

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}>

        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '11px', fontWeight: '600', color: '#9ca3af', letterSpacing: '0.1em', marginBottom: '4px' }}>ANALITIK JARINGAN</div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#111827', margin: 0, letterSpacing: '-0.02em' }}>🤝 Kekuatan Mitra</h1>
          <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
            Performa, momentum, dan kesehatan jaringan per mitra — berdasarkan 14 hari terakhir.
          </p>
        </div>

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
              <div style={{ textAlign: 'right' }}><span {...tip('% agen yang avg TRX/hari bulan ini > 120% vs 14H.')}>GROWING ⓘ</span></div>
              <div style={{ textAlign: 'right' }}><span {...tip('% agen yang avg TRX/hari bulan ini < 80% vs 14H.')}>DECLINING ⓘ</span></div>
              <div style={{ textAlign: 'right' }}><span {...tip('% agen yang avg amount/hari MTD < 50% dari avg 14H. Indikasi float menipis.')}>LIQ. LEMAH ⓘ</span></div>
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
                          {mom.icon} {mom.momentum_pct > 0 ? '+' : ''}{m.momentum_pct}%
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
      </div>

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
