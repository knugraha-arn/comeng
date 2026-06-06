import { useState } from 'react'
import Head from 'next/head'
import Layout from '../../components/Layout'
import { createBrowserClient } from '@supabase/ssr'

const DATES = ['2026-05-29', '2026-05-30', '2026-05-31', '2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04']

interface StepResult {
  date: string
  step: 'metrics' | 'insights'
  status: 'waiting' | 'running' | 'done' | 'error'
  message?: string
}

export default function AdminTrigger() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const [results, setResults] = useState<StepResult[]>([])
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)

  function updateResult(date: string, step: 'metrics' | 'insights', update: Partial<StepResult>) {
    setResults(prev => prev.map(r =>
      r.date === date && r.step === step ? { ...r, ...update } : r
    ))
  }

  async function runAll() {
    setRunning(true)
    setDone(false)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    // Init all steps
    const initial: StepResult[] = DATES.flatMap(date => [
      { date, step: 'metrics' as const, status: 'waiting' as const },
      { date, step: 'insights' as const, status: 'waiting' as const },
    ])
    setResults(initial)

    for (const date of DATES) {
      // Step 1: compute metrics
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
          message: `${data.summary?.agents_computed ?? 0} agen, ${data.summary?.mitra_computed ?? 0} mitra, ${data.summary?.pic_computed ?? 0} PIC`
        })
      } catch (err) {
        updateResult(date, 'metrics', { status: 'error', message: err instanceof Error ? err.message : 'Error' })
        continue
      }

      // Step 2: run insights
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
          message: `${data.insights_generated ?? 0} insights`
        })
      } catch (err) {
        updateResult(date, 'insights', { status: 'error', message: err instanceof Error ? err.message : 'Error' })
      }
    }

    setRunning(false)
    setDone(true)
  }

  const statusColor = {
    waiting: '#d1d5db',
    running: '#3b82f6',
    done: '#22c55e',
    error: '#ef4444',
  }

  const statusLabel = {
    waiting: 'Menunggu',
    running: 'Berjalan...',
    done: 'Selesai',
    error: 'Error',
  }

  return (
    <Layout>
      <Head><title>Trigger Metrics — AMARIS</title></Head>
      <div style={{ maxWidth: '560px', margin: '0 auto', padding: '32px 16px' }}>

        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: '700', color: '#1A1F2E', marginBottom: '4px' }}>
            Compute Metrics & Insights
          </h1>
          <p style={{ fontSize: '13px', color: '#888' }}>
            Trigger manual untuk menghitung metrics dan insights dari data yang sudah diupload.
          </p>
        </div>

        <div style={{
          padding: '14px 16px', backgroundColor: '#fffbeb',
          border: '1px solid #fde68a', borderRadius: '8px', marginBottom: '24px',
          fontSize: '12px', color: '#854d0e',
        }}>
          ⚠️ Tanggal yang akan diproses: <strong>{DATES.join(', ')}</strong>
        </div>

        {!running && !done && (
          <button
            onClick={runAll}
            style={{
              width: '100%', padding: '13px', borderRadius: '8px', border: 'none',
              backgroundColor: '#0344D8', color: '#fff',
              fontSize: '14px', fontWeight: '700', cursor: 'pointer',
            }}
          >
            Jalankan Sekarang
          </button>
        )}

        {results.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '20px' }}>
            {DATES.map(date => (
              <div key={date} style={{
                padding: '14px 16px', backgroundColor: '#f9fafb',
                border: '1px solid #e5e7eb', borderRadius: '8px',
              }}>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#1A1F2E', marginBottom: '10px' }}>
                  {date}
                </div>
                {(['metrics', 'insights'] as const).map(step => {
                  const r = results.find(x => x.date === date && x.step === step)
                  if (!r) return null
                  return (
                    <div key={step} style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '6px 0',
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
                        <span style={{ fontSize: '11px', color: '#888' }}>{r.message}</span>
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
      </div>
    </Layout>
  )
}
