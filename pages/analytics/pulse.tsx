import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Layout from '../../components/Layout'
import { createBrowserClient } from '@supabase/ssr'

interface PulseSummary {
  end_date: string
  month_start: string
  days_elapsed: number
  days_in_month: number
  fee_mtd: number
  fee_target: number
  fee_projected: number
  fee_avg_daily: number
  fee_needed_per_day: number
  trx_mtd: number
  trx_avg_daily_mtd: number
  trx_avg_daily_14d: number
  active_agents_today: number
  active_agents_avg_14d: number
  productive_count: number
  moderate_count: number
  sporadic_count: number
}

interface DailyFee {
  trx_date: string
  daily_fee: number
  cumulative_fee: number
  target_daily_pace: number
  cumulative_target: number
}

interface NetworkVelocity {
  trx_date: string
  total_trx: number
  active_agents: number
  total_fee: number
  avg_trx_per_agent: number
}

interface MitraPerformance {
  mitra: string
  total_agents: number
  active_agents_14d: number
  total_trx_14d: number
  total_fee_14d: number
  avg_trx_per_agent: number
  growing_count: number
  declining_count: number
  consistent_count: number
  growing_pct: number
  declining_pct: number
}

interface PicPerformance {
  pic: string
  mitra: string
  total_agents: number
  total_trx_14d: number
  total_fee_14d: number
  avg_trx_per_agent: number
  growing_count: number
  declining_count: number
  growing_pct: number
  declining_pct: number
}

interface HourlySlot {
  slot_name: string
  slot_order: number
  slot_emoji: string
  total_trx: number
  avg_per_day: number
  pct: number
}

interface CardType {
  card_type: string
  total_trx: number
  avg_per_day: number
  pct: number
}

interface AppDistribution {
  app_name: string
  total_agents: number
  total_trx: number
  total_fee: number
  pct_trx: number
}

const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']
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

