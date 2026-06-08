import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { parseTransactions } from '../../../lib/analytics/parser'

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
  return Buffer.from(await data.arrayBuffer())
}

async function deleteFromStorage(paths: string[]): Promise<void> {
  await supabase.storage.from('amaris-uploads').remove(paths)
}

function triggerComputeMetrics(dates: string[], token: string): void {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  if (!baseUrl) return
  for (const date of dates) {
    fetch(`${baseUrl}/api/analytics/compute-metrics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ date }),
    }).catch(() => {})
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Auth
  const token = (req.headers.authorization ?? '').replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ error: 'Unauthorized' })

  const { data: userData } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (!['admin', 'super_admin'].includes(userData?.role ?? '')) {
    return res.status(403).json({ error: 'Hanya admin yang dapat upload data' })
  }

  const { filePath } = req.body as { filePath?: string }
  if (!filePath) return res.status(400).json({ error: 'filePath wajib diisi' })

  try {
    // ── 1. Download dari Storage ───────────────────────────────────────────
    const buffer = await downloadFromStorage(filePath)

    // ── 2. Parse ──────────────────────────────────────────────────────────
    const { rows, dates, errors } = parseTransactions(buffer)

    console.log('[upload] parse result:', {
      rows: rows.length, dates, errors: errors.slice(0, 5)
    })

    if (rows.length === 0) {
      await deleteFromStorage([filePath])
      return res.status(400).json({
        error: 'Parsing gagal — file tidak menghasilkan data valid',
        details: errors,
      })
    }

    // ── 3. Upsert upload sessions per tanggal ─────────────────────────────
    const sessionIds: Record<string, string> = {}
    for (const date of dates) {
      const rowCount = rows.filter(r => r.transaction_date === date).length
      const { data: session, error: sessionError } = await supabase
        .from('am_upload_sessions')
        .upsert({
          upload_date:  date,
          uploaded_by:  user.id,
          status:       'processing',
          row_count:    rowCount,
        }, { onConflict: 'upload_date' })
        .select('id')
        .single()

      if (sessionError || !session) {
        throw new Error(`Gagal membuat session untuk ${date}: ${sessionError?.message}`)
      }
      sessionIds[date] = session.id
    }

    // ── 4. Upsert transaksi per tanggal ───────────────────────────────────
    for (const date of dates) {
      const dateRows = rows
        .filter(r => r.transaction_date === date)
        .map(r => ({ ...r, upload_session_id: sessionIds[date] }))

      for (const batch of chunk(dateRows, 500)) {
        const { error } = await supabase
          .from('am_transactions')
          .upsert(batch, { onConflict: 'refnum,transaction_date' })
        if (error) throw new Error(`Transactions upsert failed: ${error.message}`)
      }
    }

    // ── 5. Update session status → completed ──────────────────────────────
    for (const date of dates) {
      await supabase
        .from('am_upload_sessions')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', sessionIds[date])
    }

    // ── 6. Purge data > 14 hari ───────────────────────────────────────────
    await supabase.rpc('am_purge_old_data')

    // ── 7. Trigger compute metrics (background) ───────────────────────────
    triggerComputeMetrics(dates, token)

    // ── 8. Cleanup storage ────────────────────────────────────────────────
    await deleteFromStorage([filePath])

    return res.status(200).json({
      success: true,
      summary: {
        dates_processed: dates,
        total_rows:      rows.length,
        warnings:        errors.length > 0 ? errors : undefined,
      },
    })

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[analytics/upload]', message)
    deleteFromStorage([filePath]).catch(() => {})
    return res.status(500).json({ error: 'Upload gagal', details: message })
  }
}
