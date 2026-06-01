import { useState } from 'react'
import Layout from '@/components/Layout'
import { supabase } from '@/lib/supabase'

export default function UploadPage() {
  const [selectedWag, setSelectedWag] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const wags = [
    { id: 'wag-budi', name: 'WAG Ranger Budi' },
    { id: 'wag-sari', name: 'WAG Ranger Sari' },
  ]

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f && f.name.endsWith('.txt')) {
      setFile(f)
      setMessage('')
    } else {
      setMessage('File harus berformat .txt (export WhatsApp)')
    }
  }

  const handleUpload = async () => {
    if (!file) { setMessage('Pilih file terlebih dahulu'); return }
    if (!selectedWag) { setMessage('Pilih WAG tujuan terlebih dahulu'); return }

    setStatus('uploading')
    setMessage('')

    try {
      // 1. Upload file ke Supabase Storage
      const filename = `${selectedWag}/${Date.now()}_${file.name}`
      const { error: storageError } = await supabase.storage
        .from('wag-exports')
        .upload(filename, file)

      if (storageError) throw storageError

      // 2. Dapatkan user session
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Session tidak ditemukan')

      // 3. Dapatkan wag_id dari database
      const { data: wagData, error: wagError } = await supabase
        .from('wags')
        .select('id')
        .eq('name', wags.find(w => w.id === selectedWag)?.name)
        .single()

      if (wagError || !wagData) throw new Error('WAG tidak ditemukan di database. Tambahkan WAG di halaman Konfigurasi dulu.')

      // 4. Simpan record upload ke database
      const { error: dbError } = await supabase
        .from('uploads')
        .insert({
          wag_id: wagData.id,
          uploaded_by: session.user.id,
          filename: file.name,
          file_path: filename,
          file_size_kb: Math.round(file.size / 1024),
          status: 'pending',
        })

      if (dbError) throw dbError

      setStatus('success')
      setMessage(`File berhasil diupload. Sistem akan memproses pesan baru dalam beberapa saat.`)
      setFile(null)

    } catch (err: unknown) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : 'Terjadi kesalahan saat upload')
    }
  }

  return (
    <Layout title="Upload WAG Mingguan">

      {/* Upload form */}
      <div style={{ background: '#FFFFFF', border: '1px solid #e5e5e5', borderRadius: '10px', padding: '24px', marginBottom: '16px' }}>
        <div style={{ fontSize: '13px', fontWeight: '500', marginBottom: '16px' }}>Upload file export WAG</div>

        {/* Pilih WAG */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', color: '#999', marginBottom: '8px' }}>Pilih WAG tujuan</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {wags.map((w) => (
              <button
                key={w.id}
                onClick={() => setSelectedWag(w.id)}
                style={{
                  padding: '7px 16px',
                  borderRadius: '999px',
                  border: '1px solid',
                  borderColor: selectedWag === w.id ? '#0344D8' : '#e5e5e5',
                  background: selectedWag === w.id ? '#0344D8' : '#FFFFFF',
                  color: selectedWag === w.id ? '#FFFFFF' : '#555',
                  fontSize: '12px',
                  cursor: 'pointer',
                  fontWeight: selectedWag === w.id ? '500' : '400',
                }}
              >
                {w.name}
              </button>
            ))}
          </div>
        </div>

        {/* Drop zone */}
        <label style={{
          display: 'block',
          border: '1.5px dashed',
          borderColor: file ? '#0344D8' : '#e5e5e5',
          borderRadius: '10px',
          padding: '32px',
          textAlign: 'center',
          cursor: 'pointer',
          background: file ? '#F0F5FF' : '#F8F9FB',
          marginBottom: '16px',
        }}>
          <input
            type="file"
            accept=".txt"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          <div style={{ fontSize: '28px', marginBottom: '8px' }}>📄</div>
          {file ? (
            <>
              <div style={{ fontSize: '13px', fontWeight: '500', color: '#0344D8' }}>{file.name}</div>
              <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>{Math.round(file.size / 1024)} KB</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: '13px', fontWeight: '500', marginBottom: '4px' }}>Klik untuk pilih file .txt</div>
              <div style={{ fontSize: '11px', color: '#999' }}>Export WhatsApp tanpa media · Maks 10MB</div>
            </>
          )}
        </label>

        {/* Message */}
        {message && (
          <div style={{
            padding: '10px 14px',
            borderRadius: '8px',
            fontSize: '12px',
            marginBottom: '16px',
            background: status === 'success' ? '#EAF3DE' : status === 'error' ? '#FDECEA' : '#FFF3CD',
            color: status === 'success' ? '#27500A' : status === 'error' ? '#B00020' : '#856404',
          }}>
            {message}
          </div>
        )}

        {/* Upload button */}
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

      {/* Panduan */}
      <div style={{ background: '#F8F9FB', border: '1px solid #e5e5e5', borderRadius: '10px', padding: '16px' }}>
        <div style={{ fontSize: '12px', fontWeight: '500', marginBottom: '8px' }}>Cara export chat WAG di WhatsApp</div>
        {[
          'Buka WAG → ketuk ⋮ → More → Export Chat',
          'Pilih Without Media',
          'Pilih file .txt yang terdownload',
          'Upload di halaman ini',
        ].map((step, i) => (
          <div key={i} style={{ display: 'flex', gap: '10px', marginBottom: '6px', fontSize: '12px', color: '#555' }}>
            <span style={{ color: '#0344D8', fontWeight: '600', minWidth: '16px' }}>{i + 1}.</span>
            <span>{step}</span>
          </div>
        ))}
      </div>

    </Layout>
  )
}
