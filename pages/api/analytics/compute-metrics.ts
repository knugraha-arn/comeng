import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    // Jalankan compute
    const { error: computeError } = await supabase.rpc('compute_agent_metrics')
    if (computeError) throw new Error(computeError.message)

    // Ambil window aktual dari data
    const { data: windowData, error: windowError } = await supabase
      .from('am_transactions')
      .select('transaction_date')
      .order('transaction_date', { ascending: false })
      .limit(1)
      .single()

    if (windowError || !windowData) throw new Error('Gagal membaca tanggal data')

    const latest = new Date(windowData.transaction_date)
    const earliest = new Date(latest)
    earliest.setDate(earliest.getDate() - 13)

    return res.status(200).json({
      success: true,
      window: {
        from: earliest.toISOString().split('T')[0],
        to: latest.toISOString().split('T')[0],
      }
    })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Gagal menghitung metrics' })
  }
}
