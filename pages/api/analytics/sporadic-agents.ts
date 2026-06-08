import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { bucket, mitra, page = '0' } = req.query
  const pageNum = parseInt(page as string) || 0
  const pageSize = 50

  try {
    // Ambil tanggal terbaru
    const { data: latest } = await supabase
      .from('am_transactions')
      .select('transaction_date')
      .order('transaction_date', { ascending: false })
      .limit(1)
      .single()

    if (!latest) return res.status(200).json({ agents: [], total: 0, lastDate: null })

    const maxDate = latest.transaction_date
    const sinceDate = new Date(maxDate)
    sinceDate.setDate(sinceDate.getDate() - 13)
    const sinceStr = sinceDate.toISOString().split('T')[0]

    // Aggregate via Postgres RPC (raw SQL)
    const { data, error } = await supabase.rpc('get_sporadic_agents', {
      p_since:  sinceStr,
      p_until:  maxDate,
      p_bucket: bucket === 'potential' ? 'potential' : bucket === 'at_risk' ? 'at_risk' : null,
      p_mitra:  mitra || null,
      p_limit:  pageSize,
      p_offset: pageNum * pageSize,
    })

    if (error) throw new Error(error.message)

    const { data: countData, error: countError } = await supabase.rpc('get_sporadic_agents_count', {
      p_since:  sinceStr,
      p_until:  maxDate,
      p_bucket: bucket === 'potential' ? 'potential' : bucket === 'at_risk' ? 'at_risk' : null,
      p_mitra:  mitra || null,
    })

    if (countError) throw new Error(countError.message)

    return res.status(200).json({
      agents:   data ?? [],
      total:    countData ?? 0,
      lastDate: maxDate,
      since:    sinceStr,
    })

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[sporadic-agents]', message)
    return res.status(500).json({ error: message })
  }
}
