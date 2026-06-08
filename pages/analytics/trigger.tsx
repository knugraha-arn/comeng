import { useEffect, useState } from 'react'
import Head from 'next/head'
import Layout from '../../components/Layout'
import { createBrowserClient } from '@supabase/ssr'

interface StepResult {
  date: string
  step: 'metrics' | 'insights'
  status: 'waiting' | 'running' | 'done' | 'error'
  message?: string
}

export default function TriggerPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [dates, setDates] = useState<string[]>([])
  const [missingDates, setMissingDates] = useState<string[]>([])
  const [results, setResults] = useState<StepResult[]>([])
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadDates() }, [])

  async function loadDates() {
    setLoading(true)
    try {
      // Ambil semua tanggal yang sudah diupload
      const { data: sessions } = await supabase
        .from('am_upload_sessions')
        .select('upload_date')
        .eq('status', 'completed')
        .order('upload_date', { ascending: true })

      const uploadedDates = (sessions ?? []).map(s => s.upload_date as string)
      setDates(uploadedDates)

      // Cari tanggal yang belum ada di agent_daily_metrics
      if (uploadedDates.length > 0) {
        const { data: computedDates } = await supabase
          .from('am_agent_daily_metrics')
          .select('metric_date')
          .in('metric_date', uploadedDates)

        const computed = new Set((computedDates ?? []).map(r => r.metric_date as string))
        setMissingDates(uploadedDates.filter(d => !computed.has(d)))
      }
    } finally {
      setLoading(false)
    }
  }

  function updateResult(date: string, step: 'metrics' | 'insights', update: Partial<StepResult>) {
    setResults(prev => prev.map(r =>
      r.date === date && r.step === step ? { ...r, ...update } : r
    ))
  }

  async function runAll(selectedDates: string[]) {
    setRunning(true)
    setDone(false)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const initial: StepResult[] = selectedDates.flatMap(date => [
      { date, step: 'metrics' as const, status: 'waiting' as const },
      { date, step: 'insights' as const, status: 'waiting' as const },
    ])
    setResults(initial)

    for (const date of selectedDates) {
      // Compute metrics
      updateResult(date, 'metrics', { status: 'running' })
      try {
        const res = await fetch('/api/analytics/compute-metrics', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ date }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Failed')
        updateResult(date, 'metrics', {
          status: 'done',
          message: `${data.summary?.agents_computed ?? 0} agen, ${data.summary?.mitra_computed ?? 0} mitra, ${data.summary?.pic_computed ?? 0} PIC`,
        })
      } catch (err) {
        updateResult(date, 'metrics', { status: 'error', message: err instanceof Error ? err.message : 'Error' })
        continue
      }

      // Run insights
      updateResult(date, 'insights', { status: 'running' })
      try {
        const res = await fetch('/api/analytics/run-insights', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ date }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Failed')
        updateResult(date, 'insights', {
          status: 'done',
          message: `${data.insights_generated ?? 0} insights`,
        })
      } catch (err) {
        updateResult(date, 'insights', { status: 'error', message: err instanceof Error ? err.message : 'Error' })
      }
    }

    setRunning(false)
    setDone(true)
    await loadDates()
  }

  const statusColor = { waiting: '#d1d5db', running: '#3b82f6', done: '#22c55e', error: '#ef4444' }
  const statusLabel = { waiting: 'Menunggu', running: 'Berjalan...', done: 'Selesai', error: 'Error' }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <Layout>
      <Head><title>Compute Metrics — AMARIS</title></Head>
      <div style={{ maxWidth: '620px', margin: '0 auto', padding: '32px 24px' }}>

        <div style={{ marginBottom: '28px' }}>
          <div style={{ fontSize: '11px', fontWeight: '600', color: '#9ca3af', letterSpacing: '0.1em', marginBottom: '4px' }}>
            ADMIN
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#111827', margin: 0, letterSpacing: '-0.02em' }}>
            Compute Metrics & Insights
          </h1>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#9ca3af', fontSize: '13px' }}>Memuat...</div>
        ) : (
          <>
            {/* Status summary */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr',
              gap: '12px', marginBottom: '24px',
            }}>
              <div style={{
                padding: '16px', backgroundColor: '#f0fdf4',
                border: '1px solid #bbf7d0', borderRadius: '10px',
              }}>
                <div style={{ fontSize: '28px', fontWeight: '800', color: '#166534' }}>
                  {dates.length}
                </div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>Tanggal uploaded</div>
              </div>
              <div style={{
                padding: '16px',
                backgroundColor: missingDates.length > 0 ? '#fef9c3' : '#f0fdf4',
                border: `1px solid ${missingDates.length > 0 ? '#fde68a' : '#bbf7d0'}`,
                borderRadius: '10px',
              }}>
                <div style={{ fontSize: '28px', fontWeight: '800', color: missingDates.length > 0 ? '#ca8a04' : '#166534' }}>
                  {missingDates.length}
                </div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>Belum di-compute</div>
              </div>
            </div>

            {/* Missing dates */}
            {missingDates.length > 0 && !running && !done && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{
                  padding: '14px 16px', backgroundColor: '#fffbeb',
                  border: '1px solid #fde68a', borderRadius: '8px', marginBottom: '16px',
                }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#854d0e', marginBottom: '6px' }}>
                    ⚠️ Tanggal yang belum di-compute:
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {missingDates.map(d => (
                      <span key={d} style={{
                        padding: '3px 10px', backgroundColor: '#fef9c3',
                        borderRadius: '99px', fontSize: '12px', color: '#854d0e', fontWeight: '600',
                      }}>
                        {formatDate(d)}
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => runAll(missingDates)}
                  style={{
                    width: '100%', padding: '13px', borderRadius: '8px', border: 'none',
                    backgroundColor: '#0344D8', color: '#fff',
                    fontSize: '14px', fontWeight: '700', cursor: 'pointer',
                  }}
                >
                  Compute {missingDates.length} Tanggal yang Missing
                </button>
              </div>
            )}

            {/* All computed */}
            {missingDates.length === 0 && !running && !done && dates.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{
                  padding: '14px 16px', backgroundColor: '#f0fdf4',
                  border: '1px solid #bbf7d0', borderRadius: '8px', marginBottom: '16px',
                  fontSize: '13px', color: '#166534', fontWeight: '500',
                }}>
                  ✅ Semua tanggal sudah di-compute
                </div>
                <button
                  onClick={() => runAll(dates)}
                  style={{
                    width: '100%', padding: '13px', borderRadius: '8px',
                    border: '1px solid #e5e7eb', backgroundColor: '#fff',
                    color: '#374151', fontSize: '13px', cursor: 'pointer',
                  }}
                >
                  Re-compute semua {dates.length} tanggal
                </button>
              </div>
            )}

            {/* No data */}
            {dates.length === 0 && (
              <div style={{
                textAlign: 'center', padding: '40px',
                backgroundColor: '#f9fafb', borderRadius: '8px',
                border: '1px dashed #e5e7eb', color: '#9ca3af', fontSize: '13px',
              }}>
                Belum ada data yang diupload
              </div>
            )}

            {/* Progress */}
            {results.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '20px' }}>
                {dates.filter(d => results.some(r => r.date === d)).map(date => (
                  <div key={date} style={{
                    padding: '14px 16px', backgroundColor: '#f9fafb',
                    border: '1px solid #e5e7eb', borderRadius: '8px',
                  }}>
                    <div style={{ fontSize: '12px', fontWeight: '700', color: '#1A1F2E', marginBottom: '8px' }}>
                      {formatDate(date)}
                    </div>
                    {(['metrics', 'insights'] as const).map(step => {
                      const r = results.find(x => x.date === date && x.step === step)
                      if (!r) return null
                      return (
                        <div key={step} style={{
                          display: 'flex', alignItems: 'center', gap: '10px',
                          padding: '5px 0',
                          borderBottom: step === 'metrics' ? '1px solid #f3f4f6' : 'none',
                        }}>
                          <div style={{
                            width: '8px', height: '8px', borderRadius: '50%',
                            backgroundColor: statusColor[r.status], flexShrink: 0,
                          }} />
                          <span style={{ fontSize: '12px', color: '#555', flex: 1 }}>
                            {step === 'metrics' ? 'Compute Metrics' : 'Run Insights'}
                          </span>
                          <span style={{ fontSize: '11px', color: statusColor[r.status], fontWeight: '600' }}>
                            {statusLabel[r.status]}
                          </span>
                          {r.message && (
                            <span style={{ fontSize: '11px', color: '#9ca3af' }}>{r.message}</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            )}

            {done && (
              <div style={{
                marginTop: '20px', padding: '14px', backgroundColor: '#f0fdf4',
                border: '1px solid #bbf7d0', borderRadius: '8px',
                fontSize: '13px', color: '#166534', fontWeight: '600', textAlign: 'center',
              }}>
                ✅ Selesai — buka Morning Brief untuk lihat hasilnya
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  )
}
