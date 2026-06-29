import type { NextApiRequest, NextApiResponse } from 'next'
import { createServerClient } from '@supabase/ssr'

// Fire-and-forget — tidak perlu response detail, cukup 200 OK
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { cookies: { getAll: () => Object.entries(req.cookies).map(([n, v]) => ({ name: n, value: v ?? '' })), setAll: () => {} } }
    )

    const { data: { user } } = await supabase.auth.getUser(
      req.cookies['sb-access-token'] ?? req.headers.authorization?.replace('Bearer ', '') ?? ''
    )

    const { event_type, page, metadata, duration_sec } = req.body
    if (!event_type) return res.status(400).json({ error: 'event_type required' })

    // Gunakan service role untuk bypass RLS insert
    await supabase.from('am_usage_events').insert({
      user_id:      user?.id ?? null,
      email:        user?.email ?? null,
      event_type,
      page:         page ?? null,
      metadata:     metadata ?? null,
      duration_sec: duration_sec ?? null,
    })

    return res.status(200).json({ ok: true })
  } catch {
    // Gagal silent — jangan block user experience
    return res.status(200).json({ ok: false })
  }
}
