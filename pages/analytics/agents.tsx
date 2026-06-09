import { useEffect, useState } from 'react'
import Head from 'next/head'
import Layout from '../../components/Layout'
import { createBrowserClient } from '@supabase/ssr'

interface Agent {
  serial_number:  string
  merchant_name:  string | null
  mitra:          string | null
  pic:            string | null
  active_days:    number
  total_trx:      number
  transfer_trx:   number
  cek_saldo_trx:  number
  total_fee:      number
  last_active:    string
  bucket:         string
}

interface AgentDayDetail {
  transaction_date:     string
  total_trx:            number
  transfer_trx:         number
  cek_saldo_trx:        number
  total_fee:            number
  total_amount:         number
  dip_count:            number
  swipe_count:          number
  merchant_name:        string | null
  mitra:                string | null
  pic:                  string | null
  alamat_struk:         string | null
  brand:                string | null
  tipe_mesin:           string | null
  source_app:           string | null
  terminal_data_source: string | null
}

interface BucketSummary {
  bucket:      string
  agent_count: number
  total_trx:   number
  total_fee:   number
}

interface Target {
  daily_active_agents:  number | null
  daily_transfer_trx:   number | null
  daily_fee:            number | null
}

interface FilterOption {
  mitra: string
  pic:   string
}

const PAGE_SIZE = 20
const MIN_TRX_POTENTIAL = 20

const BUCKET_CONFIG = {
  growing:   { label: 'Growing',   icon: '🌱', color: '#166534', bg: '#dcfce7', border: '#bbf7d0' },
  potential: { label: 'Potential', icon: '⚡', color: '#ca8a04', bg: '#fef9c3', border: '#fde68a' },
  at_risk:   { label: 'At Risk',   icon: '⚠️', color: '#dc2626', bg: '#fee2e2', border: '#fecaca' },
  dormant:   { label: 'Dormant',   icon: '🔴', color: '#6b7280', bg: '#f3f4f6', border: '#e5e7eb' },
}

function formatFee(val: number): string {
  if (val >= 1000000) return `Rp ${(val / 1000000).toFixed(1)}jt`
  if (val >= 1000) return `Rp ${(val / 1000).toFixed(0)}rb`
  return `Rp ${val}`
}

function ProgressBar({ value, max, color }: { value: number, max: number, color: string }) {
  const pct = max > 0 ? Math.min(100, Math.round(value / max * 100)) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ flex: 1, height: '6px', backgroundColor: '#f3f4f6', borderRadius: '99px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', backgroundColor: color, borderRadius: '99px', transition: 'width 0.5s' }} />
      </div>
      <span style={{ fontSize: '12px', fontWeight: '700', color, minWidth: '36px', textAlign: 'right' }}>{pct}%</span>
    </div>
  )
}

