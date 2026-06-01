import { useState, useEffect } from 'react'
import Layout from '@/components/Layout'
import { supabase } from '@/lib/supabase'

type RangerSummary = {
  full_name: string
  display_name: string
  wag_name: string
  total_members: number
  metrics: {
    week_key: string
    active_days: number
    total_messages: number
    participation_rate: number
    status: string
  }[]
  top_members: { display_name: string; total: number }[]
  dormant_count: number
  ungreeted_count: number
}

type Recommendation = {
  ranger: string
  priority: 'critical' | 'warning' | 'positive'
  title: string
  body: string
  actions: string[]
}

export default function RekomendasiPage() {
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [rangerSummaries, setRangerSummaries] = useState<RangerSummary[]>([])

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    const { data: rangers } = await supabase
      .from('rangers')
      .select('id, full_name, display_name, wags(id, name), weekly_metrics(week_key, active_days, total_messages, participation_rate, status)')
      .eq('status', 'active')

    if (!rangers) { setLoading(false); return }

    const summaries: RangerSummary[] = []

    for (const r of rangers) {
      const ranger = r as unknown as {
        id: string
        full_name: string
        display_name: string
        wags: { id: string; name: string }
        weekly_metrics: { week_key: string; active_days: number; total_messages: number; participation_rate: number; status: string }[]
      }

      const wagId = ranger.wags?.id
      if (!wagId) continue

      const [memberRes, msgRes] = await Promise.all([
        supabase.from('members').select('id, display_name, last_active_at, greeted_at').eq('wag_id', wagId),
        supabase.from('messages').select('sender_name').eq('wag_id', wagId).eq('sender_type', 'member'),
      ])

      const members = memberRes.data || []
      const msgs = msgRes.data || []

      const dormantCount = members.filter(m => {
        if (!m.last_active_at) return true
        return (Date.now() - new Date(m.last_active_at).getTime()) / (1000 * 60 * 60 * 24) > 14
      }).length

      const ungretedCount = members.filter(m => !m.greeted_at).length

      const counts = msgs.reduce((acc: Record<string, number>, m) => {
        acc[m.sender_name] = (acc[m.sender_name] || 0) + 1
        return acc
      }, {})
      const topMembers = Object.entries(counts)
        .map(([display_name, total]) => ({ display_name, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 3)

      summaries.push({
        full_name: ranger.full_name,
        display_name: ranger.display_name,
        wag_name: ranger.wags?.name,
        total_members: members.length,
        metrics: [...(ranger.weekly_metrics || [])].sort((a, b) => a.week_key.localeCompare(b.week_key)),
        top_members: topMembers,
        dormant_count: dormantCount,
        ungreeted_count: ungretedCount,
      })
    }

    setRangerSummaries(summaries)
    setLoading(false)
  }

  const handleGenerate = async () => {
    if (rangerSummaries.length === 0) return
    setGenerating(true)
    setError('')
    setRecommendations([])

    const prompt = `Kamu adalah sistem analisis komunitas untuk platform COMENG — alat monitoring efektivitas Ranger dalam membina komunitas agen WhatsApp (WAG).

Konteks bisnis:
- Ranger adalah freelancer yang membina komunitas agen pengguna EDC Mini ATM
- Ranger mendapat fee per transaksi agen — makin aktif agen bertransaksi, makin besar pendapatan Ranger
- Masalah utama: Ranger cenderung fokus akuisisi agen baru, tapi kurang membina agen yang sudah ada
- COMENG mengukur efektivitas Ranger dari aktivitas di WAG sebagai leading indicator

Data komunitas minggu ini:

${rangerSummaries.map(r => `
Ranger: ${r.full_name} (${r.display_name})
WAG: ${r.wag_name}
Total agen: ${r.total_members}
Agen belum disambut: ${r.ungreeted_count}
Agen dormant (>14 hari tidak aktif): ${r.dormant_count}
Top 3 agen paling aktif: ${r.top_members.map(m => `${m.display_name} (${m.total} pesan)`).join(', ') || 'tidak ada data'}
Tren aktivitas minggu ke minggu:
${r.metrics.map(m => `  ${m.week_key}: ${m.total_messages} pesan Ranger, ${m.active_days} hari aktif, participation ${m.participation_rate}%, status: ${m.status}`).join('\n')}
`).join('\n---\n')}

Berdasarkan data di atas, berikan rekomendasi coaching yang spesifik dan actionable untuk setiap Ranger.

Respond HANYA dengan JSON array berikut, tanpa penjelasan tambahan, tanpa markdown backticks:
[
  {
    "ranger": "nama ranger",
    "priority": "critical|warning|positive",
    "title": "judul rekomendasi singkat",
    "body": "analisis situasi dalam 2-3 kalimat, spesifik berdasarkan data",
    "actions": ["action item 1", "action item 2", "action item 3"]
  }
]`

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{ role: 'user', content: prompt }],
        }),
      })

      const data = await response.json()
      const text = data.content?.[0]?.text || ''

      const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
      setRecommendations(parsed)
      setGeneratedAt(new Date().toLocaleString('id-ID'))
    } catch {
      setError('Gagal generate rekomendasi. Coba lagi.')
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
          <div style={{ fontSize: '13px', color: '#999', marginTop: '4px' }}>
            {loading ? 'Memuat data...' : `${rangerSummaries.length} Ranger · data siap dianalisis`}
          </div>
          {generatedAt && (
            <div style={{ fontSize: '11px', color: '#999', marginTop: '2px' }}>Terakhir di-generate: {generatedAt}</div>
          )}
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating || loading || rangerSummaries.length === 0}
          style={{
            padding: '10px 24px',
            background: generating ? '#999' : '#0344D8',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: '500',
            cursor: generating ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {generating ? (
            <>
              <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span>
              Menganalisis...
            </>
          ) : '✦ Generate Rekomendasi AI'}
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
          <div style={{ fontSize: '13px', color: '#999', marginBottom: '24px', maxWidth: '400px', margin: '0 auto 24px' }}>
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
          <div
            key={i}
            style={{
              background: p.bg,
              border: `1px solid ${p.border}`,
              borderRadius: '10px',
              padding: '20px',
              marginBottom: '12px',
              borderLeft: `4px solid ${p.accent}`,
            }}
          >
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
            <div style={{ fontSize: '13px', color: '#333', lineHeight: '1.6', marginBottom: '14px', paddingLeft: '28px' }}>
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
