import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import {
  parseMasterAgen,
  parseNobu,
  parseEsa,
  calcRefnumMatchRate,
} from '../../../lib/analytics/parser'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size))
  return chunks
}

async function downloadFromStorage(path: string): Promise<Buffer> {
  const { data, error } = await supabase.storage
    .from('amaris-uploads')
    .download(path)
  if (error || !data) throw new Error(`Download gagal (${path}): ${error?.message}`)
  const arrayBuffer = await data.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

async function deleteFromStorage(paths: string[]): Promise<void> {
  await supabase.storage.from('amaris-uploads').remove(paths)
}

async function upsertMaster(rows: ReturnType<typeof parseMasterAgen>['rows']): Promise<void> {
  for (const batch of chunk(rows, 500)) {
    const { error } = await supabase
      .from('am_agent_master')
      .upsert(batch, { onConflict: 'terminal_id,serial_number' })
    if (error) throw new Error(`Master upsert failed: ${error.message}`)
  }
}

async function upsertNobu(
  rows: ReturnType<typeof parseNobu>['rows'],
  sessionId: string
): Promise<void> {
  const mapped = rows.map(r => ({ ...r, upload_session_id: sessionId }))
  for (const batch of chunk(mapped, 500)) {
    const { error } = await supabase
      .from('am_transactions_nobu')
      .upsert(batch, { onConflict: 'reference_number,transaction_date' })
    if (error) throw new Error(`NOBU upsert failed: ${error.message}`)
  }
}

async function upsertEsa(
  rows: ReturnType<typeof parseEsa>['rows'],
  sessionId: string
): Promise<void> {
  const mapped = rows.map(r => ({ ...r, upload_session_id: sessionId }))
  for (const batch of chunk(mapped, 500)) {
    const { error } = await supabase
      .from('am_transactions_esa')
      .upsert(batch, { onConflict: 'refnum,transaction_date' })
    if (error) throw new Error(`ESA upsert failed: ${error.message}`)
  }
}

async function triggerComputeMetrics(dates: string[], token: string): Promise<void> {
  const baseUrl = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? ''
  if (!baseUrl) return
  for (const date of dates) {
    fetch(`${baseUrl}/api/analytics/compute-metrics`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ date }),
    }).catch(() => {})
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const token = (req.headers.authorization ?? '').replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ error: 'Unauthorized' })

  const { data: userData, error: roleError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  console.log('[upload] user:', user.id, 'role:', userData?.role, 'error:', roleError?.message)
  if (!['admin', 'super_admin'].includes(userData?.role ?? '')) {
    return res.status(403).json({ error: 'Hanya admin yang dapat upload data', debug: { userId: user.id, role: userData?.role, roleError: roleError?.message } })
  }

  const { masterPath, nobuPath, esaPath } = req.body as {
    masterPath?: string
    nobuPath?: string
    esaPath?: string
  }

  if (!masterPath || !nobuPath || !esaPath) {
    return res.status(400).json({ error: 'masterPath, nobuPath, esaPath wajib diisi' })
  }

  const allErrors: string[] = []

  try {
    // 1. Download dari Storage
    const [masterBuffer, nobuBuffer, esaBuffer] = await Promise.all([
      downloadFromStorage(masterPath),
      downloadFromStorage(nobuPath),
      downloadFromStorage(esaPath),
    ])

    // 2. Parse
    const { rows: masterRows, errors: masterErrors } = parseMasterAgen(masterBuffer)
    const { rows: nobuRows, dates: nobuDates, errors: nobuErrors } = parseNobu(nobuBuffer)
    const { rows: esaRows, errors: esaErrors } = parseEsa(esaBuffer)

    console.log('[upload] parse results:', {
      masterRows: masterRows.length, masterErrors,
      nobuRows: nobuRows.length, nobuDates, nobuErrors,
      esaRows: esaRows.length, esaErrors,
      bufferSizes: { master: masterBuffer.length, nobu: nobuBuffer.length, esa: esaBuffer.length },
    })

    allErrors.push(...masterErrors, ...nobuErrors, ...esaErrors)

    if (masterRows.length === 0 || nobuRows.length === 0 || esaRows.length === 0) {
      await deleteFromStorage([masterPath, nobuPath, esaPath])
      return res.status(400).json({
        error: 'Parsing gagal — satu atau lebih file tidak menghasilkan data valid',
        details: allErrors,
        debug: {
          masterRows: masterRows.length,
          nobuRows: nobuRows.length,
          esaRows: esaRows.length,
          bufferSizes: { master: masterBuffer.length, nobu: nobuBuffer.length, esa: esaBuffer.length },
        }
      })
    }

    // 3. Match rate
    const matchRates: Record<string, number> = {}
    for (const date of nobuDates) {
      matchRates[date] = calcRefnumMatchRate(nobuRows, esaRows, date)
    }
    const avgMatchRate = nobuDates.length > 0
      ? nobuDates.reduce((s, d) => s + matchRates[d], 0) / nobuDates.length
      : 0

    // 4. Upload sessions
    const sessionIds: Record<string, string> = {}
    for (const date of nobuDates) {
      const { data: session, error: sessionError } = await supabase
        .from('am_upload_sessions')
        .upsert({
          upload_date:       date,
          uploaded_by:       user.id,
          status:            'processing',
          nobu_row_count:    nobuRows.filter(r => r.transaction_date === date).length,
          esa_row_count:     esaRows.filter(r => r.transaction_date === date).length,
          master_row_count:  masterRows.length,
          refnum_match_rate: matchRates[date],
        }, { onConflict: 'upload_date' })
        .select('id')
        .single()

      if (sessionError || !session) {
        throw new Error(`Gagal membuat session untuk ${date}: ${sessionError?.message}`)
      }
      sessionIds[date] = session.id
    }

    // 5. Upsert Master
    await upsertMaster(masterRows)

    // 6. Upsert NOBU & ESA per tanggal
    for (const date of nobuDates) {
      await upsertNobu(nobuRows.filter(r => r.transaction_date === date), sessionIds[date])
      const esaForDate = esaRows.filter(r => r.transaction_date === date)
      if (esaForDate.length > 0) await upsertEsa(esaForDate, sessionIds[date])
    }

    // 7. Update session status
    for (const date of nobuDates) {
      await supabase
        .from('am_upload_sessions')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', sessionIds[date])
    }

    // 8. Purge > 14 hari
    await supabase.rpc('am_purge_old_data')

    // 9. Trigger compute metrics
    triggerComputeMetrics(nobuDates, token)

    // 10. Hapus file dari storage
    await deleteFromStorage([masterPath, nobuPath, esaPath])

    return res.status(200).json({
      success: true,
      summary: {
        dates_processed: nobuDates,
        master_rows:     masterRows.length,
        nobu_rows:       nobuRows.length,
        esa_rows:        esaRows.length,
        match_rates:     matchRates,
        avg_match_rate:  Math.round(avgMatchRate * 100) / 100,
        warnings:        allErrors.length > 0 ? allErrors : undefined,
      },
    })

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[analytics/upload]', message)
    deleteFromStorage([masterPath, nobuPath, esaPath]).catch(() => {})
    return res.status(500).json({ error: 'Upload gagal', details: message })
  }
}
