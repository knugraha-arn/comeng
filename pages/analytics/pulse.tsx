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
  fee_projected_conservative: number
  fee_projected_optimistic: number
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
  dekade_number: number
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

interface FeeBreakdown {
  category:    string
  total_trx:   number
  total_fee:   number
  avg_per_day: number
  pct:         number
}

interface FeeBreakdownDetail {
  label:         string
  sort_order:    number
  total_trx:     number
  total_revenue: number
  unique_agents: number
  pct_trx:       number
}

interface MonthlyHistoris {
  mitra:                    string
  period_year:              number
  period_month:             number
  trx_transfer_dip:         number
  revenue_transfer_dip:     number
  trx_transfer_swipe:       number
  revenue_transfer_swipe:   number
  trx_transfer_3500_dip:    number
  revenue_transfer_3500_dip: number
  trx_transfer_3500_swipe:  number
  revenue_transfer_3500_swipe: number
  trx_cek_saldo_dip:        number
  revenue_cek_saldo_dip:    number
  trx_cek_saldo_swipe:      number
  revenue_cek_saldo_swipe:  number
  trx_on_us:                number
  trx_total:                number
  total_fee:                number
  active_agents:            number
  agents_productive:        number
  agents_moderate:          number
  agents_sporadic:          number
  avg_trx_per_agent:        number
  fee_per_agent:            number
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
  const [hourlySlots, setHourlySlots] = useState<HourlySlot[]>([])
  const [cardTypes, setCardTypes] = useState<CardType[]>([])
  const [appDist, setAppDist] = useState<AppDistribution[]>([])
  const [feeBreakdown, setFeeBreakdown] = useState<FeeBreakdown[]>([])
  const [feeBreakdownDetail, setFeeBreakdownDetail] = useState<FeeBreakdownDetail[]>([])
  const [historisData, setHistorisData] = useState<MonthlyHistoris[]>([])
  const [loadingHistoris, setLoadingHistoris] = useState(false)
  const [pulseTab, setPulseTab] = useState<'mtd' | 'historis'>('mtd')
  const [loading, setLoading] = useState(true)
  const [tooltip, setTooltip] = useState<{ text: string, x: number, y: number } | null>(null)

  useEffect(() => { loadAll() }, [router.asPath])
  useEffect(() => { if (pulseTab === 'historis') loadHistoris() }, [pulseTab])

  async function loadHistoris() {
    setLoadingHistoris(true)
    try {
      const { data } = await supabase
        .from('am_monthly_summary')
        .select('mitra,period_year,period_month,trx_transfer_dip,revenue_transfer_dip,trx_transfer_swipe,revenue_transfer_swipe,trx_transfer_3500_dip,revenue_transfer_3500_dip,trx_transfer_3500_swipe,revenue_transfer_3500_swipe,trx_cek_saldo_dip,revenue_cek_saldo_dip,trx_cek_saldo_swipe,revenue_cek_saldo_swipe,trx_on_us,trx_total,total_fee,active_agents,agents_productive,agents_moderate,agents_sporadic,avg_trx_per_agent,fee_per_agent')
        .gte('period_year', 2026)
        .order('period_year').order('period_month').order('mitra')
      setHistorisData((data ?? []) as MonthlyHistoris[])
    } finally {
      setLoadingHistoris(false)
    }
  }

  async function loadAll() {
    setLoading(true)
    try {
      const [s, d, v, h, c, a, fb] = await Promise.all([
        supabase.rpc('get_pulse_summary'),
        supabase.rpc('get_pulse_daily_fee'),
        supabase.rpc('get_pulse_network_velocity'),
        supabase.rpc('get_pulse_hourly_slots'),
        supabase.rpc('get_pulse_card_types'),
        supabase.rpc('get_pulse_app_distribution'),
        supabase.rpc('get_pulse_fee_breakdown'),
      ])
      setSummary(s.data?.[0] ?? null)
      setDailyFee(d.data ?? [])
      setVelocity(v.data ?? [])
      setHourlySlots(h.data ?? [])
      setCardTypes(c.data ?? [])
      setAppDist(a.data ?? [])
      setFeeBreakdown(fb.data ?? [])
    } finally {
      setLoading(false)
    }
    // Fetch breakdown detail terpisah — punya guard admin/ceo,
    // dipisah supaya kalau gagal tidak mempengaruhi data utama di atas.
    const fbd = await supabase.rpc('get_pulse_fee_breakdown_detail')
    setFeeBreakdownDetail(fbd.data ?? [])
  }

