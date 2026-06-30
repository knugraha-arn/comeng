import { useEffect, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
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
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const now = new Date()
  const [activeTab, setActiveTab] = useState<'platform' | 'mitra'>('platform')
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)

  // --- State Platform Target ---
  const [monthlyFee, setMonthlyFee] = useState<number | null>(null)
  const [rawFee, setRawFee] = useState('')
  const [agentGapThreshold, setAgentGapThreshold] = useState<number>(5)
  const [ontrackPct, setOntrackPct]               = useState<number>(90)
  const [atriskPct, setAtriskPct]                 = useState<number>(70)
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

  // --- State Target Mitra ---
  type MitraProgress = {
    mitra: string
    period_year: number
    period_month: number
    target_trx: number
    actual_trx_mtd: number
    achievement_pct: number
    notes: string | null
    days_elapsed: number
    days_in_month: number
    baseline_trx: number
    avg_trx_current_dekade: number
    dekade_number: number
    ontrack_threshold: number
    atrisk_threshold: number
  }
  type MitraBaseline = {
    mitra: string
    trx_transfer: number
    trx_total: number
    total_fee: number
    active_agents: number
    is_current_month: boolean
    snapshotted_at: string
  }
  const [mitraProgress, setMitraProgress]   = useState<MitraProgress[]>([])
  const [mitraBaseline, setMitraBaseline]   = useState<MitraBaseline[]>([])
  const [loadingMitra, setLoadingMitra]     = useState(false)
  const [showAddForm, setShowAddForm]       = useState(false)
  const [newMitra, setNewMitra]             = useState('')
  const [newTargetTrx, setNewTargetTrx]     = useState('')
  const [newNotes, setNewNotes]             = useState('')
  const [savingMitra, setSavingMitra]       = useState(false)
  const [savedMitra, setSavedMitra]         = useState(false)
  const [deletingMitra, setDeletingMitra]   = useState('')
  const [snapshotting, setSnapshotting]     = useState(false)
  const [snapshotDone, setSnapshotDone]     = useState(false)
  const [savingThreshold, setSavingThreshold] = useState(false)
  const [savedThreshold, setSavedThreshold]   = useState(false)

  // Mitra yang sudah ada target (untuk exclude dari dropdown)
  const mitraWithTarget = mitraProgress.map(p => p.mitra)

  // Auth check — hanya admin/super_admin yang boleh akses
  useEffect(() => {
    async function checkRole() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.replace('/login'); return }
      const { data: userData } = await supabase
        .from('users').select('role').eq('id', session.user.id).single()
      if (!['admin', 'super_admin'].includes(userData?.role ?? '')) {
        router.replace('/unauthorized')
      }
    }
    checkRole()
  }, [])

  useEffect(() => { loadTarget() }, [selectedYear, selectedMonth])
  useEffect(() => { loadMonthStats() }, [selectedYear, selectedMonth])
  useEffect(() => { loadMitraData() }, [selectedYear, selectedMonth])

  async function loadMitraData() {
    setLoadingMitra(true)
    try {
      const [progressRes, baselineRes] = await Promise.all([
        supabase.rpc('get_mitra_target_progress', { p_year: selectedYear, p_month: selectedMonth }),
        supabase.rpc('get_mitra_summary_baseline', { p_year: selectedYear, p_month: selectedMonth }),
      ])
      setMitraProgress(progressRes.data ?? [])
      setMitraBaseline(baselineRes.data ?? [])
    } finally {
      setLoadingMitra(false)
    }
  }

  async function saveMitraTarget() {
    if (!newMitra || !newTargetTrx) return
    setSavingMitra(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      await supabase.from('am_mitra_targets').upsert({
        mitra: newMitra,
        period_year: selectedYear,
        period_month: selectedMonth,
        target_trx: parseInt(newTargetTrx.replace(/\./g, '')),
        notes: newNotes || null,
        created_by: session.user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'mitra,period_year,period_month' })
      setNewMitra(''); setNewTargetTrx(''); setNewNotes('')
      setShowAddForm(false)
      setSavedMitra(true)
      setTimeout(() => setSavedMitra(false), 2000)
      await loadMitraData()
    } finally { setSavingMitra(false) }
  }

  async function deleteMitraTarget(mitra: string) {
    setDeletingMitra(mitra)
    try {
      await supabase.from('am_mitra_targets').delete()
        .eq('mitra', mitra)
        .eq('period_year', selectedYear)
        .eq('period_month', selectedMonth)
      await loadMitraData()
    } finally { setDeletingMitra('') }
  }

  async function snapshotNow() {
    setSnapshotting(true)
    setSnapshotDone(false)
    try {
      const { error } = await supabase.rpc('snapshot_monthly_summary', {
        p_year: selectedYear,
        p_month: selectedMonth,
      })
      if (error) throw error
      setSnapshotDone(true)
      setTimeout(() => setSnapshotDone(false), 3000)
      await loadMitraData()
    } catch (err) {
      console.error('Snapshot error:', err)
    } finally { setSnapshotting(false) }
  }

  // Simpan threshold prediksi (on track / at risk) langsung dari tab Mitra —
  // sebelumnya cuma bisa disimpan lewat tombol "Simpan Target" di tab Platform,
  // yang juga ke-disable kalau monthly_fee belum diisi. Endpoint upsert hanya
  // mengubah kolom yang dikirim, jadi monthly_fee & field lain di am_targets
  // tidak ikut tertimpa.
  async function saveThreshold() {
    setSavingThreshold(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const res = await fetch('/api/analytics/targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          period_year:             selectedYear,
          period_month:            selectedMonth,
          achievement_ontrack_pct: ontrackPct,
          achievement_atrisk_pct:  atriskPct,
        }),
      })

      if (res.ok) {
        setSavedThreshold(true)
        setTimeout(() => setSavedThreshold(false), 2000)
        await loadMitraData() // refresh tabel — RPC baca threshold langsung dari am_targets
      }
    } finally { setSavingThreshold(false) }
  }

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
        setOntrackPct(data.achievement_ontrack_pct ?? 90)
        setAtriskPct(data.achievement_atrisk_pct ?? 70)
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
          agent_gap_threshold:        agentGapThreshold,
          achievement_ontrack_pct:    ontrackPct,
          achievement_atrisk_pct:     atriskPct,
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
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#111827', margin: 0, letterSpacing: '-0.02em' }}>Target Bisnis</h1>
          <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>Set target fee platform dan target TRX per Mitra.</p>
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', backgroundColor: '#f3f4f6', padding: '4px', borderRadius: '10px', width: 'fit-content' }}>
          {[
            { key: 'platform', label: 'Target Platform' },
            { key: 'mitra', label: 'Target Mitra' },
          ].map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key as 'platform' | 'mitra')}
              style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: activeTab === t.key ? '600' : '400', background: activeTab === t.key ? '#fff' : 'transparent', color: activeTab === t.key ? '#111827' : '#6b7280', boxShadow: activeTab === t.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none', transition: 'all 0.15s' }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Period selector — shared untuk kedua tab */}
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
          {activeTab === 'platform' && isNew && (
            <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '99px', backgroundColor: '#fef9c3', color: '#ca8a04', fontWeight: '600' }}>Belum ada target</span>
          )}
        </div>

        {/* ── Tab Target Platform ──────────────────────────────── */}
        {activeTab === 'platform' && (loading ? (
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', backgroundColor: '#f9fafb', borderRadius: '10px', border: '1px solid #e5e7eb', marginBottom: '10px' }}>
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
                  <input type="number" min={1} max={14} value={agentGapThreshold}
                    onChange={e => setAgentGapThreshold(Math.max(1, Math.min(14, Number(e.target.value))))}
                    style={{ width: '60px', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '16px', fontWeight: '700', color: '#111827', textAlign: 'center', outline: 'none' }} />
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
        ))}

        {/* ── Tab Target Mitra ─────────────────────────────────── */}
        {activeTab === 'mitra' && (
          <div>

            {/* Threshold Prediksi — di antara period selector dan Target TRX */}
            <div style={{ marginBottom: '20px', padding: '14px 16px', backgroundColor: '#f9fafb', borderRadius: '10px', border: '1px solid #e5e7eb' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#111827', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  Threshold Prediksi
                  <span style={{ fontSize: '11px', color: '#9ca3af', cursor: 'default' }} title="Menentukan label prediksi di kolom PREDIKSI dan di tab Achievement Kekuatan Mitra. Proyeksi ≥ On Track = ✅, antara At Risk dan On Track = ⚠️, di bawah At Risk = ↓.">ⓘ</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button onClick={saveThreshold} disabled={savingThreshold}
                    style={{ padding: '6px 14px', borderRadius: '7px', border: 'none', backgroundColor: savingThreshold ? '#e5e7eb' : '#0344D8', color: savingThreshold ? '#9ca3af' : '#fff', fontSize: '12px', fontWeight: '600', cursor: savingThreshold ? 'not-allowed' : 'pointer' }}>
                    {savingThreshold ? 'Menyimpan...' : 'Simpan'}
                  </button>
                  {savedThreshold && <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: '600' }}>✅ Tersimpan</span>}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '10px 12px', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#166534' }}>✅ On Track</div>
                    <div style={{ fontSize: '10px', color: '#9ca3af' }}>Proyeksi ≥ nilai ini</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input type="number" min={50} max={100} value={ontrackPct}
                      onChange={e => setOntrackPct(Math.max(50, Math.min(100, Number(e.target.value))))}
                      style={{ width: '55px', padding: '6px 8px', borderRadius: '6px', border: '1px solid #e5e7eb', fontSize: '14px', fontWeight: '700', color: '#166534', textAlign: 'center', outline: 'none' }} />
                    <span style={{ fontSize: '12px', color: '#6b7280' }}>%</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '10px 12px', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#92400e' }}>⚠️ At Risk</div>
                    <div style={{ fontSize: '10px', color: '#9ca3af' }}>Proyeksi antara ini & On Track</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input type="number" min={1} max={99} value={atriskPct}
                      onChange={e => setAtriskPct(Math.max(1, Math.min(99, Number(e.target.value))))}
                      style={{ width: '55px', padding: '6px 8px', borderRadius: '6px', border: '1px solid #e5e7eb', fontSize: '14px', fontWeight: '700', color: '#92400e', textAlign: 'center', outline: 'none' }} />
                    <span style={{ fontSize: '12px', color: '#6b7280' }}>%</span>
                  </div>
                </div>
              </div>
              <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                Di bawah {atriskPct}% → ↓ Jauh dari target &nbsp;·&nbsp; {atriskPct}–{ontrackPct}% → ⚠️ At risk &nbsp;·&nbsp; ≥ {ontrackPct}% → ✅ On track
              </div>
            </div>

            {/* Header + tombol tambah */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#111827' }}>
                  Target TRX Transfer — {MONTHS[selectedMonth-1]} {selectedYear}
                </div>
                <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>
                  Hanya TRX Transfer (bukan Cek Saldo). Tambah Mitra yang ingin dipantau.
                </div>
              </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button onClick={snapshotNow} disabled={snapshotting}
                title={`Simpan snapshot data ${MONTHS[selectedMonth-1]} ${selectedYear} ke riwayat bulanan — dipakai sebagai baseline target bulan depan`}
                style={{ padding: '9px 14px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: snapshotting ? '#9ca3af' : '#374151', fontSize: '12px', fontWeight: '500', cursor: snapshotting ? 'not-allowed' : 'pointer' }}>
                {snapshotting ? '⟳ Menyimpan...' : '📸 Snapshot Bulan Ini'}
              </button>
              {snapshotDone && <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: '600' }}>✅ Tersimpan</span>}
              <button onClick={() => setShowAddForm(!showAddForm)}
                style={{ padding: '9px 16px', borderRadius: '8px', border: 'none', backgroundColor: '#0344D8', color: '#fff', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                + Tambah Mitra
              </button>
            </div>
            </div>

            {/* Form tambah target */}
            {showAddForm && (
              <div style={{ padding: '16px', border: '1px solid #e5e7eb', borderRadius: '10px', backgroundColor: '#f9fafb', marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '12px' }}>Tambah Target Mitra</div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr', gap: '10px', marginBottom: '10px' }}>
                  <div>
                    <label style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>Mitra</label>
                    <select value={newMitra} onChange={e => {
                      setNewMitra(e.target.value)
                      // Auto-isi baseline dari bulan lalu sebagai saran
                      const b = mitraBaseline.find(m => m.mitra === e.target.value)
                      if (b) setNewTargetTrx(b.trx_transfer.toLocaleString('id'))
                    }}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '13px' }}>
                      <option value="">Pilih Mitra...</option>
                      {mitraBaseline
                        .filter(m => !mitraWithTarget.includes(m.mitra))
                        .map(m => (
                          <option key={m.mitra} value={m.mitra}>{m.mitra}</option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>
                      Target TRX Transfer
                      {newMitra && mitraBaseline.find(m => m.mitra === newMitra) && (() => {
                        const b = mitraBaseline.find(m => m.mitra === newMitra)!
                        const snapDate = new Date(b.snapshotted_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
                        const label = b.is_current_month
                          ? `MTD s/d ${snapDate}`
                          : `Full ${MONTHS[selectedMonth - 2] ?? MONTHS[11]}`
                        return (
                          <span style={{ color: b.is_current_month ? '#ca8a04' : '#0344D8', marginLeft: '6px' }}>
                            ({label}: {b.trx_transfer.toLocaleString('id')})
                          </span>
                        )
                      })()}
                    </label>
                    <input
                      value={newTargetTrx}
                      onChange={e => setNewTargetTrx(e.target.value)}
                      placeholder="contoh: 65000"
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '13px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>Catatan (opsional)</label>
                    <input value={newNotes} onChange={e => setNewNotes(e.target.value)} placeholder="misal: target naik 5% dari Juni"
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '13px', boxSizing: 'border-box' }} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={saveMitraTarget} disabled={savingMitra || !newMitra || !newTargetTrx}
                    style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', backgroundColor: !newMitra || !newTargetTrx ? '#e5e7eb' : '#0344D8', color: !newMitra || !newTargetTrx ? '#9ca3af' : '#fff', fontSize: '12px', fontWeight: '600', cursor: !newMitra || !newTargetTrx ? 'not-allowed' : 'pointer' }}>
                    {savingMitra ? 'Menyimpan...' : 'Simpan'}
                  </button>
                  <button onClick={() => { setShowAddForm(false); setNewMitra(''); setNewTargetTrx(''); setNewNotes('') }}
                    style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#6b7280', fontSize: '12px', cursor: 'pointer' }}>
                    Batal
                  </button>
                  {savedMitra && <span style={{ fontSize: '12px', color: '#16a34a', fontWeight: '600', alignSelf: 'center' }}>✅ Tersimpan</span>}
                </div>
              </div>
            )}

            {/* Tabel progress */}
            {loadingMitra ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>Memuat...</div>
            ) : mitraProgress.length === 0 ? (
              <div style={{ padding: '48px', textAlign: 'center', backgroundColor: '#f9fafb', borderRadius: '10px', border: '1px dashed #e5e7eb' }}>
                <div style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '8px' }}>Belum ada target Mitra untuk {MONTHS[selectedMonth-1]} {selectedYear}</div>
                <div style={{ fontSize: '12px', color: '#c4c4c4' }}>Klik "+ Tambah Mitra" untuk mulai set target</div>
              </div>
            ) : (
              <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
                {/* Header tabel */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px 100px 90px 28px', padding: '10px 16px', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.05em' }}>
                  <div>MITRA</div>
                  <div style={{ textAlign: 'right' }}>TARGET TRX</div>
                  <div style={{ textAlign: 'right' }}>AKTUAL MTD</div>
                  <div style={{ textAlign: 'center' }}>ACHIEVEMENT</div>
                  <div style={{ textAlign: 'center' }}>PREDIKSI</div>
                  <div />
                </div>
                {mitraProgress.map((p, i) => {
                  const pct = Number(p.achievement_pct)
                  const color = pct >= 80 ? '#166534' : pct >= 50 ? '#92400e' : '#dc2626'
                  const bg    = pct >= 80 ? '#f0fdf4' : pct >= 50 ? '#fefce8' : '#fef2f2'
                  const projected = p.avg_trx_current_dekade > 0
                    ? Math.round(p.actual_trx_mtd + p.avg_trx_current_dekade * (p.days_in_month - p.days_elapsed))
                    : Math.round(p.actual_trx_mtd / Math.max(p.days_elapsed, 1) * p.days_in_month)
                  // 3-tier prediksi — pakai threshold tersimpan di am_targets (p.ontrack_threshold /
                  // p.atrisk_threshold), bukan angka mentah projected >= target_trx, supaya sesuai
                  // dengan threshold yang di-set admin di kotak Threshold Prediksi.
                  const projectedPct = p.target_trx > 0 ? (projected / p.target_trx) * 100 : 0
                  const ontrackThreshold = p.ontrack_threshold != null ? Number(p.ontrack_threshold) : 90
                  const atriskThreshold  = p.atrisk_threshold  != null ? Number(p.atrisk_threshold)  : 70
                  const prediction: 'on_track' | 'at_risk' | 'far' =
                    projectedPct >= ontrackThreshold ? 'on_track' :
                    projectedPct >= atriskThreshold  ? 'at_risk'  : 'far'
                  const predictionCfg = {
                    on_track: { label: '✅ On track',          bg: '#f0fdf4', color: '#166534' },
                    at_risk:  { label: '⚠️ At risk',            bg: '#fef9c3', color: '#92400e' },
                    far:      { label: '↓ Jauh dari target',   bg: '#fef2f2', color: '#dc2626' },
                  }[prediction]
                  return (
                    <div key={p.mitra} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px 100px 90px 28px', padding: '12px 16px', borderBottom: i < mitraProgress.length - 1 ? '1px solid #f3f4f6' : 'none', alignItems: 'center', backgroundColor: '#fff' }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#111827' }}>{p.mitra}</div>
                        <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '1px' }}>
                          Proyeksi: {projected.toLocaleString('id')} TRX
                          {p.notes && ` · ${p.notes}`}
                        </div>
                        <div style={{ marginTop: '6px', height: '4px', backgroundColor: '#f3f4f6', borderRadius: '99px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, backgroundColor: color, borderRadius: '99px', transition: 'width 0.5s' }} />
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', fontSize: '13px', fontWeight: '600', color: '#374151' }}>
                        {p.target_trx.toLocaleString('id')}
                      </div>
                      <div style={{ textAlign: 'right', fontSize: '13px', color: '#374151' }}>
                        {p.actual_trx_mtd.toLocaleString('id')}
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <span style={{ padding: '3px 10px', borderRadius: '99px', fontSize: '12px', fontWeight: '700', backgroundColor: bg, color }}>
                          {pct}%
                        </span>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <span style={{ padding: '3px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: '600', backgroundColor: predictionCfg.bg, color: predictionCfg.color }}>
                          {predictionCfg.label}
                        </span>
                      </div>
                      <button onClick={() => deleteMitraTarget(p.mitra)} disabled={deletingMitra === p.mitra}
                        style={{ padding: '2px 6px', borderRadius: '6px', border: '1px solid #fee2e2', backgroundColor: '#fff', color: '#dc2626', fontSize: '11px', cursor: 'pointer', opacity: deletingMitra === p.mitra ? 0.5 : 1 }}>
                        ✕
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Info hari berjalan */}
            {mitraProgress.length > 0 && (
              <div style={{ marginTop: '12px', fontSize: '11px', color: '#9ca3af', textAlign: 'right' }}>
                Hari berjalan: {mitraProgress[0].days_elapsed} dari {mitraProgress[0].days_in_month} hari
              </div>
            )}
          </div>
        )}

      </div>
    </Layout>
  )
}
