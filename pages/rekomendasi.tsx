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

export default function RekomendasiPage() {
  const [generating, setGenerating] = useState(false)
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [dataReady, setDataReady] = useState(false)

  useEffect(() => {
    checkData()
  }, [])

  const checkData = async () => {
    const { data } = await supabase
      .from('weekly_metrics')
      .select('id')
      .limit(1)
    setDataReady((data?.length ?? 0) > 0)
  }

  const handleGenerate = async () => {
    setGenerating(true)
    setError('')
    setRecommendations([])

    try {
      const res = await fetch('/api/generate-rekomendasi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal generate')

      setRecommendations(data.recommendations)
      setGeneratedAt(new Date().toLocaleString('id-ID'))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan')
    }

    setGenerating(false)
  }

  const priorityConfig = {
    critical: { label: 'Perhatian Segera', bg: '#FDECEA', border: '#F09595', accent: '#B00020', dot: '🔴' },
    warning: { label: 'Perlu Tindakan', bg: '#FFF3CD', border: '#FAC775', accent: '#856404', dot: '🟡' },
    positive: { label: 'Praktik Baik', bg: '#EAF3DE', border: '#C0DD97', accent: '#27500A', dot: '🟢' },
  }

  return (
    <Layout title="Rekomendasi">

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <div style={{ fontSize: '13px', color: '#999' }}>
            {dataReady ? 'Data siap dianalisis' : 'Belum ada data — upload WAG dulu'}
          </div>
          {generatedAt && (
            <div style={{ fontSize: '11px', color: '#999', marginTop: '2px' }}>Terakhir di-generate: {generatedAt}</div>
          )}
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating || !dataReady}
          style={{
            padding: '10px 24px',
            background: generating || !dataReady ? '#999' : '#0344D8',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: '500',
            cursor: generating || !dataReady ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
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

      {/* Empty state */}
      {!generating && recommendations.length === 0 && !error && (
        <div style={{ background: '#FFFFFF', border: '1px solid #e5e5e5', borderRadius: '10px', padding: '48px', textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>✦</div>
          <div style={{ fontSize: '15px', fontWeight: '500', marginBottom: '8px' }}>Rekomendasi AI belum di-generate</div>
          <div style={{ fontSize: '13px', color: '#999', maxWidth: '400px', margin: '0 auto 24px' }}>
            Klik "Generate Rekomendasi AI" untuk menganalisis data komunitas dan mendapatkan rekomendasi coaching yang spesifik.
          </div>
        </div>
      )}

      {/* Generating state */}
      {generating && (
        <div style={{ background: '#FFFFFF', border: '1px solid #e5e5e5', borderRadius: '10px', padding: '48px', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', marginBottom: '12px' }}>⟳</div>
          <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '4px' }}>Menganalisis data komunitas...</div>
          <div style={{ fontSize: '12px', color: '#999' }}>Claude sedang membaca pola perilaku Ranger dan menyusun rekomendasi</div>
        </div>
      )}

      {/* Recommendations */}
      {recommendations.map((rec, i) => {
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

    </Layout>
  )
}
