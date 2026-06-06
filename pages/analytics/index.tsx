import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Layout from '../../components/Layout'
import { createBrowserClient } from '@supabase/ssr'

interface Insight {
  id: string
  category: string
  entity_type: string
  entity_name: string
  priority_score: number
  summary: string
  data_snapshot: Record<string, unknown>
}

interface MorningBrief {
  brief_date: string
  top_risks: Insight[]
  top_opportunities: Insight[]
  top_watchlist: Insight[]
  narrative: string | null
  generated_at: string | null
}

interface UploadSession {
  upload_date: string
  status: string
  nobu_row_count: number
  refnum_match_rate: number
}

const CATEGORY_LABEL: Record<string, string> = {
  hidden_gem_agent:    'Hidden Gem Agen',
  hidden_gem_pic:      'Hidden Gem PIC',
  hidden_gem_mitra:    'Hidden Gem Mitra',
  dormancy_risk:       'Risiko Dormant',
  pic_risk:            'Risiko PIC',
  mitra_risk:          'Risiko Mitra',
  emerging_territory:  'Wilayah Berkembang',
  concentration_risk:  'Risiko Konsentrasi',
  focus_today:         'Fokus Hari Ini',
}

const CATEGORY_COLOR: Record<string, string> = {
  hidden_gem_agent:    '#86efac',
  hidden_gem_pic:      '#86efac',
  hidden_gem_mitra:    '#86efac',
  dormancy_risk:       '#fca5a5',
  pic_risk:            '#fca5a5',
  mitra_risk:          '#fca5a5',
  emerging_territory:  '#93c5fd',
  concentration_risk:  '#fde68a',
  focus_today:         '#D1EA2C',
}

