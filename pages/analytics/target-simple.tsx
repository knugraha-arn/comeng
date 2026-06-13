import { useEffect, useState } from 'react'
import Head from 'next/head'
import Layout from '../../components/Layout'
import { createBrowserClient } from '@supabase/ssr'

const MONTHS = [
  'Januari','Februari','Maret','April','Mei','Juni',
  'Juli','Agustus','September','Oktober','November','Desember'
]

const TRANSFER_PCT = 0.67
const CEK_SALDO_PCT = 0.33
const TRANSFER_FEE = 2500
const CEK_SALDO_FEE = 1800
const AVG_FEE_PER_TRX = (TRANSFER_PCT * TRANSFER_FEE) + (CEK_SALDO_PCT * CEK_SALDO_FEE)

function formatRp(val: number): string {
  if (val >= 1000000000) return `Rp ${(val / 1000000000).toFixed(2)}M`
  if (val >= 1000000) return `Rp ${(val / 1000000).toFixed(0)}jt`
  if (val >= 1000) return `Rp ${(val / 1000).toFixed(0)}rb`
  return `Rp ${val.toLocaleString('id')}`
}

function parseRp(val: string): number | null {
  const cleaned = val.replace(/\./g, '').replace(/,/g, '').replace(/[^0-9]/g, '')
  const n = parseInt(cleaned)
  return isNaN(n) ? null : n
}

function DerivedCard({ label, value, sub }: { label: string, value: string, sub?: string }) {
  return (
    <div style={{ padding: '16px 20px', backgroundColor: '#f9fafb', borderRadius: '10px', border: '1px solid #e5e7eb' }}>
      <div style={{ fontSize: '11px', color: '#9ca3af', fontWeight: '600', marginBottom: '6px', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: '22px', fontWeight: '800', color: '#111827' }}>{value}</div>
      {sub && <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>{sub}</div>}
    </div>
  )
}

