import { useEffect, useState } from 'react'
import Head from 'next/head'
import Layout from '../../components/Layout'
import { createBrowserClient } from '@supabase/ssr'

const MONTHS = [
  'Januari','Februari','Maret','April','Mei','Juni',
  'Juli','Agustus','September','Oktober','November','Desember'
]

interface Target {
  period_year: number
  period_month: number
  daily_active_agents: number | null
  daily_transfer_trx: number | null
  daily_fee: number | null
  monthly_transfer_trx: number | null
  monthly_fee: number | null
  daily_growing_agents: number | null
  monthly_potential_converted: number | null
  daily_at_risk_max: number | null
  mitra_min_active_ratio: number | null
  pic_min_active_ratio: number | null
  min_transfer_trx_potential: number | null
}

const DEFAULTS: Omit<Target, 'period_year' | 'period_month'> = {
  daily_active_agents: 1570,
  daily_transfer_trx: 13333,
  daily_fee: 30000000,
  monthly_transfer_trx: 400000,
  monthly_fee: 900000000,
  daily_growing_agents: 900,
  monthly_potential_converted: 50,
  daily_at_risk_max: 600,
  mitra_min_active_ratio: 40,
  pic_min_active_ratio: 30,
  min_transfer_trx_potential: 5,
}

function parseRp(val: string): number | null {
  const cleaned = val.replace(/\./g, '').replace(/,/g, '')
  const n = parseInt(cleaned)
  return isNaN(n) ? null : n
}

// ── Dipindahkan ke luar TargetsPage agar tidak re-mount saat state berubah ──

function Field({
  label, value, onChange, prefix, suffix, hint
}: {
  label: string
  value: number | null
  onChange: (v: number | null) => void
  prefix?: string
  suffix?: string
  hint?: string
}) {
  const [raw, setRaw] = useState(value?.toLocaleString('id-ID') ?? '')

  useEffect(() => {
    setRaw(value?.toLocaleString('id-ID') ?? '')
  }, [value])

  return (
    <div style={{ marginBottom: '16px' }}>
      <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '6px' }}>
        {label}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {prefix && <span style={{ fontSize: '13px', color: '#9ca3af', flexShrink: 0 }}>{prefix}</span>}
        <input
          type="text"
          value={raw}
          onChange={e => {
            setRaw(e.target.value)
            onChange(parseRp(e.target.value))
          }}
          style={{
            flex: 1, padding: '9px 12px', borderRadius: '8px',
            border: '1px solid #e5e7eb', fontSize: '14px', color: '#111827',
            outline: 'none', fontWeight: '500',
          }}
          onFocus={e => e.target.style.borderColor = '#0344D8'}
          onBlur={e => {
            e.target.style.borderColor = '#e5e7eb'
            if (value) setRaw(value.toLocaleString('id-ID'))
          }}
        />
        {suffix && <span style={{ fontSize: '13px', color: '#9ca3af', flexShrink: 0 }}>{suffix}</span>}
      </div>
      {hint && <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>{hint}</div>}
    </div>
  )
}

