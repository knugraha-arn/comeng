import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // GET — ambil target bulan tertentu atau terbaru
  if (req.method === 'GET') {
    const { year, month } = req.query

    let query = supabase
      .from('am_targets')
      .select('*')
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false })
      .limit(1)

    if (year && month) {
      query = supabase
        .from('am_targets')
        .select('*')
        .eq('period_year', Number(year))
        .eq('period_month', Number(month))
        .single()
    }

    const { data, error } = await query
    if (error && error.code !== 'PGRST116') {
      return res.status(500).json({ error: error.message })
    }
    return res.status(200).json({ data: Array.isArray(data) ? data[0] : data })
  }

  // POST — simpan target
  if (req.method === 'POST') {
    const token = (req.headers.authorization ?? '').replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return res.status(401).json({ error: 'Unauthorized' })

    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!['admin', 'super_admin'].includes(userData?.role ?? '')) {
      return res.status(403).json({ error: 'Hanya admin yang dapat mengubah target' })
    }

    const body = req.body
    const { error } = await supabase
      .from('am_targets')
      .upsert({
        ...body,
        created_by: user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'period_year,period_month' })

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ success: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
