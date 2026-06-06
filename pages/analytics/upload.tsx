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

type UploadStep =
  | 'idle'
  | 'uploading_storage'   // upload ke Supabase Storage
  | 'processing'          // API route proses data
  | 'success'
  | 'error'

export default function UploadCenter() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [masterFile, setMasterFile] = useState<File | null>(null)
  const [nobuFile, setNobuFile] = useState<File | null>(null)
  const [esaFile, setEsaFile] = useState<File | null>(null)
  const [step, setStep] = useState<UploadStep>('idle')
  const [stepLabel, setStepLabel] = useState('')
  const [summary, setSummary] = useState<UploadSummary | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const masterRef = useRef<HTMLInputElement>(null)
  const nobuRef = useRef<HTMLInputElement>(null)
  const esaRef = useRef<HTMLInputElement>(null)

  const allSelected = masterFile && nobuFile && esaFile
  const isBusy = step === 'uploading_storage' || step === 'processing'

  // Upload satu file ke Supabase Storage, return path
  async function uploadToStorage(file: File, name: string): Promise<string> {
    const ts = Date.now()
    const path = `analytics-uploads/${ts}_${name}`
    const { error } = await supabase.storage
      .from('amaris-uploads')
      .upload(path, file, { upsert: true })
    if (error) throw new Error(`Storage upload gagal (${name}): ${error.message}`)
    return path
  }

  async function handleUpload() {
    if (!allSelected) return

    setStep('uploading_storage')
    setStepLabel('Mengupload file ke storage...')
    setErrorMsg('')
    setSummary(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }

      // ── 1. Upload semua file ke Supabase Storage ──────────────────────────
      setStepLabel('Mengupload Master Agen...')
      const masterPath = await uploadToStorage(masterFile, 'master.xlsx')

      setStepLabel('Mengupload data NOBU...')
      const nobuPath = await uploadToStorage(nobuFile, 'nobu.xlsx')

      setStepLabel('Mengupload data ESA...')
      const esaPath = await uploadToStorage(esaFile, 'esa.xlsx')

      // ── 2. Trigger API route dengan path saja ─────────────────────────────
      setStep('processing')
      setStepLabel('Memproses data...')

      const res = await fetch('/api/analytics/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ masterPath, nobuPath, esaPath }),
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
    setMasterFile(null)
    setNobuFile(null)
    setEsaFile(null)
    setStep('idle')
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
        onClick={() => !isBusy && inputRef.current?.click()}
        style={{
          border: `2px dashed ${file ? '#22c55e' : '#333'}`,
          borderRadius: '8px',
          padding: '20px',
          cursor: isBusy ? 'not-allowed' : 'pointer',
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
          <h1 style={{ fontSize: '20px', fontWeight: '700', color: '#1A1F2E', marginBottom: '6px' }}>
            Upload Data Harian
          </h1>
          <p style={{ fontSize: '13px', color: '#888' }}>
            Upload tiga file XLSX sekaligus. Data akan diproses otomatis.
          </p>
        </div>

        {step !== 'success' && (
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

            {/* Progress */}
            {isBusy && (
              <div style={{
                padding: '14px',
                backgroundColor: '#f0f9ff',
                border: '1px solid #bae6fd',
                borderRadius: '8px',
                marginBottom: '16px',
                fontSize: '13px',
                color: '#0369a1',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}>
                <div style={{
                  width: '16px', height: '16px', border: '2px solid #0369a1',
                  borderTopColor: 'transparent', borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite', flexShrink: 0,
                }} />
                {stepLabel}
              </div>
            )}

            {/* Upload button */}
            <button
              onClick={handleUpload}
              disabled={!allSelected || isBusy}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: allSelected && !isBusy ? '#0344D8' : '#e5e5e5',
                color: allSelected && !isBusy ? '#fff' : '#aaa',
                fontSize: '14px',
                fontWeight: '700',
                cursor: allSelected && !isBusy ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s',
              }}
            >
              {isBusy ? stepLabel : 'Upload & Proses Data'}
            </button>

            {/* Error */}
            {step === 'error' && (
              <div style={{
                marginTop: '16px',
                padding: '14px',
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                color: '#dc2626',
                fontSize: '13px',
              }}>
                ❌ {errorMsg}
              </div>
            )}
          </>
        )}

        {/* Success state */}
        {step === 'success' && summary && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            <div style={{
              padding: '20px',
              backgroundColor: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: '8px',
            }}>
              <div style={{ fontSize: '16px', fontWeight: '700', color: '#166534', marginBottom: '16px' }}>
                ✅ Upload berhasil
              </div>

              {/* Dates */}
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', color: '#888', marginBottom: '6px' }}>TANGGAL DIPROSES</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {summary.dates_processed.map(d => (
                    <span key={d} style={{
                      padding: '3px 10px',
                      backgroundColor: '#dcfce7',
                      borderRadius: '99px',
                      fontSize: '12px',
                      color: '#166534',
                      fontWeight: '600',
                    }}>
                      {d}
                    </span>
                  ))}
                </div>
              </div>

              {/* Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                {[
                  { label: 'Master Agen', value: summary.master_rows.toLocaleString('id') },
                  { label: 'Transaksi NOBU', value: summary.nobu_rows.toLocaleString('id') },
                  { label: 'Data ESA', value: summary.esa_rows.toLocaleString('id') },
                ].map(s => (
                  <div key={s.label} style={{
                    padding: '10px',
                    backgroundColor: '#fff',
                    border: '1px solid #bbf7d0',
                    borderRadius: '6px',
                    textAlign: 'center',
                  }}>
                    <div style={{ fontSize: '18px', fontWeight: '700', color: '#1A1F2E' }}>{s.value}</div>
                    <div style={{ fontSize: '10px', color: '#888', marginTop: '2px' }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Match rates */}
              <div>
                <div style={{ fontSize: '11px', color: '#888', marginBottom: '6px' }}>REFNUM MATCH RATE</div>
                {Object.entries(summary.match_rates).map(([date, rate]) => (
                  <div key={date} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '6px 0',
                    borderBottom: '1px solid #dcfce7',
                  }}>
                    <span style={{ fontSize: '12px', color: '#555' }}>{date}</span>
                    <span style={{
                      fontSize: '13px',
                      fontWeight: '700',
                      color: rate >= 95 ? '#166534' : rate >= 80 ? '#854d0e' : '#dc2626',
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
                backgroundColor: '#fffbeb',
                border: '1px solid #fde68a',
                borderRadius: '8px',
              }}>
                <div style={{ fontSize: '12px', color: '#854d0e', fontWeight: '600', marginBottom: '8px' }}>
                  ⚠️ Peringatan
                </div>
                {summary.warnings.map((w, i) => (
                  <div key={i} style={{ fontSize: '12px', color: '#854d0e', marginBottom: '4px' }}>• {w}</div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: '12px' }}>
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
                  border: '1px solid #e5e5e5', backgroundColor: 'transparent',
                  color: '#888', fontSize: '13px', cursor: 'pointer',
                }}
              >
                Upload Lagi
              </button>
            </div>
          </div>
        )}

        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    </Layout>
  )
}
