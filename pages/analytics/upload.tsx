import { useState, useRef } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Layout from '../../components/Layout'
import { createBrowserClient } from '@supabase/ssr'

interface UploadSummary {
  dates_processed: string[]
  total_rows: number
  warnings?: string[]
}

type UploadStep = 'idle' | 'uploading' | 'processing' | 'success' | 'error'

export default function UploadCenter() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [file, setFile] = useState<File | null>(null)
  const [step, setStep] = useState<UploadStep>('idle')
  const [stepLabel, setStepLabel] = useState('')
  const [summary, setSummary] = useState<UploadSummary | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const isBusy = step === 'uploading' || step === 'processing'

  async function handleUpload() {
    if (!file) return

    setStep('uploading')
    setStepLabel('Mengupload file...')
    setErrorMsg('')
    setSummary(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }

      // Upload ke Supabase Storage
      const ts = Date.now()
      const path = `analytics-uploads/${ts}_data.xlsx`
      const { error: storageError } = await supabase.storage
        .from('amaris-uploads')
        .upload(path, file, { upsert: true })

      if (storageError) {
        setStep('error')
        setErrorMsg(`Upload gagal: ${storageError.message}`)
        return
      }

      // Trigger API untuk proses
      setStep('processing')
      setStepLabel('Memproses data...')

      const res = await fetch('/api/analytics/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ filePath: path }),
      })

      const data = await res.json()

      if (!res.ok) {
        setStep('error')
        setErrorMsg(data.error ?? 'Proses data gagal')
        return
      }

      setStep('success')
      setSummary(data.summary)

    } catch (err) {
      setStep('error')
      setErrorMsg(err instanceof Error ? err.message : 'Terjadi kesalahan')
    }
  }

  function resetForm() {
    setFile(null)
    setStep('idle')
    setSummary(null)
    setErrorMsg('')
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <Layout>
      <Head><title>Upload Data — AMARIS</title></Head>

      <div style={{ maxWidth: '480px', margin: '0 auto', padding: '32px 24px' }}>

        <div style={{ marginBottom: '28px' }}>
          <div style={{ fontSize: '11px', fontWeight: '600', color: '#9ca3af', letterSpacing: '0.1em', marginBottom: '4px' }}>
            UPLOAD DATA
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#111827', margin: 0, letterSpacing: '-0.02em' }}>
            Upload Data Harian
          </h1>
          <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '6px' }}>
            Upload 1 file XLSX per hari. Data akan diproses otomatis.
          </p>
        </div>

        {step !== 'success' && (
          <>
            {/* Drop zone */}
            <div
              onClick={() => !isBusy && inputRef.current?.click()}
              style={{
                border: `2px dashed ${file ? '#22c55e' : '#d1d5db'}`,
                borderRadius: '12px',
                padding: '40px 24px',
                cursor: isBusy ? 'not-allowed' : 'pointer',
                backgroundColor: file ? '#f0fdf4' : '#fafafa',
                textAlign: 'center',
                marginBottom: '20px',
                transition: 'all 0.2s',
              }}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx"
                style={{ display: 'none' }}
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) setFile(f)
                }}
              />
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>
                {file ? '✅' : '📂'}
              </div>
              <div style={{ fontSize: '14px', fontWeight: '600', color: file ? '#166534' : '#374151', marginBottom: '4px' }}>
                {file ? file.name : 'Klik untuk pilih file .xlsx'}
              </div>
              {file && (
                <div style={{ fontSize: '12px', color: '#6b7280' }}>
                  {(file.size / 1024 / 1024).toFixed(1)} MB
                </div>
              )}
              {!file && (
                <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
                  Format: .xlsx — maks 100MB
                </div>
              )}
            </div>

            {/* Progress */}
            {isBusy && (
              <div style={{
                padding: '14px 16px', borderRadius: '8px',
                backgroundColor: '#eff6ff', border: '1px solid #bfdbfe',
                display: 'flex', alignItems: 'center', gap: '10px',
                marginBottom: '16px', fontSize: '13px', color: '#1d4ed8',
              }}>
                <div style={{
                  width: '16px', height: '16px',
                  border: '2px solid #1d4ed8', borderTopColor: 'transparent',
                  borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0,
                }} />
                {stepLabel}
              </div>
            )}

            {/* Upload button */}
            {!isBusy && (
              <button
                onClick={handleUpload}
                disabled={!file}
                style={{
                  width: '100%', padding: '13px', borderRadius: '8px', border: 'none',
                  backgroundColor: file ? '#0344D8' : '#e5e7eb',
                  color: file ? '#fff' : '#9ca3af',
                  fontSize: '14px', fontWeight: '700',
                  cursor: file ? 'pointer' : 'not-allowed',
                  transition: 'all 0.2s',
                }}
              >
                Upload & Proses Data
              </button>
            )}

            {/* Error */}
            {step === 'error' && (
              <div style={{
                marginTop: '16px', padding: '14px', borderRadius: '8px',
                backgroundColor: '#fef2f2', border: '1px solid #fecaca',
                color: '#dc2626', fontSize: '13px',
              }}>
                ❌ {errorMsg}
                <div style={{ marginTop: '10px' }}>
                  <button onClick={resetForm} style={{
                    fontSize: '12px', color: '#dc2626', background: 'none',
                    border: '1px solid #fecaca', borderRadius: '6px',
                    padding: '4px 12px', cursor: 'pointer',
                  }}>
                    Coba Lagi
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Success */}
        {step === 'success' && summary && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{
              padding: '24px', backgroundColor: '#f0fdf4',
              border: '1px solid #bbf7d0', borderRadius: '12px',
            }}>
              <div style={{ fontSize: '16px', fontWeight: '700', color: '#166534', marginBottom: '16px' }}>
                ✅ Upload berhasil
              </div>

              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '6px', fontWeight: '600' }}>
                  TANGGAL DIPROSES
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {summary.dates_processed.map(d => (
                    <span key={d} style={{
                      padding: '4px 12px', backgroundColor: '#dcfce7',
                      borderRadius: '99px', fontSize: '12px',
                      color: '#166534', fontWeight: '600',
                    }}>
                      {new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  ))}
                </div>
              </div>

              <div style={{
                padding: '12px 16px', backgroundColor: '#fff',
                border: '1px solid #bbf7d0', borderRadius: '8px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontSize: '13px', color: '#374151' }}>Total transaksi</span>
                <span style={{ fontSize: '18px', fontWeight: '800', color: '#111827' }}>
                  {summary.total_rows.toLocaleString('id')}
                </span>
              </div>
            </div>

            {summary.warnings && summary.warnings.length > 0 && (
              <div style={{
                padding: '14px', backgroundColor: '#fffbeb',
                border: '1px solid #fde68a', borderRadius: '8px',
              }}>
                <div style={{ fontSize: '12px', color: '#854d0e', fontWeight: '600', marginBottom: '8px' }}>
                  ⚠️ Peringatan
                </div>
                {summary.warnings.slice(0, 5).map((w, i) => (
                  <div key={i} style={{ fontSize: '12px', color: '#854d0e', marginBottom: '4px' }}>• {w}</div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => router.push('/analytics')}
                style={{
                  flex: 1, padding: '12px', borderRadius: '8px', border: 'none',
                  backgroundColor: '#0344D8', color: '#fff',
                  fontSize: '13px', fontWeight: '700', cursor: 'pointer',
                }}
              >
                Lihat Morning Brief
              </button>
              <button
                onClick={resetForm}
                style={{
                  flex: 1, padding: '12px', borderRadius: '8px',
                  border: '1px solid #e5e7eb', backgroundColor: '#fff',
                  color: '#374151', fontSize: '13px', cursor: 'pointer',
                }}
              >
                Upload Lagi
              </button>
            </div>
          </div>
        )}

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </Layout>
  )
}
