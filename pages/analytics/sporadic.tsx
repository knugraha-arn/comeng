import { useEffect, useState } from 'react'
import Head from 'next/head'
import Layout from '../../components/Layout'
import { createBrowserClient } from '@supabase/ssr'

interface SporadicAgent {
  serial_number: string
  merchant_name: string | null
  mitra: string | null
  pic: string | null
  active_days: number
  total_trx: number
  transfer_trx: number
  total_fee: number
  avg_transfer_per_active_day: number
  bucket: 'potential' | 'at_risk'
  last_active: string
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
  const [lastDate, setLastDate] = useState<string>('')

  useEffect(() => { loadData() }, [page, filter, filterMitra])

  async function loadData() {
    setLoading(true)
    try {
      // Ambil tanggal terbaru
      const { data: latestDate } = await supabase
        .from('am_transactions')
        .select('transaction_date')
        .order('transaction_date', { ascending: false })
        .limit(1)
        .single()

      if (!latestDate) return

      const maxDate = latestDate.transaction_date
      const sinceDate = new Date(maxDate)
      sinceDate.setDate(sinceDate.getDate() - 13)
      const sinceStr = sinceDate.toISOString().split('T')[0]

      setLastDate(maxDate)

      // Ambil semua transaksi 14 hari — aggregate per serial_number
      const { data: trxData } = await supabase
        .from('am_transactions')
        .select('serial_number, merchant_name, mitra, pic, transaction_date, trntype, sharing_fee')
        .gte('transaction_date', sinceStr)
        .lte('transaction_date', maxDate)

      if (!trxData) return

      // Aggregate di client
      const agentMap: Record<string, {
        serial_number: string
        merchant_name: string | null
        mitra: string | null
        pic: string | null
        activeDays: Set<string>
        total_trx: number
        transfer_trx: number
        transferTrxByDay: Record<string, number>
        total_fee: number
        last_active: string
      }> = {}

      for (const trx of trxData) {
        const sn = trx.serial_number?.toUpperCase()
        if (!sn) continue

        if (!agentMap[sn]) {
          agentMap[sn] = {
            serial_number: sn,
            merchant_name: trx.merchant_name,
            mitra:         trx.mitra,
            pic:           trx.pic,
            activeDays:    new Set(),
            total_trx:     0,
            transfer_trx:  0,
            transferTrxByDay: {},
            total_fee:     0,
            last_active:   trx.transaction_date,
          }
        }

        const agent = agentMap[sn]
        agent.activeDays.add(trx.transaction_date)
        agent.total_trx++
        agent.total_fee += Number(trx.sharing_fee) || 0
        if (trx.last_active < trx.transaction_date) agent.last_active = trx.transaction_date

        if (trx.trntype === 'TRANSFER') {
          agent.transfer_trx++
          const d = trx.transaction_date
          agent.transferTrxByDay[d] = (agent.transferTrxByDay[d] ?? 0) + 1
        }
      }

      // Filter sporadic: aktif 1-7 hari
      const sporadic: SporadicAgent[] = []
      const mitraSet = new Set<string>()

      for (const agent of Object.values(agentMap)) {
        const activeDays = agent.activeDays.size
        if (activeDays < 1 || activeDays > 7) continue

        const totalTransfer = Object.values(agent.transferTrxByDay).reduce((a, b) => a + b, 0)
        const avgTransfer = totalTransfer / activeDays
        const bucket = avgTransfer >= 5 ? 'potential' : 'at_risk'

        if (agent.mitra) mitraSet.add(agent.mitra)

        sporadic.push({
          serial_number:              agent.serial_number,
          merchant_name:              agent.merchant_name,
          mitra:                      agent.mitra,
          pic:                        agent.pic,
          active_days:                activeDays,
          total_trx:                  agent.total_trx,
          transfer_trx:               agent.transfer_trx,
          total_fee:                  agent.total_fee,
          avg_transfer_per_active_day: Math.round(avgTransfer * 10) / 10,
          bucket,
          last_active:                agent.last_active,
        })
      }

      setMitras(Array.from(mitraSet).sort())

      // Filter
      let filtered = sporadic
      if (filter !== 'all') filtered = filtered.filter(a => a.bucket === filter)
      if (filterMitra) filtered = filtered.filter(a => a.mitra === filterMitra)

      // Sort by potential first, then by active_days desc
      filtered.sort((a, b) => {
        if (a.bucket !== b.bucket) return a.bucket === 'potential' ? -1 : 1
        return b.avg_transfer_per_active_day - a.avg_transfer_per_active_day
      })

      setTotal(filtered.length)
      setAgents(filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE))

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

      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '32px 24px' }}>

        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '11px', fontWeight: '600', color: '#9ca3af', letterSpacing: '0.1em', marginBottom: '4px' }}>
            ANALITIK AGEN
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#111827', margin: 0, letterSpacing: '-0.02em' }}>
            Agen Sporadic
          </h1>
          <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
            Aktif 1–7 hari dari 14 hari terakhir (s.d. {lastDate ? new Date(lastDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'})
          </p>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
          {/* Bucket filter */}
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

          {/* Mitra filter */}
          <select
            value={filterMitra}
            onChange={e => { setFilterMitra(e.target.value); setPage(0) }}
            style={{
              padding: '7px 12px', borderRadius: '8px', border: '1px solid #e5e7eb',
              fontSize: '12px', color: '#374151', backgroundColor: '#fff', cursor: 'pointer',
            }}
          >
            <option value="">Semua Mitra</option>
            {mitras.map(m => <option key={m} value={m}>{m}</option>)}
          </select>

          <div style={{ marginLeft: 'auto', fontSize: '13px', color: '#6b7280', display: 'flex', alignItems: 'center' }}>
            {loading ? 'Memuat...' : `${total.toLocaleString('id')} agen`}
          </div>
        </div>

        {/* Table */}
        {!loading && agents.length > 0 && (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden', marginBottom: '16px' }}>
            {/* Header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '140px 1fr 140px 120px 60px 80px 80px 80px',
              padding: '10px 16px',
              backgroundColor: '#f9fafb',
              borderBottom: '1px solid #e5e7eb',
              fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.05em',
            }}>
              <div>BUCKET</div>
              <div>AGEN</div>
              <div>MITRA</div>
              <div>PIC</div>
              <div>HARI</div>
              <div>TRX</div>
              <div>TRANSFER</div>
              <div>FEE</div>
            </div>

            {/* Rows */}
            {agents.map((agent, i) => (
              <div key={agent.serial_number} style={{
                display: 'grid',
                gridTemplateColumns: '140px 1fr 140px 120px 60px 80px 80px 80px',
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
                  fontSize: '13px', fontWeight: '700', textAlign: 'center',
                  color: agent.active_days >= 5 ? '#166534' : agent.active_days >= 3 ? '#ca8a04' : '#dc2626',
                }}>
                  {agent.active_days}
                </div>
                <div style={{ fontSize: '12px', color: '#374151', textAlign: 'right' }}>
                  {agent.total_trx.toLocaleString('id')}
                </div>
                <div style={{ fontSize: '12px', color: '#374151', textAlign: 'right' }}>
                  {agent.transfer_trx.toLocaleString('id')}
                </div>
                <div style={{ fontSize: '12px', color: '#374151', textAlign: 'right' }}>
                  {agent.total_fee >= 1000000
                    ? `${(agent.total_fee / 1000000).toFixed(1)}jt`
                    : `${(agent.total_fee / 1000).toFixed(0)}rb`}
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
