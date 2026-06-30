import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Layout from '@/components/Layout'
import { createBrowserClient } from '@supabase/ssr'

interface UsageEvent {
  id: string
  email: string | null
  event_type: string
  page: string | null
  metadata: Record<string, unknown> | null
  duration_sec: number | null
  created_at: string
}

interface UserSummary {
  email: string
  total_events: number
  page_views: number
  total_duration_sec: number
  exports: number
  ai_questions: number
  drawer_opens: number
  last_seen: string
  top_page: string
}

const PAGE_LABELS: Record<string, string> = {
  '/analytics/pulse':         'Business Pulse',
  '/analytics/agents':        'Kinerja 14 Hari',
  '/analytics/hidden-gem':    'Produktifitas Agen',
  '/analytics/agent-liquidity': 'Likuiditas Agen',
  '/analytics/mitra':         'Kekuatan Mitra',
  '/analytics/pic':           'Kekuatan PIC',
  '/analytics/dashboard-3500': 'Lite & Plus',
  '/analytics/agent-summary': 'Agent Summary',
  '/analytics/agent-profile': 'Cari Agen',
  '/analytics/target-simple': 'Target Bisnis',
  '/ai-assistant':            'AI Assistant',
  '/':                        'Overview WAG',
  '/ranger':                  'Ranger',
}

const EVENT_LABELS: Record<string, string> = {
  page_view:            '👁 Page View',
  drawer_open:          '📂 Drawer',
  export_csv:           '📥 Export CSV',
  ai_question:          '🤖 AI Question',
  ai_session:           '🤖 AI Session',
  filter_change:        '🔽 Filter',
  generate_rekomendasi: '⚡ Generate Rekomendasi',
}

function fmtDuration(sec: number) {
  if (sec < 60)   return `${sec}d`
  if (sec < 3600) return `${Math.floor(sec/60)}m ${sec%60}d`
  return `${Math.floor(sec/3600)}j ${Math.floor((sec%3600)/60)}m`
}

