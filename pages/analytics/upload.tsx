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

interface ProgressStep {
  label: string
  status: 'waiting' | 'active' | 'done' | 'error'
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
  const [status, setStatus] = useState<'idle' | 'busy' | 'success' | 'error'>('idle')
  const [summary, setSummary] = useState<UploadSummary | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [steps, setSteps] = useState<ProgressStep[]>([])

  const masterRef = useRef<HTMLInputElement>(null)
  const nobuRef = useRef<HTMLInputElement>(null)
  const esaRef = useRef<HTMLInputElement>(null)

  const allSelected = masterFile && nobuFile && esaFile
  const isBusy = status === 'busy'

  function setStep(index: number, stepStatus: ProgressStep['status']) {
    setSteps(prev => prev.map((s, i) => i === index ? { ...s, status: stepStatus } : s))
  }

  async function uploadToStorage(
    file: File,
    name: string,
    stepIndex: number
  ): Promise<string> {
    setStep(stepIndex, 'active')
    const ts = Date.now()
    const path = `analytics-uploads/${ts}_${name}`
    const { error } = await supabase.storage
      .from('amaris-uploads')
      .upload(path, file, { upsert: true })
    if (error) {
      setStep(stepIndex, 'error')
      throw new Error(`Storage upload gagal (${name}): ${error.message}`)
    }
    setStep(stepIndex, 'done')
    return path
  }

  async function handleUpload() {
    if (!allSelected) return

    const initialSteps: ProgressStep[] = [
      { label: 'Upload Master Agen', status: 'waiting' },
      { label: 'Upload Transaksi NOBU', status: 'waiting' },
      { label: 'Upload Data ESA', status: 'waiting' },
      { label: 'Memproses & menyimpan data', status: 'waiting' },
    ]
    setSteps(initialSteps)
    setStatus('busy')
    setErrorMsg('')
    setSummary(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }

      const masterPath = await uploadToStorage(masterFile, 'master.xlsx', 0)
      const nobuPath   = await uploadToStorage(nobuFile,   'nobu.xlsx',   1)
      const esaPath    = await uploadToStorage(esaFile,    'esa.xlsx',    2)

      setStep(3, 'active')
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
        setStep(3, 'error')
        setStatus('error')
        setErrorMsg(data.error ?? 'Proses data gagal')
        return
      }

