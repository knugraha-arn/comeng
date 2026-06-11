import { useEffect, useState } from 'react'
import Head from 'next/head'
import Layout from '../../components/Layout'
import { createBrowserClient } from '@supabase/ssr'

interface HiddenGemAgent {
  serial_number: string
  merchant_name: string | null
  mitra: string | null
  pic: string | null
  active_days_14: number
  avg_trx_per_active_day_14: number
  active_days_month: number
  total_trx_month: number
  avg_trx_per_active_day_month: number
  growth_pct: number
  trend: 'growing' | 'declining' | 'consistent'
  bucket: string
}

interface AgentDayDetail {
  transaction_date: string
  total_trx: number
  transfer_trx: number
  cek_saldo_trx: number
  total_fee: number
  total_amount: number
  dip_count: number
  swipe_count: number
  merchant_name: string | null
  mitra: string | null
  pic: string | null
  alamat_struk: string | null
  brand: string | null
  tipe_mesin: string | null
  source_app: string | null
  terminal_data_source: string | null
}

interface MonthlyProgress {
  total_fee: number
  total_trx: number
  days_elapsed: number
  days_in_month: number
  month_start: string
  end_date: string
}

const TREND_CONFIG = {
  growing: {
    label: 'Surprisingly Growing',
    icon: '💎',
    color: '#166534',
    bg: '#f0fdf4',
    border: '#bbf7d0',
    badgeBg: '#dcfce7',
    desc: 'Pace bulan ini jauh di atas history — momentum sedang bagus',
  },
  declining: {
    label: 'Perlu Perhatian',
    icon: '⚠️',
    color: '#92400e',
    bg: '#fffbeb',
    border: '#fde68a',
    badgeBg: '#fef9c3',
    desc: 'Pace bulan ini turun signifikan — perlu intervensi segera',
  },
  consistent: {
    label: 'Konsisten',
    icon: '✅',
    color: '#1e40af',
    bg: '#eff6ff',
    border: '#bfdbfe',
    badgeBg: '#dbeafe',
    desc: 'Pace bulan ini sesuai history — agen reliable',
  },
}

const BUCKET_CONFIG: Record<string, { label: string, color: string, bg: string, border: string }> = {
  productive: { label: 'Productive', color: '#166534', bg: '#dcfce7', border: '#bbf7d0' },
  moderate:   { label: 'Moderate',   color: '#ca8a04', bg: '#fef9c3', border: '#fde68a' },
  sporadic:   { label: 'Sporadic',   color: '#dc2626', bg: '#fee2e2', border: '#fecaca' },
}

function formatFee(val: number): string {
  if (val >= 1000000) return `Rp ${(val / 1000000).toFixed(1)}jt`
  if (val >= 1000) return `Rp ${(val / 1000).toFixed(0)}rb`
  return `Rp ${val}`
}

function GrowthBadge({ pct }: { pct: number }) {
  const isPos = pct > 0
  return (
    <span style={{
      padding: '2px 8px', borderRadius: '99px', fontSize: '12px', fontWeight: '700',
      backgroundColor: isPos ? '#dcfce7' : '#fee2e2',
      color: isPos ? '#166534' : '#dc2626',
    }}>
      {isPos ? '↑' : '↓'} {Math.abs(pct)}%
    </span>
  )
}

