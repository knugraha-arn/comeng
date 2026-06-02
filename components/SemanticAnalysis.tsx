import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

type Analysis = {
  sentiment: string
  topic: string
  response_quality: string | null
  week_key: string
  sender_type: string
  analyzed_at: string
}

type Props = {
  wagId: string
  weekKey?: string
}

const PROGRESS_STEPS = [
  { pct: 10, label: 'Mengambil pesan dari database...' },
  { pct: 30, label: 'Menyiapkan batch analisis...' },
  { pct: 55, label: 'Mengirim ke Claude Haiku...' },
  { pct: 80, label: 'Memproses hasil klasifikasi...' },
  { pct: 95, label: 'Menyimpan hasil...' },
  { pct: 100, label: 'Selesai!' },
]

export default function SemanticAnalysis({ wagId, weekKey }: Props) {
  const [data, setData] = useState<Analysis[]>([])
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [error, setError] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [lastAnalyzed, setLastAnalyzed] = useState<string | null>(null)
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const stepIndex = useRef(0)

  useEffect(() => {
    fetchAnalysis()
    return () => { if (progressTimer.current) clearInterval(progressTimer.current) }
  }, [wagId, weekKey])

  const fetchAnalysis = async () => {
    setLoading(true)
    let query = supabase
      .from('message_analysis')
      .select('sentiment, topic, response_quality, week_key, sender_type, analyzed_at')
      .eq('wag_id', wagId)

    if (weekKey) query = query.eq('week_key', weekKey)

    const { data: result } = await query.order('analyzed_at', { ascending: false })
    if (result && result.length > 0) {
      setData(result)
      setLastAnalyzed(result[0].analyzed_at)
    } else {
      setData([])
      setLastAnalyzed(null)
    }
    setLoading(false)
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
    }, 2000)
  }

  const stopProgress = () => {
    if (progressTimer.current) clearInterval(progressTimer.current)
    setProgress(100)
    setProgressLabel('Selesai!')
  }

  const isAnalyzedToday = () => {
    if (!lastAnalyzed) return false
    const today = new Date().toISOString().slice(0, 10)
    return lastAnalyzed.slice(0, 10) === today
  }

  const doAnalyze = async () => {
    setAnalyzing(true)
    setError('')
    setSuccessMsg('')
    setShowConfirm(false)
    startProgress()

    try {
      const res = await fetch('/api/analyze-semantik', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wag_id: wagId, week_key: weekKey }),
      })

      const result = await res.json()
      if (!res.ok) throw new Error(result.error)

      stopProgress()
      setSuccessMsg(result.message)
      await fetchAnalysis()
    } catch (err: unknown) {
      stopProgress()
      setError(err instanceof Error ? err.message : 'Gagal analisis')
    }

    setAnalyzing(false)
  }

  const handleAnalyze = () => {
    if (isAnalyzedToday() && data.length > 0) {
      setShowConfirm(true)
    } else {
      doAnalyze()
    }
  }

  if (loading) return <div style={{ fontSize: '12px', color: '#999', padding: '12px 0' }}>Memuat analisis semantik...</div>

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

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ fontSize: '13px', fontWeight: '500' }}>Analisis Semantik</div>
          <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: '#0344D8', color: '#FFFFFF', fontWeight: '600' }}>
            ✦ Haiku AI
          </span>
          {total > 0 && !analyzing && (
            <span style={{ fontSize: '11px', color: '#999' }}>{total} pesan</span>
          )}
        </div>
        <button
          onClick={handleAnalyze}
          disabled={analyzing}
          style={{
            fontSize: '11px', padding: '5px 12px', borderRadius: '6px',
            border: 'none',
            background: analyzing ? '#999' : total > 0 ? '#555' : '#0344D8',
            color: '#FFFFFF', cursor: analyzing ? 'not-allowed' : 'pointer', fontWeight: '500',
          }}
        >
          {analyzing ? '⟳ Menganalisis...' : total > 0 ? '↺ Analisis Ulang' : '✦ Analisis Sekarang'}
        </button>
      </div>

      {/* Info 8 minggu */}
      {!analyzing && (
        <div style={{
          display: 'flex', alignItems: 'start', gap: '8px',
          padding: '8px 12px', background: '#F0F5FF',
          border: '1px solid #B5D4F4', borderRadius: '8px',
          marginBottom: '12px', fontSize: '11px', color: '#0C447C',
        }}>
          <span style={{ flexShrink: 0, marginTop: '1px' }}>ℹ</span>
          <div style={{ lineHeight: '1.6' }}>
            <strong>Analisis berbasis 8 minggu terakhir.</strong> Hanya pesan dalam 8 minggu terakhir yang dianalisis.
            Data historis lebih lama tidak disertakan untuk menjaga relevansi dan efisiensi biaya AI.
            {lastAnalyzed && (
              <span style={{ color: '#387EE4' }}> · Terakhir dianalisis: {new Date(lastAnalyzed).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
            )}
          </div>
        </div>
      )}

      {/* Konfirmasi analisis ulang */}
      {showConfirm && (
        <div style={{
          padding: '12px 14px', background: '#FFF3CD', border: '1px solid #FAC775',
          borderRadius: '8px', marginBottom: '12px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
        }}>
          <div style={{ fontSize: '12px', color: '#633806' }}>
            <strong>Analisis ulang?</strong> Sudah dianalisis hari ini pukul {lastAnalyzed ? new Date(lastAnalyzed).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '—'}. Ini akan menggunakan token Haiku tambahan.
          </div>
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
            <button onClick={() => setShowConfirm(false)}
              style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid #e5e5e5', background: '#FFFFFF', fontSize: '11px', cursor: 'pointer' }}>
              Batal
            </button>
            <button onClick={doAnalyze}
              style={{ padding: '5px 12px', borderRadius: '6px', border: 'none', background: '#0344D8', color: '#FFFFFF', fontSize: '11px', cursor: 'pointer', fontWeight: '500' }}>
              Analisis Ulang
            </button>
          </div>
        </div>
      )}

      {/* Progress bar saat analyzing */}
      {analyzing && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', color: '#0344D8', fontWeight: '500' }}>✦ Claude Haiku sedang menganalisis</span>
          </div>
          <div style={{ height: '6px', background: '#F8F9FB', borderRadius: '3px', overflow: 'hidden', marginBottom: '6px' }}>
            <div style={{
              height: '100%', borderRadius: '3px', width: `${progress}%`,
              background: '#0344D8', transition: 'width 0.8s ease',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#999' }}>
            <span>{progressLabel}</span>
            <span>{progress}%</span>
          </div>
          <div style={{ display: 'flex', gap: '3px', marginTop: '8px' }}>
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

      {/* Success */}
      {successMsg && !analyzing && (
        <div style={{ fontSize: '11px', color: '#27500A', background: '#EAF3DE', padding: '6px 10px', borderRadius: '6px', marginBottom: '12px' }}>
          ✓ {successMsg}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ fontSize: '11px', color: '#B00020', background: '#FDECEA', padding: '6px 10px', borderRadius: '6px', marginBottom: '12px' }}>
          {error}
        </div>
      )}

      {/* Empty state */}
      {total === 0 && !analyzing ? (
        <div style={{ fontSize: '12px', color: '#999', textAlign: 'center', padding: '20px 0' }}>
          Belum ada analisis — klik "Analisis Sekarang"
        </div>
      ) : !analyzing && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Sentimen */}
          <div>
            <div style={{ fontSize: '11px', color: '#999', marginBottom: '8px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Sentimen Agen
            </div>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
              {(Object.entries(sentiments) as [keyof typeof sentiments, number][]).map(([key, val]) => (
                <div key={key} style={{ flex: 1, padding: '10px', borderRadius: '8px', textAlign: 'center', background: sentimentBg[key] }}>
                  <div style={{ fontSize: '20px', fontWeight: '600', color: sentimentColor[key] }}>{val}</div>
                  <div style={{ fontSize: '10px', color: sentimentColor[key], marginTop: '2px', textTransform: 'capitalize' }}>{key}</div>
                  <div style={{ fontSize: '10px', color: '#999' }}>{total > 0 ? Math.round((val / total) * 100) : 0}%</div>
                </div>
              ))}
            </div>
            <div style={{ height: '6px', borderRadius: '3px', overflow: 'hidden', display: 'flex' }}>
              <div style={{ width: `${total > 0 ? (sentiments.positif / total) * 100 : 0}%`, background: '#27500A', transition: 'width 0.5s' }} />
              <div style={{ width: `${total > 0 ? (sentiments.netral / total) * 100 : 0}%`, background: '#e5e5e5' }} />
              <div style={{ width: `${total > 0 ? (sentiments.negatif / total) * 100 : 0}%`, background: '#B00020' }} />
            </div>
          </div>

          {/* Topik */}
          <div>
            <div style={{ fontSize: '11px', color: '#999', marginBottom: '8px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Topik Percakapan
            </div>
            {topicCounts.slice(0, 5).map(t => (
              <div key={t.label} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '7px' }}>
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
              <div style={{ fontSize: '11px', color: '#999', marginBottom: '8px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Kualitas Respons Ranger ({rangerMsgs.length} pesan)
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <div style={{ flex: 1, padding: '10px', borderRadius: '8px', background: '#EAF3DE', textAlign: 'center' }}>
                  <div style={{ fontSize: '20px', fontWeight: '600', color: '#27500A' }}>{responseQuality.substantif}</div>
                  <div style={{ fontSize: '10px', color: '#27500A', marginTop: '2px' }}>Substantif</div>
                </div>
                <div style={{ flex: 1, padding: '10px', borderRadius: '8px', background: '#FFF3CD', textAlign: 'center' }}>
                  <div style={{ fontSize: '20px', fontWeight: '600', color: '#856404' }}>{responseQuality.generik}</div>
                  <div style={{ fontSize: '10px', color: '#856404', marginTop: '2px' }}>Generik</div>
                </div>
                <div style={{ flex: 1, padding: '10px', borderRadius: '8px', background: '#F0F5FF', textAlign: 'center' }}>
                  <div style={{ fontSize: '20px', fontWeight: '600', color: '#0344D8' }}>
                    {rangerMsgs.length > 0 ? Math.round((responseQuality.substantif / rangerMsgs.length) * 100) : 0}%
                  </div>
                  <div style={{ fontSize: '10px', color: '#0344D8', marginTop: '2px' }}>Substantif rate</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
