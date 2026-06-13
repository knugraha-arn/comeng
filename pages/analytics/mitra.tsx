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

interface MitraPic {
  pic: string
  total_agents: number
  total_trx_14d: number
  total_fee_14d: number
  avg_trx_per_agent: number
  growing_count: number
  declining_count: number
  growing_pct: number
  declining_pct: number
}

interface MitraChurn {
  new_agents: number
  lost_agents: number
  retained_agents: number
}

const MOMENTUM_CONFIG = {
  accelerating: { label: 'Akselerasi', icon: '↑', color: '#166534', bg: '#dcfce7', border: '#bbf7d0', tooltip: 'TRX minggu kedua > 110% dari minggu pertama dalam 14 hari terakhir.' },
  stable:       { label: 'Stabil',     icon: '→', color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe', tooltip: 'TRX minggu kedua antara 90–110% dari minggu pertama.' },
  decelerating: { label: 'Melambat',   icon: '↓', color: '#dc2626', bg: '#fee2e2', border: '#fecaca', tooltip: 'TRX minggu kedua < 90% dari minggu pertama. Perlu investigasi.' },
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
  const bg    = score >= 65 ? '#dcfce7' : score >= 50 ? '#fef9c3' : '#fee2e2'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div style={{ flex: 1, height: '4px', backgroundColor: '#f3f4f6', borderRadius: '99px', overflow: 'hidden' }}>
        <div style={{ width: `${score}%`, height: '100%', backgroundColor: color, borderRadius: '99px' }} />
      </div>
      <span style={{ fontSize: '11px', fontWeight: '700', color, minWidth: '28px', textAlign: 'right' }}>{score}</span>
    </div>
  )
}

