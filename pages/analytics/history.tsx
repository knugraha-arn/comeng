import { useEffect, useState } from 'react'
import Head from 'next/head'
import Layout from '../../components/Layout'
import { createBrowserClient } from '@supabase/ssr'

interface UploadSession {
  id: string
  upload_date: string
  status: string
  row_count: number | null
  uploaded_by: string | null
  created_at: string
  completed_at: string | null
  uploader_name?: string
}

interface DailyStats {
  transaction_date: string
  total_trx: number
  total_fee: number
  unique_agents: number
}

export default function UploadHistory() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [sessions, setSessions] = useState<UploadSession[]>([])
  const [stats, setStats] = useState<Record<string, DailyStats>>({})
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<UploadSession | null>(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      // Load sessions
      const { data: sessionData } = await supabase
        .from('am_upload_sessions')
        .select('*')
        .order('upload_date', { ascending: false })

      if (!sessionData || sessionData.length === 0) {
        setLoading(false)
        return
      }

      // Ambil nama uploader
      const uploaderIds = [...new Set(sessionData.map(s => s.uploaded_by).filter(Boolean))]
      const { data: users } = await supabase
        .from('users')
        .select('id, full_name, email')
        .in('id', uploaderIds)

      const userMap: Record<string, string> = {}
      for (const u of users ?? []) {
        userMap[u.id] = u.full_name || u.email
      }

      setSessions(sessionData.map(s => ({
        ...s,
        uploader_name: s.uploaded_by ? (userMap[s.uploaded_by] ?? '—') : '—',
      })))

      // Load stats via SQL function (aggregate di DB, tidak ada limit)
      const dates = sessionData.map(s => s.upload_date)
      const { data: trxStats } = await supabase.rpc('get_daily_transaction_stats', {
        p_dates: dates,
      })

      const statsMap: Record<string, DailyStats> = {}
      for (const row of trxStats ?? []) {
        statsMap[row.transaction_date] = {
          transaction_date: row.transaction_date,
          total_trx:        Number(row.total_trx),
          total_fee:        Number(row.total_fee),
          unique_agents:    Number(row.unique_agents),
        }
      }
      setStats(statsMap)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(session: UploadSession) {
    setDeleting(session.upload_date)
    setConfirmDelete(null)
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession()
      if (!authSession) return

      const res = await fetch('/api/analytics/delete-session', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authSession.access_token}`,
        },
        body: JSON.stringify({ upload_date: session.upload_date }),
      })

      if (res.ok) await loadData()
      else {
        const data = await res.json()
        alert(data.error ?? 'Hapus gagal')
      }
    } finally {
      setDeleting(null)
    }
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  function formatDateTime(d: string) {
  return new Date(d).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }
  function formatRp(val: number) {
    if (val >= 1000000) return `Rp ${(val / 1000000).toFixed(1)}jt`
    if (val >= 1000) return `Rp ${(val / 1000).toFixed(0)}rb`
    return `Rp ${val.toLocaleString('id')}`
  }

  const totalTrx = Object.values(stats).reduce((s, r) => s + r.total_trx, 0)
  const totalFee = Object.values(stats).reduce((s, r) => s + r.total_fee, 0)

  return (
    <Layout>
      <Head><title>Upload History — AMARIS</title></Head>

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 24px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: '600', color: '#9ca3af', letterSpacing: '0.1em', marginBottom: '4px' }}>
              DATA MANAGEMENT
            </div>
            <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#111827', margin: 0, letterSpacing: '-0.02em' }}>
              Upload History
            </h1>
            <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
              Riwayat data yang sudah diupload. Delete = hapus semua data untuk tanggal tersebut.
            </p>
          </div>
          <button
            onClick={() => window.location.href = '/analytics/upload'}
            style={{
              padding: '9px 18px', borderRadius: '8px', border: 'none',
              backgroundColor: '#0344D8', color: '#fff',
              fontSize: '13px', fontWeight: '600', cursor: 'pointer',
            }}
          >
            + Upload Baru
          </button>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '60px', color: '#9ca3af', fontSize: '13px' }}>
            Memuat data...
          </div>
        )}

        {!loading && sessions.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '60px',
            backgroundColor: '#f9fafb', borderRadius: '12px',
            border: '1px dashed #e5e7eb',
          }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>📭</div>
            <div style={{ fontSize: '14px', color: '#6b7280' }}>Belum ada data yang diupload</div>
          </div>
        )}

        {!loading && sessions.length > 0 && (
          <>
            {/* Table */}
            <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden', marginBottom: '16px' }}>

              {/* Header */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '120px 90px 100px 100px 120px 1fr 70px',
                padding: '10px 16px',
                backgroundColor: '#f9fafb',
                borderBottom: '1px solid #e5e7eb',
                fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.05em',
              }}>
                <div>TGL DATA</div>
                <div>TRX</div>
                <div>AGEN AKTIF</div>
                <div>TOTAL FEE</div>
                <div>DIUPLOAD</div>
                <div>OLEH</div>
                <div></div>
              </div>

              {/* Rows */}
              {sessions.map((s, i) => {
                const dayStats = stats[s.upload_date]
                return (
                  <div
                    key={s.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '120px 90px 100px 100px 120px 1fr 70px',
                      padding: '13px 16px',
                      borderBottom: i < sessions.length - 1 ? '1px solid #f3f4f6' : 'none',
                      alignItems: 'center',
                      backgroundColor: deleting === s.upload_date ? '#fef2f2' : '#fff',
                    }}
                  >
                    <div style={{ fontSize: '13px', fontWeight: '700', color: '#111827' }}>
                      {formatDate(s.upload_date)}
                    </div>
                    <div style={{ fontSize: '13px', color: '#374151' }}>
                      {dayStats ? dayStats.total_trx.toLocaleString('id') : '—'}
                    </div>
                    <div style={{ fontSize: '13px', color: '#374151' }}>
                      {dayStats ? dayStats.unique_agents.toLocaleString('id') : '—'}
                    </div>
                    <div style={{ fontSize: '13px', color: '#374151' }}>
                      {dayStats ? formatRp(dayStats.total_fee) : '—'}
                    </div>
                    <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                      {s.completed_at ? formatDateTime(s.completed_at) : '—'}
                    </div>
                    <div style={{ fontSize: '12px', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.uploader_name}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      {deleting === s.upload_date ? (
                        <span style={{ fontSize: '11px', color: '#dc2626' }}>Menghapus...</span>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(s)}
                          style={{
                            padding: '4px 10px', borderRadius: '6px',
                            border: '1px solid #fecaca', backgroundColor: 'transparent',
                            color: '#dc2626', fontSize: '11px', cursor: 'pointer',
                          }}
                        >
                          Hapus
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Summary */}
            <div style={{ display: 'flex', gap: '24px', fontSize: '12px', color: '#9ca3af' }}>
              <span>{sessions.length} tanggal tersimpan</span>
              <span>Total: {totalTrx.toLocaleString('id')} transaksi</span>
              <span>Total fee: {formatRp(totalFee)}</span>
            </div>
          </>
        )}
      </div>

      {/* Confirm Delete Modal */}
      {confirmDelete && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: '#fff', borderRadius: '12px', padding: '28px',
            maxWidth: '400px', width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>
            <div style={{ fontSize: '18px', fontWeight: '700', color: '#111827', marginBottom: '8px' }}>
              Hapus data {formatDate(confirmDelete.upload_date)}?
            </div>
            <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '20px', lineHeight: '1.6' }}>
              Semua transaksi, metrics, dan insights untuk tanggal ini akan dihapus permanen.
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => handleDelete(confirmDelete)}
                style={{
                  flex: 1, padding: '10px', borderRadius: '8px', border: 'none',
                  backgroundColor: '#dc2626', color: '#fff',
                  fontSize: '13px', fontWeight: '700', cursor: 'pointer',
                }}
              >
                Ya, Hapus
              </button>
              <button
                onClick={() => setConfirmDelete(null)}
                style={{
                  flex: 1, padding: '10px', borderRadius: '8px',
                  border: '1px solid #e5e7eb', backgroundColor: '#fff',
                  color: '#374151', fontSize: '13px', cursor: 'pointer',
                }}
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
