import { useState, useEffect } from 'react'
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

export default function RekomendasiPage() {
  const [generating, setGenerating] = useState(false)
  const [current, setCurrent] = useState<SavedRecommendation | null>(null)
  const [history, setHistory] = useState<SavedRecommendation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [dataReady, setDataReady] = useState(false)

  useEffect(() => {
    checkData()
    fetchHistory()
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
      setCurrent(data[0] as SavedRecommendation)
      setSelectedId(data[0].id)
    }
  }

  const handleGenerate = async () => {
    // Cek apakah sudah generate hari ini
    const today = new Date().toISOString().slice(0, 10)
    const alreadyToday = history.find(h => h.week_key === today)
    if (alreadyToday) {
      const confirm = window.confirm('Sudah ada rekomendasi hari ini. Generate ulang?')
      if (!confirm) return
    }

    setGenerating(true)
    setError('')

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

      await fetchHistory()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan')
    }

    setGenerating(false)
  }

  const displayed = selectedId ? history.find(h => h.id === selectedId) : current

  const priorityConfig = {
    critical: { label: 'Perhatian Segera', bg: '#FDECEA', border: '#F09595', accent: '#B00020', dot: '🔴' },
    warning: { label: 'Perlu Tindakan', bg: '#FFF3CD', border: '#FAC775', accent: '#856404', dot: '🟡' },
    positive: { label: 'Praktik Baik', bg: '#EAF3DE', border: '#C0DD97', accent: '#27500A', dot: '🟢' },
  }

  return (
    <Layout title="Rekomendasi">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '16px', alignItems: 'start' }}>

        {/* Main content */}
        <div>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <div>
              <div style={{ fontSize: '13px', color: '#999' }}>
                {displayed ? `Generate: ${new Date(displayed.generated_at).toLocaleString('id-ID')}` : dataReady ? 'Data siap dianalisis' : 'Belum ada data'}
              </div>
            </div>
            <button
              onClick={handleGenerate}
              disabled={generating || !dataReady}
              style={{
                padding: '10px 24px',
                background: generating || !dataReady ? '#999' : '#0344D8',
                color: '#FFFFFF', border: 'none', borderRadius: '8px',
                fontSize: '13px', fontWeight: '500',
                cursor: generating || !dataReady ? 'not-allowed' : 'pointer',
              }}
            >
              {generating ? '⟳ Menganalisis...' : '✦ Generate Rekomendasi AI'}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div style={{ padding: '12px 16px', background: '#FDECEA', border: '1px solid #F09595', borderRadius: '8px', fontSize: '13px', color: '#B00020', marginBottom: '16px' }}>
              {error}
            </div>
          )}

          {/* Generating state */}
          {generating && (
            <div style={{ background: '#FFFFFF', border: '1px solid #e5e5e5', borderRadius: '10px', padding: '48px', textAlign: 'center', marginBottom: '12px' }}>
              <div style={{ fontSize: '24px', marginBottom: '12px' }}>⟳</div>
              <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '4px' }}>Menganalisis data komunitas...</div>
              <div style={{ fontSize: '12px', color: '#999' }}>Claude sedang membaca pola perilaku Ranger</div>
            </div>
          )}

          {/* Empty state */}
          {!generating && !displayed && (
            <div style={{ background: '#FFFFFF', border: '1px solid #e5e5e5', borderRadius: '10px', padding: '48px', textAlign: 'center' }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>✦</div>
              <div style={{ fontSize: '15px', fontWeight: '500', marginBottom: '8px' }}>Belum ada rekomendasi</div>
              <div style={{ fontSize: '13px', color: '#999', maxWidth: '360px', margin: '0 auto' }}>
                Klik "Generate Rekomendasi AI" untuk mulai analisis.
              </div>
            </div>
          )}

          {/* Recommendations */}
          {!generating && displayed && displayed.items.map((rec, i) => {
            const p = priorityConfig[rec.priority] || priorityConfig.warning
            return (
              <div key={i} style={{
                background: p.bg,
                border: `1px solid ${p.border}`,
                borderLeft: `4px solid ${p.accent}`,
                borderRadius: '10px',
                padding: '20px',
                marginBottom: '12px',
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
              <div
                key={h.id}
                onClick={() => setSelectedId(h.id)}
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid #f5f5f5',
                  cursor: 'pointer',
                  background: selectedId === h.id ? '#F0F5FF' : 'transparent',
                  borderLeft: selectedId === h.id ? '3px solid #0344D8' : '3px solid transparent',
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: '500', color: selectedId === h.id ? '#0344D8' : '#333' }}>
                  {new Date(h.generated_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
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
