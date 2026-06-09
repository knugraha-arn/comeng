import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

export const config = { api: { bodyParser: true } }

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { date } = req.body as { date?: string }
  if (!date) return res.status(400).json({ error: 'date wajib diisi (YYYY-MM-DD)' })

  try {
    const { data, error } = await supabase.rpc('compute_agent_metrics', {
      p_date: date,
    })

    if (error) throw new Error(error.message)

    return res.status(200).json({
      success: true,
      summary: {
        date,
        agents_computed: data?.agents ?? 0,
        mitra_computed:  data?.mitras ?? 0,
        pic_computed:    data?.pics ?? 0,
        buckets:         data?.buckets ?? {},
      },
    })

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[analytics/compute-metrics]', message)
    return res.status(500).json({ error: 'Compute metrics gagal', details: message })
  }
}