export default function AgentDashboard() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [agents, setAgents] = useState<Agent[]>([])
  const [summary, setSummary] = useState<BucketSummary[]>([])
  const [target, setTarget] = useState<Target | null>(null)
  const [filterOptions, setFilterOptions] = useState<FilterOption[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingList, setLoadingList] = useState(false)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [bucket, setBucket] = useState<string>('')
  const [filterMitra, setFilterMitra] = useState('')
  const [filterPic, setFilterPic] = useState('')
  const [lastDate, setLastDate] = useState('')
  const [sinceDate, setSinceDate] = useState('')
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [agentDetail, setAgentDetail] = useState<AgentDayDetail[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [avgActivePerDay, setAvgActivePerDay] = useState(0)

  useEffect(() => { init() }, [])
  useEffect(() => { loadAgents() }, [page, bucket, filterMitra, filterPic])

  async function init() {
    setLoading(true)
    try {
      // Tanggal terbaru
      const { data: latest } = await supabase
        .from('am_transactions')
        .select('transaction_date')
        .order('transaction_date', { ascending: false })
        .limit(1)
        .single()

      if (!latest) return

      const maxDate = latest.transaction_date
      const sd = new Date(maxDate)
      sd.setDate(sd.getDate() - 13)
      const sinceStr = sd.toISOString().split('T')[0]
      setLastDate(maxDate)
      setSinceDate(sinceStr)

      const now = new Date(maxDate)

      // Load summary + target parallel (cepat)
      const [summaryRes, targetRes] = await Promise.all([
        supabase.rpc('get_agent_bucket_summary', {
          p_since: sinceStr,
          p_until: maxDate,
          p_min_trx_potential: MIN_TRX_POTENTIAL,
        }),
        supabase
          .from('am_targets')
          .select('daily_active_agents, daily_transfer_trx, daily_fee')
          .eq('period_year', now.getFullYear())
          .eq('period_month', now.getMonth() + 1)
          .single(),
      ])

      setSummary(summaryRes.data ?? [])
      setTarget(targetRes.data)
      setLoading(false)

      // Load avg active agents terpisah
      supabase.rpc('get_avg_daily_active_agents', {
        p_since: sinceStr,
        p_until: maxDate,
      }).then(({ data }) => setAvgActivePerDay(Number(data ?? 0)))

      // Load filter options di background (tidak blocking)
      supabase.rpc('get_agent_filter_options', {
        p_since: sinceStr,
        p_until: maxDate,
      }).then(({ data }) => setFilterOptions(data ?? []))

    } catch (err) {
      setLoading(false)
    }
  }

  async function loadAgents() {
    setLoadingList(true)
    try {
      const { data: latest } = await supabase
        .from('am_transactions')
        .select('transaction_date')
        .order('transaction_date', { ascending: false })
        .limit(1)
        .single()

      if (!latest) return

      const maxDate = latest.transaction_date
      const sd = new Date(maxDate)
      sd.setDate(sd.getDate() - 13)
      const sinceStr = sd.toISOString().split('T')[0]

      const [agentsRes, countRes] = await Promise.all([
        supabase.rpc('get_all_agents', {
          p_since:  sinceStr,
          p_until:  maxDate,
          p_bucket: bucket || null,
          p_mitra:  filterMitra || null,
          p_pic:    filterPic || null,
          p_min_trx_potential: MIN_TRX_POTENTIAL,
          p_limit:  PAGE_SIZE,
          p_offset: page * PAGE_SIZE,
        }),
        supabase.rpc('get_all_agents_count', {
          p_since:  sinceStr,
          p_until:  maxDate,
          p_bucket: bucket || null,
          p_mitra:  filterMitra || null,
          p_pic:    filterPic || null,
          p_min_trx_potential: MIN_TRX_POTENTIAL,
        }),
      ])

      setAgents(agentsRes.data ?? [])
      setTotal(countRes.data ?? 0)
    } finally {
      setLoadingList(false)
    }
  }

  async function openDrawer(agent: Agent) {
    setSelectedAgent(agent)
    setAgentDetail([])
    setLoadingDetail(true)
    try {
      const { data: latest } = await supabase
        .from('am_transactions')
        .select('transaction_date')
        .order('transaction_date', { ascending: false })
        .limit(1)
        .single()
      if (!latest) return
      const maxDate = latest.transaction_date
      const sd = new Date(maxDate)
      sd.setDate(sd.getDate() - 13)
      const sinceStr = sd.toISOString().split('T')[0]
      const { data } = await supabase.rpc('get_agent_detail', {
        p_serial: agent.serial_number,
        p_since:  sinceStr,
        p_until:  maxDate,
      })
      setAgentDetail(data ?? [])
    } finally {
      setLoadingDetail(false)
    }
  }

  async function exportCSV() {
    const { data: latest } = await supabase
      .from('am_transactions')
      .select('transaction_date')
      .order('transaction_date', { ascending: false })
      .limit(1)
      .single()

    if (!latest) return

    const maxDate = latest.transaction_date
    const sd = new Date(maxDate)
    sd.setDate(sd.getDate() - 13)
    const sinceStr = sd.toISOString().split('T')[0]

    // Fetch semua untuk export (max 5000)
    const { data } = await supabase.rpc('get_all_agents', {
      p_since:  sinceStr,
      p_until:  maxDate,
      p_bucket: bucket || null,
      p_mitra:  filterMitra || null,
      p_pic:    filterPic || null,
      p_min_trx_potential: MIN_TRX_POTENTIAL,
      p_limit:  5000,
      p_offset: 0,
    })

    if (!data || data.length === 0) return

    const headers = ['Bucket', 'Nama Agen', 'Serial Number', 'Mitra', 'PIC', 'Hari Aktif', 'Total TRX', 'Transfer', 'Cek Saldo', 'Total Fee', 'Terakhir Aktif']
    const rows = data.map((a: Agent) => [
      a.bucket,
      a.merchant_name ?? '',
      a.serial_number,
      a.mitra ?? '',
      a.pic ?? '',
      a.active_days,
      a.total_trx,
      a.transfer_trx,
      a.cek_saldo_trx,
      a.total_fee,
      a.last_active,
    ])

    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `agen_${bucket || 'semua'}_${lastDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Summary data
  const getSummary = (b: string) => summary.find(s => s.bucket === b)
  const totalAgents = summary.reduce((s, r) => s + Number(r.agent_count), 0)
  const growingCount   = Number(getSummary('growing')?.agent_count ?? 0)
  const potentialCount = Number(getSummary('potential')?.agent_count ?? 0)
  const atRiskCount    = Number(getSummary('at_risk')?.agent_count ?? 0)
  const dormantCount   = Number(getSummary('dormant')?.agent_count ?? 0)

  // Latest day active agents (Growing = aktif hari ini sebenarnya perlu query terpisah)
  // Gunakan growing sebagai proxy untuk "konsisten aktif"
  const activeToday = avgActivePerDay

  // Unique mitras dan pics dari filterOptions
  const mitras = [...new Set(filterOptions.map(f => f.mitra))].sort()
  const pics   = [...new Set(filterOptions.filter(f => !filterMitra || f.mitra === filterMitra).map(f => f.pic))].sort()

  const totalPages = Math.ceil(total / PAGE_SIZE)

  function BucketChip({ b }: { b: string }) {
    const cfg = BUCKET_CONFIG[b as keyof typeof BUCKET_CONFIG] ?? BUCKET_CONFIG.dormant
    return (
      <span style={{
        padding: '2px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: '700',
        backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
        whiteSpace: 'nowrap',
      }}>
        {cfg.icon} {cfg.label}
      </span>
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
      <Head><title>Dashboard Agen — AMARIS</title></Head>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}>

        {/* Header */}
        <div style={{ marginBottom: '28px' }}>
          <div style={{ fontSize: '11px', fontWeight: '600', color: '#9ca3af', letterSpacing: '0.1em', marginBottom: '4px' }}>
            ANALITIK AGEN
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#111827', margin: 0, letterSpacing: '-0.02em' }}>
            Dashboard Agen
          </h1>
          <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
            Window 14 hari: {sinceDate} s.d. {lastDate} · {totalAgents.toLocaleString('id')} agen terdaftar
          </p>
        </div>

        {/* Target Progress */}
        {target && (
          <div style={{
            backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px',
            padding: '20px 24px', marginBottom: '20px',
          }}>
            <div style={{ fontSize: '12px', fontWeight: '700', color: '#374151', marginBottom: '16px', letterSpacing: '0.05em' }}>
              TARGET {new Date(lastDate).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }).toUpperCase()}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
              {[
                { label: 'Rata-rata Agen Aktif/Hari', current: activeToday, target: target.daily_active_agents, suffix: 'terminal', color: '#0344D8' },
                { label: 'Trx/Hari (est.)', current: Number(getSummary('growing')?.total_trx ?? 0) / 14, target: target.daily_transfer_trx, suffix: 'trx', color: '#7c3aed' },
                { label: 'Fee/Hari (est.)', current: (Number(getSummary('growing')?.total_fee ?? 0) + Number(getSummary('potential')?.total_fee ?? 0)) / 14, target: target.daily_fee, suffix: '', color: '#059669', isRp: true },
              ].map(t => (
                <div key={t.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '12px', color: '#6b7280' }}>{t.label}</span>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>
                      {t.isRp ? formatFee(Math.round(t.current)) : Math.round(t.current).toLocaleString('id')}
                      {t.target && (
                        <span style={{ color: '#9ca3af', fontWeight: '400' }}>
                          {' '}/ {t.isRp ? formatFee(t.target) : t.target.toLocaleString('id')}
                        </span>
                      )}
                    </span>
                  </div>
                  {t.target && <ProgressBar value={t.current} max={t.target} color={t.color} />}
                </div>
              ))}
            </div>

            {/* Insight otomatis */}
            {potentialCount > 0 && target.daily_active_agents && activeToday < target.daily_active_agents && (
              <div style={{
                marginTop: '16px', padding: '10px 14px',
                backgroundColor: '#fffbeb', borderRadius: '8px', border: '1px solid #fde68a',
                fontSize: '12px', color: '#92400e',
              }}>
                💡 Ada <strong>{potentialCount} agen Potential</strong>. Kalau 50% berhasil naik ke Growing, target agen aktif {
                  Math.round(activeToday + potentialCount * 0.5) >= (target.daily_active_agents ?? 0) ? 'tercapai ✅' : `masih kurang ${((target.daily_active_agents ?? 0) - Math.round(activeToday + potentialCount * 0.5)).toLocaleString('id')} agen`
                }.
              </div>
            )}
          </div>
        )}

        {/* Bucket Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
          {(['growing', 'potential', 'at_risk', 'dormant'] as const).map(b => {
            const cfg = BUCKET_CONFIG[b]
            const data = getSummary(b)
            const count = Number(data?.agent_count ?? 0)
            const isSelected = bucket === b
            return (
              <div
                key={b}
                onClick={() => { setBucket(isSelected ? '' : b); setPage(0) }}
                style={{
                  padding: '16px', borderRadius: '10px', cursor: 'pointer',
                  border: `2px solid ${isSelected ? cfg.color : cfg.border}`,
                  backgroundColor: isSelected ? cfg.bg : '#fff',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ fontSize: '20px', marginBottom: '8px' }}>{cfg.icon}</div>
                <div style={{ fontSize: '22px', fontWeight: '800', color: cfg.color }}>
                  {count.toLocaleString('id')}
                </div>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '2px' }}>
                  {cfg.label}
                </div>
                <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                  {totalAgents > 0 ? Math.round(count / totalAgents * 100) : 0}% dari total
                </div>
                {data && Number(data.total_fee) > 0 && (
                  <div style={{ fontSize: '11px', color: cfg.color, marginTop: '4px', fontWeight: '600' }}>
                    {formatFee(Number(data.total_fee))} fee/14 hari
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Filters + Export */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            value={filterMitra}
            onChange={e => { setFilterMitra(e.target.value); setFilterPic(''); setPage(0) }}
            style={{
              padding: '7px 12px', borderRadius: '8px', border: '1px solid #e5e7eb',
              fontSize: '12px', color: '#374151', backgroundColor: '#fff', cursor: 'pointer',
            }}
          >
            <option value="">Semua Mitra</option>
            {mitras.map(m => <option key={m} value={m}>{m}</option>)}
          </select>

          <select
            value={filterPic}
            onChange={e => { setFilterPic(e.target.value); setPage(0) }}
            style={{
              padding: '7px 12px', borderRadius: '8px', border: '1px solid #e5e7eb',
              fontSize: '12px', color: '#374151', backgroundColor: '#fff', cursor: 'pointer',
              maxWidth: '180px',
            }}
          >
            <option value="">Semua PIC</option>
            {pics.map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          {(bucket || filterMitra || filterPic) && (
            <button
              onClick={() => { setBucket(''); setFilterMitra(''); setFilterPic(''); setPage(0) }}
              style={{
                padding: '7px 12px', borderRadius: '8px', border: '1px solid #e5e7eb',
                backgroundColor: '#fff', color: '#6b7280', fontSize: '12px', cursor: 'pointer',
              }}
            >
              ✕ Reset Filter
            </button>
          )}

          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: '#6b7280' }}>
              {loadingList ? 'Memuat...' : `${total.toLocaleString('id')} agen`}
            </span>
            <button
              onClick={exportCSV}
              style={{
                padding: '7px 14px', borderRadius: '8px',
                border: '1px solid #0344D8', backgroundColor: '#fff',
                color: '#0344D8', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
              }}
            >
              ↓ Export CSV
            </button>
          </div>
        </div>

        {/* Table */}
        {!loadingList && agents.length > 0 && (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden', marginBottom: '16px' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '120px 1fr 150px 150px 60px 70px 80px 80px 90px',
              padding: '10px 16px',
              backgroundColor: '#f9fafb',
              borderBottom: '1px solid #e5e7eb',
              fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.05em',
            }}>
              <div>BUCKET</div>
              <div>AGEN</div>
              <div>MITRA</div>
              <div>PIC</div>
              <div style={{ textAlign: 'center' }}>HARI</div>
              <div style={{ textAlign: 'right' }}>TRX</div>
              <div style={{ textAlign: 'right' }}>TRANSFER</div>
              <div style={{ textAlign: 'right' }}>CEK SALDO</div>
              <div style={{ textAlign: 'right' }}>FEE</div>
            </div>

            {agents.map((agent, i) => (
              <div key={agent.serial_number} onClick={() => openDrawer(agent)} style={{
                display: 'grid',
                gridTemplateColumns: '120px 1fr 150px 150px 60px 70px 80px 80px 90px',
                padding: '11px 16px',
                borderBottom: i < agents.length - 1 ? '1px solid #f3f4f6' : 'none',
                alignItems: 'center',
                backgroundColor: '#fff',
                cursor: 'pointer',
              }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = '#fff'}
              >
                <div><BucketChip b={agent.bucket} /></div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#111827' }}>
                    {agent.merchant_name ?? agent.serial_number}
                  </div>
                  <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '1px' }}>
                    {agent.serial_number}
                  </div>
                </div>
                <div style={{ fontSize: '12px', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {agent.mitra ?? '—'}
                </div>
                <div style={{ fontSize: '12px', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {agent.pic ?? '—'}
                </div>
                <div style={{
                  fontSize: '14px', fontWeight: '700', textAlign: 'center',
                  color: agent.active_days >= 8 ? '#166534' : agent.active_days >= 5 ? '#ca8a04' : '#dc2626',
                }}>
                  {agent.active_days}
                </div>
                <div style={{ fontSize: '12px', color: '#374151', textAlign: 'right' }}>
                  {Number(agent.total_trx).toLocaleString('id')}
                </div>
                <div style={{ fontSize: '12px', color: '#374151', textAlign: 'right' }}>
                  {Number(agent.transfer_trx).toLocaleString('id')}
                </div>
                <div style={{ fontSize: '12px', color: '#374151', textAlign: 'right' }}>
                  {Number(agent.cek_saldo_trx).toLocaleString('id')}
                </div>
                <div style={{ fontSize: '12px', color: '#374151', textAlign: 'right' }}>
                  {formatFee(Number(agent.total_fee))}
                </div>
              </div>
            ))}
          </div>
        )}

        {!loadingList && agents.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '60px',
            backgroundColor: '#f9fafb', borderRadius: '10px',
            border: '1px dashed #e5e7eb', color: '#9ca3af', fontSize: '13px',
          }}>
            Tidak ada agen ditemukan
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', alignItems: 'center' }}>
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{
              padding: '7px 14px', borderRadius: '8px', border: '1px solid #e5e7eb',
              backgroundColor: '#fff', color: page === 0 ? '#d1d5db' : '#374151',
              fontSize: '13px', cursor: page === 0 ? 'not-allowed' : 'pointer',
            }}>← Prev</button>
            <span style={{ fontSize: '13px', color: '#6b7280' }}>{page + 1} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} style={{
              padding: '7px 14px', borderRadius: '8px', border: '1px solid #e5e7eb',
              backgroundColor: '#fff', color: page >= totalPages - 1 ? '#d1d5db' : '#374151',
              fontSize: '13px', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer',
            }}>Next →</button>
          </div>
        )}
      </div>
    </Layout>

      {/* Agent Detail Drawer */}
      {selectedAgent && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          display: 'flex', justifyContent: 'flex-end',
        }}>
          {/* Backdrop */}
          <div
            onClick={() => setSelectedAgent(null)}
            style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)' }}
          />

          {/* Drawer */}
          <div style={{
            position: 'relative', width: '480px', height: '100%',
            backgroundColor: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
            display: 'flex', flexDirection: 'column', overflowY: 'auto',
          }}>
            {/* Header */}
            <div style={{
              padding: '20px 24px', borderBottom: '1px solid #f3f4f6',
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              position: 'sticky', top: 0, backgroundColor: '#fff', zIndex: 1,
            }}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: '800', color: '#111827', marginBottom: '4px' }}>
                  {selectedAgent.merchant_name ?? selectedAgent.serial_number}
                </div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '6px' }}>
                  {selectedAgent.serial_number}
                </div>
                <BucketChip b={selectedAgent.bucket} />
              </div>
              <button
                onClick={() => setSelectedAgent(null)}
                style={{
                  padding: '6px 10px', borderRadius: '8px',
                  border: '1px solid #e5e7eb', backgroundColor: '#fff',
                  color: '#6b7280', fontSize: '18px', cursor: 'pointer', lineHeight: 1,
                }}
              >✕</button>
            </div>

            {loadingDetail ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>
                Memuat data...
              </div>
            ) : agentDetail.length > 0 ? (
              <div style={{ padding: '20px 24px' }}>

                {/* Info agen */}
                {(() => {
                  const latest = agentDetail[agentDetail.length - 1]
                  return (
                    <div style={{ marginBottom: '24px' }}>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>
                        INFO AGEN
                      </div>
                      {[
                        { label: 'Mitra', value: latest.mitra },
                        { label: 'PIC', value: latest.pic },
                        { label: 'Alamat', value: latest.alamat_struk },
                        { label: 'Brand EDC', value: latest.brand },
                        { label: 'Tipe Mesin', value: latest.tipe_mesin },
                        { label: 'Aplikasi', value: latest.source_app },
                        { label: 'Terminal', value: latest.terminal_data_source },
                      ].filter(r => r.value).map(r => (
                        <div key={r.label} style={{
                          display: 'flex', gap: '12px', padding: '7px 0',
                          borderBottom: '1px solid #f9fafb',
                        }}>
                          <span style={{ fontSize: '12px', color: '#9ca3af', minWidth: '80px', flexShrink: 0 }}>{r.label}</span>
                          <span style={{ fontSize: '12px', color: '#111827', fontWeight: '500' }}>{r.value}</span>
                        </div>
                      ))}
                    </div>
                  )
                })()}

                {/* Summary 14 hari */}
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>
                    RINGKASAN 14 HARI
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                    {[
                      { label: 'Total TRX', value: agentDetail.reduce((s, d) => s + Number(d.total_trx), 0).toLocaleString('id') },
                      { label: 'Transfer', value: agentDetail.reduce((s, d) => s + Number(d.transfer_trx), 0).toLocaleString('id') },
                      { label: 'Cek Saldo', value: agentDetail.reduce((s, d) => s + Number(d.cek_saldo_trx), 0).toLocaleString('id') },
                      { label: 'Total Fee', value: formatFee(agentDetail.reduce((s, d) => s + Number(d.total_fee), 0)) },
                      { label: 'Total Amount', value: formatFee(agentDetail.reduce((s, d) => s + Number(d.total_amount), 0)) },
                      { label: 'Hari Aktif', value: `${agentDetail.length} hari` },
                    ].map(s => (
                      <div key={s.label} style={{
                        padding: '10px 12px', backgroundColor: '#f9fafb',
                        borderRadius: '8px', textAlign: 'center',
                      }}>
                        <div style={{ fontSize: '14px', fontWeight: '700', color: '#111827' }}>{s.value}</div>
                        <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* DIP vs SWIPE */}
                {(() => {
                  const totalDip   = agentDetail.reduce((s, d) => s + Number(d.dip_count), 0)
                  const totalSwipe = agentDetail.reduce((s, d) => s + Number(d.swipe_count), 0)
                  const total      = totalDip + totalSwipe
                  if (total === 0) return null
                  return (
                    <div style={{ marginBottom: '24px' }}>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>
                        TIPE PENGGUNAAN KARTU
                      </div>
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                        <div style={{
                          flex: totalDip / total, padding: '8px', borderRadius: '6px',
                          backgroundColor: '#eff6ff', textAlign: 'center',
                        }}>
                          <div style={{ fontSize: '14px', fontWeight: '700', color: '#1d4ed8' }}>{totalDip.toLocaleString('id')}</div>
                          <div style={{ fontSize: '10px', color: '#6b7280' }}>DIP (Chip)</div>
                        </div>
                        <div style={{
                          flex: totalSwipe / total, padding: '8px', borderRadius: '6px',
                          backgroundColor: '#fef9c3', textAlign: 'center',
                        }}>
                          <div style={{ fontSize: '14px', fontWeight: '700', color: '#ca8a04' }}>{totalSwipe.toLocaleString('id')}</div>
                          <div style={{ fontSize: '10px', color: '#6b7280' }}>SWIPE (Bansos)</div>
                        </div>
                      </div>
                    </div>
                  )
                })()}

                {/* Grafik TRX per hari */}
                <div>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '12px' }}>
                    TRANSAKSI PER HARI
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '80px' }}>
                    {(() => {
                      const maxTrx = Math.max(...agentDetail.map(d => Number(d.total_trx)), 1)
                      // Fill semua 14 hari termasuk yang tidak aktif
                      const allDays: { date: string, trx: number }[] = []
                      const sd = new Date(sinceDate)
                      for (let i = 0; i < 14; i++) {
                        const d = new Date(sd)
                        d.setDate(sd.getDate() + i)
                        const dateStr = d.toISOString().split('T')[0]
                        const found = agentDetail.find(a => a.transaction_date === dateStr)
                        allDays.push({ date: dateStr, trx: found ? Number(found.total_trx) : 0 })
                      }
                      return allDays.map(day => (
                        <div key={day.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                          <div style={{
                            width: '100%',
                            height: `${Math.max(4, (day.trx / maxTrx) * 64)}px`,
                            backgroundColor: day.trx > 0 ? '#0344D8' : '#f3f4f6',
                            borderRadius: '3px 3px 0 0',
                            transition: 'height 0.3s',
                          }} title={`${day.date}: ${day.trx} trx`} />
                          <div style={{ fontSize: '8px', color: '#d1d5db', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                            {new Date(day.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                          </div>
                        </div>
                      ))
                    })()}
                  </div>
                </div>

              </div>
            ) : (
              <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>
                Tidak ada data
              </div>
            )}
          </div>
        </div>
      )}
  )
}
