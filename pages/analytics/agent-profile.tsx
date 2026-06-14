import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Layout from '../../components/Layout'
import { createBrowserClient } from '@supabase/ssr'

interface AgentSearch {
  serial_number: string
  merchant_name: string | null
  mitra: string | null
  pic: string | null
}

interface AgentProfile {
  serial_number: string
  merchant_name: string | null
  mitra: string | null
  pic: string | null
  alamat_struk: string | null
  brand: string | null
  tipe_mesin: string | null
  source_app: string | null
  terminal_data_source: string | null
  active_days_14: number
  total_trx_14: number
  total_fee_14: number
  avg_trx_14: number
  bucket: string
  active_days_mtd: number
  total_trx_mtd: number
  total_fee_mtd: number
  avg_trx_mtd: number
  trx_change_pct: number
  trend: string
  transfer_trx_14: number
  cek_saldo_trx_14: number
  dip_trx_14: number
  swipe_trx_14: number
  trx_fee_3500_14: number
  trx_fee_other_14: number
  unique_nasabah_14: number
  avg_trx_per_nasabah: number | null
  trx_dini_hari: number
  trx_pagi: number
  trx_siang_sore: number
  trx_malam: number
  end_date: string
  start_date_14: string
  month_start: string
}

interface DailyChart {
  trx_date: string
  total_trx: number
  transfer_trx: number
  cek_saldo_trx: number
  total_fee: number
  total_amount: number
}

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

const SKELETON_STYLE = `@keyframes shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }`

function Skeleton({ width, height = 14, radius = 6 }: { width: string | number, height?: number, radius?: number }) {
  return <div style={{ width, height, borderRadius: radius, background: 'linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite' }} />
}

function formatFee(val: number): string {
  if (val >= 1000000) return `Rp ${(val / 1000000).toFixed(1)}jt`
  if (val >= 1000) return `Rp ${(val / 1000).toFixed(0)}rb`
  return `Rp ${val}`
}

function formatNum(val: number): string {
  return val.toLocaleString('id')
}

