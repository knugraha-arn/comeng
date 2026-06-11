import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Layout from '../../components/Layout'
import { createBrowserClient } from '@supabase/ssr'
import * as XLSX from 'xlsx'

interface TransactionRow {
  transaction_date:      string
  datetime_tran:         string
  refnum:                string
  trntype:               string | null
  jenis_transaksi:       string | null
  tipe_penggunaan_kartu: string | null
  amount:                number
  sharing_fee:           number
  qris_amount:           number
  serial_number:         string
  merchant_name:         string | null
  alamat_struk:          string | null
  brand:                 string | null
  tipe_mesin:            string | null
  source_app:            string | null
  terminal_data_source:  string | null
  mitra:                 string | null
  pic:                   string | null
  from_account:          string | null
  to_account:            string | null
  private_data:          string | null
  upload_session_id?:    string | null
}

interface UploadSummary {
  dates_processed: string[]
  total_rows: number
  warnings?: string[]
}

// Kolom wajib — semua lowercase untuk matching case-insensitive
const REQUIRED_COLUMNS = ['refnum', 'datetime_tran', 'serial_number', 'trntype', 'sharing_fee', 'mitra']
const CHUNK_SIZE = 500

type Stage = 'idle' | 'reading' | 'parsing' | 'inserting' | 'computing' | 'success' | 'error'

function str(val: unknown): string | null {
  if (val === null || val === undefined || val === '') return null
  if (val instanceof Date) return val.toISOString()
  return String(val).trim() || null
}

function num(val: unknown): number {
  const n = Number(val)
  return isNaN(n) ? 0 : n
}

function toISODatetime(val: unknown): string | null {
  if (val === null || val === undefined || val === '') return null
  if (val instanceof Date && !isNaN(val.getTime())) return val.toISOString()
  if (typeof val === 'number' && val > 1000) {
    return new Date(Date.UTC(1899, 11, 30) + val * 86400000).toISOString()
  }
  if (typeof val === 'string') {
    const d = new Date(val.trim())
    if (!isNaN(d.getTime())) return d.toISOString()
  }
  return null
}

// Normalize row keys ke lowercase
function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {}
  for (const key of Object.keys(row)) {
    normalized[key.toLowerCase().trim()] = row[key]
  }
  return normalized
}

