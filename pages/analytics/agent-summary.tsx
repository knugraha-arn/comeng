import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Layout from '../../components/Layout'
import { createBrowserClient } from '@supabase/ssr'

interface AgentSummaryRow {
  serial_number: string
  merchant_name: string | null
  mitra: string | null
  pic: string | null
  bucket: string
  trend: string
  liquidity_status: string
  w2_status: string
  kelompok: string
  prioritas: string
  active_days_14: number
  total_trx_14: number
  trx_transfer_14: number
  window_start: string
  window_end: string
}

interface AgentDetail {
  serial_number: string
  merchant_name: string | null
  mitra: string | null
  pic: string | null
  bucket: string
  trend: string
  total_trx_14: number
  total_fee_14: number
  total_amount_14: number
  active_days_14: number
  total_trx_mtd: number
  total_fee_mtd: number
  total_amount_mtd: number
}

interface SummaryCount {
  total_count: number
  sehat_count: number
  baru_aktif_count: number
  kurang_sehat_count: number
}

const PAGE_SIZE = 25

const KELOMPOK_CONFIG = {
  sehat:        { label: '✅ Sehat',        bg: '#f0fdf4', color: '#166534', border: '#bbf7d0' },
  baru_aktif:   { label: '🔵 Baru Aktif',   bg: '#eff6ff', color: '#1e40af', border: '#bfdbfe' },
  kurang_sehat: { label: '⚠️ Kurang Sehat', bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
}

const BUCKET_CONFIG: Record<string, { label: string, color: string, bg: string }> = {
  productive: { label: 'Productive', color: '#166534', bg: '#dcfce7' },
  moderate:   { label: 'Moderate',   color: '#92400e', bg: '#fef9c3' },
  sporadic:   { label: 'Sporadic',   color: '#dc2626', bg: '#fee2e2' },
}

const TREND_CONFIG: Record<string, { label: string, color: string }> = {
  growing:    { label: '↑ Growing',    color: '#16a34a' },
  consistent: { label: '→ Consistent', color: '#6b7280' },
  declining:  { label: '↓ Declining',  color: '#dc2626' },
}

const LIQ_CONFIG: Record<string, { label: string, color: string }> = {
  kuat:    { label: 'Kuat',    color: '#166534' },
  menurun: { label: 'Menurun', color: '#92400e' },
  lemah:   { label: 'Lemah',   color: '#dc2626' },
  no_data: { label: '—',       color: '#9ca3af' },
}

const W2_CONFIG: Record<string, { label: string, color: string, bg: string }> = {
  retained: { label: 'Retained', color: '#374151', bg: '#f3f4f6' },
  baru:     { label: 'Baru',     color: '#1e40af', bg: '#eff6ff' },
  hilang:   { label: 'Hilang',   color: '#dc2626', bg: '#fee2e2' },
}

const PRIO_CONFIG: Record<string, { label: string, color: string }> = {
  tinggi:   { label: '🔴 Tinggi',   color: '#dc2626' },
  sedang:   { label: '🟡 Sedang',   color: '#92400e' },
  dampingi: { label: '🔵 Dampingi', color: '#1e40af' },
  '-':      { label: '—',           color: '#9ca3af' },
}

function fmt(n: number) {
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)}jt`
  if (n >= 1_000)     return `Rp ${(n / 1_000).toFixed(0)}rb`
  return `Rp ${n}`
}

export default function AgentSummaryPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [agents, setAgents]           = useState<AgentSummaryRow[]>([])
  const [counts, setCounts]           = useState<SummaryCount | null>(null)
  const [loading, setLoading]         = useState(true)
  const [mitraList, setMitraList]     = useState<string[]>([])
  const [filterMitra, setFilterMitra] = useState('')
  const [filterKel, setFilterKel]     = useState('')
  const [page, setPage]               = useState(0)
  const [totalCount, setTotalCount]   = useState(0)
  const totalPages                    = Math.ceil(totalCount / PAGE_SIZE)

  // Drawer
  const [drawer, setDrawer]           = useState<AgentDetail | null>(null)
  const [loadingDrawer, setLoadingDrawer] = useState(false)

  // Window dates dari data
  const windowStart = agents[0]?.window_start ?? ''
  const windowEnd   = agents[0]?.window_end   ?? ''

  function fmtDate(d: string) {
    if (!d) return ''
    const [y, m, day] = d.split('-')
    const MONTHS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']
    return `${parseInt(day)} ${MONTHS[parseInt(m) - 1]} ${y}`
  }

  useEffect(() => {
    loadMitraList()
  }, [])

  useEffect(() => {
    setPage(0)
  }, [filterMitra, filterKel])

  useEffect(() => {
    loadData()
  }, [filterMitra, filterKel, page])

  async function loadMitraList() {
    const { data } = await supabase.rpc('get_mitra_list')
    if (data) setMitraList(data.map((m: { mitra: string }) => m.mitra).sort())
  }

  async function loadData() {
    setLoading(true)
    try {
      const [agentsRes, countsRes] = await Promise.all([
        supabase.rpc('get_agent_reach_out', {
          p_mitra: filterMitra,
          p_kelompok: filterKel,
          p_limit: PAGE_SIZE,
          p_offset: page * PAGE_SIZE,
        }),
        supabase.rpc('get_agent_reach_out_count', {
          p_mitra: filterMitra,
          p_kelompok: filterKel,
        }),
      ])
      setAgents(agentsRes.data ?? [])
      const c = countsRes.data?.[0]
      if (c) {
        setCounts(c)
        setTotalCount(Number(c.total_count))
      }
    } finally {
      setLoading(false)
    }
  }

  async function openDrawer(sn: string) {
    setDrawer(null)
    setLoadingDrawer(true)
    const { data } = await supabase.rpc('get_agent_profile', { p_serial: sn })
    setDrawer(data?.[0] ?? null)
    setLoadingDrawer(false)
  }

  async function exportCSV() {
    // Export SEMUA data sesuai filter yang aktif, limit 9999
    const { data } = await supabase.rpc('get_agent_reach_out', {
      p_mitra: filterMitra,
      p_kelompok: filterKel,
      p_limit: 9999,
      p_offset: 0,
    })
    if (!data || data.length === 0) return

    // Sort untuk CSV: Mitra A-Z → Kelompok (Sehat → Baru Aktif → Kurang Sehat) → TRX Transfer DESC
    const KEL_ORDER: Record<string, number> = { sehat: 0, baru_aktif: 1, kurang_sehat: 2 }
    const sorted = [...data].sort((a: AgentSummaryRow, b: AgentSummaryRow) => {
      const mitraComp = (a.mitra ?? '').localeCompare(b.mitra ?? '', 'id')
      if (mitraComp !== 0) return mitraComp
      const kelComp = (KEL_ORDER[a.kelompok] ?? 9) - (KEL_ORDER[b.kelompok] ?? 9)
      if (kelComp !== 0) return kelComp
      return b.trx_transfer_14 - a.trx_transfer_14
    })

    const KELOMPOK_LABEL: Record<string, string> = {
      sehat: 'Sehat', baru_aktif: 'Baru Aktif', kurang_sehat: 'Kurang Sehat',
    }

    const header = [
      `# Agent Summary — Data 14H dari ${fmtDate(data[0].window_start)} sampai ${fmtDate(data[0].window_end)}`,
      `# Diekspor: ${new Date().toLocaleString('id-ID')}`,
      `# Filter Mitra: ${filterMitra || 'Semua'} | Filter Kelompok: ${filterKel ? KELOMPOK_LABEL[filterKel] : 'Semua'}`,
      `# Total: ${sorted.length} agen`,
      '',
      'No,Nama Agen,Serial Number,Mitra,PIC,Status,TRX Transfer 14H',
    ]

    const rows = sorted.map((a: AgentSummaryRow, i: number) => [
      i + 1,
      `"${(a.merchant_name ?? '').replace(/"/g, '""')}"`,
      a.serial_number,
      `"${(a.mitra ?? '').replace(/"/g, '""')}"`,
      `"${(a.pic ?? '').replace(/"/g, '""')}"`,
      KELOMPOK_LABEL[a.kelompok] ?? a.kelompok,
      a.trx_transfer_14,
    ].join(','))

    const csv  = [...header, ...rows].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }) // BOM untuk Excel
    const url  = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href  = url
    const kelLabel = filterKel ? `-${KELOMPOK_LABEL[filterKel].toLowerCase().replace(' ', '-')}` : ''
    const mitraLabel = filterMitra ? `-${filterMitra.split(' ')[0].toLowerCase()}` : ''
    link.download = `agent-summary${mitraLabel}${kelLabel}-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Layout>
      <Head><title>Agent Summary — AMARIS</title></Head>

      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '11px', fontWeight: '600', color: '#9ca3af', letterSpacing: '0.1em', marginBottom: '4px' }}>ANALITIK AGEN</div>
        <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#111827', margin: 0, letterSpacing: '-0.02em' }}>
          📋 Agent Summary
        </h1>
        {windowStart && windowEnd && (
          <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
            Data transaksi <strong>14 hari</strong> dari {fmtDate(windowStart)} sampai {fmtDate(windowEnd)}
            {counts && <span style={{ marginLeft: '8px', color: '#9ca3af' }}>· {counts.total_count.toLocaleString('id')} agen</span>}
          </p>
        )}
      </div>

      {/* 3 Card Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '24px' }}>
        {[
          { key: 'sehat',        label: '✅ Sehat',        count: counts?.sehat_count,        bg: '#f0fdf4', color: '#166534', border: '#bbf7d0', desc: 'Productive, stabil, float aman' },
          { key: 'baru_aktif',   label: '🔵 Baru Aktif',   count: counts?.baru_aktif_count,   bg: '#eff6ff', color: '#1e40af', border: '#bfdbfe', desc: 'Aktif di W2, tidak ada di W1' },
          { key: 'kurang_sehat', label: '⚠️ Kurang Sehat', count: counts?.kurang_sehat_count, bg: '#fef2f2', color: '#dc2626', border: '#fecaca', desc: 'Hilang, Sporadic, Declining, atau Lemah' },
        ].map(c => (
          <div key={c.key}
            onClick={() => setFilterKel(filterKel === c.key ? '' : c.key)}
            style={{ padding: '20px', backgroundColor: filterKel === c.key ? c.bg : '#fff', border: `1px solid ${filterKel === c.key ? c.border : '#e5e7eb'}`, borderRadius: '12px', cursor: 'pointer', transition: 'all 0.15s' }}>
            <div style={{ fontSize: '28px', fontWeight: '800', color: filterKel === c.key ? c.color : '#111827' }}>
              {c.count?.toLocaleString('id') ?? '—'}
            </div>
            <div style={{ fontSize: '13px', fontWeight: '600', color: filterKel === c.key ? c.color : '#374151', marginTop: '2px' }}>{c.label}</div>
            <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>{c.desc}</div>
          </div>
        ))}
      </div>

      {/* Filter + Export */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
        <select value={filterMitra} onChange={e => setFilterMitra(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '13px', minWidth: '200px' }}>
          <option value="">Semua Mitra</option>
          {mitraList.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={filterKel} onChange={e => setFilterKel(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '13px' }}>
          <option value="">Semua Kelompok</option>
          <option value="sehat">✅ Sehat</option>
          <option value="baru_aktif">🔵 Baru Aktif</option>
          <option value="kurang_sehat">⚠️ Kurang Sehat</option>
        </select>
        {(filterMitra || filterKel) && (
          <button onClick={() => { setFilterMitra(''); setFilterKel('') }}
            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', fontSize: '12px', color: '#6b7280', cursor: 'pointer' }}>
            Reset
          </button>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: '12px', color: '#9ca3af' }}>{totalCount.toLocaleString('id')} agen</span>
        <button onClick={exportCSV}
          style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', fontSize: '13px', color: '#374151', cursor: 'pointer', fontWeight: '500' }}>
          📥 Export CSV
        </button>
      </div>

      {/* Tabel */}
      <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden', marginBottom: '16px' }}>
        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 130px 130px 80px 80px 80px 80px', padding: '10px 16px', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.05em' }}>
          <div>KELOMPOK</div>
          <div>AGEN</div>
          <div>MITRA</div>
          <div>PIC</div>
          <div style={{ textAlign: 'center' }}>BUCKET</div>
          <div style={{ textAlign: 'center' }}>TREND</div>
          <div style={{ textAlign: 'center' }}>LIQUIDITAS</div>
          <div style={{ textAlign: 'center' }}>W2</div>
        </div>

        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>Memuat data...</div>
        ) : agents.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>Tidak ada data</div>
        ) : agents.map((a, i) => {
          const kel   = KELOMPOK_CONFIG[a.kelompok as keyof typeof KELOMPOK_CONFIG]  ?? KELOMPOK_CONFIG.kurang_sehat
          const bkt   = BUCKET_CONFIG[a.bucket]      ?? BUCKET_CONFIG.sporadic
          const trd   = TREND_CONFIG[a.trend]        ?? TREND_CONFIG.consistent
          const liq   = LIQ_CONFIG[a.liquidity_status] ?? LIQ_CONFIG.no_data
          const w2    = W2_CONFIG[a.w2_status]       ?? W2_CONFIG.retained
          const prio  = PRIO_CONFIG[a.prioritas]     ?? PRIO_CONFIG['-']
          return (
            <div key={a.serial_number} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 130px 130px 80px 80px 80px 80px', padding: '11px 16px', borderBottom: i < agents.length - 1 ? '1px solid #f3f4f6' : 'none', alignItems: 'center', backgroundColor: '#fff' }}>
              {/* Kelompok */}
              <div>
                <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '99px', fontWeight: '700', backgroundColor: kel.bg, color: kel.color, border: `1px solid ${kel.border}`, whiteSpace: 'nowrap' }}>
                  {a.kelompok === 'sehat' ? '✅' : a.kelompok === 'baru_aktif' ? '🔵' : '⚠️'}
                </span>
                {a.prioritas !== '-' && (
                  <div style={{ fontSize: '10px', color: prio.color, marginTop: '2px' }}>{prio.label}</div>
                )}
              </div>
              {/* Agen */}
              <div>
                <div
                  onClick={() => openDrawer(a.serial_number)}
                  style={{ fontSize: '13px', fontWeight: '600', color: '#0344D8', cursor: 'pointer', textDecoration: 'underline' }}>
                  {a.merchant_name ?? '—'}
                </div>
                <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '1px' }}>
                  {a.serial_number} · {a.active_days_14} hari aktif · {a.total_trx_14.toLocaleString('id')} TRX
                </div>
              </div>
              {/* Mitra */}
              <div style={{ fontSize: '11px', color: '#374151' }}>{a.mitra ?? '—'}</div>
              {/* PIC */}
              <div style={{ fontSize: '11px', color: '#374151' }}>{a.pic ?? '—'}</div>
              {/* Bucket */}
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '99px', fontWeight: '600', backgroundColor: bkt.bg, color: bkt.color }}>
                  {bkt.label}
                </span>
              </div>
              {/* Trend */}
              <div style={{ textAlign: 'center', fontSize: '11px', fontWeight: '600', color: trd.color }}>{trd.label}</div>
              {/* Liquidity */}
              <div style={{ textAlign: 'center', fontSize: '11px', fontWeight: '600', color: liq.color }}>{liq.label}</div>
              {/* W2 */}
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '99px', fontWeight: '600', backgroundColor: w2.bg, color: w2.color }}>
                  {w2.label}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '32px' }}>
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
            style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: page === 0 ? '#f9fafb' : '#fff', color: page === 0 ? '#9ca3af' : '#374151', fontSize: '13px', cursor: page === 0 ? 'not-allowed' : 'pointer' }}>
            ← Prev
          </button>
          <span style={{ padding: '6px 14px', fontSize: '13px', color: '#6b7280' }}>
            {page + 1} / {totalPages}
          </span>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
            style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: page >= totalPages - 1 ? '#f9fafb' : '#fff', color: page >= totalPages - 1 ? '#9ca3af' : '#374151', fontSize: '13px', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer' }}>
            Next →
          </button>
        </div>
      )}

      {/* Drawer Detail Agen */}
      {(drawer || loadingDrawer) && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}>
          <div onClick={() => { setDrawer(null); setLoadingDrawer(false) }}
            style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)' }} />
          <div style={{ position: 'relative', width: '400px', height: '100%', backgroundColor: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'sticky', top: 0, backgroundColor: '#fff', zIndex: 1 }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: '700', color: '#111827' }}>
                  {loadingDrawer ? 'Memuat...' : (drawer?.merchant_name ?? '—')}
                </div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>{drawer?.serial_number}</div>
              </div>
              <button onClick={() => { setDrawer(null); setLoadingDrawer(false) }}
                style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#6b7280', fontSize: '18px', cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>

            {loadingDrawer && <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>Memuat data agen...</div>}

            {drawer && !loadingDrawer && (() => {
              const bkt = BUCKET_CONFIG[drawer.bucket] ?? BUCKET_CONFIG.sporadic
              const trd = TREND_CONFIG[drawer.trend]   ?? TREND_CONFIG.consistent
              return (
                <div style={{ padding: '20px 24px' }}>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
                    <span style={{ padding: '3px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: '700', backgroundColor: bkt.bg, color: bkt.color }}>{bkt.label}</span>
                    <span style={{ padding: '3px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: '600', backgroundColor: '#f3f4f6', color: trd.color }}>{trd.label}</span>
                  </div>
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '10px' }}>INFO AGEN</div>
                    {[{ label: 'Mitra', value: drawer.mitra }, { label: 'PIC', value: drawer.pic }].filter(r => r.value).map(r => (
                      <div key={r.label} style={{ display: 'flex', gap: '12px', padding: '7px 0', borderBottom: '1px solid #f9fafb' }}>
                        <span style={{ fontSize: '12px', color: '#9ca3af', minWidth: '70px' }}>{r.label}</span>
                        <span style={{ fontSize: '12px', color: '#111827', fontWeight: '500' }}>{r.value}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '10px' }}>PERFORMA 14H</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      {[
                        { label: 'Hari Aktif',    value: `${drawer.active_days_14} hari` },
                        { label: 'Total TRX',     value: drawer.total_trx_14.toLocaleString('id') },
                        { label: 'Total Fee',     value: fmt(drawer.total_fee_14) },
                        { label: 'Total Amount',  value: fmt(drawer.total_amount_14) },
                      ].map(s => (
                        <div key={s.label} style={{ padding: '10px 12px', backgroundColor: '#f9fafb', borderRadius: '8px', textAlign: 'center' }}>
                          <div style={{ fontSize: '14px', fontWeight: '700', color: '#111827' }}>{s.value}</div>
                          <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>{s.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ marginBottom: '24px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '10px' }}>PERFORMA MTD</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                      {[
                        { label: 'Total TRX',    value: drawer.total_trx_mtd.toLocaleString('id') },
                        { label: 'Total Fee',    value: fmt(drawer.total_fee_mtd) },
                        { label: 'Total Amount', value: fmt(drawer.total_amount_mtd) },
                      ].map(s => (
                        <div key={s.label} style={{ padding: '10px 12px', backgroundColor: '#f9fafb', borderRadius: '8px', textAlign: 'center' }}>
                          <div style={{ fontSize: '13px', fontWeight: '700', color: '#111827' }}>{s.value}</div>
                          <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>{s.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <button onClick={() => router.push(`/analytics/agent-profile?sn=${drawer.serial_number}`)}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#0344D8', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                    Lihat Profil Lengkap →
                  </button>
                </div>
              )
            })()}
          </div>
        </div>
      )}
    </Layout>
  )
}
