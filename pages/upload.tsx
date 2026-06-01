import { useState, useEffect, useRef } from 'react'
import Layout from '@/components/Layout'
import { supabase } from '@/lib/supabase'

type Wag = { id: string; name: string }
type UploadRecord = { id: string; filename: string; file_size_kb: number; messages_parsed: number; messages_skipped: number; status: string; uploaded_at: string; wags: { name: string } }

export default function UploadPage() {
  const [wags, setWags] = useState<Wag[]>([])
  const [selectedWagId, setSelectedWagId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [history, setHistory] = useState<UploadRecord[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchWags()
    fetchHistory()
  }, [])

  const fetchWags = async () => {
    const { data } = await supabase.from('wags').select('id, name').eq('status', 'active').order('name')
    if (data) setWags(data)
  }

  const fetchHistory = async () => {
    const { data } = await supabase
      .from('uploads')
      .select('id, filename, file_size_kb, messages_parsed, messages_skipped, status, uploaded_at, wags(name)')
      .order('uploaded_at', { ascending: false })
      .limit(10)
    if (data) setHistory(data as unknown as UploadRecord[])
  }

  const handleFile = (f: File) => {
    if (!f.name.endsWith('.txt')) {
      setMessage('File harus berformat .txt (export WhatsApp)')
      return
    }
    if (f.size > 10 * 1024 * 1024) {
      setMessage('Ukuran file maksimal 10MB')
      return
    }
    setFile(f)
    setMessage('')
    setStatus('idle')
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  const handleUpload = async () => {
    if (!file) { setMessage('Pilih file terlebih dahulu'); return }
    if (!selectedWagId) { setMessage('Pilih WAG tujuan terlebih dahulu'); return }

    setStatus('uploading')
    setMessage('')

    try {
      const filename = `${selectedWagId}/${Date.now()}_${file.name}`
      const { error: storageError } = await supabase.storage
        .from('wag-exports')
        .upload(filename, file)
      if (storageError) throw storageError

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Session tidak ditemukan')

      const { error: dbError } = await supabase.from('uploads').insert({
        wag_id: selectedWagId,
        uploaded_by: session.user.id,
        filename: file.name,
        file_path: filename,
        file_size_kb: Math.round(file.size / 1024),
        status: 'pending',
      })
      if (dbError) throw dbError

      setStatus('success')
      setMessage('File berhasil diupload. Sistem akan memproses pesan baru segera.')
      setFile(null)
      setSelectedWagId('')
      fetchHistory()

    } catch (err: unknown) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : 'Terjadi kesalahan saat upload')
    }
  }

  const statusColor = { idle: '', uploading: '#856404', success: '#27500A', error: '#B00020' }
  const statusBg = { idle: '', uploading: '#FFF3CD', success: '#EAF3DE', error: '#FDECEA' }

  return (
    <Layout title="Upload WAG Mingguan">

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', alignItems: 'start' }}>

        {/* Upload form */}
        <div style={{ background: '#FFFFFF', border: '1px solid #e5e5e5', borderRadius: '10px', padding: '24px' }}>
          <div style={{ fontSize: '13px', fontWeight: '500', marginBottom: '16px' }}>Upload file export WAG</div>

          {/* Pilih WAG */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '11px', color: '#999', marginBottom: '8px' }}>Pilih WAG tujuan</div>
            {wags.length === 0 ? (
              <div style={{ fontSize: '12px', color: '#999' }}>Belum ada WAG — tambahkan di halaman Konfigurasi</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {wags.map(w => (
                  <button
                    key={w.id}
                    onClick={() => setSelectedWagId(w.id)}
                    style={{
                      padding: '7px 16px',
                      borderRadius: '999px',
                      border: '1px solid',
                      borderColor: selectedWagId === w.id ? '#0344D8' : '#e5e5e5',
                      background: selectedWagId === w.id ? '#0344D8' : '#FFFFFF',
                      color: selectedWagId === w.id ? '#FFFFFF' : '#555',
                      fontSize: '12px',
                      cursor: 'pointer',
                      fontWeight: selectedWagId === w.id ? '500' : '400',
                    }}
                  >
                    {w.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: '1.5px dashed',
              borderColor: dragging ? '#0344D8' : file ? '#0344D8' : '#e5e5e5',
              borderRadius: '10px',
              padding: '32px',
              textAlign: 'center',
              cursor: 'pointer',
              background: dragging ? '#EEF4FF' : file ? '#F0F5FF' : '#F8F9FB',
              marginBottom: '16px',
              transition: 'all 0.15s',
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
              style={{ display: 'none' }}
            />
            <div style={{ fontSize: '28px', marginBottom: '8px' }}>{dragging ? '📂' : file ? '📄' : '📁'}</div>
            {file ? (
              <>
                <div style={{ fontSize: '13px', fontWeight: '500', color: '#0344D8' }}>{file.name}</div>
                <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>{Math.round(file.size / 1024)} KB · Klik untuk ganti file</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: '13px', fontWeight: '500', marginBottom: '4px' }}>
                  {dragging ? 'Lepaskan file di sini' : 'Drag & drop atau klik untuk pilih file'}
                </div>
                <div style={{ fontSize: '11px', color: '#999' }}>Export WhatsApp (.txt) tanpa media · Maks 10MB</div>
              </>
            )}
          </div>

          {/* Message */}
          {message && (
            <div style={{
              padding: '10px 14px',
              borderRadius: '8px',
              fontSize: '12px',
              marginBottom: '16px',
              background: statusBg[status] || '#FFF3CD',
              color: statusColor[status] || '#856404',
            }}>
              {message}
            </div>
          )}

          {/* Button */}
          <button
            onClick={handleUpload}
            disabled={status === 'uploading'}
            style={{
              width: '100%',
              padding: '12px',
              background: status === 'uploading' ? '#999' : '#0344D8',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '500',
              cursor: status === 'uploading' ? 'not-allowed' : 'pointer',
            }}
          >
            {status === 'uploading' ? 'Mengupload...' : 'Upload File'}
          </button>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* Panduan */}
          <div style={{ background: '#F8F9FB', border: '1px solid #e5e5e5', borderRadius: '10px', padding: '16px' }}>
            <div style={{ fontSize: '12px', fontWeight: '500', marginBottom: '8px' }}>Cara export chat WAG di WhatsApp</div>
            {[
              'Buka WAG → ketuk ⋮ → More → Export Chat',
              'Pilih Without Media',
              'Download file .txt',
              'Drag & drop atau klik upload di sebelah kiri',
            ].map((step, i) => (
              <div key={i} style={{ display: 'flex', gap: '10px', marginBottom: '6px', fontSize: '12px', color: '#555' }}>
                <span style={{ color: '#0344D8', fontWeight: '600', minWidth: '16px' }}>{i + 1}.</span>
                <span>{step}</span>
              </div>
            ))}
          </div>

          {/* Riwayat upload */}
          <div style={{ background: '#FFFFFF', border: '1px solid #e5e5e5', borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5e5e5', fontSize: '13px', fontWeight: '500' }}>Riwayat upload</div>
            {history.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', fontSize: '12px', color: '#999' }}>Belum ada upload</div>
            ) : (
              history.map(h => (
                <div key={h.id} style={{ padding: '10px 16px', borderBottom: '1px solid #f5f5f5', fontSize: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>{h.filename}</div>
                    <span style={{
                      fontSize: '10px', padding: '2px 8px', borderRadius: '999px',
                      background: h.status === 'done' ? '#EAF3DE' : h.status === 'error' ? '#FDECEA' : '#FFF3CD',
                      color: h.status === 'done' ? '#27500A' : h.status === 'error' ? '#B00020' : '#856404',
                    }}>
                      {h.status === 'done' ? 'Selesai' : h.status === 'error' ? 'Error' : h.status === 'processing' ? 'Diproses' : 'Pending'}
                    </span>
                  </div>
                  <div style={{ color: '#999', marginTop: '3px' }}>
                    {h.wags?.name} · {h.file_size_kb} KB · {new Date(h.uploaded_at).toLocaleDateString('id-ID')}
                  </div>
                  {h.messages_parsed > 0 && (
                    <div style={{ color: '#27500A', marginTop: '2px' }}>
                      {h.messages_parsed} pesan baru · {h.messages_skipped} dilewati
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