export default function TargetSimplePage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const now = new Date()
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [monthlyFee, setMonthlyFee] = useState<number | null>(null)
  const [rawFee, setRawFee] = useState('')
  const [agentGapThreshold, setAgentGapThreshold] = useState<number>(5)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [isNew, setIsNew] = useState(true)
  const [tooltip, setTooltip] = useState<{ text: string, x: number, y: number } | null>(null)

  const [monthStats, setMonthStats] = useState<{
    total_fee: number
    total_trx: number
    days_elapsed: number
    days_in_month: number
    avg_fee_per_trx: number
  } | null>(null)

  useEffect(() => { loadTarget() }, [selectedYear, selectedMonth])
  useEffect(() => { loadMonthStats() }, [selectedYear, selectedMonth])

  async function loadTarget() {
    setLoading(true)
    setSaved(false)
    try {
      const res = await fetch(`/api/analytics/targets?year=${selectedYear}&month=${selectedMonth}`)
      const { data } = await res.json()
      if (data?.monthly_fee) {
        setMonthlyFee(data.monthly_fee)
        setRawFee(data.monthly_fee.toLocaleString('id-ID'))
        setAgentGapThreshold(data.agent_gap_threshold ?? 5)
        setIsNew(false)
      } else {
        setMonthlyFee(null)
        setRawFee('')
        setAgentGapThreshold(5)
        setIsNew(true)
      }
    } finally {
      setLoading(false)
    }
  }

  async function loadMonthStats() {
    const { data } = await supabase.rpc('get_monthly_progress')
    if (data) {
      const d = typeof data === 'string' ? JSON.parse(data) : data
      const dataMonth = new Date(d.month_start).getMonth() + 1
      const dataYear  = new Date(d.month_start).getFullYear()
      if (dataMonth === selectedMonth && dataYear === selectedYear) {
        setMonthStats({
          total_fee:      Number(d.total_fee ?? 0),
          total_trx:      Number(d.total_trx ?? 0),
          days_elapsed:   Number(d.days_elapsed ?? 0),
          days_in_month:  Number(d.days_in_month ?? 0),
          avg_fee_per_trx: Number(d.total_fee ?? 0) / Math.max(Number(d.total_trx ?? 1), 1),
        })
      } else {
        setMonthStats(null)
      }
    }
  }

  async function handleSave() {
    if (!monthlyFee) return
    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const daysInMonth   = new Date(selectedYear, selectedMonth, 0).getDate()
      const avgFee        = monthStats?.avg_fee_per_trx ?? AVG_FEE_PER_TRX
      const monthlyTrx    = Math.round(monthlyFee / avgFee)
      const dailyTrx      = Math.round(monthlyTrx / daysInMonth)
      const dailyFee      = Math.round(monthlyFee / daysInMonth)
      const dailyActiveAgents = Math.round(dailyTrx / 6.5)

      const res = await fetch('/api/analytics/targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          period_year:          selectedYear,
          period_month:         selectedMonth,
          monthly_fee:          monthlyFee,
          monthly_transfer_trx: monthlyTrx,
          daily_transfer_trx:   dailyTrx,
          daily_fee:            dailyFee,
          daily_active_agents:  dailyActiveAgents,
          agent_gap_threshold:  agentGapThreshold,
        }),
      })

      if (res.ok) { setSaved(true); setIsNew(false); setTimeout(() => setSaved(false), 3000) }
    } finally { setSaving(false) }
  }

  const daysInMonth        = new Date(selectedYear, selectedMonth, 0).getDate()
  const avgFeePerTrx       = monthStats?.avg_fee_per_trx ?? AVG_FEE_PER_TRX
  const targetMonthlyTrx   = monthlyFee ? Math.round(monthlyFee / avgFeePerTrx) : null
  const targetDailyTrx     = targetMonthlyTrx ? Math.round(targetMonthlyTrx / daysInMonth) : null
  const targetDailyFee     = monthlyFee ? Math.round(monthlyFee / daysInMonth) : null
  const targetDailyAgents  = targetDailyTrx ? Math.round(targetDailyTrx / 6.5) : null
  const feeProgress        = monthStats && monthlyFee ? Math.min(100, Math.round(monthStats.total_fee / monthlyFee * 100)) : null
  const trxProgress        = monthStats && targetMonthlyTrx ? Math.min(100, Math.round(monthStats.total_trx / targetMonthlyTrx * 100)) : null
  const projectedFee       = monthStats && monthStats.days_elapsed > 0 ? Math.round(monthStats.total_fee / monthStats.days_elapsed * monthStats.days_in_month) : null

  const tip = (text: string) => ({
    onMouseEnter: (e: React.MouseEvent) => setTooltip({ text, x: e.clientX, y: e.clientY }),
    onMouseMove:  (e: React.MouseEvent) => setTooltip({ text, x: e.clientX, y: e.clientY }),
    onMouseLeave: () => setTooltip(null),
  })

  return (
    <Layout>
      <Head><title>Target — AMARIS</title></Head>

      {tooltip && (
        <div style={{ position: 'fixed', left: Math.min(tooltip.x + 12, window.innerWidth - 260), top: tooltip.y - 8, zIndex: 9999, backgroundColor: '#1f2937', color: '#f9fafb', fontSize: '11px', padding: '8px 12px', borderRadius: '8px', maxWidth: '240px', lineHeight: '1.5', pointerEvents: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
          {tooltip.text}
        </div>
      )}

      <div style={{ maxWidth: '680px', margin: '0 auto', padding: '32px 24px' }}>

        <div style={{ marginBottom: '28px' }}>
          <div style={{ fontSize: '11px', fontWeight: '600', color: '#9ca3af', letterSpacing: '0.1em', marginBottom: '4px' }}>TARGET BULANAN</div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#111827', margin: 0, letterSpacing: '-0.02em' }}>Target Pendapatan</h1>
          <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>Set target fee bulanan — AMARIS hitung sisanya otomatis.</p>
        </div>

        {/* Period selector */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', padding: '16px', backgroundColor: '#f9fafb', borderRadius: '10px', border: '1px solid #e5e7eb', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>Periode:</span>
          <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))}
            style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '13px', color: '#111827', backgroundColor: '#fff', cursor: 'pointer' }}>
            {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
          <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}
            style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '13px', color: '#111827', backgroundColor: '#fff', cursor: 'pointer' }}>
            {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {isNew && (
            <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '99px', backgroundColor: '#fef9c3', color: '#ca8a04', fontWeight: '600' }}>Belum ada target</span>
          )}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#9ca3af', fontSize: '13px' }}>Memuat...</div>
        ) : (
          <>
            {/* Input Target Fee */}
            <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '24px', marginBottom: '20px' }}>
              <div style={{ fontSize: '14px', fontWeight: '700', color: '#111827', marginBottom: '16px' }}>🎯 Target Fee Bulanan</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '14px', color: '#9ca3af', flexShrink: 0 }}>Rp</span>
                <input
                  type="text"
                  value={rawFee}
                  onChange={e => { setRawFee(e.target.value); setMonthlyFee(parseRp(e.target.value)) }}
                  onBlur={e => { e.target.style.borderColor = '#e5e7eb'; if (monthlyFee) setRawFee(monthlyFee.toLocaleString('id-ID')) }}
                  onFocus={e => e.target.style.borderColor = '#0344D8'}
                  placeholder="contoh: 900.000.000"
                  style={{ flex: 1, padding: '12px 16px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '18px', fontWeight: '700', color: '#111827', outline: 'none' }}
                />
              </div>
              <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                {monthlyFee ? `= ${formatRp(monthlyFee)}` : 'Masukkan target pendapatan bulan ini'}
              </div>
            </div>

            {/* Pengaturan Agen */}
            <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '24px', marginBottom: '20px' }}>
              <div style={{ fontSize: '14px', fontWeight: '700', color: '#111827', marginBottom: '16px' }}>⚙️ Pengaturan Agen</div>

              {/* Gap Threshold */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', backgroundColor: '#f9fafb', borderRadius: '10px', border: '1px solid #e5e7eb' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#111827', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Threshold Absen Agen
                    <span {...tip('Agen dianggap "absen signifikan" jika tidak bertransaksi lebih dari X hari berturut-turut dalam 7 hari pertama window. Dipakai di tab Kembali Aktif halaman Produktifitas Agen.')}
                      style={{ fontSize: '11px', color: '#9ca3af', cursor: 'default' }}>ⓘ</span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                    Agen ditandai 🔴 jika absen &gt; threshold hari berturut-turut
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="number"
                    min={1} max={14}
                    value={agentGapThreshold}
                    onChange={e => setAgentGapThreshold(Math.max(1, Math.min(14, Number(e.target.value))))}
                    style={{ width: '60px', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '16px', fontWeight: '700', color: '#111827', textAlign: 'center', outline: 'none' }}
                  />
                  <span style={{ fontSize: '13px', color: '#6b7280' }}>hari</span>
                </div>
              </div>
            </div>

            {/* Derived Targets */}
            {monthlyFee && targetMonthlyTrx && (
              <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '24px', marginBottom: '20px' }}>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#374151', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>⚡</span> Derivasi Otomatis
                  <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: '400' }}>berdasarkan rata-rata fee/TRX = {formatRp(Math.round(avgFeePerTrx))}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <DerivedCard label="TARGET TRX BULANAN" value={targetMonthlyTrx.toLocaleString('id')} sub={`${targetDailyTrx?.toLocaleString('id')} TRX/hari`} />
                  <DerivedCard label="TARGET FEE HARIAN" value={formatRp(targetDailyFee!)} sub={`dari ${daysInMonth} hari kerja`} />
                  <DerivedCard label="TARGET AGEN AKTIF/HARI" value={targetDailyAgents?.toLocaleString('id') ?? '—'} sub="estimasi baseline 6.5 TRX/agen" />
                  <DerivedCard label="RATA-RATA FEE/TRX" value={formatRp(Math.round(avgFeePerTrx))} sub={monthStats ? 'dari data bulan ini' : 'estimasi historis'} />
                </div>
              </div>
            )}

            {/* Progress Bulan Ini */}
            {monthStats && monthlyFee && (
              <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '24px', marginBottom: '20px' }}>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#374151', marginBottom: '16px' }}>
                  📈 Progress {MONTHS[selectedMonth-1]} {selectedYear}
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '12px', color: '#6b7280' }}>Fee terkumpul</span>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>
                      {formatRp(monthStats.total_fee)} <span style={{ color: '#9ca3af', fontWeight: '400' }}>/ {formatRp(monthlyFee)}</span>
                    </span>
                  </div>
                  <div style={{ height: '8px', backgroundColor: '#f3f4f6', borderRadius: '99px', overflow: 'hidden', marginBottom: '4px' }}>
                    <div style={{ width: `${feeProgress}%`, height: '100%', backgroundColor: feeProgress! >= 100 ? '#22c55e' : '#0344D8', borderRadius: '99px', transition: 'width 0.5s' }} />
                  </div>
                  <div style={{ fontSize: '11px', color: '#9ca3af' }}>{feeProgress}% tercapai · hari ke-{monthStats.days_elapsed} dari {monthStats.days_in_month}</div>
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '12px', color: '#6b7280' }}>TRX terkumpul</span>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>
                      {monthStats.total_trx.toLocaleString('id')} <span style={{ color: '#9ca3af', fontWeight: '400' }}>/ {targetMonthlyTrx?.toLocaleString('id')}</span>
                    </span>
                  </div>
                  <div style={{ height: '8px', backgroundColor: '#f3f4f6', borderRadius: '99px', overflow: 'hidden', marginBottom: '4px' }}>
                    <div style={{ width: `${trxProgress}%`, height: '100%', backgroundColor: trxProgress! >= 100 ? '#22c55e' : '#7c3aed', borderRadius: '99px', transition: 'width 0.5s' }} />
                  </div>
                  <div style={{ fontSize: '11px', color: '#9ca3af' }}>{trxProgress}% tercapai</div>
                </div>
                {projectedFee && (
                  <div style={{ padding: '12px 16px', borderRadius: '8px', backgroundColor: projectedFee >= monthlyFee ? '#f0fdf4' : '#fffbeb', border: `1px solid ${projectedFee >= monthlyFee ? '#bbf7d0' : '#fde68a'}` }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: projectedFee >= monthlyFee ? '#166534' : '#854d0e' }}>
                      {projectedFee >= monthlyFee ? '✅' : '⚠️'} Proyeksi akhir bulan: {formatRp(projectedFee)}
                    </div>
                    <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                      {projectedFee >= monthlyFee ? `Surplus ${formatRp(projectedFee - monthlyFee)} di atas target` : `Kurang ${formatRp(monthlyFee - projectedFee)} dari target — perlu akselerasi`}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Save */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <button onClick={handleSave} disabled={saving || !monthlyFee}
                style={{ flex: 1, padding: '13px', borderRadius: '8px', border: 'none', backgroundColor: saving || !monthlyFee ? '#e5e7eb' : '#0344D8', color: saving || !monthlyFee ? '#9ca3af' : '#fff', fontSize: '14px', fontWeight: '700', cursor: saving || !monthlyFee ? 'not-allowed' : 'pointer', transition: 'all 0.2s' }}>
                {saving ? 'Menyimpan...' : `Simpan Target ${MONTHS[selectedMonth-1]} ${selectedYear}`}
              </button>
              {saved && <div style={{ fontSize: '13px', color: '#16a34a', fontWeight: '600' }}>✅ Tersimpan</div>}
            </div>
          </>
        )}
      </div>
    </Layout>
  )
}