function fmtDate(d: string) {
  return new Date(d).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function UsageMonitorPage() {
  const router  = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [events, setEvents]         = useState<UsageEvent[]>([])
  const [userSummaries, setUserSummaries] = useState<UserSummary[]>([])
  const [loading, setLoading]       = useState(true)
  const [activeTab, setActiveTab]   = useState<'users' | 'events' | 'pages'>('users')
  const [filterDays, setFilterDays] = useState(7)
  const [authorized, setAuthorized] = useState(false)

  useEffect(() => { init() }, [filterDays])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/login'); return }
    const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single()
    if (!userData || userData.role !== 'admin') { router.replace('/unauthorized'); return }
    setAuthorized(true)
    loadData()
  }

  async function loadData() {
    setLoading(true)
    try {
      const since = new Date(Date.now() - filterDays * 24 * 60 * 60 * 1000).toISOString()
      const { data } = await supabase
        .from('am_usage_events')
        .select('*')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(500)

      const evts = data ?? []
      setEvents(evts)

      // Agregasi per user — event tanpa email (page_view pra-login di /login atau
      // /auth/callback, sebelum session cookie ke-set) di-skip, bukan dilumpur jadi
      // satu baris "unknown". Itu bukan satu user nyasar, tapi gabungan semua user
      // sah pas baru mulai proses login, jadi gak representatif kalau ditampilkan.
      const byUser: Record<string, UsageEvent[]> = {}
      for (const e of evts) {
        if (!e.email) continue
        const key = e.email
        if (!byUser[key]) byUser[key] = []
        byUser[key].push(e)
      }

      const summaries: UserSummary[] = Object.entries(byUser).map(([email, evts]) => {
        const pageViews = evts.filter(e => e.event_type === 'page_view')
        const totalDur  = pageViews.reduce((s, e) => s + (e.duration_sec ?? 0), 0)

        // Top page
        const pageCounts: Record<string, number> = {}
        for (const e of pageViews) {
          const p = e.page ?? 'unknown'
          pageCounts[p] = (pageCounts[p] ?? 0) + 1
        }
        const topPage = Object.entries(pageCounts).sort((a,b) => b[1]-a[1])[0]?.[0] ?? '—'

        return {
          email,
          total_events:     evts.length,
          page_views:       pageViews.length,
          total_duration_sec: totalDur,
          exports:          evts.filter(e => e.event_type === 'export_csv').length,
          ai_questions:     evts.filter(e => e.event_type === 'ai_question').length,
          drawer_opens:     evts.filter(e => e.event_type === 'drawer_open').length,
          last_seen:        evts[0]?.created_at ?? '',
          top_page:         PAGE_LABELS[topPage] ?? topPage,
        }
      }).sort((a,b) => b.total_events - a.total_events)

      setUserSummaries(summaries)
    } finally { setLoading(false) }
  }

  // Agregasi per halaman
  const pageStats = events
    .filter(e => e.event_type === 'page_view' && e.page)
    .reduce((acc, e) => {
      const key = PAGE_LABELS[e.page!] ?? e.page!
      if (!acc[key]) acc[key] = { visits: 0, total_dur: 0 }
      acc[key].visits++
      acc[key].total_dur += e.duration_sec ?? 0
      return acc
    }, {} as Record<string, { visits: number, total_dur: number }>)

  const pageSorted = Object.entries(pageStats).sort((a,b) => b[1].visits - a[1].visits)

  if (!authorized) return null

  return (
    <Layout>
      <Head><title>Usage Monitor — AMARIS</title></Head>
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 24px' }}>

        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '11px', fontWeight: '600', color: '#9ca3af', letterSpacing: '0.1em', marginBottom: '4px' }}>ADMIN</div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#111827', margin: 0 }}>📊 Usage Monitor</h1>
          <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>Aktivitas pengguna platform AMARIS — bukan konten, hanya pola penggunaan.</p>
        </div>

        {/* Filter + Tab */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', gap: '4px', backgroundColor: '#f3f4f6', padding: '4px', borderRadius: '10px' }}>
            {([['users','👤 Per User'], ['pages','📄 Per Halaman'], ['events','📋 Event Log']] as const).map(([key, label]) => (
              <button key={key} onClick={() => setActiveTab(key)}
                style={{ padding: '7px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: activeTab === key ? '600' : '400', backgroundColor: activeTab === key ? '#fff' : 'transparent', color: activeTab === key ? '#111827' : '#6b7280', boxShadow: activeTab === key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>
                {label}
              </button>
            ))}
          </div>
          <select value={filterDays} onChange={e => setFilterDays(Number(e.target.value))}
            style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px', backgroundColor: '#fff' }}>
            <option value={1}>24 Jam Terakhir</option>
            <option value={7}>7 Hari Terakhir</option>
            <option value={14}>14 Hari Terakhir</option>
            <option value={30}>30 Hari Terakhir</option>
          </select>
        </div>

        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>Memuat data...</div>
        ) : (
          <>
            {/* ── Tab: Per User ── */}
            {activeTab === 'users' && (
              <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 80px 80px 80px 80px 80px 100px 120px', padding: '10px 16px', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.05em' }}>
                  <div>USER</div>
                  <div style={{ textAlign: 'center' }}>VIEWS</div>
                  <div style={{ textAlign: 'center' }}>DURASI</div>
                  <div style={{ textAlign: 'center' }}>EXPORT</div>
                  <div style={{ textAlign: 'center' }}>AI</div>
                  <div style={{ textAlign: 'center' }}>DRAWER</div>
                  <div>HALAMAN FAVORIT</div>
                  <div>TERAKHIR AKTIF</div>
                </div>
                {userSummaries.length === 0 ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>Belum ada data aktivitas</div>
                ) : userSummaries.map((u, i) => (
                  <div key={u.email} style={{ display: 'grid', gridTemplateColumns: '1.5fr 80px 80px 80px 80px 80px 100px 120px', padding: '12px 16px', borderBottom: i < userSummaries.length-1 ? '1px solid #f3f4f6' : 'none', alignItems: 'center', backgroundColor: '#fff' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: '#111827' }}>{u.email.split('@')[0]}</div>
                      <div style={{ fontSize: '10px', color: '#9ca3af' }}>{u.email}</div>
                    </div>
                    <div style={{ textAlign: 'center', fontSize: '13px', fontWeight: '600', color: '#374151' }}>{u.page_views}</div>
                    <div style={{ textAlign: 'center', fontSize: '12px', color: '#374151' }}>{fmtDuration(u.total_duration_sec)}</div>
                    <div style={{ textAlign: 'center', fontSize: '13px', color: u.exports > 0 ? '#166534' : '#d1d5db', fontWeight: u.exports > 0 ? '700' : '400' }}>{u.exports}</div>
                    <div style={{ textAlign: 'center', fontSize: '13px', color: u.ai_questions > 0 ? '#1e40af' : '#d1d5db', fontWeight: u.ai_questions > 0 ? '700' : '400' }}>{u.ai_questions}</div>
                    <div style={{ textAlign: 'center', fontSize: '13px', color: '#374151' }}>{u.drawer_opens}</div>
                    <div style={{ fontSize: '11px', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.top_page}</div>
                    <div style={{ fontSize: '11px', color: '#9ca3af' }}>{fmtDate(u.last_seen)}</div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Tab: Per Halaman ── */}
            {activeTab === 'pages' && (
              <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 120px 120px', padding: '10px 16px', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.05em' }}>
                  <div>HALAMAN</div>
                  <div style={{ textAlign: 'right' }}>KUNJUNGAN</div>
                  <div style={{ textAlign: 'right' }}>TOTAL DURASI</div>
                  <div style={{ textAlign: 'right' }}>AVG DURASI</div>
                </div>
                {pageSorted.length === 0 ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>Belum ada data</div>
                ) : pageSorted.map(([page, stat], i) => (
                  <div key={page} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 120px 120px', padding: '12px 16px', borderBottom: i < pageSorted.length-1 ? '1px solid #f3f4f6' : 'none', alignItems: 'center', backgroundColor: '#fff' }}>
                    <div style={{ fontSize: '13px', fontWeight: '500', color: '#111827' }}>{page}</div>
                    <div style={{ textAlign: 'right', fontSize: '13px', fontWeight: '700', color: '#374151' }}>{stat.visits}</div>
                    <div style={{ textAlign: 'right', fontSize: '12px', color: '#374151' }}>{fmtDuration(stat.total_dur)}</div>
                    <div style={{ textAlign: 'right', fontSize: '12px', color: '#6b7280' }}>
                      {stat.visits > 0 ? fmtDuration(Math.round(stat.total_dur / stat.visits)) : '—'}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Tab: Event Log ── */}
            {activeTab === 'events' && (
              <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '120px 130px 160px 1fr 80px', padding: '10px 16px', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.05em' }}>
                  <div>WAKTU</div>
                  <div>USER</div>
                  <div>EVENT</div>
                  <div>HALAMAN / DETAIL</div>
                  <div style={{ textAlign: 'right' }}>DURASI</div>
                </div>
                {events.slice(0, 100).map((e, i) => (
                  <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '120px 130px 160px 1fr 80px', padding: '9px 16px', borderBottom: i < Math.min(events.length, 100)-1 ? '1px solid #f3f4f6' : 'none', alignItems: 'center', backgroundColor: '#fff', fontSize: '12px' }}>
                    <div style={{ color: '#9ca3af', fontSize: '11px' }}>{fmtDate(e.created_at)}</div>
                    <div style={{ color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.email?.split('@')[0] ?? '—'}</div>
                    <div>
                      <span style={{ padding: '1px 8px', borderRadius: '99px', fontSize: '10px', fontWeight: '600', backgroundColor: '#f3f4f6', color: '#374151' }}>
                        {EVENT_LABELS[e.event_type] ?? e.event_type}
                      </span>
                    </div>
                    <div style={{ color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {PAGE_LABELS[e.page ?? ''] ?? (e.page ?? '—')}
                      {e.metadata && Object.keys(e.metadata).length > 0 && (
                        <span style={{ marginLeft: '6px', color: '#9ca3af', fontSize: '10px' }}>
                          {JSON.stringify(e.metadata).slice(0, 50)}
                        </span>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', color: '#9ca3af' }}>
                      {e.duration_sec ? fmtDuration(e.duration_sec) : '—'}
                    </div>
                  </div>
                ))}
                {events.length > 100 && (
                  <div style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', color: '#9ca3af', borderTop: '1px solid #f3f4f6' }}>
                    Menampilkan 100 dari {events.length} event terbaru
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  )
}
