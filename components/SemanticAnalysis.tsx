import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

type Analysis = {
  sentiment: string
  topic: string
  response_quality: string | null
  week_key: string
}

type Props = {
  wagId: string
  weekKey?: string
}

export default function SemanticAnalysis({ wagId, weekKey }: Props) {
  const [data, setData] = useState<Analysis[]>([])
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    fetchAnalysis()
  }, [wagId, weekKey])

  const fetchAnalysis = async () => {
    setLoading(true)
    let query = supabase
      .from('message_analysis')
      .select('sentiment, topic, response_quality, week_key')
      .eq('wag_id', wagId)

    if (weekKey) query = query.eq('week_key', weekKey)

    const { data: result } = await query
    setData(result || [])
    setLoading(false)
  }

  const handleAnalyze = async () => {
    setAnalyzing(true)
    setError('')
    setProgress('Mengirim pesan ke Claude Haiku...')

    try {
      const res = await fetch('/api/analyze-semantik', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wag_id: wagId, week_key: weekKey }),
      })

      const result = await res.json()
      if (!res.ok) throw new Error(result.error)

      setProgress(result.message)
      await fetchAnalysis()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal analisis')
    }

    setAnalyzing(false)
  }

  if (loading) return <div style={{ fontSize: '12px', color: '#999' }}>Memuat analisis semantik...</div>

  // Agregat data
  const total = data.length
  const sentiments = {
    positif: data.filter(d => d.sentiment === 'positif').length,
    negatif: data.filter(d => d.sentiment === 'negatif').length,
    netral: data.filter(d => d.sentiment === 'netral').length,
  }

  const topics = ['keluhan_teknis', 'pertanyaan', 'apresiasi', 'info_promo', 'motivasi', 'onboarding', 'lainnya']
  const topicCounts = topics.map(t => ({
    label: t.replace('_', ' '),
    count: data.filter(d => d.topic === t).length,
  })).sort((a, b) => b.count - a.count).filter(t => t.count > 0)

  const rangerMsgs = data.filter(d => d.sender_type === 'ranger')
  const responseQuality = {
    substantif: rangerMsgs.filter(d => d.response_quality === 'substantif').length,
    generik: rangerMsgs.filter(d => d.response_quality === 'generik').length,
  }

  const sentimentColor = { positif: '#27500A', negatif: '#B00020', netral: '#555' }
  const sentimentBg = { positif: '#EAF3DE', negatif: '#FDECEA', netral: '#F8F9FB' }

  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #e5e5e5', borderRadius: '10px', padding: '18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ fontSize: '13px', fontWeight: '500' }}>Analisis Semantik</div>
          <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: '#0344D8', color: '#FFFFFF', fontWeight: '600' }}>
            ✦ Haiku AI
          </span>
        </div>
        <button
          onClick={handleAnalyze}
          disabled={analyzing}
          style={{
            fontSize: '11px', padding: '5px 12px', borderRadius: '6px',
            border: 'none', background: analyzing ? '#999' : '#0344D8',
            color: '#FFFFFF', cursor: analyzing ? 'not-allowed' : 'pointer', fontWeight: '500',
          }}
        >
          {analyzing ? '⟳ Menganalisis...' : total > 0 ? '↺ Analisis Ulang' : '✦ Analisis Sekarang'}
        </button>
      </div>

      {progress && !analyzing && (
        <div style={{ fontSize: '11px', color: '#27500A', background: '#EAF3DE', padding: '6px 10px', borderRadius: '6px', marginBottom: '12px' }}>
          {progress}
        </div>
      )}

      {error && (
        <div style={{ fontSize: '11px', color: '#B00020', background: '#FDECEA', padding: '6px 10px', borderRadius: '6px', marginBottom: '12px' }}>
          {error}
        </div>
      )}

      {total === 0 ? (
        <div style={{ fontSize: '12px', color: '#999', textAlign: 'center', padding: '20px 0' }}>
          Belum ada analisis — klik "Analisis Sekarang"
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* Sentimen */}
          <div>
            <div style={{ fontSize: '11px', color: '#999', marginBottom: '8px', fontWeight: '500' }}>
              SENTIMEN AGEN ({total} pesan)
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              {(Object.entries(sentiments) as [keyof typeof sentiments, number][]).map(([key, val]) => (
                <div key={key} style={{
                  flex: 1, padding: '8px', borderRadius: '8px', textAlign: 'center',
                  background: sentimentBg[key], border: `1px solid ${sentimentBg[key]}`,
                }}>
                  <div style={{ fontSize: '18px', fontWeight: '600', color: sentimentColor[key] }}>{val}</div>
                  <div style={{ fontSize: '10px', color: sentimentColor[key], marginTop: '2px' }}>{key}</div>
                  <div style={{ fontSize: '10px', color: '#999' }}>{total > 0 ? Math.round((val / total) * 100) : 0}%</div>
                </div>
              ))}
            </div>

            {/* Sentimen bar */}
            <div style={{ height: '6px', borderRadius: '3px', overflow: 'hidden', display: 'flex', marginTop: '8px' }}>
              <div style={{ width: `${total > 0 ? (sentiments.positif / total) * 100 : 0}%`, background: '#27500A' }} />
              <div style={{ width: `${total > 0 ? (sentiments.netral / total) * 100 : 0}%`, background: '#e5e5e5' }} />
              <div style={{ width: `${total > 0 ? (sentiments.negatif / total) * 100 : 0}%`, background: '#B00020' }} />
            </div>
          </div>

          {/* Topik */}
          <div>
            <div style={{ fontSize: '11px', color: '#999', marginBottom: '8px', fontWeight: '500' }}>TOPIK PERCAKAPAN</div>
            {topicCounts.slice(0, 5).map(t => (
              <div key={t.label} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <div style={{ fontSize: '12px', color: '#555', width: '110px', flexShrink: 0, textTransform: 'capitalize' }}>{t.label}</div>
                <div style={{ flex: 1, height: '5px', background: '#F8F9FB', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: `${total > 0 ? (t.count / total) * 100 : 0}%`, height: '100%', background: '#0344D8', borderRadius: '3px' }} />
                </div>
                <div style={{ fontSize: '11px', color: '#999', width: '24px', textAlign: 'right' }}>{t.count}</div>
              </div>
            ))}
          </div>

          {/* Kualitas respons Ranger */}
          {rangerMsgs.length > 0 && (
            <div>
              <div style={{ fontSize: '11px', color: '#999', marginBottom: '8px', fontWeight: '500' }}>
                KUALITAS RESPONS RANGER ({rangerMsgs.length} pesan)
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <div style={{ flex: 1, padding: '8px', borderRadius: '8px', background: '#EAF3DE', textAlign: 'center' }}>
                  <div style={{ fontSize: '18px', fontWeight: '600', color: '#27500A' }}>{responseQuality.substantif}</div>
                  <div style={{ fontSize: '10px', color: '#27500A' }}>Substantif</div>
                </div>
                <div style={{ flex: 1, padding: '8px', borderRadius: '8px', background: '#FFF3CD', textAlign: 'center' }}>
                  <div style={{ fontSize: '18px', fontWeight: '600', color: '#856404' }}>{responseQuality.generik}</div>
                  <div style={{ fontSize: '10px', color: '#856404' }}>Generik</div>
                </div>
                <div style={{ flex: 1, padding: '8px', borderRadius: '8px', background: '#F8F9FB', textAlign: 'center' }}>
                  <div style={{ fontSize: '18px', fontWeight: '600', color: '#555' }}>
                    {rangerMsgs.length > 0 ? Math.round((responseQuality.substantif / rangerMsgs.length) * 100) : 0}%
                  </div>
                  <div style={{ fontSize: '10px', color: '#555' }}>Substantif rate</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
