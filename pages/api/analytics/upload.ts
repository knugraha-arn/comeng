import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import formidable, { File } from 'formidable'
import fs from 'fs'
import {
  parseMasterAgen,
  parseNobu,
  parseEsa,
  calcRefnumMatchRate,
  type MasterAgenRow,
  type NobuRow,
  type EsaRow,
} from '../../../lib/analytics/parser'

export const config = {
  api: { bodyParser: false },
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readFileBuffer(file: File): Buffer {
  return fs.readFileSync(file.filepath)
}

// Chunk array untuk batch upsert (Supabase max ~1000 rows per request)
function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

// ─── Upsert Functions ─────────────────────────────────────────────────────────

async function upsertMaster(rows: MasterAgenRow[]): Promise<void> {
  const batches = chunk(rows, 500)
  for (const batch of batches) {
    const { error } = await supabase
      .from('am_agent_master')
      .upsert(batch, { onConflict: 'terminal_id,serial_number' })
    if (error) throw new Error(`Master upsert failed: ${error.message}`)
  }
}

async function upsertNobu(rows: NobuRow[], sessionId: string): Promise<void> {
  const mapped = rows.map(r => ({ ...r, upload_session_id: sessionId }))
  const batches = chunk(mapped, 500)
  for (const batch of batches) {
    const { error } = await supabase
      .from('am_transactions_nobu')
      .upsert(batch, { onConflict: 'reference_number,transaction_date' })
    if (error) throw new Error(`NOBU upsert failed: ${error.message}`)
  }
}

async function upsertEsa(rows: EsaRow[], sessionId: string): Promise<void> {
  const mapped = rows.map(r => ({ ...r, upload_session_id: sessionId }))
  const batches = chunk(mapped, 500)
  for (const batch of batches) {
    const { error } = await supabase
      .from('am_transactions_esa')
      .upsert(batch, { onConflict: 'refnum,transaction_date' })
    if (error) throw new Error(`ESA upsert failed: ${error.message}`)
  }
}

async function purgeOldData(): Promise<void> {
  const { error } = await supabase.rpc('am_purge_old_data')
  if (error) throw new Error(`Purge failed: ${error.message}`)
}

async function triggerComputeMetrics(dates: string[]): Promise<void> {
  // Fire and forget — compute metrics di background
  // Dipanggil setelah semua data tersimpan
  const baseUrl = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL
  if (!baseUrl) return

  for (const date of dates) {
    fetch(`${baseUrl}/api/analytics/compute-metrics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date }),
    }).catch(() => {
      // silent fail — metrics akan dihitung saat user buka dashboard
    })
  }
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Auth check — hanya SUPER_ADMIN
  const authHeader = req.headers.authorization
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' })

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ error: 'Unauthorized' })

  // Check role SUPER_ADMIN
  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (userData?.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Hanya SUPER_ADMIN yang dapat upload data' })
  }

  // Parse multipart form
  const form = formidable({ maxFileSize: 50 * 1024 * 1024 }) // max 50MB per file
  const [, files] = await form.parse(req)

  const masterFile = Array.isArray(files.master) ? files.master[0] : files.master
  const nobuFile = Array.isArray(files.nobu) ? files.nobu[0] : files.nobu
  const esaFile = Array.isArray(files.esa) ? files.esa[0] : files.esa

  if (!masterFile || !nobuFile || !esaFile) {
    return res.status(400).json({
      error: 'Ketiga file wajib diupload: master, nobu, esa'
    })
  }

  const allErrors: string[] = []

  try {
    // ── 1. Parse semua file ──────────────────────────────────────────────────
    const masterBuffer = readFileBuffer(masterFile)
    const nobuBuffer = readFileBuffer(nobuFile)
    const esaBuffer = readFileBuffer(esaFile)

    const { rows: masterRows, errors: masterErrors } = parseMasterAgen(masterBuffer)
    const { rows: nobuRows, dates: nobuDates, errors: nobuErrors } = parseNobu(nobuBuffer)
    const { rows: esaRows, errors: esaErrors } = parseEsa(esaBuffer)

    allErrors.push(...masterErrors, ...nobuErrors, ...esaErrors)

    // Hentikan jika ada error kritikal (data kosong)
    if (masterRows.length === 0 || nobuRows.length === 0 || esaRows.length === 0) {
      return res.status(400).json({
        error: 'Parsing gagal — satu atau lebih file tidak menghasilkan data valid',
        details: allErrors,
      })
    }

    // ── 2. Hitung match rate per tanggal ─────────────────────────────────────
    const matchRates: Record<string, number> = {}
    for (const date of nobuDates) {
      matchRates[date] = calcRefnumMatchRate(nobuRows, esaRows, date)
    }

    // Match rate keseluruhan (rata-rata semua tanggal)
    const avgMatchRate = nobuDates.length > 0
      ? nobuDates.reduce((sum, d) => sum + matchRates[d], 0) / nobuDates.length
      : 0

    // ── 3. Upsert upload sessions per tanggal ────────────────────────────────
    const sessionIds: Record<string, string> = {}

    for (const date of nobuDates) {
      const nobuCount = nobuRows.filter(r => r.transaction_date === date).length
      const esaCount = esaRows.filter(r => r.transaction_date === date).length

      const { data: session, error: sessionError } = await supabase
        .from('am_upload_sessions')
        .upsert({
          upload_date: date,
          uploaded_by: user.id,
          status: 'processing',
          nobu_row_count: nobuCount,
          esa_row_count: esaCount,
          master_row_count: masterRows.length,
          refnum_match_rate: matchRates[date],
        }, { onConflict: 'upload_date' })
        .select('id')
        .single()

      if (sessionError || !session) {
        throw new Error(`Gagal membuat upload session untuk ${date}: ${sessionError?.message}`)
      }

      sessionIds[date] = session.id
    }

    // ── 4. Upsert Master Agen ────────────────────────────────────────────────
    await upsertMaster(masterRows)

    // ── 5. Upsert NOBU per tanggal ───────────────────────────────────────────
    for (const date of nobuDates) {
      const dateRows = nobuRows.filter(r => r.transaction_date === date)
      await upsertNobu(dateRows, sessionIds[date])
    }

    // ── 6. Upsert ESA per tanggal ────────────────────────────────────────────
    for (const date of nobuDates) {
      const dateRows = esaRows.filter(r => r.transaction_date === date)
      if (dateRows.length > 0) {
        await upsertEsa(dateRows, sessionIds[date])
      }
    }

    // ── 7. Update session status → completed ─────────────────────────────────
    for (const date of nobuDates) {
      await supabase
        .from('am_upload_sessions')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', sessionIds[date])
    }

    // ── 8. Purge data > 14 hari ──────────────────────────────────────────────
    await purgeOldData()

    // ── 9. Trigger compute metrics (background) ──────────────────────────────
    await triggerComputeMetrics(nobuDates)

    // ── 10. Response ─────────────────────────────────────────────────────────
    return res.status(200).json({
      success: true,
      summary: {
        dates_processed: nobuDates,
        master_rows: masterRows.length,
        nobu_rows: nobuRows.length,
        esa_rows: esaRows.length,
        match_rates: matchRates,
        avg_match_rate: Math.round(avgMatchRate * 100) / 100,
        warnings: allErrors.length > 0 ? allErrors : undefined,
      },
    })

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[analytics/upload]', message)

    return res.status(500).json({
      error: 'Upload gagal',
      details: message,
    })
  }
}