export default function MitraPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [mitras, setMitras]   = useState<MitraRow[]>([])
  const [loading, setLoading] = useState(true)
  const [tooltip, setTooltip] = useState<{ text: string, x: number, y: number } | null>(null)

  // Drawer
  const [selected, setSelected]         = useState<MitraRow | null>(null)
  const [detail, setDetail]             = useState<MitraDetail[]>([])
  const [pics, setPics]                 = useState<MitraPic[]>([])
  const [churn, setChurn]               = useState<MitraChurn | null>(null)
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
    setSelected(m)
    setDetail([]); setPics([]); setChurn(null)
    setLoadingDrawer(true)
    try {
      const [d, p, c] = await Promise.all([
        supabase.rpc('get_mitra_detail',       { p_mitra: m.mitra }),
        supabase.rpc('get_mitra_pic_breakdown', { p_mitra: m.mitra }),
        supabase.rpc('get_mitra_agent_churn',  { p_mitra: m.mitra }),
      ])
      setDetail(d.data ?? [])
      setPics(p.data ?? [])
      setChurn(c.data?.[0] ?? null)
    } finally {
      setLoadingDrawer(false)
    }
  }

  const tip = (text: string) => ({
    onMouseEnter: (e: React.MouseEvent) => setTooltip({ text, x: e.clientX, y: e.clientY }),
    onMouseMove:  (e: React.MouseEvent) => setTooltip({ text, x: e.clientX, y: e.clientY }),
    onMouseLeave: () => setTooltip(null),
  })

  // Drawer chart helpers
  const maxTrx    = detail.length > 0 ? Math.max(...detail.map(d => d.daily_trx)) : 1
  const maxFee    = detail.length > 0 ? Math.max(...detail.map(d => d.daily_fee)) : 1
  const maxPicFee = pics.length  > 0 ? pics[0].total_fee_14d : 1

  // Signals untuk drawer
  function getSignals(m: MitraRow, ch: MitraChurn | null): { type: 'red' | 'yellow' | 'green', text: string }[] {
    const s: { type: 'red' | 'yellow' | 'green', text: string }[] = []
    if (m.momentum === 'decelerating') s.push({ type: 'red',    text: `Volume melambat ${Math.abs(m.momentum_pct)}% di minggu terakhir` })
    if (m.momentum === 'accelerating') s.push({ type: 'green',  text: `Volume akselerasi +${m.momentum_pct}% di minggu terakhir` })
    if (m.declining_pct > 15)          s.push({ type: 'red',    text: `${m.declining_pct}% agen declining — butuh perhatian segera` })
    if (m.liquidity_lemah_pct > 10)    s.push({ type: 'yellow', text: `${m.liquidity_lemah_pct}% agen liquidity lemah — risiko penurunan volume` })
    if (ch && ch.lost_agents > 10)     s.push({ type: 'red',    text: `${ch.lost_agents} agen hilang vs 14H sebelumnya` })
    if (ch && ch.new_agents > 20)      s.push({ type: 'green',  text: `${ch.new_agents} agen baru aktif vs 14H sebelumnya` })
    const topPic = pics[0]
    if (topPic && topPic.declining_pct > 20) s.push({ type: 'yellow', text: `${topPic.pic} — ${topPic.declining_pct}% agen declining` })
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

        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '11px', fontWeight: '600', color: '#9ca3af', letterSpacing: '0.1em', marginBottom: '4px' }}>ANALITIK JARINGAN</div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#111827', margin: 0, letterSpacing: '-0.02em' }}>🤝 Kekuatan Mitra</h1>
          <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
            Performa, momentum, dan kesehatan jaringan per mitra — berdasarkan 14 hari terakhir.
          </p>
        </div>

        {/* Table */}
        {loading ? (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
            {[1,2,3,4,5].map(i => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 90px 110px 100px 90px 70px 70px 80px 70px', padding: '14px 16px', borderBottom: '1px solid #f3f4f6', gap: '12px', alignItems: 'center' }}>
                <Skeleton width={160} height={14} />
                {[70,80,90,80,80,60,60,60,50].map((w, i) => <Skeleton key={i} width={w} height={12} />)}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 90px 110px 100px 90px 70px 70px 80px 70px', padding: '10px 16px', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '10px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.05em', gap: '12px' }}>
              <div>MITRA</div>
              <div style={{ textAlign: 'right' }}>AGEN</div>
              <div style={{ textAlign: 'right' }}>FEE (14H)</div>
              <div style={{ textAlign: 'right' }}>
                <span {...tip('Fee dibagi jumlah agen aktif 14H — ukuran efisiensi mitra.')}>FEE/AGEN ⓘ</span>
              </div>
              <div style={{ textAlign: 'center' }}>
                <span {...tip('Perbandingan TRX minggu kedua vs minggu pertama dalam 14H.')}>MOMENTUM ⓘ</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span {...tip('% agen yang avg TRX/hari bulan ini > 120% vs 14H.')}>GROWING ⓘ</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span {...tip('% agen yang avg TRX/hari bulan ini < 80% vs 14H.')}>DECLINING ⓘ</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span {...tip('% agen yang avg amount/hari MTD < 50% dari avg 14H. Indikasi float menipis.')}>LIQ. LEMAH ⓘ</span>
              </div>
              <div>
                <span {...tip('Composite score 0–100. Komponen: % Productive (30%), % Growing (25%), % rendah Declining (25%), % rendah Liquidity Lemah (20%).')}>HEALTH ⓘ</span>
              </div>
              <div style={{ textAlign: 'right' }}>TRX 14H</div>
            </div>

            {/* Rows */}
            {mitras.map((m, i) => {
              const mom = MOMENTUM_CONFIG[m.momentum]
              return (
                <div key={m.mitra} onClick={() => openDrawer(m)}
                  style={{ display: 'grid', gridTemplateColumns: '1fr 70px 90px 110px 100px 90px 70px 70px 80px 70px', padding: '12px 16px', borderBottom: i < mitras.length - 1 ? '1px solid #f3f4f6' : 'none', alignItems: 'center', backgroundColor: '#fff', cursor: 'pointer', gap: '12px' }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = '#fff'}>

                  {/* Mitra name */}
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#111827' }}>{m.mitra}</div>
                    <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '1px' }}>{formatNum(m.total_agents)} agen aktif</div>
                  </div>

                  <div style={{ fontSize: '12px', color: '#374151', textAlign: 'right' }}>{formatNum(m.total_agents)}</div>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#111827', textAlign: 'right' }}>{formatFee(m.total_fee_14d)}</div>
                  <div style={{ fontSize: '12px', color: '#374151', textAlign: 'right' }}>{formatFee(m.fee_per_agent)}</div>

                  {/* Momentum chip */}
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <span {...tip(mom.tooltip)} style={{ padding: '2px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: '700', backgroundColor: mom.bg, color: mom.color, border: `1px solid ${mom.border}`, whiteSpace: 'nowrap', cursor: 'default' }}>
                      {mom.icon} {mom.label}
                      {m.momentum_pct !== 0 && <span style={{ marginLeft: '4px', opacity: 0.7 }}>{m.momentum_pct > 0 ? '+' : ''}{m.momentum_pct}%</span>}
                    </span>
                  </div>

                  {/* Growing */}
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: m.growing_pct >= 8 ? '#166534' : '#374151' }}>{m.growing_pct}%</span>
                    <div style={{ fontSize: '10px', color: '#9ca3af' }}>{formatNum(m.growing_count)} agen</div>
                  </div>

                  {/* Declining */}
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: m.declining_pct > 15 ? '#dc2626' : m.declining_pct > 8 ? '#ca8a04' : '#374151' }}>{m.declining_pct}%</span>
                    <div style={{ fontSize: '10px', color: '#9ca3af' }}>{formatNum(m.declining_count)} agen</div>
                  </div>

                  {/* Liquidity Lemah */}
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: m.liquidity_lemah_pct > 10 ? '#dc2626' : m.liquidity_lemah_pct > 5 ? '#ca8a04' : '#374151' }}>{m.liquidity_lemah_pct}%</span>
                    <div style={{ fontSize: '10px', color: '#9ca3af' }}>{formatNum(m.liquidity_lemah_count)} agen</div>
                  </div>

                  {/* Health Score */}
                  <div><HealthBar score={m.health_score} /></div>

                  <div style={{ fontSize: '12px', color: '#374151', textAlign: 'right' }}>{formatNum(m.total_trx_14d)}</div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Drawer */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}>
          <div onClick={() => setSelected(null)} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)' }} />
          <div style={{ position: 'relative', width: '520px', height: '100%', backgroundColor: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

            {/* Drawer Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'sticky', top: 0, backgroundColor: '#fff', zIndex: 1 }}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: '800', color: '#111827', marginBottom: '4px' }}>{selected.mitra}</div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {(() => {
                    const mom = MOMENTUM_CONFIG[selected.momentum]
                    return (
                      <span style={{ padding: '2px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: '700', backgroundColor: mom.bg, color: mom.color, border: `1px solid ${mom.border}` }}>
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

                {/* Signals */}
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

                {/* Summary Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '24px' }}>
                  {[
                    { label: 'Fee 14H',      value: formatFee(selected.total_fee_14d) },
                    { label: 'Fee/Agen',     value: formatFee(selected.fee_per_agent) },
                    { label: 'TRX 14H',      value: formatNum(selected.total_trx_14d) },
                    { label: 'Growing',      value: `${selected.growing_pct}%`,       color: '#166534' },
                    { label: 'Declining',    value: `${selected.declining_pct}%`,     color: selected.declining_pct > 15 ? '#dc2626' : '#374151' },
                    { label: 'Liq. Lemah',   value: `${selected.liquidity_lemah_pct}%`, color: selected.liquidity_lemah_pct > 10 ? '#dc2626' : '#374151' },
                  ].map(s => (
                    <div key={s.label} style={{ padding: '10px 12px', backgroundColor: '#f9fafb', borderRadius: '8px', textAlign: 'center' }}>
                      <div style={{ fontSize: '14px', fontWeight: '700', color: s.color ?? '#111827' }}>{s.value}</div>
                      <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Agen Churn */}
                {churn && (
                  <div style={{ marginBottom: '24px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>
                      RETENSI AGEN
                      <span {...tip('Perbandingan agen aktif 14H ini vs 14H sebelumnya. Baru = muncul pertama kali. Hilang = tidak aktif lagi.')} style={{ marginLeft: '6px', cursor: 'default', fontWeight: '400' }}>ⓘ</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                      {[
                        { label: 'Agen Baru',      value: churn.new_agents,      color: '#166534', bg: '#dcfce7' },
                        { label: 'Agen Retained',  value: churn.retained_agents, color: '#1e40af', bg: '#eff6ff' },
                        { label: 'Agen Hilang',    value: churn.lost_agents,     color: '#dc2626', bg: '#fee2e2' },
                      ].map(s => (
                        <div key={s.label} style={{ padding: '10px 12px', backgroundColor: s.bg, borderRadius: '8px', textAlign: 'center' }}>
                          <div style={{ fontSize: '18px', fontWeight: '800', color: s.color }}>{formatNum(s.value)}</div>
                          <div style={{ fontSize: '10px', color: s.color, opacity: 0.8, marginTop: '2px' }}>{s.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Chart TRX Harian */}
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

                {/* Chart Fee/Agen Harian */}
                {detail.length > 0 && (
                  <div style={{ marginBottom: '24px' }}>
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

                {/* PIC Breakdown */}
                {pics.length > 0 && (
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>
                      BREAKDOWN PER PIC
                      <span {...tip('TRX/Agen = rata-rata TRX per agen yang dikelola PIC ini. Proxy kualitas coaching.')} style={{ marginLeft: '6px', cursor: 'default', fontWeight: '400' }}>ⓘ</span>
                    </div>
                    <div style={{ border: '1px solid #f3f4f6', borderRadius: '8px', overflow: 'hidden' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 50px 60px 90px 60px 60px', gap: '8px', padding: '8px 12px', fontSize: '9px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.05em', backgroundColor: '#f9fafb' }}>
                        <div>PIC</div>
                        <div style={{ textAlign: 'right' }}>AGEN</div>
                        <div style={{ textAlign: 'right' }}>TRX/AGEN</div>
                        <div style={{ textAlign: 'right' }}>FEE</div>
                        <div style={{ textAlign: 'right' }}>GROW</div>
                        <div style={{ textAlign: 'right' }}>DECL</div>
                      </div>
                      {pics.map((p, i) => (
                        <div key={p.pic} style={{ display: 'grid', gridTemplateColumns: '1fr 50px 60px 90px 60px 60px', gap: '8px', padding: '8px 12px', borderTop: '1px solid #f9fafb', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontSize: '11px', fontWeight: '600', color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.pic}</div>
                            {/* Mini bar */}
                            <div style={{ marginTop: '3px', height: '2px', backgroundColor: '#f3f4f6', borderRadius: '99px', overflow: 'hidden' }}>
                              <div style={{ width: `${(p.total_fee_14d / maxPicFee) * 100}%`, height: '100%', backgroundColor: '#0344D8' }} />
                            </div>
                          </div>
                          <div style={{ fontSize: '11px', color: '#374151', textAlign: 'right' }}>{formatNum(p.total_agents)}</div>
                          <div style={{ fontSize: '11px', color: '#374151', textAlign: 'right' }}>{p.avg_trx_per_agent}</div>
                          <div style={{ fontSize: '11px', color: '#374151', textAlign: 'right' }}>{formatFee(p.total_fee_14d)}</div>
                          <div style={{ fontSize: '11px', fontWeight: '600', color: p.growing_pct > 10 ? '#166534' : '#374151', textAlign: 'right' }}>{p.growing_pct}%</div>
                          <div style={{ fontSize: '11px', fontWeight: '600', color: p.declining_pct > 20 ? '#dc2626' : p.declining_pct > 10 ? '#ca8a04' : '#374151', textAlign: 'right' }}>{p.declining_pct}%</div>
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
