import { useState, useEffect, useRef } from 'react'
import Head from 'next/head'
import Layout from '../components/Layout'
import { createBrowserClient } from '@supabase/ssr'

type Wag = { id: string; name: string }
type UploadRecord = {
  id: string
  filename: string
  file_size_kb: number
  messages_parsed: number
  messages_skipped: number
  status: string
  uploaded_at: string
  wags: { name: string }
}

type ProgressStep = 'idle' | 'uploading' | 'parsing' | 'done' | 'error'

export default function UploadPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [wags, setWags] = useState<Wag[]>([])
  const [selectedWagId, setSelectedWagId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [step, setStep] = useState<ProgressStep>('idle')
  const [progress, setProgress] = useState(0)
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
    if (!f.name.endsWith('.txt')) { setMessage('File harus berformat .txt'); return }
    if (f.size > 10 * 1024 * 1024) { setMessage('Ukuran file maksimal 10MB'); return }
    setFile(f)
    setMessage('')
    setStep('idle')
    setProgress(0)
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

    setStep('uploading')
    setProgress(10)
    setMessage('Mengupload file...')

    try {
      const filename = `${selectedWagId}/${Date.now()}_${file.name}`
      const { error: storageError } = await supabase.storage
        .from('wag-exports')
        .upload(filename, file)
      if (storageError) throw storageError

      setProgress(35)
      setMessage('File terupload — menyimpan record...')

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Session tidak ditemukan')

      const { data: uploadData, error: dbError } = await supabase
        .from('uploads')
        .insert({
          wag_id: selectedWagId,
          uploaded_by: session.user.id,
          filename: file.name,
          file_path: filename,
          file_size_kb: Math.round(file.size / 1024),
          status: 'pending',
        })
        .select('id')
        .single()
      if (dbError) throw dbError

      setProgress(50)
      setStep('parsing')
      setMessage('Memproses pesan...')

      const parseRes = await fetch('/api/parse-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upload_id: uploadData.id }),
      })

      setProgress(85)
      setMessage('Menghitung metrik...')

      const parseResult = await parseRes.json()
      if (!parseRes.ok) throw new Error(parseResult.error || 'Gagal memproses file')

      setProgress(100)
      setStep('done')
      setMessage(`Selesai — ${parseResult.messages_parsed} pesan baru, ${parseResult.messages_skipped} dilewati.`)
      setFile(null)
      setSelectedWagId('')
      fetchHistory()

    } catch (err: unknown) {
      setStep('error')
      setProgress(0)
      setMessage(err instanceof Error ? err.message : 'Terjadi kesalahan')
    }
  }

  const formatDateTime = (iso: string) => {
    const d = new Date(iso)
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yy = String(d.getFullYear()).slice(2)
    const hh = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    return `${dd}/${mm}/${yy} ${hh}:${min}`
  }

  const stepLabels: Record<ProgressStep, string> = {
    idle: '',
    uploading: 'Mengupload file',
    parsing: 'Memproses pesan',
    done: 'Selesai',
    error: 'Error',
  }

  const msgColor = step === 'done' ? '#27500A' : step === 'error' ? '#B00020' : '#856404'
  const msgBg = step === 'done' ? '#EAF3DE' : step === 'error' ? '#FDECEA' : '#FFF3CD'

  return (
    <Layout>
      <Head><title>Upload WAG — AMARIS</title></Head>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', alignItems: 'start' }}>

        {/* Upload form */}
        <div style={{ background: '#FFFFFF', border: '1px solid #e5e5e5', borderRadius: '10px', padding: '24px' }}>
          <div style={{ fontSize: '13px', fontWeight: '500', marginBottom: '16px' }}>Upload file export WAG</div>

          {/* Pilih WAG */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '11px', color: '#999', marginBottom: '8px' }}>Pilih WAG tujuan</div>
            {wags.length === 0 ? (
              <div style={{ fontSize: '12px', color: '#999' }}>Belum ada WAG — tambahkan di Konfigurasi</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {wags.map(w => (
                  <button
                    key={w.id}
                    onClick={() => setSelectedWagId(w.id)}
                    style={{
                      padding: '7px 16px', borderRadius: '999px', border: '1px solid',
                      borderColor: selectedWagId === w.id ? '#0344D8' : '#e5e5e5',
                      background: selectedWagId === w.id ? '#0344D8' : '#FFFFFF',
                      color: selectedWagId === w.id ? '#FFFFFF' : '#555',
                      fontSize: '12px', cursor: 'pointer',
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
              borderRadius: '10px', padding: '28px', textAlign: 'center', cursor: 'pointer',
              background: dragging ? '#EEF4FF' : file ? '#F0F5FF' : '#F8F9FB',
              marginBottom: '16px', transition: 'all 0.15s',
            }}
          >
            <input ref={fileInputRef} type="file" accept=".txt"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
              style={{ display: 'none' }} />
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>
              {dragging ? '📂' : file ? '📄' : '📁'}
            </div>
            {file ? (
              <>
                <div style={{ fontSize: '13px', fontWeight: '500', color: '#0344D8' }}>{file.name}</div>
                <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>
                  {Math.round(file.size / 1024)} KB · Klik untuk ganti
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: '13px', fontWeight: '500', marginBottom: '4px' }}>
                  {dragging ? 'Lepaskan di sini' : 'Drag & drop atau klik untuk pilih'}
                </div>
                <div style={{ fontSize: '11px', color: '#999' }}>Export WhatsApp (.txt) · Maks 10MB</div>
              </>
            )}
          </div>

          {/* Progress bar */}
          {step !== 'idle' && (
            <div style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#999', marginBottom: '6px' }}>
                <span>{stepLabels[step]}</span>
                <span>{progress}%</span>
              </div>
              <div style={{ height: '6px', background: '#F8F9FB', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: '3px',
                  width: `${progress}%`,
                  background: step === 'done' ? '#27500A' : step === 'error' ? '#B00020' : '#0344D8',
                  transition: 'width 0.4s ease',
                }} />
              </div>
            </div>
          )}

          {/* Message */}
          {message && (
            <div style={{
              padding: '10px 14px', borderRadius: '8px', fontSize: '12px',
              marginBottom: '16px', background: msgBg, color: msgColor,
            }}>
              {message}
            </div>
          )}

          {/* Button */}
          <button
            onClick={handleUpload}
            disabled={step === 'uploading' || step === 'parsing'}
            style={{
              width: '100%', padding: '12px',
              background: (step === 'uploading' || step === 'parsing') ? '#999' : '#0344D8',
              color: '#FFFFFF', border: 'none', borderRadius: '8px',
              fontSize: '13px', fontWeight: '500',
              cursor: (step === 'uploading' || step === 'parsing') ? 'not-allowed' : 'pointer',
            }}
          >
            {step === 'uploading' ? 'Mengupload...' : step === 'parsing' ? 'Memproses...' : 'Upload & Proses File'}
          </button>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* Panduan */}
          <div style={{ background: '#F8F9FB', border: '1px solid #e5e5e5', borderRadius: '10px', padding: '16px' }}>
            <div style={{ fontSize: '12px', fontWeight: '500', marginBottom: '8px' }}>Cara export chat WAG</div>
            {[
              'Buka WAG → ketuk ⋮ → More → Export Chat',
              'Pilih Without Media',
              'Download file .txt',
              'Drag & drop atau klik upload di sebelah kiri',
            ].map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: '10px', marginBottom: '6px', fontSize: '12px', color: '#555' }}>
                <span style={{ color: '#0344D8', fontWeight: '600', minWidth: '16px' }}>{i + 1}.</span>
                <span>{s}</span>
              </div>
            ))}
          </div>

          {/* Riwayat */}
          <div style={{ background: '#FFFFFF', border: '1px solid #e5e5e5', borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5e5e5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: '500' }}>Riwayat upload</span>
              <button onClick={fetchHistory} style={{ fontSize: '11px', color: '#0344D8', background: 'none', border: 'none', cursor: 'pointer' }}>Refresh</button>
            </div>
            {history.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', fontSize: '12px', color: '#999' }}>Belum ada upload</div>
            ) : (
              history.map(h => (
                <div key={h.id} style={{ padding: '10px 16px', borderBottom: '1px solid #f5f5f5', fontSize: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }}>
                      {h.filename}
                    </div>
                    <span style={{
                      fontSize: '10px', padding: '2px 8px', borderRadius: '999px',
                      background: h.status === 'done' ? '#EAF3DE' : h.status === 'error' ? '#FDECEA' : h.status === 'processing' ? '#E8F0FE' : '#FFF3CD',
                      color: h.status === 'done' ? '#27500A' : h.status === 'error' ? '#B00020' : h.status === 'processing' ? '#0344D8' : '#856404',
                    }}>
                      {h.status === 'done' ? 'Selesai' : h.status === 'error' ? 'Error' : h.status === 'processing' ? 'Diproses' : 'Pending'}
                    </span>
                  </div>
                  <div style={{ color: '#999', marginTop: '3px' }}>
                    {h.wags?.name} · {h.file_size_kb} KB
                  </div>
                  <div style={{ color: '#bbb', marginTop: '2px', fontSize: '11px' }}>
                    {formatDateTime(h.uploaded_at)}
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