export default function AnalyticsHome() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [brief, setBrief] = useState<MorningBrief | null>(null)
  const [sessions, setSessions] = useState<UploadSession[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [lastDate, setLastDate] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      // Ambil upload sessions 14 hari terakhir
      const { data: sessionData } = await supabase
        .from('am_upload_sessions')
        .select('upload_date, status, nobu_row_count, refnum_match_rate')
        .eq('status', 'completed')
        .order('upload_date', { ascending: false })
        .limit(14)

      if (sessionData && sessionData.length > 0) {
        setSessions(sessionData)
        setLastDate(sessionData[0].upload_date)

        // Ambil morning brief untuk tanggal terbaru
        const { data: briefData } = await supabase
          .from('am_morning_brief')
          .select('*')
          .eq('brief_date', sessionData[0].upload_date)
          .single()

        if (briefData) setBrief(briefData)
      }
    } finally {
      setLoading(false)
    }
  }

  async function generateBrief() {
    if (!lastDate) return
    setGenerating(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const res = await fetch('/api/analytics/morning-brief', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ date: lastDate }),
      })

      if (res.ok) {
        await loadData()
      }
    } finally {
      setGenerating(false)
    }
  }

  function InsightCard({ insight }: { insight: Insight }) {
    const color = CATEGORY_COLOR[insight.category] ?? '#aaa'
    const label = CATEGORY_LABEL[insight.category] ?? insight.category

    return (
      <div style={{
        padding: '14px',
        backgroundColor: '#111',
        border: '1px solid #222',
        borderRadius: '8px',
        borderLeft: `3px solid ${color}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
          <span style={{ fontSize: '10px', color, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {label}
          </span>
          <span style={{ fontSize: '11px', color: '#555' }}>
            {insight.priority_score?.toFixed(0) ?? '—'}
          </span>
        </div>
        <div style={{ fontSize: '13px', fontWeight: '600', color: '#fff', marginBottom: '4px' }}>
          {insight.entity_name}
        </div>
        <div style={{ fontSize: '12px', color: '#888', lineHeight: '1.5' }}>
          {insight.summary}
        </div>
      </div>
    )
  }

  function Section({ title, insights, color }: { title: string, insights: Insight[], color: string }) {
    if (!insights || insights.length === 0) return null
    return (
      <div style={{ marginBottom: '28px' }}>
        <div style={{ fontSize: '11px', fontWeight: '700', color, letterSpacing: '0.1em', marginBottom: '10px' }}>
          {title}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {insights.map(i => <InsightCard key={i.id} insight={i} />)}
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <Layout>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px', color: '#555', fontSize: '13px' }}>
          Memuat data...
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <Head><title>Morning Brief — AMARIS</title></Head>

      <div style={{ maxWidth: '680px', margin: '0 auto', padding: '32px 16px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: '700', color: '#fff', marginBottom: '4px' }}>
              Morning Brief
            </h1>
            {lastDate && (
              <div style={{ fontSize: '12px', color: '#555' }}>
                Data per {lastDate}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => router.push('/analytics/upload')}
              style={{
                padding: '8px 14px',
                borderRadius: '6px',
                border: '1px solid #333',
                backgroundColor: 'transparent',
                color: '#888',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              Upload Data
            </button>
            {lastDate && !brief && (
              <button
                onClick={generateBrief}
                disabled={generating}
                style={{
                  padding: '8px 14px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: generating ? '#222' : '#D1EA2C',
                  color: generating ? '#444' : '#000',
                  fontSize: '12px',
                  fontWeight: '700',
                  cursor: generating ? 'not-allowed' : 'pointer',
                }}
              >
                {generating ? 'Generating...' : 'Generate Brief'}
              </button>
            )}
          </div>
        </div>

        {/* Tidak ada data */}
        {sessions.length === 0 && (
          <div style={{
            padding: '40px',
            textAlign: 'center',
            color: '#555',
            backgroundColor: '#111',
            borderRadius: '8px',
            border: '1px dashed #333',
          }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>📊</div>
            <div style={{ fontSize: '14px', marginBottom: '8px', color: '#888' }}>Belum ada data</div>
            <div style={{ fontSize: '12px', color: '#555', marginBottom: '20px' }}>
              Upload data NOBU, ESA, dan Master Agen untuk mulai
            </div>
            <button
              onClick={() => router.push('/analytics/upload')}
              style={{
                padding: '10px 20px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: '#D1EA2C',
                color: '#000',
                fontSize: '13px',
                fontWeight: '700',
                cursor: 'pointer',
              }}
            >
              Upload Data Sekarang
            </button>
          </div>
        )}

        {/* Upload sessions summary */}
        {sessions.length > 0 && (
          <div style={{
            display: 'flex',
            gap: '6px',
            marginBottom: '24px',
            overflowX: 'auto',
            paddingBottom: '4px',
          }}>
            {sessions.slice(0, 14).map(s => (
              <div
                key={s.upload_date}
                title={`${s.upload_date} — ${s.nobu_row_count?.toLocaleString('id')} trx — match ${s.refnum_match_rate?.toFixed(1)}%`}
                style={{
                  minWidth: '36px',
                  height: '36px',
                  borderRadius: '6px',
                  backgroundColor: '#1a1a1a',
                  border: `1px solid ${s.upload_date === lastDate ? '#D1EA2C' : '#333'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '10px',
                  color: s.upload_date === lastDate ? '#D1EA2C' : '#555',
                  cursor: 'default',
                  flexShrink: 0,
                }}
              >
                {new Date(s.upload_date).getDate()}
              </div>
            ))}
          </div>
        )}

        {/* Brief belum di-generate */}
        {sessions.length > 0 && !brief && !generating && (
          <div style={{
            padding: '32px',
            textAlign: 'center',
            backgroundColor: '#111',
            borderRadius: '8px',
            border: '1px dashed #333',
          }}>
            <div style={{ fontSize: '13px', color: '#666', marginBottom: '16px' }}>
              Data tersedia. Klik Generate Brief untuk melihat insight hari ini.
            </div>
            <button
              onClick={generateBrief}
              style={{
                padding: '10px 24px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: '#D1EA2C',
                color: '#000',
                fontSize: '13px',
                fontWeight: '700',
                cursor: 'pointer',
              }}
            >
              Generate Brief
            </button>
          </div>
        )}

        {/* Generating state */}
        {generating && (
          <div style={{
            padding: '32px',
            textAlign: 'center',
            backgroundColor: '#111',
            borderRadius: '8px',
            border: '1px solid #222',
            color: '#666',
            fontSize: '13px',
          }}>
            Menganalisis data dan menyusun brief...
          </div>
        )}

        {/* Brief content */}
        {brief && (
          <>
            {/* Narrative */}
            {brief.narrative && (
              <div style={{
                padding: '16px',
                backgroundColor: '#0a0f0a',
                border: '1px solid #1a2e1a',
                borderRadius: '8px',
                marginBottom: '24px',
                fontSize: '13px',
                color: '#aaa',
                lineHeight: '1.7',
              }}>
                {brief.narrative}
              </div>
            )}

            {/* Insights */}
            <Section title="🔴 RISIKO UTAMA" insights={brief.top_risks} color="#fca5a5" />
            <Section title="🟢 PELUANG UTAMA" insights={brief.top_opportunities} color="#86efac" />
            <Section title="👁 PERLU DIPERHATIKAN" insights={brief.top_watchlist} color="#fde68a" />

            {/* Regenerate */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button
                onClick={generateBrief}
                disabled={generating}
                style={{
                  padding: '8px 14px',
                  borderRadius: '6px',
                  border: '1px solid #333',
                  backgroundColor: 'transparent',
                  color: '#555',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                Regenerate
              </button>
            </div>
          </>
        )}
      </div>
    </Layout>
  )
}
