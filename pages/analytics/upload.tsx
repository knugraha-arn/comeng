import { useState, useRef } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Layout from '../../components/Layout'
import { createBrowserClient } from '@supabase/ssr'

interface UploadSummary {
  dates_processed: string[]
  master_rows: number
  nobu_rows: number
  esa_rows: number
  match_rates: Record<string, number>
  avg_match_rate: number
  warnings?: string[]
}

export default function UploadCenter() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [masterFile, setMasterFile] = useState<File | null>(null)
  const [nobuFile, setNobuFile] = useState<File | null>(null)
  const [esaFile, setEsaFile] = useState<File | null>(null)
  const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle')
  const [summary, setSummary] = useState<UploadSummary | null>(null)
  const [errorMsg, setErrorMsg] = useState<string>('')

  const masterRef = useRef<HTMLInputElement>(null)
  const nobuRef = useRef<HTMLInputElement>(null)
  const esaRef = useRef<HTMLInputElement>(null)

  const allSelected = masterFile && nobuFile && esaFile
  const isUploading = status === 'uploading'

  async function handleUpload() {
    if (!allSelected) return

    setStatus('uploading')
    setErrorMsg('')
    setSummary(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }

      const form = new FormData()
      form.append('master', masterFile)
      form.append('nobu', nobuFile)
      form.append('esa', esaFile)

      const res = await fetch('/api/analytics/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: form,
      })

      const data = await res.json()

      if (!res.ok) {
        setStatus('error')
        setErrorMsg(data.error ?? 'Upload gagal')
        return
      }

      setStatus('success')
      setSummary(data.summary)
    } catch (err) {
      setStatus('error')
      setErrorMsg('Terjadi kesalahan koneksi')
    }
  }

  function resetForm() {
    setMasterFile(null)
    setNobuFile(null)
    setEsaFile(null)
    setStatus('idle')
    setSummary(null)
    setErrorMsg('')
    if (masterRef.current) masterRef.current.value = ''
    if (nobuRef.current) nobuRef.current.value = ''
    if (esaRef.current) esaRef.current.value = ''
  }

  function FileDropZone({
    label,
    file,
    inputRef,
    onChange,
  }: {
    label: string
    file: File | null
    inputRef: React.RefObject<HTMLInputElement>
    onChange: (f: File) => void
  }) {
    return (
      <div
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${file ? '#22c55e' : '#333'}`,
          borderRadius: '8px',
          padding: '20px',
          cursor: 'pointer',
          backgroundColor: file ? '#052e16' : '#111',
          transition: 'all 0.2s',
          textAlign: 'center',
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          style={{ display: 'none' }}
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) onChange(f)
          }}
        />
        <div style={{ fontSize: '24px', marginBottom: '8px' }}>
          {file ? '✅' : '📂'}
        </div>
        <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>
          {label}
        </div>
        <div style={{
          fontSize: '13px',
          fontWeight: '600',
          color: file ? '#86efac' : '#555',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {file ? file.name : 'Klik untuk pilih file .xlsx'}
        </div>
        {file && (
          <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
            {(file.size / 1024 / 1024).toFixed(1)} MB
          </div>
        )}
      </div>
    )
  }

  return (
    <Layout>
      <Head><title>Upload Data — AMARIS</title></Head>

      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '32px 16px' }}>

        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: '700', color: '#fff', marginBottom: '6px' }}>
            Upload Data Harian
          </h1>
          <p style={{ fontSize: '13px', color: '#666' }}>
            Upload tiga file XLSX sekaligus. Data akan diproses otomatis.
          </p>
        </div>

        {status !== 'success' && (
          <>
            {/* File selectors */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
              <FileDropZone
                label="Master Agen"
                file={masterFile}
                inputRef={masterRef}
                onChange={setMasterFile}
              />
              <FileDropZone
                label="Transaksi NOBU"
                file={nobuFile}
                inputRef={nobuRef}
                onChange={setNobuFile}
              />
              <FileDropZone
                label="ESA NOBU"
                file={esaFile}
                inputRef={esaRef}
                onChange={setEsaFile}
              />
            </div>

            {/* Upload button */}
            <button
              onClick={handleUpload}
              disabled={!allSelected || isUploading}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: allSelected && !isUploading ? '#D1EA2C' : '#222',
                color: allSelected && !isUploading ? '#000' : '#444',
                fontSize: '14px',
                fontWeight: '700',
                cursor: allSelected && !isUploading ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s',
              }}
            >
              {isUploading ? 'Memproses...' : 'Upload & Proses Data'}
            </button>

            {/* Error */}
            {status === 'error' && (
              <div style={{
                marginTop: '16px',
                padding: '14px',
                backgroundColor: '#1a0a0a',
                border: '1px solid #7f1d1d',
                borderRadius: '8px',
                color: '#fca5a5',
                fontSize: '13px',
              }}>
                ❌ {errorMsg}
              </div>
            )}
          </>
        )}

        {/* Success state */}
        {status === 'success' && summary && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            <div style={{
              padding: '20px',
              backgroundColor: '#052e16',
              border: '1px solid #166534',
              borderRadius: '8px',
            }}>
              <div style={{ fontSize: '16px', fontWeight: '700', color: '#86efac', marginBottom: '16px' }}>
                ✅ Upload berhasil
              </div>

              {/* Dates */}
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', color: '#666', marginBottom: '4px' }}>TANGGAL DIPROSES</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {summary.dates_processed.map(d => (
                    <span key={d} style={{
                      padding: '3px 10px',
                      backgroundColor: '#14532d',
                      borderRadius: '99px',
                      fontSize: '12px',
                      color: '#86efac',
                    }}>
                      {d}
                    </span>
                  ))}
                </div>
              </div>

              {/* Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                {[
                  { label: 'Master Agen', value: summary.master_rows.toLocaleString('id') },
                  { label: 'Transaksi NOBU', value: summary.nobu_rows.toLocaleString('id') },
                  { label: 'Data ESA', value: summary.esa_rows.toLocaleString('id') },
                ].map(s => (
                  <div key={s.label} style={{
                    padding: '10px',
                    backgroundColor: '#052e16',
                    border: '1px solid #166534',
                    borderRadius: '6px',
                    textAlign: 'center',
                  }}>
                    <div style={{ fontSize: '18px', fontWeight: '700', color: '#fff' }}>{s.value}</div>
                    <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Match rates */}
              <div>
                <div style={{ fontSize: '11px', color: '#666', marginBottom: '6px' }}>REFNUM MATCH RATE</div>
                {Object.entries(summary.match_rates).map(([date, rate]) => (
                  <div key={date} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '6px 0',
                    borderBottom: '1px solid #14532d',
                  }}>
                    <span style={{ fontSize: '12px', color: '#aaa' }}>{date}</span>
                    <span style={{
                      fontSize: '13px',
                      fontWeight: '700',
                      color: rate >= 95 ? '#86efac' : rate >= 80 ? '#fde68a' : '#fca5a5',
                    }}>
                      {rate.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Warnings */}
            {summary.warnings && summary.warnings.length > 0 && (
              <div style={{
                padding: '14px',
                backgroundColor: '#1a1200',
                border: '1px solid #854d0e',
                borderRadius: '8px',
              }}>
                <div style={{ fontSize: '12px', color: '#fde68a', fontWeight: '600', marginBottom: '8px' }}>
                  ⚠️ Peringatan
                </div>
                {summary.warnings.map((w, i) => (
                  <div key={i} style={{ fontSize: '12px', color: '#fde68a', marginBottom: '4px' }}>
                    • {w}
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => router.push('/analytics')}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#D1EA2C',
                  color: '#000',
                  fontSize: '13px',
                  fontWeight: '700',
                  cursor: 'pointer',
                }}
              >
                Lihat Morning Brief
              </button>
              <button
                onClick={resetForm}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid #333',
                  backgroundColor: 'transparent',
                  color: '#aaa',
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Upload Lagi
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
