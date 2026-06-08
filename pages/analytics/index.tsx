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
  row_count: number | null
}

const CATEGORY_LABEL: Record<string, string> = {
  hidden_gem_agent:   'Hidden Gem Agen',
  hidden_gem_pic:     'Hidden Gem PIC',
  hidden_gem_mitra:   'Hidden Gem Mitra',
  dormancy_risk:      'Risiko Dormant',
  pic_risk:           'Risiko PIC',
  mitra_risk:         'Risiko Mitra',
  emerging_territory: 'Wilayah Berkembang',
  concentration_risk: 'Risiko Konsentrasi',
  focus_today:        'Fokus Hari Ini',
}

const RISK_CATEGORIES = ['dormancy_risk', 'pic_risk', 'mitra_risk', 'concentration_risk']
const OPP_CATEGORIES  = ['hidden_gem_agent', 'hidden_gem_pic', 'hidden_gem_mitra', 'emerging_territory']

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

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const { data: sessionData } = await supabase
        .from('am_upload_sessions')
        .select('upload_date, status, row_count')
        .eq('status', 'completed')
        .order('upload_date', { ascending: false })
        .limit(14)

      if (sessionData && sessionData.length > 0) {
        setSessions(sessionData)
        setLastDate(sessionData[0].upload_date)

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
      if (res.ok) await loadData()
    } finally {
      setGenerating(false)
    }
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
  }

  function InsightCard({ insight, type }: { insight: Insight, type: 'risk' | 'opportunity' | 'watch' }) {
    const label = CATEGORY_LABEL[insight.category] ?? insight.category

    const typeStyles = {
      risk: {
        border: '#fecaca',
        labelBg: '#fee2e2',
        labelColor: '#dc2626',
        dot: '#ef4444',
      },
      opportunity: {
        border: '#bbf7d0',
        labelBg: '#dcfce7',
        labelColor: '#16a34a',
        dot: '#22c55e',
      },
      watch: {
        border: '#fde68a',
        labelBg: '#fef9c3',
        labelColor: '#ca8a04',
        dot: '#eab308',
      },
    }

    const s = typeStyles[type]

    return (
      <div style={{
        backgroundColor: '#fff',
        border: `1px solid ${s.border}`,
        borderRadius: '10px',
        padding: '16px',
        display: 'flex',
        gap: '12px',
        alignItems: 'flex-start',
      }}>
        <div style={{
          width: '8px', height: '8px', borderRadius: '50%',
          backgroundColor: s.dot, flexShrink: 0, marginTop: '5px',
        }} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
            <span style={{
              fontSize: '10px', fontWeight: '700', letterSpacing: '0.06em',
              backgroundColor: s.labelBg, color: s.labelColor,
              padding: '2px 8px', borderRadius: '99px',
            }}>
              {label.toUpperCase()}
            </span>
            <span style={{ fontSize: '11px', color: '#d1d5db', fontWeight: '600' }}>
              {insight.priority_score?.toFixed(0)}
            </span>
          </div>
          <div style={{ fontSize: '14px', fontWeight: '700', color: '#111827', marginBottom: '4px' }}>
            {insight.entity_name}
          </div>
          <div style={{ fontSize: '12px', color: '#6b7280', lineHeight: '1.6' }}>
            {insight.summary}
          </div>
        </div>
      </div>
    )
  }

  function Section({ title, icon, insights, type, color }: {
    title: string
    icon: string
    insights: Insight[]
    type: 'risk' | 'opportunity' | 'watch'
    color: string
  }) {
    if (!insights || insights.length === 0) return null
    return (
      <div style={{ marginBottom: '32px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          marginBottom: '12px',
        }}>
          <span style={{ fontSize: '16px' }}>{icon}</span>
          <span style={{ fontSize: '12px', fontWeight: '700', color, letterSpacing: '0.08em' }}>
            {title}
          </span>
          <div style={{ flex: 1, height: '1px', backgroundColor: '#f3f4f6' }} />
          <span style={{
            fontSize: '11px', color: '#9ca3af',
            backgroundColor: '#f9fafb', padding: '2px 8px', borderRadius: '99px',
          }}>
            {insights.length}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {insights.map(i => <InsightCard key={i.id} insight={i} type={type} />)}
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <Layout>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '80px', color: '#9ca3af', fontSize: '13px' }}>
          Memuat data...
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <Head><title>Morning Brief — AMARIS</title></Head>

      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '32px 24px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: '600', color: '#9ca3af', letterSpacing: '0.1em', marginBottom: '4px' }}>
              MORNING BRIEF
            </div>
            <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#111827', margin: 0, letterSpacing: '-0.02em' }}>
              {lastDate ? formatDate(lastDate) : 'Belum ada data'}
            </h1>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {lastDate && !brief && !generating && (
              <button
                onClick={generateBrief}
                style={{
                  padding: '9px 18px', borderRadius: '8px', border: 'none',
                  backgroundColor: '#0344D8', color: '#fff',
                  fontSize: '13px', fontWeight: '600', cursor: 'pointer',
                }}
              >
                Generate Brief
              </button>
            )}
            {brief && (
              <button
                onClick={generateBrief}
                disabled={generating}
                style={{
                  padding: '9px 18px', borderRadius: '8px',
                  border: '1px solid #e5e7eb', backgroundColor: '#fff',
                  color: '#6b7280', fontSize: '13px', cursor: 'pointer',
                }}
              >
                {generating ? 'Generating...' : 'Regenerate'}
              </button>
            )}
            <button
              onClick={() => router.push('/analytics/upload')}
              style={{
                padding: '9px 18px', borderRadius: '8px',
                border: '1px solid #e5e7eb', backgroundColor: '#fff',
                color: '#374151', fontSize: '13px', fontWeight: '500', cursor: 'pointer',
              }}
            >
              Upload Data
            </button>
          </div>
        </div>

        {/* Data availability pills */}
        {sessions.length > 0 && (
          <div style={{ display: 'flex', gap: '6px', marginBottom: '28px', flexWrap: 'wrap' }}>
            {sessions.map(s => (
              <div
                key={s.upload_date}
                title={`${s.upload_date} — ${s.row_count?.toLocaleString('id') ?? 0} trx`}
                style={{
                  padding: '4px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: '500',
                  backgroundColor: s.upload_date === lastDate ? '#0344D8' : '#f3f4f6',
                  color: s.upload_date === lastDate ? '#fff' : '#9ca3af',
                  cursor: 'default',
                }}
              >
                {new Date(s.upload_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
              </div>
            ))}
          </div>
        )}

        {/* No data state */}
        {sessions.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '60px 40px',
            backgroundColor: '#f9fafb', borderRadius: '12px',
            border: '1px dashed #e5e7eb',
          }}>
            <div style={{ fontSize: '40px', marginBottom: '16px' }}>📊</div>
            <div style={{ fontSize: '16px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
              Belum ada data
            </div>
            <div style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '24px' }}>
              Upload data NOBU, ESA, dan Master Agen untuk mulai
            </div>
            <button
              onClick={() => router.push('/analytics/upload')}
              style={{
                padding: '10px 24px', borderRadius: '8px', border: 'none',
                backgroundColor: '#0344D8', color: '#fff',
                fontSize: '13px', fontWeight: '600', cursor: 'pointer',
              }}
            >
              Upload Data Sekarang
            </button>
          </div>
        )}

        {/* Brief not generated yet */}
        {sessions.length > 0 && !brief && !generating && (
          <div style={{
            textAlign: 'center', padding: '48px 40px',
            backgroundColor: '#f9fafb', borderRadius: '12px',
            border: '1px dashed #e5e7eb',
          }}>
            <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '20px' }}>
              Data tersedia. Klik Generate Brief untuk melihat insight hari ini.
            </div>
            <button
              onClick={generateBrief}
              style={{
                padding: '10px 24px', borderRadius: '8px', border: 'none',
                backgroundColor: '#0344D8', color: '#fff',
                fontSize: '13px', fontWeight: '600', cursor: 'pointer',
              }}
            >
              Generate Brief
            </button>
          </div>
        )}

        {/* Generating */}
        {generating && (
          <div style={{
            textAlign: 'center', padding: '48px',
            backgroundColor: '#f9fafb', borderRadius: '12px',
            border: '1px solid #e5e7eb', color: '#6b7280', fontSize: '13px',
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
                backgroundColor: '#f0f7ff',
                border: '1px solid #bfdbfe',
                borderRadius: '12px',
                padding: '20px 24px',
                marginBottom: '32px',
              }}>
                <div style={{ fontSize: '10px', fontWeight: '700', color: '#3b82f6', letterSpacing: '0.1em', marginBottom: '10px' }}>
                  RINGKASAN EKSEKUTIF
                </div>
                <p style={{ fontSize: '14px', color: '#1e40af', lineHeight: '1.75', margin: 0, fontWeight: '500' }}>
                  {brief.narrative}
                </p>
              </div>
            )}

            {/* Insights */}
            <Section
              title="RISIKO UTAMA"
              icon="🔴"
              insights={brief.top_risks ?? []}
              type="risk"
              color="#dc2626"
            />
            <Section
              title="PELUANG UTAMA"
              icon="🟢"
              insights={brief.top_opportunities ?? []}
              type="opportunity"
              color="#16a34a"
            />
            <Section
              title="PERLU DIPERHATIKAN"
              icon="👁"
              insights={brief.top_watchlist ?? []}
              type="watch"
              color="#ca8a04"
            />

            {/* Footer */}
            {brief.generated_at && (
              <div style={{ fontSize: '11px', color: '#d1d5db', textAlign: 'center', marginTop: '8px' }}>
                Dibuat {new Date(brief.generated_at).toLocaleString('id-ID', {
                  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                })}
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  )
}