function StackedBar({ a, b, colorA, colorB, labelA, labelB }: { a: number, b: number, colorA: string, colorB: string, labelA: string, labelB: string }) {
  const total = a + b
  const pctA = total > 0 ? Math.round(a / total * 100) : 0
  const pctB = 100 - pctA
  return (
    <div>
      <div style={{ display: 'flex', height: '12px', borderRadius: '99px', overflow: 'hidden', marginBottom: '8px' }}>
        <div style={{ width: `${pctA}%`, backgroundColor: colorA }} />
        <div style={{ width: `${pctB}%`, backgroundColor: colorB }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
        <span style={{ color: colorA, fontWeight: '600' }}>{labelA}: {formatNum(a)} ({pctA}%)</span>
        <span style={{ color: colorB, fontWeight: '600' }}>{labelB}: {formatNum(b)} ({pctB}%)</span>
      </div>
    </div>
  )
}

export default function AgentProfilePage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<AgentSearch[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [searching, setSearching] = useState(false)
  const [filterMitra, setFilterMitra] = useState('')
  const [filterPic, setFilterPic] = useState('')
  const [mitras, setMitras] = useState<string[]>([])
  const [pics, setPics] = useState<string[]>([])

  const [profile, setProfile] = useState<AgentProfile | null>(null)
  const [chart, setChart] = useState<DailyChart[]>([])
  const [loading, setLoading] = useState(false)

  const [tooltip, setTooltip] = useState<{ text: string, x: number, y: number } | null>(null)
  const searchRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<NodeJS.Timeout>()

  // Load from URL query
  useEffect(() => {
    const sn = router.query.sn as string
    if (sn) loadProfile(sn)
    loadFilters()
  }, [router.query.sn])

  async function loadFilters() {
    const { data } = await supabase.rpc('get_agent_search_filters')
    if (data?.[0]) {
      setMitras(data[0].mitras ?? [])
      setPics(data[0].pics ?? [])
    }
  }

  // Click outside to close dropdown
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleSearch(val: string) {
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (val.length < 2) { setSearchResults([]); setShowDropdown(false); return }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const { data } = await supabase.rpc('search_agents', { p_query: val, p_mitra: filterMitra, p_pic: filterPic })
        setSearchResults(data ?? [])
        setShowDropdown(true)
      } finally { setSearching(false) }
    }, 300)
  }

  async function loadProfile(sn: string) {
    setLoading(true)
    setShowDropdown(false)
    try {
      const [profileRes, chartRes] = await Promise.all([
        supabase.rpc('get_agent_profile', { p_serial: sn }),
        supabase.rpc('get_agent_daily_chart', { p_serial: sn }),
      ])
      setProfile(profileRes.data?.[0] ?? null)
      setChart(chartRes.data ?? [])
      router.replace({ query: { sn } }, undefined, { shallow: true })
    } finally { setLoading(false) }
  }

  function selectAgent(agent: AgentSearch) {
    setQuery(agent.merchant_name ?? agent.serial_number)
    loadProfile(agent.serial_number)
  }

  const tip = (text: string) => ({
    onMouseEnter: (e: React.MouseEvent) => setTooltip({ text, x: e.clientX, y: e.clientY }),
    onMouseMove:  (e: React.MouseEvent) => setTooltip({ text, x: e.clientX, y: e.clientY }),
    onMouseLeave: () => setTooltip(null),
  })

  const maxTrx = chart.length > 0 ? Math.max(...chart.map(d => d.total_trx)) : 1
  const trendCfg = profile ? (TREND_CONFIG[profile.trend as keyof typeof TREND_CONFIG] ?? TREND_CONFIG.consistent) : null
  const bucketCfg = profile ? (BUCKET_CONFIG[profile.bucket] ?? BUCKET_CONFIG.sporadic) : null

  return (
    <Layout>
      <style>{SKELETON_STYLE}</style>
      <Head><title>Profil Agen — AMARIS</title></Head>

      {tooltip && (
        <div style={{ position: 'fixed', left: Math.min(tooltip.x + 12, window.innerWidth - 260), top: tooltip.y - 8, zIndex: 9999, backgroundColor: '#1f2937', color: '#f9fafb', fontSize: '11px', padding: '8px 12px', borderRadius: '8px', maxWidth: '240px', lineHeight: '1.5', pointerEvents: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
          {tooltip.text}
        </div>
      )}

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 24px' }}>

        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '11px', fontWeight: '600', color: '#9ca3af', letterSpacing: '0.1em', marginBottom: '4px' }}>ANALITIK AGEN</div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#111827', margin: 0, letterSpacing: '-0.02em' }}>🔍 Profil Agen</h1>
          <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>Cari agen berdasarkan nama atau serial number</p>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <select value={filterMitra} onChange={e => { setFilterMitra(e.target.value); setFilterPic('') }}
            style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px', color: '#374151', backgroundColor: '#fff', cursor: 'pointer' }}>
            <option value="">Semua Mitra</option>
            {mitras.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={filterPic} onChange={e => setFilterPic(e.target.value)}
            style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px', color: '#374151', backgroundColor: '#fff', cursor: 'pointer', maxWidth: '200px' }}>
            <option value="">Semua PIC</option>
            {pics.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          {(filterMitra || filterPic) && (
            <button onClick={() => { setFilterMitra(''); setFilterPic('') }}
              style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#6b7280', fontSize: '12px', cursor: 'pointer' }}>✕ Reset</button>
          )}
        </div>

        {/* Search */}
        <div ref={searchRef} style={{ position: 'relative', marginBottom: '32px' }}>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', fontSize: '16px', color: '#9ca3af' }}>🔍</span>
            <input
              type="text"
              value={query}
              onChange={e => handleSearch(e.target.value)}
              onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
              placeholder="Cari nama merchant atau serial number..."
              style={{ width: '100%', padding: '14px 16px 14px 44px', borderRadius: '12px', border: '2px solid #e5e7eb', fontSize: '14px', color: '#111827', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s' }}
              
              onBlur={e => e.target.style.borderColor = '#e5e7eb'}
            />
            {searching && (
              <span style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', color: '#9ca3af' }}>Mencari...</span>
            )}
          </div>

          {/* Dropdown */}
          {showDropdown && searchResults.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 100, marginTop: '4px', overflow: 'hidden' }}>
              {searchResults.map((a, i) => (
                <div key={a.serial_number} onClick={() => selectAgent(a)}
                  style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: i < searchResults.length - 1 ? '1px solid #f3f4f6' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = '#fff'}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#111827' }}>{a.merchant_name ?? a.serial_number}</div>
                    <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>{a.serial_number} · {a.mitra}</div>
                  </div>
                  <div style={{ fontSize: '11px', color: '#9ca3af' }}>{a.pic}</div>
                </div>
              ))}
            </div>
          )}

          {showDropdown && searchResults.length === 0 && query.length >= 2 && !searching && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 100, marginTop: '4px', padding: '16px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>
              Tidak ada agen ditemukan
            </div>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <Skeleton width="100%" height={120} radius={12} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              {[1,2,3,4,5,6].map(i => <Skeleton key={i} width="100%" height={80} radius={8} />)}
            </div>
            <Skeleton width="100%" height={160} radius={12} />
          </div>
        )}

        {/* Profile */}
        {!loading && profile && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Header Card */}
            <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#111827', margin: '0 0 4px 0' }}>{profile.merchant_name ?? profile.serial_number}</h2>
                  <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '10px' }}>{profile.serial_number}</div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {trendCfg && (
                      <span style={{ padding: '2px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: '700', backgroundColor: trendCfg.bg, color: trendCfg.color, border: `1px solid ${trendCfg.border}` }}>
                        {trendCfg.icon} {trendCfg.label}
                      </span>
                    )}
                    {bucketCfg && (
                      <span style={{ padding: '2px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: '700', backgroundColor: bucketCfg.bg, color: bucketCfg.color, border: `1px solid ${bucketCfg.border}` }}>
                        {bucketCfg.label}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontSize: '11px', color: '#9ca3af' }}>
                  <div>Data per {new Date(profile.end_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                  <div>14H: {new Date(profile.start_date_14).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} – {new Date(profile.end_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</div>
                </div>
              </div>

              {/* Info grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #f3f4f6' }}>
                {[
                  { label: 'Mitra',    value: profile.mitra },
                  { label: 'PIC',      value: profile.pic },
                  { label: 'Brand',    value: profile.brand },
                  { label: 'Mesin',    value: profile.tipe_mesin },
                  { label: 'Aplikasi', value: profile.source_app },
                  { label: 'Terminal', value: profile.terminal_data_source },
                  { label: 'Alamat',   value: profile.alamat_struk },
                ].filter(r => r.value).map(r => (
                  <div key={r.label}>
                    <div style={{ fontSize: '10px', color: '#9ca3af', fontWeight: '600', marginBottom: '2px' }}>{r.label.toUpperCase()}</div>
                    <div style={{ fontSize: '12px', color: '#111827', fontWeight: '500' }}>{r.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Metrics: 14H vs MTD */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

              {/* 14H */}
              <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px 24px' }}>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.05em', marginBottom: '16px' }}>
                  PERFORMA 14 HARI TERAKHIR
                  <span {...tip('Data 14 hari terakhir dari tanggal terakhir upload.')} style={{ marginLeft: '6px', cursor: 'default', fontWeight: '400' }}>ⓘ</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {[
                    { label: 'Hari Aktif',   value: `${profile.active_days_14} hari` },
                    { label: 'Total TRX',    value: formatNum(profile.total_trx_14) },
                    { label: 'Avg TRX/Hari', value: String(profile.avg_trx_14), highlight: true },
                    { label: 'Total Fee',    value: formatFee(profile.total_fee_14) },
                  ].map(s => (
                    <div key={s.label} style={{ padding: '10px 12px', backgroundColor: s.highlight ? '#eff6ff' : '#f9fafb', borderRadius: '8px', textAlign: 'center', border: s.highlight ? '1px solid #bfdbfe' : 'none' }}>
                      <div style={{ fontSize: '16px', fontWeight: '700', color: s.highlight ? '#1e40af' : '#111827' }}>{s.value}</div>
                      <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* MTD */}
              <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px 24px' }}>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.05em', marginBottom: '16px' }}>
                  PERFORMA BULAN INI (MTD)
                  <span {...tip('Data sejak awal bulan berjalan hingga hari terakhir upload.')} style={{ marginLeft: '6px', cursor: 'default', fontWeight: '400' }}>ⓘ</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {[
                    { label: 'Hari Aktif',   value: `${profile.active_days_mtd} hari` },
                    { label: 'Total TRX',    value: formatNum(profile.total_trx_mtd) },
                    { label: 'Avg TRX/Hari', value: String(profile.avg_trx_mtd), highlight: true },
                    { label: 'Total Fee',    value: formatFee(profile.total_fee_mtd) },
                  ].map(s => (
                    <div key={s.label} style={{ padding: '10px 12px', backgroundColor: s.highlight ? (trendCfg?.bg ?? '#f9fafb') : '#f9fafb', borderRadius: '8px', textAlign: 'center', border: s.highlight ? `1px solid ${trendCfg?.border ?? '#e5e7eb'}` : 'none' }}>
                      <div style={{ fontSize: '16px', fontWeight: '700', color: s.highlight ? (trendCfg?.color ?? '#111827') : '#111827' }}>{s.value}</div>
                      <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>{s.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: '12px', padding: '8px 12px', borderRadius: '8px', backgroundColor: profile.trx_change_pct >= 0 ? '#f0fdf4' : '#fef2f2', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: profile.trx_change_pct >= 0 ? '#166534' : '#dc2626' }}>
                  {profile.trx_change_pct >= 0 ? '↑' : '↓'} {Math.abs(profile.trx_change_pct)}% vs avg 14H
                </div>
              </div>
            </div>

            {/* Chart TRX Harian */}
            {chart.length > 0 && (
              <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px 24px' }}>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#111827', marginBottom: '4px' }}>TRX Per Hari (14H)</div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '16px' }}>
                  {new Date(profile.start_date_14).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} – {new Date(profile.end_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
                {/* Bar chart */}
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '100px' }}>
                  {(() => {
                    // Fill missing dates
                    const sd = new Date(profile.start_date_14)
                    const ed = new Date(profile.end_date)
                    const days = []
                    const cur = new Date(sd)
                    while (cur <= ed) {
                      const dateStr = cur.toISOString().split('T')[0]
                      const found = chart.find(d => d.trx_date === dateStr)
                      days.push({ date: dateStr, trx: found?.total_trx ?? 0, fee: found?.total_fee ?? 0 })
                      cur.setDate(cur.getDate() + 1)
                    }
                    return days.map((d, i) => {
                      const isWeekend = [0, 6].includes(new Date(d.date).getDay())
                      const isThisMonth = d.date >= profile.month_start
                      const baseColor = trendCfg?.color ?? '#0344D8'
                      const weekendColor = isThisMonth
                        ? (baseColor === '#166534' ? '#4ade80' : baseColor === '#92400e' ? '#fbbf24' : '#93c5fd')
                        : '#e2e8f0'
                      const barColor = d.trx === 0 ? '#f3f4f6'
                        : isThisMonth ? (isWeekend ? weekendColor : baseColor)
                        : (isWeekend ? '#e2e8f0' : '#94a3b8')
                      return (
                        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}
                          title={`${new Date(d.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}: ${formatNum(d.trx)} TRX · ${formatFee(d.fee)}`}>
                          <div style={{ width: '100%', height: `${Math.max(d.trx > 0 ? 8 : 4, (d.trx / maxTrx) * 80)}px`, backgroundColor: barColor, borderRadius: '3px 3px 0 0', transition: 'height 0.3s' }} />
                          <div style={{ fontSize: '8px', color: '#6b7280', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                            {new Date(d.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                          </div>
                        </div>
                      )
                    })
                  })()}
                </div>
                <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '10px', color: '#9ca3af' }}>
                  <span>▪ <span style={{ color: '#94a3b8' }}>Bulan lalu (weekday)</span></span>
                  <span>▪ <span style={{ color: '#e2e8f0' }}>Bulan lalu (weekend)</span></span>
                  <span>▪ <span style={{ color: trendCfg?.color ?? '#0344D8' }}>Bulan ini (weekday)</span></span>
                  <span>▪ <span style={{ color: trendCfg?.color === '#166534' ? '#4ade80' : trendCfg?.color === '#92400e' ? '#fbbf24' : '#93c5fd' }}>Bulan ini (weekend)</span></span>
                </div>
              </div>
            )}

            {/* Breakdown Charts Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

              {/* Tipe Transaksi */}
              <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px 24px' }}>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#111827', marginBottom: '4px' }}>
                  Transfer vs Cek Saldo
                  <span {...tip('Distribusi jenis transaksi dalam 14 hari terakhir.')} style={{ marginLeft: '6px', fontSize: '11px', color: '#9ca3af', cursor: 'default', fontWeight: '400' }}>ⓘ</span>
                </div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '16px' }}>14H</div>
                <StackedBar
                  a={profile.transfer_trx_14} b={profile.cek_saldo_trx_14}
                  colorA='#0344D8' colorB='#7c3aed'
                  labelA='Transfer' labelB='Cek Saldo'
                />
              </div>

              {/* DIP vs SWIPE */}
              <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px 24px' }}>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#111827', marginBottom: '4px' }}>
                  DIP vs SWIPE
                  <span {...tip('DIP = kartu chip dimasukkan. SWIPE = kartu digesek. DIP lebih aman dan umumnya dominan.')} style={{ marginLeft: '6px', fontSize: '11px', color: '#9ca3af', cursor: 'default', fontWeight: '400' }}>ⓘ</span>
                </div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '16px' }}>14H</div>
                <StackedBar
                  a={profile.dip_trx_14} b={profile.swipe_trx_14}
                  colorA='#166534' colorB='#ca8a04'
                  labelA='DIP' labelB='SWIPE'
                />
              </div>

              {/* Fee 3500 vs lainnya */}
              <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px 24px' }}>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#111827', marginBottom: '4px' }}>
                  Fee 3.500 vs Lainnya
                  <span {...tip('Transaksi dengan fee Rp 3.500 (MiniATM/Lite/Plus via rekening Arranet) vs transaksi fee lain.')} style={{ marginLeft: '6px', fontSize: '11px', color: '#9ca3af', cursor: 'default', fontWeight: '400' }}>ⓘ</span>
                </div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '16px' }}>14H</div>
                <StackedBar
                  a={profile.trx_fee_3500_14} b={profile.trx_fee_other_14}
                  colorA='#dc2626' colorB='#0344D8'
                  labelA='Fee 3.500' labelB='Lainnya'
                />
              </div>

              {/* Pola Waktu */}
              <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px 24px' }}>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#111827', marginBottom: '4px' }}>
                  Pola Waktu Transaksi
                  <span {...tip('Distribusi TRX per slot waktu dalam 14H. Dini Hari 00–05, Pagi 06–11, Siang-Sore 12–17, Malam 18–23.')} style={{ marginLeft: '6px', fontSize: '11px', color: '#9ca3af', cursor: 'default', fontWeight: '400' }}>ⓘ</span>
                </div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '16px' }}>14H</div>
                {(() => {
                  const slots = [
                    { label: '🌙 Dini Hari', val: profile.trx_dini_hari,  color: '#6366f1' },
                    { label: '🌅 Pagi',       val: profile.trx_pagi,       color: '#0344D8' },
                    { label: '☀️ Siang-Sore', val: profile.trx_siang_sore, color: '#f59e0b' },
                    { label: '🌆 Malam',      val: profile.trx_malam,      color: '#1e40af' },
                  ]
                  const total = slots.reduce((s, x) => s + x.val, 0)
                  return (
                    <div>
                      <div style={{ display: 'flex', height: '12px', borderRadius: '99px', overflow: 'hidden', marginBottom: '8px' }}>
                        {slots.map(s => (
                          <div key={s.label} style={{ width: `${total > 0 ? (s.val / total * 100) : 0}%`, backgroundColor: s.color }} />
                        ))}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {slots.map(s => (
                          <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                            <span style={{ color: '#374151' }}>{s.label}</span>
                            <span style={{ fontWeight: '600', color: s.color }}>{formatNum(s.val)} ({total > 0 ? Math.round(s.val / total * 100) : 0}%)</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>

            {/* Loyalitas Nasabah */}
            {profile.unique_nasabah_14 > 0 && (
              <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px 24px' }}>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#111827', marginBottom: '4px' }}>
                  Loyalitas Nasabah
                  <span {...tip('Berdasarkan from_account unik pada transaksi Transfer dalam 14H. Avg TRX/nasabah tinggi = nasabah sering balik ke agen ini.')} style={{ marginLeft: '6px', fontSize: '11px', color: '#9ca3af', cursor: 'default', fontWeight: '400' }}>ⓘ</span>
                </div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '16px' }}>14H · hanya transaksi Transfer</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div style={{ padding: '12px 16px', backgroundColor: '#f9fafb', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', fontWeight: '800', color: '#111827' }}>{formatNum(profile.unique_nasabah_14)}</div>
                    <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>Nasabah unik (14H)</div>
                  </div>
                  <div style={{ padding: '12px 16px', backgroundColor: profile.avg_trx_per_nasabah && profile.avg_trx_per_nasabah >= 5 ? '#dcfce7' : '#f9fafb', borderRadius: '8px', textAlign: 'center', border: profile.avg_trx_per_nasabah && profile.avg_trx_per_nasabah >= 5 ? '1px solid #bbf7d0' : 'none' }}>
                    <div style={{ fontSize: '24px', fontWeight: '800', color: profile.avg_trx_per_nasabah && profile.avg_trx_per_nasabah >= 5 ? '#166534' : '#111827' }}>
                      {profile.avg_trx_per_nasabah?.toFixed(1) ?? '—'}x
                    </div>
                    <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>Avg TRX/nasabah</div>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}

        {/* Empty state */}
        {!loading && !profile && (
          <div style={{ textAlign: 'center', padding: '80px 24px', color: '#9ca3af' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔍</div>
            <div style={{ fontSize: '16px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>Cari Profil Agen</div>
            <div style={{ fontSize: '13px' }}>Ketik nama merchant atau serial number di atas</div>
          </div>
        )}

      </div>
    </Layout>
  )
}