function Section({ title, icon, children }: { title: string, icon: string, children: React.ReactNode }) {
  return (
    <div style={{
      backgroundColor: '#fff', border: '1px solid #e5e7eb',
      borderRadius: '12px', padding: '20px 24px', marginBottom: '16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
        <span style={{ fontSize: '16px' }}>{icon}</span>
        <span style={{ fontSize: '14px', fontWeight: '700', color: '#111827' }}>{title}</span>
      </div>
      {children}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────

export default function TargetsPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const now = new Date()
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [form, setForm] = useState<Omit<Target, 'period_year' | 'period_month'>>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [isNew, setIsNew] = useState(true)

  useEffect(() => { loadTarget() }, [selectedYear, selectedMonth])

  async function loadTarget() {
    setLoading(true)
    setSaved(false)
    try {
      const res = await fetch(`/api/analytics/targets?year=${selectedYear}&month=${selectedMonth}`)
      const { data } = await res.json()
      if (data) {
        setForm({
          daily_active_agents:         data.daily_active_agents,
          daily_transfer_trx:          data.daily_transfer_trx,
          daily_fee:                   data.daily_fee,
          monthly_transfer_trx:        data.monthly_transfer_trx,
          monthly_fee:                 data.monthly_fee,
          daily_growing_agents:        data.daily_growing_agents,
          monthly_potential_converted: data.monthly_potential_converted,
          daily_at_risk_max:           data.daily_at_risk_max,
          mitra_min_active_ratio:      data.mitra_min_active_ratio,
          pic_min_active_ratio:        data.pic_min_active_ratio,
          min_transfer_trx_potential:  data.min_transfer_trx_potential,
        })
        setIsNew(false)
      } else {
        setForm(DEFAULTS)
        setIsNew(true)
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const res = await fetch('/api/analytics/targets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          period_year: selectedYear,
          period_month: selectedMonth,
          ...form,
        }),
      })

      if (res.ok) {
        setSaved(true)
        setIsNew(false)
        setTimeout(() => setSaved(false), 3000)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Layout>
      <Head><title>Target — AMARIS</title></Head>

      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '32px 24px' }}>

        {/* Header */}
        <div style={{ marginBottom: '28px' }}>
          <div style={{ fontSize: '11px', fontWeight: '600', color: '#9ca3af', letterSpacing: '0.1em', marginBottom: '4px' }}>
            KONFIGURASI TARGET
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#111827', margin: 0, letterSpacing: '-0.02em' }}>
            Target Kinerja
          </h1>
        </div>

        {/* Period selector */}
        <div style={{
          display: 'flex', gap: '12px', marginBottom: '24px',
          padding: '16px', backgroundColor: '#f9fafb',
          borderRadius: '10px', border: '1px solid #e5e7eb',
          alignItems: 'center',
        }}>
          <span style={{ fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>Periode:</span>
          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(Number(e.target.value))}
            style={{
              padding: '7px 12px', borderRadius: '8px', border: '1px solid #e5e7eb',
              fontSize: '13px', color: '#111827', backgroundColor: '#fff', cursor: 'pointer',
            }}
          >
            {MONTHS.map((m, i) => (
              <option key={i+1} value={i+1}>{m}</option>
            ))}
          </select>
          <select
            value={selectedYear}
            onChange={e => setSelectedYear(Number(e.target.value))}
            style={{
              padding: '7px 12px', borderRadius: '8px', border: '1px solid #e5e7eb',
              fontSize: '13px', color: '#111827', backgroundColor: '#fff', cursor: 'pointer',
            }}
          >
            {[2025, 2026, 2027].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          {isNew && (
            <span style={{
              fontSize: '11px', padding: '3px 10px', borderRadius: '99px',
              backgroundColor: '#fef9c3', color: '#ca8a04', fontWeight: '600',
            }}>
              Belum ada target
            </span>
          )}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#9ca3af', fontSize: '13px' }}>
            Memuat...
          </div>
        ) : (
          <>
            {/* Target Harian */}
            <Section title="Target Harian" icon="📅">
              <Field
                label="Agen aktif per hari"
                value={form.daily_active_agents}
                onChange={v => setForm(f => ({ ...f, daily_active_agents: v }))}
                suffix="terminal"
                hint="Baseline aktual: ~1.300 terminal/hari"
              />
              <Field
                label="Transaksi TRANSFER per hari"
                value={form.daily_transfer_trx}
                onChange={v => setForm(f => ({ ...f, daily_transfer_trx: v }))}
                suffix="trx"
                hint="Baseline aktual: ~10.500 trx/hari"
              />
              <Field
                label="Fee per hari"
                value={form.daily_fee}
                onChange={v => setForm(f => ({ ...f, daily_fee: v }))}
                prefix="Rp"
                hint="Baseline aktual: ~Rp 24 juta/hari"
              />
            </Section>

            {/* Target Bulanan */}
            <Section title="Target Bulanan" icon="📆">
              <Field
                label="Transaksi TRANSFER per bulan"
                value={form.monthly_transfer_trx}
                onChange={v => setForm(f => ({ ...f, monthly_transfer_trx: v }))}
                suffix="trx"
                hint="Target yang disarankan: 400.000 trx/bulan"
              />
              <Field
                label="Fee per bulan"
                value={form.monthly_fee}
                onChange={v => setForm(f => ({ ...f, monthly_fee: v }))}
                prefix="Rp"
                hint="Target yang disarankan: Rp 900 juta/bulan"
              />
            </Section>

            {/* Target Bucket */}
            <Section title="Target Bucket Agen" icon="🎯">
              <Field
                label="Minimum agen Productive per hari"
                value={form.daily_growing_agents}
                onChange={v => setForm(f => ({ ...f, daily_growing_agents: v }))}
                suffix="terminal"
                hint="Agen aktif 8–14 hari dengan trx konsisten"
              />
              <Field
                label="Target konversi Moderate → Productive per bulan"
                value={form.monthly_potential_converted}
                onChange={v => setForm(f => ({ ...f, monthly_potential_converted: v }))}
                suffix="terminal"
                hint="Berapa agen Moderate yang berhasil naik ke Productive"
              />
              <Field
                label="Maksimum agen Sporadic per hari (alarm)"
                value={form.daily_at_risk_max}
                onChange={v => setForm(f => ({ ...f, daily_at_risk_max: v }))}
                suffix="terminal"
                hint="Batas alarm jumlah agen Sporadic per hari"
              />
            </Section>

            {/* Threshold Insight */}
            <Section title="Threshold Insight Engine" icon="⚙️">
              <Field
                label="Minimum active ratio Mitra"
                value={form.mitra_min_active_ratio}
                onChange={v => setForm(f => ({ ...f, mitra_min_active_ratio: v }))}
                suffix="%"
                hint="Di bawah ini → Mitra masuk Risiko Utama"
              />
              <Field
                label="Minimum active ratio PIC"
                value={form.pic_min_active_ratio}
                onChange={v => setForm(f => ({ ...f, pic_min_active_ratio: v }))}
                suffix="%"
                hint="Di bawah ini → PIC masuk Risiko Utama"
              />
              <Field
                label="Minimum trx TRANSFER per hari aktif (Moderate)"
                value={form.min_transfer_trx_potential}
                onChange={v => setForm(f => ({ ...f, min_transfer_trx_potential: v }))}
                suffix="trx"
                hint="Di atas ini → agen Sporadic dikategorikan sebagai Moderate"
              />
            </Section>

            {/* Save button */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  flex: 1, padding: '13px', borderRadius: '8px', border: 'none',
                  backgroundColor: saving ? '#e5e7eb' : '#0344D8',
                  color: saving ? '#9ca3af' : '#fff',
                  fontSize: '14px', fontWeight: '700', cursor: saving ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                {saving ? 'Menyimpan...' : `Simpan Target ${MONTHS[selectedMonth-1]} ${selectedYear}`}
              </button>
              {saved && (
                <div style={{
                  fontSize: '13px', color: '#16a34a', fontWeight: '600',
                  display: 'flex', alignItems: 'center', gap: '6px',
                }}>
                  ✅ Tersimpan
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  )
}