      setStep(3, 'done')
      setStatus('success')
      setSummary(data.summary)

    } catch (err) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Terjadi kesalahan')
    }
  }

  function resetForm() {
    setMasterFile(null)
    setNobuFile(null)
    setEsaFile(null)
    setStatus('idle')
    setSummary(null)
    setErrorMsg('')
    setSteps([])
    if (masterRef.current) masterRef.current.value = ''
    if (nobuRef.current) nobuRef.current.value = ''
    if (esaRef.current) esaRef.current.value = ''
  }

  function FileDropZone({
    label, file, inputRef, onChange,
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
          border: `2px dashed ${file ? '#22c55e' : '#d1d5db'}`,
          borderRadius: '8px',
          padding: '16px 20px',
          cursor: isBusy ? 'not-allowed' : 'pointer',
          backgroundColor: file ? '#f0fdf4' : '#fafafa',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          transition: 'all 0.2s',
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) onChange(f) }}
        />
        <span style={{ fontSize: '20px' }}>{file ? '✅' : '📂'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>{label}</div>
          <div style={{
            fontSize: '13px', fontWeight: '600',
            color: file ? '#166534' : '#aaa',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {file ? file.name : 'Klik untuk pilih file .xlsx'}
          </div>
        </div>
        {file && (
          <span style={{ fontSize: '11px', color: '#888', flexShrink: 0 }}>
            {(file.size / 1024 / 1024).toFixed(1)} MB
          </span>
        )}
      </div>
    )
  }

  function StepIndicator({ step, index }: { step: ProgressStep, index: number }) {
    const colors = {
      waiting: { bg: '#f3f4f6', border: '#d1d5db', text: '#9ca3af', icon: String(index + 1) },
      active:  { bg: '#eff6ff', border: '#3b82f6', text: '#1d4ed8', icon: '⟳' },
      done:    { bg: '#f0fdf4', border: '#22c55e', text: '#166534', icon: '✓' },
      error:   { bg: '#fef2f2', border: '#ef4444', text: '#dc2626', icon: '✕' },
    }
    const c = colors[step.status]

    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '10px 14px', borderRadius: '8px',
        backgroundColor: c.bg, border: `1px solid ${c.border}`,
        transition: 'all 0.3s',
      }}>
        <div style={{
          width: '24px', height: '24px', borderRadius: '50%',
          backgroundColor: c.border, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: step.status === 'active' ? '14px' : '12px',
          fontWeight: '700', flexShrink: 0,
          animation: step.status === 'active' ? 'spin 1s linear infinite' : 'none',
        }}>
          {c.icon}
        </div>
        <span style={{ fontSize: '13px', color: c.text, fontWeight: step.status === 'active' ? '600' : '400' }}>
          {step.label}
        </span>
        {step.status === 'active' && (
          <span style={{ fontSize: '11px', color: '#3b82f6', marginLeft: 'auto' }}>
            Sedang berjalan...
          </span>
        )}
        {step.status === 'done' && (
          <span style={{ fontSize: '11px', color: '#22c55e', marginLeft: 'auto' }}>Selesai</span>
        )}
      </div>
    )
  }

  // Overall progress percentage
  const doneCount = steps.filter(s => s.status === 'done').length
  const progressPct = steps.length > 0 ? Math.round((doneCount / steps.length) * 100) : 0

  return (
    <Layout>
      <Head><title>Upload Data — AMARIS</title></Head>

      <div style={{ maxWidth: '560px', margin: '0 auto', padding: '32px 16px' }}>

        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: '700', color: '#1A1F2E', marginBottom: '4px' }}>
            Upload Data Harian
          </h1>
          <p style={{ fontSize: '13px', color: '#888' }}>
            Upload tiga file XLSX sekaligus. Data akan diproses otomatis.
          </p>
        </div>

        {status !== 'success' && (
          <>
            {/* File selectors */}
            {!isBusy && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                <FileDropZone label="Master Agen"     file={masterFile} inputRef={masterRef} onChange={setMasterFile} />
                <FileDropZone label="Transaksi NOBU"  file={nobuFile}   inputRef={nobuRef}   onChange={setNobuFile} />
                <FileDropZone label="ESA NOBU"        file={esaFile}    inputRef={esaRef}    onChange={setEsaFile} />
              </div>
            )}

            {/* Progress steps */}
            {steps.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                {/* Progress bar */}
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '12px', color: '#555' }}>Progress</span>
                    <span style={{ fontSize: '12px', fontWeight: '700', color: '#1A1F2E' }}>{progressPct}%</span>
                  </div>
                  <div style={{ height: '6px', backgroundColor: '#e5e7eb', borderRadius: '99px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${progressPct}%`,
                      backgroundColor: progressPct === 100 ? '#22c55e' : '#0344D8',
                      borderRadius: '99px',
                      transition: 'width 0.4s ease',
                    }} />
                  </div>
                </div>

                {/* Step list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {steps.map((step, i) => <StepIndicator key={i} step={step} index={i} />)}
                </div>
              </div>
            )}

            {/* Upload button */}
            {!isBusy && (
              <button
                onClick={handleUpload}
                disabled={!allSelected}
                style={{
                  width: '100%', padding: '13px', borderRadius: '8px', border: 'none',
                  backgroundColor: allSelected ? '#0344D8' : '#e5e7eb',
                  color: allSelected ? '#fff' : '#aaa',
                  fontSize: '14px', fontWeight: '700',
                  cursor: allSelected ? 'pointer' : 'not-allowed',
                  transition: 'all 0.2s',
                }}
              >
                Upload & Proses Data
              </button>
            )}

            {/* Error */}
            {status === 'error' && (
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
        {status === 'success' && summary && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{
              padding: '20px', backgroundColor: '#f0fdf4',
              border: '1px solid #bbf7d0', borderRadius: '8px',
            }}>
              <div style={{ fontSize: '16px', fontWeight: '700', color: '#166534', marginBottom: '16px' }}>
                ✅ Upload berhasil
              </div>

              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', color: '#888', marginBottom: '6px' }}>TANGGAL DIPROSES</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {summary.dates_processed.map(d => (
                    <span key={d} style={{
                      padding: '3px 10px', backgroundColor: '#dcfce7',
                      borderRadius: '99px', fontSize: '12px', color: '#166534', fontWeight: '600',
                    }}>{d}</span>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                {[
                  { label: 'Master Agen',    value: summary.master_rows.toLocaleString('id') },
                  { label: 'Transaksi NOBU', value: summary.nobu_rows.toLocaleString('id') },
                  { label: 'Data ESA',       value: summary.esa_rows.toLocaleString('id') },
                ].map(s => (
                  <div key={s.label} style={{
                    padding: '10px', backgroundColor: '#fff',
                    border: '1px solid #bbf7d0', borderRadius: '6px', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: '18px', fontWeight: '700', color: '#1A1F2E' }}>{s.value}</div>
                    <div style={{ fontSize: '10px', color: '#888', marginTop: '2px' }}>{s.label}</div>
                  </div>
                ))}
              </div>

              <div>
                <div style={{ fontSize: '11px', color: '#888', marginBottom: '6px' }}>REFNUM MATCH RATE</div>
                {Object.entries(summary.match_rates).map(([date, rate]) => (
                  <div key={date} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '6px 0', borderBottom: '1px solid #dcfce7',
                  }}>
                    <span style={{ fontSize: '12px', color: '#555' }}>{date}</span>
                    <span style={{
                      fontSize: '13px', fontWeight: '700',
                      color: rate >= 95 ? '#166534' : rate >= 80 ? '#854d0e' : '#dc2626',
                    }}>{rate.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>

            {summary.warnings && summary.warnings.length > 0 && (
              <div style={{
                padding: '14px', backgroundColor: '#fffbeb',
                border: '1px solid #fde68a', borderRadius: '8px',
              }}>
                <div style={{ fontSize: '12px', color: '#854d0e', fontWeight: '600', marginBottom: '8px' }}>⚠️ Peringatan</div>
                {summary.warnings.map((w, i) => (
                  <div key={i} style={{ fontSize: '12px', color: '#854d0e', marginBottom: '4px' }}>• {w}</div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => router.push('/analytics')} style={{
                flex: 1, padding: '12px', borderRadius: '8px', border: 'none',
                backgroundColor: '#0344D8', color: '#fff',
                fontSize: '13px', fontWeight: '700', cursor: 'pointer',
              }}>
                Lihat Morning Brief
              </button>
              <button onClick={resetForm} style={{
                flex: 1, padding: '12px', borderRadius: '8px',
                border: '1px solid #e5e5e5', backgroundColor: 'transparent',
                color: '#888', fontSize: '13px', cursor: 'pointer',
              }}>
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
