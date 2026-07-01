import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' })

  const token = (req.headers.authorization ?? '').replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ error: 'Unauthorized' })

  const { data: userData } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (!['admin', 'ceo'].includes(userData?.role ?? '')) {
    return res.status(403).json({ error: 'Hanya admin yang dapat menghapus data' })
  }

  const { upload_date } = req.body as { upload_date?: string }
  if (!upload_date) return res.status(400).json({ error: 'upload_date wajib diisi' })

  try {
    // Hapus semua data untuk tanggal ini
    await supabase.from('am_insights').delete().eq('insight_date', upload_date)
    await supabase.from('am_agent_daily_metrics').delete().eq('metric_date', upload_date)
    await supabase.from('am_mitra_daily_metrics').delete().eq('metric_date', upload_date)
    await supabase.from('am_pic_daily_metrics').delete().eq('metric_date', upload_date)
    await supabase.from('am_morning_brief').delete().eq('brief_date', upload_date)
    await supabase.from('am_transactions').delete().eq('transaction_date', upload_date)
    await supabase.from('am_upload_sessions').delete().eq('upload_date', upload_date)

    return res.status(200).json({ success: true, deleted_date: upload_date })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[analytics/delete-session]', message)
    return res.status(500).json({ error: 'Hapus gagal', details: message })
  }
}