export default function UploadCenter() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [file, setFile] = useState<File | null>(null)
  const [stage, setStage] = useState<Stage>('idle')
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [summary, setSummary] = useState<UploadSummary | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const isBusy = !['idle', 'success', 'error'].includes(stage)

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped && (dropped.name.endsWith('.xlsx') || dropped.name.endsWith('.csv'))) {
      setFile(dropped)
    } else {
      setErrorMsg('Hanya file .xlsx atau .csv yang diterima')
      setStage('error')
    }
  }, [])

  async function parseFile(f: File): Promise<{ rows: TransactionRow[], dates: string[], errors: string[] }> {
    const errors: string[] = []
    const rows: TransactionRow[] = []
    const dateSet = new Set<string>()

    const buffer = await f.arrayBuffer()
    const isCSV = f.name.endsWith('.csv')

    let raw: Record<string, unknown>[]

    if (isCSV) {
      const text = new TextDecoder().decode(buffer)
      const wb = XLSX.read(text, { type: 'string', cellDates: false })
      raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null })
    } else {
      const wb = XLSX.read(buffer, { type: 'array', cellDates: false })
      raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null })
    }

    if (raw.length === 0) {
      errors.push('File tidak mengandung data')
      return { rows, dates: [], errors }
    }

    // Normalize semua header ke lowercase
    const normalizedRaw = raw.map(normalizeRow)

    // Validasi kolom wajib (semua lowercase)
    const headers = Object.keys(normalizedRaw[0])
    const missing = REQUIRED_COLUMNS.filter(c => !headers.includes(c))
    if (missing.length > 0) {
      errors.push(`Kolom wajib tidak ditemukan: ${missing.join(', ')}`)
      return { rows, dates: [], errors }
    }

    if (normalizedRaw.length < 10) {
      errors.push(`File hanya berisi ${normalizedRaw.length} baris — kemungkinan file salah`)
      return { rows, dates: [], errors }
    }

    for (const row of normalizedRaw) {
      const refnum = str(row['refnum'])
      const serial_number = str(row['serial_number'])
      if (!refnum || !serial_number) continue

      const datetime_tran = toISODatetime(row['datetime_tran'])
      if (!datetime_tran) continue

      const transaction_date = datetime_tran.split('T')[0]
      dateSet.add(transaction_date)

      rows.push({
        transaction_date,
        datetime_tran,
        refnum,
        trntype:               str(row['trntype']),
        jenis_transaksi:       str(row['jenistransaksi']) ?? str(row['jenis_transaksi']),
        tipe_penggunaan_kartu: str(row['tipe_penggunaan_kartu']),
        amount:                num(row['amount']),
        sharing_fee:           num(row['sharing_fee']),
        qris_amount:           0,
        serial_number:         serial_number.toUpperCase().trim(),
        merchant_name:         str(row['merchant_name']),
        alamat_struk:          str(row['alamat_struk']),
        brand:                 str(row['brand']),
        tipe_mesin:            str(row['tipe_mesin']),
        source_app:            str(row['source_app']),
        terminal_data_source:  str(row['terminal_data_source']),
        mitra:                 str(row['mitra']),
        pic:                   str(row['pic'])?.toUpperCase().trim() ?? null,
        from_account:          str(row['from_account']),
        to_account:            str(row['to_account']),
        private_data:          str(row['private_data']),
      })
    }

    // Deduplicate
    const seen = new Set<string>()
    const uniqueRows = rows.filter(r => {
      const key = `${r.refnum}__${r.transaction_date}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    return { rows: uniqueRows, dates: Array.from(dateSet).sort(), errors }
  }

  async function handleUpload() {
    if (!file) return

    setErrorMsg('')
    setSummary(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }

      setStage('reading')
      setProgress(5)
      setProgressLabel('Membaca file...')
      await new Promise(r => setTimeout(r, 100))

      setStage('parsing')
      setProgress(15)
      setProgressLabel('Mengurai data...')
      const { rows, dates, errors } = await parseFile(file)

      if (rows.length === 0) {
        setStage('error')
        setErrorMsg(errors[0] ?? 'File tidak menghasilkan data valid')
        return
      }

      setProgress(20)
      setProgressLabel(`Mempersiapkan ${dates.length} tanggal...`)

      const sessionIds: Record<string, string> = {}
      for (const date of dates) {
        const rowCount = rows.filter(r => r.transaction_date === date).length
        const { data: existing } = await supabase
          .from('am_upload_sessions')
          .select('id')
          .eq('upload_date', date)
          .single()

        if (existing) {
          sessionIds[date] = existing.id
          await supabase.from('am_upload_sessions').update({
            status: 'processing',
            row_count: rowCount,
            uploaded_by: session.user.id,
          }).eq('id', existing.id)
        } else {
          const { data: newSession } = await supabase
            .from('am_upload_sessions')
            .insert({
              upload_date: date,
              uploaded_by: session.user.id,
              status: 'processing',
              row_count: rowCount,
            })
            .select('id')
            .single()
          if (newSession) sessionIds[date] = newSession.id
        }
      }

      setStage('inserting')
      const totalChunks = Math.ceil(rows.length / CHUNK_SIZE)
      let chunksInserted = 0

      for (const date of dates) {
        const dateRows = rows
          .filter(r => r.transaction_date === date)
          .map(r => ({ ...r, upload_session_id: sessionIds[date] ?? null }))

        for (let i = 0; i < dateRows.length; i += CHUNK_SIZE) {
          const batch = dateRows.slice(i, i + CHUNK_SIZE)
          const { error } = await supabase
            .from('am_transactions')
            .upsert(batch, { onConflict: 'refnum,transaction_date' })

          if (error) throw new Error(`Insert gagal: ${error.message}`)

          chunksInserted++
          const pct = 20 + Math.round((chunksInserted / totalChunks) * 65)
          setProgress(pct)
          setProgressLabel(
            `Menyimpan data... ${Math.min(chunksInserted * CHUNK_SIZE, rows.length).toLocaleString('id')} / ${rows.length.toLocaleString('id')} baris`
          )
        }
      }

      for (const date of dates) {
        if (sessionIds[date]) {
          await supabase.from('am_upload_sessions').update({
            status: 'completed',
            completed_at: new Date().toISOString(),
          }).eq('id', sessionIds[date])
        }
      }

      setStage('computing')
      setProgress(90)
      setProgressLabel('Menghitung metrics...')

      // Trigger compute_agent_metrics langsung via RPC
      try { await supabase.rpc('compute_agent_metrics') } catch {}

      // Purge data lama
      try { await supabase.rpc('am_purge_old_data') } catch {}

      setProgress(100)
      setStage('success')
      setSummary({
        dates_processed: dates,
        total_rows: rows.length,
        warnings: errors.length > 0 ? errors : undefined,
      })

    } catch (err) {
      setStage('error')
      setErrorMsg(err instanceof Error ? err.message : 'Terjadi kesalahan')
    }
  }

  function resetForm() {
    setFile(null)
    setStage('idle')
    setSummary(null)
    setErrorMsg('')
    setProgress(0)
    setProgressLabel('')
    if (inputRef.current) inputRef.current.value = ''
  }

  const stageLabels: Record<Stage, string> = {
    idle:      '',
    reading:   'Membaca file',
    parsing:   'Mengurai data',
    inserting: 'Menyimpan ke database',
    computing: 'Menghitung metrics',
    success:   'Selesai',
    error:     'Error',
  }

  return (
    <Layout>
      <Head><title>Upload Data — AMARIS</title></Head>

      <div style={{ maxWidth: '520px', margin: '0 auto', padding: '32px 24px' }}>

        <div style={{ marginBottom: '28px' }}>
          <div style={{ fontSize: '11px', fontWeight: '600', color: '#9ca3af', letterSpacing: '0.1em', marginBottom: '4px' }}>
            UPLOAD DATA
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#111827', margin: 0, letterSpacing: '-0.02em' }}>
            Upload Data Harian
          </h1>
          <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '6px' }}>
            Upload 1 file per hari. Format: <strong>.xlsx</strong> atau <strong>.csv</strong>
          </p>
        </div>

        {stage !== 'success' && (
          <>
            {!isBusy && (
              <div
                onClick={() => inputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
                style={{
                  border: `2px dashed ${isDragging ? '#0344D8' : file ? '#22c55e' : '#d1d5db'}`,
                  borderRadius: '12px',
                  padding: '48px 24px',
                  cursor: 'pointer',
                  backgroundColor: isDragging ? '#eff6ff' : file ? '#f0fdf4' : '#fafafa',
                  textAlign: 'center',
                  marginBottom: '20px',
                  transition: 'all 0.2s',
                }}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx,.csv"
                  style={{ display: 'none' }}
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) { setFile(f); setStage('idle'); setErrorMsg('') }
                  }}
                />
                <div style={{ fontSize: '36px', marginBottom: '12px' }}>
                  {isDragging ? '📥' : file ? '✅' : '📂'}
                </div>
                <div style={{ fontSize: '14px', fontWeight: '600', color: file ? '#166534' : '#374151', marginBottom: '4px' }}>
                  {isDragging ? 'Lepaskan file di sini' : file ? file.name : 'Drag & drop atau klik untuk pilih file'}
                </div>
                {file && (
                  <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                    {(file.size / 1024 / 1024).toFixed(1)} MB
                  </div>
                )}
                {!file && (
                  <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
                    .xlsx atau .csv
                  </div>
                )}
              </div>
            )}

            {isBusy && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  {(['reading', 'parsing', 'inserting', 'computing'] as Stage[]).map(s => (
                    <div key={s} style={{
                      fontSize: '10px', fontWeight: '600',
                      color: stage === s ? '#0344D8' :
                             ['success'].includes(stage) ? '#22c55e' :
                             ['reading', 'parsing', 'inserting', 'computing'].indexOf(s) <
                             ['reading', 'parsing', 'inserting', 'computing'].indexOf(stage) ? '#22c55e' : '#d1d5db',
                      letterSpacing: '0.04em',
                    }}>
                      {stageLabels[s].toUpperCase()}
                    </div>
                  ))}
                </div>

                <div style={{ height: '8px', backgroundColor: '#f3f4f6', borderRadius: '99px', overflow: 'hidden', marginBottom: '10px' }}>
                  <div style={{
                    height: '100%',
                    width: `${progress}%`,
                    backgroundColor: '#0344D8',
                    borderRadius: '99px',
                    transition: 'width 0.4s ease',
                  }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: '#6b7280' }}>{progressLabel}</span>
                  <span style={{ fontSize: '12px', fontWeight: '700', color: '#0344D8' }}>{progress}%</span>
                </div>
              </div>
            )}

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

            {stage === 'error' && (
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

        {stage === 'success' && summary && (
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
                <span style={{ fontSize: '20px', fontWeight: '800', color: '#111827' }}>
                  {summary.total_rows.toLocaleString('id')}
                </span>
              </div>
            </div>

            {summary.warnings && summary.warnings.length > 0 && (
              <div style={{
                padding: '14px', backgroundColor: '#fffbeb',
                border: '1px solid #fde68a', borderRadius: '8px',
              }}>
                <div style={{ fontSize: '12px', color: '#854d0e', fontWeight: '600', marginBottom: '8px' }}>⚠️ Peringatan</div>
                {summary.warnings.slice(0, 5).map((w, i) => (
                  <div key={i} style={{ fontSize: '12px', color: '#854d0e', marginBottom: '4px' }}>• {w}</div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => router.push('/analytics')} style={{
                flex: 1, padding: '12px', borderRadius: '8px', border: 'none',
                backgroundColor: '#0344D8', color: '#fff',
                fontSize: '13px', fontWeight: '700', cursor: 'pointer',
              }}>
                Lihat Morning Brief
              </button>
              <button onClick={resetForm} style={{
                flex: 1, padding: '12px', borderRadius: '8px',
                border: '1px solid #e5e7eb', backgroundColor: '#fff',
                color: '#374151', fontSize: '13px', cursor: 'pointer',
              }}>
                Upload Lagi
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