export default function PulsePage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [summary, setSummary] = useState<PulseSummary | null>(null)
  const [dailyFee, setDailyFee] = useState<DailyFee[]>([])
  const [velocity, setVelocity] = useState<NetworkVelocity[]>([])
  const [mitras, setMitras] = useState<MitraPerformance[]>([])
  const [pics, setPics] = useState<PicPerformance[]>([])
  const [hourlySlots, setHourlySlots] = useState<HourlySlot[]>([])
  const [cardTypes, setCardTypes] = useState<CardType[]>([])
  const [appDist, setAppDist] = useState<AppDistribution[]>([])
  const [loading, setLoading] = useState(true)
  const [tooltip, setTooltip] = useState<{ text: string, x: number, y: number } | null>(null)

  useEffect(() => { loadAll() }, [router.asPath])

  async function loadAll() {
    setLoading(true)
    try {
      const [s, d, v, m, p, h, c, a] = await Promise.all([
        supabase.rpc('get_pulse_summary'),
        supabase.rpc('get_pulse_daily_fee'),
        supabase.rpc('get_pulse_network_velocity'),
        supabase.rpc('get_pulse_mitra_performance'),
        supabase.rpc('get_pulse_pic_performance'),
        supabase.rpc('get_pulse_hourly_slots'),
        supabase.rpc('get_pulse_card_types'),
        supabase.rpc('get_pulse_app_distribution'),
      ])
      setSummary(s.data?.[0] ?? null)
      setDailyFee(d.data ?? [])
      setVelocity(v.data ?? [])
      setMitras(m.data ?? [])
      setPics(p.data ?? [])
      setHourlySlots(h.data ?? [])
      setCardTypes(c.data ?? [])
      setAppDist(a.data ?? [])
    } finally {
      setLoading(false)
    }
  }

  const tip = (text: string) => ({
    onMouseEnter: (e: React.MouseEvent) => setTooltip({ text, x: e.clientX, y: e.clientY }),
    onMouseMove:  (e: React.MouseEvent) => setTooltip({ text, x: e.clientX, y: e.clientY }),
    onMouseLeave: () => setTooltip(null),
  })

  // Signals
  const signals: { type: 'red' | 'yellow' | 'green', text: string }[] = []
  if (summary) {
    const feeGap = summary.fee_target - summary.fee_projected
    if (feeGap > 0) signals.push({ type: 'red', text: `Proyeksi fee ${formatFee(summary.fee_projected)} — gap ${formatFee(feeGap)} dari target` })
    else signals.push({ type: 'green', text: `Proyeksi fee ${formatFee(summary.fee_projected)} — on track ✓` })

    if (summary.trx_avg_daily_mtd < summary.trx_avg_daily_14d * 0.9)
      signals.push({ type: 'yellow', text: `TRX/hari bulan ini (${formatNum(summary.trx_avg_daily_mtd)}) lebih rendah dari rata-rata 14H (${formatNum(summary.trx_avg_daily_14d)})` })

    if (summary.active_agents_today < summary.active_agents_avg_14d * 0.85)
      signals.push({ type: 'yellow', text: `Agen aktif hari ini (${formatNum(summary.active_agents_today)}) di bawah rata-rata 14H (${formatNum(Math.round(summary.active_agents_avg_14d))})` })

    const worstMitra = mitras.find(m => m.declining_pct > 15)
    if (worstMitra) signals.push({ type: 'red', text: `${worstMitra.mitra} — ${worstMitra.declining_pct}% agen declining, tertinggi di jaringan` })

    const bestPic = pics.find(p => p.growing_pct > 10)
    if (bestPic) signals.push({ type: 'green', text: `${bestPic.pic} — ${bestPic.growing_pct}% agen growing, coaching terbaik bulan ini` })

    const worstPic = pics.find(p => p.declining_pct > 20)
    if (worstPic) signals.push({ type: 'red', text: `${worstPic.pic} — ${worstPic.declining_pct}% agen declining, perlu perhatian segera` })
  }

  const currentMonth = summary ? MONTHS[new Date(summary.end_date).getMonth()] : ''
  const currentYear  = summary ? new Date(summary.end_date).getFullYear() : ''
  const feeProgress  = summary && summary.fee_target > 0 ? Math.min(100, Math.round(summary.fee_mtd / summary.fee_target * 100)) : 0
  const isOnTrack    = summary ? summary.fee_projected >= summary.fee_target : false

  // Chart helpers
  const maxCumFee    = dailyFee.length > 0 ? Math.max(...dailyFee.map(d => Math.max(d.cumulative_fee, d.cumulative_target))) : 1
  const maxTrx       = velocity.length > 0 ? Math.max(...velocity.map(v => v.total_trx)) : 1
  const maxMitraFee  = mitras.length > 0 ? mitras[0].total_fee_14d : 1

  return (
    <Layout>
      <style>{SKELETON_STYLE}</style>
      <Head><title>Pulse — AMARIS</title></Head>

      {tooltip && (
        <div style={{ position: 'fixed', left: Math.min(tooltip.x + 12, window.innerWidth - 260), top: tooltip.y - 8, zIndex: 9999, backgroundColor: '#1f2937', color: '#f9fafb', fontSize: '11px', padding: '8px 12px', borderRadius: '8px', maxWidth: '240px', lineHeight: '1.5', pointerEvents: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
          {tooltip.text}
        </div>
      )}

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}>

        {/* Header */}
        <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: '600', color: '#9ca3af', letterSpacing: '0.1em', marginBottom: '4px' }}>ANALITIK JARINGAN</div>
            <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#111827', margin: 0, letterSpacing: '-0.02em' }}>⚡ Pulse</h1>
            <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
              {currentMonth} {currentYear} — Hari ke-{summary?.days_elapsed ?? '—'} dari {summary?.days_in_month ?? '—'}
            </p>
          </div>
          <button onClick={loadAll} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#374151', fontSize: '12px', cursor: 'pointer' }}>
            ↻ Refresh
          </button>
        </div>

        {/* Signals */}
        {signals.length > 0 && (
          <div style={{ marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {signals.map((s, i) => (
              <div key={i} style={{
                padding: '10px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: '500',
                backgroundColor: s.type === 'red' ? '#fef2f2' : s.type === 'yellow' ? '#fffbeb' : '#f0fdf4',
                color: s.type === 'red' ? '#dc2626' : s.type === 'yellow' ? '#92400e' : '#166534',
                border: `1px solid ${s.type === 'red' ? '#fecaca' : s.type === 'yellow' ? '#fde68a' : '#bbf7d0'}`,
                display: 'flex', alignItems: 'center', gap: '8px',
              }}>
                <span>{s.type === 'red' ? '🔴' : s.type === 'yellow' ? '🟡' : '🟢'}</span>
                <span>{s.text}</span>
              </div>
            ))}
          </div>
        )}

        {/* Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '24px' }}>

          {/* Fee MTD */}
          <div {...tip('Total fee yang terkumpul sejak awal bulan hingga hari terakhir data.')}
            style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px 20px', cursor: 'default' }}>
            {loading ? <Skeleton width="80%" height={28} /> : (
              <>
                <div style={{ fontSize: '11px', color: '#9ca3af', fontWeight: '600', marginBottom: '6px' }}>FEE MTD</div>
                <div style={{ fontSize: '22px', fontWeight: '800', color: '#111827' }}>{formatFee(summary?.fee_mtd ?? 0)}</div>
                <div style={{ marginTop: '8px', height: '4px', backgroundColor: '#f3f4f6', borderRadius: '99px', overflow: 'hidden' }}>
                  <div style={{ width: `${feeProgress}%`, height: '100%', backgroundColor: '#0344D8', borderRadius: '99px' }} />
                </div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>{feeProgress}% dari target {formatFee(summary?.fee_target ?? 0)}</div>
              </>
            )}
          </div>

          {/* Proyeksi */}
          <div {...tip('Estimasi total fee akhir bulan berdasarkan rata-rata harian bulan berjalan.')}
            style={{ backgroundColor: isOnTrack ? '#f0fdf4' : '#fef2f2', border: `1px solid ${isOnTrack ? '#bbf7d0' : '#fecaca'}`, borderRadius: '12px', padding: '16px 20px', cursor: 'default' }}>
            {loading ? <Skeleton width="80%" height={28} /> : (
              <>
                <div style={{ fontSize: '11px', color: isOnTrack ? '#166534' : '#dc2626', fontWeight: '600', marginBottom: '6px' }}>PROYEKSI AKHIR BULAN</div>
                <div style={{ fontSize: '22px', fontWeight: '800', color: isOnTrack ? '#166534' : '#dc2626' }}>{formatFee(summary?.fee_projected ?? 0)}</div>
                <div style={{ fontSize: '11px', color: isOnTrack ? '#166534' : '#dc2626', marginTop: '8px' }}>
                  {isOnTrack ? '✓ On track' : `↓ Gap ${formatFee((summary?.fee_target ?? 0) - (summary?.fee_projected ?? 0))}`}
                </div>
                <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>Perlu {formatFee(summary?.fee_needed_per_day ?? 0)}/hari</div>
              </>
            )}
          </div>

          {/* TRX Harian */}
          <div {...tip('Rata-rata transaksi per hari bulan ini dibandingkan rata-rata 14 hari terakhir.')}
            style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px 20px', cursor: 'default' }}>
            {loading ? <Skeleton width="80%" height={28} /> : (
              <>
                <div style={{ fontSize: '11px', color: '#9ca3af', fontWeight: '600', marginBottom: '6px' }}>TRX/HARI (MTD)</div>
                <div style={{ fontSize: '22px', fontWeight: '800', color: '#111827' }}>{formatNum(summary?.trx_avg_daily_mtd ?? 0)}</div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '8px' }}>
                  vs {formatNum(summary?.trx_avg_daily_14d ?? 0)} avg 14H
                  <span style={{ marginLeft: '6px', color: (summary?.trx_avg_daily_mtd ?? 0) >= (summary?.trx_avg_daily_14d ?? 0) ? '#166534' : '#dc2626', fontWeight: '600' }}>
                    {(summary?.trx_avg_daily_mtd ?? 0) >= (summary?.trx_avg_daily_14d ?? 0) ? '↑' : '↓'}
                  </span>
                </div>
                <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>Total {formatNum(summary?.trx_mtd ?? 0)} TRX bulan ini</div>
              </>
            )}
          </div>

          {/* Agen Aktif */}
          <div {...tip('Jumlah agen yang bertransaksi hari ini dibandingkan rata-rata 14 hari terakhir.')}
            style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px 20px', cursor: 'default' }}>
            {loading ? <Skeleton width="80%" height={28} /> : (
              <>
                <div style={{ fontSize: '11px', color: '#9ca3af', fontWeight: '600', marginBottom: '6px' }}>AGEN AKTIF HARI INI</div>
                <div style={{ fontSize: '22px', fontWeight: '800', color: '#111827' }}>{formatNum(summary?.active_agents_today ?? 0)}</div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '8px' }}>
                  vs {formatNum(Math.round(summary?.active_agents_avg_14d ?? 0))} avg 14H
                  <span style={{ marginLeft: '6px', color: (summary?.active_agents_today ?? 0) >= (summary?.active_agents_avg_14d ?? 0) ? '#166534' : '#dc2626', fontWeight: '600' }}>
                    {(summary?.active_agents_today ?? 0) >= (summary?.active_agents_avg_14d ?? 0) ? '↑' : '↓'}
                  </span>
                </div>
                <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>
                  {formatNum(summary?.productive_count ?? 0)} Productive · {formatNum(summary?.moderate_count ?? 0)} Moderate · {formatNum(summary?.sporadic_count ?? 0)} Sporadic
                </div>
              </>
            )}
          </div>
        </div>

        {/* Charts Row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>

          {/* Chart: Target vs Realisasi */}
          <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#111827' }}>Target vs Realisasi</div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>Fee kumulatif bulan berjalan</div>
              </div>
              <div style={{ display: 'flex', gap: '12px', fontSize: '10px', color: '#9ca3af' }}>
                <span>▪ <span style={{ color: '#0344D8' }}>Realisasi</span></span>
                <span>▪ <span style={{ color: '#e5e7eb' }}>Target</span></span>
              </div>
            </div>
            {loading ? <Skeleton width="100%" height={120} /> : (
              <div style={{ position: 'relative', height: '120px' }}>
                <svg width="100%" height="120" style={{ overflow: 'visible' }}>
                  {/* Target line */}
                  {dailyFee.map((d, i) => {
                    if (i === 0) return null
                    const prev = dailyFee[i - 1]
                    const x1 = `${(i - 1) / (dailyFee.length - 1) * 100}%`
                    const x2 = `${i / (dailyFee.length - 1) * 100}%`
                    const y1 = 110 - (prev.cumulative_target / maxCumFee * 100)
                    const y2 = 110 - (d.cumulative_target / maxCumFee * 100)
                    return <line key={`t${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#e5e7eb" strokeWidth="2" strokeDasharray="4 2" />
                  })}
                  {/* Actual area */}
                  {dailyFee.length > 0 && (
                    <polyline
                      points={dailyFee.map((d, i) =>
                        `${i / (dailyFee.length - 1) * 100}%,${110 - (d.cumulative_fee / maxCumFee * 100)}`
                      ).join(' ')}
                      fill="none" stroke="#0344D8" strokeWidth="2.5" strokeLinejoin="round"
                    />
                  )}
                  {/* Dots */}
                  {dailyFee.map((d, i) => (
                    <circle key={i}
                      cx={`${i / (dailyFee.length - 1) * 100}%`}
                      cy={110 - (d.cumulative_fee / maxCumFee * 100)}
                      r="3" fill="#0344D8"
                    >
                      <title>{new Date(d.trx_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}: {formatFee(d.cumulative_fee)}</title>
                    </circle>
                  ))}
                </svg>
                {/* X axis labels */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '9px', color: '#d1d5db' }}>
                  {dailyFee.filter((_, i) => i === 0 || i === Math.floor(dailyFee.length / 2) || i === dailyFee.length - 1).map(d => (
                    <span key={d.trx_date}>{new Date(d.trx_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Chart: Network Velocity */}
          <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#111827' }}>Network Velocity</div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>TRX/hari 30 hari terakhir</div>
              </div>
              <div {...tip('Spike tinggi bisa menandakan event khusus (gajian, bansos). Penurunan konsisten perlu investigasi.')}
                style={{ fontSize: '11px', color: '#9ca3af', cursor: 'default' }}>ⓘ</div>
            </div>
            {loading ? <Skeleton width="100%" height={120} /> : (
              <div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '100px' }}>
                  {velocity.map((v, i) => {
                    const isWeekend = [0, 6].includes(new Date(v.trx_date).getDay())
                    const height = Math.max(4, (v.total_trx / maxTrx) * 88)
                    return (
                      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}
                        title={`${new Date(v.trx_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}: ${formatNum(v.total_trx)} TRX`}>
                        <div style={{ width: '100%', height: `${height}px`, backgroundColor: isWeekend ? '#c7d2fe' : '#0344D8', borderRadius: '2px 2px 0 0', opacity: 0.85 }} />
                      </div>
                    )
                  })}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '9px', color: '#d1d5db' }}>
                  {velocity.filter((_, i) => i === 0 || i === Math.floor(velocity.length / 2) || i === velocity.length - 1).map(v => (
                    <span key={v.trx_date}>{new Date(v.trx_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</span>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '12px', marginTop: '6px', fontSize: '10px', color: '#9ca3af' }}>
                  <span>▪ <span style={{ color: '#0344D8' }}>Weekday</span></span>
                  <span>▪ <span style={{ color: '#c7d2fe' }}>Weekend</span></span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Pie Charts Row: Slot Waktu + Swipe vs DIP */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>

          {/* Slot Waktu */}
          <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px 24px' }}>
            <div style={{ fontSize: '13px', fontWeight: '700', color: '#111827', marginBottom: '4px' }}>
              Pola Waktu Transaksi
              <span {...tip('Distribusi TRX berdasarkan jam transaksi dalam 14 hari terakhir. Dini Hari 00–05, Pagi 06–11, Siang-Sore 12–17, Malam 18–23.')}
                style={{ marginLeft: '6px', fontSize: '11px', color: '#9ca3af', cursor: 'default', fontWeight: '400' }}>ⓘ</span>
            </div>
            <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '16px' }}>14 hari terakhir</div>
            {loading ? <Skeleton width="100%" height={140} /> : (
              <div>
                {/* Donut-style: stacked horizontal bar */}
                <div style={{ display: 'flex', height: '20px', borderRadius: '99px', overflow: 'hidden', marginBottom: '16px' }}>
                  {hourlySlots.map((s, i) => {
                    const colors = ['#6366f1', '#0344D8', '#f59e0b', '#1e40af']
                    return <div key={i} style={{ width: `${s.pct}%`, backgroundColor: colors[i], transition: 'width 0.5s' }} title={`${s.slot_emoji} ${s.slot_name}: ${s.pct}%`} />
                  })}
                </div>
                {/* Legend */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {hourlySlots.map((s, i) => {
                    const colors = ['#6366f1', '#0344D8', '#f59e0b', '#1e40af']
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: colors[i], flexShrink: 0 }} />
                          <span style={{ fontSize: '12px', color: '#374151' }}>{s.slot_emoji} {s.slot_name}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                          <span style={{ fontSize: '11px', color: '#9ca3af' }}>{formatNum(Math.round(s.avg_per_day))} TRX/hari</span>
                          <span style={{ fontSize: '12px', fontWeight: '700', color: colors[i], minWidth: '36px', textAlign: 'right' }}>{s.pct}%</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Swipe vs DIP */}
          <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px 24px' }}>
            <div style={{ fontSize: '13px', fontWeight: '700', color: '#111827', marginBottom: '4px' }}>
              Metode Kartu: DIP vs SWIPE
              <span {...tip('DIP = kartu chip dimasukkan ke mesin. SWIPE = kartu digesek. Rasio DIP tinggi menandakan mayoritas kartu chip (lebih aman).')}
                style={{ marginLeft: '6px', fontSize: '11px', color: '#9ca3af', cursor: 'default', fontWeight: '400' }}>ⓘ</span>
            </div>
            <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '16px' }}>14 hari terakhir</div>
            {loading ? <Skeleton width="100%" height={140} /> : (
              <div>
                {/* Stacked bar */}
                <div style={{ display: 'flex', height: '20px', borderRadius: '99px', overflow: 'hidden', marginBottom: '16px' }}>
                  {cardTypes.map((c, i) => {
                    const colors = ['#0344D8', '#7c3aed']
                    return <div key={i} style={{ width: `${c.pct}%`, backgroundColor: colors[i], transition: 'width 0.5s' }} title={`${c.card_type}: ${c.pct}%`} />
                  })}
                </div>
                {/* Legend */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {cardTypes.map((c, i) => {
                    const colors = ['#0344D8', '#7c3aed']
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: colors[i], flexShrink: 0 }} />
                          <span style={{ fontSize: '12px', color: '#374151' }}>{c.card_type}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                          <span style={{ fontSize: '11px', color: '#9ca3af' }}>{formatNum(Math.round(c.avg_per_day))} TRX/hari</span>
                          <span style={{ fontSize: '12px', fontWeight: '700', color: colors[i], minWidth: '36px', textAlign: 'right' }}>{c.pct}%</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
                {/* Total */}
                <div style={{ marginTop: '12px', padding: '8px 12px', backgroundColor: '#f9fafb', borderRadius: '8px', fontSize: '11px', color: '#6b7280', textAlign: 'center' }}>
                  Total {formatNum(cardTypes.reduce((s, c) => s + c.total_trx, 0))} TRX · {formatNum(Math.round(cardTypes.reduce((s, c) => s + c.avg_per_day, 0)))} avg TRX/hari
                </div>
              </div>
            )}
          </div>

        </div>

        {/* App Distribution */}
        {appDist.length > 0 && (
          <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px 24px', marginBottom: '24px' }}>
            <div style={{ fontSize: '13px', fontWeight: '700', color: '#111827', marginBottom: '4px' }}>
              Distribusi Aplikasi
              <span {...tip('Distribusi transaksi berdasarkan aplikasi yang digunakan agen dalam 14 hari terakhir. MiniATM-Swing adalah aplikasi native KB Bank.')}
                style={{ marginLeft: '6px', fontSize: '11px', color: '#9ca3af', cursor: 'default', fontWeight: '400' }}>ⓘ</span>
            </div>
            <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '16px' }}>14 hari terakhir</div>
            {/* Stacked bar */}
            <div style={{ display: 'flex', height: '16px', borderRadius: '99px', overflow: 'hidden', marginBottom: '16px' }}>
              {appDist.map((a, i) => {
                const colors = ['#0344D8', '#7c3aed']
                return <div key={i} style={{ width: `${a.pct_trx}%`, backgroundColor: colors[i], transition: 'width 0.5s' }} title={`${a.app_name}: ${a.pct_trx}%`} />
              })}
            </div>
            {/* Table */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 90px 110px 60px', gap: '8px', padding: '6px 8px', fontSize: '10px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.05em', borderBottom: '1px solid #f3f4f6' }}>
              <div>APLIKASI</div>
              <div style={{ textAlign: 'right' }}>AGEN</div>
              <div style={{ textAlign: 'right' }}>TRX (14H)</div>
              <div style={{ textAlign: 'right' }}>FEE (14H)</div>
              <div style={{ textAlign: 'right' }}>% TRX</div>
            </div>
            {appDist.map((a, i) => {
              const colors = ['#0344D8', '#7c3aed']
              const tooltips: Record<string, string> = {
                'MiniATM': 'Aplikasi utama MiniATM termasuk BayarBayarPlus.',
                'MiniATM-Swing': 'Aplikasi native KB Bank — versi lama yang masih digunakan sebagian agen.',
              }
              return (
                <div key={a.app_name} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 90px 110px 60px', gap: '8px', padding: '10px 8px', borderBottom: i < appDist.length - 1 ? '1px solid #f9fafb' : 'none', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: colors[i], flexShrink: 0 }} />
                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#111827' }}>{a.app_name}</span>
                    {tooltips[a.app_name] && (
                      <span {...tip(tooltips[a.app_name])} style={{ fontSize: '11px', color: '#9ca3af', cursor: 'default' }}>ⓘ</span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: '#374151', textAlign: 'right' }}>{formatNum(a.total_agents)}</div>
                  <div style={{ fontSize: '12px', color: '#374151', textAlign: 'right' }}>{formatNum(a.total_trx)}</div>
                  <div style={{ fontSize: '12px', color: '#374151', textAlign: 'right' }}>{formatFee(a.total_fee)}</div>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: colors[i], textAlign: 'right' }}>{a.pct_trx}%</div>
                </div>
              )
            })}
          </div>
        )}

        {/* Bucket Distribution */}
        {summary && (
          <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px 24px', marginBottom: '24px' }}>
            <div style={{ fontSize: '13px', fontWeight: '700', color: '#111827', marginBottom: '16px' }}>
              Distribusi Bucket Agen
              <span {...tip('Productive: aktif ≥8 hari/14H. Moderate: aktif 1–7 hari + TRX ≥20. Sporadic: aktif 1–7 hari + TRX <20.')}
                style={{ marginLeft: '6px', fontSize: '11px', color: '#9ca3af', cursor: 'default', fontWeight: '400' }}>ⓘ</span>
            </div>
            {(() => {
              const total = summary.productive_count + summary.moderate_count + summary.sporadic_count
              const prodPct  = Math.round(summary.productive_count / total * 100)
              const modPct   = Math.round(summary.moderate_count   / total * 100)
              const sporPct  = Math.round(summary.sporadic_count   / total * 100)
              return (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                    {[
                      { label: 'Productive', count: summary.productive_count, pct: prodPct,  color: '#166534', bg: '#dcfce7' },
                      { label: 'Moderate',   count: summary.moderate_count,   pct: modPct,   color: '#ca8a04', bg: '#fef9c3' },
                      { label: 'Sporadic',   count: summary.sporadic_count,   pct: sporPct,  color: '#dc2626', bg: '#fee2e2' },
                    ].map(b => (
                      <div key={b.label} style={{ padding: '12px 16px', backgroundColor: b.bg, borderRadius: '8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '20px', fontWeight: '800', color: b.color }}>{formatNum(b.count)}</div>
                        <div style={{ fontSize: '12px', fontWeight: '600', color: b.color }}>{b.label}</div>
                        <div style={{ fontSize: '11px', color: b.color, opacity: 0.7 }}>{b.pct}% dari total</div>
                      </div>
                    ))}
                  </div>
                  {/* Stacked bar */}
                  <div style={{ height: '8px', borderRadius: '99px', overflow: 'hidden', display: 'flex' }}>
                    <div style={{ width: `${prodPct}%`, backgroundColor: '#166534' }} />
                    <div style={{ width: `${modPct}%`,  backgroundColor: '#ca8a04' }} />
                    <div style={{ width: `${sporPct}%`, backgroundColor: '#dc2626' }} />
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {/* Mitra Performance */}
        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px 24px', marginBottom: '24px' }}>
          <div style={{ fontSize: '13px', fontWeight: '700', color: '#111827', marginBottom: '16px' }}>
            Kekuatan Mitra
            <span {...tip('Berdasarkan data 14 hari terakhir. % Growing/Declining = persentase agen yang tren TRX-nya naik/turun vs rata-rata 14H.')}
              style={{ marginLeft: '6px', fontSize: '11px', color: '#9ca3af', cursor: 'default', fontWeight: '400' }}>ⓘ</span>
          </div>
          {loading ? <Skeleton width="100%" height={200} /> : (
            <div>
              {/* Header */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 100px 100px 80px 80px', gap: '8px', padding: '8px 12px', fontSize: '10px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.05em', borderBottom: '1px solid #f3f4f6' }}>
                <div>MITRA</div>
                <div style={{ textAlign: 'right' }}>AGEN</div>
                <div style={{ textAlign: 'right' }}>TRX (14H)</div>
                <div style={{ textAlign: 'right' }}>FEE (14H)</div>
                <div style={{ textAlign: 'right' }}>TRX/AGEN</div>
                <div style={{ textAlign: 'right' }}>
                  <span {...tip('% agen yang avg TRX/hari bulan ini > 120% vs 14H')}>GROWING ⓘ</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span {...tip('% agen yang avg TRX/hari bulan ini < 80% vs 14H')}>DECLINING ⓘ</span>
                </div>
              </div>
              {mitras.map((m, i) => (
                <div key={m.mitra} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 100px 100px 80px 80px', gap: '8px', padding: '10px 12px', borderBottom: i < mitras.length - 1 ? '1px solid #f9fafb' : 'none', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#111827' }}>{m.mitra}</div>
                    {/* Mini bar fee */}
                    <div style={{ marginTop: '4px', height: '3px', backgroundColor: '#f3f4f6', borderRadius: '99px', overflow: 'hidden', width: '80%' }}>
                      <div style={{ width: `${(m.total_fee_14d / maxMitraFee) * 100}%`, height: '100%', backgroundColor: '#0344D8', borderRadius: '99px' }} />
                    </div>
                  </div>
                  <div style={{ fontSize: '12px', color: '#374151', textAlign: 'right' }}>{formatNum(m.total_agents)}</div>
                  <div style={{ fontSize: '12px', color: '#374151', textAlign: 'right' }}>{formatNum(m.total_trx_14d)}</div>
                  <div style={{ fontSize: '12px', color: '#374151', textAlign: 'right' }}>{formatFee(m.total_fee_14d)}</div>
                  <div style={{ fontSize: '12px', color: '#374151', textAlign: 'right' }}>{formatNum(Number(m.avg_trx_per_agent))}</div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: '#166534' }}>{m.growing_pct}%</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: m.declining_pct > 15 ? '#dc2626' : '#374151' }}>{m.declining_pct}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* PIC Performance */}
        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px 24px' }}>
          <div style={{ fontSize: '13px', fontWeight: '700', color: '#111827', marginBottom: '16px' }}>
            Kekuatan PIC
            <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: '400', marginLeft: '8px' }}>Top 30 by fee 14H</span>
            <span {...tip('TRX/Agen = rata-rata TRX per agen yang dikelola PIC ini dalam 14 hari. Indikator kualitas coaching.')}
              style={{ marginLeft: '6px', fontSize: '11px', color: '#9ca3af', cursor: 'default', fontWeight: '400' }}>ⓘ</span>
          </div>
          {loading ? <Skeleton width="100%" height={300} /> : (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 60px 80px 100px 80px 80px', gap: '8px', padding: '8px 12px', fontSize: '10px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.05em', borderBottom: '1px solid #f3f4f6' }}>
                <div>PIC</div>
                <div>MITRA</div>
                <div style={{ textAlign: 'right' }}>AGEN</div>
                <div style={{ textAlign: 'right' }}>TRX/AGEN</div>
                <div style={{ textAlign: 'right' }}>FEE (14H)</div>
                <div style={{ textAlign: 'right' }}>
                  <span {...tip('% agen growing bulan ini')}>GROWING ⓘ</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span {...tip('% agen declining bulan ini')}>DECLINING ⓘ</span>
                </div>
              </div>
              {pics.map((p, i) => (
                <div key={p.pic} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 60px 80px 100px 80px 80px', gap: '8px', padding: '9px 12px', borderBottom: i < pics.length - 1 ? '1px solid #f9fafb' : 'none', alignItems: 'center' }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.pic}</div>
                  <div style={{ fontSize: '11px', color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.mitra}</div>
                  <div style={{ fontSize: '12px', color: '#374151', textAlign: 'right' }}>{formatNum(p.total_agents)}</div>
                  <div style={{ fontSize: '12px', color: '#374151', textAlign: 'right' }}>{formatNum(Number(p.avg_trx_per_agent))}</div>
                  <div style={{ fontSize: '12px', color: '#374151', textAlign: 'right' }}>{formatFee(p.total_fee_14d)}</div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: p.growing_pct > 10 ? '#166534' : '#374151' }}>{p.growing_pct}%</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: p.declining_pct > 20 ? '#dc2626' : p.declining_pct > 10 ? '#ca8a04' : '#374151' }}>{p.declining_pct}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </Layout>
  )
}