export default function HiddenGemPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [agents, setAgents] = useState<HiddenGemAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'growing' | 'declining' | 'consistent'>('growing')
  const [progress, setProgress] = useState<MonthlyProgress | null>(null)
  const [monthlyTarget, setMonthlyTarget] = useState<number | null>(null)

  // Drawer
  const [selectedAgent, setSelectedAgent] = useState<HiddenGemAgent | null>(null)
  const [agentDetail, setAgentDetail] = useState<AgentDayDetail[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [lastDate, setLastDate] = useState('')
  const [sinceDate, setSinceDate] = useState('')

  // AI
  const [aiLoading, setAiLoading] = useState<string | null>(null)
  const [aiResults, setAiResults] = useState<Record<string, { narasi: string, wa_script: string }>>({})

  useEffect(() => { init() }, [])

  async function init() {
    setLoading(true)
    try {
      const [agentsRes, progressRes] = await Promise.all([
        supabase.rpc('get_hidden_gem_agents'),
        supabase.rpc('get_monthly_progress'),
      ])

      setAgents(agentsRes.data ?? [])

      if (progressRes.data) {
        const d = typeof progressRes.data === 'string' ? JSON.parse(progressRes.data) : progressRes.data
        setProgress({
          total_fee: Number(d.total_fee ?? 0),
          total_trx: Number(d.total_trx ?? 0),
          days_elapsed: Number(d.days_elapsed ?? 0),
          days_in_month: Number(d.days_in_month ?? 0),
          month_start: d.month_start,
          end_date: d.end_date,
        })

        // Load target bulan ini
        const endDate = new Date(d.end_date)
        const { data: targetData } = await supabase
          .from('am_targets')
          .select('monthly_fee')
          .eq('period_year', endDate.getFullYear())
          .eq('period_month', endDate.getMonth() + 1)
          .single()
        setMonthlyTarget(targetData?.monthly_fee ?? null)

        // Set lastDate dan sinceDate untuk drawer
        const maxDate = d.end_date
        setLastDate(maxDate)
        const [y, m, dd] = maxDate.split('-').map(Number)
        const sd = new Date(y, m - 1, dd - 13)
        setSinceDate(`${sd.getFullYear()}-${String(sd.getMonth() + 1).padStart(2, '0')}-${String(sd.getDate()).padStart(2, '0')}`)
      }
    } finally {
      setLoading(false)
    }
  }

  async function openDrawer(agent: HiddenGemAgent) {
    setSelectedAgent(agent)
    setAgentDetail([])
    setLoadingDetail(true)
    try {
      const { data } = await supabase.rpc('get_agent_detail', {
        p_serial: agent.serial_number,
        p_since: sinceDate,
        p_until: lastDate,
      })
      setAgentDetail(data ?? [])
    } finally {
      setLoadingDetail(false)
    }
  }

  async function generateAI(agent: HiddenGemAgent) {
    const key = agent.serial_number
    setAiLoading(key)
    try {
      const prompt = `Kamu adalah analis bisnis untuk jaringan agen Mini ATM di Indonesia.

Data agen:
- Nama: ${agent.merchant_name ?? agent.serial_number}
- Mitra: ${agent.mitra ?? '—'}
- PIC: ${agent.pic ?? '—'}
- Bucket: ${agent.bucket}
- Trend: ${agent.trend}
- Hari aktif 14 hari: ${agent.active_days_14} hari
- Rata-rata TRX/hari aktif (14 hari): ${agent.avg_trx_per_active_day_14}
- Hari aktif bulan ini: ${agent.active_days_month} hari
- Total TRX bulan ini: ${agent.total_trx_month}
- Rata-rata TRX/hari aktif bulan ini: ${agent.avg_trx_per_active_day_month}
- Growth: ${agent.growth_pct > 0 ? '+' : ''}${agent.growth_pct}%

Berikan response dalam JSON dengan format:
{
  "narasi": "2-3 kalimat analisis kondisi agen dan rekomendasi action untuk PIC",
  "wa_script": "pesan WhatsApp siap kirim dari PIC ke agen, bahasa Indonesia natural, maksimal 3 kalimat"
}

Untuk trend "growing": fokus pada momentum positif dan dorongan untuk mempertahankan.
Untuk trend "declining": fokus pada identifikasi masalah dan urgensi intervensi.
Untuk trend "consistent": apresiasi konsistensi dan dorong untuk naik level.

Jawab HANYA dengan JSON, tanpa penjelasan lain.`

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
      const text = data.content?.[0]?.text ?? ''
      const clean = text.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(clean)
      setAiResults(prev => ({ ...prev, [key]: parsed }))
    } catch {
      setAiResults(prev => ({ ...prev, [key]: { narasi: 'Gagal generate analisis.', wa_script: '' } }))
    } finally {
      setAiLoading(null)
    }
  }

  function copyWA(text: string) {
    navigator.clipboard.writeText(text)
  }

  const filtered = agents.filter(a => a.trend === activeTab)
  const growingCount = agents.filter(a => a.trend === 'growing').length
  const decliningCount = agents.filter(a => a.trend === 'declining').length
  const consistentCount = agents.filter(a => a.trend === 'consistent').length

  const feeProgress = progress && monthlyTarget
    ? Math.min(100, Math.round(progress.total_fee / monthlyTarget * 100))
    : null

  const projectedFee = progress && progress.days_elapsed > 0
    ? Math.round(progress.total_fee / progress.days_elapsed * progress.days_in_month)
    : null

  const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']
  const currentMonth = progress ? MONTHS[new Date(progress.end_date).getMonth()] : ''
  const currentYear = progress ? new Date(progress.end_date).getFullYear() : ''

  return (
    <Layout>
      <Head><title>Hidden Gem — AMARIS</title></Head>
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 24px' }}>

        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '11px', fontWeight: '600', color: '#9ca3af', letterSpacing: '0.1em', marginBottom: '4px' }}>ANALITIK AGEN</div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#111827', margin: 0, letterSpacing: '-0.02em' }}>💎 Hidden Gem</h1>
          <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
            Irisan antara history 14 hari dan target bulan ini — siapa yang perlu di-push dan siapa yang perlu diselamatkan.
          </p>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px', color: '#9ca3af', fontSize: '13px' }}>Menganalisis data...</div>
        ) : (
          <>
            {/* Target Progress Card */}
            {progress && (
              <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px 24px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: '700', color: '#374151', letterSpacing: '0.05em' }}>
                      TARGET {currentMonth.toUpperCase()} {currentYear}
                    </div>
                    <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>
                      Hari ke-{progress.days_elapsed} dari {progress.days_in_month}
                    </div>
                  </div>
                  {projectedFee && monthlyTarget && (
                    <div style={{
                      padding: '6px 14px', borderRadius: '99px', fontSize: '12px', fontWeight: '700',
                      backgroundColor: projectedFee >= monthlyTarget ? '#dcfce7' : '#fee2e2',
                      color: projectedFee >= monthlyTarget ? '#166534' : '#dc2626',
                    }}>
                      Proyeksi: {formatFee(projectedFee)}
                      {projectedFee >= monthlyTarget ? ' ✓' : ' ↓'}
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '12px', color: '#6b7280' }}>Fee terkumpul</span>
                      <span style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>
                        {formatFee(progress.total_fee)}
                        {monthlyTarget && <span style={{ color: '#9ca3af', fontWeight: '400' }}> / {formatFee(monthlyTarget)}</span>}
                      </span>
                    </div>
                    <div style={{ height: '6px', backgroundColor: '#f3f4f6', borderRadius: '99px', overflow: 'hidden' }}>
                      <div style={{ width: `${feeProgress ?? 0}%`, height: '100%', backgroundColor: feeProgress && feeProgress >= 100 ? '#22c55e' : '#0344D8', borderRadius: '99px', transition: 'width 0.5s' }} />
                    </div>
                    {feeProgress !== null && <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>{feeProgress}% tercapai</div>}
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '12px', color: '#6b7280' }}>Total TRX bulan ini</span>
                      <span style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>{progress.total_trx.toLocaleString('id')}</span>
                    </div>
                    <div style={{ height: '6px', backgroundColor: '#f3f4f6', borderRadius: '99px', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(100, progress.days_elapsed / progress.days_in_month * 100)}%`, height: '100%', backgroundColor: '#7c3aed', borderRadius: '99px' }} />
                    </div>
                    <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                      {Math.round(progress.total_trx / Math.max(progress.days_elapsed, 1)).toLocaleString('id')} TRX/hari rata-rata
                    </div>
                  </div>
                </div>

                {!monthlyTarget && (
                  <div style={{ marginTop: '12px', fontSize: '12px', color: '#9ca3af' }}>
                    💡 <a href="/analytics/target-simple" style={{ color: '#0344D8' }}>Set target bulan ini</a> untuk lihat proyeksi lengkap.
                  </div>
                )}
              </div>
            )}

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
              {(['growing', 'declining', 'consistent'] as const).map(tab => {
                const cfg = TREND_CONFIG[tab]
                const count = tab === 'growing' ? growingCount : tab === 'declining' ? decliningCount : consistentCount
                const isActive = activeTab === tab
                return (
                  <button key={tab} onClick={() => setActiveTab(tab)} style={{
                    padding: '10px 20px', borderRadius: '8px', cursor: 'pointer',
                    border: `2px solid ${isActive ? cfg.color : '#e5e7eb'}`,
                    backgroundColor: isActive ? cfg.bg : '#fff',
                    color: isActive ? cfg.color : '#6b7280',
                    fontSize: '13px', fontWeight: '600',
                    transition: 'all 0.15s',
                    display: 'flex', alignItems: 'center', gap: '8px',
                  }}>
                    <span>{cfg.icon}</span>
                    <span>{cfg.label}</span>
                    <span style={{
                      padding: '1px 8px', borderRadius: '99px', fontSize: '11px',
                      backgroundColor: isActive ? cfg.badgeBg : '#f3f4f6',
                      color: isActive ? cfg.color : '#9ca3af',
                      fontWeight: '700',
                    }}>{count}</span>
                  </button>
                )
              })}
            </div>

            {/* Tab description */}
            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '16px', padding: '8px 12px', backgroundColor: TREND_CONFIG[activeTab].bg, borderRadius: '6px', border: `1px solid ${TREND_CONFIG[activeTab].border}` }}>
              {TREND_CONFIG[activeTab].icon} {TREND_CONFIG[activeTab].desc}
            </div>

            {/* Agent List */}
            {filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px', backgroundColor: '#f9fafb', borderRadius: '10px', border: '1px dashed #e5e7eb', color: '#9ca3af', fontSize: '13px' }}>
                Tidak ada agen di kategori ini
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {filtered.map(agent => {
                  const cfg = TREND_CONFIG[agent.trend]
                  const bucketCfg = BUCKET_CONFIG[agent.bucket] ?? BUCKET_CONFIG.sporadic
                  const ai = aiResults[agent.serial_number]
                  const isLoadingAI = aiLoading === agent.serial_number

                  return (
                    <div key={agent.serial_number} style={{
                      backgroundColor: '#fff', border: `1px solid #e5e7eb`,
                      borderRadius: '10px', overflow: 'hidden',
                    }}>
                      {/* Agent Row */}
                      <div
                        onClick={() => openDrawer(agent)}
                        style={{ padding: '16px 20px', cursor: 'pointer', display: 'flex', gap: '16px', alignItems: 'center' }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = '#fff'}
                      >
                        {/* Trend indicator */}
                        <div style={{
                          width: '4px', borderRadius: '99px', alignSelf: 'stretch',
                          backgroundColor: cfg.color, flexShrink: 0,
                        }} />

                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <span style={{ fontSize: '14px', fontWeight: '700', color: '#111827' }}>
                              {agent.merchant_name ?? agent.serial_number}
                            </span>
                            <span style={{
                              padding: '1px 7px', borderRadius: '99px', fontSize: '10px', fontWeight: '700',
                              backgroundColor: bucketCfg.bg, color: bucketCfg.color, border: `1px solid ${bucketCfg.border}`,
                            }}>{bucketCfg.label}</span>
                          </div>
                          <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                            {agent.serial_number} · {agent.mitra ?? '—'} · {agent.pic ?? '—'}
                          </div>
                        </div>

                        {/* Stats */}
                        <div style={{ display: 'flex', gap: '24px', alignItems: 'center', flexShrink: 0 }}>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '2px' }}>14 hari</div>
                            <div style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>
                              {agent.avg_trx_per_active_day_14} TRX/hari
                            </div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '2px' }}>bulan ini</div>
                            <div style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>
                              {agent.avg_trx_per_active_day_month} TRX/hari
                            </div>
                          </div>
                          <GrowthBadge pct={agent.growth_pct} />
                        </div>
                      </div>

                      {/* AI Section */}
                      <div style={{ borderTop: '1px solid #f3f4f6', padding: '12px 20px', backgroundColor: '#fafafa', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                        {!ai && (
                          <button
                            onClick={() => generateAI(agent)}
                            disabled={!!isLoadingAI}
                            style={{
                              padding: '6px 14px', borderRadius: '6px', border: '1px solid #e5e7eb',
                              backgroundColor: '#fff', color: '#0344D8', fontSize: '12px',
                              fontWeight: '600', cursor: isLoadingAI ? 'wait' : 'pointer',
                              flexShrink: 0,
                            }}
                          >
                            {isLoadingAI ? '⏳ Menganalisis...' : '✨ Analisis AI'}
                          </button>
                        )}

                        {ai && (
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '12px', color: '#374151', lineHeight: '1.6', marginBottom: '10px' }}>
                              <strong style={{ color: '#111827' }}>Analisis:</strong> {ai.narasi}
                            </div>
                            {ai.wa_script && (
                              <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 14px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                <div style={{ flex: 1, fontSize: '12px', color: '#166534', lineHeight: '1.6' }}>
                                  <strong>📱 WA Script:</strong> {ai.wa_script}
                                </div>
                                <button
                                  onClick={() => copyWA(ai.wa_script)}
                                  style={{
                                    padding: '4px 10px', borderRadius: '6px', border: '1px solid #bbf7d0',
                                    backgroundColor: '#fff', color: '#166534', fontSize: '11px',
                                    cursor: 'pointer', flexShrink: 0, fontWeight: '600',
                                  }}
                                >
                                  Copy
                                </button>
                              </div>
                            )}
                            <button
                              onClick={() => generateAI(agent)}
                              style={{ marginTop: '8px', fontSize: '11px', color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                            >
                              🔄 Regenerate
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Drawer */}
      {selectedAgent && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}>
          <div onClick={() => setSelectedAgent(null)} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)' }} />
          <div style={{ position: 'relative', width: '480px', height: '100%', backgroundColor: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'sticky', top: 0, backgroundColor: '#fff', zIndex: 1 }}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: '800', color: '#111827', marginBottom: '4px' }}>
                  {selectedAgent.merchant_name ?? selectedAgent.serial_number}
                </div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '6px' }}>{selectedAgent.serial_number}</div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <span style={{
                    padding: '2px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: '700',
                    backgroundColor: TREND_CONFIG[selectedAgent.trend].badgeBg,
                    color: TREND_CONFIG[selectedAgent.trend].color,
                  }}>
                    {TREND_CONFIG[selectedAgent.trend].icon} {TREND_CONFIG[selectedAgent.trend].label}
                  </span>
                  <GrowthBadge pct={selectedAgent.growth_pct} />
                </div>
              </div>
              <button onClick={() => setSelectedAgent(null)} style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#6b7280', fontSize: '18px', cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>

            {loadingDetail ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>Memuat data...</div>
            ) : agentDetail.length > 0 ? (
              <div style={{ padding: '20px 24px' }}>
                {/* Perbandingan 14 hari vs bulan ini */}
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>PERBANDINGAN PERFORMA</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div style={{ padding: '12px', backgroundColor: '#f9fafb', borderRadius: '8px', textAlign: 'center' }}>
                      <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}>Avg TRX/hari (14 hari)</div>
                      <div style={{ fontSize: '20px', fontWeight: '800', color: '#374151' }}>{selectedAgent.avg_trx_per_active_day_14}</div>
                    </div>
                    <div style={{ padding: '12px', backgroundColor: TREND_CONFIG[selectedAgent.trend].bg, borderRadius: '8px', textAlign: 'center', border: `1px solid ${TREND_CONFIG[selectedAgent.trend].border}` }}>
                      <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}>Avg TRX/hari (bulan ini)</div>
                      <div style={{ fontSize: '20px', fontWeight: '800', color: TREND_CONFIG[selectedAgent.trend].color }}>{selectedAgent.avg_trx_per_active_day_month}</div>
                    </div>
                    <div style={{ padding: '12px', backgroundColor: '#f9fafb', borderRadius: '8px', textAlign: 'center' }}>
                      <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}>Hari aktif 14 hari</div>
                      <div style={{ fontSize: '20px', fontWeight: '800', color: '#374151' }}>{selectedAgent.active_days_14}</div>
                    </div>
                    <div style={{ padding: '12px', backgroundColor: '#f9fafb', borderRadius: '8px', textAlign: 'center' }}>
                      <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}>Hari aktif bulan ini</div>
                      <div style={{ fontSize: '20px', fontWeight: '800', color: '#374151' }}>{selectedAgent.active_days_month}</div>
                    </div>
                  </div>
                </div>

                {/* Info Agen */}
                {(() => {
                  const latest = agentDetail[agentDetail.length - 1]
                  return (
                    <div style={{ marginBottom: '24px' }}>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>INFO AGEN</div>
                      {[
                        { label: 'Mitra',    value: latest.mitra },
                        { label: 'PIC',      value: latest.pic },
                        { label: 'Alamat',   value: latest.alamat_struk },
                        { label: 'Brand',    value: latest.brand },
                        { label: 'Mesin',    value: latest.tipe_mesin },
                      ].filter(r => r.value).map(r => (
                        <div key={r.label} style={{ display: 'flex', gap: '12px', padding: '7px 0', borderBottom: '1px solid #f9fafb' }}>
                          <span style={{ fontSize: '12px', color: '#9ca3af', minWidth: '80px', flexShrink: 0 }}>{r.label}</span>
                          <span style={{ fontSize: '12px', color: '#111827', fontWeight: '500' }}>{r.value}</span>
                        </div>
                      ))}
                    </div>
                  )
                })()}

                {/* Grafik TRX per hari */}
                <div>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>TRANSAKSI PER HARI (14 HARI)</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '80px' }}>
                    {(() => {
                      const maxTrx = Math.max(...agentDetail.map(d => Number(d.total_trx)), 1)
                      const sd = new Date(sinceDate)
                      return Array.from({ length: 14 }, (_, i) => {
                        const d = new Date(sd)
                        d.setDate(sd.getDate() + i)
                        const dateStr = d.toISOString().split('T')[0]
                        const found = agentDetail.find(a => a.transaction_date === dateStr)
                        const trx = found ? Number(found.total_trx) : 0
                        const isThisMonth = dateStr >= (progress?.month_start ?? '')
                        return (
                          <div key={dateStr} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}
                            title={`${dateStr}: ${trx} trx`}>
                            <div style={{
                              width: '100%',
                              height: `${Math.max(4, (trx / maxTrx) * 64)}px`,
                              backgroundColor: trx > 0 ? (isThisMonth ? TREND_CONFIG[selectedAgent.trend].color : '#94a3b8') : '#f3f4f6',
                              borderRadius: '3px 3px 0 0',
                              transition: 'height 0.3s',
                              opacity: trx > 0 ? 1 : 0.3,
                            }} />
                            <div style={{ fontSize: '8px', color: '#d1d5db', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                              {new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                            </div>
                          </div>
                        )
                      })
                    })()}
                  </div>
                  <div style={{ display: 'flex', gap: '12px', marginTop: '8px', fontSize: '10px', color: '#9ca3af' }}>
                    <span>▪ <span style={{ color: '#94a3b8' }}>Bulan lalu</span></span>
                    <span>▪ <span style={{ color: TREND_CONFIG[selectedAgent.trend].color }}>Bulan ini</span></span>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>Tidak ada data</div>
            )}
          </div>
        </div>
      )}
    </Layout>
  )
}