  const tip = (text: string) => ({
    onMouseEnter: (e: React.MouseEvent) => setTooltip({ text, x: e.clientX, y: e.clientY }),
    onMouseMove:  (e: React.MouseEvent) => setTooltip({ text, x: e.clientX, y: e.clientY }),
    onMouseLeave: () => setTooltip(null),
  })

  // Signals
  const signals: { type: 'red' | 'yellow' | 'green', text: string }[] = []
  if (summary) {
    const feeGapConservative = summary.fee_target - summary.fee_projected_conservative
    const feeGapOptimistic   = summary.fee_target - summary.fee_projected_optimistic
    if (feeGapConservative > 0 && feeGapOptimistic > 0) {
      signals.push({ type: 'red', text: `Proyeksi fee Rp ${formatFee(summary.fee_projected_conservative)}–${formatFee(summary.fee_projected_optimistic)} — keduanya di bawah target` })
    } else if (feeGapConservative > 0) {
      signals.push({ type: 'yellow', text: `Proyeksi fee ${formatFee(summary.fee_projected_conservative)}–${formatFee(summary.fee_projected_optimistic)} — skenario optimistis on track` })
    } else {
      signals.push({ type: 'green', text: `Proyeksi fee ${formatFee(summary.fee_projected_conservative)}–${formatFee(summary.fee_projected_optimistic)} — on track ✓` })
    }

    if (summary.trx_avg_daily_mtd < summary.trx_avg_daily_14d * 0.9)
      signals.push({ type: 'yellow', text: `TRX/hari bulan ini (${formatNum(summary.trx_avg_daily_mtd)}) lebih rendah dari rata-rata 14H (${formatNum(summary.trx_avg_daily_14d)})` })

    if (summary.active_agents_today < summary.active_agents_avg_14d * 0.85)
      signals.push({ type: 'yellow', text: `Agen aktif hari ini (${formatNum(summary.active_agents_today)}) di bawah rata-rata 14H (${formatNum(Math.round(summary.active_agents_avg_14d))})` })

  }

  const currentMonth = summary ? MONTHS[new Date(summary.end_date).getMonth()] : ''
  const currentYear  = summary ? new Date(summary.end_date).getFullYear() : ''
  const feeProgress  = summary && summary.fee_target > 0 ? Math.min(100, Math.round(summary.fee_mtd / summary.fee_target * 100)) : 0
  const isOnTrack    = summary ? summary.fee_projected_optimistic >= summary.fee_target : false
  const isDefinitelyOnTrack = summary ? summary.fee_projected_conservative >= summary.fee_target : false

  // Chart helpers
  const maxCumFee    = dailyFee.length > 0 ? Math.max(...dailyFee.map(d => Math.max(d.cumulative_fee, d.cumulative_target))) : 1
  const maxTrx       = velocity.length > 0 ? Math.max(...velocity.map(v => v.total_trx)) : 1

