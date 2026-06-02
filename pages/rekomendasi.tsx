import { useState, useEffect, useRef } from 'react'
import Layout from '@/components/Layout'
import { supabase } from '@/lib/supabase'

type Recommendation = {
  ranger: string
  priority: 'critical' | 'warning' | 'positive'
  title: string
  body: string
  actions: string[]
}

type SavedRecommendation = {
  id: string
  week_key: string
  generated_at: string
  items: Recommendation[]
}

const PROGRESS_STEPS = [
  { pct: 10, label: 'Mengambil data Ranger...' },
  { pct: 30, label: 'Membaca aktivitas WAG...' },
  { pct: 50, label: 'Menyusun konteks analisis...' },
  { pct: 70, label: 'Mengirim ke Claude AI...' },
  { pct: 85, label: 'Menganalisis pola perilaku...' },
  { pct: 95, label: 'Menyusun rekomendasi...' },
  { pct: 100, label: 'Selesai!' },
]

export default function RekomendasiPage() {
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [history, setHistory] = useState<SavedRecommendation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [dataReady, setDataReady] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const progressTimer = useRef<NodeJS.Timeout | null>(null)
  const stepIndex = useRef(0)

  useEffect(() => {
    checkData()
    fetchHistory()
    return () => { if (progressTimer.current) clearInterval(progressTimer.current) }
  }, [])

  const checkData = async () => {
    const { data } = await supabase.from('weekly_metrics').select('id').limit(1)
    setDataReady((data?.length ?? 0) > 0)
  }

  const fetchHistory = async () => {
    const { data } = await supabase
      .from('recommendations')
      .select('id, week_key, generated_at, items')
      .order('generated_at', { ascending: false })
      .limit(10)
    if (data && data.length > 0) {
      setHistory(data as SavedRecommendation[])
      setSelectedId(data[0].id)
    }
  }

  const startProgress = () => {
    stepIndex.current = 0
    setProgress(PROGRESS_STEPS[0].pct)
    setProgressLabel(PROGRESS_STEPS[0].label)

    progressTimer.current = setInterval(() => {
      stepIndex.current += 1
      if (stepIndex.current < PROGRESS_STEPS.length - 1) {
        setProgress(PROGRESS_STEPS[stepIndex.current].pct)
        setProgressLabel(PROGRESS_STEPS[stepIndex.current].label)
      }
    }, 1800)
  }

  const stopProgress = () => {
    if (progressTimer.current) clearInterval(progressTimer.current)
    setProgress(100)
    setProgressLabel('Selesai!')
  }

  const getThisWeekKey = () => new Date().toISOString().slice(0, 10)
  const thisWeekRec = history.find(h => h.week_key === getThisWeekKey())
  const canGenerate = dataReady && !generating

  const doGenerate = async () => {
    setGenerating(true)
    setError('')
    setShowConfirm(false)
    startProgress()

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/generate-rekomendasi', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': session?.user?.id || '',
        },
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal generate')

      stopProgress()
      await fetchHistory()
    } catch (err: unknown) {
      stopProgress()
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan')
    }

    setGenerating(false)
  }

  const handleGenerate = () => {
    if (thisWeekRec) {
      setShowConfirm(true)
    } else {
      doGenerate()
    }
  }

  const displayed = selectedId ? history.find(h => h.id === selectedId) : null

  const priorityConfig = {
    critical: { label: 'Perhatian Segera', bg: '#FDECEA', border: '#F09595', accent: '#B00020', dot: '🔴' },
    warning: { label: 'Perlu Tindakan', bg: '#FFF3CD', border: '#FAC775', accent: '#856404', dot: '🟡' },
    positive: { label: 'Praktik Baik', bg: '#EAF3DE', border: '#C0DD97', accent: '#27500A', dot: '🟢' },
  }

  return (
    <Layout title="Rekomendasi">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: '16px', alignItems: 'start' }}>

        {/* Main */}
        <div>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ fontSize: '13px', color: '#999' }}>
                  {displayed
                    ? `Generate: ${new Date(displayed.generated_at).toLocaleString('id-ID')}`
                    : dataReady ? 'Data siap dianalisis' : 'Belum ada data — upload WAG dulu'}
                </div>
                {/* AI Powered badge */}
                <span style={{
                  fontSize: '10px', padding: '2px 8px', borderRadius: '999px',
                  background: 'linear-gradient(135deg, #0344D8, #387EE4)',
                  color: '#FFFFFF', fontWeight: '600', letterSpacing: '0.04em',
                  display: 'flex', alignItems: 'center', gap: '4px',
                }}>
                  ✦ AI Powered
                </span>
              </div>
              {thisWeekRec && (
                <div style={{ fontSize: '11px', color: '#27500A', marginTop: '3px' }}>
                  ✓ Rekomendasi hari ini sudah ada
                </div>
              )}
            </div>
            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              style={{
                padding: '10px 24px',
                background: !canGenerate ? '#999' : thisWeekRec ? '#555' : '#0344D8',
                color: '#FFFFFF', border: 'none', borderRadius: '8px',
                fontSize: '13px', fontWeight: '500',
                cursor: !canGenerate ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: '8px',
              }}
            >
              {generating ? '⟳ Menganalisis...' : thisWeekRec ? '↺ Generate Ulang' : '✦ Generate Rekomendasi AI'}
            </button>
          </div>

          {/* Konfirmasi */}
          {showConfirm && (
            <div style={{
              padding: '16px 20px', background: '#FFF3CD', border: '1px solid #FAC775',
              borderRadius: '10px', marginBottom: '16px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px',
            }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '500', color: '#633806' }}>Generate ulang rekomendasi?</div>
                <div style={{ fontSize: '12px', color: '#854F0B', marginTop: '3px' }}>
                  Sudah ada rekomendasi hari ini ({new Date(thisWeekRec!.generated_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}). Ini akan menggunakan API token tambahan.
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                <button onClick={() => setShowConfirm(false)}
                  style={{ padding: '7px 16px', borderRadius: '8px', border: '1px solid #e5e5e5', background: '#FFFFFF', fontSize: '12px', cursor: 'pointer' }}>
                  Batal
                </button>
                <button onClick={doGenerate}
                  style={{ padding: '7px 16px', borderRadius: '8px', border: 'none', background: '#0344D8', color: '#FFFFFF', fontSize: '12px', cursor: 'pointer', fontWeight: '500' }}>
                  Generate Ulang
                </button>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{ padding: '12px 16px', background: '#FDECEA', border: '1px solid #F09595', borderRadius: '8px', fontSize: '13px', color: '#B00020', marginBottom: '16px' }}>
              {error}
            </div>
          )}

          {/* Generating dengan progress bar */}
          {generating && (
            <div style={{ background: '#FFFFFF', border: '1px solid #e5e5e5', borderRadius: '10px', padding: '32px', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '10px',
                  background: 'linear-gradient(135deg, #0344D8, #387EE4)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '16px', flexShrink: 0,
                }}>✦</div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '500' }}>Claude AI sedang bekerja</div>
                  <div style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>{progressLabel}</div>
                </div>
                <span style={{
                  marginLeft: 'auto', fontSize: '10px', padding: '2px 8px', borderRadius: '999px',
                  background: 'linear-gradient(135deg, #0344D8, #387EE4)',
                  color: '#FFFFFF', fontWeight: '600',
                }}>
                  ✦ AI Powered
                </span>
              </div>

              {/* Progress bar */}
              <div style={{ marginBottom: '8px' }}>
                <div style={{ height: '8px', background: '#F8F9FB', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: '4px',
                    width: `${progress}%`,
                    background: 'linear-gradient(90deg, #0344D8, #387EE4, #D1EA2C)',
                    transition: 'width 0.8s ease',
                  }} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#999' }}>
                <span>{progressLabel}</span>
                <span>{progress}%</span>
              </div>

              {/* Steps indicator */}
              <div style={{ display: 'flex', gap: '4px', marginTop: '16px' }}>
                {PROGRESS_STEPS.slice(0, -1).map((step, i) => (
                  <div key={i} style={{
                    flex: 1, height: '3px', borderRadius: '2px',
                    background: progress >= step.pct ? '#0344D8' : '#F8F9FB',
                    transition: 'background 0.4s',
                  }} />
                ))}
              </div>
            </div>
          )}

          {/* Empty */}
          {!generating && !displayed && (
            <div style={{ background: '#FFFFFF', border: '1px solid #e5e5e5', borderRadius: '10px', padding: '48px', textAlign: 'center' }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>✦</div>
              <div style={{ fontSize: '15px', fontWeight: '500', marginBottom: '8px' }}>Belum ada rekomendasi</div>
              <div style={{ fontSize: '13px', color: '#999', maxWidth: '360px', margin: '0 auto' }}>
                Klik "Generate Rekomendasi AI" untuk mulai analisis berbasis AI.
              </div>
            </div>
          )}

          {/* Recommendations */}
          {!generating && displayed && displayed.items.map((rec, i) => {
            const p = priorityConfig[rec.priority] || priorityConfig.warning
            return (
              <div key={i} style={{
                background: p.bg, border: `1px solid ${p.border}`,
                borderLeft: `4px solid ${p.accent}`,
                borderRadius: '10px', padding: '20px', marginBottom: '12px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <span style={{ fontSize: '18px' }}>{p.dot}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '14px', fontWeight: '600', color: p.accent }}>{rec.ranger}</span>
                      <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(0,0,0,0.06)', color: p.accent, fontWeight: '500' }}>
                        {p.label}
                      </span>
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: '500', color: '#1A1F2E', marginTop: '2px' }}>{rec.title}</div>
                  </div>
                </div>
                <div style={{ fontSize: '13px', color: '#333', lineHeight: '1.7', marginBottom: '14px', paddingLeft: '28px' }}>
                  {rec.body}
                </div>
                <div style={{ paddingLeft: '28px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: p.accent, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Action Items
                  </div>
                  {rec.actions.map((action, j) => (
                    <div key={j} style={{ display: 'flex', gap: '8px', marginBottom: '6px', fontSize: '13px', color: '#333' }}>
                      <span style={{ color: p.accent, fontWeight: '600', minWidth: '16px' }}>{j + 1}.</span>
                      <span>{action}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* History sidebar */}
        <div style={{ background: '#FFFFFF', border: '1px solid #e5e5e5', borderRadius: '10px', overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5e5e5', fontSize: '13px', fontWeight: '500' }}>
            Riwayat Generate
          </div>
          {history.length === 0 ? (
            <div style={{ padding: '20px', fontSize: '12px', color: '#999', textAlign: 'center' }}>Belum ada riwayat</div>
          ) : (
            history.map(h => (
              <div key={h.id} onClick={() => setSelectedId(h.id)}
                style={{
                  padding: '12px 16px', borderBottom: '1px solid #f5f5f5', cursor: 'pointer',
                  background: selectedId === h.id ? '#F0F5FF' : 'transparent',
                  borderLeft: selectedId === h.id ? '3px solid #0344D8' : '3px solid transparent',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '500', color: selectedId === h.id ? '#0344D8' : '#333' }}>
                    {new Date(h.generated_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                  {h.week_key === getThisWeekKey() && (
                    <span style={{ fontSize: '9px', padding: '1px 6px', borderRadius: '999px', background: '#EAF3DE', color: '#27500A', fontWeight: '500' }}>
                      Hari ini
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '11px', color: '#999', marginTop: '2px' }}>
                  {new Date(h.generated_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} · {h.items.length} Ranger
                </div>
              </div>
            ))
          )}
        </div>

      </div>
    </Layout>
  )
}
