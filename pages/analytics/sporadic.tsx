import { useEffect, useState } from 'react'
import Head from 'next/head'
import Layout from '../../components/Layout'
import { createBrowserClient } from '@supabase/ssr'

interface SporadicAgent {
  serial_number:               string
  merchant_name:               string | null
  mitra:                       string | null
  pic:                         string | null
  active_days:                 number
  total_trx:                   number
  transfer_trx:                number
  cek_saldo_trx:               number
  total_fee:                   number
  avg_transfer_per_active_day: number
  bucket:                      'potential' | 'at_risk'
  last_active:                 string
}

const PAGE_SIZE = 50

export default function SporadicPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [agents, setAgents] = useState<SporadicAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [filter, setFilter] = useState<'all' | 'potential' | 'at_risk'>('all')
  const [filterMitra, setFilterMitra] = useState('')
  const [mitras, setMitras] = useState<string[]>([])
  const [lastDate, setLastDate] = useState('')
  const [sinceDate, setSinceDate] = useState('')

  useEffect(() => { loadMitras() }, [])
  useEffect(() => { loadAgents() }, [page, filter, filterMitra])

  async function loadMitras() {
    // Ambil tanggal dulu
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

    const { data } = await supabase.rpc('get_sporadic_mitras', {
      p_since: sinceStr,
      p_until: maxDate,
    })
    setMitras((data ?? []).map((r: { mitra: string }) => r.mitra))
  }

  async function loadAgents() {
    setLoading(true)
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
        supabase.rpc('get_sporadic_agents', {
          p_since:  sinceStr,
          p_until:  maxDate,
          p_bucket: filter === 'all' ? null : filter,
          p_mitra:  filterMitra || null,
          p_limit:  PAGE_SIZE,
          p_offset: page * PAGE_SIZE,
        }),
        supabase.rpc('get_sporadic_agents_count', {
          p_since:  sinceStr,
          p_until:  maxDate,
          p_bucket: filter === 'all' ? null : filter,
          p_mitra:  filterMitra || null,
        }),
      ])

      setAgents(agentsRes.data ?? [])
      setTotal(countRes.data ?? 0)
    } finally {
      setLoading(false)
    }
  }

  function BucketBadge({ bucket }: { bucket: string }) {
    const isPotential = bucket === 'potential'
    return (
      <span style={{
        padding: '2px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: '700',
        backgroundColor: isPotential ? '#fef9c3' : '#fee2e2',
        color: isPotential ? '#ca8a04' : '#dc2626',
      }}>
        {isPotential ? '⚡ Potential' : '⚠️ At Risk'}
      </span>
    )
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <Layout>
      <Head><title>Agen Sporadic — AMARIS</title></Head>

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 24px' }}>

        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '11px', fontWeight: '600', color: '#9ca3af', letterSpacing: '0.1em', marginBottom: '4px' }}>
            ANALITIK AGEN
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#111827', margin: 0, letterSpacing: '-0.02em' }}>
            Agen Sporadic
          </h1>
          <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
            Aktif 1–7 hari dari 14 hari terakhir
            {lastDate && ` (${sinceDate} s.d. ${lastDate})`}
          </p>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
            {(['all', 'potential', 'at_risk'] as const).map(f => (
              <button key={f} onClick={() => { setFilter(f); setPage(0) }} style={{
                padding: '7px 14px', border: 'none', fontSize: '12px', fontWeight: '600',
                backgroundColor: filter === f ? '#0344D8' : '#fff',
                color: filter === f ? '#fff' : '#6b7280',
                cursor: 'pointer',
              }}>
                {f === 'all' ? 'Semua' : f === 'potential' ? '⚡ Potential' : '⚠️ At Risk'}
              </button>
            ))}
          </div>

          <select
            value={filterMitra}
            onChange={e => { setFilterMitra(e.target.value); setPage(0) }}
            style={{
              padding: '7px 12px', borderRadius: '8px', border: '1px solid #e5e7eb',
              fontSize: '12px', color: '#374151', backgroundColor: '#fff', cursor: 'pointer',
              maxWidth: '200px',
            }}
          >
            <option value="">Semua Mitra</option>
            {mitras.map(m => <option key={m} value={m}>{m}</option>)}
          </select>

          <div style={{ marginLeft: 'auto', fontSize: '13px', color: '#6b7280' }}>
            {loading ? 'Memuat...' : `${total.toLocaleString('id')} agen`}
          </div>
        </div>

        {/* Table */}
        {!loading && agents.length > 0 && (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden', marginBottom: '16px' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '130px 1fr 160px 160px 60px 70px 80px 90px',
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
              <div style={{ textAlign: 'right' }}>FEE</div>
            </div>

            {agents.map((agent, i) => (
              <div key={agent.serial_number} style={{
                display: 'grid',
                gridTemplateColumns: '130px 1fr 160px 160px 60px 70px 80px 90px',
                padding: '11px 16px',
                borderBottom: i < agents.length - 1 ? '1px solid #f3f4f6' : 'none',
                alignItems: 'center',
                backgroundColor: '#fff',
              }}>
                <div><BucketBadge bucket={agent.bucket} /></div>
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
                  color: agent.active_days >= 5 ? '#166534' : agent.active_days >= 3 ? '#ca8a04' : '#dc2626',
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
                  {Number(agent.total_fee) >= 1000000
                    ? `Rp ${(Number(agent.total_fee) / 1000000).toFixed(1)}jt`
                    : `Rp ${(Number(agent.total_fee) / 1000).toFixed(0)}rb`}
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && agents.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '60px',
            backgroundColor: '#f9fafb', borderRadius: '10px',
            border: '1px dashed #e5e7eb', color: '#9ca3af', fontSize: '13px',
          }}>
            Tidak ada agen sporadic ditemukan
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              style={{
                padding: '7px 14px', borderRadius: '8px',
                border: '1px solid #e5e7eb', backgroundColor: '#fff',
                color: page === 0 ? '#d1d5db' : '#374151',
                fontSize: '13px', cursor: page === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              ← Prev
            </button>
            <span style={{ fontSize: '13px', color: '#6b7280' }}>
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              style={{
                padding: '7px 14px', borderRadius: '8px',
                border: '1px solid #e5e7eb', backgroundColor: '#fff',
                color: page >= totalPages - 1 ? '#d1d5db' : '#374151',
                fontSize: '13px', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer',
              }}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </Layout>
  )
}