  return (
    <Layout>
      <style>{SKELETON_STYLE}</style>
      <Head><title>Pulse MTD — AMARIS</title></Head>

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
            <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#111827', margin: 0, letterSpacing: '-0.02em' }}>⚡ Pulse MTD</h1>
            <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
              {summary ? (() => {
                const fmtNoYear = (d: string) => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
                const fmtFull   = (d: string) => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
                return `Data transaksi MTD dari tanggal ${fmtNoYear(summary.month_start)} sampai ${fmtFull(summary.end_date)}`
              })() : ''}
            </p>
          </div>
          <button onClick={loadAll} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#374151', fontSize: '12px', cursor: 'pointer' }}>
            ↻ Refresh
          </button>
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', backgroundColor: '#f3f4f6', padding: '4px', borderRadius: '10px', width: 'fit-content' }}>
          {([['mtd', '⚡ MTD Bulan Ini'], ['historis', '📅 Historis']] as [string, string][]).map(([key, label]) => (
            <button key={key} onClick={() => setPulseTab(key as 'mtd' | 'historis')} style={{
              padding: '7px 18px', borderRadius: '7px', border: 'none', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
              backgroundColor: pulseTab === key ? '#fff' : 'transparent',
              color: pulseTab === key ? '#111827' : '#6b7280',
              boxShadow: pulseTab === key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s',
            }}>{label}</button>
          ))}
        </div>

        {/* Signals */}
        {pulseTab === 'mtd' && signals.length > 0 && (
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

        {/* MTD Content */}
        {pulseTab === 'mtd' && (<>

        {/* Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '24px' }}>

          {/* Fee MTD */}
          <div {...tip('Total fee sharing yang terkumpul sejak awal bulan hingga hari terakhir data. MTD = Month to Date.')}
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

          {/* Proyeksi — dua chip: konservatif (D3) dan optimistis (D2) */}
          <div {...tip(`Proyeksi berdasarkan rata-rata dekade. Konservatif = rata-rata dekade ${summary?.dekade_number ?? 3} (sedang berjalan). Optimistis = rata-rata dekade sebelumnya yang biasanya lebih tinggi.`)}
            style={{ backgroundColor: isDefinitelyOnTrack ? '#f0fdf4' : isOnTrack ? '#fefce8' : '#fef2f2', border: `1px solid ${isDefinitelyOnTrack ? '#bbf7d0' : isOnTrack ? '#fde68a' : '#fecaca'}`, borderRadius: '12px', padding: '16px 20px', cursor: 'default' }}>
            {loading ? <Skeleton width="80%" height={28} /> : (
              <>
                <div style={{ fontSize: '11px', color: '#9ca3af', fontWeight: '600', marginBottom: '8px' }}>
                  PROYEKSI AKHIR BULAN
                  <span style={{ marginLeft: '6px', fontWeight: '400' }}>(Dekade {summary?.dekade_number ?? 3})</span>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <div style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', backgroundColor: 'rgba(0,0,0,0.04)', textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', color: '#9ca3af', marginBottom: '3px', fontWeight: '600' }}>KONSERVATIF</div>
                    <div style={{ fontSize: '16px', fontWeight: '800', color: summary?.fee_projected_conservative! >= (summary?.fee_target ?? 0) ? '#166534' : '#dc2626' }}>
                      {formatFee(summary?.fee_projected_conservative ?? 0)}
                    </div>
                  </div>
                  <div style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', backgroundColor: 'rgba(0,0,0,0.04)', textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', color: '#9ca3af', marginBottom: '3px', fontWeight: '600' }}>OPTIMISTIS</div>
                    <div style={{ fontSize: '16px', fontWeight: '800', color: summary?.fee_projected_optimistic! >= (summary?.fee_target ?? 0) ? '#166534' : '#dc2626' }}>
                      {formatFee(summary?.fee_projected_optimistic ?? 0)}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: '11px', color: isDefinitelyOnTrack ? '#166534' : isOnTrack ? '#92400e' : '#dc2626', fontWeight: '600' }}>
                  {isDefinitelyOnTrack ? '✓ Keduanya on track' : isOnTrack ? '⚠️ Hanya optimistis on track' : '↓ Keduanya di bawah target'}
                </div>
                <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>Perlu {formatFee(summary?.fee_needed_per_day ?? 0)}/hari</div>
              </>
            )}
          </div>

          {/* TRX Harian */}
          <div {...tip('Rata-rata TRX per hari bulan berjalan (MTD) dibandingkan rata-rata 14 hari terakhir. Panah menunjukkan apakah MTD lebih tinggi atau lebih rendah dari 14H.')}
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
                <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>Total {formatNum(summary?.trx_mtd ?? 0)} TRX bulan ini (MTD)</div>
              </>
            )}
          </div>

          {/* Agen Aktif */}
          <div {...tip('Jumlah agen yang bertransaksi pada hari terakhir data, dibandingkan rata-rata harian 14 hari terakhir. Bucket Productive/Moderate/Sporadic dihitung dari window 14H.')}
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
                  <span title="Aktif ≥8 hari dalam 14H terakhir">{formatNum(summary?.productive_count ?? 0)} Productive</span>
                  {' · '}
                  <span title="Aktif 1–7 hari + TRX ≥20 dalam 14H">{formatNum(summary?.moderate_count ?? 0)} Moderate</span>
                  {' · '}
                  <span title="Aktif 1–7 hari + TRX <20 dalam 14H">{formatNum(summary?.sporadic_count ?? 0)} Sporadic</span>
                  <span style={{ marginLeft: '4px', opacity: 0.6 }}>(14H)</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Bucket Distribution — dipindah ke posisi 2 */}
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
              <span {...tip('Distribusi TRX per slot waktu bulan berjalan (MTD). Dini Hari 00–06, Pagi 06–12, Siang-Sore 12–18, Malam 18–00.')}
                style={{ marginLeft: '6px', fontSize: '11px', color: '#9ca3af', cursor: 'default', fontWeight: '400' }}>ⓘ</span>
            </div>
            <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '16px' }}>Bulan berjalan (MTD)</div>
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
            <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '16px' }}>Bulan berjalan (MTD)</div>
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

        {/* App Distribution + Fee 3500 Row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>

        {/* App Distribution */}
        {appDist.length > 0 && (
          <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px 24px' }}>
            <div style={{ fontSize: '13px', fontWeight: '700', color: '#111827', marginBottom: '4px' }}>
              Distribusi Aplikasi
              <span {...tip('Distribusi transaksi berdasarkan aplikasi yang digunakan agen bulan berjalan (MTD). MiniATM-Swing adalah aplikasi native KB Bank.')}
                style={{ marginLeft: '6px', fontSize: '11px', color: '#9ca3af', cursor: 'default', fontWeight: '400' }}>ⓘ</span>
            </div>
            <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '16px' }}>Bulan berjalan (MTD)</div>
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

        {/* Fee 3500 vs Lainnya */}
        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px 24px' }}>
          <div style={{ fontSize: '13px', fontWeight: '700', color: '#111827', marginBottom: '4px' }}>
            Fee Rp 3.500 vs Lainnya
            <span onMouseEnter={e => setTooltip({ text: 'Distribusi TRX berdasarkan fee sharing bulan berjalan (MTD). Fee Rp 3.500 = transaksi via rekening Arranet (Lite/Plus).', x: e.clientX, y: e.clientY })} onMouseMove={e => setTooltip({ text: 'Distribusi TRX berdasarkan fee sharing bulan berjalan (MTD). Fee Rp 3.500 = transaksi via rekening Arranet (Lite/Plus).', x: e.clientX, y: e.clientY })} onMouseLeave={() => setTooltip(null)}
              style={{ marginLeft: '6px', fontSize: '11px', color: '#9ca3af', cursor: 'default', fontWeight: '400' }}>ⓘ</span>
          </div>
          <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '16px' }}>Bulan berjalan (MTD)</div>
          {loading ? <Skeleton width="100%" height={120} /> : (
            <div>
              <div style={{ display: 'flex', height: '16px', borderRadius: '99px', overflow: 'hidden', marginBottom: '16px' }}>
                {feeBreakdown.map((f, i) => {
                  const colors = ['#0344D8', '#7c3aed']
                  return <div key={i} style={{ width: `${f.pct}%`, backgroundColor: colors[i] }} title={`${f.category}: ${f.pct}%`} />
                })}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 110px 60px', gap: '8px', padding: '6px 8px', fontSize: '10px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.05em', borderBottom: '1px solid #f3f4f6' }}>
                <div>KATEGORI</div>
                <div style={{ textAlign: 'right' }}>TRX (14H)</div>
                <div style={{ textAlign: 'right' }}>FEE (14H)</div>
                <div style={{ textAlign: 'right' }}>%</div>
              </div>
              {feeBreakdown.map((f, i) => {
                const colors = ['#0344D8', '#7c3aed']
                return (
                  <div key={f.category} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 110px 60px', gap: '8px', padding: '10px 8px', borderBottom: i < feeBreakdown.length - 1 ? '1px solid #f9fafb' : 'none', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: colors[i], flexShrink: 0 }} />
                      <span style={{ fontSize: '13px', fontWeight: '600', color: '#111827' }}>{f.category}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#374151', textAlign: 'right' }}>{formatNum(f.total_trx)}</div>
                    <div style={{ fontSize: '12px', color: '#374151', textAlign: 'right' }}>{formatFee(f.total_fee)}</div>
                    <div style={{ fontSize: '12px', fontWeight: '700', color: colors[i], textAlign: 'right' }}>{f.pct}%</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        </div>{/* end App Distribution + Fee 3500 Row */}

        {/* Breakdown Detail per Tipe Kartu — MTD */}
        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px 24px', marginBottom: '24px' }}>
          <div style={{ fontSize: '13px', fontWeight: '700', color: '#111827', marginBottom: '4px' }}>
            Breakdown Revenue per Tipe Kartu
            <span {...tip('Breakdown TRX dan revenue berdasarkan tipe transaksi dan jenis gesek kartu. DIP = chip, SWIPE = magnetic stripe. Lite & Plus = agen rekening Arranet fee Rp3.500.')}
              style={{ marginLeft: '6px', fontSize: '11px', color: '#9ca3af', cursor: 'default', fontWeight: '400' }}>ⓘ</span>
          </div>
          <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '16px' }}>Bulan berjalan (MTD)</div>
          {loading ? <div style={{ color: '#9ca3af', fontSize: '12px' }}>Memuat...</div> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f9fafb' }}>
                    {['TIPE TRANSAKSI','TOTAL TRX','REVENUE','AGEN UNIK','% TRX'].map((h, i) => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: i === 0 ? 'left' : 'right', fontWeight: '700', color: '#9ca3af', fontSize: '10px', letterSpacing: '0.05em', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {feeBreakdownDetail.map((row, i) => {
                    const isOnUs = row.total_revenue === 0
                    const color = isOnUs ? '#9ca3af' : row.sort_order <= 2 ? '#0344D8' : row.sort_order <= 4 ? '#7c3aed' : '#374151'
                    return (
                      <tr key={row.label} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '10px 12px', fontWeight: '600', color: '#111827' }}>
                          <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '2px', backgroundColor: color, marginRight: '8px', verticalAlign: 'middle' }} />
                          {row.label}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#374151' }}>{row.total_trx.toLocaleString('id')}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#374151', fontWeight: '600' }}>{isOnUs ? '—' : formatFee(row.total_revenue)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#374151' }}>{row.unique_agents.toLocaleString('id')}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '700', color }}>{row.pct_trx}%</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ backgroundColor: '#f1f5f9', borderTop: '2px solid #e5e7eb' }}>
                    <td style={{ padding: '10px 12px', fontWeight: '700', color: '#374151' }}>TOTAL</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '700', color: '#111827' }}>{feeBreakdownDetail.reduce((s,r) => s+r.total_trx, 0).toLocaleString('id')}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '700', color: '#111827' }}>{formatFee(feeBreakdownDetail.reduce((s,r) => s+r.total_revenue, 0))}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#9ca3af' }}>—</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '700', color: '#374151' }}>100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        </>)} {/* end MTD Content */}

        {/* Historis Tab */}
        {pulseTab === 'historis' && (() => {
          const BULAN = ['','Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']
          // Kolom bulan unik
          const months = Array.from(new Set(historisData.map(d => `${d.period_year}-${String(d.period_month).padStart(2,'0')}`)))
            .sort()
          // Agregat per bulan (sum semua mitra)
          const aggByMonth = (mk: string) => {
            const [yr, mo] = mk.split('-').map(Number)
            const rows = historisData.filter(d => d.period_year === yr && d.period_month === mo)
            return {
              trx_transfer_dip:           rows.reduce((s,r) => s + (r.trx_transfer_dip ?? 0), 0),
              revenue_transfer_dip:       rows.reduce((s,r) => s + (r.revenue_transfer_dip ?? 0), 0),
              trx_transfer_swipe:         rows.reduce((s,r) => s + (r.trx_transfer_swipe ?? 0), 0),
              revenue_transfer_swipe:     rows.reduce((s,r) => s + (r.revenue_transfer_swipe ?? 0), 0),
              trx_transfer_3500_dip:      rows.reduce((s,r) => s + (r.trx_transfer_3500_dip ?? 0), 0),
              revenue_transfer_3500_dip:  rows.reduce((s,r) => s + (r.revenue_transfer_3500_dip ?? 0), 0),
              trx_transfer_3500_swipe:    rows.reduce((s,r) => s + (r.trx_transfer_3500_swipe ?? 0), 0),
              revenue_transfer_3500_swipe: rows.reduce((s,r) => s + (r.revenue_transfer_3500_swipe ?? 0), 0),
              trx_cek_saldo_dip:          rows.reduce((s,r) => s + (r.trx_cek_saldo_dip ?? 0), 0),
              revenue_cek_saldo_dip:      rows.reduce((s,r) => s + (r.revenue_cek_saldo_dip ?? 0), 0),
              trx_cek_saldo_swipe:        rows.reduce((s,r) => s + (r.trx_cek_saldo_swipe ?? 0), 0),
              revenue_cek_saldo_swipe:    rows.reduce((s,r) => s + (r.revenue_cek_saldo_swipe ?? 0), 0),
              trx_on_us:                  rows.reduce((s,r) => s + (r.trx_on_us ?? 0), 0),
              trx_total:                  rows.reduce((s,r) => s + (r.trx_total ?? 0), 0),
              total_fee:                  rows.reduce((s,r) => s + Number(r.total_fee ?? 0), 0),
              active_agents:              rows.reduce((s,r) => s + (r.active_agents ?? 0), 0),
              agents_productive:          rows.reduce((s,r) => s + (r.agents_productive ?? 0), 0),
              agents_moderate:            rows.reduce((s,r) => s + (r.agents_moderate ?? 0), 0),
              agents_sporadic:            rows.reduce((s,r) => s + (r.agents_sporadic ?? 0), 0),
            }
          }
          const aggs = months.map(mk => ({ mk, ...aggByMonth(mk) }))

          const rows: { label: string; getValue: (a: ReturnType<typeof aggByMonth>) => { trx: number; rev: number | null } }[] = [
            { label: 'Transfer DIP',              getValue: a => ({ trx: a.trx_transfer_dip,    rev: a.revenue_transfer_dip }) },
            { label: 'Transfer SWIPE',             getValue: a => ({ trx: a.trx_transfer_swipe,  rev: a.revenue_transfer_swipe }) },
            { label: 'Transfer DIP (Lite & Plus)', getValue: a => ({ trx: a.trx_transfer_3500_dip, rev: a.revenue_transfer_3500_dip }) },
            { label: 'Transfer SWIPE (Lite+)',     getValue: a => ({ trx: a.trx_transfer_3500_swipe, rev: a.revenue_transfer_3500_swipe }) },
            { label: 'Cek Saldo DIP',              getValue: a => ({ trx: a.trx_cek_saldo_dip,   rev: a.revenue_cek_saldo_dip }) },
            { label: 'Cek Saldo SWIPE',            getValue: a => ({ trx: a.trx_cek_saldo_swipe, rev: a.revenue_cek_saldo_swipe }) },
            { label: 'On Us (Nobu)',               getValue: a => ({ trx: a.trx_on_us,           rev: null }) },
          ]

          return (
            <div>
              <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px' }}>Breakdown TRX dan revenue per tipe kartu dari snapshot bulanan. Setiap sel: TRX di atas, Revenue di bawah.</div>
              {loadingHistoris ? (
                <div style={{ color: '#9ca3af', fontSize: '13px' }}>Memuat data historis...</div>
              ) : months.length === 0 ? (
                <div style={{ color: '#9ca3af', fontSize: '13px' }}>Belum ada data snapshot.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f9fafb' }}>
                        <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: '700', color: '#9ca3af', fontSize: '11px', letterSpacing: '0.05em', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap', minWidth: '180px' }}>TIPE TRANSAKSI</th>
                        {months.map(mk => {
                          const [yr, mo] = mk.split('-')
                          return (
                            <th key={mk} style={{ padding: '10px 16px', textAlign: 'center', fontWeight: '700', color: '#9ca3af', fontSize: '11px', letterSpacing: '0.05em', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap' }}>
                              {BULAN[parseInt(mo)]} {yr}
                            </th>
                          )
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, ri) => (
                        <tr key={row.label} style={{ backgroundColor: ri % 2 === 0 ? '#fff' : '#fafafa' }}>
                          <td style={{ padding: '10px 14px', fontWeight: '600', color: '#111827', borderBottom: '1px solid #f3f4f6', whiteSpace: 'nowrap' }}>{row.label}</td>
                          {aggs.map(a => {
                            const val = row.getValue(a)
                            return (
                              <td key={a.mk} style={{ padding: '8px 16px', textAlign: 'center', borderBottom: '1px solid #f3f4f6' }}>
                                <div style={{ fontSize: '13px', fontWeight: '600', color: '#111827' }}>{val.trx.toLocaleString('id')}</div>
                                {val.rev !== null && <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '1px' }}>{formatFee(val.rev)}</div>}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ backgroundColor: '#f1f5f9', borderTop: '2px solid #e5e7eb' }}>
                        <td style={{ padding: '10px 14px', fontWeight: '700', color: '#374151' }}>TOTAL TRX</td>
                        {aggs.map(a => <td key={a.mk} style={{ padding: '10px 16px', textAlign: 'center', fontWeight: '700', color: '#111827' }}>{a.trx_total.toLocaleString('id')}</td>)}
                      </tr>
                      <tr style={{ backgroundColor: '#f1f5f9' }}>
                        <td style={{ padding: '10px 14px', fontWeight: '700', color: '#374151' }}>TOTAL REVENUE</td>
                        {aggs.map(a => <td key={a.mk} style={{ padding: '10px 16px', textAlign: 'center', fontWeight: '700', color: '#166534' }}>{formatFee(a.total_fee)}</td>)}
                      </tr>
                      <tr style={{ backgroundColor: '#f1f5f9' }}>
                        <td style={{ padding: '10px 14px', fontWeight: '700', color: '#374151' }}>AGEN AKTIF</td>
                        {aggs.map(a => <td key={a.mk} style={{ padding: '10px 16px', textAlign: 'center', color: '#374151' }}>{a.active_agents.toLocaleString('id')}</td>)}
                      </tr>
                      <tr style={{ backgroundColor: '#f1f5f9' }}>
                        <td style={{ padding: '10px 14px', fontWeight: '700', color: '#374151' }}>Productive / Moderate / Sporadic</td>
                        {aggs.map(a => (
                          <td key={a.mk} style={{ padding: '10px 16px', textAlign: 'center', fontSize: '11px', color: '#374151' }}>
                            <span style={{ color: '#166534' }}>{a.agents_productive}</span>
                            {' / '}
                            <span style={{ color: '#92400e' }}>{a.agents_moderate}</span>
                            {' / '}
                            <span style={{ color: '#6b7280' }}>{a.agents_sporadic}</span>
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )
        })()}

      </div>
    </Layout>
  )
}
