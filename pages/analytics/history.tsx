import { useEffect, useState } from 'react'
import Head from 'next/head'
import Layout from '../../components/Layout'
import { createBrowserClient } from '@supabase/ssr'

interface UploadSession {
  id: string
  upload_date: string
  status: string
  nobu_row_count: number
  esa_row_count: number
  master_row_count: number
  refnum_match_rate: number
  uploaded_by: string
  created_at: string
  completed_at: string
  uploader_name?: string
}

export default function UploadHistory() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [sessions, setSessions] = useState<UploadSession[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<UploadSession | null>(null)

  useEffect(() => { loadSessions() }, [])

  async function loadSessions() {
    setLoading(true)
    try {
      const { data: sessionData } = await supabase
        .from('am_upload_sessions')
        .select('*')
        .order('upload_date', { ascending: false })

      if (!sessionData) return

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
        uploader_name: userMap[s.uploaded_by] ?? '—',
      })))
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

      if (res.ok) {
        await loadSessions()
      } else {
        const data = await res.json()
        alert(data.error ?? 'Hapus gagal')
      }
    } finally {
      setDeleting(null)
    }
  }

  function matchRateColor(rate: number) {
    if (rate >= 95) return '#166534'
    if (rate >= 80) return '#854d0e'
    return '#dc2626'
  }

  function matchRateBg(rate: number) {
    if (rate >= 95) return '#dcfce7'
    if (rate >= 80) return '#fef9c3'
    return '#fee2e2'
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: 'numeric', month: 'short', year: 'numeric'
    })
  }

  function formatDateTime(dateStr: string) {
    return new Date(dateStr).toLocaleString('id-ID', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  }

  return (
    <Layout>
      <Head><title>Upload History — AMARIS</title></Head>

      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '32px 16px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: '700', color: '#1A1F2E', marginBottom: '4px' }}>
              Upload History
            </h1>
            <p style={{ fontSize: '13px', color: '#888' }}>
              Riwayat data yang sudah diupload. Delete = hapus semua data untuk tanggal tersebut.
            </p>
          </div>
          <button
            onClick={() => window.location.href = '/analytics/upload'}
            style={{
              padding: '8px 16px', borderRadius: '6px', border: 'none',
              backgroundColor: '#0344D8', color: '#fff',
              fontSize: '12px', fontWeight: '600', cursor: 'pointer',
            }}
          >
            + Upload Baru
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '60px', color: '#888', fontSize: '13px' }}>
            Memuat data...
          </div>
        )}

        {/* Empty */}
        {!loading && sessions.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '60px',
            backgroundColor: '#f9fafb', borderRadius: '8px',
            border: '1px dashed #e5e7eb',
          }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>📭</div>
            <div style={{ fontSize: '14px', color: '#888' }}>Belum ada data yang diupload</div>
          </div>
        )}

        {/* Table */}
        {!loading && sessions.length > 0 && (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>

            {/* Header row */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '130px 100px 100px 90px 110px 1fr 60px',
              padding: '10px 16px',
              backgroundColor: '#f9fafb',
              borderBottom: '1px solid #e5e7eb',
              fontSize: '11px', fontWeight: '600', color: '#888',
              letterSpacing: '0.05em',
            }}>
              <div>TGL DATA</div>
              <div>NOBU</div>
              <div>ESA</div>
              <div>MATCH</div>
              <div>DIUPLOAD</div>
              <div>OLEH</div>
              <div></div>
            </div>

            {/* Data rows */}
            {sessions.map((s, i) => (
              <div
                key={s.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '130px 100px 100px 90px 110px 1fr 60px',
                  padding: '12px 16px',
                  borderBottom: i < sessions.length - 1 ? '1px solid #f3f4f6' : 'none',
                  alignItems: 'center',
                  backgroundColor: deleting === s.upload_date ? '#fef2f2' : '#fff',
                  transition: 'background 0.2s',
                }}
              >
                {/* Tanggal data */}
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#1A1F2E' }}>
                  {formatDate(s.upload_date)}
                </div>

                {/* NOBU rows */}
                <div style={{ fontSize: '13px', color: '#555' }}>
                  {s.nobu_row_count?.toLocaleString('id') ?? '—'}
                </div>

                {/* ESA rows */}
                <div style={{ fontSize: '13px', color: '#555' }}>
                  {s.esa_row_count?.toLocaleString('id') ?? '—'}
                </div>

                {/* Match rate */}
                <div>
                  <span style={{
                    padding: '2px 8px', borderRadius: '99px', fontSize: '12px', fontWeight: '700',
                    backgroundColor: matchRateBg(s.refnum_match_rate ?? 0),
                    color: matchRateColor(s.refnum_match_rate ?? 0),
                  }}>
                    {s.refnum_match_rate != null ? `${Number(s.refnum_match_rate).toFixed(0)}%` : '—'}
                  </span>
                </div>

                {/* Waktu upload */}
                <div style={{ fontSize: '11px', color: '#888' }}>
                  {s.completed_at ? formatDateTime(s.completed_at) : '—'}
                </div>

                {/* Nama uploader */}
                <div style={{ fontSize: '12px', color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.uploader_name}
                </div>

                {/* Delete button */}
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
            ))}
          </div>
        )}

        {/* Summary */}
        {!loading && sessions.length > 0 && (
          <div style={{
            marginTop: '16px', display: 'flex', gap: '24px',
            fontSize: '12px', color: '#888',
          }}>
            <span>{sessions.length} tanggal tersimpan</span>
            <span>Total NOBU: {sessions.reduce((s, r) => s + (r.nobu_row_count ?? 0), 0).toLocaleString('id')} transaksi</span>
            <span>Total ESA: {sessions.reduce((s, r) => s + (r.esa_row_count ?? 0), 0).toLocaleString('id')} baris</span>
          </div>
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
            maxWidth: '400px', width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}>
            <div style={{ fontSize: '18px', fontWeight: '700', color: '#1A1F2E', marginBottom: '8px' }}>
              Hapus data {formatDate(confirmDelete.upload_date)}?
            </div>
            <div style={{ fontSize: '13px', color: '#666', marginBottom: '20px', lineHeight: '1.6' }}>
              Semua data untuk tanggal ini akan dihapus permanen — transaksi NOBU, ESA, Master Agen, metrics, dan insights. Tindakan ini tidak bisa dibatalkan.
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
                  color: '#555', fontSize: '13px', cursor: 'pointer',
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
